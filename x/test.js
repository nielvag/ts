const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(
    "https://x.com/i/flow/login?redirect_after_login=%2Fsearch%3Fq%3Dverdade%2520(from%253Aguganoblat)%2520until%253A2024-12-31%2520since%253A2018-01-01%26src%3Dtyped_query"
  );

  // // LOGIN NORMAL
  // await page.locator("label div").nth(3).click();
  // await page
  //   .getByRole("textbox", { name: "Celular, e-mail ou nome de" })
  //   .fill("nielsonvagno@gmail.com");
  // await page.getByRole("button", { name: "Avançar" }).click();
  // await page.getByRole("textbox", { name: "Senha Mostrar senha" }).click();
  // await page.getByRole("textbox", { name: "Senha Mostrar senha" }).click();
  // await page
  //   .getByRole("textbox", { name: "Senha Mostrar senha" })
  //   .fill("fu#QJMg_SU_e-87");
  // await page.getByTestId("LoginForm_Login_Button").click();
  // // LOGIN NORMAL FIM

  // // LOGIN ALTERNATIVO
  // await page.locator("label div").nth(3).click();
  // await page
  //   .getByRole("textbox", { name: "Celular, e-mail ou nome de" })
  //   .fill("nielsonvagno@gmail.com");
  // await page.getByRole("button", { name: "Avançar" }).click();
  // await page.getByTestId("ocfEnterTextTextInput").click();
  // await page.getByTestId("ocfEnterTextTextInput").fill("NielsonVag41078");
  // await page.getByTestId("ocfEnterTextNextButton").click();
  // await page.getByRole("textbox", { name: "Senha Mostrar senha" }).click();
  // await page
  //   .getByRole("textbox", { name: "Senha Mostrar senha" })
  //   .fill("fu#QJMg_SU_e-87");
  // await page.getByTestId("LoginForm_Login_Button").click();
  // // LOGIN ALTERNATIVO FIM

  await page.locator("label div").nth(3).click();
  await page
    .getByRole("textbox", { name: "Celular, e-mail ou nome de" })
    .fill("nielsonvagno@gmail.com");
  await page.getByRole("button", { name: "Avançar" }).click();

  const isLoginAlternative = !!(await page.getByTestId(
    "ocfEnterTextTextInput"
  ));
  if (isLoginAlternative) {
    await page.getByTestId("ocfEnterTextTextInput").click();
    await page.getByTestId("ocfEnterTextTextInput").fill("NielsonVag41078");
    await page.getByTestId("ocfEnterTextNextButton").click();
  }

  await page.getByRole("textbox", { name: "Senha Mostrar senha" }).click();
  await page
    .getByRole("textbox", { name: "Senha Mostrar senha" })
    .fill("fu#QJMg_SU_e-87");
  await page.getByTestId("LoginForm_Login_Button").click();

  //fim login

  const seenTweets = new Set();

  while (true) {
    const tweets = await page.$$("article");

    for (const tweet of tweets) {
      const textEl = await tweet.$('[data-testid="tweetText"]');
      const dateEl = await tweet.$("time");
      const linkEl = await tweet.$('a[href*="/status/"]');
      const hasVideo =
        (await tweet.$(
          '[data-testid="videoPlayer"], [data-testid="videoComponent"]'
        )) !== null;
      const hasImage = (await tweet.$('[data-testid="tweetPhoto"]')) !== null;

      const text = textEl ? (await textEl.textContent())?.trim() : null;
      const date = dateEl ? await dateEl.getAttribute("datetime") : null;
      const href = linkEl ? await linkEl.getAttribute("href") : null;
      const fullLink = href ? `https://x.com${href}` : null;

      const tweetKey = `${text}-${date}`;
      if (text && date && !seenTweets.has(tweetKey)) {
        seenTweets.add(tweetKey);

        // gerar tabela com esses dados
        console.log("Texto:", text);
        console.log("Data:", date);
        console.log("Tem mídia:", hasImage || hasVideo ? "Sim" : "Não");
        console.log("Link do tweet: ", fullLink);
      }
    }

    // Verifica se o loading (progress bar) está visível
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

    // Rola a página para forçar o carregamento de mais tweets
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(2000);
  }

  // await browser.close(); // Descomente se quiser encerrar
})();
