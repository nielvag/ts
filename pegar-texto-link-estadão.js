const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");

// -------------------------------
// LISTA DE URLS QUE VOCÊ FORNECEU
// -------------------------------

const urls = [
  "https://www.estadao.com.br/opiniao/eugenio-bucci/agora-com-camera-corporal/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/ideologia-ideologia/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-entretenimento-como-religiao/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/gestos-fotogenicos/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/a-doenca-infantil-da-democracia/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/bibliotecas-secretas/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/sobre-a-ignorancia-artificial/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/comissao-parlamentar-de-intimidacao/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/um-vilao-de-james-bond-estreia-na-politica/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/um-rastro-de-tinta-seca/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/manchetes-adversativas/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/a-foto-sem-fato/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/riscos-sobrepostos/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-fator-humanista-das-emissoras-publicas/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/um-banco-laranja/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/censura-judicial-e-autocensura/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-entretenimento-engole-a-politica/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/quando-a-guerra-vira-entretenimento/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/arrogantes-principes-principiantes/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/quem-vai-dizer-obrigado-ao-jornal-nacional/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/pintando-o-7-de-setembro/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/a-profanacao-da-kombi/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-inteligentissimo-fim-do-mundo/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-algoritmo-loquaz/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-jornalismo-alem-da-objetividade/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/comunista-e-esquerdista/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/muito-mais-que-liberdade-de-expressao/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/mascara-mortuaria/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/por-um-ano-novo-de-verdade/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-final-e-o-depois/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/nao-voce-nao-viu-esse-filme-antes/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-cachorro-morto-que-late-e-morde/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/pop-lulismo/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/a-pauta-ainda-pauta/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/tchuthuca-ontologia-e-faniquito/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/ensino-pago-na-usp-na-unesp-e-na-unicamp/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/por-que-bolsonaro-ainda-pode-crescer/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/pantanal-e-pop-pantanal-e-agro-mas-nao-e-tudo/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/a-confusao-que-favorece-a-tirania/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/a-guerra-mundial-contra-os-fatos/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/sobre-a-extincao-da-imprensa/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/desesquecer/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/nao-ha-mais-como-abrir-os-olhos/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/tres-culpas/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/regular-as-big-techs/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/universidade-sitiada/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-odio-dos-covardes/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/tirar-mascara-de-crianca-ou-a-tirania-do-egoismo/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/bolsonarismo-vicia/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-dilema-esta-nas-ruas-e-nos-jornais/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/cartesianos-e-descabecados/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-golpe-em-gerundio/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/os-dez-mandamentos-do-desmando/",
  "https://www.estadao.com.br/opiniao/eugenio-bucci/o-preco-do-tal-mercado/",
];

// --------------------------------------------------------------
// FUNÇÃO QUE EXTRAI DATA, TÍTULO, CHAMADA E TEXTO DO ARTIGO
// --------------------------------------------------------------

async function scrapeArticle(url) {
  console.log("\nBaixando:", url);

  try {
    const { data: html } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = cheerio.load(html);

    // Data via Regex
    const match = html.match(/"first_publish_date"\s*:\s*"([^"]+)"/);
    const dataPublicacao = match ? match[1] : "Não encontrada";

    // Título e chamada
    const titulo = $("h1").first().text().trim() || "";
    const chamada = $("h2").first().text().trim() || "";

    // Parágrafos do texto
    const paragraphs = [];
    $('p[data-component-name="paragraph"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) paragraphs.push(text);
    });

    const textoCompleto = paragraphs.join("\n\n");

    return {
      Data: dataPublicacao,
      Titulo: titulo,
      Chamada: chamada,
      Texto: textoCompleto,
    };
  } catch (err) {
    console.error("Erro ao processar:", url, err.message);
    return null;
  }
}

// --------------------------------------------------------------
// PROCESSAR TODAS AS URLs E GERAR O EXCEL
// --------------------------------------------------------------

async function run() {
  const resultados = [];

  for (const url of urls) {
    const dados = await scrapeArticle(url);
    if (dados) resultados.push(dados);
  }

  console.log(`\nTotal processado: ${resultados.length} artigos`);

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(resultados);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Artigos");

  const filename = "artigos_estadao.xlsx";
  XLSX.writeFile(workbook, filename);

  console.log("Arquivo Excel gerado:", filename);
}

run();
