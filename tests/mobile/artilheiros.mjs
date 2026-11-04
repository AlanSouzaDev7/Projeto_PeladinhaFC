/* Artilheiros: comparativo top 5 dos dois times em todas as partidas da rodada e o card de cada clube.
   Confere: os dois lados preenchidos (até 5), gols em ordem, ficha abre e mostra os gols por clube,
   nada vaza da tela no PC e no celular. Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/artilheiros.mjs */
import { chromium, devices } from "playwright";
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const b = await chromium.launch({ channel: "chrome" });
const erros = [];
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel", devices["Pixel 7"]], ["se", { ...devices["iPhone SE"], defaultBrowserType: undefined }]]) {
  const p = await (await b.newContext({ ...opts, locale: "pt-BR" })).newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  await p.goto(`${BASE}/?t=${dev}#/`, { waitUntil: "load" });
  const jogos = await p.evaluate(() => [...new Set([...document.querySelectorAll("a[href^='#/partida/']")].map((a) => a.getAttribute("href").slice(10)))]);
  let cap = null;
  for (const id of jogos) {
    await p.evaluate((id) => (location.hash = `#/partida/${id}`), id);
    await p.waitForSelector(".scorers-duel", { timeout: 5000 }).catch(() => erros.push(`${dev} ${id}: sem comparativo`));
    const r = await p.evaluate(() => {
      const card = document.querySelector(".scorers-duel"); if (!card) return null;
      const lado = (s) => [...card.querySelectorAll(`.sd-${s}:not(.sd-none)`)].map((e) => [e.querySelector(".sd-nm b").textContent, +e.querySelector(".sd-g").textContent]);
      const cr = card.getBoundingClientRect();
      const vaza = [...card.querySelectorAll("*")].some((e) => { const q = e.getBoundingClientRect(); return q.width && (q.left < cr.left - 1 || q.right > cr.right + 1); });
      const cortado = [...card.querySelectorAll(".sd-nm b")].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent);
      return { t: card.querySelector(".sd-head").innerText.replace(/\s+/g, " "), h: lado("h"), a: lado("a"), vaza, cortado, larg: document.documentElement.scrollWidth > innerWidth };
    });
    if (!r) continue;
    const ordem = (L) => L.every((x, k) => !k || L[k - 1][1] >= x[1]);
    if (!r.h.length || !r.a.length) erros.push(`${dev} ${id} ${r.t}: um lado vazio`);
    if (!ordem(r.h) || !ordem(r.a)) erros.push(`${dev} ${id}: fora de ordem`);
    if (r.vaza || r.larg) erros.push(`${dev} ${id}: vaza da tela`);
    if (/Athletico/.test(r.t)) cap = id;
    if (dev === "pc") console.log(`${r.t.padEnd(26)} ${r.h.map((x) => x.join(" ")).join(", ")}  ×  ${r.a.map((x) => x.join(" ")).join(", ")}`);
    if (r.cortado.length) console.log(`  ${dev} nomes com reticências: ${r.cortado.join(", ")}`);
  }
  // ficha abre a partir do comparativo e mostra os gols por clube
  await p.evaluate((id) => (location.hash = "#/partida/" + id), cap);
  await p.waitForSelector(".scorers-duel .has-ficha");
  const el = p.locator(".scorers-duel .sd-a.has-ficha").first();
  await el.scrollIntoViewIfNeeded();
  if (dev === "pc") await el.hover(); else await el.tap();
  await p.waitForTimeout(400);
  const f = await p.evaluate(() => { const t = document.querySelector(".scorer-card.open"); return t && { nome: t.querySelector(".sc-h b").textContent, clubes: t.querySelectorAll(".sc-clubes li").length, r: t.getBoundingClientRect().toJSON() }; });
  if (!f || !f.clubes) erros.push(`${dev}: ficha não abriu ou sem gols por clube`); else console.log(`${dev}: ficha de ${f.nome} ok (${f.clubes} clube)`);
  if (f && (f.r.left < 0 || f.r.right > p.viewportSize().width)) erros.push(`${dev}: ficha fora da tela`);
  await p.screenshot({ path: `tests/mobile/out/artilheiros-${dev}.png`, fullPage: false });
  // card do clube: todos os 20 têm artilheiros
  for (const c of await p.evaluate(() => PD.CLUBS.map((c) => c.id))) {
    await p.evaluate((c) => (location.hash = `#/clube/${c}`), c);
    const n = await p.waitForFunction(() => [...document.querySelectorAll(".card-h")].find((h) => h.textContent.startsWith("Artilheiros do"))?.closest(".card").querySelectorAll("li").length, null, { timeout: 5000 }).then((h) => h.jsonValue()).catch(() => 0);
    if (n < 1) erros.push(`${dev} clube ${c}: sem artilheiros`);
  }
  await p.context().close();
}
console.log(erros.length ? "\n" + erros.join("\n") : "\ncomparativo e cards de artilheiros ok em todas as partidas e clubes");
await b.close();
