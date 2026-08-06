const { chromium } = require("playwright");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

// ====== CONFIG ======
const POSTS_FILE = "./posts.xlsx";
const COMMENTS_FOLDER = "./planilhas-publico";
const OUTPUT_JSON = "./progresso.json";
const OUTPUT_EXCEL = "./resultado-final.xlsx";

const GENERATION_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS_PER_ITEM = 3;

const inputSelector = ".ql-editor[contenteditable='true']";
const sendButtonSelector = '[aria-label="Enviar mensagem"]';
const codeSelector = "code[data-test-id='code-content']";

const avatarCompletedSelector =
  '[data-test-lottie-animation-status="completed"]';

// ====== HELPERS ======

function loadPosts() {
  const workbook = xlsx.readFile(path.resolve(__dirname, POSTS_FILE));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  const map = {};

  rows.forEach((row) => {
    const normalizedId = String(row.id)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ""); // remove -, _, espaços

    map[normalizedId] = {
      text: row.text,
      subject: row.subject || "",
      author: row.author,
    };
  });

  return map;
}

function loadAllComments() {
  const files = fs.readdirSync(COMMENTS_FOLDER);

  const all = [];

  files.forEach((file) => {
    // ✅ ignora arquivos temporários do Excel
    if (!file.endsWith(".xlsx") || file.startsWith("~$")) return;

    // ✅ só pega exatamente post-N.xlsx
    const match = file.match(/^post-(\d+)\.xlsx$/);
    if (!match) return;

    const postId = `post${match[1]}`;

    const workbook = xlsx.readFile(path.resolve(COMMENTS_FOLDER, file));

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    console.log(`📄 ${file} -> ${rows.length} comentários`);

    rows.forEach((row) => {
      // 🔥 evita linhas vazias
      if (!row.text || row.text.trim() === "") return;

      all.push({
        post: postId,
        username: row.username,
        text: row.text,
        datetime: row.datetime,
        replies: row.replies,
        reposts: row.reposts,
        likes: row.likes,
      });
    });
  });

  return all;
}

function detectKeyword(text) {
  if (!text) return "não";

  const normalized = text.toLowerCase();

  const keywords = ["verdade", "vdd", "verdadeiro", "verdadeira", "veracidade"];

  const found = keywords.some((k) => normalized.includes(k));

  return found ? "sim" : "não";
}

function saveProgress(results) {
  fs.writeFileSync(
    path.resolve(__dirname, OUTPUT_JSON),
    JSON.stringify(results, null, 2),
    "utf-8",
  );
  console.log("💾 Progresso salvo");
}

function saveExcel(results) {
  const worksheet = xlsx.utils.json_to_sheet(results);
  const workbook = xlsx.utils.book_new();

  xlsx.utils.book_append_sheet(workbook, worksheet, "Resultados");

  xlsx.writeFile(workbook, OUTPUT_EXCEL);
  console.log(`📊 Excel gerado: ${OUTPUT_EXCEL}`);
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

  await clickSend(page);
}

async function countCompleted(page) {
  return await page.locator(avatarCompletedSelector).count();
}

async function waitGeminiFinish(page, before, timeoutMs) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const count = await page
      .locator('[data-test-lottie-animation-status="completed"]')
      .count();

    if (count > before) {
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Timeout esperando Gemini finalizar");
}

async function readLatestAnswerText(page) {
  const codeHandle = await page
    .waitForSelector(codeSelector, { timeout: 15000 })
    .catch(() => null);

  if (codeHandle) {
    const blocks = await page.locator(codeSelector).all();
    return (await blocks[blocks.length - 1].innerText()).trim();
  }

  throw new Error("Não consegui capturar resposta");
}

async function processItemWithRetry(page, prompt) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ITEM; attempt++) {
    try {
      const completedBefore = await countCompleted(page);

      const input = await getInput(page);
      await pasteAndSend(page, input, prompt);

      await waitGeminiFinish(page, completedBefore, GENERATION_TIMEOUT_MS);

      const raw = await readLatestAnswerText(page);

      let parsed = null;

      try {
        parsed = JSON.parse(raw);
      } catch {
        await page.waitForTimeout(1500);
        const retryRaw = await readLatestAnswerText(page);
        parsed = JSON.parse(retryRaw);
      }

      return { raw, parsed };
    } catch (err) {
      lastError = err;

      if (attempt < MAX_ATTEMPTS_PER_ITEM) {
        console.log("🔄 Retry...");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
      }
    }
  }

  throw lastError;
}

// ====== MAIN ======

(async () => {
  const postsMap = loadPosts();
  const items = loadAllComments();

  console.log(`📄 Total de comentários: ${items.length}`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("https://gemini.google.com/app?hl=pt-BR", {
    waitUntil: "domcontentloaded",
  });

  await getInput(page);

  let results = [];

  if (fs.existsSync(OUTPUT_JSON)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_JSON, "utf-8"));
    console.log(`📌 Progresso carregado: ${results.length} itens`);
  }

  // 🔥 NOVO: controle de itens já processados
  const processedSet = new Set(
    results.map((r) => `${r.post}-${r.username}-${r.text}`),
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const { post, username, text, datetime, replies, reposts, likes } = item;

    const usou_palavra_chave = detectKeyword(text);

    const uniqueId = `${post}-${username}-${text}`;

    if (processedSet.has(uniqueId)) {
      console.log(`⏭️ Pulando já processado: ${post}`);
      continue;
    }

    const normalizedPost = post.toLowerCase().replace(/[^a-z0-9]/g, "");

    const postInfo = postsMap[normalizedPost] || {};

    console.log(`\n===== (${i + 1}/${items.length}) ${post} =====`);
    console.log("postInfo.text: ", postInfo, post);

    const prompt = `
    leia o comentário abaixo, de um usuário a um post no X (antigo Twitter). Após ler o texto do post e o comentário do usuário ao post você deve classificar o comentário do usuário em uma das categorias listadas abaixo.
O post do X está descrito entre os marcadores <post_texto> e </post_texto>. O nome do perfil no X que fez o post esta entre os marcadores <perfil> e </perfil>
O assunto do post está descrito entre os marcadores <post_subject> e </post_subject>.

o cometário do usuário ao post que você deve classificar em uma das categorias está entre os marcadores <comentario> e </comentario>

a descrição das categorias está entre os marcadores <categorias> e </categorias>, não conseidere os exemplos das categorias na sua análise, os exemplos servem apenas como base para entender melhor as categorias.

sua resposta deve ser apenas um bloco de código JSON no formato:

{
  "categoria": "...",
  "justificativa": "..."
}

Antes de classificar o comentário, você deve obrigatoriamente realizar uma análise interpretativa do contexto.

Passo 1 - Identificação do alvo do comentário:
Identifique sobre quem ou sobre o que o comentário está falando. O comentário pode se referir a:
-> ao jornal/perfil que publicou o post
-> ao conteúdo da notícia
-> a uma pessoa mencionada no post (político, figura pública, etc.)
-> a outro usuário ou grupo
-> ou pode ser genérico/ambíguo

Passo 2 - Relação com o jornalismo:
Verifique se o comentário faz referência direta ou indireta ao jornalismo, à mídia, ao veículo, à notícia ou à veracidade da informação publicada.

IMPORTANTE:
As categorias disponíveis dizem respeito EXCLUSIVAMENTE à percepção sobre o jornalismo, a notícia ou o veículo.

Portanto:
-> Se o comentário NÃO estiver falando do jornal, da mídia, da notícia ou da veracidade da informação,
-> e estiver apenas ofendendo, elogiando ou comentando sobre pessoas citadas no post,

ENTÃO ele NÃO deve ser classificado em nenhuma das categorias.

Nesses casos, responda com:

{
  "categoria": "fora_de_escopo",
  "justificativa": "O comentário não se refere ao jornalismo ou à informação publicada, mas sim a [explique o alvo identificado]."
}

Somente classifique em uma das categorias se houver relação clara com o jornalismo ou com a veracidade da informação.

<categorias>
Categoria 1 - Núcleo semântico da verdade

Função analítica - Captar comentários onde o público:
-> afirma ou nega a veracidade de algo
-> reivindica acesso ao real
-> disputa a interpretação factual.

exemplos:
-> “Quero saber a verdade disso tudo, porque essa história tá muito mal explicada.”
-> “Os fatos estão aí, é só olhar.”
-> “Essa é a realidade que muita gente não quer aceitar.”
-> “Realmente aconteceu desse jeito ou tão distorcendo?”




Categoria 2 - Contestação da veracidade
Esse conjunto captura negações explícitas da verdade jornalística.

Função analítica - Identificar comentários que:
-> acusam os jornais de produzir informação falsa
-> rejeitam a veracidade da notícia
-> deslocam a autoridade factual.
-> ou Identificar quando a verdade é enquadrada como:
-> construção narrativa
-> manipulação ideológica
-> versão parcial da realidade.

exemplos:
-> “Isso é mentira, já foi desmentido várias vezes.”
-> “Mais uma fake news sendo espalhada sem vergonha.”
-> “A mídia inventa cada coisa, impressionante.”
-> “Totalmente falso isso aí.”
-> “Isso é só mais uma narrativa da mídia.”
-> “Cada um conta uma versão diferente da história.”
-> “Estão manipulando a interpretação dos fatos.”
-> “História mal contada, tem coisa errada aí.”
-> “Essa versão oficial não me convence.”



Categoria 3 - Prova, evidência e comprovação
Aqui aparece a disputa sobre critérios de validação da verdade.

Função analítica - Captar comentários que:
-> exigem verificação
-> questionam evidências
-> disputam a legitimidade das fontes.

exemplos:
-> “Cadê a prova disso que estão falando?”
-> “Sem evidência nenhuma, só opinião.”
-> “Mostrem as fontes, por favor.”
-> “Quais são os dados que comprovam isso?”
-> “Falam, falam, mas provar ninguém prova.”




Categoria 4 - Deslegitimação da imprensa
Função analítica - Captar comentários que:
-> questionam a legitimidade institucional do jornal
-> acusam parcialidade editorial
-> deslocam a autoridade jornalística


exemplos:
-> “Essa imprensa não tem credibilidade nenhuma.”
-> “Mídia totalmente enviesada, só publica o que interessa.”
-> “Jornalismo virou militância faz tempo.”
-> “Parcialidade escancarada, nem disfarçam mais.”
-> “Esse jornal aí já perdeu toda a confiança.”




Categoria 5 - Legitimação da informação jornalística
Função analítica -Identificar comentários que:
-> reconhecem credibilidade
-> defendem o trabalho jornalístico.

exemplos:
-> “Finalmente uma reportagem séria sobre isso.”
-> “Ótimo trabalho jornalístico, bem apurado.”
-> “Informação correta, diferente do que andam espalhando.”
-> “Ainda bem que tem jornalismo de verdade.”
-> “Essa matéria esclareceu muita coisa.”




Categoria 6 - Experiência e fontes alternativas como critério de verdade
regimes alternativos de validação da verdade fora do jornalismo.

Função analítica - Captar comentários onde a verdade é validada por:
-> experiência direta
-> documentos oficiais
-> outras mídias
-> autoridades públicas
-> fatos recentes ou eventos históricos


exemplos:
-> “Eu moro aqui e não foi nada disso que estão falando.”
-> “Eu vi com meus próprios olhos, essa matéria tá distorcendo tudo.”
-> “Isso é inconstitucional, tá lá na Constituição, artigo 5º.”
-> “Vocês estão falando besteira, é só ler a lei que regulamenta isso.”
-> “Tá no Código Penal, isso não é crime como vocês estão dizendo.”
-> “Engraçado que em outros jornais a informação é bem diferente.”
-> “Vi essa notícia em outro lugar e os dados não batem.”
-> “Outros veículos já desmentiram isso aí.”
-> “O próprio Lula já explicou isso, vocês estão distorcendo.”
-> “Bolsonaro falou exatamente o contrário disso aí.”
-> “A Polícia Federal já se pronunciou, não tem nada disso.”

</categorias>

<perfil>
${postInfo.author || ""}
</perfil>

<post_texto>
${postInfo.text || ""}
</post_texto>

<post_subject>
${postInfo.subject || ""}
</post_subject>

<comentario>
${text}
</comentario>
`.trim();

    try {
      const { parsed } = await processItemWithRetry(page, prompt);

      results.push({
        post,
        categoria: parsed?.categoria || null,
        justificativa: parsed?.justificativa || null,
        username,
        text,
        datetime,
        replies,
        reposts,
        likes,
        usou_palavra_chave,
      });

      processedSet.add(uniqueId);

      saveProgress(results);

      await page.reload({ waitUntil: "domcontentloaded" });
      await getInput(page);
    } catch (err) {
      console.log(`❌ Erro: ${err.message}`);

      results.push({
        post,
        categoria: null,
        justificativa: null,
        username,
        text,
        datetime,
        replies,
        reposts,
        likes,
        usou_palavra_chave,
        erro: err.message,
      });

      processedSet.add(uniqueId);

      saveProgress(results);

      await page.reload({ waitUntil: "domcontentloaded" });
      await getInput(page);
    }
  }

  saveExcel(results);

  console.log("✅ FINALIZADO");
  await browser.close();
})();
