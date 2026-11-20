/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Gráfico de pressão sem rede: lances no formato do resumo da ESPN. Uso: node tests/pressao.mjs */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const P = createRequire(import.meta.url)("../js/pressao.js");
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
const lance = (min, tipo, time, texto = "") => ({ time: { value: min * 60 }, text: texto, play: { type: { type: tipo }, clock: { value: min * 60 }, team: time ? { displayName: time } : undefined } });

t("mandante chutando e com escanteios fica acima da linha; o efeito passa com o tempo", () => {
  const r = P.calcula([lance(5, "shot-on-target", "São Paulo"), lance(6, "corner-awarded", "São Paulo"), lance(7, "shot-off-target", "São Paulo"), lance(40, "foul", "Fluminense")], "São Paulo", "Fluminense");
  assert.ok(r.serie[6].v > 0.5, "aos 7' o São Paulo pressiona");
  assert.ok(r.serie[35].v < r.serie[6].v / 4, "30 minutos depois quase não pesa mais");
  assert.equal(r.minutos, 40);
});
t("visitante pressionando fica abaixo; gols e intervalo marcados; nomes com e sem acento batem", () => {
  const r = P.calcula([lance(44, "shot-on-target", "Fluminense"), lance(45, "goal", "Fluminense", "Goal! São Paulo 0, Fluminense 1."), lance(45.5, "halftime", null, "First Half ends"),
    lance(60, "shot-blocked", "Sao Paulo")], "São Paulo", "Fluminense");
  assert.ok(r.serie[44].v < -0.5);
  assert.deepEqual(r.gols.map((g) => g.lado), [-1]);
  assert.ok(r.intervalo >= 45);
  assert.ok(r.serie[59].v > 0, "o chute bloqueado do Sao Paulo (sem acento) conta para o mandante");
});
t("faltas comuns e lances sem time não contam; falta sofrida no ataque conta pouco", () => {
  const r = P.calcula([lance(10, "foul", "São Paulo"), lance(10, "substitution", null), lance(12, "free-kick-won", "Fluminense", "X (Fluminense) wins a free kick in the attacking half.")], "São Paulo", "Fluminense");
  assert.equal(r.lances, 1);
  assert.ok(r.serie[11].v < 0 && r.serie[11].v > -0.5);
});
t("o SVG escapa os nomes e desenha uma barra por minuto", () => {
  const r = P.calcula([lance(3, "shot-on-target", "A"), lance(8, "corner-awarded", "B")], "A", "B");
  const s = P.svg(r, "#fff", "#c00", "<A>", "B");
  assert.equal((s.match(/<rect/g) || []).length, r.minutos);
  assert.ok(!s.includes("<A>") && s.includes("&lt;A&gt;"));
});
console.log(`\n${ok} testes do gráfico de pressão passaram`);
