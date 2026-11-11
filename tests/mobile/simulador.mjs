/* Simulador da tabela (#/simulador).
   - lista só os jogos que faltam: nada encerrado nem em andamento (um jogo é posto "ao vivo" de propósito);
   - os placares dados mudam pontos, vitórias, saldo e posição exatamente como a conta feita aqui no teste
     (pontos, vitórias, saldo, gols pró), inclusive o exemplo Palmeiras x Flamengo e Cruzeiro x Chapecoense;
   - botões rápidos (vitória/empate), "Mandantes vencem", "Tudo empate", "Limpar" e a aba "Todas";
   - os palpites continuam lá depois de recarregar a página;
   - no celular (320, 375 e 412 px) nada sai da tela e os campos do placar têm pelo menos 44 px.
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/simulador.mjs */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const raw = readFileSync(`${ROOT}js/live-data.js`, "utf8");
const D = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
// um jogo da rodada atual "rolando": não pode aparecer no simulador
const vivo = D.fixtures[D.round][2];
vivo[2] = 1; vivo[3] = 0; while (vivo.length < 9) vivo.push(null);
vivo[8] = { state: "in", clock: "30'", detail: "30'", live: true, gols: [] };
const body = `window.LIVE_DATA = ${JSON.stringify(D)};`;
const restam = Object.entries(D.fixtures).flatMap(([rd, l]) => l.filter((g) => !(g[8] && g[8].state === "in") && g[2] == null).map((g) => ({ rd: +rd, k: `${g[0]}-x-${g[1]}` })));

const browser = await chromium.launch({ channel: "chrome" });
const falhas = [];
const erro = (m) => { falhas.push(m); console.log("  ✗", m); };

async function abrir(opts, hash) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR", colorScheme: "dark" });
  await ctx.route("**/js/live-data.js*", (r) => r.fulfill({ contentType: "application/javascript", body }));
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  await ctx.route(/espn\.com/, (r) => r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ leagues: [{ calendar: [] }], events: [] }) }));
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?v=${Date.now()}${hash}`, { waitUntil: "load" });
  await page.waitForSelector(".sim-grid, .page-head");
  return { ctx, page, erros };
}
// classificação esperada: a tabela de partida do site + os palpites
const leTabela = (page) => page.evaluate(() => [...document.querySelectorAll(".sim-tab tbody tr")].map((tr) => {
  const td = [...tr.children].map((x) => x.textContent.trim());
  return { id: tr.querySelector("td.club a").getAttribute("href").split("/").pop(), pos: +tr.querySelector(".pos").textContent, p: +tr.querySelector(".pts").textContent, j: +td[3], sg: +td[9].replace("+", "") };
}));
async function confere(page, rotulo) {
  const r = await page.evaluate(() => {
    const base = window.__base, palp = JSON.parse(localStorage.getItem("placar:simulador") || "{}");
    const vis = [...document.querySelectorAll(".sim-j")].map((li) => li.dataset.k);
    const rows = base.map((r) => ({ ...r })), by = Object.fromEntries(rows.map((r) => [r.id, r]));
    for (const k of vis) {
      const pl = palp[k]; if (!pl || pl[0] == null || pl[1] == null) continue;
      const [h, a] = k.split("-x-");
      for (const [me, gf, ga] of [[h, pl[0], pl[1]], [a, pl[1], pl[0]]]) { const x = by[me]; x.p += gf > ga ? 3 : gf === ga ? 1 : 0; x.j++; x.w += +(gf > ga); x.gf += gf; x.ga += ga; }
    }
    const ord = Object.fromEntries(base.map((r, i) => [r.id, i]));
    rows.sort((x, y) => y.p - x.p || y.w - x.w || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || ord[x.id] - ord[y.id]);
    return rows.map((r, i) => ({ id: r.id, pos: i + 1, p: r.p, j: r.j, sg: r.gf - r.ga }));
  });
  const vistos = await leTabela(page);
  const dif = r.filter((x, i) => JSON.stringify(x) !== JSON.stringify(vistos[i]));
  if (dif.length) erro(`${rotulo}: tabela diferente da conta (${dif.length} linhas), ex.: esperado ${JSON.stringify(dif[0])}, visto ${JSON.stringify(vistos.find((v) => v.id === dif[0].id))}`);
  else console.log(`  ✓ ${rotulo}: tabela confere (líder ${vistos[0].id} ${vistos[0].p} pts; último ${vistos[19].id} ${vistos[19].p} pts)`);
  return vistos;
}
const darPlacar = async (page, k, h, a) => {
  const li = page.locator(`.sim-j[data-k="${k}"]`);
  await li.locator("input").nth(0).fill(String(h));
  await li.locator("input").nth(1).fill(String(a));
};

console.log("PC 1366x800");
{
  const { ctx, page, erros } = await abrir({ viewport: { width: 1366, height: 800 } }, "#/simulador/todas");
  await page.evaluate(() => localStorage.removeItem("placar:simulador"));
  await page.reload(); await page.waitForSelector(".sim-grid");
  // base: a tabela que o site usa antes de qualquer palpite
  const base = await page.evaluate(() => [...document.querySelectorAll(".sim-tab tbody tr")].map((tr) => { const td = [...tr.children].map((x) => x.textContent.trim()); return { id: tr.querySelector("td.club a").getAttribute("href").split("/").pop(), p: +td[2], j: +td[3], w: +td[4], gf: +td[7], ga: +td[8] }; }));
  await ctx.addInitScript((b) => { window.__base = b; }, base);
  await page.evaluate((b) => { window.__base = b; }, base);
  const ks = await page.$$eval(".sim-j", (l) => l.map((li) => li.dataset.k));
  const esperados = restam.map((x) => x.k);
  if (ks.length !== esperados.length || ks.some((k) => !esperados.includes(k))) erro(`jogos listados (${ks.length}) diferentes dos que faltam (${esperados.length})`);
  else console.log(`  ✓ ${ks.length} jogos que faltam, nenhum encerrado`);
  if (ks.includes(`${vivo[0]}-x-${vivo[1]}`)) erro("jogo em andamento apareceu no simulador"); else console.log("  ✓ jogo em andamento fora da lista");
  await confere(page, "sem palpites");
  // exemplo do pedido: Palmeiras x Flamengo e Cruzeiro x Chapecoense (os que existirem)
  const exemplo = ks.filter((k) => /palmeiras-x-flamengo|flamengo-x-palmeiras|cruzeiro-x-chapecoense|chapecoense-x-cruzeiro/.test(k));
  console.log("  jogos do exemplo:", exemplo.join(", ") || "(nenhum entre os que faltam)");
  for (const k of exemplo) await darPlacar(page, k, 2, 1);
  await confere(page, "Palmeiras/Cruzeiro vencendo");
  for (const k of exemplo) await darPlacar(page, k, 0, 3);
  const v2 = await confere(page, "virada: visitantes vencendo");
  for (const k of exemplo) await darPlacar(page, k, 2, 2);
  await confere(page, "empates");
  // botão rápido
  const k0 = ks[0];
  await page.locator(`.sim-j[data-k="${k0}"] [data-rap="a"]`).click();
  const v = await page.locator(`.sim-j[data-k="${k0}"] input`).evaluateAll((l) => l.map((i) => i.value));
  if (v.join("x") !== "0x1") erro(`botão vitória do visitante deu ${v.join("x")}`); else console.log("  ✓ botão rápido (vitória do visitante = 0 x 1)");
  await confere(page, "botão rápido");
  // tudo empate (não apaga o que já foi dado)
  await page.locator('[data-sim-auto="empate"]').click();
  const preenchidos = await page.$$eval(".sim-j", (l) => l.filter((li) => [...li.querySelectorAll("input")].every((i) => i.value !== "")).length);
  if (preenchidos !== ks.length) erro(`"Tudo empate" preencheu ${preenchidos} de ${ks.length}`);
  const kv = await page.locator(`.sim-j[data-k="${k0}"] input`).evaluateAll((l) => l.map((i) => i.value).join("x"));
  if (kv !== "0x1") erro(`"Tudo empate" apagou um placar já dado (${kv})`);
  await confere(page, "todos os jogos que faltam simulados");
  // valor inválido vira número válido
  await page.locator(`.sim-j[data-k="${k0}"] input`).nth(0).fill("-3");
  const inval = await page.locator(`.sim-j[data-k="${k0}"] input`).nth(0).inputValue();
  if (inval !== "0") erro(`placar negativo ficou "${inval}"`); else console.log("  ✓ placar negativo vira 0");
  // recarregar: palpites continuam
  const antes = await leTabela(page);
  await page.reload(); await page.waitForSelector(".sim-grid");
  const depois = await leTabela(page);
  if (JSON.stringify(antes) !== JSON.stringify(depois)) erro("tabela mudou depois de recarregar (palpites perdidos)"); else console.log("  ✓ palpites guardados depois de recarregar");
  // limpar
  await page.locator('[data-sim-auto="limpa"]').click();
  const sobra = await page.$$eval(".sim-j input", (l) => l.filter((i) => i.value !== "").length);
  if (sobra) erro(`"Limpar" deixou ${sobra} campos preenchidos`);
  await confere(page, "depois de limpar");
  // aba da rodada atual: só os jogos dela
  await page.goto(`${BASE}/?v=${Date.now()}#/simulador`); await page.waitForSelector(".sim-grid");
  const rd = await page.$eval(".sim-grid", (g) => g.dataset.sim);
  const n = await page.$$eval(".sim-j", (l) => l.length);
  const nEsp = restam.filter((x) => x.rd === +rd).length;
  if (n !== nEsp) erro(`rodada ${rd}: ${n} jogos, esperava ${nEsp}`); else console.log(`  ✓ rodada ${rd}: ${n} jogos`);
  if (erros.length) erro(`erros de JavaScript: ${erros.join(" | ")}`);
  void v2;
  await ctx.close();
}

for (const [nome, opts] of [["celular 320", { ...devices["iPhone SE"], viewport: { width: 320, height: 640 } }], ["iPhone 13 (390)", devices["iPhone 13"]], ["Pixel 7 (412)", devices["Pixel 7"]], ["tablet 768", { viewport: { width: 768, height: 1024 }, hasTouch: true }]]) {
  console.log(nome);
  const { ctx, page, erros } = await abrir(opts, "#/simulador");
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth, fora = [];
    document.querySelectorAll(".sim-grid *").forEach((el) => { const b = el.getBoundingClientRect(); if (b.width && (b.right > vw + 1 || b.left < -1)) fora.push(el.className || el.tagName); });
    const ins = [...document.querySelectorAll(".sim-placar input")].map((i) => i.getBoundingClientRect());
    const btn = [...document.querySelectorAll(".sim-rap button")].map((i) => i.getBoundingClientRect().height);
    // nome do clube cortado sem reticências ou por baixo do escudo
    const sob = [];
    document.querySelectorAll(".sim-t").forEach((t) => { const b = t.querySelector("b").getBoundingClientRect(), c = t.querySelector(".crest").getBoundingClientRect(); if (b.width && b.right > c.left + 1 && b.left < c.right - 1) sob.push(t.textContent.trim()); });
    return { rolagem: document.documentElement.scrollWidth > vw + 1, fora: [...new Set(fora)].slice(0, 5), menorCampo: Math.min(...ins.map((b) => Math.min(b.width, b.height))), menorBotao: Math.min(...btn), sob };
  });
  if (r.rolagem) erro(`${nome}: rolagem lateral na página`);
  if (r.fora.length) erro(`${nome}: elementos fora da tela: ${r.fora.join(", ")}`);
  if (r.menorCampo < 44) erro(`${nome}: campo do placar com ${r.menorCampo} px (mínimo 44)`);
  if (r.menorBotao < 32) erro(`${nome}: botão rápido com ${r.menorBotao} px`);
  if (r.sob.length) erro(`${nome}: nome por baixo do escudo: ${r.sob.join(", ")}`);
  // digitar com o teclado numérico do celular
  const k = await page.$eval(".sim-j", (li) => li.dataset.k);
  await page.locator(`.sim-j[data-k="${k}"] input`).nth(0).tap();
  await page.keyboard.type("4");
  await page.locator(`.sim-j[data-k="${k}"] input`).nth(1).tap();
  await page.keyboard.type("2");
  const chip = await page.locator(".sim-tab .live-chip.sim").count();
  if (chip !== 2) erro(`${nome}: depois do 4 x 2, ${chip} clubes marcados como simulados (esperava 2)`);
  const barra = await page.locator(".bottom-nav").isVisible().catch(() => false);
  if (barra) {
    const nav = await page.evaluate(() => { const n = document.querySelector(".bottom-nav"), b = n.getBoundingClientRect(); return { cabe: b.right <= innerWidth + 1, itens: [...n.querySelectorAll("a")].map((a) => a.getBoundingClientRect().width), ativo: n.querySelector("a.active")?.textContent.trim() }; });
    if (!nav.cabe) erro(`${nome}: barra inferior sai da tela`);
    if (nav.ativo !== "Simular") erro(`${nome}: item ativo da barra inferior é "${nav.ativo}"`);
  }
  if (erros.length) erro(`${nome}: erros de JavaScript: ${erros.join(" | ")}`);
  if (!falhas.some((f) => f.startsWith(nome))) console.log(`  ✓ cabe na tela, campos ${r.menorCampo} px, placar digitado ok`);
  await page.screenshot({ path: `${ROOT}tests/mobile/out/simulador-${nome.split(" ")[0].toLowerCase()}-${opts.viewport?.width || 0}.png` });
  await ctx.close();
}
await browser.close();
console.log(falhas.length ? `\nFALHOU (${falhas.length}):\n- ${falhas.join("\n- ")}` : "\nOK: simulador confere em todos os casos");
process.exitCode = falhas.length ? 1 : 0;
