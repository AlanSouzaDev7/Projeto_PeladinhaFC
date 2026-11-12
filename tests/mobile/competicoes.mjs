/* Outras competições (#/copa/...): Libertadores, Sul-Americana, Copa do Brasil e estaduais.
   - dados (js/competicoes/*.js): fases na ordem do calendário, gols marcados = sofridos na classificação geral,
     confrontos do mata-mata com o vencedor batendo com o placar somado/pênaltis, artilharia sem passar do total de gols;
   - as 8 abas de cada competição abrem sem erro, a linha do tempo marca a fase atual, a página do clube na competição
     confere com os jogos dela, e a página dos estaduais lista os 4;
   - tema: cada competição troca as cores do site (e volta ao Brasileirão), a abertura animada aparece ao trocar e some
     sozinha; com "reduzir movimento", não aparece;
   - simulador do mata-mata e Bora pro jogo no clima da competição;
   - celular (320 e 390 px) e PC: nada sai da tela.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/competicoes.mjs */
import { chromium, devices } from "playwright";
import { readFileSync, readdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });
const falhas = [];
const erro = (m) => { falhas.push(m); console.log("  ✗", m); };
const ok = (m) => console.log("  ✓", m);
async function ateQue(page, fn, arg, ms = 12000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(150); } return false; }

/* ---------- dados ---------- */
console.log("dados (js/competicoes)");
const D = {};
for (const f of readdirSync(`${ROOT}js/competicoes`).filter((x) => x.endsWith(".js"))) {
  const t = readFileSync(`${ROOT}js/competicoes/${f}`, "utf8");
  D[f.slice(0, -3)] = JSON.parse(t.slice(t.indexOf("= {") + 2, t.lastIndexOf("}") + 1));
}
const IDS = ["libertadores", "sul-americana", "copa-do-brasil", "paulistao", "carioca", "mineiro", "gauchao", "serie-b", "serie-c", "serie-d"];
const SERIES = ["serie-b", "serie-c", "serie-d"];
const semJogos = (k) => SERIES.includes(k) && !D[k].jogos.length; // Séries C e D: sem placar gratuito (Wikipédia)
if (IDS.some((k) => !D[k])) erro(`faltam competições: ${IDS.filter((k) => !D[k])}`);
for (const k of IDS.filter((x) => D[x])) {
  const d = D[k], prob = [];
  const ordem = d.fases.map((f) => f.ini || "");
  if (ordem.some((x, i) => i && x && ordem[i - 1] && x < ordem[i - 1] && d.tipo !== "estadual")) prob.push("fases fora de ordem");
  const gp = d.geral.reduce((s, r) => s + r.gp, 0), gc = d.geral.reduce((s, r) => s + r.gc, 0);
  if (gp !== gc && !semJogos(k)) prob.push(`gols marcados ${gp} ≠ sofridos ${gc}`);
  const totGols = d.jogos.filter((j) => j.estado === "post").reduce((s, j) => s + (j.casa.gols || 0) + (j.fora.gols || 0), 0);
  if (gp !== totGols && !semJogos(k)) prob.push(`classificação geral com ${gp} gols, jogos somam ${totGols}`);
  if (d.artilharia.reduce((s, a) => s + a.gols, 0) > totGols && !semJogos(k)) prob.push("artilharia passa do total de gols");
  for (const c of d.chave) for (const x of c.confrontos) {
    if (!x.vencedor || x.ga == null) continue;
    const esperado = x.ga > x.gb ? x.a.id : x.gb > x.ga ? x.b.id : x.pen ? (x.pen[0] > x.pen[1] ? x.a.id : x.b.id) : null;
    if (esperado && esperado !== x.vencedor) prob.push(`${c.fase}: vencedor de ${x.a.nome} x ${x.b.nome} não bate com o placar`);
  }
  if (semJogos(k)) {
    // C e D pela Wikipédia: classificação com pontos coerentes e participantes com escudo ou desenho
    for (const g of d.grupos) for (const r of g.linhas) if (r.p !== r.v * 3 + r.e || r.j !== r.v + r.e + r.d) prob.push(`${g.nome}: ${r.nome} com pontos/jogos incoerentes`);
    if (d.participantes.length < 20) prob.push(`só ${d.participantes.length} participantes`);
    if (!d.fonteUrl?.startsWith("https://pt.wikipedia.org/wiki/")) prob.push("sem link da fonte");
  } else if (!d.fases.length || !d.jogos.length) prob.push("sem fases ou jogos");
  if (SERIES.includes(k) && d.jogos.length && d.jogos.some((j) => !j.rodada)) prob.push("jogo sem rodada");
  if (d.jogos.some((j) => /^TBD/.test(j.casa.nome + j.fora.nome))) prob.push("jogo com clube a definir (TBD)");
  if (prob.length) erro(`${k}: ${prob.slice(0, 3).join("; ")}`);
  else ok(`${k}: ${d.fases.length} fases, ${d.jogos.length} jogos, ${d.geral.length} clubes, ${totGols} gols, fase atual: ${d.faseAtual}${d.campeao ? `, campeão ${d.campeao.nome}` : ""}`);
}

async function abrir(opts, hash, extra = {}) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark", ...extra });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?v=${Date.now()}${hash}`, { waitUntil: "load" });
  return { ctx, page, erros };
}

/* ---------- abas de todas as competições ---------- */
console.log("abas (PC 1366)");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/");
  const ABAS0 = ["geral", "classificacao", "chave", "jogos", "rankings", "clubes", "simulador", "bora"];
  for (const k of IDS) {
    const vistos = [], ABAS = SERIES.includes(k) ? ["geral", "classificacao", "jogos", "rankings", "clubes", "simulador"] : ABAS0;
    for (const a of ABAS) {
      if (k === "copa-do-brasil" && a === "classificacao") { /* "Classificação geral" na Copa do Brasil */ }
      await page.goto(`${BASE}/?estatico&v=${Date.now()}#/copa/${k}/${a}`);
      const carregou = await ateQue(page, () => !document.querySelector("[data-cp-corpo]")?.textContent.includes("Carregando a competição"));
      const r = await page.evaluate(() => ({ corpo: document.querySelector("[data-cp-corpo]")?.innerText.length || 0, aba: document.querySelector(".tabs .tab.on")?.textContent, linha: document.querySelectorAll(".cp-f").length, atual: document.querySelectorAll(".cp-f.atual, .cp-f.feita").length, comp: document.documentElement.dataset.comp }));
      if (!carregou || r.corpo < 40) erro(`${k}/${a}: aba vazia`);
      if (r.linha !== (SERIES.includes(k) ? 0 : D[k].fases.length)) erro(`${k}/${a}: linha do tempo com ${r.linha} fases (dados: ${D[k].fases.length})`);
      if (!r.comp) erro(`${k}/${a}: tema da competição não aplicado`);
      vistos.push(a);
    }
    // página do clube na competição: o primeiro da classificação geral
    const t = D[k].geral[0] || D[k].participantes[0];
    await page.goto(`${BASE}/?estatico&v=${Date.now()}#/copa/${k}/clube/${t.id}`);
    await ateQue(page, () => document.querySelectorAll(".cp-cl-topo").length > 0);
    const n = await page.locator("[data-cp-corpo] .cp-j").count(), esp = D[k].jogos.filter((j) => j.casa.id === t.id || j.fora.id === t.id).length;
    if (n !== esp) erro(`${k}: página de ${t.nome} com ${n} jogos (dados: ${esp})`);
    if (!falhas.some((f) => f.startsWith(k))) ok(`${k}: ${vistos.length} abas e a página do clube (${t.nome}, ${n} jogos)`);
  }
  await page.goto(`${BASE}/?estatico&v=${Date.now()}#/copa/estaduais`);
  await ateQue(page, () => [...document.querySelectorAll("[data-est]")].every((e) => !/Carregando/.test(e.textContent)));
  const est = await page.evaluate(() => [...document.querySelectorAll(".cp-est-card")].map((a) => a.innerText.replace(/\s+/g, " ")));
  if (est.length !== 4 || est.some((e) => /Carregando/.test(e))) erro(`estaduais: ${est.join(" | ")}`); else ok(`estaduais: ${est.map((e) => e.split(" ")[0]).join(", ")} com a situação de cada um`);
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await ctx.close();
}

/* ---------- clubes por série ---------- */
console.log("clubes por série");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/clubes");
  for (const k of SERIES) {
    await page.goto(`${BASE}/?estatico&v=${Date.now()}#/clubes/${k}`);
    await ateQue(page, () => document.querySelectorAll(".cl-serie li").length > 0);
    const r = await page.evaluate(() => ({ n: document.querySelectorAll(".cl-serie li").length, img: document.querySelectorAll(".cl-serie img.crest").length, des: document.querySelectorAll(".cl-serie svg.crest-ini").length, on: document.querySelector(".cl-series a.on span")?.textContent }));
    const esp = (D[k].participantes?.length || D[k].grupos[0]?.linhas.length || D[k].geral.length);
    if (r.n !== esp || r.img + r.des !== r.n) erro(`${k}: ${r.n} clubes na grade (dados: ${esp}), ${r.img} imagens + ${r.des} desenhados`); else ok(`${k}: ${r.n} clubes (${r.img} escudos em imagem, ${r.des} desenhados), aba "${r.on}"`);
  }
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await ctx.close();
}

/* ---------- tema, abertura, simulador e Bora ---------- */
console.log("tema, abertura animada, simulador e Bora pro jogo");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/");
  await page.waitForSelector(".cp-bar");
  const acc0 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  await page.click('.cp-bar a[data-cp-ir="libertadores"]');
  const viu = await ateQue(page, () => !!document.querySelector(".cpx-intro.cpx-libertadores"), null, 3000);
  const acc1 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  if (!viu) erro("abertura da Libertadores não apareceu"); else ok("abertura da Libertadores aparece ao trocar de competição");
  if (acc0 === acc1) erro("cor de destaque não mudou na Libertadores"); else ok(`cores do site trocam (destaque ${acc0} → ${acc1})`);
  const sumiu = await ateQue(page, () => !document.querySelector(".cpx-intro"), null, 4000);
  if (!sumiu) erro("abertura não saiu sozinha"); else ok("abertura sai sozinha");
  for (const k of ["sul-americana", "copa-do-brasil", "estaduais"]) {
    await page.click(`.cp-bar a[data-cp-ir="${k}"]`);
    if (!(await ateQue(page, (c) => !!document.querySelector(`.cpx-intro.cpx-${c}`), k, 3000))) erro(`abertura de ${k} não apareceu`);
    if (!(await ateQue(page, (c) => document.querySelector(".cpx-faixa")?.dataset.cpxFaixa === c, k, 3000))) erro(`faixa de ${k} não apareceu`);
  }
  // séries do Brasileirão: a faixa troca de série e a cor muda
  await page.click('.cp-bar a[data-cp-ir="brasileirao"]');
  await page.waitForTimeout(500);
  await page.click('.cpx-series a[href="#/copa/serie-b"]');
  if (!(await ateQue(page, () => document.documentElement.dataset.comp === "serie-b" && document.querySelector(".cpx-series a.on")?.textContent === "Série B", null, 4000))) erro("Série B: tema ou aba da série não trocou"); else ok("faixa do Brasileirão troca para a Série B, com a cor dela");
  await page.click('.cp-bar a[data-cp-ir="brasileirao"]');
  await page.waitForTimeout(600);
  if (await page.evaluate(() => document.documentElement.dataset.comp)) erro("tema da competição continuou no Brasileirão"); else ok("de volta ao Brasileirão: tema original");
  // simulador do mata-mata (final da Libertadores, se ainda não jogada)
  const fin = D.libertadores.jogos.find((j) => j.estado !== "post");
  if (fin) {
    await page.goto(`${BASE}/?estatico&v=${Date.now()}#/copa/libertadores/simulador`);
    await ateQue(page, () => !!document.querySelector("[data-cp-sim]"));
    const li = page.locator(`[data-cp-sim="${fin.id}"]`);
    await li.locator("input").nth(0).fill("2"); await li.locator("input").nth(1).fill("1");
    const res = await page.locator("[data-cp-sim-res]").innerText();
    if (!/avança/.test(res)) erro(`simulador: resultado sem quem avança (${res.slice(0, 80)})`); else ok(`simulador: ${fin.casa.nome} 2 x 1 ${fin.fora.nome} → ${res.match(/avança: [^\n]+/)?.[0]}`);
    await page.reload(); await ateQue(page, () => !!document.querySelector("[data-cp-sim] input"));
    if ((await page.locator(`[data-cp-sim="${fin.id}"] input`).first().inputValue()) !== "2") erro("simulador: palpite não ficou guardado"); else ok("simulador: palpite guardado depois de recarregar");
  }
  // Bora pro jogo no clima da Libertadores
  await page.goto(`${BASE}/?estatico&v=${Date.now()}#/copa/libertadores/bora`);
  await ateQue(page, () => !!document.querySelector("[data-cp-bora-ir]"));
  await page.click("[data-cp-bora-ir]");
  await page.waitForSelector(".board", { timeout: 15000 }).catch(() => {});
  const bora = await page.evaluate(() => ({ hash: location.hash, comp: document.documentElement.dataset.comp }));
  if (!bora.hash.startsWith("#/bora-pro-jogo/") || bora.comp !== "libertadores") erro(`Bora pro jogo sem o tema: ${JSON.stringify(bora)}`); else ok(`Bora pro jogo no clima da Libertadores (${bora.hash})`);
  await page.click('.nav a[data-nav="tabela"]');
  await page.waitForTimeout(500);
  if (await page.evaluate(() => document.documentElement.dataset.comp)) erro("tema ficou depois de sair do Bora pro jogo"); else ok("saindo do Bora pro jogo, volta o tema do Brasileirão");
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await ctx.close();
}
{
  const { ctx, page } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/", { reducedMotion: "reduce" });
  await page.waitForSelector(".cp-bar");
  await page.click('.cp-bar a[data-cp-ir="libertadores"]');
  await page.waitForTimeout(400);
  if (await page.locator(".cpx-intro").count()) erro("com reduzir movimento, a abertura apareceu"); else ok("com reduzir movimento, sem abertura");
  await ctx.close();
}

/* ---------- celular ---------- */
for (const [nome, opts] of [["celular 320", { ...devices["iPhone SE"], viewport: { width: 320, height: 640 } }], ["iPhone 13", devices["iPhone 13"]], ["tablet 768", { viewport: { width: 768, height: 1024 }, hasTouch: true }]]) {
  console.log(nome);
  const { ctx, page, erros } = await abrir(opts, "#/");
  for (const h of ["#/copa/libertadores", "#/copa/libertadores/classificacao", "#/copa/libertadores/chave", "#/copa/copa-do-brasil/jogos", "#/copa/sul-americana/rankings", "#/copa/paulistao/clubes", "#/copa/libertadores/simulador", "#/copa/estaduais", "#/copa/serie-b", "#/copa/serie-b/jogos", "#/copa/serie-d/classificacao", "#/clubes/serie-d", "#/"]) {
    await page.goto(`${BASE}/?estatico&v=${Date.now()}${h}`);
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, fora = [];
      document.querySelectorAll(".view *").forEach((el) => { if (el.closest(".cp-bar, .cp-linha, .cp-bracket, .tabs, .ticker, .table, .hero, .cpx-campo, .cl-series")) return; const b = el.getBoundingClientRect(); if (b.width && (b.right > vw + 1 || b.left < -1)) fora.push(el.className || el.tagName); });
      return { rolagem: document.documentElement.scrollWidth > vw + 1, fora: [...new Set(fora)].slice(0, 4) };
    });
    if (r.rolagem || r.fora.length) erro(`${nome} ${h}: ${r.rolagem ? "rolagem lateral; " : ""}fora: ${r.fora.join(", ")}`);
  }
  if (erros.length) erro(`${nome}: erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await page.goto(`${BASE}/?estatico&v=${Date.now()}#/copa/libertadores`); await page.waitForTimeout(1800);
  await page.screenshot({ path: `${ROOT}tests/mobile/out/competicao-${nome.replace(/\s/g, "-")}.png` });
  if (!falhas.some((f) => f.startsWith(nome))) ok("competições cabem na tela");
  await ctx.close();
}
await browser.close();
console.log(falhas.length ? `\nFALHOU (${falhas.length}):\n- ${falhas.slice(0, 40).join("\n- ")}` : "\nOK: competições conferidas");
process.exitCode = falhas.length ? 1 : 0;
