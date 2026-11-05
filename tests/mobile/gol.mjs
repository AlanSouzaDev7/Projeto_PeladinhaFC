/* Confere o "GOL!" do topo dos 20 clubes (js/goal-bug.js).
   - linha do tempo do Cruzeiro em quadros (placar neutro, escudo, GOL!, varredura, 1 · 0, final)
   - estado final dos 20 clubes numa folha só (PC) e no celular (Pixel 7)
   - topo de ponta a ponta da tela, sem rolagem lateral, sem erros
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/gol.mjs */
import { chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
const ids = ["athletico-pr", "atletico-mg", "bahia", "botafogo", "bragantino", "chapecoense", "corinthians", "coritiba", "cruzeiro", "flamengo", "fluminense", "gremio", "internacional", "mirassol", "palmeiras", "remo", "santos", "sao-paulo", "vasco", "vitoria"];
const report = { erros: [], clubes: {} };

// 1) linha do tempo do Cruzeiro, no PC
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => report.erros.push(`pc: ${e.message}`));
  await page.goto(`${BASE}/?estatico#/clube/cruzeiro`, { waitUntil: "load" });
  await page.waitForSelector(".gb.play");
  const t0 = Date.now();
  for (const t of [0.3, 0.8, 1.3, 2.2, 4.0, 4.5, 5.5, 7]) {
    await page.waitForTimeout(Math.max(0, t * 1000 - (Date.now() - t0)));
    await page.locator(".hero-gb").screenshot({ path: `${OUT}gol-cruzeiro-${String(t).replace(".", "_")}s.png` });
  }
  const hero = await page.evaluate(() => { const r = document.querySelector(".hero").getBoundingClientRect(); return { left: r.left, right: r.right, vw: innerWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
  report.topoPC = { ...hero, pontaAPonta: hero.left <= 0 && hero.right >= hero.cw - 1, rolagemLateral: hero.sw > hero.cw };
  await page.screenshot({ path: `${OUT}gol-cruzeiro-pagina.png` });
  await ctx.close();
}

// 2) os 20 clubes: estado final (sem animação), PC e celular
for (const [nome, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["celular", devices["Pixel 7"]]]) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => report.erros.push(`${nome}: ${e.message}`));
  for (const id of ids) {
    await page.goto(`${BASE}/?estatico#/clube/${id}`, { waitUntil: "load" });
    await page.waitForSelector(".gb");
    // espera as imagens (laço com evaluate: o waitForFunction do Playwright usa eval, que a política de segurança do site bloqueia)
    for (let t = 0; t < 100 && !(await page.evaluate(() => [...document.querySelectorAll(".gb img")].every((i) => i.complete))); t++) await page.waitForTimeout(100);
    await page.waitForTimeout(250);
    const info = await page.evaluate(() => {
      const gb = document.querySelector(".gb").getBoundingClientRect(), hero = document.querySelector(".hero").getBoundingClientRect();
      return { gbLeft: Math.round(gb.left), gbRight: Math.round(gb.right), vw: document.documentElement.clientWidth, heroW: Math.round(hero.width), rolagem: document.documentElement.scrollWidth > document.documentElement.clientWidth, frase: document.querySelector(".gb-motto b").textContent };
    });
    report.clubes[`${nome}:${id}`] = info;
    await page.locator(".hero-gb").screenshot({ path: `${OUT}gol-${nome}-${id}.png` });
  }
  await ctx.close();
}
writeFileSync(`${OUT}gol.json`, JSON.stringify(report, null, 2));
const ruins = Object.entries(report.clubes).filter(([, v]) => v.rolagem || v.gbLeft < 0 || v.gbRight > v.vw);
console.log("topo no PC:", report.topoPC);
console.log("erros:", report.erros);
console.log("clubes com problema:", ruins.length ? ruins : "nenhum");
await browser.close();
