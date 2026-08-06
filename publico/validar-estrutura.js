const fs = require("fs");

// Nome do arquivo a ser lido
const ARQUIVO = "progresso.json";

// Estrutura exata esperada para as chaves principais (na ordem correta)
const chavesPrincipaisEsperadas = [
  "post",
  "post_texto",
  "assunto",
  "perfil",
  "username",
  "text",
  "datetime",
  "replies",
  "reposts",
  "likes",
  "usou_palavra_chave",
  "analise-conteudo",
  "posicionamento-do-sujeito",
  "estrategias-de-legitimacao",
  "construção-do-outro",
  "regime-de-veridicção",
];

// Estrutura exata esperada para os objetos aninhados
const chavesAninhadasEsperadas = ["categoria", "justificativa"];
const camposAninhados = [
  "analise-conteudo",
  "posicionamento-do-sujeito",
  "estrategias-de-legitimacao",
  "construção-do-outro",
  "regime-de-veridicção",
];

function validarJson() {
  try {
    // 1. Lê e converte o JSON
    const rawData = fs.readFileSync(ARQUIVO, "utf8");
    const dados = JSON.parse(rawData);

    let encontrouInconsistencia = false;

    // 2. Percorre cada item do array
    dados.forEach((item, index) => {
      const chavesItem = Object.keys(item);

      // Verifica se a quantidade de chaves principais está correta
      if (chavesItem.length !== chavesPrincipaisEsperadas.length) {
        console.log(
          `\n❌ Inconsistência no Item ${index} (Posição ${index + 1} do array):`,
        );
        console.log(
          `   Motivo: O item tem ${chavesItem.length} chaves, mas o esperado eram ${chavesPrincipaisEsperadas.length}.`,
        );
        encontrouInconsistencia = true;
        return; // Pula para o próximo item
      }

      // Verifica a ordem e os nomes das chaves principais
      for (let i = 0; i < chavesPrincipaisEsperadas.length; i++) {
        if (chavesItem[i] !== chavesPrincipaisEsperadas[i]) {
          console.log(
            `\n❌ Inconsistência no Item ${index} (Posição ${index + 1} do array):`,
          );
          console.log(
            `   Motivo: Erro na ordem ou nome da chave. Esperava "${chavesPrincipaisEsperadas[i]}" na posição ${i}, mas encontrou "${chavesItem[i]}".`,
          );
          encontrouInconsistencia = true;
          return;
        }
      }

      // Verifica as chaves dos objetos aninhados (se o valor não for null)
      for (const campo of camposAninhados) {
        const valorAninhado = item[campo];

        if (
          valorAninhado !== null &&
          typeof valorAninhado === "object" &&
          !Array.isArray(valorAninhado)
        ) {
          const chavesSubItem = Object.keys(valorAninhado);

          if (chavesSubItem.length !== chavesAninhadasEsperadas.length) {
            console.log(
              `\n❌ Inconsistência no Item ${index}, dentro do campo "${campo}":`,
            );
            console.log(`   Motivo: Quantidade incorreta de chaves internas.`);
            encontrouInconsistencia = true;
            return;
          }

          for (let j = 0; j < chavesAninhadasEsperadas.length; j++) {
            if (chavesSubItem[j] !== chavesAninhadasEsperadas[j]) {
              console.log(
                `\n❌ Inconsistência no Item ${index}, dentro do campo "${campo}":`,
              );
              console.log(
                `   Motivo: Esperava a chave interna "${chavesAninhadasEsperadas[j]}" na posição ${j}, mas encontrou "${chavesSubItem[j]}".`,
              );
              encontrouInconsistencia = true;
              return;
            }
          }
        }
      }
    });

    // 3. Resultado final
    if (!encontrouInconsistencia) {
      console.log(
        "\n✅ Validação concluída! Todos os itens estão exatamente no formato e ordem exigidos.",
      );
    } else {
      console.log(
        "\n⚠️ Validação concluída com erros. Corrija os itens acima no seu JSON.",
      );
    }
  } catch (error) {
    console.error("Erro fatal ao ler ou processar o arquivo:", error.message);
  }
}

validarJson();
