/* QA funcional — reprodução dos bugs confirmados (cada linha FALHA = bug ainda presente).
   Uso: BASE=http://127.0.0.1:5182 node tests/qa/funcional-bugs.mjs */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5182";
const ler = (f) => JSON.parse(readFileSync(new URL(`../../dados/${f}`, import.meta.url), "utf8"));
let n = 0;
const ok = (c, m) => { if (!c) n++; console.log(`${c ? "ok    " : "FALHA "} · ${m}`); };

// dados
const PS = ler("player-stats.json");
const pendErrado = Object.entries(PS.clubs).flatMap(([cid, c]) => c.pendurados.filter((p) => p.amarelos != null && p.amarelos % 3 !== 2).map((p) => `${cid}/${p.name} (${p.amarelos} amarelos, manchete: "${p.imprensa?.manchete?.slice(0, 60)}")`));
ok(!pendErrado.length, `pendurados só com 2, 5, 8… amarelos ${pendErrado.length ? `— errado: ${pendErrado.join("; ")}` : ""}`);
const SB = ler("competicoes/serie-b.json");
const maxR = Math.max(...SB.jogos.map((j) => j.rodada || 0));
ok(maxR <= 38, `Série B sem rodada acima da 38ª (maior: ${maxR}; jogos: ${SB.jogos.length}, limite 380)`);

// navegador
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", locale: "pt-BR" });
await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
const p = await ctx.newPage();
const txt = () => p.evaluate(() => document.querySelector("#view").innerText);
// gols do Brasileirão iguais na artilharia e na página do jogador (a página usa o número oficial e explica as súmulas)
const difs = [];
for (const a of PS.artilheiros.filter((x) => x.noClube).slice(0, 5)) {
  await p.goto(`${BASE}/#/jogador/${a.id}-${a.club}`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".jg-tab tbody tr", { timeout: 20000 }).catch(() => {});
  const g = await p.evaluate(() => { const tr = [...document.querySelectorAll(".jg-tab tbody tr")].find((t) => /Brasileir/.test(t.textContent)); return tr ? +tr.children[3].textContent : null; });
  if (g !== a.gols) difs.push(`${a.name} ${a.gols} (artilharia) x ${g} (página do jogador)`);
}
ok(!difs.length, `mesmo número de gols na artilharia e na página do jogador ${difs.length ? `— ${difs.join("; ")}` : ""}`);
for (const rd of ["999", "-3", "5"]) {
  await p.goto(`${BASE}/#/rodada/${rd}`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3500);
  const t = await txt();
  ok(!t.includes(`Resumo da ${rd}ª rodada`), `#/rodada/${rd} não finge uma rodada que não existe (mostra: "${t.split("\n")[0]}")`);
}
await p.goto(`${BASE}/#/copa/serie-b`, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3500);
const sb = await txt();
ok(!/(39|40)ª rodada/.test(sb), `Série B (38 rodadas) não mostra 39ª/40ª rodada (${(sb.match(/\d+ª rodada/) || [""])[0]})`);
await p.goto(`${BASE}/#/tabela`, { waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-cp]"); await p.waitForTimeout(1500);
await p.locator("[data-cp]").first().click();
await p.waitForSelector("dialog.cp-dlg[open]", { timeout: 15000 });
await p.evaluate(() => { location.hash = "#/clube/flamengo"; });
await p.waitForTimeout(2500);
ok(!(await p.locator("dialog[open]").count()), "pré-visualização do compartilhar fecha ao trocar de página (voltar do navegador)");
await p.keyboard.press("Escape");
await b.close();
console.log(`\n${n} bug(s) ainda presentes`);
process.exitCode = n ? 1 : 0;
