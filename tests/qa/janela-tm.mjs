/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — QA dos contratáveis que vêm só do Transfermarkt (jogadores dos elencos lidos que a ESPN não cadastra)
   - aparecem nos reforços com o valor do Transfermarkt e a foto, a ficha abre sem erro (e explica que não há estatística
     da ESPN), dá para contratar e o link de compartilhar reabre o elenco com ele;
   - o valor de hoje (páginas de elenco) aparece no lugar do de julho (Otávio, do Cruzeiro: € 10 mi).
   Uso: BASE=http://localhost:5173 node tests/qa/janela-tm.mjs   (USAR_BANCO=1 lê do banco publicado)
   ========================================================================== */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5173";
const res = [];
const ok = (cond, nome, extra = "") => { res.push({ nome, ok: !!cond }); console.log(`${cond ? "ok    " : "FALHOU"} · ${nome}${extra ? ` (${extra})` : ""}`); };
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
if (!process.env.USAR_BANCO) await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));

// um jogador que só existe no Transfermarkt (dados/mercado/global-tm.json)
await p.goto(`${BASE}/#/`);
const alvo = await p.evaluate(async () => {
  const x = await window.DADOS.carrega("mercado/global-tm").catch(() => null);
  const r = (x?.jogadores || []).find((j) => j[8] > 0 && j[12] && j[10] && j[6] !== "819"); // fora do Flamengo (a Janela não oferece o próprio clube)
  return r ? { id: r[0], nome: r[1], valor: r[8], time: (x.times[r[6]] || [])[0] || r[6] } : null;
});
ok(alvo, "existe jogador vindo só do Transfermarkt no mercado", alvo ? `${alvo.nome} (${alvo.time})` : "nenhum");
if (alvo) {
  await p.goto(`${BASE}/#/clube/flamengo/mercado/reforcos`);
  await p.waitForSelector('[data-jt="flamengo"] :is(.jt-tabela, .jt-escolha)', { timeout: 30000 });
  if (await p.locator(".jt-escolha").isVisible()) await p.click('[data-jt-modo="manager"]');
  await p.waitForSelector(".jt-tabela tbody tr");
  await p.fill('[data-jt-f="q"]', alvo.nome); await p.waitForTimeout(700);
  const linha = p.locator(`.jt-tabela tbody tr:has([data-jt-add="${alvo.id}"])`);
  ok(await linha.count() === 1, "aparece na busca dos reforços", alvo.nome);
  const txt = (await linha.innerText().catch(() => "")).replace(/\s+/g, " ");
  ok(/Transfermarkt/.test(txt), "com o valor do Transfermarkt", txt.slice(0, 90));
  await linha.locator("[data-jt-ficha]").click();
  await p.waitForSelector(".jt-mini .jt-mini-d", { timeout: 15000 }); await p.waitForTimeout(1500);
  ok(/Transfermarkt/.test(await p.locator(".jt-mini").innerText()), "a ficha abre com o valor do Transfermarkt");
  await p.locator("[data-jt-ficha]").first().click();
  await linha.locator("[data-jt-add]").click(); await p.waitForTimeout(500);
  ok(await p.locator(`.jt-negocio:has-text("${alvo.nome.split(" ")[0]}")`).count() >= 1, "dá para contratar");
  // link de compartilhar com o id do Transfermarkt
  await p.goto(`${BASE}/#/clube/flamengo/mercado/compartilhar`);
  await p.waitForSelector("[data-jt-cartaz]"); await p.waitForTimeout(3000);
  const cod = await p.evaluate(() => { const m = window.MERCADO_UI; return null; });
  const link = await p.evaluate(async () => {
    const D = window.MERCADO?.flamengo || (await window.MERCADO_UI.carrega("flamengo"));
    const e = JSON.parse(localStorage.getItem("placar:janela-flamengo"));
    return window.MERCADO_UI.codifica(D, { ...e, esc: e.esc || {}, pos: e.pos || {}, dec: e.dec || {} }, { elencoFinal: D.elenco });
  }).catch((x) => "erro " + x);
  void cod;
  ok(/_[0-9a-z]+/.test(String(link)), "o link guarda o jogador do Transfermarkt", String(link).slice(-30));
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  if (!process.env.USAR_BANCO) await ctx2.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/#/clube/flamengo/mercado/${link}`);
  await p2.waitForSelector("[data-jt-cartaz]", { timeout: 30000 }); await p2.waitForTimeout(4000);
  ok((await p2.locator(".jt-resumo").innerText()).match(/Chegadas\s*1/), "quem abre o link vê a contratação", (await p2.locator(".jt-resumo").innerText()).replace(/\s+/g, " "));
  await ctx2.close();
}
// valor de hoje no lugar do de julho
await p.goto(`${BASE}/#/clube/cruzeiro/mercado/elenco`);
await p.waitForSelector('[data-jt="cruzeiro"] :is(.jt-cards, .jt-escolha)', { timeout: 30000 });
if (await p.locator(".jt-escolha").isVisible()) await p.click('[data-jt-modo="real"]');
await p.waitForSelector(".jt-cards");
const otavio = (await p.locator('.jt-card:has(.jt-nome:text-is("Otávio Costa"))').innerText().catch(() => "")).replace(/\s+/g, " ");
ok(/€ 10,0 mi/.test(otavio) && /Transfermarkt/.test(otavio), "Otávio (Cruzeiro) com o valor de hoje do Transfermarkt", otavio.slice(0, 80));
ok(!erros.length, "nenhum erro de JavaScript", erros.slice(0, 2).join(" | ").slice(0, 200));
await b.close();
console.log(`\n${res.filter((r) => r.ok).length} de ${res.length} verificações passaram`);
process.exit(res.every((r) => r.ok) ? 0 : 1);
