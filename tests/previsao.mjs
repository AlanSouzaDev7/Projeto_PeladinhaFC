/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Previsão da tabela final, sem rede: simulação de Monte Carlo com semente fixa. Uso: node tests/previsao.mjs */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const P = createRequire(import.meta.url)("../js/previsao.js");
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
const tab = (id, p, w = 0, gf = 0, ga = 0) => ({ id, p, w, gf, ga });

t("as chances de cada posição somam 100% para cada clube e para cada posição", () => {
  const r = P.simula([tab("a", 50), tab("b", 49), tab("c", 48), tab("d", 47)], [{ home: "a", away: "b", xh: 1.2, xa: 1.2 }, { home: "c", away: "d", xh: 1.2, xa: 1.2 }], 4000, 3);
  for (const c of r) assert.ok(Math.abs(c.posicoes.reduce((x, y) => x + y, 0) - 1) < 1e-9);
  for (let k = 0; k < 4; k++) assert.ok(Math.abs(r.reduce((s, c) => s + c.posicoes[k], 0) - 1) < 1e-9);
});
t("sem jogos restantes, a tabela de hoje é a final (desempate: pontos, vitórias, saldo, gols pró)", () => {
  const r = P.simula([tab("a", 50, 15, 40, 20), tab("b", 50, 16, 30, 25), tab("c", 50, 16, 35, 25), tab("d", 50, 16, 36, 26)], [], 50, 1);
  const pos = Object.fromEntries(r.map((c) => [c.id, c.provavel]));
  assert.deepEqual(pos, { d: 1, c: 2, b: 3, a: 4 }); // c e d: mesmos pontos, vitórias e saldo (+10); d tem mais gols pró (36 x 35)
});
t("com folga de pontos e poucos jogos, título garantido; quem não alcança mais fica fora", () => {
  const r = P.simula([tab("lider", 80, 25), tab("vice", 70, 21), tab("lanterna", 10, 2)], [{ home: "vice", away: "lider", xh: 1.5, xa: 1 }], 2000, 9);
  assert.equal(r.find((c) => c.id === "lider").titulo, 1);
  assert.equal(r.find((c) => c.id === "lanterna").posicoes[2], 1);
});
t("mesma semente, mesmo resultado; o time mais forte tende a somar mais pontos", () => {
  const jogos = [{ home: "a", away: "b", xh: 2.2, xa: 0.6 }, { home: "b", away: "a", xh: 0.8, xa: 1.9 }];
  const r1 = P.simula([tab("a", 30), tab("b", 30)], jogos, 3000, 42), r2 = P.simula([tab("a", 30), tab("b", 30)], jogos, 3000, 42);
  assert.deepEqual(r1, r2);
  assert.ok(r1.find((c) => c.id === "a").pontos > r1.find((c) => c.id === "b").pontos + 2);
});
console.log(`\n${ok} testes da previsão passaram`);
