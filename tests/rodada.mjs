/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Resumo da rodada sem rede: viradas, tabela por rodada e destaques. Uso: node tests/rodada.mjs */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const R = createRequire(import.meta.url)("../js/rodada.js");
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
const gol = (clube, nome = "X", contra = 0, pen = 0) => ["1", nome, clube, pen, contra];
const jogo = (home, away, hs, as, gols = [], extra = {}) => ({ id: `${home}-x-${away}`, home, away, hs, as, status: "ft", gols, ...extra });

t("virada: o vencedor esteve atrás; gol contra conta para o adversário", () => {
  assert.equal(R.virada(jogo("a", "b", 2, 1, [gol("b"), gol("a"), gol("a")])), "a");
  assert.equal(R.virada(jogo("a", "b", 2, 1, [gol("a"), gol("b"), gol("a")])), null, "empatou mas nunca esteve atrás");
  assert.equal(R.virada(jogo("a", "b", 1, 2, [gol("a"), gol("a", "Z", 1), gol("b")])), "b", "gol contra do mandante vale para o visitante");
  assert.equal(R.virada(jogo("a", "b", 2, 1, [gol("b"), gol("a")])), null, "lista de gols incompleta: não arrisca");
});
t("tabela depois de uma rodada desfaz os resultados das rodadas seguintes", () => {
  const tab = [{ id: "a", p: 10, w: 3, gf: 8, ga: 4 }, { id: "b", p: 9, w: 3, gf: 7, ga: 5 }, { id: "c", p: 6, w: 2, gf: 5, ga: 6 }];
  const porR = { 1: [jogo("c", "a", 3, 0)], 2: [jogo("b", "a", 2, 0)] };
  assert.deepEqual(R.tabelaApos(tab, porR, 1).map((r) => [r.id, r.p]), [["a", 10], ["b", 6], ["c", 6]]);
  assert.deepEqual(R.tabelaApos(tab, porR, 0).map((r) => [r.id, r.p]), [["a", 10], ["b", 6], ["c", 3]]);
});
t("destaques: goleada, jogo com mais gols, zebra, artilheiros (sem gol contra) e sobe e desce", () => {
  const jogos = [jogo("a", "b", 4, 0, [gol("a", "Hat"), gol("a", "Hat"), gol("a", "Hat"), gol("b", "Contra", 1)]), jogo("c", "d", 3, 3), jogo("e", "f", 0, 1), jogo("g", "h", 1, 1, [], { status: "ns" })];
  const antes = [{ id: "a", pos: 3 }, { id: "f", pos: 10 }, { id: "e", pos: 5 }], depois = [{ id: "a", pos: 1 }, { id: "f", pos: 7 }, { id: "e", pos: 8 }];
  const D = R.destaques(jogos, { antes, depois, chance: (m) => (m.home === "e" ? { casa: 0.7, empate: 0.2, fora: 0.1 } : { casa: 0.5, empate: 0.3, fora: 0.2 }) });
  assert.equal(D.encerrados, 3);
  assert.equal(D.goleada.home, "a");
  assert.equal(D.maisGols.home, "c");
  assert.equal(D.zebra.quem, "f");
  assert.deepEqual(D.artilheiros.map((x) => [x.nome, x.gols]), [["Hat", 3]]);
  assert.deepEqual(D.subiu.map((x) => x.id), ["f", "a"]); // f subiu 3 posições, a subiu 2
  assert.deepEqual(D.desceu.map((x) => x.id), ["e"]);
});
t("rodada sem jogos encerrados: sem destaques", () => {
  const D = R.destaques([jogo("a", "b", null, null, [], { status: "ns" })]);
  assert.equal(D.encerrados, 0);
  assert.equal(D.goleada, undefined);
});
console.log(`\n${ok} testes do resumo da rodada passaram`);
