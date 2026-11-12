/* Janela de transferências (#/clube/<id>/mercado): o fluxo inteiro, como um torcedor faria.
   - dados (js/mercado/*.js): elenco de cada clube da Série A, valores e salários positivos, folha = soma dos salários,
     mercado global com milhares de jogadores e times;
   - escolha do modo; decisões do elenco (libera, empresta) mudam o placar do painel (saídas, caixa);
   - reforços: busca por nome, filtros (brasileiros, até € 5 mi, meio-campistas) e contratar vira cartão de embarque;
     no modo real, jogador caro demais fica sem "Contratar"; no modo manager, qualquer um entra;
   - escalação: 11 titulares, trocar formação mantém 11; tocar na posição e no jogador troca o titular;
   - compartilhar: o cartaz é desenhado (sem bloqueio de imagem externa), o PDF sai com o índice (xref) certo e o link
     reabre o mesmo elenco sem apagar o do amigo;
   - celular 360: nada sai da tela e os botões de decisão aparecem sem rolagem lateral.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/janela.mjs */
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
console.log("dados (js/mercado)");
const ler = (f) => { const t = readFileSync(`${ROOT}js/mercado/${f}`, "utf8"); return JSON.parse(t.slice(t.indexOf("= {") + 2, t.lastIndexOf("}") + 1)); };
const arquivos = readdirSync(`${ROOT}js/mercado`).filter((x) => x.endsWith(".js") && x !== "global.js");
if (arquivos.length < 20) erro(`só ${arquivos.length} clubes com dados de mercado`);
for (const f of arquivos) {
  const d = ler(f), prob = [];
  if (d.elenco.length < 20) prob.push(`elenco com ${d.elenco.length}`);
  if (d.elenco.some((j) => !(j.valor > 0) || !(j.salario > 0))) prob.push("valor ou salário inválido");
  if (Math.abs(d.elenco.reduce((s, j) => s + j.salario, 0) - d.folhaMensal) > 1) prob.push("folha diferente da soma dos salários");
  if (d.elenco.some((j) => !"GDMA".includes(j.pos))) prob.push("posição desconhecida");
  if (prob.length) erro(`${f}: ${prob.join("; ")}`);
}
const G = ler("global.js");
if (G.jogadores.length < 3000 || Object.keys(G.times).length < 100) erro(`mercado global pequeno: ${G.jogadores.length} jogadores, ${Object.keys(G.times).length} times`);
else ok(`${arquivos.length} clubes; mercado global com ${G.jogadores.length} jogadores de ${Object.keys(G.times).length} times em ${Object.keys(G.ligas).length} ligas`);
const cz = ler("cruzeiro.js");
ok(`Cruzeiro: ${cz.elenco.length} no elenco, ${cz.emprestados.length} emprestados fora, ${cz.elenco.filter((j) => j.emprestadoDe).length} chegaram emprestados`);

async function abrir(opts, hash) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark", permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?estatico&v=${Date.now()}${hash}`, { waitUntil: "load" });
  return { ctx, page, erros };
}
const painel = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".jt-placar > div")].map((d) => [d.querySelector("small").textContent, d.querySelector(".jt-flap").getAttribute("aria-label")])));

console.log("fluxo no PC (modo real)");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/clube/cruzeiro/mercado");
  if (!(await ateQue(page, () => !!document.querySelector("[data-jt-modo]")))) erro("escolha do modo não apareceu"); else ok("primeira visita: escolha entre modo real e manager");
  await page.click('[data-jt-modo="real"]');
  await ateQue(page, () => !!document.querySelector("[data-jt-dec]"));
  const p0 = await painel(page);
  const vet = cz.elenco.find((j) => !j.emprestadoDe && j.idade >= 30) || cz.elenco[0];
  await page.click(`[data-jt-j="${vet.id}"] [data-jt-dec="liberar"]`);
  const p1 = await painel(page);
  if (p1["Saídas"] !== "01" || p1["Caixa disponível"] === p0["Caixa disponível"]) erro(`liberar não mudou o painel: ${JSON.stringify(p0)} → ${JSON.stringify(p1)}`); else ok(`liberar ${vet.nome}: saídas ${p1["Saídas"]}, caixa ${p0["Caixa disponível"]} → ${p1["Caixa disponível"]}`);
  // reforços
  await page.click('.jt-passos a[href$="/reforcos"]');
  if (!(await ateQue(page, () => document.querySelectorAll(".jt-mercado tbody tr").length > 5, null, 20000))) erro("mercado global não carregou");
  const caro = G.jogadores.slice().sort((a, b) => b[8] - a[8])[0];
  await page.fill('[data-jt-f="q"]', caro[1].split(" ").pop().slice(0, 5));
  await page.waitForTimeout(500);
  const semCaixa = await page.evaluate((id) => document.querySelector(`[data-jt-add="${id}"]`)?.disabled, caro[0]);
  if (semCaixa !== true) erro(`modo real: ${caro[1]} (€ ${caro[8]}) deveria ficar sem "Contratar"`); else ok(`modo real: ${caro[1]} caro demais, sem "Contratar"`);
  await page.fill('[data-jt-f="q"]', "");
  await page.selectOption('[data-jt-f="nac"]', "bra");
  await page.selectOption('[data-jt-f="vMax"]', "5000000");
  await page.click('[data-jt-pos="M"]');
  await page.waitForTimeout(300);
  const lista = await page.evaluate(() => [...document.querySelectorAll(".jt-mercado tbody tr")].map((t) => t.innerText));
  if (lista.some((t) => !/MEI/.test(t))) erro("filtro de posição deixou passar outra posição");
  const nome = await page.evaluate(() => { const b = document.querySelector("[data-jt-add]:not([disabled])"); const n = b.closest("tr").querySelector("b").textContent; b.click(); return n; });
  await ateQue(page, () => document.querySelectorAll(".jt-passe").length === 1);
  const p2 = await painel(page);
  if (p2["Chegadas"] !== "01") erro("contratação não entrou no painel"); else ok(`contratado ${nome}: cartão de embarque e chegadas ${p2["Chegadas"]}`);
  // escalação
  await page.click('.jt-passos a[href$="/escalacao"]');
  await ateQue(page, () => document.querySelectorAll(".jt-slot").length === 11);
  const tit = await page.locator(".jt-slot .jt-camisa").evaluateAll((xs) => xs.filter((x) => x.textContent !== "+").length);
  if (tit !== 11) erro(`escalação com ${tit} titulares`); else ok("escalação automática com 11 titulares");
  await page.click('[data-jt-form="3-5-2"]');
  const tit2 = await page.locator(".jt-slot .jt-camisa").evaluateAll((xs) => xs.filter((x) => x.textContent !== "+").length);
  if (tit2 !== 11) erro(`3-5-2 com ${tit2} titulares`); else ok("trocar para 3-5-2 mantém 11 titulares");
  await page.click('[data-jt-slot="10"]');
  const reserva = await page.evaluate(() => { const b = document.querySelector("[data-jt-poe]"); return b?.querySelector("b").textContent; });
  const cabe = await page.evaluate(() => document.querySelector("[data-jt-poe]")?.classList.contains("cabe"));
  if (!cabe) erro("com a posição de ataque escolhida, o primeiro da lista não é atacante"); else ok("posição escolhida: quem joga nela aparece primeiro no banco");
  await page.click("[data-jt-poe]");
  const noCampo = await page.evaluate((n) => [...document.querySelectorAll(".jt-slot")].some((s) => s.getAttribute("aria-label").includes(n)), reserva);
  if (!noCampo) erro(`trocar titular: ${reserva} não entrou`); else ok(`toque na posição e no jogador: ${reserva} entra no time`);
  // compartilhar
  await page.click('.jt-passos a[href$="/compartilhar"]');
  await ateQue(page, () => !!document.querySelector("[data-jt-cartaz]"));
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const cv = document.querySelector("[data-jt-cartaz]");
    let png = 0; try { png = cv.toDataURL("image/png").length; } catch (e) { return { erro: e.message }; }
    const b = MERCADO_UI.pdfDeJpeg(cv.toDataURL("image/jpeg", 0.9), cv.width, cv.height), txt = new TextDecoder("latin1").decode(new Uint8Array(await b.arrayBuffer()));
    const xi = txt.lastIndexOf("\nxref\n") + 1, sx = +txt.slice(txt.lastIndexOf("startxref\n") + 10).trim().split("\n")[0];
    const ent = txt.slice(xi).split("\n").slice(3, 8).map((l) => +l.slice(0, 10));
    return { png, pdf: b.size, xref: sx === xi && ent.every((o, i) => txt.slice(o, o + 8).startsWith(`${i + 1} 0 obj`)) };
  });
  if (r.erro || r.png < 50000) erro(`cartaz: ${r.erro || "imagem vazia"}`); else ok(`cartaz desenhado (${Math.round(r.png / 1024)} KB em PNG)`);
  if (!r.xref) erro("PDF com índice (xref) errado"); else ok(`PDF válido (${Math.round(r.pdf / 1024)} KB)`);
  const meu = await page.evaluate(() => localStorage.getItem("placar:janela-cruzeiro"));
  await page.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); navigator.clipboard.writeText = async (t) => { window.__copiado = t; }; });
  await page.click("[data-jt-link]");
  const url = await page.evaluate(() => (window.__copiado || "").split(" ").pop());
  if (!/#\/clube\/cruzeiro\/mercado\/v[rm]\d/.test(url)) erro(`link estranho: ${url}`);
  const resumo = await page.evaluate(() => [...document.querySelectorAll(".jt-resumo b")].map((b) => b.textContent).join("|"));
  await page.evaluate(() => localStorage.removeItem("placar:janela-cruzeiro"));
  await page.goto(url.replace(/^https?:\/\/[^/]+/, BASE));
  await ateQue(page, () => !!document.querySelector(".jt-resumo"));
  const resumo2 = await page.evaluate(() => [...document.querySelectorAll(".jt-resumo b")].map((b) => b.textContent).join("|"));
  const apagou = await page.evaluate(() => localStorage.getItem("placar:janela-cruzeiro"));
  if (resumo !== resumo2) erro(`link não reabriu o mesmo elenco: ${resumo} × ${resumo2}`); else ok(`link reabre o mesmo elenco (${resumo2})`);
  if (apagou) erro("abrir o link de um amigo gravou por cima do elenco local"); else ok("abrir o link de um amigo não mexe no elenco local");
  await page.evaluate((m) => localStorage.setItem("placar:janela-cruzeiro", m), meu);
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await ctx.close();
}

console.log("modo manager");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 900 } }, "#/clube/flamengo/mercado/reforcos");
  await ateQue(page, () => !!document.querySelector("[data-jt-modo]"));
  await page.click('[data-jt-modo="manager"]');
  await ateQue(page, () => document.querySelectorAll(".jt-mercado tbody tr").length > 5, null, 20000);
  const caros = await page.evaluate(() => [...document.querySelectorAll("[data-jt-add]")].slice(0, 5).map((b) => b.disabled));
  if (caros.some(Boolean)) erro("modo manager bloqueou contratação"); else ok("modo manager: os mais caros do mundo podem ser contratados");
  for (let i = 0; i < 3; i++) await page.click("[data-jt-add]:not(.ja)");
  const n = await page.locator(".jt-passe").count(), alerta = await page.locator(".jt-alertas").count();
  if (n !== 3 || alerta) erro(`manager: ${n} reforços e ${alerta} alertas`); else ok("manager: 3 estrelas contratadas, sem alerta de orçamento");
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await ctx.close();
}

console.log("celular 360");
{
  const { ctx, page, erros } = await abrir({ ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 } }, "#/clube/cruzeiro/mercado");
  await ateQue(page, () => !!document.querySelector("[data-jt-modo]"));
  await page.click('[data-jt-modo="real"]');
  for (const etapa of ["elenco", "reforcos", "escalacao", "compartilhar"]) {
    await page.goto(`${BASE}/?estatico&v=${Date.now()}#/clube/cruzeiro/mercado/${etapa}`);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, fora = [];
      document.querySelectorAll(".jt *").forEach((el) => { if (el.closest(".jt-passos, .jt-banco")) return; const b = el.getBoundingClientRect(); if (b.width && (b.right > vw + 1 || b.left < -1)) fora.push(el.className || el.tagName); });
      const seg = document.querySelector(".jt-seg"), sb = seg?.getBoundingClientRect();
      return { rolagem: document.documentElement.scrollWidth > vw + 1, fora: [...new Set(fora)].slice(0, 4), seg: sb ? sb.right <= vw + 1 : true };
    });
    if (r.rolagem || r.fora.length || !r.seg) erro(`360 ${etapa}: ${r.rolagem ? "rolagem lateral; " : ""}${r.seg ? "" : "decisão fora da tela; "}fora: ${r.fora.join(", ")}`);
  }
  await page.screenshot({ path: `${ROOT}tests/mobile/out/janela-360.png` });
  if (!falhas.some((f) => f.startsWith("360"))) ok("as 4 etapas cabem na tela, com a decisão visível");
  if (erros.length) erro(`erros de JavaScript: ${[...new Set(erros)].join(" | ")}`);
  await ctx.close();
}
await browser.close();
console.log(falhas.length ? `\nFALHOU (${falhas.length}):\n- ${falhas.join("\n- ")}` : "\nOK: janela de transferências conferida");
process.exitCode = falhas.length ? 1 : 0;
