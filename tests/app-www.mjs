/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* CazéStats.TV (app Android) — confere o app antes de compilar o APK.
   Desde a versão 3 o APK só leva a casca (app/www: index.html, página de "sem conexão" e versao.json) e abre o site
   publicado; a camada nativa do site liga pelo user agent "CazeStatsApp/<versão>" (js/app-nativo.js). Aqui:
   1. app/www montado por app/montar-www.mjs: os arquivos da casca, a versão igual à do package.json e o endereço do site;
   2. o site num Android emulado com o user agent do app: camada nativa ligada, marca CazéStats.TV, dados carregados e as
      páginas principais (inclusive campinho tático e escalações) sem erro de JavaScript nem rolagem para o lado.
   Uso: (cd app && node montar-www.mjs) && BASE=http://127.0.0.1:5173 node tests/app-www.mjs
        (BASE = o site servido localmente; sem BASE, o site publicado) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(RAIZ, "app"), WWW = path.join(APP, "www");
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));

// 1. a casca dentro do APK
const versao = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).version;
const cfg = JSON.parse(fs.readFileSync(path.join(APP, "capacitor.config.json"), "utf8"));
const ua = cfg.android?.appendUserAgent || "";
ok(ua === `CazeStatsApp/${versao}`, `user agent do app com a versão do package.json (${ua})`);
ok(fs.existsSync(path.join(WWW, "index.html")) && fs.existsSync(path.join(WWW, "sem-conexao.html")), "app/www com index.html e a página de sem conexão (rode: cd app && node montar-www.mjs)");
const vj = fs.existsSync(path.join(WWW, "versao.json")) ? JSON.parse(fs.readFileSync(path.join(WWW, "versao.json"), "utf8")) : {};
ok(vj.versao === versao && vj.site === cfg.server?.url && /^https:\/\//.test(vj.site || ""), `versao.json aponta para o site publicado (${vj.site || "sem versao.json"})`);

// 2. o site como o app abre
const BASE = (process.env.BASE || cfg.server?.url || "https://cazestats.pages.dev/").replace(/\/+$/, "");
const b = await chromium.launch({ channel: "chrome" });
const pixel = devices["Pixel 7"];
const ctx = await b.newContext({ ...pixel, userAgent: `${pixel.userAgent} ${ua}` });
const p = await ctx.newPage();
const js = [];
p.on("pageerror", (e) => js.push(String(e.message)));
const dados = [];
p.on("response", (r) => { if (/\/dados\/[a-z0-9/-]+\.json/.test(r.url())) dados.push(r.status()); });
await p.goto(`${BASE}/#/`, { waitUntil: "load" });
await p.waitForTimeout(4000);
const marca = await p.evaluate(() => ({ app: document.documentElement.classList.contains("app-nativo"), titulo: document.title, logo: document.querySelector(".l433-word")?.textContent?.trim(), nativo: !!window.PLACAR_APP }));
ok(marca.app && marca.nativo, "camada nativa ligada (classe app-nativo, PLACAR_APP)");
ok(/CazéStats/.test(marca.titulo) && /CazéStats\.TV/.test(marca.logo || ""), `marca CazéStats.TV no app (${marca.logo})`);
ok(dados.length > 0 && dados.some((s) => s === 200), `dados carregados (${dados.length} pedidos, ${[...new Set(dados)].join("/")})`);
for (const rota of ["#/clubes", "#/tabela", "#/clube/cruzeiro", "#/clube/cruzeiro/escalacoes", "#/jogador/216098-cruzeiro", "#/clube/flamengo/mercado/elenco", "#/simulador", "#/copa/libertadores", "#/rodada", "#/privacidade"]) {
  await p.evaluate((r) => (location.hash = r), rota);
  await p.waitForTimeout(2200);
  const v = await p.evaluate(() => ({ imp: /Impedimento/.test(document.querySelector("#view").innerText), n: document.querySelector("#view").innerText.length, vaza: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  ok(!v.imp && v.n > 200, `${rota} abre no app`);
  ok(v.vaza <= 1, `${rota} sem rolagem para o lado (${v.vaza}px)`);
}
ok(!js.length, `sem erros de JavaScript${js.length ? `: ${js[0]}` : ""}`);
await b.close();
if (erros.length) { console.log(`\n${erros.length} falha(s):\n- ${erros.join("\n- ")}`); process.exit(1); }
console.log(`\nApp CazéStats.TV ${versao} conferido.`);
