/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Replay do gol (js/replay.js) sem rede, com 13 gols reais da 35ª rodada (tests/fixtures/gols-espn.json):
   leitura da narração, plano da jogada e quadros da animação. Uso: node tests/replay.mjs */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const R = req("../js/replay.js"), F = req("./fixtures/gols-espn.json");
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
const gols = F.map((f) => R.le(f.c, f.casa, f.fora));
const por = (nome) => gols.find((g) => g.autor === nome);

t("lê os 13 gols: autor, time, assistência e placar", () => {
  assert.equal(gols.length, 13);
  assert.ok(gols.every((g) => g && g.autor && (g.time === "casa" || g.time === "fora")));
  const kaio = gols.filter((g) => g.autor === "Kaio César");
  assert.equal(kaio.length, 3);
  assert.deepEqual(kaio.map((g) => g.placar), [[1, 0], [3, 0], [4, 0]]);
  assert.equal(por("Ramón Sosa").time, "fora");
  assert.equal(por("Ramón Sosa").assist, "Lucas Evangelista");
});
t("tipos de jogada: cruzamento, cabeça, enfiada em contra-ataque, escanteio, pênalti, falta e gol contra", () => {
  assert.equal(gols.find((g) => g.autor === "Kaio César" && g.min === "28'").passe, "cruzamento");
  assert.equal(por("Thiago Mendes").passe, "cabeca");
  assert.deepEqual([por("Ramón Sosa").passe, por("Ramón Sosa").contraAtaque], ["enfiada", true]);
  assert.deepEqual([por("Juninho").passe, por("Juninho").pe], ["escanteio", "cabeça"]);
  assert.equal(por("Jorginho").passe, "penalti");
  assert.equal(por("Matheus Pereira").passe, "falta");
  assert.equal(por("Matheus Pereira").gol.altura, 0.82, "falta no alto");
});
t("gol contra conta para o outro time (Khellven, do Palmeiras, fez para o Cruzeiro)", () => {
  const g = por("Khellven");
  assert.equal(g.passe, "contra");
  assert.equal(g.time, "casa");
});
t("plano: o chute sai do local real e termina na linha do gol, no lado real", () => {
  for (const g of gols) {
    const P = R.plano(g), chute = P.fases.at(-1);
    assert.equal(chute.tipo, "chute");
    assert.deepEqual(chute.de, g.de);
    assert.deepEqual(chute.para, { x: 100, y: g.gol.y });
    const fim = R.quadro(P, P.total);
    assert.equal(fim.fase, "gol");
    assert.ok(Math.abs(fim.bola.x - 100) < 1e-9 && Math.abs(fim.bola.y - g.gol.y) < 1e-9);
  }
});
t("pênalti e falta não têm passe; cruzamento sai da ponta oposta e escanteio da bandeira", () => {
  assert.equal(R.plano(por("Jorginho")).origem, null);
  assert.equal(R.plano(por("Matheus Pereira")).origem, null);
  const cruz = R.origem(gols.find((g) => g.passe === "cruzamento"));
  assert.ok(cruz.y > 85 || cruz.y < 15);
  const esc = R.origem(por("Juninho"));
  assert.equal(esc.x, 100);
  assert.ok(esc.y === 0 || esc.y === 100);
});
t("quadros: a bola fica sempre dentro do campo e a animação avança sem saltos grandes", () => {
  for (const g of gols) {
    const P = R.plano(g);
    let antes = null;
    for (let ms = 0; ms <= P.total; ms += 16) {
      const q = R.quadro(P, ms);
      assert.ok(q.bola.x >= -1 && q.bola.x <= 101 && q.bola.y >= -1 && q.bola.y <= 101, `${g.autor} ${ms}ms fora do campo`);
      if (antes) assert.ok(Math.hypot(q.bola.x - antes.x, q.bola.y - antes.y) < 6, `${g.autor} salto aos ${ms}ms`);
      antes = q.bola;
    }
  }
});
t("lance que não é gol é ignorado", () => {
  assert.equal(R.le({ text: "Attempt missed. Fulano (Time) right footed shot...", play: { type: { type: "shot-off-target" } } }, "A", "B"), null);
});
console.log(`\n${ok} testes do replay do gol passaram`);
