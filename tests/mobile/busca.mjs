/* Busca de clubes: só aparecem clubes cujo nome (ou a forma curta) começa com o que foi digitado.
   Confere todas as letras de A a Z e alguns começos de nome, no PC e no celular, contra a lista de clubes do site;
   e que "f" não traz mais o Athletico Paranaense (antes vinha pelo apelido "Furacão").
   Uso: python -m http.server 5173 --bind 127.0.0.1  e depois  node tests/mobile/busca.mjs */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome" });
const falhas = [];
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

for (const [nome, opts] of [["PC", { viewport: { width: 1366, height: 800 } }], ["celular", devices["Pixel 7"]]]) {
  const ctx = await browser.newContext({ ...opts, locale: "pt-BR" });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 404, body: "" }));
  const page = await ctx.newPage(), erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(`${BASE}/?v=${Date.now()}#/`, { waitUntil: "load" });
  await page.waitForSelector(".match");
  const clubes = await page.evaluate(() => window.PD.CLUBS.map((c) => ({ name: c.name, abbr: c.abbr })));
  const esperado = (q) => clubes.filter((c) => [c.name, c.abbr].some((n) => norm(n).startsWith(norm(q)))).map((c) => c.name).sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 8);
  const consultas = [..."abcdefghijklmnopqrstuvwxyz", "fl", "fla", "flu", "sao", "são", "SÃO P", "atl", "ath", "vas", "gr", "co", "cor", "cr", "bo", "x", "zz", "remo", "Grêmio"];
  const input = page.locator("#search");
  let conferidas = 0;
  for (const q of consultas) {
    await input.fill("");
    await input.fill(q);
    // só os clubes (os jogadores aparecem numa seção própria, conferida em tests/mobile/jogadores.mjs)
    const vistos = await page.evaluate(() => [...document.querySelectorAll('#search-results a[data-busca^="c|"] b')].map((b) => b.textContent));
    const exp = esperado(q);
    if (JSON.stringify(vistos) !== JSON.stringify(exp.slice(0, 6))) falhas.push(`${nome} "${q}": viu ${JSON.stringify(vistos)}, esperava ${JSON.stringify(exp)}`);
    const r = await page.evaluate(() => ({ itens: document.querySelectorAll("#search-results a").length, vazio: document.querySelectorAll("#search-results .empty").length }));
    if (!r.itens && !r.vazio) falhas.push(`${nome} "${q}": sem resultado e sem o aviso "Nenhum clube ou jogador encontrado"`);
    conferidas++;
  }
  await input.fill("f");
  const f = await page.evaluate(() => [...document.querySelectorAll('#search-results a[data-busca^="c|"] b')].map((b) => b.textContent));
  if (f.join() !== "Flamengo,Fluminense") falhas.push(`${nome}: "f" deu ${f.join(", ")}`);
  // Enter abre o primeiro resultado
  await input.press("Enter");
  await page.waitForTimeout(400);
  if (!page.url().endsWith("#/clube/flamengo")) falhas.push(`${nome}: Enter em "f" abriu ${page.url()}`);
  // o menu de resultados cabe na tela
  await input.fill("c");
  const caixa = await page.locator("#search-results").boundingBox();
  const vw = await page.evaluate(() => innerWidth);
  if (!caixa || caixa.x < 0 || caixa.x + caixa.width > vw + 1) falhas.push(`${nome}: menu de resultados sai da tela (${JSON.stringify(caixa)})`);
  if (erros.length) falhas.push(`${nome}: erros de JavaScript: ${erros.join(" | ")}`);
  console.log(`${nome}: ${conferidas} buscas conferidas; "f" = ${f.join(", ")}`);
  await ctx.close();
}
await browser.close();
console.log(falhas.length ? `FALHOU:\n- ${falhas.join("\n- ")}` : "OK: a busca só traz clubes que começam com o que foi digitado");
process.exitCode = falhas.length ? 1 : 0;
