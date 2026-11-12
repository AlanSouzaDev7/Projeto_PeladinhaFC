/* ==========================================================================
   PLACAR — QA completo (PC, iPhone 15 e Pixel 7)
   Para cada página, do início às subpáginas:
     erros de script e do console, requisições com falha, links internos quebrados,
     contraste de texto (WCAG AA), foco visível pelo teclado, rolagem lateral,
     quadros perdidos ao rolar e ao trocar de página, tarefas longas,
     e as interações principais (busca, tema, rodadas, filtros, favoritos, carrossel,
     abas do clube, ficha do artilheiro, prévia do ranking, voltar do navegador).
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/qa.mjs
   Resultado: tests/mobile/out/qa.json e prints qa-<aparelho>-<página>.png
   ========================================================================== */
import { chromium, webkit, devices } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const OUT = new URL("./out/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const SO = process.env.SO; // "pc", "iphone" ou "pixel" para rodar um só

const PAGES = [
  ["inicio", "#/"], ["clubes", "#/clubes"],
  ["clube", "#/clube/flamengo"], ["partidas", "#/clube/cruzeiro/partidas"], ["elenco", "#/clube/vasco/elenco"],
  ["estatist", "#/clube/palmeiras/estatisticas"], ["clube-tab", "#/clube/gremio/tabela"],
  ["tabela", "#/tabela"], ["rank-gols", "#/tabela/gols"], ["rank-amarelos", "#/tabela/amarelos"], ["simulador", "#/simulador"], ["simul-todas", "#/simulador/todas"], ["jogador", "#/jogador/216098-cruzeiro"], ["jog-calor", "#/jogador/216098-cruzeiro/calor"], ["comparar", "#/clube/cruzeiro/comparar/atletico-mg"],
  ["partida-fim", "#/partida/bragantino-x-santos-r34"], ["partida-futura", "#/partida/flamengo-x-gremio-r34"],
  ["bora", "#/bora-pro-jogo/flamengo/palmeiras"], ["sobre", "#/sobre"], ["404", "#/nao-existe"],
];
const DEVICES = [
  { name: "pc", engine: chromium, opts: { viewport: { width: 1440, height: 900 } }, launch: { channel: "chrome" } },
  { name: "pc-escuro", engine: chromium, opts: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" }, launch: { channel: "chrome" }, soPaginas: true },
  { name: "iphone", engine: webkit, opts: devices["iPhone 15"] },
  { name: "pixel", engine: chromium, opts: devices["Pixel 7"], launch: { channel: "chrome" } },
].filter((d) => !SO || SO.split(",").includes(d.name));

/* ---------- roda dentro da página ---------- */
function inspect() {
  const vw = document.documentElement.clientWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05; };
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.className || el.tagName).toString().trim().replace(/\s+/g, " ").slice(0, 36);
  // cor -> [r,g,b,a]
  const parse = (c) => { let m = c.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; } m = c.match(/color\(srgb ([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mix = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  // fundo efetivo: soma as camadas até achar uma opaca; se houver imagem/gradiente no caminho, não dá para medir
  function bgOf(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== "none" && !/^(html|body)$/i.test(e.tagName)) return null;
      const c = parse(s.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
    }
    let acc = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) acc = mix(layers[i], acc);
    return acc;
  }
  const out = { vw, scrollW: document.documentElement.scrollWidth };
  out.overflow = out.scrollW > vw + 1;
  // contraste
  const low = [];
  const texts = [...document.querySelectorAll("body *")].filter((el) => vis(el) && !el.closest("svg, canvas, .hero, .gb, .curtain, .pitch, .board, .goal-alert, [aria-hidden=true], .tab.on, .club-card, .match-hero") && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  for (const el of texts.slice(0, 1500)) {
    const s = getComputedStyle(el), fg = parse(s.color); if (!fg) continue;
    const bg = bgOf(el); if (!bg) continue;
    const c = mix([fg[0], fg[1], fg[2], fg[3] * (+s.opacity || 1)], bg);
    const L1 = lum(c), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const big = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.6 && +s.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5) - 0.05) low.push(`${label(el)} ${ratio.toFixed(2)}:1 (${s.fontSize})`);
  }
  out.contrast = [...new Set(low)].slice(0, 12); out.contrastN = low.length;
  // links internos
  out.links = [...new Set([...document.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute("href")))];
  // conteúdo principal existe
  out.h1 = document.querySelector("main h1, .view h1")?.textContent.trim().slice(0, 40) || null;
  out.notFound = !!document.querySelector(".not-found, [data-not-found]") || /Impedimento!/.test(document.querySelector(".view")?.textContent.slice(0, 400) || "");
  out.title = document.title;
  const named = (el) => (el.getAttribute("aria-label") || el.textContent || el.title || el.querySelector("img[alt]")?.alt || "").trim();
  out.unnamed = [...document.querySelectorAll("a[href], button, select, input")].filter((el) => vis(el) && !named(el) && !el.labels?.length && !el.placeholder).map((el) => el.outerHTML.slice(0, 80)).slice(0, 5);
  out.imgNoAlt = document.querySelectorAll("img:not([alt])").length;
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
  out.dupIds = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  return out;
}

// quadros perdidos: mede intervalos entre quadros enquanto algo acontece
const frameProbe = () => { window.__fr = []; let last = performance.now(); const f = (t) => { window.__fr.push(t - last); last = t; if (window.__fr.length < 2000) window.__frRaf = requestAnimationFrame(f); }; window.__frRaf = requestAnimationFrame(f); };
const frameRead = () => { cancelAnimationFrame(window.__frRaf); const d = (window.__fr || []).slice(2); if (!d.length) return null; const s = [...d].sort((a, b) => a - b); return { quadros: d.length, mediaMs: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(1), travadas: d.filter((x) => x > 50).length }; };

const report = { paginas: {}, interacoes: {}, links: {}, foco: {}, fluidez: {}, erros: {} };
for (const D of DEVICES) {
  const browser = await D.engine.launch(D.launch || {});
  const ctx = await browser.newContext({ ...D.opts, locale: "pt-BR" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`erro: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(`console: ${m.text().slice(0, 140)}`); });
  page.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && u.startsWith(BASE) && !/\/api\//.test(u)) errs.push(`HTTP ${r.status()} ${u.replace(BASE, "")}`); });
  if (D.engine === chromium) await page.addInitScript(() => { window.__long = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true }); } catch {} });

  const allLinks = new Set();
  for (const [name, hash] of PAGES) {
    const n0 = errs.length;
    await page.goto(`${BASE}/?estatico${hash}`, { waitUntil: "load" });
    await page.waitForTimeout(1300);
    const r = await page.evaluate(inspect);
    r.links.forEach((l) => allLinks.add(l));
    delete r.links;
    // rolar a página inteira: quadros perdidos
    await page.evaluate(frameProbe);
    await page.evaluate(async () => { const H = document.documentElement.scrollHeight - innerHeight; for (let y = 0; y <= H; y += Math.max(120, H / 30)) { scrollTo({ top: y, behavior: "instant" }); await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); } scrollTo({ top: 0, behavior: "instant" }); });
    r.rolagem = await page.evaluate(frameRead);
    if (D.engine === chromium) r.tarefasLongas = await page.evaluate(() => window.__long.splice(0).filter((x) => x > 80));
    r.erros = errs.slice(n0);
    await page.screenshot({ path: `${OUT}qa-${D.name}-${name}.png`, fullPage: true });
    report.paginas[`${D.name} ${name}`] = r;
  }

  if (D.soPaginas) { report.erros[D.name] = errs; await browser.close(); continue; }
  /* ---------- links internos: todos abrem uma página de verdade ---------- */
  const broken = [];
  for (const href of [...allLinks].slice(0, 400)) {
    await page.evaluate((h) => { location.hash = h; }, href);
    await page.waitForTimeout(href.startsWith("#/clube/") && !href.split("/")[3] ? 1700 : 260);
    const bad = await page.evaluate(() => /Impedimento!|página não existe/i.test(document.querySelector(".view")?.textContent.slice(0, 500) || "") || !document.querySelector(".view")?.textContent.trim());
    if (bad) broken.push(href);
  }
  report.links[D.name] = { testados: Math.min(allLinks.size, 400), quebrados: broken };

  /* ---------- interações ---------- */
  const it = {};
  const T = async (nome, fn) => { try { it[nome] = (await fn()) ?? "ok"; } catch (e) { it[nome] = `FALHOU: ${e.message.split("\n")[0].slice(0, 120)}`; } };
  await page.goto(`${BASE}/?estatico#/`, { waitUntil: "load" }); await page.waitForTimeout(1200);
  await T("busca", async () => {
    const inp = page.locator("#search"); await inp.click(); await inp.fill("cruz");
    await page.waitForTimeout(300);
    const n = await page.locator("#search-results a").count();
    if (!n) throw new Error("nenhum resultado para 'cruz'");
    await page.keyboard.press("Escape").catch(() => {});
    return `${n} resultado(s)`;
  });
  await page.goto(`${BASE}/?estatico#/`, { waitUntil: "load" }); await page.waitForTimeout(1000);
  await T("tema claro/escuro", async () => {
    const a = await page.evaluate(() => document.documentElement.dataset.theme || "auto");
    await page.locator("#theme").click(); await page.waitForTimeout(400);
    const b = await page.evaluate(() => document.documentElement.dataset.theme);
    if (a === b) throw new Error("tema não mudou"); return `${a} → ${b}`;
  });
  await T("rodada seguinte/anterior", async () => {
    const t0 = await page.locator(".round-nav b").first().innerText();
    await page.locator(".round-nav button").last().click(); await page.waitForTimeout(500);
    const t1 = await page.locator(".round-nav b").first().innerText();
    if (t0 === t1) throw new Error("rodada não mudou"); return `${t0.split("\n")[0]} → ${t1.split("\n")[0]}`;
  });
  await page.goto(`${BASE}/?estatico&v=2#/`, { waitUntil: "load" }); await page.waitForTimeout(1000);
  await T("filtros Fim/A jogar", async () => {
    const all = await page.locator(".match:visible").count();
    await page.locator('[data-filter="ft"]').click(); await page.waitForTimeout(300);
    const ft = await page.locator(".match:visible").count();
    await page.locator('[data-filter="all"]').click();
    if (!(ft > 0 && ft <= all)) throw new Error(`todos ${all}, fim ${ft}`); return `todos ${all} · fim ${ft}`;
  });
  await T("favoritar", async () => {
    const st = page.locator(".star, [data-fav]").first(); await st.click(); await page.waitForTimeout(250);
    const on = await st.evaluate((e) => e.classList.contains("on") || e.getAttribute("aria-pressed") === "true");
    await st.click(); return on ? "liga e desliga" : "sem estado visível (aria-pressed/classe)";
  });
  await T("carrossel do próximo jogo", async () => {
    const t0 = await page.locator(".feat-link").first().innerText();
    await page.locator('[data-feat="1"], [data-feat="next"], .feat-nav button').last().click(); await page.waitForTimeout(500);
    const t1 = await page.locator(".feat-link").first().innerText();
    if (t0 === t1) throw new Error("não passou"); return "passa";
  });
  await T("ficha do artilheiro", async () => {
    const sc = page.locator("[data-scorer]").first(); await sc.scrollIntoViewIfNeeded();
    if (D.name === "pc") await sc.click(); else await sc.tap();
    await page.waitForTimeout(500);
    if (!(await page.locator(".scorer-card.open").count())) throw new Error("ficha não abriu"); return "abre";
  });
  await page.goto(`${BASE}/?estatico#/clube/flamengo`, { waitUntil: "load" }); await page.waitForTimeout(1500);
  await T("abas do clube", async () => {
    for (const k of ["partidas", "elenco", "estatisticas", "tabela"]) { await page.locator(`.club-tabs a[href$="/${k}"]`).click(); await page.waitForTimeout(700); }
    const h = await page.evaluate(() => location.hash); if (!h.endsWith("/tabela")) throw new Error(h); return "4 abas";
  });
  await T("voltar do navegador", async () => {
    await page.goBack(); await page.waitForTimeout(500); const h = await page.evaluate(() => location.hash);
    if (!h.endsWith("/estatisticas")) throw new Error(`voltou para ${h}`); return "volta para a aba anterior";
  });
  await page.goto(`${BASE}/?estatico#/tabela`, { waitUntil: "load" }); await page.waitForTimeout(1200);
  await T("prévia do ranking", async () => {
    const k = page.locator("[data-rank-preview]").first();
    if (D.name === "pc") { await k.hover(); await page.waitForTimeout(500); if (!(await page.locator(".rank-preview.open").count())) throw new Error("prévia não abriu"); return "abre ao passar o mouse"; }
    await k.tap(); await page.waitForTimeout(600); const h = await page.evaluate(() => location.hash); if (!/tabela\//.test(h)) throw new Error(h); return "toque abre o ranking";
  });
  await T("tabela: link do clube", async () => {
    await page.goto(`${BASE}/?estatico#/tabela`, { waitUntil: "load" }); await page.waitForTimeout(800);
    await page.locator(".table td.club a").first().click(); await page.waitForTimeout(1800);
    const h = await page.evaluate(() => location.hash); if (!h.startsWith("#/clube/")) throw new Error(h); return h;
  });
  report.interacoes[D.name] = it;

  /* ---------- teclado: o foco aparece? ---------- */
  if (D.name === "pc") {
    await page.goto(`${BASE}/?estatico#/`, { waitUntil: "load" }); await page.waitForTimeout(1000);
    const semFoco = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return null; const s = getComputedStyle(el); const vis = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none"); return { el: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30), vis }; });
      if (f && !f.vis) semFoco.push(f.el);
    }
    report.foco[D.name] = { semFocoVisivel: [...new Set(semFoco)] };
  }

  /* ---------- fluidez ao trocar de página ---------- */
  const flu = {};
  for (const [nome, from, to] of [["início → clube (cortina)", "#/", "#/clube/cruzeiro"], ["clube → tabela", "#/clube/cruzeiro", "#/tabela"], ["tabela → partida", "#/tabela", "#/partida/bragantino-x-santos-r34"], ["clubes → clube", "#/clubes", "#/clube/vasco"]]) {
    await page.goto(`${BASE}/${from}`, { waitUntil: "load" }); await page.waitForTimeout(1500);
    await page.evaluate(frameProbe);
    await page.evaluate((h) => { location.hash = h; }, to);
    await page.waitForTimeout(2200);
    flu[nome] = await page.evaluate(frameRead);
  }
  report.fluidez[D.name] = flu;
  report.erros[D.name] = errs;
  await browser.close();
}
writeFileSync(`${OUT}qa.json`, JSON.stringify(report, null, 2));

/* ---------- resumo ---------- */
for (const [k, r] of Object.entries(report.paginas)) {
  const f = [r.overflow && `ROLA PARA O LADO (${r.scrollW}>${r.vw})`, r.contrastN && `${r.contrastN} textos com pouco contraste`, r.erros.length && `${r.erros.length} erros`, r.unnamed.length && `${r.unnamed.length} sem nome`, r.imgNoAlt && `${r.imgNoAlt} img sem alt`, r.dupIds.length && `ids repetidos ${r.dupIds}`, r.rolagem?.travadas && `${r.rolagem.travadas} travadas ao rolar (p95 ${r.rolagem.p95Ms} ms)`, r.tarefasLongas?.length && `tarefas longas ${r.tarefasLongas.join("/")} ms`, !r.h1 && !k.endsWith("404") && "sem título h1", r.notFound && !k.endsWith("404") && "PÁGINA NÃO ENCONTRADA"].filter(Boolean);
  console.log(`${k.padEnd(22)} ${f.join(" · ") || "ok"}`);
  if (r.contrast.length) console.log("    contraste:", r.contrast.slice(0, 5).join(" | "));
  if (r.erros.length) console.log("    erros:", r.erros.slice(0, 3).join(" | "));
}
console.log("\nlinks:", JSON.stringify(report.links));
console.log("interações:", JSON.stringify(report.interacoes, null, 1));
console.log("foco:", JSON.stringify(report.foco));
console.log("fluidez:", JSON.stringify(report.fluidez, null, 1));
