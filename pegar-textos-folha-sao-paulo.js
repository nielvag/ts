const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
const path = require("path");

const URLS = [
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2021/02/huck-e-a-imprensa-condescendente.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2021/01/ainda-a-hidroxicloroquina.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/11/as-direitas-se-movem.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/11/precisamos-falar-das-milicias.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/10/o-patrimonio-de-r-579-de-boulos.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/10/quem-vai-salvar-o-jornalismo.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/09/bolsonaro-mentiu-e-a-folha-amarelou.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/09/noticiario-e-propaganda.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/08/a-cultura-do-cancelamento.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/06/debochada-ou-homofobica.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/06/erro-do-new-york-times.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/03/fake-science-ou-fantasia-do-real.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/03/o-discurso-unico-na-economia.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2020/02/as-favas-com-a-verdade.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2019/11/fake-news-na-mira.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2019/09/uma-satisfacao-para-agatha.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2019/09/ombudsman-30-anos.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2019/09/explicando-o-tendencias-debates.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2019/08/males-do-jornalismo-declaratorio.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2019/06/o-leitor-e-antes-de-tudo-desconfiado.shtml",
  "https://www1.folha.uol.com.br/colunas/flavia-lima-ombudsman/2019/06/para-que-serve-o-ombudsman.shtml",
];

// "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ssZ"
function formatDateToISO(datetime) {
  if (!datetime) return "";
  return datetime.replace(" ", "T") + "Z";
}

async function scrapeAll() {
  const rows = [];

  for (const url of URLS) {
    try {
      console.log(`Processando: ${url}`);

      const { data: html } = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      const $ = cheerio.load(html);

      // DATA
      const datetimeRaw = $("time.c-more-options__published-date").attr(
        "datetime"
      );
      const dataISO = formatDateToISO(datetimeRaw);

      // TÍTULO
      const titulo = $("h1.c-content-head__title").text().trim();

      // CHAMADA
      const chamada = $("h2.c-content-head__subtitle").text().trim();

      // TEXTO
      const content = $(".c-news__content .c-news__body");
      content.find("img, video, noscript, figcaption").remove();

      const texto = content
        .text()
        .replace(/\s+\n/g, "\n")
        .replace(/\n\s+/g, "\n")
        .trim();

      rows.push({
        data: dataISO,
        titulo,
        chamada,
        texto,
        link: url,
      });
    } catch (error) {
      console.error(`Erro ao processar ${url}:`, error.message);
    }
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Artigos");

  const outputFile = path.resolve(
    __dirname,
    "folha_flavia_lima_ombudsman.xlsx"
  );
  XLSX.writeFile(workbook, outputFile);

  console.log("\nPlanilha gerada com sucesso:");
  console.log(outputFile);
}

scrapeAll();
