/* Atraso do placar ao vivo, antes e depois: o mesmo jogo hipotético (Cruzeiro x Flamengo) roda com a ESPN simulada
   em 4 abas ao mesmo tempo, com 10 gols a cada ~21 s (mais que os 12 s da consulta antiga somados aos 7,8 s do alerta,
   para um gol não esperar o alerta do anterior), alternando os clubes:
     - "antes":  o js/live.js do último commit (git HEAD), jogo com horário marcado;
     - "depois": o js/live.js atual, jogo com horário marcado;
     - "antes, sem horário" e "depois, sem horário": o jogo só com a data (acontece nas últimas rodadas).
   Mede, para cada gol, quanto tempo passa entre o gol estar na ESPN e o alerta GOL! aparecer na tela.
   A ESPN simulada pode guardar a resposta por CACHE segundos (a de verdade guarda por 1 a 2 s); padrão 0, que mede
   só o atraso que o site acrescenta. Também conta as consultas e os bytes baixados.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/latencia.mjs  (CACHE=1 para o modelo com cache) */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ESPN_ID, espnSummary } from "../sim/jogo.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const OUT = `${ROOT}tests/mobile/out/`;
const CACHE = +(process.env.CACHE || 0), NGOLS = +(process.env.GOLS || 10);
// gols: o primeiro aos 20 s de jogo, depois a cada 21 s com uma variação de até 1,5 s (fase aleatória em relação à consulta)
const GOLS = Array.from({ length: NGOLS }, (_, i) => ({ t: +(20 + i * 21 + Math.random() * 1.5).toFixed(2), side: i % 2 ? "away" : "home" }));
const ATE = Math.ceil(GOLS.at(-1).t + 12);
const placar = (t) => ({ home: GOLS.filter((g) => g.side === "home" && g.t <= t).length, away: GOLS.filter((g) => g.side === "away" && g.t <= t).length });
const espnScoreboard = (t, kickIso) => {
  const s = placar(t), em = t >= 0;
  return { leagues: [{ calendar: [] }], events: [{ id: ESPN_ID, date: kickIso, competitions: [{
    competitors: [{ homeAway: "home", team: { id: "2022", displayName: "Cruzeiro" }, score: String(s.home) }, { homeAway: "away", team: { id: "819", displayName: "Flamengo" }, score: String(s.away) }],
    status: { displayClock: em ? `${Math.min(90, 1 + Math.floor(t / 3))}'` : "0'", type: em ? { name: "STATUS_FIRST_HALF", state: "in", shortDetail: "1º tempo" } : { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "Agendado" } },
    venue: { fullName: "Mineirão (simulação)" } }] }] };
};
mkdirSync(OUT, { recursive: true });

const S = Math.ceil((Date.now() + 25e3) / 60e3) * 60e3; // o jogo começa no próximo minuto cheio
const tNow = () => (Date.now() - S) / 1000;
const brt = new Date(S - 3 * 3600e3).toISOString();
const raw = readFileSync(`${ROOT}js/live-data.js`, "utf8");
const dados = (comHora) => {
  const d = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  d.fixtures[d.round].push(["cruzeiro", "flamengo", null, null, brt.slice(0, 10), comHora ? brt.slice(11, 16) : null, "Mineirão (simulação)", ESPN_ID, null]);
  return `window.LIVE_DATA = ${JSON.stringify(d)};`;
};
const liveAntes = execFileSync("git", ["show", "HEAD:js/live.js"], { cwd: ROOT, maxBuffer: 1 << 24 }).toString();

const browser = await chromium.launch({ channel: "chrome" });
async function abrir(nome, antes, comHora) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "pt-BR", colorScheme: "dark" });
  const body = dados(comHora), cont = { consultas: 0, bytes: 0 };
  await ctx.route("**/js/live-data.js*", (r) => r.fulfill({ contentType: "application/javascript", body }));
  if (antes) await ctx.route("**/js/live.js*", (r) => r.fulfill({ contentType: "application/javascript", body: liveAntes }));
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route(/espn\.com/, (r) => {
    const u = r.request().url(), h = { "access-control-allow-origin": "*" };
    if (u.includes("/scoreboard")) {
      const hoje = u.includes(`dates=${brt.slice(0, 10).replace(/-/g, "")}`);
      // cache da ESPN: a resposta só muda a cada CACHE segundos
      const t = CACHE ? Math.floor(tNow() / CACHE) * CACHE : tNow();
      const b = JSON.stringify(hoje ? espnScoreboard(t, new Date(S).toISOString()) : { leagues: [{ calendar: [] }], events: [] });
      if (hoje && tNow() > -20) { cont.consultas++; cont.bytes += b.length; }
      return r.fulfill({ contentType: "application/json", headers: h, body: b });
    }
    if (u.includes("/summary") && u.includes(ESPN_ID)) return r.fulfill({ contentType: "application/json", headers: h, body: JSON.stringify(espnSummary(tNow())) });
    return r.fulfill({ contentType: "application/json", headers: h, body: "{}" });
  });
  await ctx.addInitScript(() => {
    window.__gols = [];
    new MutationObserver(() => document.querySelectorAll(".goal-alert:not([data-visto])").forEach((el) => {
      el.dataset.visto = "1";
      window.__gols.push({ at: Date.now(), clube: el.querySelector(".gb").dataset.goalbug });
    })).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?v=${Date.now()}#/`, { waitUntil: "load" });
  return { nome, antes, comHora, ctx, page, erros, cont };
}
const abas = await Promise.all([abrir("antes", true, true), abrir("depois", false, true), abrir("antes, sem horário", true, false), abrir("depois, sem horário", false, false)]);
console.log(`jogo começa em ${Math.round((S - Date.now()) / 1000)} s; observando ${ATE} s de jogo (cache da ESPN simulada: ${CACHE} s)`);
await new Promise((r) => setTimeout(r, S - Date.now() + ATE * 1000));

const gols = GOLS;
const res = {};
for (const a of abas) {
  const vistos = await a.page.evaluate(() => window.__gols);
  const atrasos = gols.map((g) => {
    const clube = g.side === "home" ? "cruzeiro" : "flamengo", at = S + g.t * 1000;
    const v = vistos.find((x) => x.clube === clube && x.at >= at - 300 && x.at < at + 20000);
    return v ? +((v.at - at) / 1000).toFixed(2) : null;
  });
  const ok = atrasos.filter((x) => x != null);
  res[a.nome] = {
    gols: atrasos, media: ok.length ? +(ok.reduce((s, x) => s + x, 0) / ok.length).toFixed(2) : null, pior: ok.length ? Math.max(...ok) : null,
    perdidos: atrasos.filter((x) => x == null).length, consultasPorMin: +(a.cont.consultas / ((ATE + 20) / 60)).toFixed(1),
    kbPorMin: +(a.cont.bytes / 1024 / ((ATE + 20) / 60)).toFixed(1), erros: a.erros.length,
  };
  await a.ctx.close();
}
await browser.close();
const A = res["antes"], D = res["depois"];
const reducao = A.media && D.media != null ? Math.round((1 - D.media / A.media) * 100) : null;
const out = { cache: CACHE, gols: gols.map((g) => `${g.side === "home" ? "Cruzeiro" : "Flamengo"} aos ${g.t} s`), mediana: Object.fromEntries(Object.entries(res).map(([k, v]) => { const o = v.gols.filter((x) => x != null).sort((a, b) => a - b); return [k, o.length ? o[Math.floor(o.length / 2)] : null]; })), resultado: res, reducaoMedia: reducao, reducaoPior: A.pior && D.pior != null ? Math.round((1 - D.pior / A.pior) * 100) : null };
writeFileSync(`${OUT}latencia${CACHE ? `-cache${CACHE}` : ""}.json`, JSON.stringify(out, null, 2));
console.table(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { ...v, gols: v.gols.map((x) => (x == null ? "não apareceu" : `${x} s`)).join(" / ") }])));
console.log(`redução do atraso médio: ${reducao}% · do pior caso: ${out.reducaoPior}%`);
const falhas = [];
if (reducao == null || reducao < 90) falhas.push(`redução média ${reducao}% (meta: 90%)`);
if (D.perdidos || res["depois, sem horário"].perdidos) falhas.push("gol que não apareceu na versão nova");
if (Object.values(res).some((r) => r.erros)) falhas.push("erro de JavaScript");
console.log(falhas.length ? `FALHOU: ${falhas.join("; ")}` : "OK");
process.exitCode = falhas.length ? 1 : 0;
