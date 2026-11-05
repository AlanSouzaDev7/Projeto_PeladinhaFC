/* Revisão visual automática: em cada página e em 5 larguras de tela, procura
   - texto que vaza da própria caixa (sem reticências);
   - elementos vizinhos que se sobrepõem (escudo em cima da data, rótulo em cima de número...);
   - conteúdo que sai da tela para os lados.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/sobreposicao.mjs
   SO=cel  roda só a largura de celular. */
import { chromium } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const ROTAS = ["#/", "#/clubes", "#/clube/cruzeiro", "#/clube/cruzeiro/elenco", "#/clube/cruzeiro/partidas", "#/clube/cruzeiro/estatisticas", "#/clube/flamengo",
  "#/clube/atletico-mg", "#/clube/sao-paulo/partidas", "#/clube/internacional/estatisticas", "#/tabela", "#/tabela/gols", "#/tabela/amarelos", "#/partida/bragantino-x-santos-r34",
  "#/bora-pro-jogo", "#/bora-pro-jogo/cruzeiro/atletico-mg", "#/sobre"];
if (process.env.CLUBES) ROTAS.splice(0, ROTAS.length, ...["athletico-pr", "atletico-mg", "bahia", "botafogo", "bragantino", "chapecoense", "corinthians", "coritiba", "cruzeiro", "flamengo",
  "fluminense", "gremio", "internacional", "mirassol", "palmeiras", "remo", "santos", "sao-paulo", "vasco", "vitoria"].map((c) => `#/clube/${c}`));
const LARG = (process.env.SO === "cel" ? [390] : [1440, 1180, 900, 390, 360]);
const achados = new Map();

const b = await chromium.launch({ channel: "chrome" });
for (const w of LARG) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, locale: "pt-BR", reducedMotion: "reduce" });
  const p = await ctx.newPage();
  for (const r of ROTAS) {
    await p.goto(`${BASE}/?estatico&v=${Date.now()}${r}`, { waitUntil: "load" });
    await p.waitForTimeout(1300);
    if (process.env.ANTIGO) await p.addStyleTag({ content: ".fm-row{grid-template-columns:26px 46px minmax(0,1fr) auto 42px!important}.fm-date small{display:inline!important;overflow:visible!important}" });
    // desce a página para os cartões "reveal" e as imagens aparecerem
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
    await p.waitForTimeout(500);
    const res = await p.evaluate(() => {
      const out = [];
      const vis = (el) => { const s = getComputedStyle(el); return s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05; };
      const nome = (el) => { let s = el.tagName.toLowerCase(); const c = [...el.classList].filter((x) => !/^(on|in|seen|peek|open|settled|idle|play|patched|bump|active|sel|reveal)$/.test(x)); if (c.length) s += "." + c.slice(0, 2).join("."); const pa = el.parentElement; const pc = pa && [...pa.classList][0]; return (pc ? `.${pc} > ` : "") + s; };
      const esc = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && a !== el) return a; } return null; };
      const all = [...document.querySelectorAll("#view *, .header *, .ticker *, .footer *")].filter((el) => !el.closest("svg, canvas, .hero-scene, .gb, .backdrop, [aria-hidden='true'], .tk-run, .curtain, .sc-tip"));
      // 1) texto vazando
      for (const el of all) {
        if (!vis(el) || !el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el);
        if (s.textOverflow === "ellipsis" || /(hidden|clip|auto|scroll)/.test(s.overflowX) || s.display === "inline") continue;
        if (!(el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)) continue;
        // confirma com a posição real do texto (área de toque de link com margem negativa não é vazamento)
        const box = el.getBoundingClientRect();
        let dir = 0;
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n; (n = tw.nextNode());) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) dir = Math.max(dir, r.right - box.right, box.left - r.left); }
        if (dir > 2) out.push(["texto vaza", nome(el), `${Math.round(dir)}px`, el.textContent.trim().slice(0, 40)]);
      }
      // 2) vizinhos sobrepostos (filhos de grid ou flex)
      for (const pa of all) {
        if (!vis(pa)) continue;
        const d = getComputedStyle(pa).display;
        if (!/grid|flex/.test(d)) continue;
        const kids = [...pa.children].filter((k) => { const s = getComputedStyle(k); return vis(k) && s.position !== "absolute" && s.position !== "fixed" && k.getBoundingClientRect().width > 2 && k.getBoundingClientRect().height > 2; });
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
          const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (ox > 2 && oy > 2) out.push(["sobreposição", `${nome(kids[i])} × ${nome(kids[j])}`, `${Math.round(ox)}x${Math.round(oy)}px`, (kids[i].textContent + " | " + kids[j].textContent).trim().replace(/\s+/g, " ").slice(0, 50)]);
        }
      }
      // 2b) texto de um vizinho por cima do outro (o texto sai da própria caixa e invade a do lado)
      const txtRects = (el) => {
        const rs = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) {
          if (!n.textContent.trim()) continue;
          // invisível (opacidade, escondido) ou recortado por um ancestral com overflow: não conta
          let ok = true, clip = null;
          for (let a = n.parentElement; a; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (+s.opacity < 0.05 || s.visibility === "hidden" || s.display === "none") { ok = false; break; }
            if (/(hidden|clip|auto|scroll)/.test(s.overflowX) || /(hidden|clip|auto|scroll)/.test(s.overflowY)) { const r = a.getBoundingClientRect(); clip = clip ? { left: Math.max(clip.left, r.left), right: Math.min(clip.right, r.right), top: Math.max(clip.top, r.top), bottom: Math.min(clip.bottom, r.bottom) } : r; }
            if (a === el) break;
          }
          if (!ok) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          for (const r0 of rg.getClientRects()) {
            const r = clip ? { left: Math.max(r0.left, clip.left), right: Math.min(r0.right, clip.right), top: Math.max(r0.top, clip.top), bottom: Math.min(r0.bottom, clip.bottom) } : r0;
            if (r.right - r.left > 1 && r.bottom - r.top > 1) rs.push(r);
          }
        }
        return rs;
      };
      for (const pa of all) {
        if (!vis(pa) || !/grid|flex/.test(getComputedStyle(pa).display)) continue;
        const kids = [...pa.children].filter((k) => vis(k) && getComputedStyle(k).position !== "absolute" && k.getBoundingClientRect().width > 2);
        if (kids.length < 2 || kids.length > 12) continue;
        for (const k of kids) {
          const tr = txtRects(k);
          if (!tr.length) continue;
          for (const j of kids) {
            if (j === k) continue;
            const c = j.getBoundingClientRect();
            const hit = tr.find((r) => Math.min(r.right, c.right) - Math.max(r.left, c.left) > 2 && Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top) > 3);
            if (hit) { out.push(["texto invade", `${nome(k)} → ${nome(j)}`, `${Math.round(Math.min(hit.right, c.right) - Math.max(hit.left, c.left))}px`, k.textContent.trim().replace(/\s+/g, " ").slice(0, 40)]); break; }
          }
        }
      }
      // 3) saindo da tela
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push(["rolagem lateral", "página", `${document.documentElement.scrollWidth}>${innerWidth}`, ""]);
      for (const el of all) {
        if (!vis(el) || esc(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > innerWidth + 1 || r.left < -1)) out.push(["sai da tela", nome(el), `${Math.round(r.left)}..${Math.round(r.right)}`, el.textContent.trim().slice(0, 30)]);
      }
      return out;
    });
    for (const [tipo, onde, med, txt] of res) {
      const k = `${tipo} · ${onde}`;
      if (!achados.has(k)) achados.set(k, { tipo, onde, ex: [] });
      const a = achados.get(k);
      if (a.ex.length < 3) a.ex.push(`${w}px ${r} ${med} «${txt}»`);
      a.n = (a.n || 0) + 1;
    }
  }
  await ctx.close();
}
await b.close();
const lista = [...achados.values()].sort((a, b) => b.n - a.n);
for (const a of lista) console.log(`${a.tipo.padEnd(15)} ${a.onde}  (${a.n}x)\n      ${a.ex.join("\n      ")}`);
console.log(`\n${lista.length} tipo(s) de problema visual encontrados.`);
process.exit(lista.length ? 1 : 0);
