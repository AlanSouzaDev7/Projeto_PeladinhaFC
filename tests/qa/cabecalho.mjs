/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Cabeçalho em 8 larguras (320 a 1024 px, Chrome e WebKit): logotipo, busca, conta e tema sem sobrepor nem sair da tela;
   a busca abre com um toque (também na lupa) e encontra resultados. Uso: BASE=http://localhost:5173 node tests/qa/cabecalho.mjs */
import { chromium, webkit } from "playwright";
const BASE = process.env.BASE || "http://localhost:5173";
let falhas = 0;
for (const [m, w, h] of [["chrome", 320, 568], ["chrome", 344, 882], ["chrome", 360, 640], ["webkit", 375, 667], ["webkit", 390, 844], ["chrome", 412, 915], ["chrome", 1024, 768], ["webkit", 1024, 1366]]) {
  const b = m === "webkit" ? await webkit.launch() : await chromium.launch({ channel: "chrome" });
  const p = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  await p.goto(`${BASE}/?estatico#/`, { waitUntil: "load" }); await p.waitForTimeout(1200);
  const q = () => p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.right), Math.round(b.width), Math.round(b.height)]; };
    const els = [".header .logo", ".header .search", ".conta-btn", "#theme"].map(r).filter(Boolean);
    const sobrepoe = els.some((a, i) => els.some((c, j) => j > i && a[1] > c[0] + 1));
    return { logo: r(".header .logo"), busca: r(".header .search"), conta: r(".conta-btn"), tema: r("#theme"), vw: document.documentElement.clientWidth, sobrepoe }; });
  const a = await q();
  await p.locator("#search").tap().catch(() => p.locator("#search").click());
  await p.keyboard.type("palm"); await p.waitForTimeout(600);
  const ab = await p.evaluate(() => { const b = document.querySelector(".header .search").getBoundingClientRect(); return { busca: [Math.round(b.x), Math.round(b.right)], foco: document.activeElement?.id, resultados: document.querySelectorAll("#search-results a").length }; });
  console.log(`${m} ${w}x${h}`, JSON.stringify(a), "| aberta:", JSON.stringify(ab), (a.sobrepoe || (a.tema && a.tema[1] > a.vw) || ab.foco !== "search" || !ab.resultados) ? (falhas++, "PROBLEMA") : "ok");
  await b.close();
}
if (falhas) { console.log(`${falhas} largura(s) com problema`); process.exit(1); }
console.log("cabeçalho ok nas 8 larguras");
