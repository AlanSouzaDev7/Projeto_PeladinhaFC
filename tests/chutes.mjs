/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Mapa de chutes e xG estimado, sem rede: lances no formato do resumo da ESPN. Uso: node tests/chutes.mjs */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const C = createRequire(import.meta.url)("../js/chutes.js");
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
const chute = (tipo, time, x, y, texto = "Attempt. Fulano (Time) shot.", x2 = 100, y2 = 50) =>
  ({ text: texto, play: { type: { type: tipo }, team: { displayName: time }, clock: { displayValue: "10'" }, fieldPositionX: x, fieldPositionY: y, fieldPosition2X: x2, fieldPosition2Y: y2 } });

t("xG: perto e de frente vale muito mais que de longe ou de ângulo fechado; cabeceio vale menos", () => {
  assert.ok(C.xg(94, 50) > 0.45);
  assert.ok(C.xg(76, 50) < 0.06);
  assert.ok(C.xg(98, 92) < C.xg(98, 50) / 3);
  assert.ok(Math.abs(C.xg(90, 50, true) - C.xg(90, 50) * 0.6) < 1e-9);
});
t("separa por time, conta no alvo e gols, soma o xG; pênalti vale 0,76", () => {
  const r = C.calcula([chute("goal", "São Paulo", 90, 50, "Goal! X. Calleri (São Paulo) right footed shot."), chute("shot-off-target", "Sao Paulo", 75, 40),
    chute("shot-on-target", "Fluminense", 88, 55), chute("shot-blocked", "Fluminense", 85, 45), chute("goal", "Fluminense", 89.5, 50, "Goal! Penalty converted by Cano (Fluminense).")], "São Paulo", "Fluminense");
  assert.deepEqual([r.casa.chutes, r.casa.alvo, r.casa.gols], [2, 1, 1]);
  assert.deepEqual([r.fora.chutes, r.fora.alvo, r.fora.gols], [3, 2, 1]);
  assert.equal(r.chutes.find((c) => c.tipo === "gol" && c.lado === "fora").xg, 0.76);
  assert.equal(r.chutes[0].jogador, "Calleri");
});
t("lances sem posição ou de time desconhecido ficam de fora", () => {
  const r = C.calcula([{ text: "x", play: { type: { type: "shot-off-target" }, team: { displayName: "São Paulo" } } }, chute("shot-on-target", "Outro", 80, 50)], "São Paulo", "Fluminense");
  assert.equal(r.chutes.length, 0);
});
t("desenho: visitante espelhado para atacar à esquerda; nomes escapados", () => {
  const r = C.calcula([chute("shot-on-target", "A", 90, 50), chute("shot-on-target", "B", 90, 50)], "A", "B");
  const s = C.svg(r, "#fff", "#c00", "<A>", "B");
  assert.match(s, /cx="94\.5" cy="34\.0"/); // mandante: x 90 vira 94,5 m
  assert.match(s, /cx="10\.5" cy="34\.0"/); // visitante: espelhado para 10,5 m
  assert.ok(!s.includes("<A>") && s.includes("&lt;A&gt;"));
});
console.log(`\n${ok} testes do mapa de chutes passaram`);
