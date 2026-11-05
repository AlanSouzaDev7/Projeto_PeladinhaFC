/* Ficha do artilheiro como botão: abre no clique (ou toque), continua aberta ao tirar o mouse e ao rolar
   (a ficha e a página), dá para chegar ao fim dela em telas baixas, e fecha clicando de novo, fora, no ✕ ou com Esc.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/ficha-clique.mjs */
import { chromium, webkit, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5174";
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));
const aberta = (p) => p.locator(".scorer-card.open").count().then(Boolean);

for (const [dev, L, opts, toque] of [
  ["pc-baixo", chromium, { viewport: { width: 1280, height: 600 } }, false],
  ["pc", chromium, { viewport: { width: 1440, height: 900 } }, false],
  ["iphone-se", webkit, devices["iPhone SE"], true],
  ["pixel", chromium, devices["Pixel 7"], true],
]) {
  const b = await L.launch(L === chromium ? { channel: "chrome" } : {});
  const p = await (await b.newContext({ ...opts, locale: "pt-BR" })).newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  await p.goto(`${BASE}/?f=${dev}#/tabela`, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const el = p.locator(".squad-list li[data-scorer]").nth(1);
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  const clica = (loc) => (toque ? loc.tap() : loc.click());

  await clica(el); await p.waitForTimeout(350);
  ok(await aberta(p), `${dev}: abre no clique`);
  ok((await el.getAttribute("aria-expanded")) === "true", `${dev}: aria-expanded no jogador`);
  if (!toque) { await p.mouse.move(5, 5); await p.waitForTimeout(400); ok(await aberta(p), `${dev}: continua aberta ao tirar o mouse`); }

  // rola a ficha até o fim
  const box = await p.locator(".scorer-card").boundingBox();
  const cabe = await p.evaluate(() => { const t = document.querySelector(".scorer-card"); return t.scrollHeight <= t.clientHeight + 1; });
  if (toque) await p.evaluate(() => { const t = document.querySelector(".scorer-card"); t.scrollTop = t.scrollHeight; t.dispatchEvent(new Event("scroll")); });
  else { await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(80); } }
  await p.waitForTimeout(400);
  const fim = await p.evaluate(() => {
    const t = document.querySelector(".scorer-card"), src = t.querySelector(".sc-src"), r = src.getBoundingClientRect(), c = t.getBoundingClientRect();
    return { visivel: r.top >= c.top - 1 && r.bottom <= c.bottom + 1 && r.bottom <= innerHeight, naTela: c.top >= 0 && c.bottom <= innerHeight + 1 && c.left >= 0 && c.right <= innerWidth + 1 };
  });
  ok(await aberta(p), `${dev}: continua aberta depois de rolar a ficha${cabe ? " (cabe inteira)" : ""}`);
  ok(fim.visivel && fim.naTela, `${dev}: o fim da ficha aparece e ela cabe na tela`);
  ok(await p.locator(".sc-close").isVisible(), `${dev}: botão ✕ continua visível no fim da ficha`);
  if (dev === "pc-baixo" || dev === "iphone-se") await p.screenshot({ path: `tests/mobile/out/ficha-clique-${dev}.png` });

  // rolar a página não fecha
  if (!toque) { await p.mouse.move(box.x > 400 ? 60 : opts.viewport.width - 60, 300); await p.mouse.wheel(0, 200); }
  else await p.evaluate(() => scrollBy(0, 150));
  await p.waitForTimeout(400);
  ok(await aberta(p), `${dev}: rolar a página não fecha`);

  // clicar de novo no jogador fecha
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  if (await el.isVisible()) {
    const hit = await el.evaluate((e) => { const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + 30, r.top + r.height / 2); return e.contains(t); });
    if (hit) { await (toque ? p.touchscreen.tap(...(await el.boundingBox().then((r) => [r.x + 30, r.y + r.height / 2]))) : p.mouse.click(...(await el.boundingBox().then((r) => [r.x + 30, r.y + r.height / 2])))); await p.waitForTimeout(350); ok(!(await aberta(p)), `${dev}: clicar de novo no jogador fecha`); }
    else console.log(`   ${dev}: a ficha cobre o jogador (celular): fecha pelo ✕`);
  }
  // fora, ✕ e Esc
  const abre = async () => { await el.scrollIntoViewIfNeeded(); if (await aberta(p)) return; await clica(el); await p.waitForTimeout(350); };
  await abre();
  // fora da ficha e de qualquer jogador: o título do card de artilharia
  const fora = await p.evaluate(() => { const h = [...document.querySelectorAll(".card-h")].find((x) => /^Artilharia/.test(x.textContent)); const r = h.getBoundingClientRect(); return [r.left + 20, r.top + r.height / 2]; });
  await (toque ? p.touchscreen.tap(...fora) : p.mouse.click(...fora)); await p.waitForTimeout(350);
  ok(!(await aberta(p)), `${dev}: clicar fora fecha`);
  await abre(); await clica(p.locator(".sc-close")); await p.waitForTimeout(350);
  ok(!(await aberta(p)), `${dev}: ✕ fecha`);
  if (!toque) { await abre(); await p.keyboard.press("Escape"); await p.waitForTimeout(350); ok(!(await aberta(p)), `${dev}: Esc fecha`);
    await el.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(350); ok(await aberta(p), `${dev}: Enter abre`);
    await p.keyboard.press("Enter"); await p.waitForTimeout(350); ok(!(await aberta(p)), `${dev}: Enter de novo fecha`); }
  await b.close();
}
console.log(erros.length ? "\nFALHAS:\n" + erros.join("\n") : "\nficha abre e fecha no clique em todos os aparelhos");
