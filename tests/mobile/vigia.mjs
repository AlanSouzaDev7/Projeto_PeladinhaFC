/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. */
/* Vigia: reproduz a aba aberta desde a noite anterior. O arquivo gravado chega "de ontem", com um jogo ao vivo aos 63'
   e outro ainda sem placar, mas os dois já terminaram. O site tem de perceber sozinho e mostrar o resultado final.
   1) ao abrir: o vigia consulta a ESPN e encerra os dois jogos;
   2) com a ESPN fora do ar: relê o arquivo publicado pelo robô (versão nova) e corrige do mesmo jeito.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/vigia.mjs */
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const src = fs.readFileSync(new URL("../../js/live-data.js", import.meta.url), "utf8");
const real = JSON.parse(src.slice(src.indexOf("= ") + 2).trim().replace(/;$/, ""));

// o primeiro jogo encerrado há mais de 3 h vira "ao vivo, 63'" e o seguinte vira "a disputar", num arquivo "de 14 h atrás"
const kick = (g) => new Date(`${g[4]}T${g[5]}:00-03:00`).getTime();
const fim = Object.values(real.fixtures).flat().filter((g) => g[5] && g[8]?.state === "post" && Date.now() - kick(g) > 3 * 3600e3 && Date.now() - kick(g) < 3 * 864e5)
  .sort((a, b) => kick(b) - kick(a));
if (fim.length < 2) { console.log("sem dois jogos encerrados nos últimos 3 dias para simular; nada a testar"); process.exit(0); }
const [A, B] = fim;
const velho = JSON.parse(JSON.stringify(real));
const pt = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
velho.updated = pt(new Date(Date.now() - 14 * 3600e3));
for (const g of Object.values(velho.fixtures).flat()) {
  if (g[0] === A[0] && g[1] === A[1]) { g[2] = Math.max(0, A[2] - 1); g[3] = A[3]; g[8] = { state: "in", clock: "63'", detail: "63'", live: true, gols: [] }; }
  if (g[0] === B[0] && g[1] === B[1]) { g[2] = g[3] = null; g[8] = { state: "pre", clock: "0'", detail: "Scheduled", gols: [] }; }
}
const velhoJS = `window.LIVE_DATA = ${JSON.stringify(velho)};\n`;
const ver = (p) => p.evaluate(([a, b]) => {
  const all = Object.values(window.PD.FIXTURES).flat(), f = (x) => all.find((g) => g[0] === x[0] && g[1] === x[1]);
  return { a: f(a).slice(2, 4).concat(f(a)[8]?.state), b: f(b).slice(2, 4).concat(f(b)[8]?.state), vigia: window.PD.vigia };
}, [A, B]);

let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "FALHA"} · ${msg}`); if (!c) falhas++; };
const b = await chromium.launch({ channel: "chrome" });
for (const espnFora of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  let leituras = 0;
  // a leitura do arquivo é a "de ontem"; com a ESPN fora, a releitura (?v=) traz a versão publicada
  await p.route(/\/js\/live-data\.js(\?.*)?$/, (r) => { leituras++; return espnFora && new URL(r.request().url()).search ? r.fulfill({ contentType: "text/javascript", body: src }) : r.fulfill({ contentType: "text/javascript", body: velhoJS }); });
  if (espnFora) await p.route(/espn\.com/, (r) => r.abort());
  await p.goto(`${BASE}/?v=${Date.now()}#/`, { waitUntil: "load" });
  for (let i = 0; i < 40 && !(await p.evaluate(() => window.PD?.vigia?.rodadas > 0)); i++) await p.waitForTimeout(500);   // waitForFunction é barrado pela CSP
  await p.waitForTimeout(2500);
  const r = await ver(p);
  const nome = espnFora ? "ESPN fora: relê o arquivo publicado" : "ESPN no ar";
  ok(r.a[2] === "post" && r.a[0] === A[2] && r.a[1] === A[3], `${nome} · ${A[0]} x ${A[1]} parado aos 63' → ${r.a.join(" ")} (esperado ${A[2]} ${A[3]} post)`);
  ok(r.b[2] === "post" && r.b[0] === B[2] && r.b[1] === B[3], `${nome} · ${B[0]} x ${B[1]} sem placar → ${r.b.join(" ")} (esperado ${B[2]} ${B[3]} post)`);
  if (espnFora) ok(leituras >= 2, `arquivo relido (${leituras} leituras)`);
  // e a tela mostra "Fim", não "Ao vivo"
  const tela = await p.evaluate((id) => document.querySelector(`[data-match*="${id}"] .time`)?.textContent || document.body.innerText.includes("63'"), A[7]);
  ok(typeof tela !== "string" || !/vivo|63/i.test(tela), `${nome} · na tela: ${typeof tela === "string" ? tela.trim() : "sem 63' na página"}`);
  await ctx.close();
}
await b.close();
console.log(falhas ? `\n${falhas} falha(s)` : "\nVigia corrigiu os jogos parados no tempo.");
process.exit(falhas ? 1 : 0);
