const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

async function extrairTextoDaMateria(url, data) {
  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    const titulo = $(".content-head__title").text().trim();
    const subtitulo = $(".content-head__subtitle").text().trim();

    const paragrafos = [];
    $(
      "div.mc-column.content-text.active-extra-styles p.content-text__container"
    ).each((_, el) => {
      const texto = $(el).text().trim();
      if (texto) {
        paragrafos.push(texto);
      }
    });

    // Criar dados para a planilha
    const linha = {
      Título: titulo,
      Subtítulo: subtitulo,
      Conteúdo: paragrafos.join("\n\n"),
      URL: url,
      Data: data,
    };

    return linha;
  } catch (erro) {
    console.error("Erro ao processar:", erro.message);
  }
}

// Substitua pela URL real da matéria
// const url =
//   "https://oglobo.globo.com/blogs/miriam-leitao/post/2023/05/governo-quer-rever-pontos-positivos-e-ignora-defeitos-da-privatizacao-da-eletrobras.ghtml"; // insira a URL da matéria
// extrairTextoDaMateria(url);
async function main() {
  // Altere para o caminho do arquivo exportado
  const arquivoExcel = path.join(__dirname, "posts_filtrados_fernando.xlsx"); // ou .csv se for o caso

  // Lê o arquivo
  const workbook = XLSX.readFile(arquivoExcel);
  const primeiraAba = workbook.SheetNames[0];
  const planilha = workbook.Sheets[primeiraAba];

  // Converte para JSON
  const dados = XLSX.utils.sheet_to_json(planilha);

  // Extrai URLs da coluna 'url' ou 'URL'
  const items = dados
    .map((linha) => ({ url: linha.URL, data: linha.Data }))
    .filter(Boolean);

  const textos = [];
  let count = 0;
  for (const item of items) {
    const linha = await extrairTextoDaMateria(item.url, item.data);
    textos.push(linha);
    count++;
    console.log(count + " de " + items.length);
  }

  //   Criar uma nova planilha
  const workbookcreate = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(textos);

  XLSX.utils.book_append_sheet(workbookcreate, worksheet, "Materia");

  // Salvar em arquivo
  const nomeArquivo = "fernando-gabeira.xlsx";
  XLSX.writeFile(workbookcreate, nomeArquivo);
}

main();
