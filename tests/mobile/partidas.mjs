/* Aba Partidas (temporada inteira) nos 20 clubes, no computador e no celular.
   Uso: servidor rodando e  BASE=... node tests/mobile/partidas.mjs */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel7", devices["Pixel 7"]]]) {
  const page = await (await browser.newContext({ ...opts, locale: "pt-BR" })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/?estatico#/clube/flamengo/partidas`, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const clubs = await page.evaluate(() => window.PD.CLUBS.map((c) => c.id));
  const rows = {}, bad = [];
  for (const id of clubs) {
    await page.evaluate((id) => (location.hash = `#/clube/${id}/partidas`), id);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      jogos: document.querySelectorAll(".hm-row").length, feitos: document.querySelectorAll(".hm-row.post").length,
      adefinir: document.querySelectorAll(".hm-time.tbd").length, overflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    rows[id] = `${r.feitos}/${r.jogos} (${r.adefinir} a definir)`;
    if (!r.jogos || r.overflow) bad.push({ id, ...r });
  }
  // filtro por competição e "ir para o próximo jogo"
  await page.evaluate(() => (location.hash = "#/clube/flamengo/partidas"));
  await page.waitForTimeout(2500);
  const filtro = await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-hist-filter]")].find((x) => x.dataset.histFilter === "Libertadores");
    b?.click();
    const n = document.querySelectorAll(".hm-row").length;
    [...document.querySelectorAll("[data-hist-filter]")].find((x) => x.dataset.histFilter === "Todas")?.click();
    return n;
  });
  await page.screenshot({ path: `${OUT}${dev}-partidas-topo.png` });
  await page.evaluate(() => document.querySelector("[data-hist-next]")?.click());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}${dev}-partidas-proximos.png` });
  console.log(dev, { problemas: bad.length ? bad : "nenhum", libertadores_flamengo: filtro, erros: errors });
  if (dev === "pc") console.log(rows);
}
await browser.close();
