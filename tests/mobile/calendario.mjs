/* Calendário do clube (visão geral), nos 20 clubes.
   - abre no mês atual, com cada jogo no dia certo e todos os jogos do mês na lista (conferido com os dados da temporada);
   - voltar e avançar o mês: meses anteriores com placar, resultado (V/E/D) e local; botões param no começo e no fim da temporada;
   - todas as competições da temporada do clube aparecem em algum mês;
   - clicar num jogo encerrado abre as estatísticas (placar, gols, posse, finalizações...); num jogo futuro, "Antes do jogo";
     Esc e o × fecham; clicar de novo no mesmo jogo fecha;
   - celular (320 e 390 px) e PC: nada sai da tela, placar e horário cabem no quadradinho do dia, alvos de toque ≥ 36 px.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/calendario.mjs */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome" });
const falhas = [];
const erro = (m) => { falhas.push(m); console.log("  ✗", m); };
const ok = (m) => console.log("  ✓", m);
// a política de segurança do site bloqueia o waitForFunction do Playwright: espera consultando a página
async function ateQue(page, fn, arg, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(200); } return false; }
const CLUBES = ["athletico-pr", "atletico-mg", "bahia", "botafogo", "bragantino", "chapecoense", "corinthians", "coritiba", "cruzeiro", "flamengo", "fluminense", "gremio", "internacional", "mirassol", "palmeiras", "remo", "santos", "sao-paulo", "vasco", "vitoria"];

async function abrir(opts) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark" });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  return { ctx, page, erros };
}
const estado = (page, id) => page.evaluate((id) => {
  const el = document.querySelector(`[data-cal="${id}"]`), d = window.CLUB_FORM?.clubs?.[id];
  if (!el || !d) return null;
  const mes = window.__calMes ? null : null; void mes;
  return {
    titulo: el.querySelector(".cal-mes")?.textContent, dias: [...el.querySelectorAll(".cal-d.tem")].map((x) => +x.querySelector(".cal-n").textContent),
    botoes: [...el.querySelectorAll(".cal-j")].map((b) => b.dataset.calJogo), lista: [...el.querySelectorAll(".cal-l")].map((b) => ({ id: b.dataset.calJogo, placar: b.querySelector(".cal-lp b")?.textContent, local: b.querySelector(".cal-lv")?.textContent, res: b.querySelector(".fm-res")?.textContent || "" })),
    ant: el.querySelector('[data-cal-nav="-1"]').disabled, prox: el.querySelector('[data-cal-nav="1"]').disabled,
    all: d.all.map((e) => ({ id: e.id, date: e.date, state: e.state, comp: e.comp, res: e.res || "", gf: e.gf, ga: e.ga, home: e.home, venue: e.venue })),
  };
}, id);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesDoTitulo = (t) => { const [m, a] = t.split(" "); return `${a}-${String(MESES.indexOf(m) + 1).padStart(2, "0")}`; };

console.log("PC 1366x900: os 20 clubes");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } });
  for (const id of CLUBES) {
    await page.goto(`${BASE}/?v=${Date.now()}#/clube/${id}`, { waitUntil: "load" });
    await ateQue(page, (id) => !!document.querySelector(`[data-cal="${id}"] .cal-grade`), id);
    await page.waitForTimeout(1500); // a ESPN direto do navegador (temporada atualizada)
    let s = await estado(page, id);
    if (!s || !s.titulo) { erro(`${id}: calendário não apareceu`); continue; }
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
    const meses = [...new Set(s.all.map((e) => e.date.slice(0, 7)))].sort();
    const esperadoIni = meses.includes(hoje) || (hoje > meses[0] && hoje < meses.at(-1)) ? hoje : (s.all.find((e) => e.state !== "post")?.date.slice(0, 7) || meses.at(-1));
    if (mesDoTitulo(s.titulo) !== esperadoIni) erro(`${id}: abriu em ${s.titulo}, esperava ${esperadoIni}`);
    // percorre do mês atual até o começo e depois até o fim da temporada
    const vistos = new Set(), comps = new Set();
    let problemas = 0, passos = 0;
    const confereMes = async () => {
      s = await estado(page, id);
      const m = mesDoTitulo(s.titulo), doMes = s.all.filter((e) => e.date.startsWith(m));
      const dias = [...new Set(doMes.map((e) => +e.date.slice(8, 10)))].sort((a, b) => a - b);
      if (JSON.stringify(dias) !== JSON.stringify(s.dias)) { problemas++; erro(`${id} ${s.titulo}: dias com jogo ${s.dias} ≠ ${dias}`); }
      if (s.lista.length !== doMes.length || s.botoes.length !== doMes.length) { problemas++; erro(`${id} ${s.titulo}: ${s.lista.length} na lista / ${s.botoes.length} na grade, esperava ${doMes.length}`); }
      for (const e of doMes) {
        vistos.add(e.id); comps.add(e.comp);
        const l = s.lista.find((x) => x.id === e.id);
        if (!l) continue;
        if (e.state === "post") {
          const pl = e.home ? `${e.gf}–${e.ga}` : `${e.ga}–${e.gf}`;
          if (l.placar !== pl || l.res !== e.res) { problemas++; erro(`${id} ${e.date}: placar/resultado "${l.placar} ${l.res}" ≠ "${pl} ${e.res}"`); }
        }
        if (!l.local || (e.venue && l.local === "Local a definir")) { problemas++; erro(`${id} ${e.date}: sem local`); }
      }
    };
    await confereMes();
    while (!s.ant && passos < 24) { await page.click(`[data-cal="${id}"] [data-cal-nav="-1"]`); passos++; await confereMes(); }
    while (!s.prox && passos < 48) { await page.click(`[data-cal="${id}"] [data-cal-nav="1"]`); passos++; await confereMes(); }
    const todasComps = new Set(s.all.map((e) => e.comp));
    if (vistos.size !== new Set(s.all.map((e) => e.id)).size) erro(`${id}: ${vistos.size} jogos vistos percorrendo os meses, a temporada tem ${s.all.length}`);
    if ([...todasComps].some((c) => !comps.has(c))) erro(`${id}: competições que não apareceram: ${[...todasComps].filter((c) => !comps.has(c))}`);
    // "Hoje" volta ao mês atual
    await page.click(`[data-cal="${id}"] [data-cal-hoje]`).catch(() => {});
    s = await estado(page, id);
    if (mesDoTitulo(s.titulo) !== esperadoIni) erro(`${id}: "Hoje" foi para ${s.titulo}`);
    if (!problemas) ok(`${id}: ${s.all.length} jogos em ${meses.length} meses, ${[...todasComps].join(", ")}`);
  }
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await ctx.close();
}

console.log("estatísticas ao clicar (PC)");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } });
  for (const id of ["cruzeiro", "flamengo", "palmeiras", "remo"]) {
    await page.goto(`${BASE}/?v=${Date.now()}#/clube/${id}`, { waitUntil: "load" });
    await page.waitForSelector(`[data-cal="${id}"] .cal-grade`, { timeout: 15000 });
    await page.waitForTimeout(1500);
    // volta até achar um mês com jogo encerrado
    for (let k = 0; k < 6 && !(await page.locator(`[data-cal="${id}"] .cal-l.post`).count()); k++) await page.click(`[data-cal="${id}"] [data-cal-nav="-1"]`);
    const b = page.locator(`[data-cal="${id}"] .cal-l.post`).last();
    if (!(await b.count())) { erro(`${id}: nenhum jogo encerrado para clicar`); continue; }
    const jid = await b.getAttribute("data-cal-jogo");
    await b.click();
    await ateQue(page, (id) => { const x = document.querySelector(`[data-cal="${id}"] [data-cal-det]`); return !!x && !x.hidden && !x.textContent.includes("Carregando"); }, id);
    const r = await page.evaluate(([id, jid]) => {
      const x = document.querySelector(`[data-cal="${id}"] [data-cal-det]`), e = window.CLUB_FORM.clubs[id].all.find((j) => j.id === jid);
      return { aberto: !x.hidden, placar: x.querySelector(".cd-placar")?.textContent.replace(/\s/g, ""), esperado: (e.home ? `${e.gf}×${e.ga}` : `${e.ga}×${e.gf}`), stats: [...x.querySelectorAll(".cd-stats li")].map((l) => l.querySelector(".cd-r").firstChild.textContent.trim()), gols: x.querySelectorAll(".cd-gols li").length, nada: x.querySelector(".cd-nada")?.textContent || "", total: e.gf + e.ga, comp: e.comp, lg: e.lg };
    }, [id, jid]);
    if (!r.aberto) erro(`${id}: painel não abriu`);
    else if (r.placar !== r.esperado) erro(`${id}: placar do painel ${r.placar} ≠ ${r.esperado}`);
    else if (!r.lg) ok(`${id}: ${r.comp} sem estatísticas detalhadas (${r.nada})`);
    else if (!r.stats.includes("Posse de bola") && !/não publicou/.test(r.nada)) erro(`${id}: sem estatísticas (${r.nada})`);
    else ok(`${id}: ${r.comp} ${r.placar}, ${r.stats.length} estatísticas, ${r.gols} gols/expulsões listados`);
    // fecha pelo Esc, abre e fecha clicando de novo, fecha pelo ×
    await page.keyboard.press("Escape");
    if (!(await page.locator(`[data-cal="${id}"] [data-cal-det]`).isHidden())) erro(`${id}: Esc não fechou`);
    await b.click(); await page.waitForTimeout(150); await b.click();
    if (!(await page.locator(`[data-cal="${id}"] [data-cal-det]`).isHidden())) erro(`${id}: segundo clique no mesmo jogo não fechou`);
    await b.click(); await page.locator(`[data-cal="${id}"] [data-cal-fechar]`).click();
    if (!(await page.locator(`[data-cal="${id}"] [data-cal-det]`).isHidden())) erro(`${id}: × não fechou`);
    // jogo futuro
    await page.click(`[data-cal="${id}"] [data-cal-hoje]`).catch(() => {});
    for (let k = 0; k < 4 && !(await page.locator(`[data-cal="${id}"] .cal-l.pre`).count()); k++) await page.click(`[data-cal="${id}"] [data-cal-nav="1"]`);
    const f = page.locator(`[data-cal="${id}"] .cal-l.pre`).first();
    if (await f.count()) {
      await f.click();
      const t = await page.locator(`[data-cal="${id}"] [data-cal-det]`).innerText();
      if (!/Antes do jogo/i.test(t) || !/(faltam \d+ dias|é hoje|é amanhã)/i.test(t)) erro(`${id}: jogo futuro sem "Antes do jogo"/contagem`);
      else ok(`${id}: jogo futuro com contagem e "Antes do jogo"${/Ver a partida/i.test(t) ? " e link para a partida" : ""}`);
    }
  }
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await ctx.close();
}

for (const [nome, opts] of [["celular 320", { ...devices["iPhone SE"], viewport: { width: 320, height: 640 } }], ["iPhone 13", devices["iPhone 13"]], ["Pixel 7", devices["Pixel 7"]], ["tablet 768", { viewport: { width: 768, height: 1024 }, hasTouch: true }]]) {
  console.log(nome);
  const { ctx, page, erros } = await abrir(opts);
  let pior = null;
  for (const id of ["flamengo", "cruzeiro", "athletico-pr", "sao-paulo"]) {
    await page.goto(`${BASE}/?v=${Date.now()}#/clube/${id}`, { waitUntil: "load" });
    await page.waitForSelector(`[data-cal="${id}"] .cal-grade`, { timeout: 15000 });
    await page.waitForTimeout(1200);
    for (let k = 0; k < 3; k++) {
      const r = await page.evaluate((id) => {
        const el = document.querySelector(`[data-cal="${id}"]`), vw = document.documentElement.clientWidth, fora = [], corta = [], pequeno = [];
        el.querySelectorAll("*").forEach((x) => { const b = x.getBoundingClientRect(); if (b.width && (b.right > vw + 1 || b.left < -1)) fora.push(x.className || x.tagName); });
        el.querySelectorAll(".cal-j").forEach((b) => { const x = b.querySelector(".cal-x"); if (x.scrollWidth > b.clientWidth + 1) corta.push(x.textContent); const r = b.getBoundingClientRect(); if (r.width < 34 || r.height < 36) pequeno.push(`${Math.round(r.width)}x${Math.round(r.height)}`); });
        el.querySelectorAll(".cal-nav").forEach((b) => { const r = b.getBoundingClientRect(); if (r.width < 40) pequeno.push("nav"); });
        return { rolagem: document.documentElement.scrollWidth > vw + 1, fora: [...new Set(fora)].slice(0, 4), corta, pequeno: pequeno.slice(0, 4), mes: el.querySelector(".cal-mes").textContent, menor: Math.min(...[...el.querySelectorAll(".cal-x")].map((x) => parseFloat(getComputedStyle(x).fontSize))) };
      }, id);
      if (r.rolagem) erro(`${nome} ${id} ${r.mes}: rolagem lateral`);
      if (r.fora.length) erro(`${nome} ${id} ${r.mes}: fora da tela: ${r.fora.join(", ")}`);
      if (r.corta.length) erro(`${nome} ${id} ${r.mes}: placar/horário não cabe: ${r.corta.join(", ")}`);
      if (r.pequeno.length) erro(`${nome} ${id} ${r.mes}: alvos pequenos ${r.pequeno.join(", ")}`);
      if (r.menor < 10.5) erro(`${nome} ${id}: texto do dia com ${r.menor}px`);
      pior = r;
      await page.locator(`[data-cal="${id}"] [data-cal-nav="-1"]`).tap().catch(() => page.click(`[data-cal="${id}"] [data-cal-nav="-1"]`));
    }
    const j = page.locator(`[data-cal="${id}"] .cal-j.post`).first();
    if (await j.count()) {
      await j.tap();
      await page.waitForTimeout(1500);
      const r = await page.evaluate((id) => { const x = document.querySelector(`[data-cal="${id}"] [data-cal-det]`), vw = document.documentElement.clientWidth, fora = []; x.querySelectorAll("*").forEach((y) => { const b = y.getBoundingClientRect(); if (b.width && b.right > vw + 1) fora.push(y.className || y.tagName); }); return { aberto: !x.hidden, fora: [...new Set(fora)].slice(0, 4) }; }, id);
      if (!r.aberto) erro(`${nome} ${id}: toque no dia não abriu o painel`);
      if (r.fora.length) erro(`${nome} ${id}: painel sai da tela: ${r.fora.join(", ")}`);
    }
    await page.screenshot({ path: `tests/mobile/out/calendario-${nome.replace(/\s/g, "-")}-${id}.png`, fullPage: false });
  }
  if (erros.length) erro(`${nome}: erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  if (!falhas.some((f) => f.startsWith(nome))) ok(`cabe na tela, placar e horário cabem no dia, alvos ok (texto do dia ${pior?.menor}px)`);
  await ctx.close();
}
await browser.close();
console.log(falhas.length ? `\nFALHOU (${falhas.length}):\n- ${falhas.slice(0, 40).join("\n- ")}` : "\nOK: calendário conferido nos 20 clubes");
process.exitCode = falhas.length ? 1 : 0;
