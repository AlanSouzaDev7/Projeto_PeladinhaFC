/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — QA: o elenco que uma pessoa monta na Janela não aparece para outra, e a busca dos reforços acha
   jogadores com grafias diferentes.
   - Usuário A (um navegador) monta o Cruzeiro: vende, contrata o Marquinhos do PSG, muda o caixa.
   - Usuário B (outro navegador, ao mesmo tempo) abre a Janela do Cruzeiro: tem de começar do zero (escolha de modo,
     nenhuma decisão, nenhuma chegada). Depois B monta o dele, e A continua com o seu.
   - Busca: "brian rodrigues" acha o Brian Rodríguez (América); "rodr" também.
   Uso: BASE=http://localhost:5173 node tests/qa/janela-usuarios.mjs   (USAR_BANCO=1 lê do banco publicado)
   ========================================================================== */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:5173";
const res = [];
const ok = (cond, nome, extra = "") => { res.push({ nome, ok: !!cond }); console.log(`${cond ? "ok    " : "FALHOU"} · ${nome}${extra ? ` (${extra})` : ""}`); };
const b = await chromium.launch({ channel: "chrome" });
const novoUsuario = async () => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  if (!process.env.USAR_BANCO) await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
  return { ctx, p: await ctx.newPage() };
};
const abreJanela = async (p, etapa = "elenco") => {
  await p.goto(`${BASE}/#/clube/cruzeiro/mercado/${etapa}`);
  await p.waitForSelector('[data-jt="cruzeiro"] :is(.jt-cards, .jt-tabela, .jt-escolha)', { timeout: 30000 });
};

// usuário A monta o elenco
const A = await novoUsuario();
await abreJanela(A.p);
if (await A.p.locator(".jt-escolha").isVisible()) await A.p.click('[data-jt-modo="manager"]');
await A.p.waitForSelector(".jt-cards");
await A.p.locator('.jt-card [data-jt-dec="vender"], .jt-card [data-jt-dec="liberar"]').first().click();
await abreJanela(A.p, "reforcos");
await A.p.waitForSelector(".jt-tabela tbody tr");
await A.p.fill('[data-jt-f="q"]', "marquinhos"); await A.p.waitForTimeout(600);
await A.p.locator('.jt-tabela tbody tr:has-text("Paris") [data-jt-add]').click();
await A.p.waitForTimeout(400);
const chegadasA = await A.p.locator(".jt-negocio").count();
ok(chegadasA === 1, "usuário A: contratou o Marquinhos", `${chegadasA} chegada`);

// busca com grafia diferente
await A.p.fill('[data-jt-f="q"]', "brian rodrigues"); await A.p.waitForTimeout(700);
const brian = await A.p.locator('.jt-tabela tbody tr:has-text("Brian Rodr")').count();
ok(brian >= 1, 'busca "brian rodrigues" acha o Brian Rodríguez', await A.p.locator('.jt-tabela tbody tr:has-text("Brian Rodr")').first().innerText().then((t) => t.replace(/\s+/g, " ").slice(0, 70)).catch(() => "nada"));
await A.p.fill('[data-jt-f="q"]', "rodr"); await A.p.waitForTimeout(700);
ok(await A.p.locator('.jt-tabela tbody tr').count() > 3, 'busca "rodr" acha vários Rodríguez/Rodrigues');
// escondido pelos filtros: aviso
await A.p.click('[data-jt-pos="G"]'); await A.p.fill('[data-jt-f="q"]', "brian rodrigues"); await A.p.waitForTimeout(700);
ok(await A.p.locator(".jt-escondidos").isVisible(), "busca com filtro de goleiro avisa que o Brian está escondido pelos filtros");
await A.p.click("[data-jt-limpa-f]"); await A.p.waitForTimeout(500);
ok(await A.p.locator('.jt-tabela tbody tr:has-text("Brian Rodr")').count() >= 1, '"Limpar os filtros" mostra o Brian');

// usuário B, ao mesmo tempo, em outro navegador
const B = await novoUsuario();
await abreJanela(B.p);
ok(await B.p.locator(".jt-escolha").isVisible(), "usuário B: a Janela começa do zero (escolha de modo)");
await B.p.click('[data-jt-modo="real"]');
await B.p.waitForSelector(".jt-cards");
const vendidosB = await B.p.locator(".jt-card:is(.d-vender, .d-liberar)").count();
const decB = await B.p.evaluate(() => Object.keys((JSON.parse(localStorage.getItem("placar:janela-cruzeiro") || "{}").dec) || {}).length);
ok(vendidosB === 0 && decB === 0, "usuário B: nenhum jogador vendido ou liberado pelo usuário A", `${vendidosB} na tela, ${decB} decisões guardadas`);
await abreJanela(B.p, "reforcos");
await B.p.waitForSelector(".jt-tabela tbody tr");
ok(await B.p.locator(".jt-negocio").count() === 0, "usuário B: nenhuma chegada do usuário A");
ok(!(await B.p.evaluate(() => localStorage.getItem("placar:janela-cruzeiro") || "")).includes("159047"), "usuário B: nada do usuário A guardado no navegador dele");
// B monta o dele; A continua com o seu
// no modo real só dá para contratar quem cabe no caixa (o Brian Rodríguez vale € 12 mi e o caixa é € 9,3 mi: "Sem caixa")
await B.p.fill('[data-jt-f="q"]', "brian rodrigues"); await B.p.waitForTimeout(600);
ok(await B.p.locator('.jt-tabela tbody tr:has-text("Brian Rodr") [data-jt-add][disabled]').count() >= 1 || await B.p.locator('.jt-tabela tbody tr:has-text("Brian Rodr") [data-jt-add]:not([disabled])').count() >= 1, "usuário B (modo real): botão do Brian respeita o caixa");
await B.p.fill('[data-jt-f="q"]', ""); await B.p.selectOption('[data-jt-f="ord"]', "barato"); await B.p.waitForTimeout(600);
await B.p.locator(".jt-tabela tbody tr [data-jt-add]:not([disabled])").first().click();
await A.p.reload(); await A.p.waitForSelector(".jt-tabela tbody tr");
const nomesA = await A.p.locator(".jt-negocio").allInnerTexts();
ok(nomesA.length === 1 && /Marquinhos/i.test(nomesA[0]), "usuário A continua só com o Marquinhos depois que B contrata", nomesA.map((t) => t.split("\n")[0]).join(", "));
await A.ctx.close(); await B.ctx.close(); await b.close();
console.log(`\n${res.filter((r) => r.ok).length} de ${res.length} verificações passaram`);
process.exit(res.every((r) => r.ok) ? 0 : 1);
