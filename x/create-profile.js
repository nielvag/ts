import { chromium } from "playwright";
import path from "path";

(async () => {
  const userDataDir = path.join(process.cwd(), "chrome-profile");

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
  });

  const page = await context.newPage();
  await page.goto("https://x.com/login");
})();
