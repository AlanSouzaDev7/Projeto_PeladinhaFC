/* Estatísticas do elenco: confere o card da visão geral e a aba nos 20 clubes (computador e celular).
   Uso: npm run api (em outro terminal) e depois  node tests/mobile/estatisticas.mjs */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:8000";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
const report = [];
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel7", devices["Pixel 7"]]]) {
  const page = await (await browser.newContext({ ...opts, locale: "pt-BR" })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/?estatico#/clube/flamengo`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const clubs = await page.evaluate(() => window.PD.CLUBS.map((c) => c.id));
  for (const id of clubs) {
    await page.evaluate((id) => (location.hash = `#/clube/${id}`), id);
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const ps = document.querySelector(".pstats");
      return { card: !!ps, blocks: ps ? ps.querySelectorAll(".ps-b").length : 0, rows: ps ? ps.querySelectorAll("li:not(.ps-empty)").length : 0, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    report.push({ dev, id, ...r });
  }
  for (const id of ["flamengo", "corinthians"]) {
    await page.evaluate((id) => (location.hash = `#/clube/${id}`), id);
    await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in", "seen")); document.querySelectorAll(".ps-bar i[data-w]").forEach((i) => (i.style.width = i.dataset.w + "%")); });
    const card = page.locator(".pstats").first().locator("xpath=..");
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await card.screenshot({ path: `${OUT}${dev}-estatisticas-${id}.png` });
  }
  await page.evaluate(() => (location.hash = "#/clube/flamengo/estatisticas"));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}${dev}-aba-estatisticas.png`, fullPage: true });
  report.push({ dev, errors });
}
const bad = report.filter((r) => r.id && (!r.card || r.blocks !== 4 || r.overflow));
console.log("clubes sem card ou com problema:", bad.length ? bad : "nenhum");
console.log("linhas por clube (pc):", Object.fromEntries(report.filter((r) => r.dev === "pc" && r.id).map((r) => [r.id, r.rows])));
console.log("erros:", report.filter((r) => r.errors).map((r) => [r.dev, r.errors]));
await browser.close();
