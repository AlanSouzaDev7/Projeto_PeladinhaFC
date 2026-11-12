/* Procura botões desalinhados em todas as páginas, no PC e no celular:
   - conteúdo fora do centro do botão (texto/ícone mais para cima, baixo ou para um lado)
   - botões vizinhos na mesma linha com alturas ou centros diferentes
   - ícone e texto do mesmo botão fora da mesma linha
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/alinhamento.mjs */
import { chromium, webkit, devices } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const PAGES = ["#/", "#/clubes", "#/clube/flamengo", "#/clube/flamengo/partidas", "#/clube/flamengo/elenco", "#/clube/flamengo/estatisticas", "#/clube/flamengo/tabela", "#/tabela", "#/simulador", "#/jogador/216098-cruzeiro", "#/clube/flamengo/comparar", "#/clube/cruzeiro/mercado", "#/copa/libertadores", "#/copa/copa-do-brasil/chave", "#/bora-pro-jogo/flamengo/palmeiras", "#/sobre", "#/tabela/gols", "#/partida/cruzeiro-x-flamengo-r34"];

function audit() {
  const sel = "button, a.btn, .chip, .tab, .icon-btn, [role=button], .round-nav a, .feat-nav button, .bottom-nav a, .pill, .lu-forms button, select";
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05 && r.bottom > 0 && r.top < document.documentElement.scrollHeight; };
  const name = (el) => (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, " ").slice(0, 32);
  const where = (el) => { const p = el.closest("[class]"); return (p?.parentElement?.className || "").toString().split(" ")[0]; };
  const els = [...document.querySelectorAll(sel)].filter(vis).filter((el) => !el.closest(".gb, .curtain, .scorer-card:not(.open), .rank-preview:not(.open)"));
  const out = [];
  for (const el of els) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    // caixa do conteúdo (texto + ícones), sem o padding
    const kids = [];
    const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3 && c.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(c); [...rg.getClientRects()].forEach((q) => kids.push({ q, k: "t" })); } else if (c.nodeType === 1 && getComputedStyle(c).display !== "none" && getComputedStyle(c).position !== "absolute") { if (/^(svg|img|i)$/i.test(c.tagName) || !c.childNodes.length) { const q = c.getBoundingClientRect(); if (q.width && q.height) kids.push({ q, k: "i" }); } else walk(c); } } };
    // linha de jogador da artilharia (virou botão): a barra começa com largura 0 até aparecer na tela; mede pela caixa do conteúdo
    if (el.matches("[data-scorer]")) { const box = el.querySelector(":scope > div, .sd-nm"); if (box) kids.push({ q: box.getBoundingClientRect(), k: "i" }); }
    else walk(el);
    if (!kids.length) continue;
    const top = Math.min(...kids.map((k) => k.q.top)), bot = Math.max(...kids.map((k) => k.q.bottom)), left = Math.min(...kids.map((k) => k.q.left)), right = Math.max(...kids.map((k) => k.q.right));
    const pt = parseFloat(s.paddingTop), pb = parseFloat(s.paddingBottom), bt = parseFloat(s.borderTopWidth), bb = parseFloat(s.borderBottomWidth);
    const innerTop = r.top + pt + bt, innerBot = r.bottom - pb - bb;
    const dy = (top + bot) / 2 - (innerTop + innerBot) / 2;
    const centered = s.textAlign === "center" || s.justifyContent === "center" || /flex|grid/.test(s.display) && s.justifyContent === "center";
    const dx = centered ? (left + right) / 2 - (r.left + r.right) / 2 : 0;
    // texto e ícone do mesmo botão: centros verticais
    const t = kids.filter((k) => k.k === "t"), ic = kids.filter((k) => k.k === "i" && k.q.height < r.height);
    const di = t.length && ic.length ? Math.max(...ic.map((k) => Math.abs((k.q.top + k.q.bottom) / 2 - (t[0].q.top + t[0].q.bottom) / 2))) : 0;
    const prob = [];
    if (Math.abs(dy) > 2.5 && r.height < 80 && bot - top < r.height - 2) prob.push(`conteúdo ${dy > 0 ? "baixo" : "alto"} ${dy.toFixed(1)}px`);
    if (Math.abs(dx) > 3 && r.width < 200) prob.push(`conteúdo para o lado ${dx.toFixed(1)}px`);
    if (di > 2.5 && ic.length && t.length) prob.push(`ícone fora da linha do texto ${di.toFixed(1)}px`);
    if (prob.length) out.push(`${name(el)} [${where(el)}] ${Math.round(r.width)}×${Math.round(r.height)}: ${prob.join(", ")}`);
  }
  // vizinhos: mesmo pai, mesma linha visual
  const groups = new Map();
  for (const el of els) { const p = el.parentElement; if (!groups.has(p)) groups.set(p, []); groups.get(p).push(el); }
  for (const [p, list] of groups) {
    if (list.length < 2) continue;
    const rows = [];
    for (const el of list) { const r = el.getBoundingClientRect(); let row = rows.find((x) => Math.abs(x.c - (r.top + r.bottom) / 2) < r.height / 2); if (!row) rows.push((row = { c: (r.top + r.bottom) / 2, els: [] })); row.els.push(el); }
    for (const row of rows) {
      if (row.els.length < 2) continue;
      const rs = row.els.map((e) => e.getBoundingClientRect()), cs = rs.map((r) => (r.top + r.bottom) / 2), hs = rs.map((r) => r.height);
      const spreadC = Math.max(...cs) - Math.min(...cs), spreadH = Math.max(...hs) - Math.min(...hs);
      if (spreadC > 2 || (spreadH > 3 && spreadH < 20)) out.push(`linha [${String(p.className).split(" ")[0] || p.tagName}]: ${row.els.map(name).join(" | ").slice(0, 70)} → centros ±${spreadC.toFixed(1)}px, alturas ${Math.min(...hs).toFixed(0)}–${Math.max(...hs).toFixed(0)}px`);
    }
  }
  // tinta das abas por baixo da aba ativa
  document.querySelectorAll("[data-tabs]").forEach((t) => {
    const ink = t.querySelector(".tab-ink"), on = t.querySelector(".tab.on");
    if (!ink || !on) return;
    const a = ink.getBoundingClientRect(), b = on.getBoundingClientRect();
    if (Math.abs(a.left - b.left) > 1.5 || Math.abs(a.width - b.width) > 1.5) out.push(`aba ativa "${name(on)}": destaque deslocado ${(a.left - b.left).toFixed(1)}px`);
  });
  return [...new Set(out)];
}

const report = {};
for (const [dev, launch, opts] of [["pc", chromium, { viewport: { width: 1440, height: 900 } }], ["iphone", webkit, devices["iPhone 15"]], ["pixel", chromium, devices["Pixel 7"]]]) {
  const b = await launch.launch(launch === chromium ? { channel: "chrome" } : {});
  const ctx = await b.newContext({ ...opts, locale: "pt-BR", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const h of PAGES) {
    await page.goto(`${BASE}/?estatico${h}`, { waitUntil: "load" });
    await page.waitForTimeout(900);
    const r = await page.evaluate(audit);
    if (r.length) report[`${dev} ${h}`] = r;
  }
  await b.close();
}
writeFileSync(`${OUT}alinhamento.json`, JSON.stringify(report, null, 2));
for (const [k, v] of Object.entries(report)) { console.log(`\n== ${k}`); v.forEach((x) => console.log("  ", x)); }
if (!Object.keys(report).length) console.log("nenhum desalinhamento");
