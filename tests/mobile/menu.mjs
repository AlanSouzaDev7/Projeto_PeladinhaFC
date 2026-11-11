/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. */
/* Menu principal em toda largura de tela: no PC, o do topo; no celular e no tablet, a barra inferior.
   Confere que os 6 itens (Ao vivo, Clubes, Tabela, Simulador, Bora pro jogo, Sobre) estão visíveis, não ficam cobertos
   e levam à página certa com o item marcado. (Antes, abaixo de 900 px o site ficava sem menu nenhum.)
   E a coluna "Próx." da tabela: nunca mostra um adversário de jogo que já terminou.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/menu.mjs */
import { chromium, webkit, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5173";
const ROTAS = { home: "#/", clubes: "#/clubes", tabela: "#/tabela", simulador: "#/simulador", "bora-pro-jogo": "#/bora-pro-jogo", sobre: "#/sobre" };
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? "ok  " : "FALHA"} · ${msg}`); if (!c) falhas++; };

const telas = [["pc 1440", chromium, { viewport: { width: 1440, height: 900 } }, { channel: "chrome" }],
  ["tablet 900", chromium, { viewport: { width: 900, height: 1100 } }, { channel: "chrome" }],
  ["tablet 768", chromium, { viewport: { width: 768, height: 1024 }, hasTouch: true }, { channel: "chrome" }],
  ["pixel7", chromium, devices["Pixel 7"], { channel: "chrome" }], ["iphone15", webkit, devices["iPhone 15"], {}],
  ["celular 360", chromium, { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }, { channel: "chrome" }]];
for (const [nome, eng, opts, launch] of telas) {
  const b = await eng.launch(launch);
  const p = await (await b.newContext({ ...opts, locale: "pt-BR", reducedMotion: "reduce" })).newPage();
  await p.goto(`${BASE}/?estatico&v=${Date.now()}#/tabela`, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const menu = await p.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1; };
    const qual = [...document.querySelectorAll("nav.nav, nav.bottom-nav")].find(vis);
    if (!qual) return null;
    const itens = [...qual.querySelectorAll("a[data-nav]")].map((a) => {
      const r = a.getBoundingClientRect(), topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { nav: a.dataset.nav, visivel: vis(a), livre: !!topo && (topo === a || a.contains(topo)), alto: r.height };
    });
    return { qual: qual.className, itens };
  });
  ok(!!menu, `${nome} · menu visível${menu ? ` (${menu.qual})` : ""}`);
  if (menu) {
    ok(menu.itens.length === 6 && menu.itens.every((i) => i.visivel && i.livre), `${nome} · os 6 itens aparecem e nada os cobre (${menu.itens.filter((i) => i.visivel && i.livre).length}/6)`);
    if (menu.qual.includes("bottom")) ok(menu.itens.every((i) => i.alto >= 40), `${nome} · área de toque de pelo menos 40 px`);
    for (const [k, h] of Object.entries(ROTAS)) {
      const a = p.locator(`nav.${menu.qual.split(" ")[0]} a[data-nav="${k}"]`);
      await (opts.hasTouch || opts.isMobile ? a.tap() : a.click());
      await p.waitForTimeout(700);
      const r = await p.evaluate((k) => ({ hash: location.hash, on: document.querySelector(`nav a[data-nav="${k}"].active`) != null }), k);
      ok((r.hash || "#/") === h && r.on, `${nome} · ${k} abre ${h} e fica marcado`);
    }
  }
  await b.close();
}

// coluna "Próx.": jogo encerrado não conta; com a bola rolando, o adversário de agora
{
  const b = await chromium.launch({ channel: "chrome" });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(`${BASE}/?estatico&v=${Date.now()}#/tabela`, { waitUntil: "load" });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => {
    const all = Object.values(window.PD.FIXTURES).flat();
    const enc = (g) => g[8]?.state === "post" || (g[2] != null && !(g[8] && g[8].state === "in"));
    const kick = (g) => (g[4] ? Date.parse(`${g[4]}T${g[5] || "23:59"}:00-03:00`) : Infinity);
    return [...document.querySelectorAll("table.table tbody tr")].map((tr) => {
      const id = tr.querySelector("td.club a").getAttribute("href").split("/").pop();
      const tds = tr.querySelectorAll("td"), prox = (tds[tds.length - 1].querySelector("a")?.getAttribute("href") || "").split("/").pop();
      const esperado = all.filter((g) => (g[0] === id || g[1] === id) && !enc(g)).sort((a, b) => kick(a) - kick(b))[0];
      return { id, prox, esperado: esperado ? (esperado[0] === id ? esperado[1] : esperado[0]) : null };
    });
  });
  const erradas = r.filter((x) => x.esperado && x.prox !== x.esperado);
  ok(r.length === 20 && !erradas.length, `tabela · "Próx." é o próximo jogo ainda não encerrado de cada clube${erradas.length ? ` (erradas: ${erradas.map((x) => `${x.id} → ${x.prox}, devia ${x.esperado}`).join("; ")})` : ""}`);
  // simula o fim de um jogo em andamento ou marcado: a tabela troca o adversário sem recarregar
  const troca = await p.evaluate(async () => {
    const all = Object.values(window.PD.FIXTURES).flat();
    const kick = (g) => (g[4] ? Date.parse(`${g[4]}T${g[5] || "23:59"}:00-03:00`) : Infinity);
    const g = all.filter((x) => !(x[8]?.state === "post") && x[2] == null).sort((a, b) => kick(a) - kick(b))[0];
    if (!g) return null;
    const id = g[0], celula = () => { const tr = [...document.querySelectorAll("table.table tbody tr")].find((t) => t.querySelector(`td.club a[href$="/${id}"]`)); const tds = tr.querySelectorAll("td"); return (tds[tds.length - 1].querySelector("a")?.getAttribute("href") || "").split("/").pop(); };
    const antes = celula();
    while (g.length < 9) g.push(null);
    g[2] = 1; g[3] = 0; g[8] = { state: "post", clock: "90'", detail: "FT", gols: [] };
    window.dispatchEvent(new Event("placar:data"));
    await new Promise((r) => setTimeout(r, 600));
    return { id, antes, depois: celula(), jogou: g[1] };
  });
  if (troca) ok(troca.antes === troca.jogou && troca.depois !== troca.jogou, `tabela · quando ${troca.id} x ${troca.jogou} termina, "Próx." troca na hora (${troca.antes} → ${troca.depois || "—"})`);
  await b.close();
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nMenu e próximo adversário certos em todas as telas.");
process.exit(falhas ? 1 : 0);
