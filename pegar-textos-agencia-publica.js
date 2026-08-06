const axios = require("axios");
const cheerio = require("cheerio");
const XLSX = require("xlsx");

// Mapeamento dos meses PT → número
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

function converterParaISO(dataStr, horaStr) {
  const partes = dataStr.toLowerCase().split(" de ");
  const dia = partes[0].padStart(2, "0");
  const mes = meses[partes[1]];
  const ano = partes[2];
  return `${ano}-${mes}-${dia}T${horaStr}:00Z`;
}

async function scrape(url) {
  const response = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const $ = cheerio.load(response.data);

  // --- TÍTULO ---
  const title = $("header h1").first().text().trim();

  // --- CHAMADA ---
  const chamada = $("p.lead.fst-italic.text-center").first().text().trim();

  // --- DATA + HORA ---
  const dataBloco = $(".col-12.col-md-3.col-lg-2.text-md-end.fst-italic div");
  const dataStr = $(dataBloco[0]).text().trim();
  const horaStr = $(dataBloco[1]).text().trim();
  const dataISO = converterParaISO(dataStr, horaStr);

  // --- CONTEÚDO: SOMENTE <p> filhos diretos ---
  const paragraphs = [];
  $("#entry-content-wrap > p").each((i, el) => {
    const text = $(el).text().trim();
    if (text) paragraphs.push(text);
  });
  const fullText = paragraphs.join("\n\n");

  return { url, title, chamada, dataISO, fullText };
}

async function processarTodas(urls) {
  const resultados = [];

  for (const url of urls) {
    console.log("Coletando:", url);
    try {
      const artigo = await scrape(url);
      resultados.push({
        URL: artigo.url,
        Titulo: artigo.title,
        Chamada: artigo.chamada,
        Data: artigo.dataISO,
        Texto: artigo.fullText,
      });
    } catch (err) {
      console.log("Erro ao coletar:", url, err.message);
    }
  }

  // Criar planilha
  const worksheet = XLSX.utils.json_to_sheet(resultados);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Artigos");
  const filename = "artigos_apublica.xlsx";
  XLSX.writeFile(workbook, filename);

  console.log("\n✓ Planilha gerada:", filename);
}

// ------- LISTA DE URLs -------
const urls = [
  "https://apublica.org/2024/12/como-se-da-um-golpe-de-estado/",
  "https://apublica.org/2024/12/por-que-a-imprensa-nao-repercute-o-caso-samuel-klein/",
  "https://apublica.org/2024/11/iniciativa-ligada-a-sam-altman-escaneia-iris-nos-shoppings-de-sao-paulo/",
  "https://apublica.org/2024/09/o-fim-do-twitter-e-a-crise-de-abstinencia/",
  "https://apublica.org/2024/08/pablo-marcal-como-lidar-com-um-vigarista-digital/",
  "https://apublica.org/2024/08/crazy-cat-lady-a-misoginia-na-eleicao-americana/",
  "https://apublica.org/2024/08/a-trapaca-como-metodo/",
  "https://apublica.org/2024/07/a-inteligencia-artificial-tem-sede-e-esta-de-olho-no-brasil/",
  "https://apublica.org/2024/07/atentado-a-trump-e-deja-vu-para-brasileiros/",
  "https://apublica.org/2024/06/episodio-3-a-propaganda-e-uma-frente-de-guerra-e-eu-faco-parte-disso/",
  "https://apublica.org/2024/06/ucrania-uma-guerra-esquecida-episodio-1-uma-estranha-calmaria/",
  "https://apublica.org/2024/05/a-desinformacao-sobre-desastres-como-do-rio-grande-do-sul-veio-pra-ficar-mas-ha-como-combate-la/",
  "https://apublica.org/2024/05/no-g20-brasil-pauta-integridade-da-informacao-como-principio/",
  "https://apublica.org/2024/04/google-deve-mais-de-r-2-bi-por-ano-a-imprensa-segundo-pesquisadores-de-columbia/",
  "https://apublica.org/2024/04/ditadura-vira-pauta-da-extrema-direita-latinoamericana/",
  "https://apublica.org/2024/03/uma-noticia-sobre-gaza-que-nao-deve-ser-ignorada/",
  "https://apublica.org/2024/02/nao-era-facil-trabalhar-com-assange-mas-nunca-duvidei-que-era-jornalismo/",
  "https://apublica.org/2024/01/em-busca-do-apocalipse/",
  "https://apublica.org/2024/01/capitolio-nos-eua-e-8-de-janeiro-no-brasil-seguem-sendo-objeto-de-disputa/",
  "https://apublica.org/2024/01/quem-sao-os-herois-de-8-de-janeiro/",
  "https://apublica.org/2024/01/virilidade-e-impotencia/",
  "https://apublica.org/2023/12/2024-sera-o-ano-da-batalha-pela-inteligencia-artificial/",
  "https://apublica.org/2023/12/privatizacao-da-sabesp-e-ideologica/",
  "https://apublica.org/2023/11/spotify-ameaca-deixar-uruguai-para-nao-pagar-mais-a-artistas/",
  "https://apublica.org/2023/11/javier-milei-tambem-seguiu-o-manual-de-steve-bannon/",
  "https://apublica.org/2023/11/uma-glo-envergonhada/",
  "https://apublica.org/2023/10/o-dia-em-que-israel-criou-um-aplicativo-para-manipular-o-discurso-online/",
  "https://apublica.org/2023/08/militares-mandam-recado-anacronico-atraves-do-estadao/",
  "https://apublica.org/2023/08/como-esta-a-regulacao-das-plataformas-no-mundo/",
  "https://apublica.org/2023/07/por-um-jornalismo-humano/",
  "https://apublica.org/2023/07/a-valentia-dos-cientistas-e-o-silencio-da-imprensa-sobre-a-extradicao-de-assange/",
  "https://apublica.org/2023/07/democracidio/",
  "https://apublica.org/2023/10/na-guerra-a-principal-vitima-e-a-verdade/",
];

processarTodas(urls);
