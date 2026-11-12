/* Jogadores: busca, página do jogador (visão geral, últimos 10, temporada, mapa de calor, comparar), fotos,
   mapa de calor real no "Bora pro jogo", comparativo de clubes e escudos dos estaduais.
   - dados (js/jogadores/*.js): mapa de calor com orientação certa (goleiros perto do próprio gol, atacantes perto do
     gol adversário), números de cada jogo somando os da temporada, fotos que abrem;
   - busca: jogadores por nome e sobrenome, os dois Matheus Pereira (Cruzeiro e Corinthians, mesmo número na ESPN),
     histórico (guarda, mostra, limpa) e "Em destaque" sem servidor;
   - página do Matheus Pereira (Cruzeiro): números, abas, mapa pintado, comparativo com outro jogador;
   - 20 clubes: o jogador com mais minutos de cada um abre sem erro; comparativo com o rival;
   - celular (320 e 390 px): nada sai da tela.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/jogadores.mjs */
import { chromium, devices } from "playwright";
import { readFileSync, readdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
const falhas = [];
const erro = (m) => { falhas.push(m); console.log("  ✗", m); };
const ok = (m) => console.log("  ✓", m);
async function ateQue(page, fn, arg, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(200); } return false; }
const NIV = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/* ---------- 1) os dados ---------- */
console.log("dados dos 20 clubes (js/jogadores)");
const D = {};
for (const f of readdirSync(`${ROOT}js/jogadores`).filter((x) => x.endsWith(".js"))) {
  const t = readFileSync(`${ROOT}js/jogadores/${f}`, "utf8");
  D[f.slice(0, -3)] = JSON.parse(t.slice(t.indexOf("= {") + 2, t.lastIndexOf("}") + 1));
}
if (Object.keys(D).length !== 20) erro(`${Object.keys(D).length} arquivos de clube (esperava 20)`);
const centro = (txt, gx = 24) => { let s = 0, x = 0; [...txt].forEach((c, k) => { const v = (NIV.indexOf(c) / 61) ** 2; if (v > 0) { s += v; x += v * (((k % gx) + 0.5) / gx) * 100; } }); return s ? x / s : null; };
const gol = [], ata = [];
let somaErrada = 0, jogos = 0, comLances = 0, comFoto = 0;
for (const [cid, d] of Object.entries(D)) {
  for (const [aid, j] of Object.entries(d.jogadores)) {
    if (j.calor && j.lances > 60) (j.pos === "G" ? gol : j.pos === "F" ? ata : []).push(centro(j.calor));
    if (j.lances) comLances++;
    if (j.foto) comFoto++;
    // jogo a jogo soma a temporada
    for (const [comp, t] of Object.entries(j.comps)) {
      const js = j.jogos.filter((r) => r[2] === comp);
      jogos += js.length;
      const soma = (k) => js.reduce((s, r) => s + (r[d.campos.indexOf(k)] || 0), 0);
      if (js.length !== t.j || soma("g") !== t.g || soma("min") !== t.min || soma("toques") !== t.toques) somaErrada++;
    }
    void aid; void cid;
  }
}
const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
if (med(gol) > 25) erro(`goleiros com o calor no meio do campo (mediana ${med(gol).toFixed(0)}% da profundidade)`); else ok(`goleiros: calor perto do próprio gol (mediana ${med(gol).toFixed(0)}% da profundidade, ${gol.length} goleiros)`);
if (med(ata) < 55) erro(`atacantes longe do ataque (mediana ${med(ata).toFixed(0)}%)`); else ok(`atacantes: calor perto do gol adversário (mediana ${med(ata).toFixed(0)}%, ${ata.length} atacantes)`);
if (somaErrada) erro(`${somaErrada} competições em que os jogos não somam a temporada`); else ok(`${jogos} jogos de jogadores somam exatamente a temporada de cada competição`);
ok(`${comLances} jogadores com lances reais, ${comFoto} com foto livre`);
const mp = D.cruzeiro.jogadores["216098"];
if (!mp || mp.num !== 10 || (mp.comps["Brasileirão"]?.j || 0) < 25) erro("Matheus Pereira (Cruzeiro, camisa 10) sem a temporada no arquivo do Cruzeiro");
else ok(`Matheus Pereira no Cruzeiro: ${Object.values(mp.comps).reduce((s, c) => s + c.j, 0)} jogos, ${Object.values(mp.comps).reduce((s, c) => s + c.g, 0)} gols, ${mp.lances} ações`);

/* ---------- 2) fotos abrem ---------- */
console.log("fotos (Wikimedia Commons)");
{
  const ctx = await browser.newContext(), page = await ctx.newPage();
  await page.goto(`${BASE}/?v=${Date.now()}#/sobre`, { waitUntil: "load" });
  const urls = [...new Set(Object.values(D).flatMap((d) => Object.values(d.jogadores).filter((j) => j.foto).map((j) => j.foto.url)))];
  const r = await page.evaluate(async (urls) => {
    const testa = (u) => new Promise((res) => { const im = new Image(); im.referrerPolicy = "no-referrer"; im.onload = () => res(im.naturalWidth > 20); im.onerror = () => res(false); im.src = u; setTimeout(() => res(false), 15000); });
    const out = [];
    for (let i = 0; i < urls.length; i += 12) out.push(...(await Promise.all(urls.slice(i, i + 12).map(testa))));
    return out;
  }, urls);
  const ruins = urls.filter((_, i) => !r[i]);
  if (ruins.length) erro(`${ruins.length} de ${urls.length} fotos não abriram (ex.: ${ruins[0]})`); else ok(`${urls.length} fotos abrem`);
  const semCredito = Object.values(D).flatMap((d) => Object.values(d.jogadores)).filter((j) => j.foto && !(j.foto.autor && j.foto.licenca && j.foto.pagina)).length;
  if (semCredito) erro(`${semCredito} fotos sem autor, licença ou página`); else ok("todas as fotos com autor, licença e página no Commons");
  await ctx.close();
}

async function abrir(opts, hash) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark" });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?v=${Date.now()}${hash}`, { waitUntil: "load" });
  return { ctx, page, erros };
}
const pintado = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((cv) => { const c = cv.getContext("2d"), d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 30) n++; return n; }), sel);

/* ---------- 3) busca ---------- */
console.log("busca de jogadores, histórico e em destaque (PC)");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 860 } }, "#/");
  await page.waitForSelector(".match");
  const nomes = async (q) => { await page.locator("#search").fill(""); await page.locator("#search").fill(q); return page.evaluate(() => [...document.querySelectorAll("#search-results a")].map((a) => `${a.querySelector("b").textContent}|${a.getAttribute("href")}`)); };
  let r = await nomes("matheus pe");
  const cru = r.find((x) => x.endsWith("#/jogador/216098-cruzeiro")), cor = r.find((x) => x.endsWith("#/jogador/216098-corinthians"));
  if (!cru || !cor) erro(`"matheus pe": esperava os dois Matheus Pereira, veio ${r.join(", ")}`); else ok(`"matheus pe": os dois Matheus Pereira, cada um com o seu clube`);
  r = await nomes("pereira");
  if (!r.some((x) => x.startsWith("Matheus Pereira"))) erro(`sobrenome "pereira" não achou o Matheus Pereira`); else ok(`sobrenome: "pereira" acha ${r.length} jogadores`);
  r = await nomes("f");
  if (r.slice(0, 2).map((x) => x.split("|")[0]).join() !== "Flamengo,Fluminense") erro(`"f" deveria começar com Flamengo e Fluminense: ${r.join(", ")}`); else ok(`"f": clubes Flamengo e Fluminense primeiro${r.length > 2 ? `, depois ${r.length - 2} jogadores` : ""}`);
  r = await nomes("cr");
  if (!r[0]?.startsWith("Cruzeiro|")) erro(`"cr": esperava o Cruzeiro primeiro`);
  // abre o Matheus Pereira do Cruzeiro pela busca e confere o histórico
  await nomes("matheus pe");
  await page.click('#search-results a[href="#/jogador/216098-cruzeiro"]');
  await page.waitForSelector("[data-jogador]");
  await page.locator("#search").focus();
  await page.waitForTimeout(500);
  const painel = await page.locator("#search-results").innerText();
  if (!/Buscas recentes/i.test(painel) || !/Matheus Pereira/.test(painel)) erro("histórico não mostrou a busca feita"); else ok("histórico: a busca aberta aparece em \"Buscas recentes\"");
  if (!/Em destaque agora|Em alta/i.test(painel)) erro("sem a lista Em alta/Em destaque"); else ok(`sem servidor: lista "${/Em alta/i.test(painel) && !/destaque/i.test(painel) ? "Em alta" : "Em destaque agora"}"`);
  await page.click("[data-busca-limpa]");
  await page.waitForTimeout(400);
  if (/Buscas recentes/i.test(await page.locator("#search-results").innerText())) erro("Limpar não apagou o histórico"); else ok("Limpar apaga o histórico");
  const hist = await page.evaluate(() => localStorage.getItem("placar:busca-hist"));
  if (hist && hist !== "[]") erro(`histórico ficou guardado: ${hist}`);
  if (erros.length) erro(`erros de JavaScript: ${erros.join(" | ")}`);
  await ctx.close();
}

/* ---------- 4) página do Matheus Pereira ---------- */
console.log("página do jogador: Matheus Pereira (Cruzeiro)");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/jogador/216098-cruzeiro");
  await ateQue(page, () => !!document.querySelector("[data-jg-kpis] .jg-k"));
  const k = await page.evaluate(() => [...document.querySelectorAll("[data-jg-kpis] .jg-k b")].map((b) => b.textContent));
  const tot = (key) => Object.values(mp.comps).reduce((s, c) => s + c[key], 0);
  if (k[0] !== String(tot("j")) || k[2] !== String(tot("g")) || k[3] !== String(tot("a"))) erro(`números do topo ${k} ≠ arquivo (${tot("j")} jogos, ${tot("g")} gols, ${tot("a")} assist.)`); else ok(`topo: ${k[0]} jogos, ${k[1]} min, ${k[2]} gols, ${k[3]} assistências`);
  await ateQue(page, () => { const i = document.querySelector(".jg-topo .jg-av img"); return !i || (i.complete && i.naturalWidth > 0); }, null, 10000);
  const foto = await page.evaluate(() => { const i = document.querySelector(".jg-topo .jg-av img"); return i ? i.complete && i.naturalWidth : null; });
  if (mp.foto && !foto) erro("foto do topo não abriu"); else ok(mp.foto ? "foto livre (Wikimedia Commons) no topo, com crédito" : "sem foto livre: número no lugar");
  await page.waitForTimeout(600);
  let px = await pintado(page, ".jg-calor");
  if (!px.length || !px[0]) erro("mapa de calor da visão geral vazio"); else ok("visão geral: mapa de calor pintado");
  // últimos 10
  await page.click('.tab[href$="/ultimos"]'); await ateQue(page, () => !!document.querySelector(".jg-jogos tbody tr"));
  const n10 = await page.locator(".jg-jogos tbody tr").count();
  if (n10 !== Math.min(10, mp.jogos.length)) erro(`últimos 10: ${n10} linhas`); else ok("últimos 10: 10 jogos, jogo a jogo");
  // temporada + filtro
  await page.click('.tab[href$="/temporada"]'); await ateQue(page, () => !!document.querySelector("[data-jg-filtro]"));
  const nt = await page.locator(".jg-jogos tbody tr:not(.jg-mes)").count();
  if (nt !== mp.jogos.length) erro(`temporada: ${nt} jogos, arquivo tem ${mp.jogos.length}`); else ok(`temporada: os ${nt} jogos, por mês`);
  await page.click('[data-jg-filtro="Libertadores"]').catch(() => {});
  const nl = await page.locator(".jg-jogos tbody tr:not(.jg-mes)").count();
  if (mp.comps.Libertadores && nl !== mp.comps.Libertadores.j) erro(`filtro Libertadores: ${nl}, esperava ${mp.comps.Libertadores.j}`); else ok(`filtro por competição (Libertadores: ${nl})`);
  // mapa de calor completo
  await page.click('.tab[href$="/calor"]'); await ateQue(page, () => document.querySelectorAll(".jg-campo.grande").length === 2); await page.waitForTimeout(500);
  px = await pintado(page, ".jg-calor");
  const zonas = await page.evaluate(() => [...document.querySelectorAll(".jg-zonas ul")].map((u) => [...u.querySelectorAll("b")].reduce((s, b) => s + parseInt(b.textContent), 0)));
  if (px.length !== 2 || px.some((x) => !x)) erro(`mapa completo: ${px}`); else if (zonas.some((z) => z < 98 || z > 102)) erro(`zonas não somam 100%: ${zonas}`); else ok("mapa completo: temporada e últimos 10, zonas somando 100%");
  // comparar com o Kaio Jorge (Cruzeiro)
  await page.click('.tab[href$="/comparar"]'); await ateQue(page, () => !!document.querySelector("[data-jg-cmp]"));
  await page.locator("[data-jg-cmp]").fill("kaio j");
  await page.waitForTimeout(300);
  const alvo = await page.locator("[data-jg-cmp-res] a").first().getAttribute("href").catch(() => null);
  if (!alvo) erro("comparar: busca de outro jogador vazia");
  else {
    await page.click("[data-jg-cmp-res] a >> nth=0");
    await ateQue(page, () => document.querySelectorAll(".jg-cmp-l li").length > 10);
    await page.waitForTimeout(500);
    const linhas = await page.locator(".jg-cmp-l li").count(), cm = await pintado(page, ".jg-cmp-calor .jg-calor");
    if (linhas < 15 || cm.some((x) => !x)) erro(`comparar: ${linhas} linhas, mapas ${cm}`); else ok(`comparar (${alvo.split("/").pop()}): ${linhas} números por 90 min e os dois mapas`);
  }
  if (erros.length) erro(`erros de JavaScript: ${erros.join(" | ")}`);
  await ctx.close();
}

/* ---------- 5) 20 clubes: jogador com mais minutos, comparativo de clubes, fotos nas estatísticas ---------- */
console.log("20 clubes");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/");
  for (const [cid, d] of Object.entries(D)) {
    const [aid] = Object.entries(d.jogadores).sort((a, b) => Object.values(b[1].comps).reduce((s, c) => s + c.min, 0) - Object.values(a[1].comps).reduce((s, c) => s + c.min, 0))[0];
    await page.goto(`${BASE}/?v=${Date.now()}#/jogador/${aid}-${cid}`);
    const deu = await ateQue(page, () => !!document.querySelector("[data-jg-kpis] .jg-k"), null, 10000);
    await page.waitForTimeout(400);
    const px = await pintado(page, ".jg-calor");
    if (!deu) erro(`${cid}: página do jogador ${aid} não carregou`);
    else if (d.jogadores[aid].lances && !px[0]) erro(`${cid}: mapa de calor vazio (${aid})`);
    await page.goto(`${BASE}/?v=${Date.now()}#/clube/${cid}/comparar`);
    await ateQue(page, () => document.querySelectorAll("[data-comparar] .jg-cmp-l li").length >= 13, null, 10000);
    const n = await page.locator("[data-comparar] .jg-cmp-l li").count();
    if (n < 13) erro(`${cid}: comparativo com ${n} linhas`);
  }
  // fotos e links nas estatísticas do Cruzeiro
  await page.goto(`${BASE}/?v=${Date.now()}#/clube/cruzeiro/estatisticas`);
  await ateQue(page, () => !!document.querySelector(".ps-link"), null, 10000);
  await ateQue(page, () => [...document.querySelectorAll(".ps-n.com-foto img")].every((i) => i.complete), null, 10000);
  const st = await page.evaluate(() => ({ links: document.querySelectorAll(".ps-link").length, fotos: document.querySelectorAll(".ps-n.com-foto img").length, abertas: [...document.querySelectorAll(".ps-n.com-foto img")].filter((i) => i.naturalWidth > 0).length }));
  if (!st.links) erro("estatísticas do Cruzeiro: nomes sem link para a página do jogador"); else ok(`estatísticas: ${st.links} nomes com link, ${st.fotos} com foto`);
  if (st.abertas !== st.fotos) erro(`estatísticas: ${st.fotos - st.abertas} fotos não abriram no círculo`); else if (st.fotos) ok(`estatísticas: as ${st.fotos} fotos abrem no círculo`);
  // rosto centrado: o quadrado do rosto enche o círculo
  const rc = await page.evaluate(() => {
    const D = window.JOGADORES_CLUBE.cruzeiro.jogadores, out = [];
    document.querySelectorAll(".ps-n.com-foto").forEach((el) => {
      const j = D[el.dataset.pid.split("-")[0]], img = el.querySelector("img"), c = el.querySelector(".foto-c");
      if (!j?.foto?.rosto || !img) return;
      const bi = img.getBoundingClientRect(), bc = c.getBoundingClientRect(), [x, y, sx, sy] = j.foto.rosto;
      // centro do quadrado do rosto, na tela, contra o centro do círculo
      const fx = bi.left + (x + sx / 2) * bi.width, fy = bi.top + (y + sy / 2) * bi.height;
      out.push(Math.hypot(fx - (bc.left + bc.width / 2), fy - (bc.top + bc.height / 2)) / bc.width);
    });
    return out;
  });
  if (rc.some((d) => d > 0.02)) erro(`rosto fora do centro do círculo: ${rc.map((d) => d.toFixed(3))}`); else if (rc.length) ok(`rosto centrado no círculo (${rc.length} fotos, desvio máximo ${(Math.max(...rc) * 100).toFixed(1)}% do círculo)`);
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  if (!falhas.some((f) => /^[a-z-]+: /.test(f))) ok("20 clubes: jogador com mais minutos abre com mapa, comparativo com o rival com todas as linhas");
  await ctx.close();
}

/* ---------- 6) Bora pro jogo: mapa real e foto ---------- */
console.log("Bora pro jogo: mapa de calor com os lances");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/bora-pro-jogo/cruzeiro/palmeiras");
  await page.evaluate(() => localStorage.removeItem("placar:bora"));
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector('.bt[data-side="a"][data-i="10"] span', { timeout: 15000 });
  await page.locator(".board").scrollIntoViewIfNeeded(); await page.waitForTimeout(1000);
  const b = await page.locator('.bt[data-side="a"][data-i="10"] span').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 18, b.y + b.height / 2 + 10, { steps: 4 });
  await ateQue(page, () => /lances reais/.test(document.querySelector(".board-heatcard")?.textContent || ""), null, 8000);
  const card = await page.locator(".board-heatcard").innerText().catch(() => "");
  await page.mouse.up();
  if (!/lances reais/.test(card)) erro(`cartão do mapa não diz "lances reais": ${card.slice(0, 120)}`); else ok(`cartão: ${card.split("\n").slice(0, 2).join(" · ")}`);
  if (erros.length) erro(`erros de JavaScript: ${erros.join(" | ")}`);
  await ctx.close();
}

/* ---------- 7) escudos dos estaduais ---------- */
console.log("escudos nos jogos dos estaduais (Partidas e calendário)");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/");
  let semEscudo = 0, total = 0;
  for (const cid of ["cruzeiro", "atletico-mg", "bragantino", "vasco", "corinthians", "flamengo", "internacional"]) {
    await page.goto(`${BASE}/?v=${Date.now()}#/clube/${cid}/partidas`);
    await ateQue(page, () => document.querySelectorAll(".hm-row").length > 5);
    const r = await page.evaluate(() => { const ts = [...document.querySelectorAll(".hm-team")]; return { total: ts.length, sem: ts.filter((t) => !t.querySelector("img.crest, svg.crest")).map((t) => t.innerText) }; });
    total += r.total; semEscudo += r.sem.length;
    if (r.sem.length) erro(`${cid}: times sem escudo: ${r.sem.slice(0, 4).join(", ")}`);
  }
  if (!semEscudo) ok(`${total} times nas listas de jogos, todos com escudo (oficial ou desenhado com as iniciais)`);
  if (erros.length) erro(`erros de JavaScript: ${erros.join(" | ")}`);
  await ctx.close();
}

/* ---------- 8) celular ---------- */
for (const [nome, opts] of [["celular 320", { ...devices["iPhone SE"], viewport: { width: 320, height: 640 } }], ["iPhone 13", devices["iPhone 13"]]]) {
  console.log(nome);
  const { ctx, page, erros } = await abrir(opts, "#/");
  for (const h of ["#/jogador/216098-cruzeiro", "#/jogador/216098-cruzeiro/ultimos", "#/jogador/216098-cruzeiro/calor", "#/jogador/216098-cruzeiro/comparar/297070-cruzeiro", "#/clube/cruzeiro/comparar/atletico-mg"]) {
    await page.goto(`${BASE}/?v=${Date.now()}${h}`);
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, fora = [];
      // o vídeo e o GOL! do topo do clube são decorativos e ficam recortados dentro do topo
      document.querySelectorAll(".view *").forEach((el) => { if (el.closest(".jg-tab-wrap, .tabs, .ticker, .hero")) return; const b = el.getBoundingClientRect(); if (b.width && (b.right > vw + 1 || b.left < -1)) fora.push(el.className || el.tagName); });
      return { rolagem: document.documentElement.scrollWidth > vw + 1, fora: [...new Set(fora)].slice(0, 4) };
    });
    if (r.rolagem || r.fora.length) erro(`${nome} ${h}: ${r.rolagem ? "rolagem lateral; " : ""}fora da tela: ${r.fora.join(", ")}`);
  }
  if (erros.length) erro(`${nome}: erros de JavaScript: ${erros.join(" | ")}`);
  if (!falhas.some((f) => f.startsWith(nome))) ok("página do jogador, abas, comparativos: nada sai da tela");
  await page.goto(`${BASE}/?v=${Date.now()}#/jogador/216098-cruzeiro`); await page.waitForTimeout(2200);
  await page.screenshot({ path: `${ROOT}tests/mobile/out/jogador-${nome.replace(/\s/g, "-")}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(falhas.length ? `\nFALHOU (${falhas.length}):\n- ${falhas.slice(0, 40).join("\n- ")}` : "\nOK: jogadores, busca, comparativos e escudos conferidos");
process.exitCode = falhas.length ? 1 : 0;
