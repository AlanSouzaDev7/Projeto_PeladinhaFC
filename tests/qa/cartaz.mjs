/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* CazéStats.TV — QA do cartaz de compartilhar da Janela: monta um elenco no Cruzeiro (venda, reforço do PSG escalado),
   abre Compartilhar, exporta o canvas como PNG (falha se alguma foto travar o canvas) e grava a imagem.
   Uso: node tests/qa/cartaz.mjs <arquivo.png>   (com o site em http://localhost:5173) */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2];
const b = await chromium.launch({ channel: "chrome" }), ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
const erros = [];
const p = await ctx.newPage(); p.on("pageerror", (e) => erros.push(e.message));
await p.goto("http://localhost:5173/#/clube/cruzeiro/mercado/elenco");
await p.waitForSelector('[data-jt="cruzeiro"] :is(.jt-cards,.jt-escolha)');
if (await p.locator(".jt-escolha").isVisible()) await p.click('[data-jt-modo="manager"]');
await p.waitForSelector(".jt-cards");
await p.locator('.jt-card [data-jt-dec="vender"], .jt-card [data-jt-dec="liberar"]').first().click();
await p.goto("http://localhost:5173/#/clube/cruzeiro/mercado/reforcos");
await p.waitForSelector(".jt-tabela tbody tr");
await p.fill('[data-jt-f="q"]', "marquinhos"); await p.waitForTimeout(600);
await p.locator('.jt-tabela tbody tr:has-text("Paris") [data-jt-add]').click();
await p.goto("http://localhost:5173/#/clube/cruzeiro/mercado/escalacao"); await p.waitForTimeout(2500); await p.locator("[data-jt-auto-esc]").first().click().catch(() => console.log("sem botão de escalar automático")); await p.waitForTimeout(800);
await p.evaluate(() => { const k = "placar:janela-cruzeiro"; const s = JSON.parse(localStorage.getItem(k)); s.esc = s.esc || {}; s.esc[2] = "159047"; s.escManual = true; localStorage.setItem(k, JSON.stringify(s)); }); await p.goto("http://localhost:5173/#/clube/cruzeiro/mercado/compartilhar"); await p.reload();
await p.waitForSelector("[data-jt-cartaz]"); await p.waitForTimeout(6000);
const png = await p.evaluate(() => { try { return document.querySelector("[data-jt-cartaz]").toDataURL("image/png"); } catch (e) { return "ERRO " + e.message; } });
if (png.startsWith("ERRO")) console.log(png); else { writeFileSync(OUT, Buffer.from(png.split(",")[1], "base64")); console.log("PNG exportado", Math.round(png.length / 1024), "KB"); }
console.log("erros:", erros.join(" | ") || "nenhum");
await b.close();
