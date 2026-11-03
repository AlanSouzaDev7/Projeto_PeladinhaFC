/* Rankings no celular: segurar o dedo no cartão mostra a prévia, deslizar troca, soltar abre a subpágina.
   Uso: npm run api (em outro terminal) e depois  node tests/mobile/rankings.mjs */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:8000";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ ...devices["Pixel 7"], locale: "pt-BR" })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/?estatico#/tabela`, { waitUntil: "load" });
await page.waitForTimeout(1200);
const box = await page.locator('[data-rank-preview="amarelos"]').boundingBox();
const box2 = await page.locator('[data-rank-preview="vermelhos"]').boundingBox();
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
await touch("touchStart", box.x + 30, box.y + 30);
await page.waitForTimeout(450);
const held = await page.evaluate(() => ({ open: document.getElementById("rank-preview").classList.contains("open"), title: document.querySelector("#rank-preview .rp-h b")?.textContent }));
await page.screenshot({ path: `${OUT}pixel7-ranking-previa.png` });
await touch("touchMove", box2.x + 30, box2.y + 30);
await page.waitForTimeout(200);
const slid = await page.evaluate(() => document.querySelector("#rank-preview .rp-h b")?.textContent);
await touch("touchEnd");
await page.waitForTimeout(900);
const after = await page.evaluate(() => location.hash);
// toque rápido abre direto
await page.goto(`${BASE}/?estatico#/tabela`); await page.waitForTimeout(900);
await page.locator('[data-rank-preview="gols"]').tap();
await page.waitForTimeout(900);
const tap = await page.evaluate(() => location.hash);
const over = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
await page.screenshot({ path: `${OUT}pixel7-ranking-gols.png`, fullPage: true });
console.log({ held, slid, after, tap, overflow: over, errors });
await browser.close();
