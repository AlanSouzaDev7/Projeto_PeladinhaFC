/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. */
/* Fita de notícias andando e escudos grandes da faixa da partida, em aparelhos de tamanhos e formatos diferentes
   (Chrome e Safari/WebKit; telas de 320 px a 2560 px; retrato e paisagem).
   Fita: anda normalmente, com as animações do aparelho desligadas (Windows, iPhone, Android), depois de clicar numa
   notícia (o foco fica no link) e depois de um toque no celular; para com o mouse em cima e no botão de pausa.
   Escudos: grandes, nítidos (imagem de 330 px), entram com animação, sem sair da faixa nem criar rolagem para os lados.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/movimento.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "FALHA"} · ${msg}`); if (!c) falhas++; };
const pos = (p) => p.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".tk-track")).transform).m41);
const anda = async (p, ms = 2500) => { const a = await pos(p); await p.waitForTimeout(ms); return Math.round(a - (await pos(p))); };

const APARELHOS = [
  ["PC Full HD (Chrome)", chromium, { viewport: { width: 1920, height: 1080 } }, { channel: "chrome" }],
  ["Notebook 1366 (Chrome)", chromium, { viewport: { width: 1366, height: 768 } }, { channel: "chrome" }],
  ["Monitor 2560 (Chrome)", chromium, { viewport: { width: 2560, height: 1440 } }, { channel: "chrome" }],
  ["MacBook (Safari)", webkit, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, {}],
  ["iPad (Safari)", webkit, devices["iPad (gen 7)"], {}],
  ["iPad paisagem (Safari)", webkit, devices["iPad (gen 7) landscape"], {}],
  ["Galaxy Tab S4 (Chrome)", chromium, devices["Galaxy Tab S4"], { channel: "chrome" }],
  ["iPhone SE (Safari)", webkit, devices["iPhone SE"], {}],
  ["iPhone 15 Pro Max (Safari)", webkit, devices["iPhone 15 Pro Max"], {}],
  ["iPhone 15 paisagem (Safari)", webkit, devices["iPhone 15 landscape"], {}],
  ["Pixel 7 (Chrome)", chromium, devices["Pixel 7"], { channel: "chrome" }],
  ["Galaxy S8 (Chrome)", chromium, devices["Galaxy S8"], { channel: "chrome" }],
  ["Celular pequeno 320 px (Chrome)", chromium, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { channel: "chrome" }],
];

let jogo = null;
for (const [nome, eng, opts, launch] of APARELHOS) {
  let b;
  try { b = await eng.launch(launch); } catch (e) { ok(false, `${nome}: navegador não abriu (${e.message.split("\n")[0]})`); continue; }
  const toque = !!opts.hasTouch;
  for (const reduz of [false, true]) {
    const ctx = await b.newContext({ ...opts, locale: "pt-BR", reducedMotion: reduz ? "reduce" : "no-preference" });
    const p = await ctx.newPage();
    const erros = [];
    p.on("pageerror", (e) => erros.push(e.message));
    await p.goto(`${BASE}/?f=${Date.now()}#/`, { waitUntil: "load" });
    for (let i = 0; i < 20 && !(await p.evaluate(() => !!document.querySelector(".tk-track"))); i++) await p.waitForTimeout(250);
    await p.waitForTimeout(600);
    const tag = `${nome}${reduz ? " · animações do aparelho desligadas" : ""}`;
    ok((await anda(p)) > 40, `${tag}: a fita anda`);
    // depois de clicar numa notícia (abre em outra aba; o foco fica no link)
    await p.evaluate(() => { const a = document.querySelectorAll(".tk-item").forEach((a) => a.addEventListener("click", (e) => e.preventDefault())); });
    if (toque) { const bb = await p.locator(".tk-run").boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); } else { await p.click(".tk-copy .tk-item", { force: true }); await p.mouse.move(10, 700); }
    await p.waitForTimeout(300);
    ok((await anda(p)) > 40, `${tag}: continua andando depois de ${toque ? "tocar" : "clicar"} numa notícia`);
    if (!reduz) {
      if (!toque) { await p.hover(".tk-run"); await p.waitForTimeout(200); ok(Math.abs(await anda(p, 1200)) < 2, `${tag}: para com o mouse em cima`); await p.mouse.move(10, 700); await p.waitForTimeout(200); }
      // botão de pausa (e volta)
      await p.evaluate(() => document.querySelector(".tk-pause").click());
      const parado = Math.abs(await anda(p, 1200)) < 2, rotulo = await p.getAttribute(".tk-pause", "aria-label");
      await p.evaluate(() => document.querySelector(".tk-pause").click());
      ok(parado && /Continuar/.test(rotulo) && (await anda(p, 1500)) > 20, `${tag}: o botão pausa e retoma a fita`);
      const larg = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      ok(!larg, `${tag}: a faixa não cria rolagem para os lados`);
    }
    // escudos da faixa da partida
    if (!jogo) jogo = await p.evaluate(() => { const r = Object.keys(window.PD.FIXTURES).map(Number).sort((a, b) => a - b); const g = window.PD.FIXTURES[35]?.find((x) => x[0] === "cruzeiro" || x[1] === "cruzeiro") || window.PD.FIXTURES[r[r.length - 1]][0]; return `${g[0]}-x-${g[1]}-r${window.PD.FIXTURES[35]?.includes(g) ? 35 : r[r.length - 1]}`; });
    await p.goto(`${BASE}/?f=${Date.now()}#/partida/${jogo}`, { waitUntil: "load" });
    for (let i = 0; i < 20 && !(await p.evaluate(() => document.querySelector(".match-hero")?.classList.contains(matchMedia("(prefers-reduced-motion: reduce)").matches ? "escudos-ok" : "escudos-entram"))); i++) await p.waitForTimeout(150);
    const animou = await p.evaluate(() => [...document.querySelectorAll(".match-hero .scoreline .crest")].map((c) => c.getAnimations().length));
    await p.waitForTimeout(1600);
    const r = await p.evaluate(() => {
      const hero = document.querySelector(".match-hero"), hr = hero.getBoundingClientRect();
      const cs = [...hero.querySelectorAll(".scoreline .crest")].map((c) => { const b = c.getBoundingClientRect(); return { w: Math.round(b.width), nat: c.naturalWidth || 0, dentro: b.left >= -1 && b.right <= innerWidth + 1 && b.top >= hr.top && b.bottom <= hr.bottom, op: +getComputedStyle(c).opacity }; });
      const sc = hero.querySelector(".big").getBoundingClientRect(), [e, d] = [...hero.querySelectorAll(".scoreline .crest")].map((c) => c.getBoundingClientRect());
      return { cs, cruza: e.right > sc.left + 2 || d.left < sc.right - 2, larg: document.documentElement.scrollWidth > innerWidth + 1, classe: hero.className };
    });
    const minimo = innerWidthOf(opts) <= 420 ? 70 : 84;
    ok(r.cs.length === 2 && r.cs.every((c) => c.w >= minimo && c.dentro && c.op === 1 && (c.nat === 0 || c.nat >= 240)) && !r.cruza && !r.larg,
      `${tag}: escudos de ${r.cs.map((c) => c.w).join(" e ")} px (imagem ${r.cs.map((c) => c.nat).join("/")} px), dentro da faixa, sem encostar no placar`);
    ok(reduz ? animou.every((n) => n === 0) : animou.every((n) => n >= 1), `${tag}: ${reduz ? "escudos aparecem direto, sem animação" : "escudos entram com animação"}`);
    if (!reduz && /iPhone SE|Full HD|Pixel/.test(nome)) await p.locator(".match-hero").screenshot({ path: `tests/mobile/out/escudos-${nome.split(" (")[0].replace(/\W+/g, "-")}.png` });
    ok(!erros.length, `${tag}: sem erros de JavaScript${erros.length ? `: ${erros[0]}` : ""}`);
    await ctx.close();
  }
  await b.close();
}
function innerWidthOf(o) { return (o.viewport || {}).width || 9999; }
console.log(falhas ? `\n${falhas} falha(s)` : "\nFita andando e escudos ok em todos os aparelhos.");
process.exit(falhas ? 1 : 0);
