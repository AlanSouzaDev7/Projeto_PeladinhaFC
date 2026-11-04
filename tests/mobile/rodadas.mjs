/* Próximas rodadas e placar ao vivo sem a API (como no GitHub Pages), no computador, Android e iPhone.
   Uso: python -m http.server 5173  e depois  BASE=http://localhost:5173 node tests/mobile/rodadas.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
for (const [name, eng, opts, launch] of [["pc", chromium, { viewport: { width: 1440, height: 900 } }, { channel: "chrome" }], ["pixel7", chromium, devices["Pixel 7"], { channel: "chrome" }], ["iphone15", webkit, devices["iPhone 15"], {}]]) {
  const b = await eng.launch(launch);
  const p = await (await b.newContext({ ...opts, locale: "pt-BR" })).newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const t0 = Date.now();
  await p.goto(`${BASE}/?estatico&v=${Date.now()}#/`, { waitUntil: "load" });
  await p.waitForFunction(() => document.querySelector(".match"), null, { timeout: 15000 });
  const boot = Date.now() - t0;
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => ({
    round: window.PD.ROUND, rounds: window.PD.ROUNDS.join(","),
    sizes: window.PD.ROUNDS.map((k) => window.PD.FIXTURES[k].length).join(","),
    adiados: Object.values(window.PD.FIXTURES).flat().filter((g) => g[9] === "adiado").map((g) => g[0] + " x " + g[1]),
    live: [...document.querySelectorAll(".match")].map((el) => el.innerText.replace(/\s+/g, " ").trim()).filter((t) => /●/.test(t)),
  }));
  // avança para a 35ª rodada pela navegação de rodadas
  const nav = await p.evaluate(async () => {
    const next = [...document.querySelectorAll(".round-nav button")].pop();
    next?.click(); await new Promise((r) => setTimeout(r, 900));
    return { titulo: document.querySelector(".round-nav")?.innerText.replace(/\s+/g, " "), jogos: [...document.querySelectorAll(".match")].slice(0, 3).map((el) => el.innerText.replace(/\s+/g, " ").trim()) };
  });
  await p.screenshot({ path: `${OUT}${name}-rodada-35.png` });
  console.log(name, { carregou_ms: boot, ...r, proxima_rodada: nav, erros: errs });
  await b.close();
}
