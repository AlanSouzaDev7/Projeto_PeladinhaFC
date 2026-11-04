/* Campinho do elenco (aba "Elenco" de cada clube): nomes legíveis e sem encostar uns nos outros.
   Para os 20 clubes, no PC (tela cheia e notebook 1280×720), iPhone 15 e Pixel 7:
   - etiquetas de nome do campo que se sobrepõem (nome com nome, ou nome com bolinha de outro jogador)
   - nomes cortados com "…" e tamanho da letra
   - reservas: nome cortado e altura das linhas
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/elenco.mjs */
import { chromium, webkit, devices } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const ids = (process.env.CLUBES || "athletico-pr,atletico-mg,bahia,botafogo,bragantino,chapecoense,corinthians,coritiba,cruzeiro,flamengo,fluminense,gremio,internacional,mirassol,palmeiras,remo,santos,sao-paulo,vasco,vitoria").split(",");
const FOTOS = ["cruzeiro", "flamengo", "vasco"];

function audit() {
  const box = (el) => el.getBoundingClientRect();
  const hit = (a, b, pad = 1) => a.left < b.right - pad && b.left < a.right - pad && a.top < b.bottom - pad && b.top < a.bottom - pad;
  const slots = [...document.querySelectorAll(".lu-pitch .slot")];
  const nm = slots.map((s) => s.querySelector(".nm")), tk = slots.map((s) => s.querySelector(".tk"));
  const sobre = [];
  for (let i = 0; i < slots.length; i++) for (let j = 0; j < slots.length; j++) {
    if (i === j) continue;
    if (j > i && hit(box(nm[i]), box(nm[j]))) sobre.push(`${nm[i].textContent} × ${nm[j].textContent}`);
    if (hit(box(nm[i]), box(tk[j]), 3)) sobre.push(`${nm[i].textContent} × bolinha ${tk[j].textContent}`);
  }
  const cortados = nm.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent);
  const bench = [...document.querySelectorAll(".slot.b b")];
  return {
    campo: Math.round(box(document.querySelector(".lu-pitch")).width),
    letra: parseFloat(getComputedStyle(nm[0]).fontSize),
    sobrepostos: [...new Set(sobre)],
    cortados,
    reservasCortados: bench.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
    rolagemLateral: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
}

const res = {};
for (const [dev, L, opts] of [["pc", chromium, { viewport: { width: 1440, height: 900 } }], ["notebook", chromium, { viewport: { width: 1280, height: 720 } }], ["iphone", webkit, devices["iPhone 15"]], ["pixel", chromium, devices["Pixel 7"]]]) {
  const b = await L.launch(L === chromium ? { channel: "chrome" } : {});
  const ctx = await b.newContext({ ...opts, locale: "pt-BR", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const id of ids) {
    await page.goto(`${BASE}/?estatico#/clube/${id}/elenco`, { waitUntil: "load" });
    await page.waitForSelector(".lu-pitch .slot");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const r = await page.evaluate(audit);
    if (r.sobrepostos.length || r.rolagemLateral || r.cortados.length > 2) res[`${dev} ${id}`] = r;
    else res[`${dev} ${id}`] = "ok" + (r.cortados.length ? ` (${r.cortados.length} nome com …)` : "");
    if (FOTOS.includes(id)) await page.locator(".lu-grid > div").first().screenshot({ path: `${OUT}elenco-${dev}-${id}.png` });
  }
  await b.close();
}
writeFileSync(`${OUT}elenco.json`, JSON.stringify(res, null, 2));
const ruins = Object.entries(res).filter(([, v]) => typeof v !== "string");
console.log(ruins.length ? ruins : "nenhum nome encostado");
console.log(Object.entries(res).filter(([, v]) => typeof v === "string" && v !== "ok"));
