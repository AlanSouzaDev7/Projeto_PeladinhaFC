/* Desempenho no carregamento (PC e celular, sem cache): tempo até o conteúdo, peso baixado, requisições e
   saltos de layout. Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/desempenho.mjs */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const b = await chromium.launch({ channel: "chrome" });
const out = {};
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel7", devices["Pixel 7"]]]) {
  for (const r of ["#/", "#/clube/flamengo", "#/tabela"]) {
    const ctx = await b.newContext({ ...opts, locale: "pt-BR" });
    const p = await ctx.newPage();
    if (dev === "pixel7") { const s = await ctx.newCDPSession(p); await s.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: (9e6) / 8, uploadThroughput: (3e6) / 8 }); await s.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
    await p.addInitScript(() => {
      window.__cls = 0; window.__lcp = 0;
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    });
    let bytes = 0, reqs = 0;
    p.on("response", async (res) => { reqs++; try { bytes += (await res.body()).length; } catch {} });
    await p.goto(`${BASE}/?v=${Date.now()}${r}`, { waitUntil: "load" });
    await p.waitForTimeout(3500);
    const m = await p.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: +window.__cls.toFixed(3), dom: document.querySelectorAll("*").length, fcp: Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime || 0) }));
    out[`${dev} ${r}`] = { ...m, requisicoes: reqs, kb: Math.round(bytes / 1024) };
    await ctx.close();
  }
}
console.table(out);
await b.close();
