/* QA funcional — robustez: 20 trocas rápidas de rota, rede lenta (400 kbps), troca celular↔computador e
   cliques repetidos no compartilhar. Conta erros de JavaScript, "Carregando…" preso e rolagem lateral.
   Uso: BASE=http://127.0.0.1:5182 node tests/qa/funcional-robustez.mjs
   Saída: tests/qa/out/funcional/robustez.json */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5182";
const OUT = new URL("./out/funcional/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const R = { falhas: [], avisos: [], ok: [], erros: [] };
const falha = (m) => { R.falhas.push(m); console.log("FALHA ·", m); };
const aviso = (m) => { R.avisos.push(m); console.log("aviso ·", m); };
const ok = (m) => { R.ok.push(m); console.log("ok    ·", m); };
const b = await chromium.launch({ channel: "chrome" });

const nova = async (vp, motion = "reduce") => {
  const ctx = await b.newContext({ viewport: vp, locale: "pt-BR", reducedMotion: motion });
  await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erros.push(`console: ${m.text().slice(0, 160)}`); });
  return { ctx, p, erros };
};
const estado = (p) => p.evaluate(() => {
  const v = document.querySelector("#view"), t = v.innerText;
  return { hash: location.hash, vazio: t.trim().length < 30, carregando: /Carregando…|Montando o resumo…|Escalando…/.test(t), sx: document.documentElement.scrollWidth - innerWidth, cortina: document.querySelector("#curtain")?.className, titulo: v.querySelector("h1")?.innerText || "" };
});

const ROTAS = ["#/", "#/tabela", "#/clube/flamengo", "#/clube/palmeiras/estatisticas", "#/clubes", "#/jogador/268476-athletico-pr", "#/copa/libertadores", "#/rodada/36", "#/tabela/amarelos", "#/simulador", "#/clube/cruzeiro", "#/copa/serie-b", "#/bolao", "#/clube/santos/partidas", "#/previsao", "#/copa/copa-do-brasil", "#/xg", "#/clube/bahia", "#/copa/carioca", "#/tabela"];

/* 1) 20 trocas rápidas (com e sem animação: a cortina do clube dura ~1,6 s) */
for (const [motion, gap] of [["reduce", 120], ["no-preference", 150], ["no-preference", 40]]) {
  const { ctx, p, erros } = await nova({ width: 1366, height: 900 }, motion);
  await p.goto(`${BASE}/#/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);
  for (const h of ROTAS) { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(gap); }
  await p.waitForTimeout(4000);
  const s = await estado(p);
  const fim = ROTAS.at(-1);
  if (s.hash !== fim) falha(`troca rápida (${motion}, ${gap} ms): terminou em ${s.hash}`);
  const tabela = await p.locator("#view table.table").count();
  if (!tabela) falha(`troca rápida (${motion}, ${gap} ms): rota final #/tabela sem a tabela (título "${s.titulo}")`);
  if (s.vazio) falha(`troca rápida (${motion}, ${gap} ms): página final vazia`);
  if (s.carregando) falha(`troca rápida (${motion}, ${gap} ms): "Carregando…" preso`);
  if (s.cortina && s.cortina.trim() !== "curtain") falha(`troca rápida (${motion}, ${gap} ms): cortina presa com classe "${s.cortina}"`);
  if (erros.length) falha(`troca rápida (${motion}, ${gap} ms): ${erros.length} erros JS: ${[...new Set(erros)].slice(0, 3).join(" | ")}`);
  if (!erros.length && tabela && !s.carregando) ok(`troca rápida (${motion}, ${gap} ms): 20 rotas sem erro, termina na tabela`);
  // título da aba coerente com a rota
  const tt = await p.title();
  if (!/Classificação|CazéStats/.test(tt)) aviso(`troca rápida: título da aba "${tt}"`);
  R.erros.push(...erros);
  await ctx.close();
}

/* 2) rede lenta */
{
  const { ctx, p, erros } = await nova({ width: 390, height: 844 });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 200 * 1024 / 8 });
  const t0 = Date.now();
  await p.goto(`${BASE}/#/tabela`, { waitUntil: "domcontentloaded", timeout: 180000 });
  try { await p.waitForSelector("#view table.table", { timeout: 120000 }); ok(`rede lenta 400 kbps: tabela em ${((Date.now() - t0) / 1000).toFixed(1)} s`); }
  catch { falha(`rede lenta 400 kbps: tabela não apareceu em 120 s`); }
  for (const h of ["#/clube/flamengo", "#/jogador/268476-athletico-pr", "#/copa/libertadores"]) {
    const t1 = Date.now();
    await p.evaluate((x) => { location.hash = x; }, h);
    let s;
    for (let i = 0; i < 60; i++) { await p.waitForTimeout(1000); s = await estado(p); if (!s.vazio && !s.carregando) break; }
    if (s.vazio || s.carregando) falha(`rede lenta: ${h} ainda ${s.vazio ? "vazia" : "Carregando…"} após 60 s`);
    else ok(`rede lenta: ${h} em ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  }
  if (erros.length) falha(`rede lenta: erros JS: ${[...new Set(erros)].slice(0, 3).join(" | ")}`);
  R.erros.push(...erros);
  await ctx.close();
}

/* 3) troca de tamanho de janela */
{
  const { ctx, p, erros } = await nova({ width: 1366, height: 900 });
  for (const h of ["#/", "#/tabela", "#/clube/flamengo", "#/jogador/268476-athletico-pr", "#/rodada/36", "#/copa/libertadores", "#/clube/cruzeiro/mercado/reforcos"]) {
    await p.goto(`${BASE}/${h}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(3000);
    const res = [];
    for (const w of [390, 1366, 768, 390, 1366]) {
      await p.setViewportSize({ width: w, height: w < 500 ? 844 : 900 });
      await p.waitForTimeout(700);
      const s = await estado(p);
      const fora = await p.evaluate(() => [...document.querySelectorAll("#view *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 4 && getComputedStyle(e).position !== "fixed" && !e.closest("[class*=tabs], .chips, .scroll, [style*=overflow], .table-wrap, .carousel, .ticker, .hero, .rd-chips, .cpx-faixa"); }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}`));
      if (s.sx > 2) res.push(`${w}px: rolagem lateral ${s.sx}px`);
      if (fora.length) res.push(`${w}px: fora da tela ${fora.join(",")}`);
    }
    if (res.length) falha(`redimensionar ${h}: ${[...new Set(res)].join("; ")}`); else ok(`redimensionar ${h}: 390↔1366 sem rolagem lateral`);
  }
  if (erros.length) falha(`redimensionar: erros JS: ${[...new Set(erros)].slice(0, 3).join(" | ")}`);
  R.erros.push(...erros);
  await ctx.close();
}

/* 4) compartilhar: cliques repetidos e trocas de rota com a janela aberta */
{
  const { ctx, p, erros } = await nova({ width: 390, height: 844 });
  await p.goto(`${BASE}/#/tabela`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("[data-cp]", { timeout: 20000 });
  const bt = p.locator("[data-cp]").first();
  await bt.scrollIntoViewIfNeeded();
  await bt.evaluate((el) => { for (let i = 0; i < 10; i++) el.click(); });
  await p.waitForTimeout(4000);
  let d = await p.evaluate(() => ({ n: document.querySelectorAll("dialog.cp-dlg").length, open: document.querySelectorAll("dialog[open]").length }));
  if (d.n !== 1 || d.open !== 1) falha(`compartilhar: 10 cliques seguidos → ${d.n} diálogos, ${d.open} abertos`); else ok("compartilhar: 10 cliques seguidos → 1 diálogo aberto");
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  for (let i = 0; i < 4; i++) { await bt.click(); await p.waitForTimeout(2500); await p.keyboard.press("Escape"); await p.waitForTimeout(300); }
  d = await p.evaluate(() => ({ n: document.querySelectorAll("dialog.cp-dlg").length, open: document.querySelectorAll("dialog[open]").length }));
  if (d.n !== 1 || d.open) falha(`compartilhar: abrir/fechar 4x → ${d.n} diálogos, ${d.open} abertos`); else ok("compartilhar: abrir/fechar 4x reaproveita 1 diálogo");
  // com o diálogo aberto, voltar do navegador
  await bt.click(); await p.waitForTimeout(2500);
  await p.evaluate(() => { location.hash = "#/clube/flamengo"; });
  await p.waitForTimeout(2500);
  d = await p.evaluate(() => ({ open: document.querySelectorAll("dialog[open]").length }));
  if (d.open) aviso("compartilhar: diálogo continua aberto por cima depois de trocar de página");
  if (erros.length) falha(`compartilhar: erros JS: ${[...new Set(erros)].slice(0, 3).join(" | ")}`);
  R.erros.push(...erros);
  await ctx.close();
}

await b.close();
writeFileSync(`${OUT}robustez.json`, JSON.stringify(R, null, 1));
console.log(`\n${R.falhas.length} falhas, ${R.avisos.length} avisos`);
process.exitCode = R.falhas.length ? 1 : 0;
