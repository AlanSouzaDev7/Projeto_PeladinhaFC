/* QA funcional — simulador: "Mandantes vencem" soma 3 pontos a cada mandante dos jogos que faltam e a tabela
   simulada continua coerente (P, J, ordem). Uso: BASE=http://127.0.0.1:5182 node tests/qa/funcional-simulador.mjs */
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5182";
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce", locale: "pt-BR" });
await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
const p = await ctx.newPage();
const erros = []; p.on("pageerror", (e) => erros.push(e.message));
await p.goto(`${BASE}/#/simulador/todas`, { waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-sim-auto]", { timeout: 30000 });
await p.waitForTimeout(1500);
const tabela = () => p.evaluate(() => [...document.querySelectorAll("#view table.table tbody tr")].map((tr) => { const td = [...tr.children].map((x) => x.innerText.trim()); return { nome: td[1].split("\n")[0].trim(), p: parseInt(td[2]), j: parseInt(td[3]) }; }));
const jogos = await p.evaluate(() => { const out = []; for (const r of PD.ROUNDS) for (const m of PD.realMatches(r)) if (m.status !== "ft") out.push([m.home, m.away, m.status]); return out; });
const t0 = await tabela();
await p.click('[data-sim-auto="casa"]');
await p.waitForTimeout(1500);
const t1 = await tabela();
const nomes = await p.evaluate(() => Object.fromEntries(Object.values(byId).map((c) => [c.id, c.name])));
const falhas = [];
for (const r of t1) {
  const id = Object.keys(nomes).find((k) => nomes[k] === r.nome);
  const casa = jogos.filter((j) => j[0] === id).length, fora = jogos.filter((j) => j[1] === id).length;
  const antes = t0.find((x) => x.nome === r.nome);
  if (!antes) { falhas.push(`${r.nome} sumiu`); continue; }
  if (r.p !== antes.p + 3 * casa) falhas.push(`${r.nome}: ${antes.p} + 3x${casa} mandos = ${antes.p + 3 * casa}, simulador mostra ${r.p}`);
  if (r.j !== antes.j + casa + fora) falhas.push(`${r.nome}: J ${antes.j} + ${casa + fora} = ${antes.j + casa + fora}, simulador ${r.j}`);
}
for (let i = 1; i < t1.length; i++) if (t1[i].p > t1[i - 1].p) falhas.push(`ordem: ${t1[i - 1].nome} ${t1[i - 1].p} acima de ${t1[i].nome} ${t1[i].p}`);
console.log(`jogos que faltam: ${jogos.length} (${jogos.map((j) => j.join("-")).join(", ")})`);
console.log(falhas.length ? "FALHAS:\n" + falhas.join("\n") : "ok · simulador soma certo e ordena");
if (erros.length) console.log("erros JS:", erros);
await b.close();
process.exitCode = falhas.length || erros.length ? 1 : 0;
