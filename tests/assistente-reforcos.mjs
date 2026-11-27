/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Assistente de reforços (js/assistente-reforcos.js): a pergunta em português vira os filtros certos; continentes.
   Uso: node tests/assistente-reforcos.mjs */
import { createRequire } from "node:module";
const A = createRequire(import.meta.url)("../js/assistente-reforcos.js");
let n = 0;
const falhas = [];
const igual = (q, esperado, ctx = { cambio: 6 }) => {
  n++;
  const { f } = A.entende(q, ctx);
  for (const [k, v] of Object.entries(esperado)) if (JSON.stringify(f[k]) !== JSON.stringify(v)) falhas.push(`"${q}": ${k} = ${JSON.stringify(f[k])}, esperado ${JSON.stringify(v)}`);
};
// o exemplo do pedido: "Campeonato Brasileiro" é a liga, não a nacionalidade
igual("jogadores da Série B do Campeonato Brasileiro que tenham destaque como possíveis promessas", { lgs: ["bra.2"], nac: undefined, idMax: 21, ord: "promessa" });
igual("Promessas da Série B", { lgs: ["bra.2"], idMax: 21, ord: "promessa" });
igual("Pontas que recompõem até 5 milhões", { pos: "pon", vMax: 5e6, tags: ["R"] });
igual("2º volantes argentinos sub-23", { pos: "VOL2", nac: "arg", idMax: 23 });
igual("1º volante que marca bem", { pos: "VOL1", tags: ["M"] });
igual("Zagueiros europeus experientes", { pos: "ZAG", cont: "europa", contPor: "nacionalidade", idMin: 30 });
igual("Atacantes que jogam na Ásia", { pos: "A", cont: "asia", contPor: "liga" });
igual("Laterais-esquerdos baratos que marcam bem", { pos: "LE", vMax: 3e6, ord: "barato", tags: ["M"] });
igual("meias até R$ 30 milhões da Premier League", { pos: "mei", lgs: ["eng.1"], vMax: 5e6 });
igual("centroavante com fim de contrato", { pos: "CA", contrato: "2027-06" });
igual("goleiros brasileiros entre 20 e 25 anos", { pos: "G", nac: "bra", idMin: 20, idMax: 25 });
igual("top 5 atacantes da Serie A italiana", { pos: "A", lgs: ["ita.1"], n: 5, ord: "valor" });
igual("zagueiros da Série B italiana", { pos: "ZAG", lgs: ["tm:IT2"] });
igual("atacantes africanos", { pos: "A", cont: "africa", contPor: "nacionalidade" });
igual("jogadores da Oceania", { cont: "oceania", contPor: "liga" });
igual("Kaio Jorge", { q: "Kaio Jorge" });
const r = A.entende("xyz", {});
n++; if (r.reconheceu === true && !r.f.q) falhas.push("pergunta vazia não pode ser reconhecida sem nome");
// continentes: país do jogador e país da liga
for (const [p, c] of [["bra", "america"], ["eng", "europa"], ["jpn", "asia"], ["sen", "africa"], ["aus", "oceania"], ["x-koreasouth", "asia"], ["x-capeverde", "africa"], ["tur", "europa"]]) { n++; if (A.contDoPais(p) !== c) falhas.push(`país ${p}: ${A.contDoPais(p)}, esperado ${c}`); }
for (const [l, c] of [["bra.2", "america"], ["eng.1", "europa"], ["ksa.1", "asia"], ["tm:AUS1", "oceania"], ["tm:EL1S", "america"], ["tm:JAP1", "asia"]]) { n++; if (A.contDaLiga(l) !== c) falhas.push(`liga ${l}: ${A.contDaLiga(l)}, esperado ${c}`); }
if (falhas.length) { console.log(`${falhas.length} falha(s):\n- ${falhas.join("\n- ")}`); process.exit(1); }
console.log(`${n} testes do assistente de reforços passaram`);
