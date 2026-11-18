/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* 433Fut 2.0 — confere o conteúdo do app (app/www) num Android emulado, antes de compilar o APK:
   marca 433Fut, camada nativa ligada, dados atualizados vindos do endereço publicado (dados/*.json) e as páginas
   principais (inclusive campinho tático e escalações) sem erro de JavaScript.
   Uso: (cd app && node montar-www.mjs) && python -m http.server 5180 -d app/www  e  APP_BASE=http://127.0.0.1:5180 node tests/app-www.mjs */
import { chromium, devices } from "playwright";

const BASE = process.env.APP_BASE || "http://127.0.0.1:5180";
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ ...devices["Pixel 7"] });
const p = await ctx.newPage();
const js = [];
p.on("pageerror", (e) => js.push(String(e.message)));
const remotos = [];
p.on("response", (r) => { if (/alansouzadev7\.github\.io\/.*\/dados\//.test(r.url())) remotos.push(r.status()); });
await p.goto(`${BASE}/#/`, { waitUntil: "load" });
await p.waitForTimeout(3500);
const marca = await p.evaluate(() => ({ app: document.documentElement.classList.contains("app-nativo"), titulo: document.title, logo: document.querySelector(".l433-word")?.textContent, nativo: !!window.PLACAR_APP }));
ok(marca.app && marca.nativo, "camada nativa ligada (classe app-nativo, PLACAR_APP)");
ok(/433Fut/.test(marca.titulo) && /433Fut/.test(marca.logo || ""), `marca 433Fut no app (${marca.logo})`);
ok(remotos.length > 0 && remotos.every((s) => s === 200), `dados atualizados lidos do endereço publicado (${remotos.length} arquivos, ${[...new Set(remotos)].join("/")})`);
for (const rota of ["#/clubes", "#/tabela", "#/clube/cruzeiro", "#/clube/cruzeiro/escalacoes", "#/jogador/216098-cruzeiro", "#/clube/flamengo/mercado/elenco", "#/simulador", "#/copa/libertadores", "#/privacidade"]) {
  await p.evaluate((r) => (location.hash = r), rota);
  await p.waitForTimeout(1800);
  const v = await p.evaluate(() => ({ imp: /Impedimento/.test(document.querySelector("#view").innerText), n: document.querySelector("#view").innerText.length, vaza: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  ok(!v.imp && v.n > 200, `${rota} abre no app`);
  ok(v.vaza <= 1, `${rota} sem rolagem para o lado (${v.vaza}px)`);
}
ok(!js.length, `sem erros de JavaScript${js.length ? `: ${js[0]}` : ""}`);
await b.close();
if (erros.length) { console.log(`\n${erros.length} falha(s):\n- ${erros.join("\n- ")}`); process.exit(1); }
console.log("\nConteúdo do app 433Fut 2.0 conferido.");
