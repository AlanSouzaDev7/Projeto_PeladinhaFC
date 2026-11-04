/* Classificação, artilharia e GOL! em tempo real, com a ESPN simulada (relógio do navegador em 04/11/2026 20:20).
   Athletico 1 x 0 Vasco e Flamengo 2 x 0 Grêmio rolando; depois sai o 2º do Athletico (Kevin Viveros).
   Confere: a tabela soma os placares parciais (pontos, jogos, posição, ▲▼ e o placar ao lado do clube),
   a artilharia soma os gols de agora, o GOL! aparece com o nome de quem marcou e, com a aba escondida,
   espera a pessoa voltar. Também confere que um jogo já contado pela tabela da ESPN não é somado duas vezes.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/tabela-ao-vivo.mjs */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5174";
const TABELA = JSON.parse(readFileSync(new URL("./fixtures-standings.json", import.meta.url)));
const erros = [], ok = (c, msg) => { if (!c) erros.push(msg); else console.log("ok ·", msg); };

const gol = (min, aid, nome, team) => ({ scoringPlay: true, clock: { displayValue: `${min}'` }, team: { id: team }, athletesInvolved: [{ id: aid, displayName: nome }], ownGoal: false, penaltyKick: false });
const ev = (id, h, a, hs, as, clock, details, state = "in") => ({ id, date: "2026-11-04T22:30Z", competitions: [{ venue: {}, details,
  status: { displayClock: clock, type: { state, name: "STATUS_SECOND_HALF", shortDetail: clock } },
  competitors: [{ homeAway: "home", score: String(hs), team: { id: h } }, { homeAway: "away", score: String(as), team: { id: a } }] }] });

for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel", devices["Pixel 7"]]]) {
  const b = await chromium.launch({ channel: "chrome" });
  const p = await (await b.newContext({ ...opts, locale: "pt-BR" })).newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  await p.clock.install({ time: new Date("2026-11-04T20:20:00-03:00") });
  let cap = 1, fimFla = false, tabelaContou = false;
  await p.route(/espn\.com.*scoreboard/, (r) => r.fulfill({ json: { leagues: [{ calendar: [] }], events: [
    ev("401841306", "3458", "3454", cap, 0, cap > 1 ? "61'" : "55'", [gol(22, "197049", "Stiven Mendoza", "3458"), ...(cap > 1 ? [gol(60, "268476", "Kevin Viveros", "3458")] : [])]),
    ev("401841307", "819", "6273", 2, 0, fimFla ? "FT" : "57'", [gol(20, "253937", "Samuel Lino", "819"), gol(28, "235017", "Pedro", "819")], fimFla ? "post" : "in"),
  ] } }));
  // tabela da ESPN: sem os jogos de agora; no fim, já com Flamengo 2 x 0 Grêmio contado
  await p.route(/espn\.com.*standings/, (r) => {
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
console.log(erros.length ? "\nFALHAS:\n" + erros.join("\n") : "\ntabela, artilharia e GOL! ao vivo ok");
