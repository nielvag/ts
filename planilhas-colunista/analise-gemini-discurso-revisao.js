const { chromium } = require("playwright");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

// ====== CONFIG ======
const EXCEL_FILE =
  "../jornalistas-influenciadores/planilhas/Thiago-dos-Reis.xlsx";
const SHEET_INDEX = 0;
const COL_ID = "id";
const COL_TEXTO = "texto";

const OUTPUT_FILE =
  "../jornalistas-influenciadores/resultados/Thiago-dos-Reis-discurso.json";

// Tempo máximo que aceitaremos o Gemini "gerando" antes de considerar travou
const GENERATION_TIMEOUT_MS = 60000; // 60s

// Tentativas por item (se travar, recarrega e tenta de novo a sequência inteira)
const MAX_ATTEMPTS_PER_ITEM = 3;

// ======= NOVO PROMPT ========
// Substitua o texto abaixo pelo seu segundo prompt
const PROMPT2 = `ótimo. Agora quero que você revisa sua última resposta verificando e corrigindo os seguintes pontos:
- Os nomes das categorias, subcategorias, valores, estratégias e papeis devem ser escritos exatamente como está escrito na descrição das categorias, com a numeração seguido do nome completo, por exemplo: "1.2.3 Crítico-Monitor (ou Cão de Guarda)", nunca: "1.2.3".
- Caso algum campo não seja aplicável, preencha ele com null. Por exemplo, "posicao-sujeito: null".
- A resposta deve estar exatamente no formato abaixo:
{
categorias: [
    {
      categoria: nome da categoria,
      justificativa: por que o texto encaixa nesta categoria,
      
    }
  ],
  posicao-sujeito: se escolhida categoria 1, escolha um dos valores (1.1.1 à 1.1.5), senão null,
  posicao-sujeito-justificativa: por que se encaixa nessa subcategoria,
  papel-enunciativo:  se escolhida categoria 1, escolha um dos valores (1.2.1 à 1.2.6), senão null,
  papel-enunciativo-justificativa: por que se encaixa nessa subcategoria,
  estrategias-de-legitimacao:  se escolhida categoria 2, array contendo uma ou mais das estratégias de 2.1 à 2.5, senão null,
  estrategias-de-legitimacao-justificativa: por que se encaixa nessa subcategoria,
  papel-do-leitor:  se escolhida categoria 3, escolha um dos papeis (3.1 à 3.6), senão null
}
`;
// ============================

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
      el.textContent = "";
      el.textContent = value;
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

async function waitGeminiFinish(page, completedBeforeSend, timeoutMs) {
  console.log("⏳ Aguardando início da geração (botão Stop aparecer)...");

  try {
    await page.waitForSelector(stopButtonSelector, { timeout: 10000 });
    console.log("⚡ Gemini começou a responder (botão de Stop detectado).");
  } catch (e) {
    console.log("⚠️ Botão de Stop não apareceu em 10s. Prosseguindo...");
  }

  console.log("⏳ Aguardando conclusão (botão Stop desaparecer)...");

  await page.waitForSelector(stopButtonSelector, {
    state: "detached",
    timeout: timeoutMs,
  });
}

async function readLatestAnswerText(page) {
  const codeHandle = await page
    .waitForSelector(codeSelector, { timeout: 15000 })
    .catch(() => null);
  if (codeHandle) {
    const blocks = await page.locator(codeSelector).all();
    const last = blocks[blocks.length - 1];
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
 * Processa uma sequência de prompts.
 * Envia o 1º, espera. Envia o 2º, espera.
 * Somente no último ele captura e processa o JSON gerado.
 */
async function processPromptsSequenceWithRetry(page, promptsArray) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ITEM; attempt++) {
    console.log(`🔁 Tentativa ${attempt}/${MAX_ATTEMPTS_PER_ITEM}`);

    try {
      let finalRaw = "";
      let parsed = null;

      // Itera sobre todos os prompts da sequência
      for (let i = 0; i < promptsArray.length; i++) {
        const currentPrompt = promptsArray[i];

        console.log(`\n▶️ Executando Passo ${i + 1}/${promptsArray.length}`);

        await getInput(page);
        const completedBeforeSend = await countCompleted(page);
        const input = await getInput(page);

        await pasteAndSend(page, input, currentPrompt);
        console.log(`📨 Prompt ${i + 1} enviado.`);

        page
          .waitForSelector(loadingSelector, { timeout: 8000 })
          .then(() => console.log("⏳ Gemini começou a gerar..."))
          .catch(() => {});

        await waitGeminiFinish(
          page,
          completedBeforeSend,
          GENERATION_TIMEOUT_MS,
        );
        console.log(`✅ Resposta ${i + 1} finalizada.`);

        // Se for o ÚLTIMO prompt da sequência, nós capturamos e tentamos parsear o JSON
        if (i === promptsArray.length - 1) {
          finalRaw = await readLatestAnswerText(page);

          try {
            parsed = JSON.parse(finalRaw);
          } catch {
            // Fallback para tentar pegar o JSON novamente se cortou
            await page.waitForTimeout(1500);
            finalRaw = await readLatestAnswerText(page);
            try {
              parsed = JSON.parse(finalRaw);
            } catch {
              // ok, salva apenas o raw se falhar
            }
          }
        } else {
          // Se não for o último, dá uma pequena pausa antes de mandar a 2ª pergunta para a UI estabilizar
          await page.waitForTimeout(2000);
        }
      }

      return { raw: finalRaw, parsed };
    } catch (err) {
      lastError = err;
      const msg = err?.message || String(err);
      const isTimeout = msg.toLowerCase().includes("timeout");

      console.log(`⚠️ Erro na tentativa ${attempt}: ${msg}`);

      if (attempt < MAX_ATTEMPTS_PER_ITEM) {
        console.log(
          isTimeout
            ? `🧯 Parece travamento. Dando F5 e reiniciando a sequência de prompts...`
            : "🔄 Dando F5 e reiniciando a sequência...",
        );

        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        continue; // Continua para a próxima tentativa do for loop
      }
    }
  }

  throw (
    lastError ||
    new Error("Falha após múltiplas tentativas na sequência de prompts")
  );
}

// ====== MAIN ======
(async () => {
  const filePath = path.resolve(__dirname, EXCEL_FILE);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[SHEET_INDEX];
  const sheet = workbook.Sheets[sheetName];

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

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

  page.on("close", () => console.log("🧨 PAGE FECHOU"));
  page.on("crash", () => console.log("💥 PAGE CRASHOU"));
  page.on("framenavigated", () => console.log("🔁 NAVEGOU/RECARREGOU"));

  await page.goto("https://gemini.google.com/app", {
    waitUntil: "domcontentloaded",
  });
  await getInput(page);

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
quero que você leia o texto abaixo, faça uma análise do discurso do texto e classifique nas 3 categorias abaixo. Um texto pode ser classificado em uma, várias ou nenhuma das categoria. 

gere uma saída json nesse formato e utilizando bloco de código:

{
categorias: [
    {
      categoria: nome da categoria,
      justificativa: por que o texto encaixa nesta categoria,
      
    }
  ],
  posicao-sujeito: se escolhida categoria 1, escolha um dos valores (1.1.1 à 1.1.5), senão null,
  posicao-sujeito-justificativa: por que se encaixa nessa subcategoria,
  papel-enunciativo:  se escolhida categoria 1, escolha um dos valores (1.2.1 à 1.2.6), senão null,
  papel-enunciativo-justificativa: por que se encaixa nessa subcategoria,
  estrategias-de-legitimacao:  se escolhida categoria 2, array contendo uma ou mais das estratégias de 2.1 à 2.5, senão null,
  estrategias-de-legitimacao-justificativa: por que se encaixa nessa subcategoria,
  papel-do-leitor:  se escolhida categoria 3, escolha um dos papeis (3.1 à 3.6), senão null
}

Sua resposta deve conter somente o objeto json em um bloco de código (markdown) e nada mais.


as categorias estão descritas entre as tags <categorias-início> e <categorias-fim> abaixo:


<categorias-início>
CATEGORIA 1 - Posicionamento do sujeito jornalista
O que observa: investiga os lugares discursivos ocupados pelos jornalistas ao enunciar a verdade, observando simultaneamente a posição-sujeito construída no discurso e os papéis enunciativos assumidos nos textos opinativos. Esta categoria dialoga com os conceitos de posição-sujeito, ethos discursivo, formações imaginárias e papéis profissionais do jornalismo, permitindo compreender como a autoridade jornalística é construída durante a enunciação da verdade.
Regra de codificação: identifique a posição-sujeito predominante (1.1.1 à 1.1.5) e o papel enunciativo predominante (1.2.1 à 1.2.6).

1.1 Posição-sujeito: A posição-sujeito corresponde ao lugar a partir do qual o jornalista produz seu enunciado — isto é, à forma como se inscreve na situação discursiva e estabelece sua relação com os acontecimentos narrados, com o objeto de que fala e com o leitor. Busca-se identificar se o jornalista fala como participante, testemunha, observador, especialista ou comentarista, e se constrói sua autoridade a partir da experiência pessoal, da interpretação dos fatos ou da distância analítica em relação ao acontecimento.
  1.1.1 - Participante: quando o jornalista se descreve como agente ou parte ativa do fato narrado (não apenas relatou — interveio, foi afetado, ou atuou nele). Distinção-chave: diferente da testemunha, o participante não apenas presenciou — ele integrou o próprio acontecimento como um dos seus agentes.
  1.1.2 - Testemunha: quando o jornalista reivindica presença física/sensorial pontual no momento exato do fato, sem ter atuado nele (marcas: "vi", "estava lá", "presenciei"). Distinção-chave: é presença pontual e passiva no momento do fato, não engajamento nele (participante) nem acompanhamento continuado ao longo do tempo (observador).
  1.1.3 - Observador: quando o jornalista constrói o relato por acompanhamento distanciado do cenário e/ou apuração ativa (fontes, checagem, documentos), sem alegar presença sensorial no instante do fato (marcas: "apurou-se", "segundo documentos", "fontes ouvidas por este jornalista"). Distinção-chave: onde a testemunha fala de um momento vivido, o observador fala de um panorama acompanhado — é uma vigilância prolongada e distanciada, não um flagrante.
  1.1.4 - Especialista: quando a autoridade invocada é conhecimento técnico/teórico geral sobre o tema, independente de vínculo factual com o episódio narrado (marcas: referência a formação, dados técnicos, domínio disciplinar). Distinção-chave: a autoridade não depende de proximidade com o fato relatado, mas de credencial e conhecimento sobre a matéria.
  1.1.5 - Comentarista: padrão residual: quando o trecho é essencialmente avaliação/juízo do jornalista, sem marca de vivência, testemunho, apuração ou credencial técnica declarada. Distinção-chave: é a posição "residual" e mais genérica — usada quando a autoridade do enunciador repousa sobre seu próprio juízo, e não sobre vivência, testemunho, acompanhamento ou expertise técnica comprovável.
1.2 Papel enunciativo: correspondem à função discursiva desempenhada pelo jornalista ao longo do texto, revelando como ele organiza sua atuação perante o leitor ao interpretar, narrar, fiscalizar, mobilizar ou reconstruir acontecimentos. Enquanto a posição-sujeito indica de onde o jornalista fala, o papel enunciativo evidencia o que ele faz discursivamente ao construir sua narrativa. Os dois eixos são independentes entre si e devem ser codificados separadamente para o mesmo trecho — um Crítico-Monitor, por exemplo, pode falar tanto como especialista distante quanto como participante direto de uma apuração; um Militante pode falar como testemunha ou como comentarista.
  1.2.1 Observador-Intérprete (ou Analista): reúne observação da realidade e interpretação dos acontecimentos — identifica, seleciona e organiza fatos relevantes, atribuindo-lhes sentido; aproxima-se das funções de gatekeeper e analista.
  1.2.2 Narrador-Testemunha: assume a posição de sujeito da experiência e da narração, mobilizando presença física, memória e sensibilidade como legitimação da narrativa.
  1.2.3 Crítico-Monitor (ou Cão de Guarda): exerce vigilância sobre instituições e poder, de forma fiscalizadora e frequentemente adversarial — tradição do watchdog journalism.
  1.2.4 Militante: rompe com a neutralidade estrita e assume engajamento social, político ou moral explícito, defendendo causas ou projetos de transformação.
  1.2.5 Mobilizador: convoca, engaja ou estimula ações coletivas do público, com dimensão performativa — ganha centralidade em ambientes digitais.
  1.2.6 Historiador (ou Intérprete do “Tempo Duplo”): recorre à memória histórica para interpretar acontecimentos presentes, estabelecendo continuidades, rupturas e comparações entre diferentes contextos históricos.


CATEGORIA 2 - Estratégias de legitimação
O que observa: Investiga como os jornalistas legitimam discursivamente aquilo que dizem — isto é, os recursos linguístico-discursivos mobilizados para conferir autoridade à própria fala, respondendo, na prática, à pergunta “por que devo acreditar em quem está falando?”.
Regra de codificação: uma ou mais estratégias de legitimação no texto. Para evitar super-categorização: escolha uma subcategoria (2.1 à 2.5) apenas quando ela desempenhar papel reconhecível na legitimação daquele enunciado específico sobre a verdade, não pela presença trivial do traço em qualquer texto (todo enunciado tem algum tom, mas nem todo tom constrói um ethos relevante para a análise). 

2.1 Ethos e fiador
Definição: a imagem de si que o enunciador constrói não pelo que diz sobre si mesmo, mas pela própria maneira de falar — tom, vocabulário, ritmo, postura. O “fiador” é a instância enunciativa (a voz, o caráter) que sustenta essa imagem e a torna incorporável pelo leitor; ethos e fiador são, na prática, a mesma operação vista por dois ângulos.
Como reconhecer: escolhas de tom (sóbrio, indignado, professoral, confessional) que constroem uma persona por trás do texto; marcas de estilo que sugerem competência, autoridade moral ou proximidade, independentemente do conteúdo afirmado.
Exemplo ilustrativo: um colunista que adota tom grave e didático ao tratar de desinformação constrói, por esse tom, um ethos de guardião responsável da verdade — sem precisar declarar isso explicitamente.

2.2 Discurso relatado
Definição: a citação, explícita e atribuída, da fala de outra pessoa ou fonte (discurso direto, indireto ou indireto livre), usada para emprestar autoridade externa ao que se afirma. Distingue-se da polifonia (item 3) por ser sempre marcada e atribuível a uma fonte nomeável.
Como reconhecer: verbos de elocução (“afirmou”, “disse”, “reconheceu”, “declarou”); aspas ou travessões introduzindo a fala de terceiros; expressões como “segundo o relatório”, “de acordo com”.
Exemplo ilustrativo: “...como dizia Claudio Abramo, frequentemente está camuflada atrás da verdade aparente” — a autoridade de Abramo é convocada para legitimar o argumento do enunciador.

2.3 Polifonia
Definição: a presença de mais de uma voz ou ponto de vista dentro do mesmo enunciado, nem sempre atribuída explicitamente a uma fonte — inclui ironia, negação polêmica, concessão e pressuposição, que fazem ecoar um ponto de vista alheio sem citá-lo diretamente. É um fenômeno mais amplo que o discurso relatado: toda citação é polifônica, mas nem toda polifonia é uma citação.
Como reconhecer: negações que respondem a um discurso implícito (“não é verdade que...”); ironia que insinua a posição de um adversário para refutá-la; concessões (“é verdade que X, mas...”) que incorporam e depois neutralizam uma voz contrária.
Exemplo ilustrativo: “Não se trata de uma verdade épica, visionária ou epifânica” — o enunciado ecoa e descarta, sem citar diretamente, uma concepção alheia de verdade, antes de apresentar a sua própria.

2.4 Cenografia
Definição: a cena de enunciação que o próprio texto constrói para si — o enquadramento ficcional dentro do qual o discurso se apresenta como estando acontecendo (por exemplo, um texto que se encena como confissão pessoal, como aula, como conversa entre iguais ou como manifesto). A cenografia legitima o discurso ao lhe dar um enquadramento reconhecível e autorizado para aquele tipo de fala.
Como reconhecer: marcas que emolduram o texto como um gênero discursivo específico (conversa informal, sermão, alerta urgente, depoimento); uso de vocativos, saudações ou fórmulas que instauram uma cena de comunicação particular.
Exemplo ilustrativo: um texto que se abre como se fosse um alerta urgente entre amigos (“preciso te contar uma coisa”) instaura uma cenografia de confidência que legitima o tom emocional do que segue.

2.5 Autoridade institucional
Definição: a legitimação obtida pela referência a uma instituição, cargo ou posição social reconhecida (o veículo de imprensa, um título profissional, uma posição oficial), e não pelo estilo pessoal do enunciador (o que distingue este item do ethos). A fonte de credibilidade aqui é coletiva e formal, não individual e estilística.
Como reconhecer: menção ao nome do veículo, cargo, credencial profissional ou vínculo institucional como fundamento da afirmação; expressões como “enquanto editor deste jornal”, “nossa redação apurou”.
Exemplo ilustrativo: “Não é função de nenhum editor de jornalismo questionar as decisões editoriais de outros veículos” — o enunciado convoca a posição institucional de “editor” como fonte de legitimidade para o julgamento que segue.
Marcas linguísticas gerais da categoria: certificadores e reformuladores (“na verdade”, “é evidente”, “sem dúvida”); referências legitimadoras (“segundo especialistas”, “dados oficiais”); discurso relatado e polifonia (“afirmou”, “reconheceu”, “segundo o relatório”).


CATEGORIA 3 - Mediação discursiva e relação com o público
O que observa: Investiga como os jornalistas constroem vínculo, proximidade e negociação simbólica com os leitores ao enunciar a verdade.
Regra de codificação: Escolher qual o papel do leitor/co-enunciador predominante (3.1 à 3.6).
Papéis do leitor/co-enunciador:
  3.1 Parceiro: relação de cooperação e horizontalidade; jornalista e leitor partilham o mesmo ambiente de pensamento, em contrato de aceitação mútua.
  3.2 Aprendiz: cena didática e assimétrica; o jornalista ocupa a autoridade institucionalizada do saber, e o público é interpelado como quem precisa preencher lacunas de conhecimento.
  3.3 Cidadão: o leitor é tratado como sujeito-de-direito, autônomo, no interior de uma formação social — foco em Estado, esfera pública e interesses coletivos.
  3.4 Cúmplice: laço de conivência por meio de ironias, gírias ou saberes prévios não ditos; o leitor é inserido num círculo de “iniciados”.
  3.5 Vítima da desinformação: o leitor é projetado como alguém cujas percepções foram manipuladas; o jornalista assume enunciação corretiva ou de denúncia.
  3.6 Público a ser mobilizado: função conativa forte; o jornalista busca a incorporação plena do leitor, incitando adesão ativa e tomada de posição.


<categorias-fim>






o texto que você deve ler e analisar está delimitado entre as tags <texto_alvo-início> e <texto_alvo-fim>. Não considere os exemplos e outros textos das categorias na sua análise, somente o texto aqui abaixo delimitado:
<texto_alvo-início>
${textoVar}
<texto_alvo-fim>
`.trim();

    try {
      // Aqui passamos o array com os dois prompts na ordem exata de execução
      const { raw, parsed } = await processPromptsSequenceWithRetry(page, [
        prompt1,
        PROMPT2,
      ]);

      console.log("📦 Resposta Final (do Prompt 2) capturada (raw):");
      console.log(raw);

      results.push({
        id: idVar,
        resposta_json: parsed,
      });

      saveProgress(results);

      console.log(
        "🔄 Recarregando a página para zerar o contexto pro próximo texto...",
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await getInput(page);
      await page.waitForTimeout(1500);
    } catch (err) {
      console.log(
        `❌ Falhei definitivamente no id=${idVar}: ${err?.message || err}`,
      );

      results.push({
        id: idVar,
        erro: err?.message || String(err),
        resposta_json: null,
      });

      saveProgress(results);

      console.log("🔄 Recarregando para seguir para o próximo...");
      await page.reload({ waitUntil: "domcontentloaded" });
      await getInput(page);
      await page.waitForTimeout(1500);
    }
  }

  console.log(`\n✅ Finalizado! Arquivo gerado/atualizado: ${OUTPUT_FILE}`);
  await browser.close();
})();
