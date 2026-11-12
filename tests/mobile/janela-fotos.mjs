/* Capturas da janela de transferências (para revisão visual): elenco, reforços com um negócio fechado, escalação 3D
   (com um jogador arrastado para outra posição) e o cartaz, no PC e no celular. Grava em tests/mobile/shots/janela-*.png.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/janela-fotos.mjs [clube] [--privado] */
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const cid = process.argv.find((a, i) => i > 1 && !a.startsWith("--")) || "cruzeiro";
const privado = process.argv.includes("--privado");
const OUT = new URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
for (const [nome, ctxOpts] of [["pc", { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 }], ["cel", { ...devices["Pixel 7"] }]]) {
  const ctx = await browser.newContext({ ...ctxOpts, colorScheme: "dark" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("ERRO na página:", e.message));
  await page.goto(`${BASE}/${privado ? "?privado=fotos" : "?privado=0"}#/clube/${cid}/mercado/elenco`);
  await page.evaluate((c) => localStorage.setItem(`placar:janela-${c}`, JSON.stringify({ modo: "real", dec: {}, chegadas: [], form: "4-2-3-1", esc: {}, pos: {} })), cid);
  await page.reload();
  await page.waitForSelector(".jt-card", { timeout: 20000 });
  await page.waitForTimeout(800);
  const jt = page.locator(".jt");
  await jt.screenshot({ path: `${OUT}janela-${nome}-elenco.png` });
  await page.goto(`${BASE}/#/clube/${cid}/mercado/reforcos`);
  await page.waitForSelector("[data-jt-add]", { timeout: 30000 });
  await page.selectOption('select[data-jt-f="vMax"]', "5000000");
  await page.waitForTimeout(500);
  await page.locator("[data-jt-add]:not([disabled])").nth(2).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}janela-${nome}-carimbo.png` });
  await page.waitForTimeout(1600);
  await jt.screenshot({ path: `${OUT}janela-${nome}-reforcos.png` });
  await page.goto(`${BASE}/#/clube/${cid}/mercado/escalacao`);
  await page.waitForSelector(".jt-ficha", { timeout: 20000 });
  await page.waitForTimeout(700);
  // arrasta o camisa 10 (meia central) para a ponta direita
  const f = page.locator('.jt-ficha[data-jt-slot="8"]'), b = await f.boundingBox(), campo = await page.locator("[data-jt-campo]").boundingBox();
  if (b && campo) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(campo.x + campo.width * 0.86, campo.y + campo.height * 0.3, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  await page.locator(".jt-esc").screenshot({ path: `${OUT}janela-${nome}-escalacao.png` });
  await page.goto(`${BASE}/#/clube/${cid}/mercado/compartilhar`);
  await page.waitForSelector("[data-jt-cartaz]");
  await page.waitForTimeout(1500);
  await page.locator("[data-jt-cartaz]").screenshot({ path: `${OUT}janela-${nome}-cartaz.png` });
  await ctx.close();
}
await browser.close();
console.log("capturas em", OUT);
