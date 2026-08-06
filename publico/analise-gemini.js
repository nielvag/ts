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

const avatarCompletedSelector =
  '[data-test-lottie-animation-status="completed"]';

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

async function countCompleted(page) {
  return await page.locator(avatarCompletedSelector).count();
}

async function waitGeminiFinish(page, before, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const count = await page.locator(avatarCompletedSelector).count();
    if (count > before) return;
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
      let parsed = JSON.parse(raw);
      return { raw, parsed };
    } catch (err) {
      lastError = err;
      console.log(`🔄 Tentativa ${attempt} falhou, recarregando...`);
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
    "analise-conteudo": null,
    "posicionamento-do-sujeito": null,
    "estrategias-de-legitimacao": null,
    "construção-do-outro": null,
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
FORMATO DE RESPOSTA (JSON APENAS)
--------------------------------------------------
{
  "analise-conteudo": { "categoria": "", "justificativa": "" },
  "posicionamento-do-sujeito": { "categoria": "", "justificativa": "" },
  "estrategias-de-legitimacao": { "categoria": "", "justificativa": "" },
  "construção-do-outro": { "categoria": "", "justificativa": "" },
  "regime-de-veridicção": { "categoria": "", "justificativa": "" }
}

<categorias>
--------------------------------------------------
ETAPA 1 — ANÁLISE DE CONTEÚDO
--------------------------------------------------

Classifique o comentário em apenas UMA das categorias abaixo:

1.1 VALIDAÇÃO DO CONTEÚDO JORNALÍSTICO
→ O comentário concorda com a informação, reforça sua veracidade ou demonstra confiança no jornal ou no conteúdo.

1.2 CONTESTAÇÃO E DISPUTA DA INTERPRETAÇÃO
→ O comentário questiona, pede prova ou apresenta outra versão dos fatos, sem linguagem agressiva, irônica ou ofensiva.

1.3 DESLEGITIMAÇÃO, IRONIA E CONFLITO
→ O comentário ataca o jornal ou o conteúdo, utiliza ironia, sarcasmo, deboche ou linguagem ofensiva, ou desacredita a imprensa.

--------------------------------------------------
ETAPA 2 — ANÁLISE DISCURSIVA
--------------------------------------------------

Após classificar, analise o comentário nas seguintes dimensões:

2.1 POSICIONAMENTO DO SUJEITO
Aqui o sujeito reconhece a verdade jornalística, mas pode fazer isso a partir de diferentes posições.
2.1.1 Sujeito apoiador do jornalismo: Defende o jornal e reforça credibilidade. (Relação com a verdade: institucional reconhecida).
2.1.2 Sujeito alinhado ideologicamente: Concorda porque a notícia confirma sua visão. (Relação com a verdade: confirmação de crença).
2.1.3 Sujeito que usa o jornal como prova: Usa a matéria para comentar, acusar ou responsabilizar terceiros. (Relação com a verdade: evidência para disputa externa).
2.1.4 Sujeito pedagógico (reprodutor): Explica ou reafirma a informação. (Relação com a verdade: algo a ser disseminado).

Aqui o sujeito não aceita a versão jornalística, mas disputa dentro de uma lógica argumentativa.
2.1.5 Sujeito cético: Questiona a informação. (Verdade como: algo incerto ou não comprovado).
2.1.6 Sujeito investigador: Exige prova, dados, explicações. (Verdade como: resultado de evidência).
2.1.7 Sujeito testemunha: Usa experiência pessoal ou local. (Verdade como: experiência vivida).
2.1.8 Sujeito contra-narrador: Apresenta outra versão dos fatos. (Verdade como: versão alternativa).
2.1.9 Sujeito que desloca autoridade: Usa outras fontes, especialistas ou dados externos. (Verdade como: delegada a outra autoridade).

Aqui o sujeito não disputa apenas a informação — ele ataca o próprio sistema de verdade.
2.1.10 Sujeito irônico: Usa sarcasmo, deboche ou meme. (Verdade como: objeto de ridicularização).
2.1.11 Sujeito indignado: Reação emocional forte, julgamento moral. (Verdade como: questão moral).
2.1.12 Sujeito militante: Atua em lógica de confronto político ("nós x eles"), palavras de ordem. (Verdade como: arma política).
2.1.13 Sujeito desqualificador: Ridiculariza o jornal, acusa a imprensa de mentir ou manipular. Usa apelidos pejorativos. (Verdade como: ocultada/manipulada pelo jornalismo).



2.2 ESTRATÉGIAS DE LEGITIMAÇÃO
→ Como o comentário sustenta sua versão da verdade?
  2.2.1 Experiência pessoal: O usuário utiliza um relato próprio ou do seu entorno imediato para sustentar sua versão (ex: "Aqui na minha rua está um silêncio total, não teve panelaço").
  2.2.2 Consenso social: Baseia-se na ideia de que a sua visão reflete a vontade da maioria ou que "todo mundo sabe" que aquilo é o certo (ex: "A maioria quer que eles sejam punidos").
  2.2.3 Autoridade externa: O comentário cita fontes de fora (documentos, outros políticos, textos religiosos, outros portais) para dar suporte ao argumento (ex: "O governador já isentou o presidente", "2 Crônicas 7:14").
  2.2.4 Rejeição da mídia: Sustenta a própria versão descredibilizando diretamente o veículo de imprensa, o jornalista ou a veracidade da notícia, classificando-a como falsa ou tendenciosa (ex: "Fake news", "Jornalismo militante", "A mídia esconde a verdade").
  2.2.5 Redirecionamento de culpa: A estratégia de isentar o alvo principal da notícia (geralmente o Presidente ou o Governo Federal) transferindo a responsabilidade do problema para terceiros, como Governadores, Prefeitos, STF, Congresso ou gestões anteriores (ex: "A culpa é do governador que roubou a verba").
  2.2.6 Desqualificação do oponente: Validação do próprio ponto de vista através do ataque pessoal, xingamentos e ofensas aos manifestantes, opositores ou políticos rivais, invalidando a posição deles (ex: "Meia dúzia de esquerdistas maconheiros").
  2.2.7 Minimização do evento: Reduz propositalmente a importância, o tamanho ou a escala do fato noticiado para invalidar sua força (ex: "Contei 3 panelas", "Só uns gatos pingados").
  2.2.8 Sarcasmo / Ironia: Uso do deboche, piadas e tom jocoso para descredibilizar a notícia, o protesto ou a situação de forma indireta, sem necessariamente usar argumentos lógicos (ex: "Será que usaram o vibrador para fazer o panelaço?", "Faz o L").
  2.2.9 Apelo à moralidade: Desqualifica o protesto ou a notícia indicando que as pessoas deveriam estar focadas em algo moralmente superior, "útil" ou "ordeiro" (ex: "Ao invés de bater panela, façam uma vaquinha ou vão orar", "Cadê a ordem e progresso?").
  2.2.10 Atribuição de intenções ocultas: Alega que o evento, a investigação ou a notícia noticiada não é genuína, mas sim uma manobra política dissimulada, uma conspiração ou perseguição para calar a oposição (ex: "Na verdade eles querem mobilizar contra o presidente", "Inquérito de cartas marcadas").
  2.2.11 Afirmação dogmática: Uso de termos absolutistas (como "a verdade é que...") para tentar validar uma opinião como um fato inquestionável, blindando o comentário contra debates e não apresentando fontes concretas (ex: "A verdade logo vai aparecer e todos vão ver", "A verdade é que ia ganhar no 1º turno se não fosse fraude").
  2.2.12 Análise política: O usuário legitima sua indignação ou apoio construindo um argumento baseado em leitura do cenário político, avaliando o xadrez eleitoral, gestão de crise ou o funcionamento das instituições (ex: "As instituições se desviaram do seu papel constitucional", "O congresso vai agir agora").



2.3 CONSTRUÇÃO DO OUTRO
→ Há identificação de um adversário ou aliado?
  2.3.1 Imprensa: O "outro" (geralmente como adversário) é a mídia tradicional, emissoras de TV, jornais ou jornalistas específicos. São frequentemente acusados de espalhar "fake news", de serem parciais, militantes ou de fazerem sensacionalismo.
  2.3.2 Governo (Federal): O alvo de críticas ou defesas é o Presidente da República, seus ministros (como Pazuello ou Flávio Dino) ou a gestão federal como um todo.
  2.3.3 Comportamento nós versus eles: A construção foca na polarização política de forma mais ampla e abstrata (ex: "esquerda vs. direita", "comunistas vs. conservadores", "petistas vs. bolsonaristas"). O usuário agrupa os adversários em um bloco ideológico rival para atacá-los.
  2.3.4 STF / Judiciário: O adversário identificado é o Supremo Tribunal Federal, o TSE ou ministros específicos (principalmente Alexandre de Moraes ou Gilmar Mendes). São frequentemente acusados pelos usuários de autoritarismo, ditadura da toga, perseguição política ou de proteger corruptos.
  2.3.5 Governadores / Prefeitos: A narrativa isenta o governo federal e elege os gestores estaduais e municipais como os verdadeiros vilões. São comumente acusados de corrupção, desvio de verbas da saúde ou de quebrarem a economia com restrições (muito presente nas postagens sobre Manaus).
  2.3.6 Manifestantes / Opositores: O "outro" é o cidadão comum que está do lado oposto do espectro político ou participando de um ato. Pode ser o grupo que bate panela (desqualificados como "maconheiros" ou "esquerdistas") ou o grupo que invade prédios públicos (desqualificados como "terroristas", "vândalos" ou defendidos como "patriotas injustiçados").
  2.3.7 Forças armadas / Segurança: A identificação recai sobre a Polícia Militar, o Exército ou instituições de inteligência. Podem aparecer como aliados heroicos ("a PM salvou a democracia") ou como adversários frouxos e coniventes ("o Exército entregou os patriotas").
  2.3.8 Comunidade internacional / Estrangeiros: O alvo de ataque, cobrança ou elogio ultrapassa as fronteiras do Brasil, envolvendo outros países, governantes estrangeiros ou organizações globais (ex: culpar a China pelo vírus, agradecer à Venezuela pelo oxigênio, criticar a OMS).
  2.3.9 Políticos do Legislativo: O adversário ou aliado é o Congresso Nacional, o Senado, a Câmara ou deputados e senadores específicos (como Rodrigo Maia ou Arthur Lira). Geralmente aparecem em comentários cobrando atitudes (como a abertura de um impeachment) ou criticando a omissão e a corrupção ("só pensam em fundão").
  2.3.10 Profissionais de saúde / Ciência: O comentário elege como alvo ou aliado as instituições médicas, a ciência, o SUS ou médicos individuais. Aparece muito nos debates sobre vacina e cloroquina (ex: elogiar os enfermeiros do SUS, criticar médicos charlatões ou atacar a omissão do Conselho Federal de Medicina).




2.4 REGIME DE VERIDICÇÃO
→ Como a verdade é apresentada?
    2.4.1 Validação por Desqualificação e Conflito (A Verdade Destrutiva): Neste grupo, a "verdade" do usuário não é construída com argumentos próprios, mas sim pela destruição da premissa, do interlocutor ou da fonte original. A lógica é: "o meu lado é o certo porque o outro lado não tem credibilidade/valor".
    2.4.2 Validação por Especulação e Narrativas Ocultas (A Verdade Oculta/Alternativa): Neste grupo, a "verdade" não é o fato visível que está sendo noticiado. A verdade verdadeira está escondida nos bastidores, pertence ao futuro ou faz parte de um plano maior. A lógica é afastar-se do fato concreto para olhar "o que está por trás".
    2.4.3 Validação por Empiria e Autoridade (A Verdade Concreta): Neste grupo, o usuário tenta ancorar sua afirmação em algo que seja visto como sólido, irrefutável ou objetivo. A lógica é: "isso é verdade porque eu vi" ou "porque as regras/ciência dizem que é".
    2.4.4 Validação Subjetiva e Afetiva (A Verdade Sentida/Crida): Neste grupo, o argumento abandona a lógica racional ou os fatos frios para se apoiar na moralidade, no sofrimento, na crença ou no julgamento pessoal. A lógica é: "isso é verdade porque é o certo a se sentir/crer".
    2.4.5 Ceticismo e Condicionamento (A Verdade Suspensa): Neste grupo, a verdade apresentada no post não é aceita nem negada imediatamente; ela é colocada em suspensão. A lógica é: "não aceito essa verdade até que me convençam do contrário com provas".
</categorias>


<perfil>${postInfo.author || ""}</perfil>
<post_texto>${postInfo.text || ""}</post_texto>
<post_subject>${postInfo.subject || ""}</post_subject>
<comentario>${text}</comentario>
`.trim();

    try {
      const { parsed } = await processItemWithRetry(page, prompt);

      results.push({
        post,
        post_texto: postInfo.text || "", // 🟢 AQUI: Texto original do post
        assunto: postInfo.subject || "",
        perfil: postInfo.author || "",
        username,
        text,
        datetime,
        replies,
        reposts,
        likes,
        usou_palavra_chave,
        ...(parsed || baseCategorias),
      });
    } catch (err) {
      console.log(`❌ Erro no item ${post}: ${err.message}`);
      results.push({
        post,
        post_texto: postInfo.text || "", // 🟢 AQUI: Texto original do post também salvo no caso de erro
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await getInput(page);
  }

  console.log("✅ PROCESSO CONCLUÍDO");
  await browser.close();
})();
