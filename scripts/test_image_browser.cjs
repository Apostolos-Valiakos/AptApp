// The browser part of scripts/test_image.sh: the home page renders with its
// header buttons and hero, and an admin can log in and reach the calendar.
// Run by that script (BASE, CHROME_PATH set; user image_test_admin made there).
const puppeteer = require("puppeteer-core");

const BASE = process.env.BASE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ["--no-sandbox"],
  });
  let ok = true;
  const check = (name, result, extra = "") => {
    console.log(`   ${result ? "ok  " : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
    if (!result) ok = false;
  };
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewport({ width: 1500, height: 900 });

    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    await sleep(3000);
    const home = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll("#header-right > *")]
        .filter((e) => getComputedStyle(e).display !== "none")
        .map((e) => e.id),
      login: document.querySelector("#header-right-talk-btn")?.getAttribute("href"),
      canvas: !!document.querySelector("canvas"),
    }));
    check(
      "home page header: Είσοδος, EN, call, menu",
      home.buttons.join(",") === "header-right-talk-btn,header-lang-btn,header-book-btn,header-right-menu-btn",
      home.buttons.join(","),
    );
    check("Είσοδος leads to the app's login", home.login === "/login");
    check("the hero's 3D scene is drawn", home.canvas);
    check("no script errors on the home page", errors.length === 0, errors.slice(0, 2).join(" | "));

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("input[type=password]");
    const [username] = await page.$$("form input");
    await username.type("image_test_admin");
    await page.type("input[type=password]", "image-test-pass");
    await page.click("button[type=submit]");
    await page.waitForSelector(".fc-timegrid", { timeout: 60000 });
    check("an admin logs in and sees the calendar", new URL(page.url()).pathname === "/app/scheduler");
    check("no script errors in the app", errors.length === 0, errors.slice(0, 2).join(" | "));
  } catch (e) {
    check("browser run", false, e.message);
  } finally {
    await browser.close();
  }
  process.exit(ok ? 0 : 1);
})();
