/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* Classificação, artilharia e GOL! em tempo real, com a ESPN simulada (relógio do navegador em 04/11/2026 20:20).
   Athletico 1 x 0 Vasco e Flamengo 2 x 0 Grêmio rolando; depois sai o 2º do Athletico (Kevin Viveros).
   Confere: a tabela soma os placares parciais (pontos, jogos, posição, ▲▼ e o placar ao lado do clube),
   a artilharia soma os gols de agora, o GOL! aparece com o nome de quem marcou e, com a aba escondida,
   espera a pessoa voltar. Também confere que um jogo já contado pela tabela da ESPN não é somado duas vezes.
   Os dados gravados (live-data e player-stats) são os de hoje "voltados" para 04/11 20:20: o site lê esses arquivos
   por js/dados.js (banco D1 do Worker, depois dados/<nome>.json) e o index.html ainda carrega os js/<nome>.js antigos,
   então os três endereços devolvem o mesmo retrato. Sai com código 1 se algo falhar.
   Uso: sirva a raiz do site (ex.: python -m http.server 5174 --bind 127.0.0.1) e depois  node tests/mobile/tabela-ao-vivo.mjs
   (outra porta: BASE=http://127.0.0.1:5191 node tests/mobile/tabela-ao-vivo.mjs) */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5174";
const TABELA = JSON.parse(readFileSync(new URL("./fixtures-standings.json", import.meta.url)));
const erros = [], ok = (c, msg) => { if (!c) erros.push(msg); else console.log("ok ·", msg); };

/* ---------- retrato dos dados gravados em 04/11/2026 às 20:15 (antes de Athletico x Vasco e Flamengo x Grêmio) ----------
   Parte dos arquivos de hoje (dados/live-data.json e dados/player-stats.json) e volta no tempo:
   - a tabela gravada é a mesma da ESPN simulada (fixtures-standings.json, 33 rodadas);
   - todo jogo a partir de 04/11 19:30 volta a "a disputar", sem placar, menos os dois das 19:30, gravados rolando
     (Athletico 1 x 0 Vasco e Flamengo 2 x 0 Grêmio); o placar de agora vem da ESPN simulada;
   - as súmulas desses jogos saem da lista das já contadas, e Pedro e Kevin Viveros ficam com os números da época
     (Pedro 18 gols em 33 jogos, nenhum no Grêmio: os 2 dele em 04/11 são os primeiros; Kevin Viveros 21). */
const ld = (nome) => JSON.parse(readFileSync(new URL(`../../dados/${nome}.json`, import.meta.url), "utf8"));
const RAIZ = { live: ld("live-data"), stats: ld("player-stats") };
const ESPN_CLUB = { 3458: "athletico-pr", 7632: "atletico-mg", 9967: "bahia", 6086: "botafogo", 6079: "bragantino", 9318: "chapecoense", 874: "corinthians", 3456: "coritiba", 2022: "cruzeiro", 819: "flamengo", 3445: "fluminense", 6273: "gremio", 1936: "internacional", 9169: "mirassol", 2029: "palmeiras", 4936: "remo", 2674: "santos", 2026: "sao-paulo", 3454: "vasco", 3457: "vitoria" };
const LIVE = structuredClone(RAIZ.live), STATS = structuredClone(RAIZ.stats);
LIVE.updated = "04/11/2026 às 20:15";
{
  const velho = Object.fromEntries(RAIZ.live.standings.map((r) => [r[0], r]));
  LIVE.standings = TABELA.children[0].standings.entries.map((e) => {
    const s = Object.fromEntries(e.stats.map((x) => [x.name, x.value])), cid = ESPN_CLUB[e.team.id], o = velho[cid] || [];
    return [+s.rank, [cid, s.points, s.gamesPlayed, s.wins, s.ties, s.losses, s.pointsFor, s.pointsAgainst, o[8] ?? null, o[9] ?? null, o[10] ?? null]];
  }).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}
const LIMITE = Date.parse("2026-11-04T19:30:00-03:00"), voltados = new Set();
for (const gs of Object.values(LIVE.fixtures)) for (const g of gs) {
  if (!g[4] || Date.parse(`${g[4]}T${g[5] || "00:00"}:00-03:00`) < LIMITE) continue;
  if (g[7]) voltados.add(String(g[7]));
  g[2] = g[3] = null; g[8] = { state: "pre", clock: "0'", detail: "Scheduled", gols: [] };
}
// às 20:15 o robô já tinha gravado os dois jogos das 19:30 rolando (o mesmo placar que a ESPN simulada dá às 20:20)
const golGravado = (aid, nome, cid) => [aid, nome, cid, false, false];
for (const g of Object.values(LIVE.fixtures).flat()) {
  if (g[7] === "401841306") { g[2] = 1; g[3] = 0; g[8] = { state: "in", clock: "50'", detail: "50'", gols: [golGravado("197049", "Stiven Mendoza", "athletico-pr")] }; }
  if (g[7] === "401841307") { g[2] = 2; g[3] = 0; g[8] = { state: "in", clock: "52'", detail: "52'", gols: [golGravado("253937", "Samuel Lino", "flamengo"), golGravado("235017", "Pedro", "flamengo")] }; }
}
STATS.updated = LIVE.updated;
STATS.sumulas = (STATS.sumulas || []).filter((id) => !voltados.has(String(id)));
const RETRATO = {
  "235017": { gols: 18, golsSumulas: 18, golsClube: 18, jogos: 33, jogosComGol: 13, ultimoGol: "2026-11-01", clubes: [["flamengo", 33, 18]],
    adversarios: [["vasco", 3], ["cruzeiro", 2], ["fluminense", 2], ["atletico-mg", 2], ["chapecoense", 2], ["mirassol", 2], ["botafogo", 1], ["santos", 1], ["athletico-pr", 1], ["coritiba", 1], ["bragantino", 1]] },
  "268476": { gols: 21, golsSumulas: 21, golsClube: 21 },
};
for (const L of [STATS.artilheiros || [], ...Object.values(STATS.artilhariaClubes || {})]) for (const x of L) if (RETRATO[x.id]) Object.assign(x, structuredClone(RETRATO[x.id]));
for (const L of Object.values(STATS.golsClubes || {})) for (const r of L) if (RETRATO[r[0]]) r[2] = RETRATO[r[0]].gols;
for (const r of LIVE.scorers || []) { if (r[0] === "Pedro") r[2] = 18; if (r[0] === "Kevin Viveros") r[2] = 21; }
if (!STATS.artilheiros?.some((x) => x.id === "235017") || !voltados.has("401841306") || !voltados.has("401841307"))
  erros.push("dados: Pedro fora da artilharia gravada ou jogos de 04/11 ausentes de dados/live-data.json (atualize o retrato do teste)");

const gol = (min, aid, nome, team) => ({ scoringPlay: true, clock: { displayValue: `${min}'` }, team: { id: team }, athletesInvolved: [{ id: aid, displayName: nome }], ownGoal: false, penaltyKick: false });
const ev = (id, h, a, hs, as, clock, details, state = "in") => ({ id, date: "2026-11-04T22:30Z", competitions: [{ venue: {}, details,
  status: { displayClock: clock, type: { state, name: "STATUS_SECOND_HALF", shortDetail: clock } },
  competitors: [{ homeAway: "home", score: String(hs), team: { id: h } }, { homeAway: "away", score: String(as), team: { id: a } }] }] });

for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel", devices["Pixel 7"]]]) {
  const b = await chromium.launch({ channel: "chrome" });
  // rotas no contexto (não na página): no Chromium elas também pegam o que o service worker (sw.js) busca depois de assumir a aba
  const ctx = await b.newContext({ ...opts, locale: "pt-BR" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  // dados gravados: js/<nome>.js (index.html), e por js/dados.js o banco <api>/dados/<nome>.json e a cópia dados/<nome>.json
  for (const [nome, glob, d] of [["live-data", "LIVE_DATA", LIVE], ["player-stats", "PLAYER_STATS", STATS]]) {
    await ctx.route(new RegExp(`/js/${nome}\\.js`), (r) => r.fulfill({ contentType: "application/javascript", body: `window.${glob} = ${JSON.stringify(d)};` }));
    await ctx.route(new RegExp(`/dados/${nome}\\.json`), (r) => r.fulfill({ json: d }));
  }
  await p.clock.install({ time: new Date("2026-11-04T20:20:00-03:00") });
  let cap = 1, fimFla = false, tabelaContou = false;
  await ctx.route(/espn\.com.*scoreboard/, (r) => r.fulfill({ json: { leagues: [{ calendar: [] }], events: [
    ev("401841306", "3458", "3454", cap, 0, cap > 1 ? "61'" : "55'", [gol(22, "197049", "Stiven Mendoza", "3458"), ...(cap > 1 ? [gol(60, "268476", "Kevin Viveros", "3458")] : [])]),
    ev("401841307", "819", "6273", 2, 0, fimFla ? "FT" : "57'", [gol(20, "253937", "Samuel Lino", "819"), gol(28, "235017", "Pedro", "819")], fimFla ? "post" : "in"),
  ] } }));
  // tabela da ESPN: sem os jogos de agora; no fim, já com Flamengo 2 x 0 Grêmio contado
  await ctx.route(/espn\.com.*standings/, (r) => {
    const t = structuredClone(TABELA);
    if (tabelaContou) for (const e of t.children[0].standings.entries) {
      const s = Object.fromEntries(e.stats.map((x) => [x.name, x]));
      if (e.team.id === "819") { s.points.value += 3; s.gamesPlayed.value++; s.wins.value++; s.pointsFor.value += 2; }
      if (e.team.id === "6273") { s.gamesPlayed.value++; s.losses.value++; s.pointsAgainst.value += 2; }
    }
    r.fulfill({ json: t });
  });
  await p.clock.resume();
  await p.goto(`${BASE}/?t=${dev}#/tabela`, { waitUntil: "load" });
  await p.waitForTimeout(4000);

  const linha = (id) => p.evaluate((id) => {
    const tr = [...document.querySelectorAll(".table tbody tr")].find((t) => t.querySelector(`td.club a[href="#/clube/${id}"]`));
    if (!tr) return null;
    const td = [...tr.children].map((c) => c.innerText.trim());
    return { pos: +td[0].match(/\d+/)[0], mov: tr.querySelector(".mov")?.textContent || "", p: +tr.querySelector(".pts").textContent, j: +td[3], chip: tr.querySelector(".live-chip")?.textContent || "" };
  }, id);
  const art = () => p.evaluate(() => [...document.querySelectorAll(".card")].find((c) => /^Artilharia/.test(c.querySelector(".card-h")?.textContent || ""))?.innerText.replace(/\s+/g, " "));

  let cap1 = await linha("athletico-pr"), fla = await linha("flamengo"), gre = await linha("gremio"), vas = await linha("vasco");
  console.log(dev, JSON.stringify({ cap1, fla, gre, vas }));
  ok(cap1.p === 57 && cap1.j === 34 && /1-0/.test(cap1.chip), `${dev}: Athletico com 57 pts e 34 jogos vencendo por 1-0 (${cap1.p}/${cap1.j} ${cap1.chip})`);
  ok(vas.p === 38 && vas.j === 33 && /0-1/.test(vas.chip), `${dev}: Vasco perdendo, 38 pts e 33 jogos`);
  ok(fla.p === 76 && gre.p === 37 && gre.j === 34, `${dev}: Flamengo 76 pts, Grêmio 37 pts e 34 jogos`);
  ok(await p.evaluate(() => /Ao vivo/.test(document.querySelector(".page-head p").textContent)), `${dev}: aviso de classificação ao vivo`);
  let a = await art();
  ok(/Pedro\s*\+1 ao vivo\s*19/.test(a) && /Kevin Viveros\s*21/.test(a), `${dev}: artilharia soma o gol do Pedro (19)`);
  // ficha do Pedro: "contra quem marcou" já com o Grêmio, e os gols pelo Flamengo somados
  const pedro = p.locator('.squad-list li[data-scorer^="Pedro|"]').first();
  await pedro.scrollIntoViewIfNeeded();
  if (dev === "pc") await pedro.click(); else await pedro.tap();
  await p.waitForTimeout(500);
  const ficha = await p.evaluate(() => {
    const t = document.querySelector(".scorer-card.open"); if (!t) return null;
    const adv = [...t.querySelectorAll(".sc-adv li")].map((li) => li.innerText.replace(/\s+/g, " ").trim());
    const cl = [...t.querySelectorAll(".sc-clubes li")].map((li) => li.innerText.replace(/\s+/g, " ").trim());
    return { gols: t.querySelector(".sc-g").innerText.replace(/\s+/g, " "), adv, cl };
  });
  console.log(dev, "ficha do Pedro:", JSON.stringify(ficha));
  ok(ficha && ficha.adv.some((x) => /^Grêmio 1\s*\+1 hoje$/.test(x)) && /19/.test(ficha.gols) && ficha.cl.some((x) => /Flamengo.*34 jogos.*19/.test(x)), `${dev}: ficha do Pedro com o gol no Grêmio em "contra quem marcou"`);
  if (dev === "pc") await p.screenshot({ path: "tests/mobile/out/ficha-ao-vivo-pc.png" });
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);

  // 2º gol do Athletico
  cap = 2;
  for (let i = 0; i < 20 && !(await p.$(".goal-alert")); i++) await p.waitForTimeout(1000);
  const alerta = await p.evaluate(() => document.querySelector(".goal-alert")?.innerText.replace(/\s+/g, " "));
  ok(alerta && /Kevin Viveros/.test(alerta), `${dev}: GOL! apareceu com quem marcou (${alerta})`);
  await p.waitForTimeout(1500);
  const cap2 = await linha("athletico-pr");
  ok(/2-0/.test(cap2.chip) && cap2.p === 57, `${dev}: tabela com 2-0 (${cap2.chip})`);
  a = await art();
  ok(/Kevin Viveros\s*\+1 ao vivo\s*22/.test(a), `${dev}: artilharia com Kevin Viveros 22`);
  if (dev === "pc") await p.screenshot({ path: "tests/mobile/out/tabela-ao-vivo-pc.png" });
  else { await p.locator(".table").screenshot({ path: "tests/mobile/out/tabela-ao-vivo-pixel.png" }); }

  // jogo encerrado e já contado pela ESPN: não pode somar duas vezes
  fimFla = true; tabelaContou = true;
  await p.clock.fastForward(130000);
  await p.waitForTimeout(16000);
  const fla2 = await linha("flamengo"), gre2 = await linha("gremio");
  ok(fla2.p === 76 && fla2.j === 34 && !fla2.chip && gre2.j === 34, `${dev}: Flamengo encerrado e contado pela ESPN não soma duas vezes (${fla2.p}/${fla2.j} ${fla2.chip})`);

  // aba escondida: o GOL! espera a volta
  await p.waitForTimeout(8000);
  await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
  cap = 3;
  await p.waitForTimeout(16000);
  ok(!(await p.$(".goal-alert")), `${dev}: com a aba escondida o GOL! não toca`);
  await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForTimeout(800);
  ok(!!(await p.$(".goal-alert")), `${dev}: ao voltar para a aba, o GOL! toca`);
  await b.close();
}
if (erros.length) { console.log("\nFALHAS:\n" + erros.join("\n")); process.exitCode = 1; }
else console.log("\ntabela, artilharia e GOL! ao vivo ok");
