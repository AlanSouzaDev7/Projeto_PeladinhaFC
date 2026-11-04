/* Retrospecto (últimos 5 e próximos 5) nos 20 clubes, no computador e no celular.
   Uso: servidor rodando (API ou python -m http.server 5173) e  BASE=... node tests/mobile/retrospecto.mjs */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel7", devices["Pixel 7"]]]) {
  const page = await (await browser.newContext({ ...opts, locale: "pt-BR" })).newPage();
  const errors = [], espn = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.url().includes("/schedule")) espn.push(r.url()); });
  await page.goto(`${BASE}/?estatico#/clube/flamengo`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const clubs = await page.evaluate(() => window.PD.CLUBS.map((c) => c.id));
  const bad = [];
  for (const id of clubs) {
    await page.evaluate((id) => (location.hash = `#/clube/${id}`), id);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const el = document.querySelector("[data-form]");
      return { last: el?.querySelectorAll("section:first-child .fm-row").length, next: el?.querySelectorAll("section:last-child .fm-row").length, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (!r.last || r.overflow) bad.push({ id, ...r });
  }
  for (const id of ["flamengo", "corinthians"]) {
    await page.evaluate((id) => (location.hash = `#/clube/${id}`), id);
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in", "seen")));
    // o placar ao vivo pode redesenhar a página; tenta de novo se o card for trocado no meio
    for (let k = 0; k < 3; k++) {
      try {
        const card = page.locator("[data-form]");
        await card.scrollIntoViewIfNeeded({ timeout: 4000 }); await page.waitForTimeout(400);
        await card.screenshot({ path: `${OUT}${dev}-retrospecto-${id}.png`, timeout: 4000 });
        break;
      } catch { await page.waitForTimeout(800); }
    }
  }
  console.log(dev, { problemas: bad.length ? bad : "nenhum", consultas_espn: espn.length, erros: errors });
}
await browser.close();
