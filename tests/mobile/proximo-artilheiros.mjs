/* "Próximo jogo" passando pelos jogos da rodada e ficha do artilheiro (mouse no PC, toque no celular).
   Uso: python -m http.server 5173  e depois  BASE=http://localhost:5173 node tests/mobile/proximo-artilheiros.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const res = {};
for (const [name, eng, opts, launch] of [["pc", chromium, { viewport: { width: 1440, height: 900 } }, { channel: "chrome" }], ["pixel7", chromium, devices["Pixel 7"], { channel: "chrome" }], ["iphone15", webkit, devices["iPhone 15"], {}]]) {
  const b = await eng.launch(launch);
  const p = await (await b.newContext({ ...opts, locale: "pt-BR" })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${BASE}/?estatico&v=${Date.now()}#/`, { waitUntil: "load" });
  await p.waitForTimeout(4000);
  const card = () => p.evaluate(() => { const c = document.querySelector("[data-feature]"); return { id: c.dataset.feature, nav: c.querySelector(".feat-nav")?.innerText.replace(/\s+/g, " "), vote: document.querySelector("aside [data-vote-card]")?.dataset.voteCard }; });
  const seq = [await card()];
  await p.locator("[data-feature]").scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}${name}-proximo-1.png` });
  const next = p.locator('[data-feature] .feat-nav button[aria-label="Próximo jogo da rodada"]');
  for (let i = 0; i < 12 && (await next.isEnabled()); i++) { await (name === "pc" ? next.click() : next.tap()); await p.waitForTimeout(350); seq.push(await card()); }
  await p.screenshot({ path: `${OUT}${name}-proximo-ultimo.png` });
  const ultimoDesligado = !(await next.isEnabled());
  await (name === "pc" ? p.locator('[data-feature] .feat-dots button').first().click() : p.locator('[data-feature] .feat-dots button').first().tap()); await p.waitForTimeout(300);
  const voltou = (await card()).id === seq[0].id;
  if (name !== "pc") { // arrastar para o lado
    const bx = await p.locator("[data-feature] .feat-link").boundingBox();
    await p.evaluate(({ x, y }) => {
      const el = document.querySelector("[data-feature]");
      const t = (cx) => [new Touch({ identifier: 1, target: el, clientX: cx, clientY: y })];
      el.dispatchEvent(new TouchEvent("touchstart", { touches: t(x + 120), changedTouches: t(x + 120), bubbles: true }));
      el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: t(x - 20), bubbles: true }));
    }, { x: bx.x + bx.width / 2, y: bx.y + 40 }).catch(() => {});
    await p.waitForTimeout(400);
  }
  const arrastou = (await card()).id;
  // ficha do artilheiro
  const li = p.locator("aside [data-scorer]").first();
  await li.scrollIntoViewIfNeeded();
  await p.waitForTimeout(900); // rolagem suave terminar
  if (name === "pc") await li.hover(); else await li.tap();
  await p.waitForTimeout(400);
  const ficha = await p.evaluate(() => {
    const t = document.querySelector(".scorer-card.open");
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { nome: t.querySelector(".sc-h b")?.textContent, campos: t.querySelectorAll(".sc-ficha div").length, adversarios: t.querySelectorAll(".sc-adv li").length,
      primeiro: t.querySelector(".sc-adv li")?.innerText.replace(/\s+/g, " "), naTela: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight + 1, larg: Math.round(r.width) };
  });
  await p.screenshot({ path: `${OUT}${name}-artilheiro-ficha.png` });
  if (name === "pc") await p.mouse.move(5, 5); else await p.touchscreen.tap(5, 300);
  await p.waitForTimeout(350);
  const fechou = !(await p.locator(".scorer-card.open").count());
  const rolagem = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  res[name] = { jogos: seq.map((s) => `${s.id.replace(/-r\d+$/, "")} [${s.nav}]`), votoAcompanha: seq.every((s) => s.vote === s.id), ultimoDesligado, voltou, arrastou: arrastou !== seq[0].id ? arrastou : "não mudou", ficha, fechou, rolagemLateral: rolagem, erros: errs };
  await b.close();
}
console.log(JSON.stringify(res, null, 2));
