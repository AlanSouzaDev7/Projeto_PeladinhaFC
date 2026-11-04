/* Bora pro jogo: mapa de calor de quem está sendo arrastado.
   PC (mouse) e Pixel 7 (dedo): segura um lateral, um volante e o centroavante de cada time e confere,
   no meio do arraste, o cartão (nome, posições em %, jogos) e o mapa pintado do lado certo do campo;
   ao soltar, o mapa some. Prints em tests/mobile/out/calor-*.png
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/bora-calor.mjs */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const PAR = process.env.PAR || "flamengo/palmeiras";
const browser = await chromium.launch({ channel: "chrome" });
const res = {};

for (const [nome, opts, touch] of [["pc", { viewport: { width: 1440, height: 900 } }, false], ["pixel7", devices["Pixel 7"], true]]) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark" });
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?estatico#/bora-pro-jogo/${PAR}`, { waitUntil: "load" });
  await page.evaluate(() => localStorage.removeItem("placar:bora"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.HEATMAPS, null, { timeout: 8000 }).catch(() => {});
  await page.locator(".board").scrollIntoViewIfNeeded(); await page.waitForTimeout(1000);
  const cdp = touch ? await ctx.newCDPSession(page) : null;
  const rows = [];
  for (const [side, i] of [["a", 1], ["a", 5], ["a", 10], ["b", 4], ["b", 10]]) {
    const tok = page.locator(`.bt[data-side="${side}"][data-i="${i}"] span`);
    const b0 = await tok.boundingBox(); const from = { x: b0.x + b0.width / 2, y: b0.y + b0.height / 2 }, to = { x: from.x + 18, y: from.y + 10 };
    if (touch) { await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] }); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [to] }); }
    else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 4 }); }
    await page.waitForTimeout(450);
    const info = await page.evaluate((side) => {
      const card = document.querySelector(".board-heatcard"), cv = document.querySelector(".board-heat");
      const g = cv.getContext("2d"), { width: w, height: h } = cv, d = g.getImageData(0, 0, w, h).data;
      // onde está o calor: média da coluna ponderada pela transparência (0 = esquerda, 1 = direita)
      let sx = 0, sa = 0, quente = 0;
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const a = d[(y * w + x) * 4 + 3]; sx += x * a; sa += a; if (a > 150) quente++; }
      return { visivel: !card.hidden && card.classList.contains("on") && cv.classList.contains("on"), nome: card.querySelector(".hc-head b")?.textContent, posicoes: [...card.querySelectorAll(".hc-roles span")].map((x) => x.textContent).join(" · "), meta: card.querySelector(".hc-meta")?.textContent, centro: sa ? +(sx / sa / w).toFixed(2) : null, quente };
    }, side);
    if (rows.length < 2 || i === 10) await page.locator(".board-card").screenshot({ path: `${OUT}calor-${nome}-${side}${i}.png` });
    if (touch) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); else await page.mouse.up();
    await page.waitForTimeout(350);
    const sumiu = await page.evaluate(() => !document.querySelector(".board-heat").classList.contains("on"));
    rows.push({ jogador: `${side}${i}`, ...info, sumiuAoSoltar: sumiu });
  }
  res[nome] = { rows, erros };
  await ctx.close();
}
for (const [k, r] of Object.entries(res)) { console.log(`\n=== ${k} ===`); console.table(r.rows); console.log("erros:", r.erros); }
await browser.close();
