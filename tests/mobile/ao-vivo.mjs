/* Placar ao vivo sem a API (como no GitHub Pages): o navegador consulta a ESPN direto.
   Uso: python -m http.server 5173  e depois  BASE=http://localhost:5173 node tests/mobile/ao-vivo.mjs */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ ...devices["Pixel 7"], locale: "pt-BR" })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const espn = [];
page.on("request", (r) => { if (r.url().includes("espn.com")) espn.push(r.url()); });
await page.goto(`${BASE}/?estatico#/`, { waitUntil: "load" });
await page.waitForTimeout(6000);
const read = () => page.evaluate(() => {
  const g = (window.PD.FIXTURES[window.PD.ROUND] || []).filter((x) => x[8]);
  return { api: !!window.PD.LIVE, fixtures: g.map((x) => `${x[0]} ${x[2]}x${x[3]} ${x[1]} · ${x[8].state} ${x[8].clock || ""}`),
    ui: [...document.querySelectorAll(".match")].map((el) => el.innerText.replace(/\s+/g, " ").trim()).filter((t) => /Inter|Chape/.test(t)) };
});
console.log("1ª leitura", await read());
await page.screenshot({ path: `${OUT}pixel7-ao-vivo.png` });
const id = await page.evaluate(() => (window.PD.FIXTURES[window.PD.ROUND] || []).find((x) => x[8]?.state === "in"));
if (id) {
  await page.evaluate((g) => (location.hash = `#/partida/${g[0]}-x-${g[1]}-r${window.PD.ROUND}`), id);
  await page.waitForTimeout(25000);
  console.log("página da partida, 25 s depois:", await page.evaluate(() => document.querySelector(".match-hero .scoreline")?.innerText.replace(/\s+/g, " ")));
  await page.screenshot({ path: `${OUT}pixel7-partida-ao-vivo.png` });
}
console.log("consultas à ESPN:", espn.length, "erros:", errors);
await browser.close();
