const fs = require("fs");
const path = require("path");

// Caminho do arquivo de entrada e saída
const inputFile = path.join(__dirname, "progresso.json");
const outputFile = path.join(__dirname, "progresso_com_id.json");

try {
  // 1. Lê o arquivo JSON
  const rawData = fs.readFileSync(inputFile, "utf8");
  const jsonData = JSON.parse(rawData);

  // 2. Garante que os dados são um array
  if (!Array.isArray(jsonData)) {
    throw500 = new Error("O JSON fornecido não é um array.");
  }

  // 3. Adiciona o ID sequencial em cada objeto
  const dataWithId = jsonData.map((item, index) => {
    return {
      id: index + 1, // Começa em 1 (ou use apenas 'index' se quiser começar em 0)
      ...item, // Mantém todas as propriedades originais do objeto
    };
  });

  // 4. Salva o novo array com IDs em um arquivo de saída
  fs.writeFileSync(outputFile, JSON.stringify(dataWithId, null, 2), "utf8");

  console.log(
    `Sucesso! ${dataWithId.length} itens atualizados e salvos em '${outputFile}'.`,
  );
} catch (error) {
  console.error("Erro ao processar o arquivo JSON:", error.message);
}
