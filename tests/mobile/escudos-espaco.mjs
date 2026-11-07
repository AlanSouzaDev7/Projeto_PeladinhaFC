/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. */
/* Escudos x textos: em cada página e em várias larguras de tela, confere letra por letra que nenhum texto visível fica
   embaixo (ou em cima) de um escudo, que nenhum escudo encosta em outro e que nenhum escudo sai da tela ou do cartão.
   Também lista o tamanho de cada escudo por página (para ver se ficou num tamanho bom).
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/escudos-espaco.mjs   (SO=cel: só celular) */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const ROTAS = ["#/", "#/clubes", "#/clube/cruzeiro", "#/clube/cruzeiro/elenco", "#/clube/cruzeiro/partidas", "#/clube/cruzeiro/estatisticas",
  "#/clube/flamengo", "#/clube/atletico-mg", "#/clube/sao-paulo/partidas", "#/tabela", "#/tabela/gols", "#/tabela/amarelos", "#/tabela/vitorias",
  "#/partida/cruzeiro-x-palmeiras-r35", "#/partida/bragantino-x-santos-r34", "#/bora-pro-jogo", "#/bora-pro-jogo/cruzeiro/atletico-mg", "#/sobre"];
const TELAS = process.env.SO === "cel"
  ? [["390", chromium, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]
  : [["1440", chromium, { viewport: { width: 1440, height: 900 } }], ["1024", chromium, { viewport: { width: 1024, height: 768 } }],
     ["768 iPad", webkit, devices["iPad (gen 7)"]], ["390 Pixel", chromium, { ...devices["Pixel 7"] }], ["375 iPhone SE", webkit, devices["iPhone SE"]],
     ["320", chromium, { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true }]];
let falhas = 0;
const tamanhos = new Map();
for (const [nome, eng, opts] of TELAS) {
  const b = await eng.launch(eng === chromium ? { channel: "chrome" } : {});
  const ctx = await b.newContext({ ...opts, locale: "pt-BR", reducedMotion: "reduce" });
  const p = await ctx.newPage();
  for (const r of ROTAS) {
    await p.goto(`${BASE}/?estatico&v=${Date.now()}${r}`, { waitUntil: "load" });
    await p.waitForTimeout(1200);
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } scrollTo(0, 0); });
    await p.waitForTimeout(600);
    const res = await p.evaluate(() => {
      const visivel = (el) => { for (let a = el; a && a.nodeType === 1; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === "none" || s.visibility === "hidden" || +s.opacity < 0.05) return false; } return true; };
      // área realmente visível (cortada pelos pais com overflow)
      const corte = (el, r, proprio) => { let { left, top, right, bottom } = r; for (let a = proprio ? el : el.parentElement; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY)) { const q = a.getBoundingClientRect(); left = Math.max(left, q.left); top = Math.max(top, q.top); right = Math.min(right, q.right); bottom = Math.min(bottom, q.bottom); } } return { left, top, right, bottom }; };
      const nome = (el) => { const pa = el.closest("[class]:not(.crest)"); return `${pa ? "." + [...pa.classList].slice(0, 2).join(".") : el.parentElement.tagName}`; };
      const ignora = (el) => el.closest(".tk-run, .gb, .sc-tip, .curtain, [aria-hidden='true'] svg, select");
      const crests = [...document.querySelectorAll("#view .crest, .ticker .crest, .header .crest")].filter((c) => visivel(c) && !ignora(c)).map((c) => {
        const r = c.getBoundingClientRect(); return { el: c, r, v: corte(c, r) };
      }).filter((c) => c.r.width > 4 && c.v.right - c.v.left > 4 && c.v.bottom - c.v.top > 4);
      const tam = {};
      crests.forEach((c) => { const k = nome(c.el); tam[k] = Math.round(c.r.width); });
      const prob = [];
      // textos: retângulos de cada trecho de texto
      const w = document.createTreeWalker(document.querySelector("#view") || document.body, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n; (n = w.nextNode());) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || ignora(el) || el.closest("svg, canvas, option, script, style, .sr-only") || !visivel(el)) continue;
        range.selectNodeContents(n);
        for (const t of range.getClientRects()) {
          if (t.width < 2 || t.height < 4) continue;
          const tv = corte(el, t, true);
          if (tv.right - tv.left < 2 || tv.bottom - tv.top < 2) continue;
          // encolhe o retângulo do texto (espaço da linha) e do escudo (borda transparente da imagem)
          const tx = { l: tv.left + 1, t: tv.top + t.height * 0.2, r: tv.right - 1, b: tv.bottom - t.height * 0.2 };
          for (const c of crests) {
            const cx = { l: c.v.left + c.r.width * 0.08, t: c.v.top + c.r.height * 0.08, r: c.v.right - c.r.width * 0.08, b: c.v.bottom - c.r.height * 0.08 };
            const iw = Math.min(tx.r, cx.r) - Math.max(tx.l, cx.l), ih = Math.min(tx.b, cx.b) - Math.max(tx.t, cx.t);
            if (iw > 2 && ih > 2) prob.push(`texto "${n.textContent.trim().slice(0, 24)}" (${nome(el)}) embaixo do escudo ${Math.round(c.r.width)}px (${nome(c.el)}) · ${Math.round(iw)}×${Math.round(ih)} px`);
          }
        }
      }
      // escudo com escudo
      for (let i = 0; i < crests.length; i++) for (let j = i + 1; j < crests.length; j++) {
        const a = crests[i].v, c = crests[j].v;
        const iw = Math.min(a.right, c.right) - Math.max(a.left, c.left), ih = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (iw > 4 && ih > 4) prob.push(`escudos encostados (${nome(crests[i].el)} e ${nome(crests[j].el)}) · ${Math.round(iw)}×${Math.round(ih)} px`);
      }
      // escudo saindo da tela
      crests.forEach((c) => { if (c.r.left < -1 || c.r.right > innerWidth + 1) prob.push(`escudo saindo da tela (${nome(c.el)})`); });
      return { prob: [...new Set(prob)], tam, rolagem: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    if (res.rolagem) res.prob.push("a página rola para os lados");
    for (const [k, v] of Object.entries(res.tam)) { const t = tamanhos.get(k) || {}; t[nome] = v; tamanhos.set(k, t); }
    if (res.prob.length) { falhas += res.prob.length; console.log(`FALHA · ${nome} ${r}\n   ${res.prob.slice(0, 8).join("\n   ")}${res.prob.length > 8 ? `\n   … e mais ${res.prob.length - 8}` : ""}`); }
    else console.log(`ok   · ${nome} ${r}`);
  }
  await b.close();
}
console.log("\nTamanho dos escudos (px) por lugar e tela:");
for (const [k, v] of [...tamanhos].sort()) console.log(`  ${k.padEnd(34)} ${Object.entries(v).map(([t, n]) => `${t}: ${n}`).join(" · ")}`);
console.log(falhas ? `\n${falhas} problema(s)` : "\nNenhum texto embaixo de escudo, nenhum escudo encostado ou fora da tela.");
process.exit(falhas ? 1 : 0);
