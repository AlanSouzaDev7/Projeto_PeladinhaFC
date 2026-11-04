/* ==========================================================================
   PLACAR — testes em celular
   iPhone 15 (motor WebKit, o mesmo do Safari) e Pixel 7 (Chrome Android).
   Para cada página: erros, rolagem para os lados, alvos de toque pequenos,
   texto pequeno demais, fluidez da animação do topo e prints.

   Uso:  npm run api            (em outro terminal)
         npm run test:mobile    (resultado em tests/mobile/out/)
   ========================================================================== */
import { chromium, webkit, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8000";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["inicio", "#/"],
  ["clubes", "#/clubes"],
  ["clube", "#/clube/flamengo"],
  ["elenco", "#/clube/flamengo/elenco"],
  ["tabela", "#/tabela"],
  ["bora", "#/bora-pro-jogo/flamengo/palmeiras"],
  ["partida", "#/partida/bragantino-x-santos-r34"],
  ["sobre", "#/sobre"],
  ["ranking", "#/tabela/gols"],
  ["partidas", "#/clube/cruzeiro/partidas"],
  ["estatist", "#/clube/palmeiras/estatisticas"],
];
const DEVICES = [
  { name: "pc", engine: chromium, device: { viewport: { width: 1440, height: 900 } }, launch: { channel: "chrome" } },
  { name: "iphone15", engine: webkit, device: devices["iPhone 15"] },
  { name: "pixel7", engine: chromium, device: devices["Pixel 7"], launch: { channel: "chrome" } },
];

/* roda dentro da página: mede problemas de layout para celular */
function audit() {
  const vw = innerWidth, out = { vw, vh: innerHeight };
  out.scrollW = document.documentElement.scrollWidth;
  out.overflow = out.scrollW > vw + 1;
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity !== 0; };
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
  // o que passa da borda direita
  out.wide = [...document.querySelectorAll("body *")].filter((el) => { const r = el.getBoundingClientRect(); return vis(el) && r.right > vw + 2 && !el.closest(".hero, .match-hero, .club-tabs, .curtain, canvas, .tabs, .dates, .chips, .lu-list ul") ; })
    .slice(0, 8).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} → ${Math.round(el.getBoundingClientRect().right)}px`);
  // alvos de toque menores que 40px (recomendação: 44px no iOS, 48dp no Android)
  const taps = [...document.querySelectorAll("a, button, select, [data-slot], [data-player]")].filter(vis);
  const small = taps.filter((el) => { const r = el.getBoundingClientRect(); return (r.width < 40 || r.height < 32) && !el.closest(".footer"); });
  out.taps = taps.length; out.smallTaps = small.length;
  out.smallTapSamples = [...new Set(small.map((el) => `${label(el)} (${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)})`))].slice(0, 8);
  // texto muito pequeno
  const texts = [...document.querySelectorAll("body *")].filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const tiny = texts.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 11);
  out.tinyText = tiny.length; out.tinySamples = [...new Set(tiny.map((el) => `${label(el)} (${getComputedStyle(el).fontSize})`))].slice(0, 6);
  // acessibilidade básica: botões e links sem nome, imagens sem descrição, ids repetidos
  const named = (el) => (el.getAttribute("aria-label") || el.textContent || el.title || el.querySelector("img[alt]")?.alt || "").trim();
  out.unnamed = [...document.querySelectorAll("a[href], button")].filter((el) => vis(el) && !named(el)).map((el) => el.outerHTML.slice(0, 70)).slice(0, 5);
  out.noAlt = [...document.querySelectorAll("img:not([alt])")].length;
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
  out.dupIds = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  out.title = document.title;
  return out;
}

/* fluidez: quadros por segundo da página durante 2 s */
const fps = () => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(Math.round(n / 2)); }; requestAnimationFrame(f); });

const report = {};
for (const D of DEVICES) {
  const browser = await D.engine.launch(D.launch || {});
  const ctx = await browser.newContext({ ...D.device, locale: "pt-BR" });
  report[D.name] = {};
  for (const [name, hash] of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(`${BASE}/?estatico${name === "clube" ? "&cena=9" : ""}${hash}`, { waitUntil: "load" });
    await page.waitForTimeout(name === "elenco" ? 1800 : 1400);
    const res = await page.evaluate(audit);
    res.loadMs = Date.now() - t0;
    if (name === "clube") res.fps = await page.evaluate(fps);
    if (name === "elenco") {
      // arrastar com o dedo: um reserva até a posição do centroavante
      res.touchDrag = await page.evaluate(async () => {
        localStorage.removeItem("placar:xi2:flamengo");
        const lu = document.querySelector("[data-lineup]");
        const from = lu.querySelector('[data-slot="bench"][data-i="0"]'), to = [...lu.querySelectorAll('[data-slot="xi"]')].pop();
        const name = from.querySelector(".nm").textContent, before = to.querySelector(".nm").innerText;
        const p = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + 12]; };
        const ev = (type, el, [x, y]) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: "touch", isPrimary: true }));
        const a = p(from), b = p(to);
        ev("pointerdown", from, a);
        for (let k = 1; k <= 8; k++) { await new Promise((r) => setTimeout(r, 16)); ev("pointermove", document, [a[0] + (b[0] - a[0]) * k / 8, a[1] + (b[1] - a[1]) * k / 8]); }
        ev("pointerup", document, b);
        const after = [...document.querySelector("[data-lineup]").querySelectorAll('[data-slot="xi"]')].pop().querySelector(".nm").innerText.replace(/\n/g, " ");
        return { moved: name, before: before.replace(/\n/g, " "), after, ok: after === name };
      });
    }
    res.errors = errors;
    await page.screenshot({ path: `${OUT}${D.name}-${name}.png` });
    await page.screenshot({ path: `${OUT}${D.name}-${name}-inteira.png`, fullPage: true });
    report[D.name][name] = res;
    await page.close();
  }
  await browser.close();
}
writeFileSync(`${OUT}relatorio.json`, JSON.stringify(report, null, 2));

/* resumo legível */
for (const [dev, pages] of Object.entries(report)) {
  console.log(`\n=== ${dev} ===`);
  for (const [p, r] of Object.entries(pages)) {
    const flags = [r.touchDrag && `arrastar com o dedo: ${r.touchDrag.ok ? "ok" : "FALHOU"} (${r.touchDrag.moved} no lugar de ${r.touchDrag.before})`, r.overflow && `ROLA PARA O LADO (${r.scrollW}px > ${r.vw}px)`, r.smallTaps && `${r.smallTaps}/${r.taps} alvos pequenos`, r.tinyText && `${r.tinyText} textos < 11px`, r.errors.length && `${r.errors.length} erros`, r.fps && `${r.fps} fps`, r.unnamed.length && `${r.unnamed.length} sem nome`, r.noAlt && `${r.noAlt} img sem alt`, r.dupIds.length && `ids repetidos: ${r.dupIds.join(",")}`].filter(Boolean);
    console.log(`${p.padEnd(8)} ${r.loadMs}ms  ${flags.join(" · ") || "ok"}`);
    if (r.wide.length) console.log("   largos:", r.wide.join(" | "));
    if (r.smallTapSamples.length) console.log("   toque:", r.smallTapSamples.join(" | "));
    if (r.tinySamples.length) console.log("   texto:", r.tinySamples.join(" | "));
    if (r.errors.length) console.log("   erros:", r.errors.slice(0, 3).join(" | "));
    if (r.unnamed.length) console.log("   sem nome:", r.unnamed.join(" | "));
  }
}
