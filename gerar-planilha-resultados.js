const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const FONTE = "colunistas";
const source = "./jornalistas-influenciadores"; // pasta com os arquivos JSON
const outputFile = "./analise-resultados-influenciadores.xlsx";

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  const rows = [];

  for (const item of data) {
    const id = item.id;
    const resposta = item.resposta_json;

    if (!Array.isArray(resposta)) continue;

    for (const bloco of resposta) {
      // -------- ANALISE DE CONTEÚDO --------
      if (bloco.palavra !== undefined) {
        rows.push({
          id,
          tipo: "conteúdo",
          categoria: bloco.categoria || "",
          subcategoria: bloco.subcategoria || "",
          valores: bloco.valores || "",
          justificativa: bloco.justificativa || "",
          subcategoria_justificativa: bloco.subcategoria_justificativa || "",
          fonte: FONTE,
        });
      }

      // -------- ANALISE DE DISCURSO --------
      else if (Array.isArray(bloco.categorias)) {
        for (const cat of bloco.categorias) {
          rows.push({
            id,
            tipo: "discurso",
            categoria: cat.categoria || "",
            subcategoria: "",
            valores: "",
            justificativa: cat.justificativa || "",
            subcategoria_justificativa: "",
            fonte: FONTE,
          });
        }
      }
    }
  }

  return rows;
}

function readExistingData(file) {
  if (!fs.existsSync(file)) return [];

  const workbook = XLSX.readFile(file);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  return XLSX.utils.sheet_to_json(sheet);
}

function writeExcel(rows) {
  const existing = readExistingData(outputFile);

  const merged = [...existing, ...rows];

  const sheet = XLSX.utils.json_to_sheet(merged);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "resultados");

  XLSX.writeFile(workbook, outputFile);
}

function main() {
  const files = fs.readdirSync(source).filter((f) => f.endsWith(".json"));

  let allRows = [];

  for (const file of files) {
    const fullPath = path.join(source, file);

    console.log("Processando:", file);

    const rows = processFile(fullPath);

    allRows = allRows.concat(rows);
  }

  writeExcel(allRows);

  console.log("Planilha atualizada:", outputFile);
}

main();
