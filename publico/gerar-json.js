const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

// ===== CONFIG =====
const POSTS_FILE = "./posts.xlsx";
const COMMENTS_FOLDER = "./planilhas-publico";
const OUTPUT_JSON = "./base-consolidada.json";

// ===== HELPERS =====

function normalizeId(id) {
  return String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ===== 1. CARREGA POSTS =====
function loadPosts() {
  const workbook = xlsx.readFile(path.resolve(__dirname, POSTS_FILE));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  const map = {};

  rows.forEach((row) => {
    const rawId = row.id;
    const normalizedId = normalizeId(rawId);

    map[normalizedId] = {
      post: rawId,
      text: row.text || row.Text || row.texto || "",
      assunto: row.assunto || row.Assunto || "",
      author: row.author || row.Author || "",
      comentarios: [],
    };
  });

  console.log(`🧠 Posts carregados: ${Object.keys(map).length}`);

  return map;
}

// ===== 2. CARREGA COMENTÁRIOS =====
function loadComments(postsMap) {
  const files = fs.readdirSync(COMMENTS_FOLDER);

  let totalComentarios = 0;

  files.forEach((file) => {
    if (!file.endsWith(".xlsx") || file.startsWith("~$")) return;

    const match = file.match(/^post-(\d+)\.xlsx$/);
    if (!match) return;

    const postIdRaw = `post${match[1]}`;
    const normalizedPostId = normalizeId(postIdRaw);

    const workbook = xlsx.readFile(path.resolve(COMMENTS_FOLDER, file));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    console.log(`📄 ${file} -> ${rows.length} linhas`);

    if (!postsMap[normalizedPostId]) {
      console.log(`⚠️ Post não encontrado no posts.xlsx: ${postIdRaw}`);
      return;
    }

    rows.forEach((row) => {
      if (!row.text || row.text.trim() === "") return;

      postsMap[normalizedPostId].comentarios.push({
        username: row.username || "",
        text: row.text || "",
        datetime: row.datetime || "",
        replies: Number(row.replies || 0),
        reposts: Number(row.reposts || 0),
        likes: Number(row.likes || 0),
      });

      totalComentarios++;
    });
  });

  console.log(`💬 Total de comentários processados: ${totalComentarios}`);
}

// ===== 3. GERA JSON FINAL =====
function buildFinalArray(postsMap) {
  return Object.values(postsMap);
}

// ===== MAIN =====
(function main() {
  const postsMap = loadPosts();

  loadComments(postsMap);

  const finalData = buildFinalArray(postsMap);

  fs.writeFileSync(
    path.resolve(__dirname, OUTPUT_JSON),
    JSON.stringify(finalData, null, 2),
    "utf-8",
  );

  console.log(`\n✅ JSON consolidado gerado: ${OUTPUT_JSON}`);
})();
