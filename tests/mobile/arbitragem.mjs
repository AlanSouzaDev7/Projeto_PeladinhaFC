/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* Arbitragem dos próximos jogos pelas manchetes.
   1) a leitura do nome do árbitro nos títulos (server/placar_api.py: ref_names), com casos reais e armadilhas;
   2) a página do jogo: "Árbitro" nas Informações e as manchetes com link quando há escala noticiada,
      "Ainda não noticiado" quando o nome não saiu, e nada disso em jogo encerrado. PC e celular.
   Uso: sirva a raiz do site (ex.: python -m http.server 5174 --bind 127.0.0.1) e depois  node tests/mobile/arbitragem.mjs
   (outra porta: BASE=http://127.0.0.1:5191 node tests/mobile/arbitragem.mjs). Sai com código 1 se algo falhar. */
import { chromium, devices } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

// 2) página do jogo, com jogos da rodada atual dos dados gravados (dados/live-data.json):
//    São Paulo x Remo (r37) com a escala noticiada, Fluminense x Cruzeiro (r37) sem nome ainda e Palmeiras x Flamengo (r36), encerrado.
//    Os dois jogos por vir ficam marcados "a disputar" daqui a 2 e 3 dias, para o teste não depender do dia em que roda.
const BASE_LD = JSON.parse(readFileSync(new URL("../../dados/live-data.json", import.meta.url), "utf8"));
const agora = Math.floor(Date.now() / 1000);
const ARB = { updated: "05/11/2026 às 10:30", arbitros: ["Wilton Pereira Sampaio"], jogos: {
  "401841329": { arbitro: "Wilton Pereira Sampaio", confirmacoes: 3, manchetes: [{ title: "Wilton Pereira Sampaio apita São Paulo x Remo", link: "https://ge.globo.com/", source: "ge", ts: agora - 3600 }] },
  "401841337": { arbitro: null, confirmacoes: 0, manchetes: [{ title: "Fluminense x Cruzeiro: onde assistir, escalações e arbitragem", link: "https://www.terra.com.br/", source: "Terra", ts: agora - 7200 }] },
} };
const diaBR = (dias) => new Date(Date.now() + dias * 864e5).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
const LD = structuredClone(BASE_LD);
LD.arbitragem = ARB;
const achados = {};
for (const [rd, gs] of Object.entries(LD.fixtures)) for (const g of gs) {
  const k = `${g[0]}-x-${g[1]}-r${rd}`;
  if (k === "sao-paulo-x-remo-r37") { g[7] = "401841329"; g[2] = g[3] = null; g[4] = diaBR(2); g[5] = "20:00"; g[8] = { state: "pre", clock: "0'", detail: "Scheduled", gols: [] }; achados[k] = 1; }
  if (k === "fluminense-x-cruzeiro-r37") { g[7] = "401841337"; g[2] = g[3] = null; g[4] = diaBR(3); g[5] = "20:00"; g[8] = { state: "pre", clock: "0'", detail: "Scheduled", gols: [] }; achados[k] = 1; }
  if (k === "palmeiras-x-flamengo-r36") { if (g[8]?.state !== "post") erros.push(`dados: Palmeiras x Flamengo (r36) não está encerrado em dados/live-data.json`); achados[k] = 1; }
}
for (const k of ["sao-paulo-x-remo-r37", "fluminense-x-cruzeiro-r37", "palmeiras-x-flamengo-r36"]) if (!achados[k]) erros.push(`dados: jogo ${k} não está em dados/live-data.json (atualize o teste)`);
const b = await chromium.launch({ channel: "chrome" });
for (const [dev, opts] of [["pc", { viewport: { width: 1440, height: 900 } }], ["pixel", devices["Pixel 7"]]]) {
  // sem service worker (sw.js): ele serviria os dados do cache dele, por fora do p.route
  const p = await (await b.newContext({ ...opts, serviceWorkers: "block" })).newPage();
  p.on("pageerror", (e) => erros.push(`${dev}: ${e.message}`));
  // o index.html ainda carrega js/live-data.js, e o site relê o arquivo por js/dados.js: primeiro o banco
  // (Worker D1, <api>/dados/live-data.json), depois a cópia estática dados/live-data.json. Os três dão os mesmos dados.
  await p.route(/js\/live-data\.js/, (r) => r.fulfill({ body: `window.LIVE_DATA = ${JSON.stringify(LD)};`, contentType: "application/javascript" }));
  await p.route(/\/dados\/live-data\.json/, (r) => r.fulfill({ json: LD }));
  const ver = async (id) => {
    await p.goto(`${BASE}/?a=${Date.now()}#/partida/${id}`, { waitUntil: "load" }); await p.waitForTimeout(1500);
    return p.evaluate(() => { const c = [...document.querySelectorAll(".card")].find((x) => x.querySelector(".card-h")?.textContent === "Informações");
      const row = [...c.querySelectorAll(".card-b > div")].find((d) => d.firstElementChild?.textContent === "Árbitro");
      return { arbitro: row?.lastElementChild.innerText.replace(/\s+/g, " ") || null, links: [...c.querySelectorAll(".arb-list a")].map((a) => [a.href, a.target]), aviso: !!c.querySelector(".arb-aviso a[href*='cbf.com.br']"), larg: document.documentElement.scrollWidth > innerWidth + 1 }; });
  };
  let r = await ver("sao-paulo-x-remo-r37");
  ok(/Wilton Pereira Sampaio/.test(r.arbitro) && /3 manchetes/.test(r.arbitro), `${dev}: São Paulo x Remo com o árbitro e quantas manchetes confirmam (${r.arbitro})`);
  ok(r.links.length === 1 && r.links[0][1] === "_blank" && r.aviso && !r.larg, `${dev}: manchete com link, aviso da escala oficial e sem rolagem lateral`);
  r = await ver("fluminense-x-cruzeiro-r37");
  ok(/Ainda não noticiado/.test(r.arbitro || "") && r.links.length === 1, `${dev}: Fluminense x Cruzeiro sem nome ainda: "Ainda não noticiado" e a manchete (${r.arbitro})`);
  r = await ver("palmeiras-x-flamengo-r36");
  ok(r.arbitro === null && !r.links.length, `${dev}: jogo encerrado não mostra o quadro`);
  await p.context().close();
}
await b.close();
if (erros.length) { console.log("\nFALHAS:\n" + erros.join("\n")); process.exitCode = 1; }
else console.log("\narbitragem pelas manchetes ok (títulos, página do jogo no PC e no celular)");
