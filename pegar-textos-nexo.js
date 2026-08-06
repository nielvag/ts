const puppeteer = require("puppeteer");
const XLSX = require("xlsx");
const fs = require("fs");

const links = [
  "https://www.nexojornal.com.br/colunistas/2024/12/05/brain-rot-uso-de-telas-livro",
  "https://www.nexojornal.com.br/colunistas/2024/10/24/o-que-celebrar-na-semana-mundial-de-educacao-midiatica",
  "https://www.nexojornal.com.br/colunistas/2024/09/12/educacao-midiatica-para-informar-inspirar-e-empoderar",
  "https://www.nexojornal.com.br/colunistas/2024/08/01/para-lidar-com-grandes-problemas-as-pequenas-acoes",
  "https://www.nexojornal.com.br/colunistas/2024/03/14/o-avesso-do-avesso-do-avesso-a-censura-aos-livros-no-brasil",
  "https://www.nexojornal.com.br/colunistas/2024/02/29/o-perigo-de-ver-tudo-enquadrado-ou-em-quadrados",
  "https://www.nexojornal.com.br/colunistas/2024/02/15/todos-juntos-por-uma-internet-mais-positiva-e-segura",
  "https://www.nexojornal.com.br/colunistas/2024/02/01/como-a-desinformacao-acelera-o-relogio-do-juizo-final",
  "https://www.nexojornal.com.br/colunistas/2024/01/18/como-lidar-com-desinformacao-risco-global",
  "https://www.nexojornal.com.br/colunistas/2023/12/21/somos-seres-que-leem-escrevem-e-contam-historias",
  "https://www.nexojornal.com.br/colunistas/2023/12/07/o-senhor-aparecido-e-o-que-ele-tem-a-ver-conosco",
  "https://www.nexojornal.com.br/colunistas/2023/11/23/o-que-torna-a-educacao-midiatica-tao-urgente",
  "https://www.nexojornal.com.br/colunistas/2023/11/09/educacao-e-presenca-conexoes-reais-entre-pais-filhos-e-escola",
  "https://www.nexojornal.com.br/colunistas/2023/09/28/como-a-educacao-midiatica-pode-apoiar-a-saude-mental",
  "https://www.nexojornal.com.br/colunistas/2023/09/14/tecnologias-digitais-na-escola-regular-e-melhor-que-proibir",
  "https://www.nexojornal.com.br/colunistas/2023/06/22/interesse-por-noticias-cai-mas-afinal-para-que-elas-servem",
  "https://www.nexojornal.com.br/colunistas/2023/06/08/por-que-precisamos-reaprender-a-perguntar",
  "https://www.nexojornal.com.br/colunistas/2023/05/25/educacao-midiatica-limites-e-possibilidades",
  "https://www.nexojornal.com.br/colunistas/2023/05/11/a-expressao-e-a-criacao-das-criancas-e-jovens-no-universo-digital",
  "https://www.nexojornal.com.br/colunistas/2023/04/13/o-que-fazer-para-combater-o-discurso-de-odio-online",
  "https://www.nexojornal.com.br/colunistas/2023/03/16/liberdade-de-expressao-censura-e-lugar-de-fala",
  "https://www.nexojornal.com.br/colunistas/2023/02/16/estamos-enredados-como-tornar-as-redes-mais-seguras",
  "https://www.nexojornal.com.br/colunistas/2023/02/02/uma-imagem-e-sempre-muito-mais-do-que-uma-imagem",
  "https://www.nexojornal.com.br/colunistas/2023/01/19/tirem-as-criancas-da-sala-como-vamos-explicar-o-que-ocorreu",
  "https://www.nexojornal.com.br/colunistas/2022/12/22/mensagem-de-final-de-ano-aos-jovens-desinformados",
  "https://www.nexojornal.com.br/colunistas/2022/11/10/o-que-aprender-e-ensinar-sobre-teorias-da-conspiracao",
  "https://www.nexojornal.com.br/colunistas/2022/10/27/por-que-e-preciso-reaprender-a-confiar-nas-instituicoes",
  "https://www.nexojornal.com.br/colunistas/2022/10/13/informacao-e-dialogo-o-que-precisamos-para-esta-eleicao",
  "https://www.nexojornal.com.br/colunistas/2022/09/15/educacao-para-as-midias-em-tempos-de-eleicao",
  "https://www.nexojornal.com.br/colunistas/2022/08/18/meninos-eu-vi-como-funcionam-as-urnas-eletronicas",
  "https://www.nexojornal.com.br/colunistas/2022/06/09/as-criancas-e-as-redes-por-que-o-que-elas-pensam-importa",
  "https://www.nexojornal.com.br/colunistas/2022/04/28/escola-lugar-de-fala-dialogo-e-discussao-sobre-temas-dificeis",
  "https://www.nexojornal.com.br/colunistas/2022/04/14/desinformacao-numerica-ate-os-numeros-podem-mentir",
  "https://www.nexojornal.com.br/colunistas/2022/03/03/as-guerras-sao-construidas-por-meio-de-narrativas",
  "https://www.nexojornal.com.br/colunistas/2022/02/17/os-nativos-digitais-sao-alvos-faceis-para-as-fake-news",
  "https://www.nexojornal.com.br/colunistas/2022/01/20/por-que-e-importante-educar-para-as-redes-sociais",
  "https://www.nexojornal.com.br/colunistas/2022/01/06/para-ver-com-olhos-livres-e-preciso-olhar-focar-e-reparar",
  "https://www.nexojornal.com.br/colunistas/2021/12/23/criancas-e-fake-news-quando-comecar-a-falar-sobre-mentiras",
  "https://www.nexojornal.com.br/colunistas/2021/11/11/todos-contra-a-desinformacao-voce-tambem-e-responsavel",
  "https://www.nexojornal.com.br/colunistas/2021/10/28/os-cordeis-e-as-noticias-a-rede-e-o-fio-que-nos-unem",
  "https://www.nexojornal.com.br/colunistas/2021/09/30/leitores-como-construtores-de-sentido",
  "https://www.nexojornal.com.br/colunistas/2021/09/16/sobre-fazer-escolhas-nas-redes-quem-esta-no-comando",
  "https://www.nexojornal.com.br/colunistas/2021/09/02/voce-vai-ver-o-que-voce-nao-vai-ver-olhar-para-conhecer",
  "https://www.nexojornal.com.br/colunistas/2021/08/19/por-que-as-narrativas-importam-no-contexto-em-que-vivemos",
  "https://www.nexojornal.com.br/colunistas/2021/08/05/ser-bem-formado-para-tornar-se-bem-informado",
];

function formatarDataPtBr(dataTexto) {
  const meses = {
    janeiro: "01",
    fevereiro: "02",
    março: "03",
    abril: "04",
    maio: "05",
    junho: "06",
    julho: "07",
    agosto: "08",
    setembro: "09",
    outubro: "10",
    novembro: "11",
    dezembro: "12",
  };

  const match = dataTexto
    ?.toLowerCase()
    .match(/(\d{2}) de ([a-zç]+) de (\d{4})/);

  if (!match) return "";

  return `${match[1]}/${meses[match[2]]}/${match[3]}`;
}

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const dados = [];

  for (const link of links) {
    console.log("Processando:", link);

    await page.goto(link, { waitUntil: "networkidle2" });
    await page.waitForSelector('section[data-testid="title-columnist"]');

    const item = await page.evaluate(() => {
      const section = document.querySelector(
        'section[data-testid="title-columnist"]'
      );

      const titulo = section
        ?.querySelector("div.flex.mt-5 p")
        ?.innerText.trim();
      const data = section?.querySelector("div.mt-5 span")?.innerText.trim();
      const chamada = document
        .querySelector("div.columnist-thin-line-article")
        ?.innerText.trim();

      const corpo = document.querySelector("div.columnist-body-article");
      let texto = "";

      if (corpo) {
        corpo.querySelectorAll(":scope > p").forEach((p) => {
          const t = p.innerText.trim();
          if (t) texto += t + "\n\n";
        });
      }

      return { titulo, data, chamada, texto: texto.trim() };
    });

    dados.push({
      data: formatarDataPtBr(item.data),
      titulo: item.titulo,
      chamada: item.chamada,
      texto: item.texto,
      link,
    });
  }

  await browser.close();

  // 🔹 CRIA PLANILHA
  const worksheet = XLSX.utils.json_to_sheet(dados);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Colunas Nexo");

  XLSX.writeFile(workbook, "nexo_colunistas.xlsx");

  console.log("✅ Planilha criada: nexo_colunistas.xlsx");
})();
