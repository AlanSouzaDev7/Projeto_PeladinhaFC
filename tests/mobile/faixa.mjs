/* Faixa de notícias embaixo do menu: aparece em todas as páginas, a manchete troca a cada 8 s, a fita anda
   (e para com o mouse em cima), cada notícia é um link para a matéria, não cria rolagem para os lados e se atualiza
   sozinha (relógio adiantado em 30 min: busca o js/live-data.js novo, sem recarregar a página).
   Com "reduzir movimento", nada se mexe e a fita rola com o dedo.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/faixa.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));
for (const [dev, L, opts] of [["pc", chromium, { viewport: { width: 1440, height: 900 } }], ["iphone", webkit, devices["iPhone 15"]], ["pixel", chromium, devices["Pixel 7"]]]) {
  const b = await L.launch(L === chromium ? { channel: "chrome" } : {});
  const ctx = await b.newContext({ ...opts, locale: "pt-BR" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  await p.clock.install();
  let novo = false;
  await p.route(/js\/live-data\.js\?t=/, async (r) => {
    const res = await r.fetch(); let s = await res.text();
    if (novo) s = s.replace(/("manchetes": \{"updated": "[^"]*", "items": \[)/, `$1{"title": "MANCHETE NOVA DO TESTE", "link": "https://ge.globo.com/", "source": "ge", "ts": ${Math.floor(Date.now() / 1000)}, "clubes": ["flamengo"]}, `);
    r.fulfill({ body: s, contentType: "application/javascript" });
  });
  await p.clock.resume();
  for (const rota of ["#/", "#/clube/flamengo", "#/tabela", "#/bora-pro-jogo"]) {
    await p.goto(`${BASE}/?f=${Date.now()}${rota}`, { waitUntil: "load" });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => { const t = document.querySelector(".ticker"), h = document.querySelector(".header"); const a = t?.getBoundingClientRect(), c = h.getBoundingClientRect();
      return { vis: !!t && !t.hidden && a.height > 40, abaixo: a && a.top >= c.bottom - 1 && a.top - c.bottom < 20, itens: t?.querySelectorAll(".tk-copy:first-child .tk-item").length, larg: document.documentElement.scrollWidth > innerWidth + 1 }; });
    ok(r.vis && r.abaixo && r.itens >= 5 && !r.larg, `${dev} ${rota}: faixa logo abaixo do menu com ${r.itens} notícias, sem rolagem lateral`);
  }
  await p.goto(`${BASE}/?f=${Date.now()}#/`, { waitUntil: "load" }); await p.waitForTimeout(1200);
  const h0 = await p.locator(".tk-h.on b").textContent();
  const x0 = await p.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".tk-track")).transform).m41);
  await p.waitForTimeout(8600);
  const h1 = await p.locator(".tk-h.on b").textContent();
  const x1 = await p.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".tk-track")).transform).m41);
  ok(h0 !== h1, `${dev}: a manchete troca ("${h0.slice(0, 40)}…" → "${h1.slice(0, 40)}…")`);
  ok(x1 < x0 - 100, `${dev}: a fita anda (${Math.round(x0 - x1)} px em 8,6 s)`);
  if (dev === "pc") {
    await p.hover(".tk-run"); const a = await p.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".tk-track")).transform).m41);
    await p.waitForTimeout(1000); const c = await p.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".tk-track")).transform).m41);
    ok(Math.abs(a - c) < 1, `${dev}: a fita para com o mouse em cima`);
    await p.mouse.move(5, 600);
  }
  const link = await p.evaluate(() => { const a = document.querySelector(".tk-h.on"); return [a.href, a.target]; });
  ok(/^https?:\/\//.test(link[0]) && link[1] === "_blank", `${dev}: manchete abre a matéria em outra aba`);
  // 30 min depois: busca as manchetes novas sozinha
  novo = true;
  await p.clock.fastForward("30:05");
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => document.querySelector(".ticker").innerText.includes("MANCHETE NOVA DO TESTE"));
  ok(n, `${dev}: depois de 30 min a faixa se atualizou sozinha, sem recarregar a página`);
  if (dev === "pc") await p.screenshot({ path: "tests/mobile/out/faixa-pc.png", clip: { x: 0, y: 0, width: 1440, height: 170 } });
  await ctx.close();
  // reduzir movimento
  const ctx2 = await b.newContext({ ...opts, reducedMotion: "reduce" });
  const q = await ctx2.newPage();
  await q.goto(`${BASE}/?f=${Date.now()}#/`, { waitUntil: "load" }); await q.waitForTimeout(1200);
  const rm = await q.evaluate(() => ({ anim: getComputedStyle(document.querySelector(".tk-track")).animationName, rola: getComputedStyle(document.querySelector(".tk-run")).overflowX }));
  ok(rm.anim === "none" && rm.rola === "auto", `${dev}: com "reduzir movimento" a fita fica parada e rola com o dedo`);
  await ctx2.close();
  await b.close();
}
console.log(erros.length ? "\nFALHAS:\n" + erros.join("\n") : "\nfaixa de notícias ok no PC, iPhone e Android");
