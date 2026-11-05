/* Arbitragem dos próximos jogos pelas manchetes.
   1) a leitura do nome do árbitro nos títulos (server/placar_api.py: ref_names), com casos reais e armadilhas;
   2) a página do jogo: "Árbitro" nas Informações e as manchetes com link quando há escala noticiada,
      "Ainda não noticiado" quando o nome não saiu, e nada disso em jogo encerrado. PC e celular.
   Uso: python -m http.server 5174 --bind 127.0.0.1  e depois  node tests/mobile/arbitragem.mjs */
import { chromium, devices } from "playwright";
import { execFileSync } from "node:child_process";
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const erros = [], ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));

// 1) nomes nos títulos
const casos = [
  ["Wilton Pereira Sampaio apita jogo do Palmeiras contra o Remo no Brasileirão após longo jejum", "Wilton Pereira Sampaio"],
  ["CBF escala Raphael Claus para o clássico entre São Paulo e Corinthians", "Raphael Claus"],
  ["Flamengo x Grêmio terá Paulo César Zanovelli no comando; veja a escala", "Paulo César Zanovelli"],
  ["Com Anderson Daronco no apito, Inter recebe o Coritiba", "Anderson Daronco"],
  ["Árbitro com polêmica em Ba-Vi é escalado para Cruzeiro x Bahia; relembre", ""],
  ["Cruzeiro x Bahia: onde assistir, escalações e arbitragem", ""],
  ["São Paulo apita... nada: Tricolor empata com o Corinthians", ""],
];
const py = execFileSync("python", ["-X", "utf8", "-c", `import sys,json; sys.path.insert(0,'server'); import placar_api as A
casos=json.loads(sys.argv[1]); print(json.dumps([A.ref_names(t) for t,_ in casos], ensure_ascii=False))`, JSON.stringify(casos)], { encoding: "utf8" });
const achou = JSON.parse(py.trim().split("\n").pop());
casos.forEach(([t, esperado], i) => ok(esperado ? achou[i].includes(esperado) : !achou[i].length, `título → ${esperado || "nenhum nome"}: "${t.slice(0, 60)}…" (${JSON.stringify(achou[i])})`));

// 2) página do jogo
const ARB = { updated: "05/11/2026 às 10:30", arbitros: ["Wilton Pereira Sampaio"], jogos: {
  "401841300": { arbitro: "Wilton Pereira Sampaio", confirmacoes: 3, manchetes: [{ title: "Wilton Pereira Sampaio apita Palmeiras x Remo", link: "https://ge.globo.com/", source: "ge", ts: Math.floor(Date.now() / 1000) - 3600 }] },
  "401841303": { arbitro: null, confirmacoes: 0, manchetes: [{ title: "Cruzeiro x Bahia: onde assistir, escalações e arbitragem", link: "https://www.terra.com.br/", source: "Terra", ts: Math.floor(Date.now() / 1000) - 7200 }] },
} };
const b = await chromium.launch({ channel: "chrome" });
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel", devices["Pixel 7"]]]) {
  const p = await (await b.newContext(opts)).newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  await p.route(/js\/live-data\.js/, async (r) => {
    const s = await (await r.fetch()).text(), d = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
    d.arbitragem = ARB;
    for (const gs of Object.values(d.fixtures)) for (const g of gs) {
      if (g[0] === "palmeiras" && g[1] === "remo") { g[7] = "401841300"; g[2] = g[3] = null; g[8] = { state: "pre", clock: "0'", detail: "Scheduled" }; }
      if (g[0] === "cruzeiro" && g[1] === "bahia") { g[7] = "401841303"; g[2] = g[3] = null; g[8] = { state: "pre", clock: "0'", detail: "Scheduled" }; }
    }
    r.fulfill({ body: `window.LIVE_DATA = ${JSON.stringify(d)};`, contentType: "application/javascript" });
  });
  const ver = async (id) => {
    await p.goto(`${BASE}/?a=${Date.now()}#/partida/${id}`, { waitUntil: "load" }); await p.waitForTimeout(1500);
    return p.evaluate(() => { const c = [...document.querySelectorAll(".card")].find((x) => x.querySelector(".card-h")?.textContent === "Informações");
      const row = [...c.querySelectorAll(".card-b > div")].find((d) => d.firstElementChild?.textContent === "Árbitro");
      return { arbitro: row?.lastElementChild.innerText.replace(/\s+/g, " ") || null, links: [...c.querySelectorAll(".arb-list a")].map((a) => [a.href, a.target]), aviso: !!c.querySelector(".arb-aviso a[href*='cbf.com.br']"), larg: document.documentElement.scrollWidth > innerWidth + 1 }; });
  };
  let r = await ver("palmeiras-x-remo-r34");
  ok(/Wilton Pereira Sampaio/.test(r.arbitro) && /3 manchetes/.test(r.arbitro), `${dev}: Palmeiras x Remo com o árbitro e quantas manchetes confirmam (${r.arbitro})`);
  ok(r.links.length === 1 && r.links[0][1] === "_blank" && r.aviso && !r.larg, `${dev}: manchete com link, aviso da escala oficial e sem rolagem lateral`);
  r = await ver("cruzeiro-x-bahia-r34");
  ok(/Ainda não noticiado/.test(r.arbitro || "") && r.links.length === 1, `${dev}: Cruzeiro x Bahia sem nome ainda: "Ainda não noticiado" e a manchete`);
  r = await ver("flamengo-x-gremio-r34");
  ok(r.arbitro === null && !r.links.length, `${dev}: jogo encerrado não mostra o quadro`);
  await p.context().close();
}
await b.close();
console.log(erros.length ? "\nFALHAS:\n" + erros.join("\n") : "\narbitragem pelas manchetes ok (títulos, página do jogo no PC e no celular)");
