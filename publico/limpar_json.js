const fs = require("fs");
const path = require("path");

// Caminho para o ficheiro
const filePath = path.join(__dirname, "progresso.json");

// 1. Ler o ficheiro
fs.readFile(filePath, "utf8", (err, data) => {
  if (err) {
    console.error("Erro ao ler o ficheiro:", err);
    return;
  }

  try {
    // 2. Converter a string JSON para um Array de objetos
    const registros = JSON.parse(data);

    // 3. Filtrar os itens: manter apenas aqueles onde 'analise-conteudo' NÃO é null
    // O método .filter cria um novo array com todos os elementos que passam no teste
    const registrosFiltrados = registros.filter(
      (item) => item["analise-conteudo"] !== null,
    );

    // 4. Converter de volta para string JSON (com indentação de 2 espaços para manter legível)
    const jsonAtualizado = JSON.stringify(registrosFiltrados, null, 2);

    // 5. Gravar o resultado no ficheiro original
    fs.writeFile(filePath, jsonAtualizado, "utf8", (err) => {
      if (err) {
        console.error("Erro ao gravar o ficheiro:", err);
        return;
      }

      const removidos = registros.length - registrosFiltrados.length;
      console.log(`Sucesso! Foram removidos ${removidos} itens.`);
      console.log(`Total de itens restantes: ${registrosFiltrados.length}`);
    });
  } catch (parseErr) {
    console.error(
      "Erro ao processar o conteúdo do JSON (verifique se o formato é válido):",
      parseErr,
    );
  }
});
