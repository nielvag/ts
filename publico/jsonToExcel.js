const fs = require("fs");
const XLSX = require("xlsx");

// Nome dos ficheiros
const INPUT_FILE = "progresso.json";
const OUTPUT_FILE = "relatorio_postagens.xlsx";

function converterJsonParaExcel() {
  try {
    // 1. Ler o ficheiro JSON
    const rawData = fs.readFileSync(INPUT_FILE, "utf8");
    const jsonData = JSON.parse(rawData);

    // 2. Processar e "achatar" (flatten) os dados
    const dadosFormatados = jsonData.map((item) => {
      let linha = {};

      for (let chave in item) {
        const valor = item[chave];

        // Verifica se o valor é um objeto e não é nulo (para as categorias de análise)
        if (
          typeof valor === "object" &&
          valor !== null &&
          !Array.isArray(valor)
        ) {
          for (let subChave in valor) {
            // Cria o nome da coluna como 'chave-subChave'
            linha[`${chave}-${subChave}`] = valor[subChave];
          }
        } else {
          // Mantém colunas simples (post, text, likes, etc)
          linha[chave] = valor;
        }
      }
      return linha;
    });

    // 3. Criar a folha de cálculo e o livro (Workbook)
    const worksheet = XLSX.utils.json_to_sheet(dadosFormatados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");

    // 4. Gravar o ficheiro
    XLSX.writeFile(workbook, OUTPUT_FILE);

    console.log(`Sucesso! Planilha criada: ${OUTPUT_FILE}`);
    console.log(`Total de linhas processadas: ${dadosFormatados.length}`);
  } catch (error) {
    console.error("Erro ao processar o ficheiro:", error.message);
  }
}

converterJsonParaExcel();
