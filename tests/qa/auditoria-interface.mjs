/* ==========================================================================
   CazéStats.TV — auditoria visual automática (celular 390x844 e computador 1366x900).
   Por página e tamanho de tela procura: textos sobrepostos, texto cortado/estourando o card, contraste baixo,
   botões encostados na borda do card, rolagem para os lados, mistura de fontes (títulos de card fora do padrão),
   erros de JavaScript e pedidos que falharam. Recorta a região de cada defeito em tests/qa/out/auditoria/.
   Uso: BASE=http://127.0.0.1:5181 node tests/qa/auditoria-interface.mjs
        (opcional) SO=tabela,clube-geral  → só essas páginas;  PERFIL=celular|computador
   ========================================================================== */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5181";
const OUT = new URL("./out/auditoria/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
const SO = process.env.SO ? process.env.SO.split(",") : null;
const MAX_SHOTS = 8; // por categoria, por página

const PERFIS = [
  ["celular", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["computador", { width: 1366, height: 900 }],
].filter(([n]) => !process.env.PERFIL || process.env.PERFIL === n);

// páginas: rota fixa ou função que descobre a rota (recebe a página já aberta na home/elenco)
const CLUBE = "corinthians";
const ABAS = ["geral", "partidas", "escalacoes", "historico", "elenco", "estatisticas", "comparar", "tabela"];
const PAGINAS = [
  ["home", "#/"],
  ["clubes", "#/clubes"],
  ["tabela", "#/tabela"],
  ...["amarelos", "vermelhos", "ataque", "defesa"].map((k) => [`ranking-${k}`, `#/tabela/${k}`]),
  ["previsao", "#/previsao"],
  ["xg", "#/xg"],
  ...ABAS.map((a) => [`clube-${a}`, `#/clube/${CLUBE}/${a}`]),
  ["clube-geral-santos", "#/clube/santos/geral"],
  ["mercado-elenco", `#/clube/${CLUBE}/mercado`, "mercado"],
  ["mercado-reforcos", `#/clube/${CLUBE}/mercado/reforcos`, "mercado"],
  ["mercado-escalacao", `#/clube/${CLUBE}/mercado/escalacao`, "mercado"],
  ...["", "/ultimos", "/temporada", "/calor", "/comparar"].map((a) => [`jogador${a.replace("/", "-")}`, `descobre:jogador${a}`]),
  ["partida", "descobre:partida"],
  ["rodada", "descobre:rodada"],
  ["copa-libertadores", "#/copa/libertadores"],
  ["copa-sul-americana", "#/copa/sul-americana"],
  ["copa-copa-do-brasil", "#/copa/copa-do-brasil"],
  ["copa-serie-b", "#/copa/serie-b"],
  ["bolao", "#/bolao"],
  ["simulador", "#/simulador"],
  ["bora-pro-jogo", "#/bora-pro-jogo"],
  ["sobre", "#/sobre"],
  ["busca-matheus-pereira", "busca:Matheus Pereira"],
  ["busca-arrascaeta", "busca:Giorgian de Arrascaeta"],
  ["busca-jose-manuel-lopez", "busca:José Manuel López"],
].filter(([n]) => !SO || SO.includes(n));

/* ---------- análise dentro da página ---------- */
function analisa() {
  const R = { overlaps: [], overflow: [], contrast: [], contrastManual: [], edges: [], hscroll: null, fonts: {} };
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const rgba = (c) => {
    if (cache.has(c)) return cache.get(c);
    let v = [0, 0, 0, 0];
    if (c && c !== "transparent") {
      const m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
      if (m) v = [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
      else { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; v = [d[0], d[1], d[2], d[3] / 255]; }
    }
    cache.set(c, v); return v;
  };
  const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const blend = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const cssPath = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4 && n !== document.body; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { s += "#" + n.id; parts.unshift(s); break; }
      const cls = [...n.classList].filter((c) => !/^(seen|in|on|peek|open|settled|idle|play|patched|bump)$/.test(c)).slice(0, 2);
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
    }
    return parts.join(" > ");
  };
  const visivel = (el) => {
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
    if (el.closest("details:not([open]) > :not(summary)")) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity < 0.15) return false;
      if (n.hasAttribute("hidden") || n.getAttribute("aria-hidden") === "true" && n !== el && false) return false;
    }
    return true;
  };
  const box = (r) => ({ x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) });
  const view = document.querySelector("#view, main") || document.body;

  // --- coleta de nós de texto
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.data.trim().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const textos = [];
  const visCache = new Map();
  const vis = (el) => { if (!visCache.has(el)) visCache.set(el, visivel(el)); return visCache.get(el); };
  for (let t; (t = tw.nextNode());) {
    const el = t.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TITLE|SVG|TEXT|TSPAN)$/i.test(el.tagName) || el.closest("svg,select,canvas,[aria-hidden=true] .sr-only,.sr-only,.visually-hidden")) continue;
    if (!vis(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(t);
    // recorta pelo overflow dos ancestrais (listas com rolagem, cards com overflow hidden)
    let clip = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }, fixo = false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.position === "fixed" || s.position === "sticky") fixo = true;
      if (s.overflowX !== "visible" || s.overflowY !== "visible") { const r = n.getBoundingClientRect(); clip = { left: Math.max(clip.left, r.left), top: Math.max(clip.top, r.top), right: Math.min(clip.right, r.right), bottom: Math.min(clip.bottom, r.bottom) }; }
    }
    const rects = [...rg.getClientRects()].map((r) => { const l = Math.max(r.left, clip.left), t = Math.max(r.top, clip.top), ri = Math.min(r.right, clip.right), b = Math.min(r.bottom, clip.bottom); return { left: l, top: t, right: ri, bottom: b, width: ri - l, height: b - t }; }).filter((r) => r.width > 1 && r.height > 1);
    if (!rects.length) continue;
    // fora da tela (truques de leitor de tela)
    if (rects.every((r) => r.right < -50 || r.left > innerWidth + 2000)) continue;
    textos.push({ t, el, rects, fixo });
  }

  // --- 1) sobreposição de texto (grade espacial)
  const cell = 64, grid = new Map();
  textos.forEach((o, i) => o.rects.forEach((r) => {
    const y0 = Math.floor((r.top + scrollY) / cell), y1 = Math.floor((r.bottom + scrollY) / cell), x0 = Math.floor(r.left / cell), x1 = Math.floor(r.right / cell);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = x + ":" + y; (grid.get(k) || grid.set(k, []).get(k)).push([i, r]); }
  }));
  const vistos = new Set();
  for (const lista of grid.values()) {
    for (let a = 0; a < lista.length; a++) for (let b = a + 1; b < lista.length; b++) {
      const [i, ra] = lista[a], [j, rb] = lista[b];
      if (i === j) continue;
      const A = textos[i], B = textos[j];
      if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      if (A.fixo !== B.fixo) continue; // camada fixa (barra de baixo, faixa de notícias) passando por cima do conteúdo rolado
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix <= 2 || iy <= 2) continue;
      // linhas com line-height apertado se tocam na vertical sem sobrepor letras: exige 35% da menor altura
      if (iy < 0.35 * Math.min(ra.height, rb.height)) continue;
      const k = i < j ? i + "|" + j : j + "|" + i;
      if (vistos.has(k)) continue; vistos.add(k);
      const u = { left: Math.min(ra.left, rb.left), top: Math.min(ra.top, rb.top), right: Math.max(ra.right, rb.right), bottom: Math.max(ra.bottom, rb.bottom) };
      R.overlaps.push({ a: cssPath(A.el), ta: A.t.data.trim().slice(0, 40), b: cssPath(B.el), tb: B.t.data.trim().slice(0, 40), ix: Math.round(ix), iy: Math.round(iy), box: box({ left: u.left, top: u.top, width: u.right - u.left, height: u.bottom - u.top }) });
    }
  }

  // --- 2) texto cortado / estourando o card
  const containers = new Set();
  for (const el of view.querySelectorAll("*")) {
    if (!vis(el) || el.closest("svg")) continue;
    const s = getComputedStyle(el);
    const corta = s.overflowX === "hidden" || s.overflow === "hidden" || s.overflowX === "clip";
    if (corta && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.textContent.trim() && el.children.length < 6) {
      if (s.textOverflow !== "ellipsis" && !/^(auto|scroll)$/.test(s.overflowX) && el.innerText.trim().length < 200) {
        // só conta se o que passa é texto (não imagem/canvas)
        const temTexto = [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim()) || [...el.querySelectorAll("b,span,strong,small,a")].some((c) => c.getBoundingClientRect().right > el.getBoundingClientRect().right + 1);
        if (temTexto) R.overflow.push({ tipo: "cortado-sem-reticencias", sel: cssPath(el), txt: el.innerText.trim().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth, box: box(el.getBoundingClientRect()) });
      }
    }
    if (/\b(card|cp-wrap|panel|stat-card)\b/.test(el.className && el.className.baseVal == null ? el.className : "")) containers.add(el);
  }
  for (const o of textos) {
    const card = o.el.closest(".card");
    if (!card) continue;
    const cr = card.getBoundingClientRect();
    for (const r of o.rects) {
      if (r.right > cr.right + 2 || r.left < cr.left - 2) {
        // ignora quando um ancestral rola na horizontal (tabelas com rolagem)
        let rola = false;
        for (let n = o.el; n && n !== card; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowX)) { rola = true; break; } }
        if (!rola) R.overflow.push({ tipo: "texto-fora-do-card", sel: cssPath(o.el), txt: o.t.data.trim().slice(0, 50), card: cssPath(card), dx: Math.round(Math.max(r.right - cr.right, cr.left - r.left)), box: box(r) });
        break;
      }
    }
  }

  // --- 3) contraste
  const fundo = (el) => {
    let cor = [0, 0, 0, 0], layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none" && !/url\(/.test(s.backgroundImage) || /url\(/.test(s.backgroundImage)) {
        if (layers.every((l) => l[3] < 0.95)) return { manual: s.backgroundImage.slice(0, 80), at: cssPath(n) };
      }
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
    }
    let base = [255, 255, 255, 1];
    const html = rgba(getComputedStyle(document.documentElement).backgroundColor), body = rgba(getComputedStyle(document.body).backgroundColor);
    if (!layers.length || layers[layers.length - 1][3] < 0.99) base = body[3] > 0 ? blend(body, html[3] ? html : base) : html[3] ? html : base;
    for (let k = layers.length - 1; k >= 0; k--) base = blend(layers[k], base);
    return { cor: base };
  };
  const vistosC = new Set();
  for (const o of textos) {
    const el = o.el;
    if (vistosC.has(el)) continue; vistosC.add(el);
    const s = getComputedStyle(el);
    const fc = rgba(s.color);
    if (fc[3] === 0 || s.webkitTextFillColor === "transparent" || s.backgroundClip === "text" || s.webkitBackgroundClip === "text") continue;
    let op = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= +getComputedStyle(n).opacity;
    const f = fundo(el);
    const size = parseFloat(s.fontSize), peso = +s.fontWeight || 400;
    const grande = size >= 24 || (size >= 18.66 && peso >= 700);
    const min = grande ? 3 : 4.5;
    const r = o.rects[0];
    if (f.manual) {
      R.contrastManual.push({ sel: cssPath(el), txt: o.t.data.trim().slice(0, 40), color: s.color, bgImg: f.manual, at: f.at, shadow: s.textShadow !== "none", box: box(r) });
      continue;
    }
    const txt = blend([fc[0], fc[1], fc[2], fc[3] * op], f.cor);
    const cr = ratio(txt, f.cor);
    if (cr < min) R.contrast.push({ sel: cssPath(el), txt: o.t.data.trim().slice(0, 40), color: s.color, bg: `rgb(${f.cor.slice(0, 3).map(Math.round).join(",")})`, ratio: +cr.toFixed(2), min, size, peso, shadow: s.textShadow !== "none", box: box(r) });
  }

  // --- 4) botões encostando na borda do card / desalinhados
  const btns = view.querySelectorAll("button, .btn, .cp-btn, a.button, [role=button]");
  for (const bt of btns) {
    if (!vis(bt)) continue;
    const br = bt.getBoundingClientRect();
    if (br.width < 4 || br.height < 4) continue;
    const card = bt.closest(".card, .panel, [class*='-card']:not(button)");
    if (!card || card === bt) continue;
    const cr = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const dist = { top: br.top - cr.top, bottom: cr.bottom - br.bottom, left: br.left - cr.left, right: cr.right - br.right };
    const perto = Object.entries(dist).filter(([, d]) => d < 8 && d > -40).map(([k, d]) => `${k}:${Math.round(d)}`);
    // só interessa se o card tem borda ou fundo visível (senão não há "borda" para encostar)
    const temBorda = parseFloat(cs.borderTopWidth) > 0 || rgba(cs.backgroundColor)[3] > 0.05 || cs.backgroundImage !== "none";
    if (perto.length && temBorda) R.edges.push({ sel: cssPath(bt), txt: (bt.innerText || bt.getAttribute("aria-label") || "").trim().slice(0, 30), card: cssPath(card), perto: perto.join(" "), box: box({ left: Math.min(br.left, cr.left), top: Math.max(cr.top, br.top - 40), width: Math.max(br.right, cr.right) - Math.min(br.left, cr.left), height: Math.min(cr.bottom, br.bottom + 40) - Math.max(cr.top, br.top - 40) }) });
  }
  // alinhamento do .cp-btn dentro de .cp-wrap (centralizado em relação ao card)
  for (const w of view.querySelectorAll(".cp-wrap")) {
    if (!vis(w)) continue;
    const bt = w.querySelector(".cp-btn"); if (!bt) continue;
    const card = w.closest(".card") || w.parentElement;
    const br = bt.getBoundingClientRect(), cr = card.getBoundingClientRect(), wr = w.getBoundingClientRect();
    const just = getComputedStyle(w).justifyContent;
    const offC = Math.round((br.left + br.width / 2) - (cr.left + cr.width / 2));
    R.edges.push({ tipo: "cp-wrap", sel: cssPath(bt), card: cssPath(card), just, offCentro: offC, gapAcima: Math.round(br.top - (w.previousElementSibling?.getBoundingClientRect().bottom ?? wr.top)), gapAbaixo: Math.round(cr.bottom - br.bottom), wrapW: Math.round(wr.width), cardW: Math.round(cr.width), box: box({ left: cr.left, top: br.top - 60, width: cr.width, height: Math.min(cr.bottom, br.bottom + 30) - (br.top - 60) }) });
  }

  // --- 5) rolagem horizontal
  const sw = document.documentElement.scrollWidth;
  if (sw > innerWidth + 1) {
    const culpados = [];
    for (const el of document.body.querySelectorAll("*")) { const r = el.getBoundingClientRect(); if (r.right > innerWidth + 1 && r.width > 0 && vis(el)) { let rola = false; for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { rola = true; break; } } if (!rola) culpados.push(cssPath(el) + ` (right=${Math.round(r.right)})`); } if (culpados.length > 8) break; }
    R.hscroll = { sw, iw: innerWidth, culpados };
  }

  // --- 6) fontes
  const grupo = (nome, sel) => {
    const m = {};
    for (const el of view.querySelectorAll(sel)) {
      if (!vis(el) || !el.textContent.trim()) continue;
      const s = getComputedStyle(el);
      const k = `${s.fontFamily.split(",")[0].replace(/"/g, "")} ${s.fontSize}/${s.fontWeight} ls=${s.letterSpacing} tt=${s.textTransform}`;
      (m[k] ||= { n: 0, ex: [] }).n++;
      if (m[k].ex.length < 3) m[k].ex.push(cssPath(el) + " «" + el.textContent.trim().slice(0, 30) + "»");
    }
    R.fonts[nome] = m;
  };
  grupo("h1", "h1"); grupo("h2", "h2"); grupo("h3", "h3"); grupo("card-h", ".card-h, .card > h3, .card > h2, .card-title");
  grupo("button", "button, .btn"); grupo("body-p", "p"); grupo("td", "td"); grupo("tab", ".tab");
  const mono = [];
  for (const el of view.querySelectorAll("*")) { if (el.children.length || !el.textContent.trim() || !vis(el)) continue; const f = getComputedStyle(el).fontFamily; if (/mono|courier|consolas/i.test(f)) mono.push(cssPath(el) + " «" + el.textContent.trim().slice(0, 20) + "» " + f.split(",")[0]); if (mono.length > 15) break; }
  R.fonts.mono = mono;
  return R;
}

/* ---------- execução ---------- */
const relatorio = {};
const b = await chromium.launch({ channel: "chrome" });

async function rolaTudo(p) {
  await p.evaluate(async () => {
    const h = () => document.documentElement.scrollHeight;
    for (let y = 0; y < h(); y += Math.round(innerHeight * 0.7)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400));
  });
}

async function recorta(p, nome, cat, i, bx, vp) {
  const pad = 14;
  const dims = await p.evaluate(() => ({ W: document.documentElement.scrollWidth, H: document.documentElement.scrollHeight }));
  const x = Math.max(0, bx.x - pad), y = Math.max(0, bx.y - pad);
  const w = Math.min(Math.max(bx.w + 2 * pad, 40), dims.W - x), h = Math.min(Math.max(bx.h + 2 * pad, 30), dims.H - y, 900);
  if (w <= 0 || h <= 0) return null;
  const file = `${nome}-${cat}-${i}.png`;
  try { await p.screenshot({ path: OUT + file, fullPage: true, clip: { x, y, width: w, height: h } }); return file; } catch { return null; }
}

for (const [perfil, vp] of PERFIS) {
  const { width, height, ...resto } = vp;
  const ctx = await b.newContext({ viewport: { width, height }, ...resto, locale: "pt-BR", reducedMotion: "reduce" });
  await ctx.route(/workers\.dev\/dados\//, (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  let erros = [], falhas = [];
  p.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) erros.push("console: " + m.text().slice(0, 200)); });
  p.on("requestfailed", (r) => { const u = r.url(); if (!/workers\.dev\/dados|\.(png|jpe?g|webp|gif|svg|avif)(\?|$)|google|gstatic|doubleclick|analytics/.test(u) && r.resourceType() !== "image" && r.resourceType() !== "media") falhas.push(`${r.failure()?.errorText} ${u}`); });
  p.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && u.startsWith(BASE) && !/workers\.dev/.test(u) && r.request().resourceType() !== "image") falhas.push(`${r.status()} ${u}`); });

  await p.goto(`${BASE}/#/`, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  const descobre = {
    partida: await p.evaluate(() => document.querySelector('a[href^="#/partida/"]')?.getAttribute("href")),
    rodada: await p.evaluate(() => document.querySelector('a[href^="#/rodada/"]')?.getAttribute("href")) || "#/rodada/1",
  };
  await p.locator("#search").fill("Arrascaeta").catch(() => {}); await p.waitForTimeout(1200);
  descobre.jogador = await p.evaluate(() => document.querySelector('#search-results a[href^="#/jogador/"]')?.getAttribute("href"));
  await p.locator("#search").fill("").catch(() => {});
  await p.keyboard.press("Escape").catch(() => {}); await p.evaluate(() => document.activeElement?.blur());
  console.log(`\n=== ${perfil} === descobertas`, descobre);

  for (const [nome, rota0, tipo] of PAGINAS) {
    erros = []; falhas = [];
    let rota = rota0, busca = null;
    if (rota.startsWith("descobre:")) { const [k, ...resto] = rota.split(":")[1].split("/"); rota = descobre[k] && descobre[k] + (resto.length ? "/" + resto.join("/") : ""); }
    if (rota?.startsWith("busca:")) { busca = rota.slice(6); rota = "#/tabela"; }
    if (!rota) { console.log(`-- ${nome}: rota não encontrada`); continue; }
    await p.goto(`${BASE}/${rota}`, { waitUntil: "load" });
    await p.waitForTimeout(2200);
    if (tipo === "mercado" && await p.locator(".jt-escolha").isVisible().catch(() => false)) {
      await p.click('[data-jt-modo="real"]').catch(() => {});
      await p.waitForTimeout(800);
      if (rota.includes("/mercado/")) { await p.goto(`${BASE}/${rota}`); await p.waitForTimeout(1800); }
    }
    if (busca) {
      const s = p.locator("#search");
      if (perfil === "celular" && !(await s.isVisible().catch(() => false))) await p.locator("[data-search-open], .search-btn, button[aria-label*='usca']").first().click().catch(() => {});
      await s.fill(busca).catch((e) => erros.push("busca: " + e.message.split("\n")[0]));
      await p.waitForTimeout(1200);
    } else {
      await rolaTudo(p);
      await p.waitForTimeout(600);
    }
    const R = await p.evaluate(analisa);
    const pref = `${perfil}-${nome}`;
    // recortes
    for (const [cat, lista] of [["overlap", R.overlaps], ["overflow", R.overflow], ["contraste", R.contrast], ["contraste-manual", R.contrastManual.filter((c) => !c.shadow)], ["borda", R.edges]]) {
      for (let i = 0; i < Math.min(lista.length, cat === "contraste-manual" ? 4 : MAX_SHOTS); i++) lista[i].shot = await recorta(p, pref, cat, i, lista[i].box, vp);
    }
    if (R.hscroll) await p.screenshot({ path: `${OUT}${pref}-hscroll.png` });
    await p.screenshot({ path: `${OUT}${pref}-pagina.png`, fullPage: !busca && perfil === "celular" ? false : false });
    R.erros = [...new Set(erros)]; R.falhas = [...new Set(falhas)];
    relatorio[pref] = { rota: busca ? `busca "${busca}"` : rota, ...R };
    console.log(`-- ${pref}: overlap=${R.overlaps.length} overflow=${R.overflow.length} contraste=${R.contrast.length} (manual ${R.contrastManual.length}) borda=${R.edges.filter((e) => !e.tipo).length} hscroll=${R.hscroll ? R.hscroll.sw : "não"} erros=${R.erros.length} falhas=${R.falhas.length}`);
  }
  await ctx.close();
}
await b.close();
writeFileSync(OUT + "relatorio.json", JSON.stringify(relatorio, null, 1));
console.log(`\nrelatório: ${OUT}relatorio.json`);
