/* compara quadros por segundo com e sem a animação do topo (para separar o custo da cena do custo do motor) */
import { webkit, chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://localhost:8000";
const fps = () => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(Math.round(n / 2)); }; requestAnimationFrame(f); });
for (const [label, engine, dev, launch] of [["iPhone 15 (WebKit)", webkit, devices["iPhone 15"], {}], ["Pixel 7 (Chrome)", chromium, devices["Pixel 7"], { channel: "chrome" }]]) {
  const b = await engine.launch(launch), ctx = await b.newContext(dev), p = await ctx.newPage();
  const r = {};
  for (const [k, hash] of [["sem animação (Sobre)", "#/sobre"], ["com a cena do topo (Cruzeiro)", "#/clube/cruzeiro"]]) {
    await p.goto(`${BASE}/?estatico&cena=7${hash}`); await p.waitForTimeout(1500);
    r[k] = await p.evaluate(fps);
  }
  console.log(label, JSON.stringify(r)); await b.close();
}
