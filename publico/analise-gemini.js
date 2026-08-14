const { chromium } = require("playwright");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

// ====== CONFIG ======
const POSTS_FILE = "./posts.xlsx";
const COMMENTS_FOLDER = "./planilhas-publico";
const OUTPUT_JSON = "./progresso.json";

const GENERATION_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS_PER_ITEM = 3;

const inputSelector = ".ql-editor[contenteditable='true']";
const sendButtonSelector = '[aria-label="Enviar mensagem"]';
const codeSelector = "code[data-test-id='code-content']";

const stopButtonSelector =
  'button mat-icon[fonticon="stop"], mat-icon[fonticon="stop"]';

// ====== HELPERS ======

function loadPosts() {
  const workbook = xlsx.readFile(path.resolve(__dirname, POSTS_FILE));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  const map = {};

  rows.forEach((row) => {
    const rawId = row.id || row.ID || "";
    const normalizedId = String(rawId)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    map[normalizedId] = {
      text: row.text || row.texto || "",
      subject: row.assunto || row.subject || "",
      author: row.author || row.perfil || row.autor || "",
    };
  });

  return map;
}

function loadAllComments() {
  const files = fs.readdirSync(COMMENTS_FOLDER);
  const all = [];

  files.forEach((file) => {
    if (!file.endsWith(".xlsx") || file.startsWith("~$")) return;

    const match = file.match(/^post-(\d+)\.xlsx$/);
    if (!match) return;

    const postId = `post${match[1]}`;
    const workbook = xlsx.readFile(path.resolve(COMMENTS_FOLDER, file));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    console.log(`📄 ${file} -> ${rows.length} comentários`);

    rows.forEach((row) => {
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
  console.log("💾 Progresso salvo no JSON");
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
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  }, text);
  await clickSend(page);
}

async function waitGeminiFinish(page, timeoutMs) {
  await page.waitForTimeout(1500);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const stopCount = await page.locator(stopButtonSelector).count();

    if (stopCount === 0) {
      await page.waitForTimeout(1000);
      return;
    }

    await page.waitForTimeout(1000);
  }
  throw new Error("Timeout esperando Gemini finalizar (Botão Stop não sumiu)");
}

async function readLatestAnswerText(page) {
  const codeHandle = await page
    .waitForSelector(codeSelector, { timeout: 15000 })
    .catch(() => null);

  if (codeHandle) {
    const blocks = await page.locator(codeSelector).all();
    let rawText = await blocks[blocks.length - 1].innerText(); // Pega sempre o último bloco gerado

    rawText = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    return rawText;
  }
  throw new Error("Não consegui capturar resposta");
}

// 🟢 AQUI: Função modificada para receber e enviar dois prompts
async function processItemWithRetry(page, prompt1, prompt2) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_ITEM; attempt++) {
    try {
      // 1. Envia o primeiro prompt
      let input = await getInput(page);
      await pasteAndSend(page, input, prompt1);
      await waitGeminiFinish(page, GENERATION_TIMEOUT_MS);

      // Pausa rápida por segurança antes de enviar o segundo prompt
      await page.waitForTimeout(1000);

      // 2. Envia o segundo prompt (revisão) na mesma conversa
      input = await getInput(page); // Pega o input novamente para evitar erro de elemento desanexado do DOM
      await pasteAndSend(page, input, prompt2);
      await waitGeminiFinish(page, GENERATION_TIMEOUT_MS);

      // 3. Captura o resultado (vai pegar o último JSON da tela)
      const raw = await readLatestAnswerText(page);
      const parsed = JSON.parse(raw);

      return { raw, parsed };
    } catch (err) {
      lastError = err;
      console.log(
        `🔄 Tentativa ${attempt} falhou, recarregando... (${err.message})`,
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    }
  }
  throw lastError;
}

// ====== MAIN ======

(async () => {
  const postsMap = loadPosts();
  const items = loadAllComments();
  console.log(`📄 Total de comentários para processar: ${items.length}`);

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

  const processedSet = new Set(
    results.map((r) => `${r.post}-${r.username}-${r.text}`),
  );

  const baseCategorias = {
    categoria: null,
    "categoria-justificativa": null,
    subcategoria: null,
    "subcategoria-justificativa": null,
    "posicionamento-do-sujeito": null,
    "estrategias-de-legitimacao": null,
    "regime-de-veridicção": null,
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { post, username, text, datetime, replies, reposts, likes } = item;
    const uniqueId = `${post}-${username}-${text}`;

    if (processedSet.has(uniqueId)) continue;

    const normalizedPost = post.toLowerCase().replace(/[^a-z0-9]/g, "");
    const postInfo = postsMap[normalizedPost] || {};
    const usou_palavra_chave = detectKeyword(text);

    console.log(`\n===== (${i + 1}/${items.length}) Post: ${post} =====`);

    const prompt = `
leia o comentário abaixo, de um usuário a um post no X (antigo Twitter). Após ler o texto do post e o comentário do usuário ao post você deve classificar o comentário do usuário em uma das categorias listadas abaixo.
O post do X está descrito entre os marcadores <post_texto> e </post_texto>. O nome do perfil no X que fez o post esta entre os marcadores <perfil> e </perfil>
O assunto do post está descrito entre os marcadores <post_subject> e </post_subject>.

o comentário do usuário ao post que você deve classificar em uma das categorias está entre os marcadores <comentario> e </comentario>

a descrição das categorias está entre os marcadores <categorias> e </categorias>, não considere os exemplos das categorias na sua análise, os exemplos servem apenas como base para entender melhor as categorias.

Antes de classificar o comentário, você deve obrigatoriamente realizar uma análise interpretativa do contexto. Identifique sobre quem ou sobre o que o comentário está falando.

--------------------------------------------------
FORMATO DE RESPOSTA EM BLOCO DE CÓDIGO (JSON APENAS)
--------------------------------------------------
{
  "categoria": umas das categorias da ETAPA 1 — ANÁLISE DE CONTEÚDO,
  "categoria-justificativa": justificativa,
  "subcategoria":  umas das subcategorias da ETAPA 1 — ANÁLISE DE CONTEÚDO,
  "subcategoria-justificativa": justificativa,
  "posicionamento-do-sujeito": caso se encaixe em um dos posicionamentos preecher com objeto no seguinte formato: { "nome": um dos posicionamentos do sujeito, "justificativa": justificativa }. Se não se encaixar em nenhum dos posicionamentos, preencher campo com null,
  "estrategias-de-legitimacao": array contendo uma ou mais estratégias de legitimação. Se não houver estratégias, preencher campo com null,
  "regime-de-veridicção": caso se encaixe em um dos regimes, preencher com objeto no seguinte formato: { "nome": um dos regimes de veridicção, "justificativa": justificativa }. Se não se encaixar em nenhum regime, preencher campo com null
}

<categorias>
--------------------------------------------------
ETAPA 1 — ANÁLISE DE CONTEÚDO
--------------------------------------------------

Classifique o comentário em apenas UMA das categorias abaixo:

"Categoria 1 — Validação do Conteúdo Jornalístico"
Ideia central: o comentário reconhece o relato jornalístico como legítimo e reforça sua veracidade, sem necessariamente elogiar a instituição.

Subcategorias:
"1.1 Validação institucional" — reconhece o veículo como fonte confiável em si.
"1.2 Validação instrumental" — concorda com o fato relatado porque ele serve a um argumento ou posição que o usuário já sustenta.

Descrição: Comentários que chancelam a informação, confirmam a apuração ou expressam concordância com o relato, independentemente da motivação subjacente (cívica ou utilitária).
Indicadores analíticos: Verbos de confirmação (“é verdade”, “confirmado”, “finalmente”); ausência de contestação da fonte; uso do conteúdo noticioso como premissa aceita para o próprio argumento.
Critérios de exclusão: Comentários com ironias que citam a notícia apenas para debochar (vão para Categoria 3).
Exemplo: Comentário que reafirma a veracidade de uma reportagem sobre a crise sanitária em Manaus sem contestar dados ou fonte.


"Categoria 2 — Contestação Argumentativa da Veracidade"
Ideia central: o comentário discorda do relato ou pede mais evidências, mas permanece no plano do debate racional — não recorre a hostilidade ou deboche.

Subcategorias:
"2.1 Contestação por exigência de prova" — cobra fontes, dados, comprovação.
"2.2 Contestação por versão alternativa" — propõe uma interpretação diferente dos fatos, com algum grau de fundamentação.

Descrição: Reúne posicionamentos que questionam a reportagem sem recorrer a ataque direto; o tom é predominantemente investigativo, ainda que a fundamentação nem sempre seja robusta.
Indicadores analíticos: Perguntas retóricas ou diretas (“cadê as provas?”); conectivos concessivos e contra-argumentativos (“mas”, “na verdade”, “isso não bate com...”); menção a outras fontes ou a lacunas na cobertura.
Critérios de exclusão: Comentários que usam a exigência de prova como pretexto para ironizar o veículo (nesse caso, avaliar tom geral e reclassificar em Categoria 3); contestações que não trazem nenhum elemento de argumentação, apenas negação (“isso é mentira” sem mais nada), que devem ser avaliadas quanto ao tom antes de serem incluídas aqui ou na Categoria 3.
Exemplo: Comentário que questiona a declaração de uma autoridade citando uma suposta incoerência factual, sem recorrer a ofensas.


"Categoria 3 — Deslegitimação, Ironia e Conflito"
Ideia central: o comentário ataca a credibilidade da instituição jornalística, do fato noticiado ou dos envolvidos, recorrendo a sarcasmo, deboche ou hostilidade explícita.

Subcategorias:
"3.1 Deslegitimação institucional" — ataque dirigido ao veículo ou à profissão jornalística.
"3.2 Deslegitimação por deboche" — uso de ironia, memes ou humor para esvaziar o conteúdo sem argumentar.
"3.3 Deslegitimação pessoal" — ataque dirigido a indivíduos citados na matéria (jornalistas, fontes, personagens).

Descrição: Concentra a hostilidade retórica; a legitimidade da posição do usuário decorre da desqualificação do outro, não da apresentação de evidências próprias.
Indicadores analíticos: Expressões de riso estilizado (“kkkk”), adjetivos pejorativos, ironia lexicalizada (“é verdade esse bilhete”), acusações de viés ideológico ao veículo.
Critérios de exclusão: Comentários que discordam com fundamentação argumentativa, mesmo que em tom firme (ver na Categoria 2); comentários que atacam terceiros, mas validam o veículo (ver na Categoria 1).
Exemplo: Comentário que classifica uma manchete com adjetivo depreciativo sem engajar com o conteúdo factual.

--------------------------------------------------
ETAPA 2 — ANÁLISE DISCURSIVA
--------------------------------------------------

Após classificar, analise o comentário nas seguintes dimensões:

Dimensão 1 — Posicionamento do Sujeito (formação discursiva e interpelação ideológica)
Ideia central: todo dizer é atravessado por uma formação discursiva que determina o que pode e deve ser dito a partir de um lugar social; o sujeito comentarista se posiciona sempre a partir de uma posição-sujeito que lhe é anterior.

Posicionamentos do sujeito:
"1.1 Sujeito-eco" — reproduz a formação discursiva institucional/midiática sem deslocamento (reforça o discurso jornalístico).
"1.2 Sujeito-cético" — ocupa uma posição de dúvida metódica, sem se filiar a uma formação discursiva antagônica explícita.
"1.3 Sujeito-militante" — fala nitidamente a partir de uma formação discursiva política adversária, e essa filiação organiza toda a leitura do fato.

Descrição: Categoria voltada a identificar de que lugar social e ideológico o sujeito enuncia, e não apenas se ele “concorda ou discorda”. O foco é a filiação discursiva que subjaz ao enunciado.
Indicadores analíticos: Marcas de pertencimento a um grupo (“nós”, “nosso lado”); vocabulário típico de uma matriz político-ideológica; pressupostos que só fazem sentido dentro de uma formação discursiva específica (interdiscurso).
Critérios de exclusão: Comentários sem marcas identificáveis de filiação discursiva (posição neutra ou ambígua) devem ser preenchido com valor null em vez de força-los a um dos posicionamentos do sujeito.
Exemplo: Comentário que assume, sem justificar, que “a mídia sempre protege o mesmo lado” — pressuposto que só é inteligível dentro de uma formação discursiva de desconfiança já consolidada.


Dimensão 2 — Estratégias de Legitimação (ethos discursivo e cenografia — Maingueneau)
Ideia central: para validar sua fala, o sujeito constrói um ethos (uma imagem de si que sustenta a credibilidade do que diz) e inscreve seu enunciado numa cenografia (a cena de enunciação que ele mobiliza para parecer legítimo — por exemplo, a cena do “cidadão indignado” ou do “investigador amador”).

Estratégias de Legitimação:
"2.1 Ethos de autoridade experiencial" — legitima-se pela vivência pessoal ou testemunho direto.
"2.2 Ethos de racionalidade" — constrói uma cenografia de análise política/técnica para parecer mais informado que o jornalismo.
"2.3 Ethos de indignação moral" — legitima-se pela intensidade afetiva da reação, não pelo conteúdo do argumento.

Descrição: Diferente da Categoria 2 (que mede se há argumentação), esta categoria examina que imagem de si o sujeito constrói para parecer autorizado a falar sobre a verdade — o mecanismo discursivo da legitimação, não o conteúdo do argumento em si.
Indicadores analíticos: Marcadores de primeira pessoa fundacionais (“eu vi”, “eu sei”); vocabulário técnico/institucional usado por leigos (cenografia de especialista); intensificadores afetivos como marca de autoridade moral.
Critérios de exclusão: Comentários puramente reativos, sem qualquer construção de uma imagem de si (por exemplo, uma única interjeição ou emoji), devem ser preenchido com valor null em vez de forçados em uma estratégia de legitimação.
Exemplo: Comentário que adota vocabulário de análise institucional (“é notório que os órgãos já sabiam”) para construir uma cenografia de conhecimento privilegiado.


Dimensão 3 — Regimes de Veridicção (contrato de verdade e modalização — Maingueneau/Orlandi)
Ideia central: cada enunciado pressupõe um regime de verdade — um conjunto tácito de critérios que tornam algo aceitável como verdadeiro dentro daquela cena discursiva. Não se trata de saber se o enunciado é verdadeiro, mas qual lógica de validação ele mobiliza.

Regimes de Veridicção:
"3.1 Verdade concreta" — validação por empiria/documentação.
"3.2 Verdade sentida" — validação por experiência subjetiva e crença.
"3.3 Verdade oculta" — validação por suspeição e narrativa de encobrimento.
"3.4 Verdade suspensa" — suspensão do juízo por insuficiência de provas (regime cético).
"3.5 Verdade destrutiva" — validação pela negação/aniquilação do outro, sem sustentação própria.

Descrição: Categoria-síntese que articula as três anteriores: revela a lógica de justificação subjacente ao posicionamento do sujeito, à estratégia de legitimação e à construção do outro.
Indicadores analíticos: Presença ou ausência de marcas de modalização epistêmica (“é possível que”, “certamente”, “todo mundo sabe”); vocabulário de prova vs. vocabulário de crença; estrutura argumentativa vs. estrutura de negação pura.
Critérios de exclusão: Comentários cuja lógica de validação não é identificável (por exemplo, uma frase isolada sem contexto argumentativo suficiente) devem ser preenchido com valor null em vez de forçados a um dos cinco regimes.
Exemplo: Comentário que invalida uma declaração oficial citando uma suposta comprovação não detalhada, mobilizando o regime de “verdade oculta”.

</categorias>

<perfil>${postInfo.author || ""}</perfil>
<post_texto>${postInfo.text || ""}</post_texto>
<post_subject>${postInfo.subject || ""}</post_subject>
<comentario>${text}</comentario>
`.trim();

    // 🟢 AQUI: Criada a constante prompt2 para o pedido de revisão.
    // Você pode alterar o texto conforme a sua necessidade.
    const prompt2 = `
Ótimo. Agora revise sua resposta anterior olhando para os pontos abaixo:
- Os nomes das categorias, subcategorias e demais campos devem ser escritos exatamente como estão escritos na descrição das categorias.
- Caso algum campo não seja aplicável, preencha ele com null.
- Os textos das justificativas devem estar em português.
- A resposta deve estar exatamente no formato abaixo:
{
  "categoria": umas das categorias da ETAPA 1 — ANÁLISE DE CONTEÚDO,
  "categoria-justificativa": justificativa,
  "subcategoria":  umas das subcategorias da ETAPA 1 — ANÁLISE DE CONTEÚDO,
  "subcategoria-justificativa": justificativa,
  "posicionamento-do-sujeito": caso se encaixe em um dos posicionamentos preecher com objeto no seguinte formato: { "nome": um dos posicionamentos do sujeito, "justificativa": justificativa }. Se não se encaixar em nenhum dos posicionamentos, preencher campo com null,
  "estrategias-de-legitimacao": array contendo uma ou mais estratégias de legitimação. Se não houver estratégias, preencher campo com null,
  "regime-de-veridicção": caso se encaixe em um dos regimes, preencher com objeto no seguinte formato: { "nome": um dos regimes de veridicção, "justificativa": justificativa }. Se não se encaixar em nenhum regime, preencher campo com null
}

Corrija qualquer inconsistência encontrada. 
IMPORTANTE: Retorne APENAS o JSON final da revisão, utilizando estritamente o mesmo formato solicitado no prompt anterior, sem nenhum texto adicional fora do bloco de código JSON.
    `.trim();

    try {
      // 🟢 AQUI: Passando prompt e prompt2 para a função
      const { parsed } = await processItemWithRetry(page, prompt, prompt2);

      results.push({
        post,
        post_texto: postInfo.text || "",
        assunto: postInfo.subject || "",
        perfil: postInfo.author || "",
        username,
        text,
        datetime,
        replies,
        reposts,
        likes,
        usou_palavra_chave,
        ...parsed,
      });
    } catch (err) {
      console.log(`❌ Erro no item ${post}: ${err.message}`);
      results.push({
        post,
        post_texto: postInfo.text || "",
        assunto: postInfo.subject || "",
        perfil: postInfo.author || "",
        username,
        text,
        datetime,
        erro: err.message,
        ...baseCategorias,
      });
    }

    processedSet.add(uniqueId);
    saveProgress(results);

    // Recarrega a página para limpar o histórico e garantir que o próximo item comece uma nova conversa
    await page.reload({ waitUntil: "domcontentloaded" });
    await getInput(page);
  }

  console.log("✅ PROCESSO CONCLUÍDO");
  await browser.close();
})();
