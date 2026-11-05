/* "Últimas notícias" na página de cada clube: só manchetes que falam do clube (nome ou apelido no título,
   sem "ex-Clube"). Abre os 20 clubes no PC e no celular e confere cada manchete mostrada.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/noticias.mjs */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const CFG = JSON.parse(readFileSync(new URL("../../server/config.json", import.meta.url)));
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fala = (cid, t) => (CFG.clubes[cid].apelidos || [CFG.clubes[cid].busca]).some((n) => new RegExp(`(?<![\\wÀ-ÿ])${esc(n)}(?![\\wÀ-ÿ])`).test(t) && !new RegExp(`ex-${esc(n)}`, "i").test(t));
const b = await chromium.launch({ channel: "chrome" });
const erros = [], total = {};
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel", devices["Pixel 7"]]]) {
  const p = await (await b.newContext(opts)).newPage();
  for (const cid of Object.keys(CFG.clubes)) {
    await p.goto(`${BASE}/?n=${Date.now()}#/clube/${cid}`, { waitUntil: "load" });
    const card = p.locator("[data-news]");
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(700);
    const t = await p.evaluate(() => [...document.querySelectorAll("[data-news] li a b")].map((e) => e.textContent));
    total[`${dev} ${cid}`] = t.length;
    if (!t.length) erros.push(`${dev} ${cid}: nenhuma notícia`);
    t.filter((x) => !fala(cid, x)).forEach((x) => erros.push(`${dev} ${cid}: "${x}"`));
  }
  await p.context().close();
}
console.log(Object.entries(total).map(([k, v]) => `${k}:${v}`).join("  "));
console.log(erros.length ? "\nFORA DO CLUBE:\n" + erros.join("\n") : "\nnotícias só do clube nas 20 páginas (PC e celular)");
await b.close();
