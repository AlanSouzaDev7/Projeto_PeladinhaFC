/* Bora pro jogo: arrastar jogadores na prancheta em tempo real.
   - PC (mouse) e Pixel 7 (dedo, eventos de toque de verdade): o jogador acompanha durante o arraste,
     fica onde foi solto, continua lá depois de recarregar e "Restaurar posições" desfaz.
   - Na fase "ataca", a seta sai da posição sem a bola até onde o jogador foi solto.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/bora-arrastar.mjs */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
const res = {};

for (const [nome, opts, touch] of [["pc", { viewport: { width: 1440, height: 900 } }, false], ["pixel7", devices["Pixel 7"], true]]) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR" });
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?estatico#/bora-pro-jogo/flamengo/palmeiras`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const tok = page.locator('.bt[data-side="a"][data-i="9"]');
  await tok.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const field = await page.locator(".board").boundingBox();
  const b0 = await tok.locator("span").boundingBox();
  const from = { x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 }, to = { x: field.x + field.width * 0.7, y: field.y + field.height * 0.25 };
  const meio = [], y0 = await page.evaluate(() => scrollY);
  const steps = 12;
  if (touch) {
    const cdp = await ctx.newCDPSession(page);
    const t = (type, p) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
    await t("touchStart", from);
    for (let i = 1; i <= steps; i++) { await t("touchMove", { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }); if (i === 6) meio.push(await tok.locator("span").boundingBox()); }
    await t("touchEnd");
  } else {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); if (i === 6) meio.push(await tok.locator("span").boundingBox()); }
    await page.mouse.up();
  }
  await page.waitForTimeout(300);
  const b1 = await tok.locator("span").boundingBox();
  const solto = Math.hypot(b1.x + b1.width / 2 - to.x, b1.y + b1.height / 2 - to.y);
  const mid = { x: from.x + (to.x - from.x) / 2, y: from.y + (to.y - from.y) / 2 };
  const acompanhou = Math.hypot(meio[0].x + meio[0].width / 2 - mid.x, meio[0].y + meio[0].height / 2 - mid.y);
  const rolou = (await page.evaluate(() => scrollY)) - y0;
  await page.locator(".board-card").screenshot({ path: `${OUT}${nome}-bora-arrastado.png` });
  // na fase de ataque: arrasta também e confere a seta
  await page.locator('[data-phase="a"]').click(); await page.waitForTimeout(1100);
  const setas = await page.locator(".board-arrows line").count();
  // recarrega: continua lá
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1500);
  await tok.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const b2 = await tok.locator("span").boundingBox(), f2 = await page.locator(".board").boundingBox();
  const guardou = Math.abs((b2.x + b2.width / 2 - f2.x) / f2.width - 0.7) < 0.02;
  // restaurar
  await page.locator("[data-board-reset]").click(); await page.waitForTimeout(1100);
  const b3 = await tok.locator("span").boundingBox();
  const voltou = Math.hypot(b3.x - b0.x, b3.y - b0.y) < 4 || Math.abs((b3.x + b3.width / 2 - f2.x) / f2.width - (from.x - field.x) / field.width) < 0.02;
  res[nome] = { "acompanhou o dedo/mouse (px de erro no meio)": +acompanhou.toFixed(1), "ficou onde soltou (px)": +solto.toFixed(1), "página rolou durante o arraste (px)": rolou, "setas no ataque": setas, "guardou ao recarregar": guardou, "restaurar desfez": voltou, erros };
  await ctx.close();
}
console.log(res);
await browser.close();
