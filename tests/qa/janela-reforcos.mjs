/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — QA dos reforços da Janela e das fotos (celular 390x844 e computador 1366x900)
   - fotos: as linhas do mercado global e a busca do topo mostram foto de verdade (imagem carregada, não quebrada);
   - valores: o Marquinhos do PSG com o valor do Transfermarkt (€ 28 mi), não a estimativa antiga (€ 16,1 mi);
   - posições: o filtro "Pontas" só traz pontas; "1º volante" e "2º volante" só trazem volantes daquele tipo; o filtro de
     retorno defensivo saiu e as etiquetas (marca bem, recompõe bem...) aparecem nas linhas e no "Perfil tático" da ficha;
   - ficha (mini aba): valor, contrato e última transferência do Transfermarkt, estatísticas e mapa de calor desenhado;
   - sem rolagem para os lados e sem erro de JavaScript.
   Uso: BASE=http://localhost:5173 node tests/qa/janela-reforcos.mjs   (USAR_BANCO=1 lê do banco publicado)
   ========================================================================== */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/janela/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const res = [];
const ok = (cond, nome, extra = "") => { res.push({ nome, ok: !!cond }); console.log(`${cond ? "ok    " : "FALHOU"} · ${nome}${extra ? ` (${extra})` : ""}`); };
const b = await chromium.launch({ channel: "chrome" });

for (const [perfil, vp] of [["celular", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ["computador", { width: 1366, height: 900 }]]) {
  console.log(`\n=== ${perfil} ===`);
  const { width, height, ...resto } = vp;
  const ctx = await b.newContext({ viewport: { width, height }, ...resto, locale: "pt-BR" });
  if (!process.env.USAR_BANCO) await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|favicon/.test(m.text())) erros.push(m.text()); });
  const fotosCarregadas = (sel) => p.evaluate(async (s) => {
    const ims = [...document.querySelectorAll(s)];
    for (const im of ims) { im.loading = "eager"; }
    await new Promise((r) => setTimeout(r, 3500));
    return { com: ims.filter((im) => im.isConnected && im.complete && im.naturalWidth > 0).length, total: ims.length };
  }, sel);

  await p.goto(`${BASE}/#/clube/cruzeiro/mercado/reforcos`, { waitUntil: "load" });
  await p.waitForSelector('[data-jt="cruzeiro"] :is(.jt-tabela, .jt-escolha)', { timeout: 30000 });
  if (await p.locator(".jt-escolha").isVisible().catch(() => false)) { await p.click('[data-jt-modo="manager"]'); }
  await p.waitForSelector(".jt-tabela tbody tr", { timeout: 30000 });
  await p.waitForTimeout(800);

  // fotos das 25 primeiras linhas (as mais valiosas)
  const linhas = await p.locator(".jt-tabela tbody tr:not(.jt-mini-tr)").count();
  const f = await fotosCarregadas(".jt-tabela .jt-av img");
  ok(f.com >= Math.min(25, linhas) - 1, `${perfil}: fotos de verdade nas linhas dos reforços`, `${f.com} de ${linhas} linhas com foto carregada`);

  // Marquinhos do PSG
  await p.fill('[data-jt-f="q"]', "marquinhos");
  await p.waitForTimeout(700);
  const psg = p.locator('.jt-tabela tbody tr:has-text("Paris Saint-Germain")').first();
  const txt = (await psg.innerText().catch(() => "")).replace(/\s+/g, " ");
  ok(/€ 28,0 mi/.test(txt) && /Transfermarkt/.test(txt), `${perfil}: Marquinhos (PSG) com o valor do Transfermarkt`, txt.slice(0, 90));
  ok(/ZAG/.test(txt), `${perfil}: Marquinhos aparece como zagueiro (posição detalhada)`);

  // ficha do Marquinhos
  await psg.locator("[data-jt-ficha]").click();
  await p.waitForSelector(".jt-mini .jt-mini-d", { timeout: 15000 });
  await p.waitForSelector(".jt-mini :is(.jt-mini-t, [data-jt-mini-st] .empty:not(:has-text('Carregando')))", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const mini = (await p.locator(".jt-mini").innerText()).replace(/\s+/g, " ");
  ok(/Contrato até 30\/06\/2028/.test(mini), `${perfil}: ficha com o contrato do Transfermarkt`);
  ok(/€ 31,4 mi/.test(mini) && /Roma → (PSG|Paris Saint-Germain)/.test(mini), `${perfil}: ficha com a última transferência e o valor pago`);
  ok(/Ligue 1|Champions/i.test(mini), `${perfil}: ficha com as estatísticas da temporada (ESPN)`);
  const pintado = await p.evaluate(() => { const c = document.querySelector("[data-jt-mini-cv]"); if (!c || !c.width) return 0; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 40) if (d[i] > 20) n++; return n; });
  ok(pintado > 50, `${perfil}: mapa de calor desenhado na ficha`, `${pintado} pontos coloridos`);
  await p.locator(".jt-mini").screenshot({ path: `${OUT}${perfil}-ficha-marquinhos.png` });
  await p.locator("[data-jt-ficha]").first().click();

  // pontas que recompõem (o exemplo do pedido)
  await p.fill('[data-jt-f="q"]', "");
  await p.waitForTimeout(500);
  await p.click('[data-jt-pos="pon"]');
  await p.waitForTimeout(400);
  const posPontas = await p.locator(".jt-tabela tbody .jt-pos-t").allInnerTexts();
  ok(posPontas.length > 0 && posPontas.every((t) => /^(PD|PE)$/.test(t.trim())), `${perfil}: filtro Pontas só traz pontas`, `${posPontas.length} linhas`);
  ok(!(await p.locator('[data-jt-f="def"]').count()), `${perfil}: o filtro de retorno defensivo saiu`);
  const tagsPontas = await p.locator(".jt-tabela tbody .jt-tag").allInnerTexts();
  ok(tagsPontas.length > 0 && tagsPontas.every((t) => /Marca|Recompõe|Lateral de apoio/.test(t)), `${perfil}: pontas com etiquetas de marcação/recomposição`, tagsPontas.slice(0, 4).join(", "));
  // ficha de um ponta da Série A: lances reais e perfil tático
  await p.selectOption('[data-jt-f="lg"]', "bra.1");
  await p.waitForTimeout(500);
  await p.locator('.jt-tabela tbody tr:has(.jt-tag) [data-jt-ficha]').first().click();
  await p.waitForSelector(".jt-mini .jt-mini-d", { timeout: 15000 });
  await p.waitForTimeout(2500);
  const mini2 = (await p.locator(".jt-mini").innerText()).replace(/\s+/g, " ");
  ok(/Desarmes por 90 min/.test(mini2) && /Lances reais/.test(mini2), `${perfil}: ficha de jogador da Série A com desarmes e mapa dos lances reais`);
  ok(/Perfil tático/.test(mini2) && /Marcação \d+\/100/.test(mini2) && /Recomposição \d+\/100/.test(mini2), `${perfil}: ficha com o perfil tático (marcação e recomposição)`);
  await p.locator(".jt-mini").screenshot({ path: `${OUT}${perfil}-ficha-serie-a.png` });
  await p.selectOption('[data-jt-f="lg"]', "");
  // 1º e 2º volante
  for (const [pos, rot] of [["VOL1", "1º volante"], ["VOL2", "2º volante"]]) {
    await p.click(`[data-jt-pos="${pos}"]`);
    await p.waitForTimeout(500);
    const vs = await p.locator(".jt-tabela tbody tr:not(.jt-mini-tr)").evaluateAll((trs) => trs.map((tr) => [tr.querySelector(".jt-pos-t")?.textContent.trim(), tr.querySelector(".jt-tag.vol")?.textContent || ""]));
    ok(vs.length > 0 && vs.every(([s2, t]) => s2 === "VOL" && t.startsWith(rot)), `${perfil}: filtro ${rot} só traz ${rot}s`, `${vs.length} linhas, ex.: ${vs[0]?.[1]}`);
  }
  // ficha de um 2º volante da Europa: escalações (ficha técnica do Transfermarkt)
  await p.fill('[data-jt-f="q"]', "elliot anderson");
  await p.waitForTimeout(700);
  await p.locator("[data-jt-ficha]").first().click();
  await p.waitForSelector(".jt-mini-tat", { timeout: 15000 });
  const mini3 = (await p.locator(".jt-mini-tat").innerText()).replace(/\s+/g, " ");
  ok(/2º volante/.test(mini3) && /Escalações \d+ como titular/.test(mini3) && /meio-campista/.test(mini3), `${perfil}: ficha do Elliot Anderson com a função e as escalações`, mini3.slice(0, 120));
  await p.locator(".jt-mini").screenshot({ path: `${OUT}${perfil}-ficha-volante.png` });
  await p.locator("[data-jt-ficha]").first().click();
  await p.fill('[data-jt-f="q"]', "");
  await p.click('[data-jt-pos=""]');

  const sobra = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(sobra <= 1, `${perfil}: sem rolagem para os lados`, `${sobra} px`);
  await p.screenshot({ path: `${OUT}${perfil}-reforcos.png` });

  // busca do topo com foto
  const campo = p.locator("#search");
  if (!(await campo.isVisible())) await p.locator('[aria-controls="search-results"], .search-toggle, [data-busca-abrir]').first().click().catch(() => {});
  await campo.click().catch(() => {});
  await campo.fill("kaio");
  await p.waitForTimeout(2500);
  await campo.fill("kaio j");
  await p.waitForTimeout(1500);
  const fb = await fotosCarregadas("#search-results .sr-num img");
  ok(fb.com >= 1, `${perfil}: a busca mostra a foto do jogador`, `${fb.com} de ${fb.total}`);
  ok(!erros.length, `${perfil}: nenhum erro de JavaScript`, erros.slice(0, 2).join(" | ").slice(0, 200));
  await ctx.close();
}
await b.close();
console.log(`\n${res.filter((r) => r.ok).length} de ${res.length} verificações passaram`);
process.exit(res.every((r) => r.ok) ? 0 : 1);
