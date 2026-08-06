const { chromium } = require("playwright");
const fs = require("fs");
const XLSX = require("xlsx");

const POST_URL = "https://x.com/JornalOGlobo/status/1613964375408377857";

(async () => {
  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext();

  const cookies = JSON.parse(fs.readFileSync("./x/playwright-cookies.json"));

  await context.addCookies(cookies);

  const page = await context.newPage();

  await page.goto(POST_URL + "?sort_replies=recency");

  await page.waitForSelector('article[data-testid="tweet"]');

  const collected = new Map();
  let previousCount = 0;
  let sameCountTimes = 0;

  while (true) {
    const comments = await page.$$eval(
      'article[data-testid="tweet"]',
      (articles) => {
        return articles
          .slice(1)
          .map((article) => {
            const textElement = article.querySelector(
              '[data-testid="tweetText"]',
            );

            const timeElement = article.querySelector("time");

            const usernameElement = Array.from(
              article.querySelectorAll('a[href^="/"] span'),
            ).find((el) => el.innerText.startsWith("@"));

            const replyElement = article.querySelector('[data-testid="reply"]');

            const repostElement = article.querySelector(
              '[data-testid="retweet"]',
            );

            const likeElement = article.querySelector('[data-testid="like"]');

            if (!textElement || !timeElement) return null;

            const parseCount = (el) => {
              if (!el) return 0;
              const text = el.innerText.replace(/\D/g, "");
              return text ? parseInt(text) : 0;
            };

            return {
              username: usernameElement
                ? usernameElement.innerText.trim()
                : null,
              text: textElement.innerText.trim(),
              datetime: timeElement.getAttribute("datetime"),
              replies: parseCount(replyElement),
              reposts: parseCount(repostElement),
              likes: parseCount(likeElement),
            };
          })
          .filter(Boolean);
      },
    );

    comments.forEach((c) => {
      collected.set(c.datetime + c.username + c.text, c);
    });

    console.log(`Coletados até agora: ${collected.size}`);

    await page.mouse.wheel(0, 5000);

    try {
      await page.waitForSelector('[role="progressbar"]', {
        timeout: 3000,
      });

      await page.waitForSelector('[role="progressbar"]', {
        state: "detached",
        timeout: 10000,
      });
    } catch (e) {}

    await page.waitForTimeout(1500);

    if (collected.size === previousCount) {
      sameCountTimes++;
    } else {
      sameCountTimes = 0;
    }

    if (sameCountTimes >= 3) {
      console.log("🚀 Não há mais novos comentários.");
      break;
    }

    previousCount = collected.size;
  }

  const finalComments = Array.from(collected.values());

  console.log(`\nTotal final: ${finalComments.length}`);

  // ============================
  // EXPORTAR PARA EXCEL
  // ============================

  const worksheet = XLSX.utils.json_to_sheet(finalComments);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Comentarios");

  XLSX.writeFile(workbook, "./planilhas-publico/post-85.xlsx");

  console.log("📊 Planilha comentarios.xlsx criada com sucesso!");

  await browser.close();
})();
