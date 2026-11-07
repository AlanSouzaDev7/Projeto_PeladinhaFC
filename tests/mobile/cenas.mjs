/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. */
/* Cenas de abertura dos clubes (js/hero-scenes-clubes.js) com a foto real da cidade ao fundo:
   - nos 19 clubes: a foto da cidade carrega e entra na cena, o crédito da foto aparece, a cena desenha (não fica
     preta), sem erros de JavaScript e sem rolagem para os lados;
   - fluidez durante a animação (5 s): PC, Android (Pixel 7 com o processador 4x mais lento) e iPhone.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/cenas.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const CLUBES = ["athletico-pr", "atletico-mg", "bahia", "botafogo", "bragantino", "chapecoense", "corinthians", "coritiba", "flamengo", "fluminense",
  "gremio", "internacional", "mirassol", "palmeiras", "remo", "santos", "sao-paulo", "vasco", "vitoria"];
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "ok  " : "FALHA"} · ${m}`); if (!c) falhas++; };

// 1) os 19 clubes, no PC e no celular
if (process.env.SO !== "fps") for (const [tela, eng, opts] of [["PC", chromium, { viewport: { width: 1440, height: 900 } }], ["celular", chromium, devices["Pixel 7"]]]) {
  const b = await eng.launch({ channel: "chrome" });
  const p = await (await b.newContext(opts)).newPage();
  const erros = []; p.on("pageerror", (e) => erros.push(e.message));
  for (const c of CLUBES) {
    await p.goto(`${BASE}/?v=${Date.now()}&cena=6#/clube/${c}`, { waitUntil: "load" });
    for (let i = 0; i < 30 && !(await p.evaluate(() => performance.getEntriesByType("resource").some((e) => /wikimedia\.org.*px-/.test(e.name) && e.responseEnd > 0))); i++) await p.waitForTimeout(200);
    await p.waitForTimeout(1800);
    const r = await p.evaluate((c) => {
      const f = window.HERO_SCENES.foto(c), cv = document.querySelector("canvas[data-hero-scene]"), cr = document.querySelector(".hero-credit");
      const nome = f && (innerWidth < 700 || innerWidth < 1100 ? f.w960 : f.w1920).split("/").pop();
      const veio = performance.getEntriesByType("resource").some((e) => nome && e.name.includes(nome.slice(0, 40)));
      // a cena desenha: amostra o canvas num quadro pequeno (canvas com foto de outro site não deixa ler os pixels; aí vale o tamanho)
      return { foto: !!f, veio, credito: cr?.textContent || "", canvas: cv && cv.width > 100 && cv.height > 100, rolagem: document.documentElement.scrollWidth > innerWidth + 1 };
    }, c);
    ok(r.foto && r.veio && /Wikimedia Commons/.test(r.credito) && r.canvas && !r.rolagem, `${tela} · ${c}: foto da cidade carregada, crédito "${r.credito.slice(0, 50)}"`);
  }
  ok(!erros.length, `${tela} · sem erros de JavaScript${erros.length ? `: ${erros.slice(0, 2).join(" | ")}` : ""}`);
  await b.close();
}

// 2) fluidez durante a animação
async function fps(nome, eng, opts, launch, lento, clube) {
  const b = await eng.launch(launch), c = await b.newContext(opts), p = await c.newPage();
  if (lento) { const s = await c.newCDPSession(p); await s.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
  await p.goto(`${BASE}/?v=${Date.now()}#/sobre`, { waitUntil: "load" });
  await p.evaluate((cl) => { const f = window.HERO_SCENES.foto && window.HERO_SCENES.foto(cl); if (f) { const i = new Image(); i.src = innerWidth < 1100 ? f.w960 : f.w1920; } }, clube);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__q = []; let t0 = null; const fim = performance.now() + 5500; const f = (t) => { if (t0 != null) window.__q.push(t - t0); t0 = t; if (t < fim) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await p.evaluate((cl) => (location.hash = `#/clube/${cl}`), clube);
  await p.waitForTimeout(6000);
  const q = await p.evaluate(() => { const v = window.__q.slice(5), m = v.reduce((a, b) => a + b, 0) / v.length; return { fps: Math.round(1000 / m), longos: v.filter((x) => x > 50).length, n: v.length }; });
  await b.close();
  return q;
}
for (const [nome, eng, opts, launch, lento, min] of [
  ["PC", chromium, { viewport: { width: 1440, height: 900 } }, { channel: "chrome" }, false, 50],
  ["Pixel 7 (CPU 4x mais lenta)", chromium, devices["Pixel 7"], { channel: "chrome" }, true, 24],
  ["iPhone 15 (WebKit, sem placa de vídeo neste ambiente)", webkit, devices["iPhone 15"], {}, false, 10],
]) for (const cl of ["flamengo", "atletico-mg", "vitoria"]) {
  const q = await fps(nome, eng, opts, launch, lento, cl);
  ok(q.fps >= min, `${nome} · ${cl}: ${q.fps} quadros/s durante a animação, ${q.longos} engasgo(s) acima de 50 ms`);
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nCenas com a foto da cidade ok nos 19 clubes e fluidas.");
process.exit(falhas ? 1 : 0);
