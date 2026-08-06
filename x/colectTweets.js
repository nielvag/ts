const { chromium } = require("playwright");
const xlsx = require("xlsx"); // npm install xlsx
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(
    "https://x.com/search?q=veracidade%20(from%3Arosedbarros)%20until%3A2024-12-31%20since%3A2018-01-01&src=typed_query",
  );

  await page.locator("label div").nth(3).click();
  await page
    .getByRole("textbox", { name: "Celular, e-mail ou nome de" })
    .fill("nielsonvagno@gmail.com");
  await page.getByRole("button", { name: "Avançar" }).click();

  const isLoginAlternative = !!(await page.getByTestId(
    "ocfEnterTextTextInput",
  ));
  console.log("isLoginAlternative: ", isLoginAlternative);
  if (isLoginAlternative) {
    const a = await page.getByTestId("ocfEnterTextTextInput");
    console.log("a: ", a);
    await page.getByTestId("ocfEnterTextTextInput").fill("NielsonVag41078");
    await page.getByTestId("ocfEnterTextNextButton").click();
  }

  await page.getByRole("textbox", { name: "Senha Mostrar senha" }).click();
  await page
    .getByRole("textbox", { name: "Senha Mostrar senha" })
    .fill("fu#QJMg_SU_e-87");
  await page.getByTestId("LoginForm_Login_Button").click();

  //fim login

  // Coleta de tweets
  const seenTweets = new Set();
  const tweetData = [];

  let attemptsWithoutNewTweets = 0;
  const maxAttempts = 5;

  while (true) {
    const tweets = await page.$$("article");
    let newTweetsFound = false;

    for (const tweet of tweets) {
      const textEl = await tweet.$('[data-testid="tweetText"]');
      const dateEl = await tweet.$("time");
      const linkEl = await tweet.$('a[href*="/status/"]');
      const hasVideo =
        (await tweet.$(
          '[data-testid="videoPlayer"], [data-testid="videoComponent"]',
        )) !== null;
      const hasImage = (await tweet.$('[data-testid="tweetPhoto"]')) !== null;

      const text = textEl ? (await textEl.textContent())?.trim() : null;
      const date = dateEl ? await dateEl.getAttribute("datetime") : null;
      const href = linkEl ? await linkEl.getAttribute("href") : null;
      const fullLink = href ? `https://x.com${href}` : null;

      const tweetKey = `${text}-${date}`;
      if (text && date && !seenTweets.has(tweetKey)) {
        seenTweets.add(tweetKey);
        newTweetsFound = true;

        tweetData.push({
          Texto: text,
          Data: date,
          "Tem mídia": hasImage || hasVideo ? "Sim" : "Não",
          Link: fullLink,
        });

        console.log("===============");
        console.log("Texto:", text);
        console.log("Data:", date);
        console.log("Tem mídia:", hasImage || hasVideo ? "Sim" : "Não");
        console.log("Link:", fullLink);
      }
    }

    const loading = await page.$('div[role="progressbar"]');
    if (loading) {
      console.log("🔄 Carregando mais tweets...");
      await page
        .waitForSelector('div[role="progressbar"]', {
          state: "detached",
          timeout: 10000,
        })
        .catch(() => {});
    }

    if (!newTweetsFound) {
      attemptsWithoutNewTweets++;
    } else {
      attemptsWithoutNewTweets = 0;
    }

    if (attemptsWithoutNewTweets >= maxAttempts) {
      console.log("✅ Nenhum novo tweet encontrado. Finalizando.");
      break;
    }

    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(2000);
  }

  // 📁 Geração do arquivo Excel
  const worksheet = xlsx.utils.json_to_sheet(tweetData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Tweets");
  xlsx.writeFile(workbook, "tweets_extraidos.xlsx");

  console.log("📄 Arquivo 'tweets_extraidos.xlsx' gerado com sucesso.");
  await browser.close();
})();
