const { chromium } = require("playwright");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

// ====== CONFIG ======
const EXCEL_FILE = "./planilhas/carlos-alberto-di-franco.xlsx";
const SHEET_INDEX = 0;
const COL_ID = "id";
const COL_TEXTO = "texto";

const OUTPUT_FILE = "./resultados/resultados-carlos-alberto-di-franco.json";

// Tempo máximo que aceitaremos o Gemini "gerando" antes de considerar travou
const GENERATION_TIMEOUT_MS = 60000; // 60s

// Tentativas por item (se travar, recarrega e tenta de novo)
const MAX_ATTEMPTS_PER_ITEM = 3;

// ====== NOVO PROMPT ======
// Substitua o valor abaixo pelo seu segundo prompt
const prompt2 = `ótimo. Agora quero que você revisa sua última resposta verificando e corrigindo os seguintes pontos:
- Os nomes das categorias, subcategorias e o campo valor e o nome das relações deve ser escrito exatamente como está escrito na descrição das categorias.
- Caso o campo valor não seja aplicável, preencha ele com null. Por exemplo, "valor: null". Jamais colocar "valor: {}" ou algo semelhante.
- Caso algum outro campo não seja aplicável, preencha-o com null.
- A resposta deve estar exatamente no formato abaixo:
[{
  palavra: palavra encontrada - verdade, verdadeiro(a), veracidade,
  categoria: nome da categoria que foi classificada,
  justificativa: por que você categorizou nessa categoria,
  subcategoria: nome da subcategoria,
  subcategoria_justificativa: por que você categorizou nessa subcategoria,
  valor: {
    nome: esse campo só deve ser preenchido caso você categorize na categoria 1 e subcategoria 1.3 (Verdade, valores profissionais e fronteiras do campo). Nesse caso você deve preencher este campo com um dos seguintes valores jornalísticos: apartidarismo, clareza, credibilidade, equilíbrio, exatidão, imparcialidade, independência, interesse público, isenção, liberdade, neutralidade, objetividade, pluralidade, precisão e rigor. Como pode ser mais de um valor esse campo é um array de strings,
    relacao: uma das relações descritas em 1.3.1 à 1.3.6,
    valor_justificativa: registre uma frase-síntese objetiva explicando porque você categorizou neste valor — por exemplo, “no corpus, a relação predominante entre verdade e credibilidade é de causalidade (a verdade sustenta a credibilidade)”,
  }
}]



`;

const loadingSelector = ".send-button-container.visible";
const inputSelector = 'textarea, [contenteditable="true"]';
const codeSelector = 'code[data-test-id="code-content"]';
const sendButtonSelector = '[aria-label="Enviar mensagem"]';

const stopButtonSelector =
  'button mat-icon[fonticon="stop"], mat-icon[fonticon="stop"]';
const avatarCompletedSelector =
  '[data-test-lottie-animation-status="completed"]';

// ====== HELPERS ======
function saveProgress(results) {
  fs.writeFileSync(
    path.resolve(__dirname, OUTPUT_FILE),
    JSON.stringify(results, null, 2),
    "utf-8",
  );
  console.log(`💾 Progresso salvo em: ${OUTPUT_FILE}`);
}

async function getInput(page) {
  return await page.waitForSelector(inputSelector, { timeout: 60000 });
}

async function clickSend(page) {
  const btn = await page.waitForSelector(sendButtonSelector, {
    timeout: 30000,
  });
  await btn.click();
}

async function pasteAndSend(page, inputHandle, text) {
  const isContentEditable = await inputHandle.evaluate(
    (el) => el.getAttribute("contenteditable") === "true",
  );

  if (isContentEditable) {
    await inputHandle.evaluate((el, value) => {
      el.focus();

      // Limpa corretamente o Quill
      el.textContent = "";

      // Insere texto puro (CSP-safe)
      el.textContent = value;

      // Dispara eventos que o Quill escuta
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: value,
        }),
      );
    }, text);
  } else {
    await inputHandle.fill(text);
  }

  await clickSend(page);
}

async function countCompleted(page) {
  return await page.locator(avatarCompletedSelector).count();
}

/**
 * Espera o Gemini terminar de responder monitorando o surgimento e sumiço do botão "Stop".
 */
async function waitGeminiFinish(page, completedBeforeSend, timeoutMs) {
  console.log("⏳ Aguardando início da geração (botão Stop aparecer)...");

  try {
    // Espera o botão de "stop" aparecer (sinal de que começou a gerar)
    await page.waitForSelector(stopButtonSelector, { timeout: 10000 });
    console.log("⚡ Gemini começou a responder (botão de Stop detectado).");
  } catch (e) {
    console.log("⚠️ Botão de Stop não apareceu em 10s. Prosseguindo...");
  }

  console.log("⏳ Aguardando conclusão (botão Stop desaparecer)...");

  // Espera o botão de "stop" sumir da tela (sinal de que terminou de gerar)
  await page.waitForSelector(stopButtonSelector, {
    state: "detached",
    timeout: timeoutMs,
  });
}

/**
 * Lê resposta:
 * - Preferência: code[data-test-id="code-content"]
 * - Fallback: último <pre>
 * - Último recurso: body text
 */
async function readLatestAnswerText(page) {
  const codeHandle = await page
    .waitForSelector(codeSelector, { timeout: 15000 })
    .catch(() => null);
  if (codeHandle) {
    const blocks = await page.locator(codeSelector).all();
    const last = blocks[blocks.length - 1]; // Pega sempre o último bloco gerado
    const text = (await last.innerText()).trim();
    if (text) return text;
  }

  const preHandle = await page
    .waitForSelector("pre", { timeout: 8000 })
    .catch(() => null);
  if (preHandle) {
    const pres = await page.locator("pre").all();
    const lastPre = pres[pres.length - 1];
    const text = (await lastPre.innerText()).trim();
    if (text) return text;
  }

  const bodyText = await page
    .evaluate(() => document.body?.innerText?.trim() || "")
    .catch(() => "");
  if (bodyText) return bodyText.slice(-4000);

  throw new Error(
    "Não consegui capturar resposta (nem code, nem pre, nem texto do body).",
  );
}

/**
 * Processa um item com retry automático:
 * - envia prompt 1
 * - espera terminar (ignora leitura)
 * - envia prompt 2
 * - espera terminar
 * - lê a última resposta em markdown
 * - se estourar timeout (Gemini travou), dá F5 e tenta de novo o MESMO item
 */
async function processItemWithRetry(page, prompt1, prompt2) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ITEM; attempt++) {
    console.log(`🔁 Tentativa ${attempt}/${MAX_ATTEMPTS_PER_ITEM}`);

    try {
      // garante UI pronta
      await getInput(page);

      // ==========================================
      // ENVIO DO PROMPT 1
      // ==========================================
      let completedBeforeSend = await countCompleted(page);
      let input = await getInput(page);

      await pasteAndSend(page, input, prompt1);
      console.log("📨 Primeiro prompt enviado.");

      page
        .waitForSelector(loadingSelector, { timeout: 8000 })
        .then(() =>
          console.log("⏳ Gemini começou a gerar a primeira resposta..."),
        )
        .catch(() => {});

      await waitGeminiFinish(page, completedBeforeSend, GENERATION_TIMEOUT_MS);
      console.log("✅ Primeira geração finalizada.");

      // ==========================================
      // ENVIO DO PROMPT 2
      // ==========================================
      // Atualiza a contagem de mensagens concluídas antes de enviar o segundo
      completedBeforeSend = await countCompleted(page);
      input = await getInput(page); // Pega o input novamente para o segundo envio

      await pasteAndSend(page, input, prompt2);
      console.log("📨 Segundo prompt (prompt2) enviado.");

      page
        .waitForSelector(loadingSelector, { timeout: 8000 })
        .then(() =>
          console.log("⏳ Gemini começou a gerar a segunda resposta..."),
        )
        .catch(() => {});

      await waitGeminiFinish(page, completedBeforeSend, GENERATION_TIMEOUT_MS);
      console.log("✅ Segunda geração finalizada.");

      // ==========================================
      // LEITURA DA RESPOSTA FINAL
      // ==========================================
      // captura APENAS a última resposta (bloco de código do prompt2)
      const raw = await readLatestAnswerText(page);

      // tenta parsear com 1 retry curto (pra evitar JSON truncado)
      let parsed = null;
      let finalRaw = raw;

      try {
        parsed = JSON.parse(finalRaw);
      } catch {
        await page.waitForTimeout(1500);
        const retryRaw = await readLatestAnswerText(page);
        finalRaw = retryRaw;
        try {
          parsed = JSON.parse(finalRaw);
        } catch {
          // ok, salva raw
        }
      }

      return { raw: finalRaw, parsed };
    } catch (err) {
      lastError = err;

      const msg = err?.message || String(err);

      // Se foi timeout esperando o "completed novo", tratamos como "travou"
      const isTimeout = msg.toLowerCase().includes("timeout");

      console.log(`⚠️ Erro na tentativa ${attempt}: ${msg}`);

      if (attempt < MAX_ATTEMPTS_PER_ITEM) {
        console.log(
          isTimeout
            ? `🧯 Parece travamento (> ${Math.round(GENERATION_TIMEOUT_MS / 1000)}s). Dando F5 e tentando de novo...`
            : "🔄 Dando F5 e tentando de novo...",
        );

        // F5 / reload e re-tenta o mesmo fluxo desde o começo
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(800);
        continue;
      }
    }
  }

  // se falhou todas as tentativas
  throw lastError || new Error("Falha após múltiplas tentativas");
}

// ====== MAIN ======
(async () => {
  const filePath = path.resolve(__dirname, EXCEL_FILE);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[SHEET_INDEX];
  const sheet = workbook.Sheets[sheetName];

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  console.log("rows: ", rows);

  const items = rows
    .map((row) => ({
      id: row[COL_ID],
      texto: row[COL_TEXTO],
    }))
    .filter((r) => r.id !== "" && r.texto !== "");

  if (items.length === 0) {
    throw new Error(
      `Não achei linhas com as colunas "${COL_ID}" e "${COL_TEXTO}". Confira o cabeçalho do Excel.`,
    );
  }

  console.log(`📄 Linhas carregadas do Excel: ${items.length}`);

  const browser = await chromium.launch({ headless: false, slowMo: 20 });
  const context = await browser.newContext();

  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "https://gemini.google.com",
  });

  const page = await context.newPage();

  // logs úteis
  page.on("close", () => console.log("🧨 PAGE FECHOU"));
  page.on("crash", () => console.log("💥 PAGE CRASHOU"));
  page.on("framenavigated", () => console.log("🔁 NAVEGOU/RECARREGOU"));

  await page.goto("https://gemini.google.com/app", {
    waitUntil: "domcontentloaded",
  });
  await getInput(page);

  // se existir arquivo anterior, reaproveita (não perde progresso)
  let results = [];
  const outPath = path.resolve(__dirname, OUTPUT_FILE);
  if (fs.existsSync(outPath)) {
    try {
      results = JSON.parse(fs.readFileSync(outPath, "utf-8"));
      console.log(
        `📌 Recuperei progresso do arquivo: ${OUTPUT_FILE} (${results.length} itens).`,
      );
    } catch {
      console.log(
        "⚠️ Não consegui ler o arquivo anterior. Vou começar do zero.",
      );
      results = [];
    }
  }

  // pula ids já processados (se o arquivo já tiver dados)
  const processedIds = new Set(results.map((r) => r.id));

  for (let i = 0; i < items.length; i++) {
    const { id, texto } = items[i];
    const idVar = id;
    const textoVar = texto;

    if (processedIds.has(idVar)) {
      console.log(`⏭️ Pulando id=${idVar} (já está no arquivo).`);
      continue;
    }

    console.log(
      `\n===== (${i + 1}/${items.length}) Processando id=${idVar} =====`,
    );

    const prompt1 = `

quero que você leia o texto abaixo, procure todas as ocorrências das palavras: verdade, verdadeiro(a) e veracidade, depois analise o contexto onde elas aparecem e classifique cada uma em uma das 4 categorias e subcategorias abaixo.
cada palavra encontrada no texto deve ser associada a somente uma das categorias e subcategorias.


gere uma saída json nesse formato e utilizando bloco de código:

[{
palavra: palavra encontrada - verdade, verdadeiro(a), veracidade,
categoria: nome da categoria que foi classificada,
justificativa: por que você categorizou nessa categoria,
subcategoria: nome da subcategoria,
subcategoria_justificativa: por que você categorizou nessa subcategoria,
valor: {
  nome: esse campo só deve ser preenchido caso você categorize na categoria 1 e subcategoria 1.3 (Verdade, valores profissionais e fronteiras do campo). Nesse caso você deve preencher este campo com um dos seguintes valores jornalísticos: apartidarismo, clareza, credibilidade, equilíbrio, exatidão, imparcialidade, independência, interesse público, isenção, liberdade, neutralidade, objetividade, pluralidade, precisão e rigor. Como pode ser mais de um valor esse campo é um array de strings,
  relacao: uma das relações descritas em 1.3.1 à 1.3.6,
  valor_justificativa: registre uma frase-síntese objetiva explicando porque você categorizou neste valor — por exemplo, “no corpus, a relação predominante entre verdade e credibilidade é de causalidade (a verdade sustenta a credibilidade)”,
}
}]

Caso o campo "valor" não seja aplicável você deve preenche-lo com o valor null.

Sua resposta deve conter somente o objeto json em um bloco de código (markdown) e nada mais. Ao gerar o markdown coloque o nome completo das categorias, subcategorias, valor e relação exatamente como está escrito na descrição das categorias.

cuidado para não considerar as palavras "verdadeiro(a)" como "verdade", já que ela contém parte da palavra "verdade".


as categorias e subcategorias estão descritas entre as tags <categorias-início> e <categorias-fim> abaixo:


<categorias-início>
CATEGORIA 1 — VERDADE COMO FUNDAMENTO IDENTITÁRIO, NORMATIVO E EPISTÊMICO DA PROFISSÃO

Ideia central: reúne trechos sobre a autoimagem do jornalista e do jornalismo nos planos moral, normativo e epistemológico — como o profissional define sua missão, articula seus valores e demarca as fronteiras do campo, e como reflete sobre a natureza do conhecimento que produz. O foco está na legitimidade profissional construída de dentro do campo, e não na função do jornalismo perante a sociedade e o Estado (Categoria 2) nem na disputa política com adversários nomeados (Categoria 4).

1.1 Verdade como missão profissional
Descrição: Inclui trechos em que a verdade é apresentada como dever moral, obrigação ou missão constitutiva do jornalista. O profissional se define como alguém que existe para buscar, proteger, revelar ou defender a verdade, enfatizando responsabilidade ética e compromisso público.
Indicadores analíticos:
  - Autodefinição moral da profissão
  - Linguagem de dever, compromisso, responsabilidade
  - Jornalista como agente da verdade
  - Metáforas religiosas, heroicas ou sacrificializantes (“guerreiros da verdade”, “missão”, “sacerdócio”)
 
Critérios de exclusão:
  - Se a verdade for usada para atacar adversários ou travar disputa discursiva → Categoria 4
  - Se o foco for técnica de apuração → Categoria 3
  - Se a ênfase for na função da verdade para a democracia ou instituições → Categoria 2
  - Se o foco for na relação com o público → Categoria 5

Exemplos:
  - “Devemos investir na busca da verdade. Podemos, pessoalmente, ser de esquerda ou de direita. Mas não devemos algemar a verdade. Ela é soberana. Está na essência da nossa missão.”
  - “Deve-se reconhecer, como fizeram alguns grandes diários brasileiros, que o jornalismo profissional tem o dever de aferir, em seus procedimentos rotineiros, se as declarações das pessoas que entrevista não atentam contra a verdade.”
  - “Não podemos nos calar diante da mentira.”
 
1.2 Verdade como problema epistemológico

Descrição: Inclui trechos que discutem o estatuto da verdade e dos fatos — sua natureza, limites, gradações e relação com a realidade. Aqui a verdade pode aparecer como factual, provisória, contextual, interpretativa ou construída.

Indicadores analíticos:
  - Distinção entre fato e interpretação
  - Reconhecimento de limites, incertezas ou gradações da verdade
  - Discussão sobre realidade, narrativa, construção social dos fatos
  - Modalizações epistêmicas (“talvez”, “em parte”, “indiscutivelmente”)

Critérios de exclusão:
  - Se o trecho enfatiza dever moral ou missão → 1.1
  - Se associa verdade a valores profissionais → 1.3
  - Se relaciona verdade à democracia ou instituições → Categoria 2
  - Se descreve procedimentos concretos de apuração → Categoria 3

Exemplos:
  - “A notícia bem fundamentada convida a uma leitura lateral... A verdade, dizem alguns filósofos, é algo socialmente construído e o acesso às notícias de qualidade possibilita uma leitura do mundo sob uma perspectiva mais ampla, mais próxima dessa “verdade”.”
  - “O jornalismo de qualidade exige cobrir os fatos. Não as nossas percepções subjetivas. Analisar e explicar a realidade. Não as nossas preferências, as simpatias que absolvem ou as antipatias que condenam.”

1.3 Verdade, valores profissionais e fronteiras do campo
Descrição: Reúne trechos em que a verdade aparece articulada a valores especificamente jornalísticos (apartidarismo, clareza, credibilidade, equilíbrio, exatidão, imparcialidade, independência, interesse público, isenção, liberdade, neutralidade, objetividade, pluralidade, precisão e rigor) e/ou usada para diferenciar o jornalismo profissional de outras formas de produção discursiva (opinião, ativismo, propaganda, influenciadores, redes sociais). Em ambos os casos, a operação de fundo é a mesma: a legitimação da prática jornalística por comparação — internamente, com seus próprios critérios normativos; externamente, com discursos concorrentes. O foco está na arquitetura normativa e nos limites do campo, não na função social do jornalismo perante a democracia (Categoria 2) nem na disputa política direta (Categoria 4).
Relações:
  1.3.1 Relação de instrumentalidade (meio e fim): outros valores servem para alcançar a verdade
  1.3.2 Relzação de causalidade ou dependência (causa e efeito): a verdade sustenta outro valor, ou vice-versa
  1.3.3 Relação de equivalência: verdade e outro valor tratados como sinônimos
  1.3.4 Relação de conflito ou tensão (oposição): a busca pela verdade colide com outro valor
  1.3.5 Relação de contingência (contextualização): a verdade depende de outros valores para ser aceitável
  1.3.6 Relação de contraste (diferenciação): a verdade e demais valores são utilizados para produzir uma distinção entre jornalismo profissional e amadorismo/opinião/ativismo

Critérios de exclusão:
  - Se o valor estiver ligado a democracia, cidadania ou instituições → Categoria 2
  - Se o trecho enfatizar técnicas concretas de apuração → Categoria 3
  - Se o uso da verdade for para deslegitimar um adversário nomeado → Categoria 4
  - Se a ênfase for na relação com o público → Categoria 5

Exemplos:
  - “Certas matérias, algemadas por chavões inconsistentes... mostram o flagrante descompasso entre essas interpretações e a força eloquente dos números e dos fatos. Resultado: a credibilidade, verdadeiro capital de um veículo, se esvai pelo ralo dos preconceitos.”
  - “Jornalismo independente reclama liberdade. Não temos dono. Nosso compromisso é com a verdade e com o leitor.”
  - “A tendência a reduzir o jornalismo a um trabalho de simples transmissão de diversas versões oculta a falácia de que a captação da verdade dos fatos é uma quimera. E não é. O bom jornalismo é a busca apaixonada da verdade.”
  - “Fazer jornalismo de qualidade é não ficar refém dos atores do teatro do poder. É cobrir os fatos. Com profundidade, clareza e capacidade de análise.”



CATEGORIA 2 — VERDADE, SOCIEDADE E DEMOCRACIA
Ideia central: reúne trechos em que a verdade é mobilizada para definir a função social do jornalismo na vida pública — democracia, soberania do Estado, cidadania, direitos coletivos, funcionamento das instituições —, sem tom de combate direto a um adversário nomeado (o que caracterizaria a Categoria 4).

Descrição: A ênfase recai sobre o papel do jornalismo em garantir transparência, possibilitar debate público informado, fiscalizar o poder e proteger direitos. A verdade é apresentada como bem público indispensável à vida em comum.

Indicadores analíticos:
  - Verdade como direito coletivo ou dever para com a sociedade
  - Verdade como base do debate público
  - Relação entre verdade e democracia, cidadania, instituições
  - Jornalismo como instância de vigilância do poder (watchdog)

Critérios de exclusão:
  - Se o foco estiver na missão moral do jornalista → 1.1
  - Se a verdade estiver ligada a valores técnicos da profissão → 1.3
  - Se o trecho enfatizar conflito com mentira ou ataque nomeado a atores → Categoria 4
  - Se o foco estiver na técnica de apuração → Categoria 3

Exemplos:
  - “Aquilo tudo nos ameaçou de verdade. Com seus lances risíveis, os golpistas não estavam aí de brincadeira... A democracia deve seguir firme na investigação e na punição dos responsáveis pelos atentados contra o Estado de Direito.”
  - “A confiança que conta mora na relação, no diálogo entre iguais, no debate aberto... Não se trata de uma verdade épica, visionária ou epifânica, mas simplesmente daquela que Hannah Arendt definiu: a verdade dos fatos. Apenas ela, que qualquer cidadão reconhece como sua.”
  - “Quem equipara Lula e Bolsonaro como dois extremistas na verdade tá pouco se lixando para a democracia.”
  - “Nesse sentido, nunca é demais lembrar que, na Era da (Des)informação a verdade, as evidências e os fatos concretos importam... para preservar os nossos direitos... e garantir a liberdade de expressão e a democracia.”



CATEGORIA 3 — VERDADE E MÉTODOS DE APURAÇÃO

Ideia central: reúne trechos que apresentam a verdade como resultado de métodos profissionais de verificação — checagem, cruzamento de fontes, análise de dados, transparência metodológica, bastidores da investigação. Aqui a verdade é legitimada por procedimento técnico, não por identidade, autoridade discursiva ou função democrática. Categoria não contestada nas revisões desta rodada; mantida sem alterações estruturais.

Indicadores analíticos:
  - Referência explícita a checagem, cruzamento de dados, investigação
  - Menção a fontes, documentos, evidências
  - Relatos de bastidores, dificuldades de apuração
  - Justificação da veracidade com base em método

Critérios de exclusão:
  - Se a ênfase estiver na natureza filosófica da verdade → 1.2
  - Se o foco for o papel moral do jornalista → 1.1
  - Se a técnica for mencionada para desqualificar adversários → Categoria 4
  - Se a apuração for usada para criar vínculo com o público → Categoria 5

Exemplos:
  - “É função dos fact-checkers apontar dados falsos exagerados e contraditórios sempre que eles aparecem no discurso dos poderosos e das celebridades. Não importa a hora o local ou o assunto em pauta.”
  - “Apurar demora, e são poucos os veículos que atualmente se dão ao luxo de segurar uma história para publicá-la com mais conteúdo depois.”
  - “O bom jornalista é aquele que aprofunda, vai atrás da verdade que, como dizia Claudio Abramo, frequentemente está camuflada atrás da verdade aparente.”

CATEGORIA 4 — VERDADE EM DISPUTA: CORREÇÃO, AUTORIDADE E MOBILIZAÇÃO

Ideia central: reúne trechos em que a verdade é mobilizada estrategicamente no embate público — para desmascarar mentiras, fechar o debate por autoridade própria ou convocar o público à ação —, sempre em registro adversarial, típico de contextos polarizados e digitais. A verdade aqui não é explicada nem metodologicamente fundamentada: é usada como arma simbólica.

4.1 Verdade contra mentira e desinformação
Descrição: Inclui enunciados que estruturam a realidade em uma oposição verdade × mentira, com linguagem de combate, denúncia e correção, sempre em relação a um enunciado ou ator rival identificável.

Indicadores analíticos:
  - Léxico de combate (“desmascarar”, “combater”, “enfrentar”)
  - Polarizações explícitas
  - Adjetivação desqualificadora do adversário
  
Critérios de exclusão:
  - Se houver explicação detalhada de métodos de checagem, sem tom de combate → Categoria 3
  - Se o foco for função democrática do jornalismo, sem alvo nomeado → Categoria 2

Exemplos:
  - “As chamadas “real news” em contraposição às “fake stories” nos ajudam a construir uma espécie de pacto com a realidade...”
  - “A mentira, por óbvio, precisa ser enfrentada. As narrativas ideológicas devem ser desmascaradas com a força dos fatos.”
  - “A VERDADE: os pagamentos do BPC aumentaram 21%... E parte da "esquerda" MENTINDO e espalhando FAKE-NEWS de que Lula está contra os mais pobres!!”
  - “Não por acaso, a extrema-direita começou a berrar contra a criação da “Procuradoria Nacional de Defesa da democracia”. Canalhas já inventaram que o governo quer “definir o que é verdade”. FALSO. A procuradoria será um braço da AGU, e a decisão será da Justiça.”
  - “Isso nunca foi verdade, nem sequer a maioria dos sionistas eh a favor de expulsar os palestinos.”
  - “Acho que chegou a hora dos bolsonaristas pararem de iludir o Bolsonaro... Já faz anos que isso não é verdade.”

4.2 Verdade como clausura do debate e mobilização do público
Descrição: Reúne trechos em que a verdade é mobilizada para encerrar o debate, corrigir sentidos em circulação, ou convocar a audiência a compartilhar, reagir ou engajar-se — sem nomear necessariamente um alvo específico. Incluem-se marcadores discursivos de correção (“na verdade”, “a bem da verdade”) e imperativos de engajamento (“compartilhe”, “dissemine”, “repasse”).

Indicadores analíticos:
  - “A verdade é uma só” / “Os fatos falam por si”
  - “Na verdade...” como correção enfática, sem alvo nomeado
  - Imperativos diretos de compartilhamento e engajamento

Critérios de exclusão:
  - Se houver alvo ou adversário identificável sendo corrigido → 4.1
  - Se houver justificativa metodológica → Categoria 3
  - Se o foco for identidade profissional → Categoria 1

Exemplos:
  - “O Brasil fica chocado quando vê a Globo falando a verdade. Todo mundo acostumado com as mentiras diárias.”
  - “Verdade dura = NÃO existe esquerda sem banqueiros.”
  - “Essa é a verdade dos fatos.”
  - “BOMBA!! ... Dissemine a verdade, comente: BOLSONARO TAXOU ATLETAS”
  - “REPASSE A VERDADE!!! Fio mais importante de hoje!”
  - “A informação é a base, mas o que sedimenta são os vínculos de verdade.”



CATEGORIA 5 — VERDADE E MEDIAÇÃO PEDAGÓGICA COM O PÚBLICO

Ideia central: o jornalista se apresenta como mediador que ajuda o público a compreender a realidade, organizando sentidos e oferecendo contexto, em tom explicativo ou pedagógico, sem tom de combate a um adversário (o que caracterizaria a Categoria 4).

Indicadores analíticos:
  - Tom explicativo ou pedagógico
  - Construção de comunidade (“nós”)
  - Organização de sentido para o leitor — gesto explícito de seleção/filtragem de informação

Critérios de exclusão:
  - Se for explicação técnica de apuração → Categoria 3
  - Se for ataque a adversários ou convocação à ação → Categoria 4

Exemplos:
  - “É preciso reinventar o jornalismo e recuperar... as competências e a magia do jornalismo de sempre.”
  - “Penso que há uma crescente nostalgia de conteúdos editados com rigor, critério e qualidade técnica e ética.”

<categorias-fim>



o texto que você deve ler e analisar está delimitado entre as tags <texto_alvo-início> e <texto_alvo-fim>. Não considere os exemplos das categorias na sua análise, somente o texto aqui abaixo delimitado:
<texto_alvo-início>
${textoVar}
<texto_alvo-fim>
`.trim();

    try {
      // Passa prompt1 e prompt2 para o processamento
      const { raw, parsed } = await processItemWithRetry(
        page,
        prompt1,
        prompt2,
      );

      console.log("📦 Resposta capturada (raw):");
      console.log(raw);

      results.push({
        id: idVar,
        resposta_json: parsed,
      });

      // salva incremental (não perde nada se travar depois)
      saveProgress(results);

      // reload antes do próximo (mantém sua estratégia de estabilidade)
      console.log("🔄 Recarregando a página para o próximo texto...");
      await page.reload({ waitUntil: "domcontentloaded" });
      await getInput(page);
      await page.waitForTimeout(800);
    } catch (err) {
      console.log(
        `❌ Falhei definitivamente no id=${idVar}: ${err?.message || err}`,
      );

      // salva o erro no resultado para você saber quais falharam
      results.push({
        id: idVar,
        erro: err?.message || String(err),
        resposta_raw: null,
        resposta_json: null,
      });

      saveProgress(results);

      // tenta seguir pro próximo
      console.log("🔄 Recarregando para seguir para o próximo...");
      await page.reload({ waitUntil: "domcontentloaded" });
      await getInput(page);
      await page.waitForTimeout(800);
    }
  }

  console.log(`\n✅ Finalizado! Arquivo gerado/atualizado: ${OUTPUT_FILE}`);
  await browser.close();
})();
