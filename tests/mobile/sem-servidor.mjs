/* Site sem a API (como no GitHub Pages): tabela gravada, notícias e minuto a minuto direto da ESPN.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  BASE=http://127.0.0.1:5173 node tests/mobile/sem-servidor.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
for (const [name, eng, opts, launch] of [["pc", chromium, { viewport: { width: 1440, height: 900 } }, { channel: "chrome" }], ["pixel7", chromium, devices["Pixel 7"], { channel: "chrome" }], ["iphone15", webkit, devices["iPhone 15"], {}]]) {
  const b = await eng.launch(launch);
  const p = await (await b.newContext({ ...opts, locale: "pt-BR" })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${BASE}/?estatico&v=${Date.now()}#/clube/flamengo`, { waitUntil: "load" });
  await p.waitForTimeout(3500);
  const geral = await p.evaluate(() => ({ api: !!window.PD.LIVE, tabela: window.PD.REAL.updated, noticias: document.querySelectorAll("[data-news] li a").length }));
  const out = {};
  for (const [k, home, away] of [["encerrado", "chapecoense", "mirassol"], ["ao_vivo", "internacional", "coritiba"]]) {
    await p.evaluate(([h, a]) => (location.hash = `#/partida/${h}-x-${a}-r${34}`), [home, away]);
    await p.waitForTimeout(5000);
    out[k] = await p.evaluate(() => ({ topo: document.querySelector(".mam-top")?.innerText.replace(/\s+/g, " "), lances: document.querySelectorAll(".mam-list .mam-l").length,
      ultimo: document.querySelector(".mam-list .mam-l p")?.textContent }));
    if (k === "ao_vivo") await p.screenshot({ path: `${OUT}${name}-minuto-a-minuto.png` });
  }
  console.log(name, { ...geral, ...out, erros: errs });
  await b.close();
}
