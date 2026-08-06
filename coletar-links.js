const axios = require("axios");
const XLSX = require("xlsx");
const fs = require("fs");

const baseUrl =
  "https://falkor-cda.bastian.globo.com/tenants/oglobo/instances/21c4556a-7d3f-4877-acf3-163b5c900401/posts/page/";
// "https://falkor-cda.bastian.globo.com/tenants/oglobo/instances/03f0b6a6-f808-4c06-a7fa-fee8e1172605/posts/page/";
const startYear = 2018;
const endYear = 2024;

async function fetchPage(page) {
  try {
    const response = await axios.get(`${baseUrl}${page}`);
    return response.data;
  } catch (err) {
    console.error(`Erro na página ${page}:`, err.message);
    return null;
  }
}

async function main() {
  let page = 1;
  const allPosts = [];

  while (true) {
    const data = await fetchPage(page);
    if (!data || !data.items || data.items.length === 0) break;

    const posts = [];

    if (!!data?.items) {
      for (const item of data.items) {
        const createdDate = new Date(item.created);
        const year = createdDate.getFullYear();
        if (year >= startYear && year <= endYear) {
          posts.push({
            Titulo: item.content.title || "",
            URL: item.content.url || "",
            Data: createdDate.toISOString().split("T")[0],
          });
        }
      }
    }

    allPosts.push(...posts);

    console.log(
      `Página ${page} processada. Total de posts válidos: ${allPosts.length}`
    );
    page++;
  }

  // Exportar para Excel
  const worksheet = XLSX.utils.json_to_sheet(allPosts);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Posts");

  XLSX.writeFile(workbook, "posts_filtrados_fernando.xlsx");
  console.log("Arquivo Excel criado: posts_filtrados_fernando.xlsx");
}

main();
