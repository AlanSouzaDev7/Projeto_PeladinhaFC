/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — auditoria de animações e travamentos (Chrome, protocolo DevTools)
   Celular 390x844 com a CPU 4x mais lenta (um Android intermediário) e, com "fraco", 6x (um aparelho de entrada).
   Em cada página: abre, rola para baixo e para cima com o dedo, troca de página pelo menu e mede
     · quadros: quantos passaram de 50 ms (o olho vê como tranco), o pior e o p95;
     · tarefas longas (> 50 ms) e o tempo total de bloqueio;
     · animações rodando que não são só transform/opacity (fazem o navegador redesenhar a cada quadro);
     · mudança de layout (CLS) e o tempo da troca de página.
   É SIMULAÇÃO de CPU lenta no Chrome do computador, não medição em aparelho físico.
   Uso: BASE=http://localhost:5173 node tests/qa/animacoes.mjs [rotulo] [fraco]
   ========================================================================== */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:5173";
const ROTULO = process.argv[2] || "medicao", FRACO = process.argv.includes("fraco");
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const ROTAS = [["inicio", "#/"], ["clube", "#/clube/flamengo"], ["partida", "#/partida/corinthians-x-botafogo-r35"], ["tabela", "#/tabela"], ["jogador", "#/jogador/216098-cruzeiro"], ["rodada", "#/rodada/35"], ["bolao", "#/bolao"]];

const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "pt-BR" });
await ctx.addInitScript(() => {
  window.__q = { frames: [], longas: [], cls: 0 };
  let ult = performance.now();
  const f = (t) => { window.__q.frames.push(t - ult); ult = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__q.longas.push(e.duration); }).observe({ type: "longtask", buffered: true }); } catch { /* sem suporte */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__q.cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch { /* sem suporte */ }
});
const res = [];
for (const [nome, hash] of ROTAS) {
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: FRACO ? 6 : 4 });
  await p.goto(`${BASE}/${hash}`, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { window.__q.frames = []; window.__q.longas = []; });
  // rolar com o dedo: para baixo e para cima
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 420); await p.waitForTimeout(220); }
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -420); await p.waitForTimeout(220); }
  await p.waitForTimeout(800);
  // animações que repintam: as que mexem em algo além de transform e opacity
  const naoCompostas = await p.evaluate(() => {
    const ok = new Set(["transform", "opacity", "offset", "composite", "easing", "computedOffset", "translate", "scale", "rotate"]);
    const lista = [];
    for (const a of document.getAnimations()) {
      if (a.playState !== "running") continue;
      const props = new Set();
      for (const k of a.effect?.getKeyframes?.() || []) for (const p of Object.keys(k)) if (!ok.has(p)) props.add(p);
      if (a.transitionProperty && !ok.has(a.transitionProperty)) props.add(a.transitionProperty);
      if (props.size) { const el = a.effect?.target; lista.push(`${a.animationName || a.transitionProperty || "js"} [${[...props].join(",")}] em ${el ? el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "") : "?"}`); }
    }
    return [...new Set(lista)];
  });
  const rodando = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  // troca de página pelo menu de baixo
  const t0 = Date.now();
  await p.locator('.bottom-nav a[href="#/tabela"]').click().catch(() => {});
  await p.waitForFunction(() => /#\/tabela/.test(location.hash) && document.querySelector("#view table"), null, { timeout: 15000 }).catch(() => {});
  const troca = Date.now() - t0;
  await p.waitForTimeout(1200);
  const q = await p.evaluate(() => window.__q);
  const fr = q.frames.filter((x) => x < 2000).sort((a, b) => a - b);
  const p95 = fr[Math.floor(fr.length * 0.95)] || 0;
  const r = { pagina: nome, quadros: fr.length, travados: fr.filter((x) => x > 50).length, pior: Math.round(fr.at(-1) || 0), p95: Math.round(p95), longas: q.longas.length, bloqueio: Math.round(q.longas.reduce((t, x) => t + Math.max(0, x - 50), 0)), cls: Math.round(q.cls * 1000) / 1000, troca, rodando, naoCompostas };
  res.push(r);
  console.log(`${nome.padEnd(8)} quadros ${String(r.quadros).padStart(4)} · travados ${String(r.travados).padStart(3)} · pior ${String(r.pior).padStart(4)} ms · p95 ${String(r.p95).padStart(3)} ms · longas ${String(r.longas).padStart(2)} (${r.bloqueio} ms) · CLS ${r.cls} · troca ${troca} ms · animando ${rodando}, repintam ${naoCompostas.length}`);
  for (const x of naoCompostas.slice(0, 6)) console.log("      repinta:", x);
  await p.close();
}
await b.close();
const tot = (k) => res.reduce((t, r) => t + r[k], 0);
console.log(`\nTOTAL (${ROTULO}${FRACO ? ", CPU 6x" : ", CPU 4x"}): ${tot("travados")} quadros travados de ${tot("quadros")}, ${tot("longas")} tarefas longas, ${tot("bloqueio")} ms de bloqueio, ${res.reduce((t, r) => t + r.naoCompostas.length, 0)} animações que repintam`);
writeFileSync(`${OUT}animacoes-${ROTULO}${FRACO ? "-fraco" : ""}.json`, JSON.stringify({ quando: new Date().toISOString(), cpu: FRACO ? 6 : 4, res }, null, 2));
