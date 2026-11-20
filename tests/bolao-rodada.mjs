/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Bolão sem rede: ranking de uma rodada (lista de jogos), conquistas e números do torcedor.
   Uso: node tests/bolao-rodada.mjs */
import assert from "node:assert/strict";
import { ranking, numeros } from "../worker/bolao.mjs";
import { d1Simulado } from "./sim/d1.mjs";

let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };
const DB = d1Simulado(), env = { DB };
const jogo = (id, data, estado, gc = null, gf = null) => DB._db.prepare(`INSERT INTO jogos (id, liga, competicao, temporada, data, hora, casa_id, casa, fora_id, fora, gols_casa, gols_fora, estado, atualizado)
  VALUES (?, 'bra.1', 'Brasileirão', '2026', ?, '16:00', 'cruzeiro', 'Cruzeiro', 'atletico-mg', 'Atlético-MG', ?, ?, ?, 1)`).run(id, data, gc, gf, estado);
const palpite = (usuario, j, casa, fora) => DB._db.prepare("INSERT INTO palpites (usuario, jogo, casa, fora, criado, atualizado) VALUES (?, ?, ?, ?, 1, 1)").run(usuario, j, casa, fora);
const apelido = (usuario) => DB._db.prepare("INSERT INTO apelidos (usuario, apelido, atualizado) VALUES (?, ?, 1)").run(usuario, `Torcedor ${usuario}`);

// quatro jogos encerrados em ordem de data e um por vir
jogo("1", "2026-11-01", "post", 2, 1);
jogo("2", "2026-11-02", "post", 3, 2); // 5 gols
jogo("3", "2026-11-03", "post", 0, 1); // zebra: só u1 acerta a vitória do visitante
jogo("4", "2026-11-04", "post", 1, 1);
jogo("5", "2099-01-01", "pre");
for (const u of ["u1", "u2", "u3", "u4", "u5", "u6"]) apelido(u);
palpite("u1", "1", 2, 1); palpite("u1", "2", 3, 2); palpite("u1", "3", 0, 2); palpite("u1", "4", 0, 0); palpite("u1", "5", 1, 0);
palpite("u2", "1", 1, 0); palpite("u2", "2", 0, 0); palpite("u2", "3", 1, 0); palpite("u2", "4", 2, 2);
for (const u of ["u3", "u4", "u5", "u6"]) palpite(u, "3", 2, 0);

await t("ranking da rodada soma só os jogos da lista", async () => {
  const r = await ranking(env, "u2", "", "1,2");
  assert.equal(r.rodada, true);
  assert.deepEqual(r.linhas.map((x) => [x.apelido, x.pontos, x.jogos]), [["Torcedor u1", 20, 2], ["Torcedor u2", 7, 2]]);
  assert.equal(r.voce.pos, 2);
  const geral = await ranking(env, "u2", "");
  assert.equal(geral.rodada, false);
  assert.equal(geral.linhas[0].pontos, 30); // 10 + 10 + 5 + 5
});
await t("lista de jogos inválida ou longa demais é recusada", async () => {
  assert.equal((await ranking(env, null, "", "1,abc")).status, 400);
  assert.equal((await ranking(env, null, "", Array.from({ length: 21 }, (_, i) => i + 1).join(","))).status, 400);
  assert.equal((await ranking(env, null, "", "1;DROP TABLE palpites")).status, 400);
});
await t("números: aproveitamento, sequência atual e maior, exatos", async () => {
  const s = await numeros(env, "u1");
  assert.equal(s.palpites, 5);
  assert.equal(s.encerrados, 4);
  assert.equal(s.aproveitamento, 100);
  assert.equal(s.sequencia, 4);
  assert.equal(s.maiorSequencia, 4);
  assert.equal(s.exatos, 2);
  const b = await numeros(env, "u2");
  assert.equal(b.aproveitamento, 50);
  assert.equal(b.sequencia, 1); // pontuou no último (empate 2 x 2 num 1 x 1)
  assert.equal(b.maiorSequencia, 1);
});
await t("conquistas: na mosca, embalado, faro de zebra e profeta da goleada", async () => {
  const ganhou = async (u) => (await numeros(env, u)).conquistas.filter((c) => c.ganhou).map((c) => c.id);
  assert.deepEqual(await ganhou("u1"), ["exato-1", "seq-3", "zebra", "goleada"]);
  assert.deepEqual(await ganhou("u2"), []);
  assert.deepEqual(await ganhou("ninguem"), []);
});
console.log(`\n${ok} testes do bolão por rodada passaram`);
