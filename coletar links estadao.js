const axios = require("axios");
const XLSX = require("xlsx");
const fs = require("fs");

const BASE_URL =
  "https://www.estadao.com.br/pf/api/v3/content/fetch/story-feed-query";

const SIZE = 100; // 100 itens por página
let offset = 0;

// limites de data
const dateStart = new Date("2018-01-01T00:00:00Z");
const dateEnd = new Date("2024-12-31T23:59:59Z");

const resultados = [];

async function fetchPage(offset) {
  const url = `${BASE_URL}?query=%7B%22body%22%3A%22%7B%5C%22query%5C%22%3A%7B%5C%22bool%5C%22%3A%7B%5C%22must_not%5C%22%3A%5B%7B%5C%22regexp%5C%22%3A%7B%5C%22canonical_url%5C%22%3A%5C%22%2Fweb-stories%2F(.*)%5C%22%7D%7D,%7B%5C%22nested%5C%22%3A%7B%5C%22path%5C%22%3A%5C%22taxonomy.sections%5C%22,%5C%22query%5C%22%3A%7B%5C%22bool%5C%22%3A%7B%5C%22must%5C%22%3A%5B%7B%5C%22term%5C%22%3A%7B%5C%22taxonomy.sections._id%5C%22%3A%5C%22%2Ffora-de-ultimas%5C%22%7D%7D%5D%7D%7D%7D%7D%5D,%5C%22must%5C%22%3A%5B%7B%5C%22term%5C%22%3A%7B%5C%22type%5C%22%3A%5C%22story%5C%22%7D%7D,%7B%5C%22nested%5C%22%3A%7B%5C%22path%5C%22%3A%5C%22taxonomy.sections%5C%22,%5C%22query%5C%22%3A%7B%5C%22bool%5C%22%3A%7B%5C%22must%5C%22%3A%5B%7B%5C%22term%5C%22%3A%7B%5C%22taxonomy.sections._id%5C%22%3A%5C%22%2Fcarlos-alberto-di-franco%5C%22%7D%7D,%7B%5C%22term%5C%22%3A%7B%5C%22taxonomy.sections.parent_id%5C%22%3A%5C%22%2Fopiniao%2Fcolunas%5C%22%7D%7D%5D%7D%7D%7D%7D%5D%7D%7D%7D%22,%22headlineSearch%22%3A%22%22,%22included_fields%22%3A%22_id,type,subtype,created_date,display_date,first_publish_date,last_updated_date,publish_date,label.basic,headlines.basic,subheadlines.basic,description.basic,taxonomy.primary_section,taxonomy.sections,taxonomy.tags,owner,content_elements,promo_items.basic,credits,canonical_url%22,%22offset%22%3A${offset},%22params%22%3A%22%7B%5C%22cleanContentElements%5C%22%3Atrue,%5C%22cleanSection%5C%22%3Atrue%7D%22,%22sectionsToFilter%22%3A%5B%5D,%22size%22%3A${SIZE}%7D&d=2175&mxId=00000000&_website=estadao`;

  const response = await axios.get(url);
  return response.data;
}

async function run() {
  let keepGoing = true;

  while (keepGoing) {
    console.log(`Baixando página (offset ${offset})...`);

    const data = await fetchPage(offset);

    const items = data.content_elements || [];

    for (const item of items) {
      const date = new Date(item.first_publish_date);

      // se passou abaixo de 2018, paramos (API já vem ordenada)
      if (date < dateStart) {
        console.log("Chegou abaixo de 2018. Encerrando...");
        keepGoing = false;
        break;
      }

      // só salvar itens entre 2018 e 2024
      if (date >= dateStart && date <= dateEnd) {
        resultados.push({
          Titulo: item.headlines?.basic || "",
          URL: "https://www.estadao.com.br" + item.canonical_url,
          Data: item.first_publish_date,
        });
      }
    }

    offset += SIZE + 1;

    if (items.length < SIZE) {
      console.log("Página retornou menos itens. Finalizando.");
      break;
    }
  }

  console.log(`Total coletado: ${resultados.length} itens`);
  gerarExcel();
}

function gerarExcel() {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(resultados);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

  const filename = "estadao_links.xlsx";
  XLSX.writeFile(workbook, filename);

  console.log(`Arquivo Excel gerado: ${filename}`);
}

run();
