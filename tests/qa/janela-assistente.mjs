/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — QA do assistente de reforços e do filtro por continente (aba Janela → Reforços), nos 20 clubes
   Para cada clube: pergunta ao assistente e confere que TODO jogador da resposta cumpre a pergunta (liga, idade,
   posição, valor, etiqueta tática, continente), que o clube não oferece os próprios jogadores, e o filtro por
   continente da lista (pela liga e pela nacionalidade). No Cruzeiro (celular e computador): Contratar pela resposta
   entra nas chegadas, Ficha abre a ficha, "Ver todos na lista" leva os filtros, sem rolagem para os lados e sem erros.
   Uso: BASE=http://localhost:5173 node tests/qa/janela-assistente.mjs   (CLUBES=cruzeiro,flamengo para só alguns)
   ========================================================================== */
import { chromium } from "playwright";
import { createRequire } from "node:module";
const A = createRequire(import.meta.url)("../../js/assistente-reforcos.js");
const BASE = process.env.BASE || "http://localhost:5173";
const TODOS = ["athletico-pr", "atletico-mg", "bahia", "botafogo", "bragantino", "chapecoense", "corinthians", "coritiba", "cruzeiro", "flamengo", "fluminense", "gremio", "internacional", "mirassol", "palmeiras", "remo", "santos", "sao-paulo", "vasco", "vitoria"];
const CLUBES = process.env.CLUBES ? process.env.CLUBES.split(",") : TODOS;
const res = [];
const ok = (c, nome, extra = "") => { res.push(!!c); console.log(`${c ? "ok    " : "FALHOU"} · ${nome}${extra ? ` (${extra})` : ""}`); };
const b = await chromium.launch({ channel: "chrome" });

// lê do próprio site o mercado global já carregado (linhas e times), para conferir cada jogador da resposta
const dadosDe = (p) => p.evaluate(() => {
  const partes = [window.MERCADO_GLOBAL, ...Object.entries(window.MERCADO || {}).filter(([k]) => k.startsWith("global-tm")).map(([, v]) => v)].filter(Boolean);
  const rows = {}, times = {};
  for (const g of partes) { Object.assign(times, g.times || {}); for (const r of g.jogadores || []) rows[r[0]] = r; }
  return { rows, times };
});
async function abre(p, cid, modo = "manager") {
  await p.goto(`${BASE}/?x=${Date.now()}#/clube/${cid}/mercado/reforcos`, { waitUntil: "load" });
  await p.waitForSelector(`[data-jt="${cid}"] :is(.jt-tabela, .jt-escolha)`, { timeout: 40000 });
  if (await p.locator(".jt-escolha").isVisible().catch(() => false)) await p.click(`[data-jt-modo="${modo}"]`);
  await p.waitForSelector(".jt-as-f", { timeout: 40000 });
}
async function pergunta(p, q) {
  const antes = await p.locator(".jt-as-eu").count(); // a mensagem de boas-vindas some na primeira pergunta: conta as perguntas
  await p.fill(".jt-as-f input", q);
  await p.click(".jt-as-f .jt-btn");
  await p.waitForFunction((n) => document.querySelectorAll(".jt-as-eu").length > n, antes, { timeout: 10000 });
  return p.evaluate(() => { const bots = document.querySelectorAll(".jt-as-bot"), u = bots[bots.length - 1]; return { texto: u.querySelector("p").innerText, ids: [...u.querySelectorAll("[data-jt-add]")].map((x) => x.dataset.jtAdd) }; });
}

const ctxPc = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
if (!process.env.USAR_BANCO) await ctxPc.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
const p = await ctxPc.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
for (const cid of CLUBES) {
  await abre(p, cid);
  const { rows, times } = await dadosDe(p);
  const meu = await p.evaluate(() => document.querySelector(".jt-mesa-tit h2")?.textContent.trim() || null);
  const doClube = (id) => { const t = times[rows[id]?.[6]]; return t && meu && t[0].toLowerCase() === meu.toLowerCase(); };
  // 1) promessas da Série B
  let r = await pergunta(p, "jogadores da Série B do Campeonato Brasileiro que tenham destaque como possíveis promessas");
  const ruinsB = r.ids.filter((id) => { const x = rows[id]; return !x || times[x[6]]?.[2] !== "bra.2" || x[2] == null || x[2] > 21; });
  ok(r.ids.length >= 5 && !ruinsB.length && !r.ids.some(doClube), `${cid}: promessas da Série B (todos da Série B, até 21 anos)`, `${r.ids.length} na resposta${ruinsB.length ? `, fora: ${ruinsB.join(",")}` : ""}`);
  // 2) pontas que recompõem até 5 milhões
  r = await pergunta(p, "Pontas que recompõem até 5 milhões");
  const ruinsP = r.ids.filter((id) => { const x = rows[id]; return !x || !["PD", "PE"].includes(x[11]) || x[8] > 5e6 || !String(x[17] || "").slice(1, -1).includes("R"); });
  ok(r.ids.length >= 3 && !ruinsP.length, `${cid}: pontas que recompõem até € 5 mi`, `${r.ids.length}${ruinsP.length ? `, fora: ${ruinsP.join(",")}` : ""}`);
  // 3) continente pela nacionalidade + posição + idade
  r = await pergunta(p, "Zagueiros africanos até 25 anos");
  const ruinsA = r.ids.filter((id) => { const x = rows[id]; return !x || x[11] !== "ZAG" || A.contDoPais(x[4]) !== "africa" || x[2] > 25; });
  ok(r.ids.length >= 1 && !ruinsA.length, `${cid}: zagueiros africanos até 25 anos`, `${r.ids.length}${ruinsA.length ? `, fora: ${ruinsA.join(",")}` : ""}`);
  // 4) filtro por continente na lista (pela liga)
  await p.selectOption('[data-jt-f="cont"]', "asia"); await p.selectOption('[data-jt-f="contPor"]', "liga"); await p.waitForTimeout(400);
  const ids = await p.locator(".jt-tabela tbody [data-jt-add]").evaluateAll((bs) => bs.map((x) => x.dataset.jtAdd));
  const foraAsia = ids.filter((id) => A.contDaLiga(times[rows[id]?.[6]]?.[2]) !== "asia");
  ok(ids.length > 0 && !foraAsia.length, `${cid}: filtro continente Ásia pela liga`, `${ids.length} na lista${foraAsia.length ? `, fora: ${foraAsia.length}` : ""}`);
  await p.selectOption('[data-jt-f="cont"]', "");
}

// fluxo completo no Cruzeiro, no celular e no computador
for (const [perfil, vp] of [["celular", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ["computador", { width: 1366, height: 900 }]]) {
  const { width, height, ...resto } = vp;
  const ctx = await b.newContext({ viewport: { width, height }, ...resto, locale: "pt-BR" });
  if (!process.env.USAR_BANCO) await ctx.route(/workers\.dev\/dados\//, (rr) => rr.fulfill({ status: 404, body: "" }));
  const q = await ctx.newPage();
  const errosQ = [];
  q.on("pageerror", (e) => errosQ.push(e.message));
  await abre(q, "cruzeiro");
  await q.click('[data-jt-as-q="Promessas da Série B"]');
  await q.waitForSelector(".jt-as-lista [data-jt-add]", { timeout: 10000 });
  const id = await q.locator(".jt-as-lista [data-jt-add]").first().getAttribute("data-jt-add");
  await q.locator(".jt-as-lista [data-jt-add]").first().click();
  await q.waitForTimeout(800);
  ok(await q.locator(`.jt-negocios [data-jt-del="${id}"], .jt-negocios [data-jt-add="${id}"]`).count() > 0 || await q.locator(".jt-negocios li").count() > 0, `${perfil}: Contratar pela resposta entra nas chegadas`);
  await q.locator(".jt-as-lista [data-jt-as-ver]").first().click();
  ok(await q.waitForSelector(".jt-mini .jt-mini-d", { timeout: 15000 }).then(() => true).catch(() => false), `${perfil}: Ficha pela resposta abre a ficha do jogador`);
  await q.click('[data-jt-as-q="Pontas que recompõem até 5 milhões"]');
  await q.waitForTimeout(600);
  await q.locator("[data-jt-as-aplica]").last().click();
  await q.waitForTimeout(600);
  const f = await q.evaluate(() => ({ pos: document.querySelector("[data-jt-pos].on")?.dataset.jtPos, v: document.querySelector('[data-jt-f="vMax"]')?.value }));
  ok(f.pos === "pon" && +f.v === 5e6, `${perfil}: "Ver todos na lista" leva os filtros (pontas, até € 5 mi)`, JSON.stringify(f));
  const sobra = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(sobra <= 1, `${perfil}: sem rolagem para os lados`, `${sobra} px`);
  await q.locator(".jt-as").screenshot({ path: `tests/qa/out/janela/${perfil}-assistente.png` }).catch(() => {});
  ok(!errosQ.length, `${perfil}: nenhum erro de JavaScript`, errosQ.slice(0, 2).join(" | "));
  await ctx.close();
}
ok(!erros.length, "nenhum erro de JavaScript nos 20 clubes", erros.slice(0, 2).join(" | "));
await b.close();
console.log(`\n${res.filter(Boolean).length} de ${res.length} verificações passaram`);
process.exitCode = res.every(Boolean) ? 0 : 1;
