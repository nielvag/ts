const fs = require("fs");

(async () => {
  const cookies = JSON.parse(
    fs.readFileSync(
      "/Users/nielsonvagno/Documents/tese - cópia/planilhas-colunista/cookies.json",
    ),
  );

  const playwrightCookies = cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expirationDate ? cookie.expirationDate : -1,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite:
      cookie.sameSite === "no_restriction"
        ? "None"
        : cookie.sameSite === "lax"
          ? "Lax"
          : "Strict",
  }));

  fs.writeFileSync(
    "./planilhas-colunista/playwright-cookies.json",
    JSON.stringify(playwrightCookies, null, 2),
  );

  console.log("✅ Cookies convertidos para playwright-cookies.json");
})();
