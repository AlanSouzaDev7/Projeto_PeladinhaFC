/* Simulação de um jogo hipotético ao vivo (Cruzeiro x Flamengo, ~2min40s) sem nenhum jogo real rolando.
   As respostas da ESPN e da API-Football são simuladas a partir do roteiro em tests/sim/jogo.mjs.
   Três cenários, lado a lado e com o mesmo jogo:
     ESPN          sem Worker configurado (como o site está hoje)
     API-Football  com o Worker (o código real de worker/ao-vivo.mjs, com a API-Football simulada)
     Worker caiu   Worker configurado, mas fora do ar: o site precisa voltar para a ESPN sozinho
   Mede, para cada lance, quantos segundos o site leva para mostrar (placar do topo e minuto a minuto).
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  BASE=http://127.0.0.1:5173 node tests/mobile/simulacao.mjs */
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import worker from "../../worker/ao-vivo.mjs";
import { ROTEIRO, DURACAO, ESPN_ID, espnScoreboard, espnSummary, apiFootballFixture } from "../sim/jogo.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const PROXY = "https://placar-ao-vivo.sim";

// o jogo começa 20 s depois de abrir as páginas
const S = Math.ceil((Date.now() + 20e3) / 60e3) * 60e3; // no minuto cheio (o site guarda o horário em HH:MM)
const tNow = () => (Date.now() - S) / 1000;
const brt = new Date(S - 3 * 3600e3).toISOString();

// dados gravados + o jogo hipotético na rodada atual
const raw = readFileSync(`${ROOT}js/live-data.js`, "utf8");
const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
const R = data.round;
data.fixtures[R].push(["cruzeiro", "flamengo", null, null, brt.slice(0, 10), brt.slice(11, 16), "Mineirão (simulação)", ESPN_ID, null]);
const liveData = `window.LIVE_DATA = ${JSON.stringify(data)};`;

// API-Football simulada para o Worker de verdade
let afCalls = 0;
globalThis.fetch = async (url) => {
  afCalls++;
  const withEvents = /ids=/.test(url);
  return new Response(JSON.stringify({ errors: [], response: [apiFootballFixture(tNow(), S, withEvents)] }), { headers: { "x-ratelimit-requests-remaining": "7000" } });
};
const env = { API_FOOTBALL_KEY: "chave-simulada", INTERVALO_SEGUNDOS: "15", LISTA_SEGUNDOS: "1800" };

const browser = await chromium.launch({ channel: "chrome" });
async function cenario(nome, aoVivo, workerFora) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "pt-BR" });
  const espn = { sb: 0, sum: 0 }, px = { ok: 0, fail: 0 };
  await ctx.route("**/js/live-data.js*", (r) => r.fulfill({ contentType: "application/javascript", body: liveData }));
  await ctx.route("**/js/config.js*", (r) => r.fulfill({ contentType: "application/javascript", body: `window.PLACAR_CONFIG = ${JSON.stringify({ aoVivo, intervalo: 15 })};` }));
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" })); // sem a API local, como no GitHub Pages
  await ctx.route(/espn\.com/, (r) => {
    const u = r.request().url();
    if (u.includes("/scoreboard")) {
      espn.sb++;
      const today = u.includes(`dates=${brt.slice(0, 10).replace(/-/g, "")}`);
      return r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(today ? espnScoreboard(tNow(), new Date(S).toISOString()) : { leagues: [{ calendar: [] }], events: [] }) });
    }
    if (u.includes("/summary") && u.includes(ESPN_ID)) { espn.sum++; return r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(espnSummary(tNow())) }); }
    return r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" });
  });
  await ctx.route(`${PROXY}/**`, async (r) => {
    if (workerFora) { px.fail++; return r.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "{}" }); }
    px.ok++;
    const res = await worker.fetch(new Request(r.request().url()), env);
    return r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
  // registra cada mudança na tela, com o horário
  await ctx.addInitScript(() => {
    window.__log = [];
    let last = "";
    setInterval(() => {
      const s = document.querySelector(".match-hero .scoreline");
      const lines = [...document.querySelectorAll(".mam-list .mam-l p")].map((p) => p.textContent);
      const snap = { score: s?.querySelector("[data-score]")?.textContent.trim(), status: s?.querySelector(".status")?.textContent.trim(), lines, src: document.querySelector(".mam-src")?.textContent, sit: document.querySelector("[data-situacao]")?.textContent };
      const k = JSON.stringify(snap);
      if (k !== last) { last = k; window.__log.push({ at: Date.now(), ...snap }); }
    }, 200);
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/?estatico&v=${Date.now()}#/partida/cruzeiro-x-flamengo-r${R}`, { waitUntil: "load" });
  return { nome, ctx, page, espn, px, errors };
}

const cens = await Promise.all([cenario("ESPN", "", false), cenario("API-Football", PROXY, false), cenario("Worker caiu", PROXY, true)]);
console.log(`jogo começa em ${Math.round((S - Date.now()) / 1000)} s; dura ${DURACAO} s; terminando, mais 40 s de folga`);
await new Promise((r) => setTimeout(r, S - Date.now() + (DURACAO + 40) * 1000));

// o que cada lance precisa mostrar na tela
const placarAte = (t) => { const s = { home: 0, away: 0 }; ROTEIRO.filter((e) => e.t <= t && /goal/.test(e.kind)).forEach((e) => s[e.side]++); return `${s.home} - ${s.away}`; };
const CHECKS = ROTEIRO.flatMap((e) => {
  const at = S + e.t * 1000;
  const c = [];
  if (/goal/.test(e.kind)) c.push({ lance: `Gol ${e.min}' (${placarAte(e.t)})`, onde: "placar", at, ok: (l) => l.score === placarAte(e.t) });
  if (e.kind === "kickoff") c.push({ lance: "Início", onde: "placar", at, ok: (l) => /Ao vivo/.test(l.status || "") });
  if (e.kind === "halftime") c.push({ lance: "Intervalo", onde: "placar", at, ok: (l) => /Intervalo/.test(l.status || "") });
  if (e.kind === "second-half") c.push({ lance: "2º tempo", onde: "placar", at, ok: (l) => /Ao vivo · \d/.test(l.status || "") });
  if (e.kind === "full-time") c.push({ lance: "Fim de jogo", onde: "placar", at, ok: (l) => /Encerrado/.test(l.status || "") });
  const txt = { goal: "GOL do", "penalty-goal": "cobra o pênalti", yellow: "Cartão amarelo", red: "Expulso", sub: "Substituição", halftime: "Fim do primeiro tempo", "full-time": "Fim de jogo" }[e.kind];
  if (txt) c.push({ lance: `${e.kind}${e.min ? ` ${e.min}'` : ""}`, onde: "minuto a minuto", at, ok: (l) => l.lines.filter((x) => x.includes(txt)).length >= ROTEIRO.filter((x) => x.kind === e.kind && x.t <= e.t).length });
  return c;
});

const result = {};
for (const c of cens) {
  const log = await c.page.evaluate(() => window.__log);
  const rows = CHECKS.map((k) => {
    const hit = log.find((l) => l.at >= k.at - 50 && k.ok(l)) || (log.findLast((l) => l.at < k.at && k.ok(l)) && { at: k.at });
    return { lance: k.lance, onde: k.onde, segundos: hit ? +((hit.at - k.at) / 1000).toFixed(1) : null };
  });
  const final = log.at(-1);
  await c.page.screenshot({ path: `${OUT}simulacao-${c.nome.replace(/\W+/g, "-").toLowerCase()}.png`, fullPage: false });
  const lat = rows.filter((r) => r.segundos != null).map((r) => r.segundos);
  result[c.nome] = {
    rows, faltou: rows.filter((r) => r.segundos == null).map((r) => `${r.lance} (${r.onde})`),
    media: +(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1), pior: Math.max(...lat),
    final: { placar: final.score, situacao: final.status, info: final.sit, lances: final.lines.length, fonte: final.src },
    consultas: { espnPlacar: c.espn.sb, espnSumula: c.espn.sum, worker: c.px.ok, workerFalhou: c.px.fail }, erros: c.errors,
  };
}
result["API-Football (consultas do Worker à API)"] = afCalls;
writeFileSync(`${OUT}simulacao.json`, JSON.stringify(result, null, 2));
for (const [nome, r] of Object.entries(result)) {
  if (typeof r !== "object") { console.log(`\n${nome}: ${r}`); continue; }
  console.log(`\n=== ${nome} === média ${r.media} s · pior ${r.pior} s · final: ${JSON.stringify(r.final)}`);
  console.table(r.rows);
  console.log("faltou:", r.faltou, "consultas:", r.consultas, "erros:", r.erros);
}
await browser.close();
