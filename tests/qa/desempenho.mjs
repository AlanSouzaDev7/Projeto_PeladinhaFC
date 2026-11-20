/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — desempenho no site publicado, em condições de rede e aparelho simuladas (Chrome, protocolo DevTools):
   TTFB, FCP, LCP, CLS, bytes transferidos, número de pedidos e memória do JavaScript; repete a visita (cache e
   service worker) e testa a perda de conexão (offline) depois da primeira visita.
   É SIMULAÇÃO (limite de banda, latência e CPU mais lenta), não medição em aparelho físico.
   Uso: BASE=https://cazestats.pages.dev node tests/qa/desempenho.mjs
   ========================================================================== */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://cazestats.pages.dev";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
// perfis de rede como os do Lighthouse/DevTools (vazão em bytes/s, latência em ms) e lentidão da CPU
const REDES = {
  "Wi-Fi rápido": { down: 30e6 / 8, up: 15e6 / 8, lat: 5, cpu: 1 },
  "4G": { down: 9e6 / 8, up: 4e6 / 8, lat: 85, cpu: 2 },
  "3G lento (celular simples)": { down: 400e3 / 8, up: 400e3 / 8, lat: 400, cpu: 4 },
};
const ROTAS = [["inicio", "/#/"], ["tabela", "/#/tabela"], ["clube", "/#/clube/flamengo"], ["pagina-busca", "/clube/flamengo"]];

const b = await chromium.launch({ channel: "chrome" });
const res = [];
for (const [rede, R] of Object.entries(REDES)) {
  for (const [nome, rota] of ROTAS) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "pt-BR" });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: R.lat, downloadThroughput: R.down, uploadThroughput: R.up });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: R.cpu });
    let bytes = 0, pedidos = 0;
    cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength; pedidos++; });
    await p.addInitScript(() => {
      window.__m = { lcp: 0, cls: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    const medir = async () => {
      await p.waitForTimeout(rede.startsWith("3G") ? 6000 : 3500);
      return p.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0], fcp = performance.getEntriesByName("first-contentful-paint")[0];
        return { ttfb: Math.round(nav.responseStart), fcp: Math.round(fcp?.startTime || 0), lcp: Math.round(window.__m.lcp), cls: Math.round(window.__m.cls * 1000) / 1000, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e5) / 10 : null };
      });
    };
    const t0 = Date.now();
    await p.goto(BASE + rota, { waitUntil: "load", timeout: 90000 });
    const prim = { ...(await medir()), loadMs: Date.now() - t0, kb: Math.round(bytes / 1024), pedidos };
    bytes = 0; pedidos = 0;
    await p.reload({ waitUntil: "load", timeout: 90000 });
    const rep = { ...(await medir()), kb: Math.round(bytes / 1024), pedidos };
    let offline = null;
    if (nome === "inicio" && rede === "4G") {
      await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await ctx.setOffline(true);
      await p.goto(BASE + "/#/tabela", { waitUntil: "load", timeout: 20000 }).catch(() => {});
      await p.reload({ waitUntil: "load", timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(1500);
      offline = await p.evaluate(() => ({ abriu: !!document.querySelector("#view")?.children.length, linhasTabela: document.querySelectorAll("table tbody tr").length, aviso: (document.body.innerText.match(/sem (internet|conexão)[^\n]{0,60}/i) || [""])[0] })).catch((e) => ({ erro: String(e.message).slice(0, 80) }));
    }
    res.push({ rede, rota: nome, primeira: prim, repetida: rep, offline });
    console.log(`${rede.padEnd(26)} ${nome.padEnd(13)} 1ª: TTFB ${prim.ttfb} · FCP ${prim.fcp} · LCP ${prim.lcp} ms · CLS ${prim.cls} · ${prim.kb} KB/${prim.pedidos} pedidos · heap ${prim.heapMB} MB | repetida: LCP ${rep.lcp} ms · ${rep.kb} KB${offline ? ` | offline: ${JSON.stringify(offline)}` : ""}`);
    await ctx.close();
  }
}
await b.close();
writeFileSync(`${OUT}desempenho.json`, JSON.stringify({ base: BASE, quando: new Date().toISOString(), res }, null, 2));
