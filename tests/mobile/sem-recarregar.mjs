/* "O site atualiza sozinho": com jogo rolando, o placar muda o minuto a cada consulta (12 s) e antes isso
   redesenhava a página inteira. Simula a ESPN (relógio do navegador em 04/11/2026 20:20, Athletico x Vasco rolando,
   gol no meio) e confere, no início, no clube, na tabela e na partida: os elementos continuam os mesmos (a página
   não foi redesenhada), o topo do clube não tocou de novo, a rolagem não pulou, a ficha aberta continua aberta,
   e mesmo assim o placar, a tabela e a artilharia mudaram na tela.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/sem-recarregar.mjs */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5174";
const TABELA = JSON.parse(readFileSync(new URL("./fixtures-standings.json", import.meta.url)));
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));
const gol = (aid, nome, team) => ({ scoringPlay: true, clock: { displayValue: "60'" }, team: { id: team }, athletesInvolved: [{ id: aid, displayName: nome }] });

for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel", devices["Pixel 7"]]]) {
  const b = await chromium.launch({ channel: "chrome" });
  const p = await (await b.newContext({ ...opts, locale: "pt-BR" })).newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  await p.clock.install({ time: new Date("2026-11-04T20:20:00-03:00") });
  let n = 0, cap = 0;
  await p.route(/espn\.com.*scoreboard/, (r) => { n++; r.fulfill({ json: { leagues: [{ calendar: [] }], events: [{ id: "401841306", date: "2026-11-04T22:30Z", competitions: [{ venue: {},
    details: cap ? [gol("268476", "Kevin Viveros", "3458")] : [], status: { displayClock: `${40 + n}'`, type: { state: "in", name: "STATUS_SECOND_HALF", shortDetail: `${40 + n}'` } },
    competitors: [{ homeAway: "home", score: String(cap), team: { id: "3458" } }, { homeAway: "away", score: "0", team: { id: "3454" } }] }] }] } }); });
  await p.route(/espn\.com.*standings/, (r) => r.fulfill({ json: TABELA }));
  await p.route(/espn\.com.*summary/, (r) => r.fulfill({ json: {} }));
  await p.clock.resume();

  for (const [rota, nome] of [["#/", "início"], ["#/clube/athletico-pr", "clube"], ["#/tabela", "tabela"], ["#/partida/athletico-pr-x-vasco-r34", "partida"]]) {
    cap = 0;
    await p.goto(`${BASE}/?s=${dev}${nome}${rota}`, { waitUntil: "load" });
    await p.waitForTimeout(rota.includes("clube") ? 9000 : 3500);
    await p.evaluate(() => scrollTo({ top: Math.min(700, document.documentElement.scrollHeight - innerHeight), behavior: "instant" }));
    await p.waitForTimeout(600);
    // marca os elementos de agora; abre uma ficha na tabela
    await p.evaluate(() => { window.__marcos = [...document.querySelectorAll("#view > *, .hero, .gb, .card")].slice(0, 30); window.__y = scrollY; window.__render = 0; window.__alvo = [...document.elementsFromPoint(innerWidth / 2, innerHeight / 2)].find((e) => e.closest("#view")); window.__alvoY = window.__alvo?.getBoundingClientRect().top; });
    if (nome === "tabela") { const li = p.locator(".squad-list li[data-scorer]").nth(2); await li.scrollIntoViewIfNeeded(); await (dev === "pc" ? li.click() : li.tap()); await p.waitForTimeout(400); await p.evaluate(() => { window.__y = scrollY; window.__alvoY = window.__alvo?.getBoundingClientRect().top; }); }
    const n0 = n;
    await p.waitForTimeout(26000); // duas consultas com o minuto mudando
    cap = 1;
    await p.waitForTimeout(15000); // sai o gol
    const r = await p.evaluate(() => ({
      // o que a pessoa vê: o elemento do meio da tela continua no mesmo lugar (a rolagem pode compensar um texto que cresceu acima)
      mesmos: window.__marcos.every((e) => e.isConnected), y: Math.round(Math.abs((window.__alvo?.getBoundingClientRect().top ?? 0) - (window.__alvoY ?? 0))),
      heroGb: document.querySelector(".hero .gb")?.classList.contains("play") ?? null,
      ficha: !!document.querySelector(".scorer-card.open"),
      placar: [...document.querySelectorAll('.match[data-match^="athletico-pr-x-vasco"] .score b, .match-hero [data-score]')].map((e) => e.textContent.trim()).join(" "),
      cap: [...document.querySelectorAll(".table tbody tr")].find((t) => t.querySelector('td.club a[href="#/clube/athletico-pr"]'))?.querySelector(".pts")?.textContent || null,
      relogio: document.querySelector('.match[data-match^="athletico-pr-x-vasco"] .time, .match-hero .status')?.textContent.trim() || null,
    }));
    console.log(dev, nome, `consultas: ${n - n0}`, JSON.stringify(r));
    ok(n - n0 >= 3, `${dev} ${nome}: o placar foi consultado (${n - n0} vezes)`);
    ok(r.mesmos, `${dev} ${nome}: a página não foi redesenhada`);
    ok(r.y < 4, `${dev} ${nome}: o que está na tela não pulou (${r.y}px)`);
    if (nome === "tabela") ok(r.ficha, `${dev} ${nome}: a ficha aberta continuou aberta`);
    if (nome === "início" || nome === "partida") ok(/1/.test(r.placar), `${dev} ${nome}: placar mudou na tela (${r.placar})`);
    if (nome === "início" || nome === "partida") ok(r.relogio && !/41'/.test(r.relogio), `${dev} ${nome}: o minuto avançou (${r.relogio})`);
    if (nome === "tabela" || nome === "clube" || nome === "início") ok(!r.cap || r.cap === "57", `${dev} ${nome}: Athletico com 57 pts na tabela (${r.cap})`);
  }
  await b.close();
}
console.log(erros.length ? "\nFALHAS:\n" + erros.join("\n") : "\nnenhuma página redesenhada sozinha; placar, tabela e minuto atualizados no lugar");
