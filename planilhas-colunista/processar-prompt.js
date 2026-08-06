const xlsx = require("xlsx");
const path = require("path");

// Caminho do arquivo
const filePath = path.resolve(__dirname, "carlos-alberto-di-franco.xlsx");

// Lê o arquivo
const workbook = xlsx.readFile(filePath);

// Pega a primeira aba
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Converte para JSON
const rows = xlsx.utils.sheet_to_json(sheet, {
  defval: "", // evita undefined
});

// Mapeia apenas as colunas desejadas
const data = rows.map((row) => ({
  id: row.id,
  titulo: row.título,
  chamada: row.chamada,
  texto: row.texto,
}));

// Exibe resultado
console.log(data);
