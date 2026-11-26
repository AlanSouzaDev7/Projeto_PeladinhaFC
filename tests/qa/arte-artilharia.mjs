/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — QA da arte da artilharia (js/arte-artilharia.js)
   Para o Brasileirão, a Libertadores, a Sul-Americana e a Copa do Brasil: o botão aparece no card da artilharia, a
   imagem sai em 1080 x 1400 sem erro (canvas exportável = nenhuma imagem bloqueada), com as 5 faixas e todos com foto. Grava os PNGs.
   Uso: BASE=http://localhost:5173 node tests/qa/arte-artilharia.mjs
   ========================================================================== */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/arte/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const res = [];
const ok = (cond, nome, extra = "") => { res.push({ nome, ok: !!cond }); console.log(`${cond ? "ok    " : "FALHOU"} · ${nome}${extra ? ` (${extra})` : ""}`); };
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
if (!process.env.USAR_BANCO) await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));

for (const [comp, rota] of [["brasileirao", "#/tabela"], ["libertadores", "#/copa/libertadores"], ["sul-americana", "#/copa/sul-americana"], ["copa-do-brasil", "#/copa/copa-do-brasil"]]) {
  await p.goto(`${BASE}/${rota}`, { waitUntil: "load" });
  const sel = `[data-cp="artilharia"][data-cp-id="${comp}"]`;
  const temBotao = await p.waitForSelector(sel, { timeout: 30000 }).then(() => true).catch(() => false);
  ok(temBotao, `${comp}: botão de compartilhar no card da artilharia`);
  const r = await p.evaluate(async (c) => {
    try {
      const { canvas, semFoto } = await window.COMPARTILHAR._monta("artilharia", c);
      return { url: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height, semFoto };
    } catch (e) { return { erro: String(e?.message || e) }; }
  }, comp);
  ok(r.url && r.w === 1080 && r.h === 1400, `${comp}: imagem 1080 x 1400 exportada`, r.erro || `${Math.round((r.url?.length || 0) * 0.75 / 1024)} KB`);
  ok(r.semFoto && !r.semFoto.length, `${comp}: todos os jogadores com foto`, r.semFoto?.length ? `sem foto: ${r.semFoto.join(", ")}` : "");
  // clique no botão: abre a pré-visualização com a imagem pronta; Esc fecha e o foco volta ao botão
  await p.click(sel);
  const prev = await p.waitForSelector(".cp-dlg[open] [data-cp-img][src^='blob:']", { timeout: 30000 }).then(() => true).catch(() => false);
  const botoes = await p.locator(".cp-dlg[open] .cp-dlg-b:visible").allInnerTexts().catch(() => []);
  ok(prev && botoes.some((t) => /Baixar/.test(t)), `${comp}: clique abre a pré-visualização com Baixar${botoes.some((t) => /Compartilhar/.test(t)) ? " e Compartilhar" : ""}`);
  await p.keyboard.press("Escape");
  const fechou = await p.waitForFunction(() => !document.querySelector(".cp-dlg[open]"), null, { timeout: 5000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(300); // o evento "close" chega depois que a janela fecha
  ok(fechou && (await p.evaluate((s2) => !!document.activeElement?.matches?.(s2), sel)), `${comp}: Esc fecha a pré-visualização e devolve o foco ao botão`);
  if (r.url) writeFileSync(`${OUT}artilharia-${comp}.png`, Buffer.from(r.url.split(",")[1], "base64"));
}
ok(!erros.length, "nenhum erro de JavaScript", erros.slice(0, 2).join(" | ").slice(0, 200));
await b.close();
console.log(`\n${res.filter((x) => x.ok).length} de ${res.length} verificações passaram`);
