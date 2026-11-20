/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Bolão sem rede: ranking de uma rodada (lista de jogos), conquistas e números do torcedor.
   Uso: node tests/bolao-rodada.mjs */
import assert from "node:assert/strict";
import { ranking, numeros, atualizaTotais, limpaTotais } from "../worker/bolao.mjs";
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
await t("totais guardados: batem com a soma dos palpites e refazem quando o placar é corrigido", async () => {
  const agora = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM bolao_contados").get().n, 4, "o primeiro ranking já somou os 4 jogos encerrados");
  const linha = (u) => DB._db.prepare("SELECT pontos, exatos, jogos FROM bolao_totais WHERE usuario = ?").get(u);
  assert.deepEqual({ ...linha("u1") }, { pontos: 30, exatos: 2, jogos: 4 });
  assert.equal(await atualizaTotais(env, agora), 0, "nada novo: não refaz");
  DB._db.prepare("UPDATE jogos SET gols_casa = 1, gols_fora = 0 WHERE id = '4'").run(); // placar corrigido
  assert.equal(await atualizaTotais(env, agora), 1);
  assert.deepEqual({ ...linha("u1") }, { pontos: 25, exatos: 2, jogos: 4 }, "0 x 0 num 1 x 0 vale 0");
  DB._db.prepare("UPDATE jogos SET gols_casa = 1, gols_fora = 1 WHERE id = '4'").run();
  await atualizaTotais(env, agora);
});
await t("jogo que acaba entra nos totais de quem palpitou nele", async () => {
  const agora = Date.parse("2026-11-05T12:00:00Z");
  jogo("6", "2026-11-05", "pre");
  palpite("u2", "6", 3, 0);
  assert.equal(await atualizaTotais(env, agora), 0);
  DB._db.prepare("UPDATE jogos SET estado = 'post', gols_casa = 3, gols_fora = 0 WHERE id = '6'").run();
  assert.equal(await atualizaTotais(env, agora), 1);
  assert.equal(DB._db.prepare("SELECT pontos FROM bolao_totais WHERE usuario = 'u2'").get().pontos, 22); // 7 + 0 + 0 + 5 e o placar exato do jogo novo
});
await t("ranking geral: total real e posição de quem está fora dos 100 primeiros", async () => {
  const ins = DB._db.prepare("INSERT INTO bolao_totais (usuario, pontos, exatos, jogos, atualizado) VALUES (?, ?, 0, 1, 1)");
  for (let i = 0; i < 150; i++) { apelido(`x${i}`); ins.run(`x${i}`, 100 + i); }
  apelido("lanterna"); ins.run("lanterna", 1);
  DB._db.prepare("INSERT INTO palpites (usuario, jogo, casa, fora, criado, atualizado) SELECT usuario, '1', 0, 0, 1, 1 FROM bolao_totais WHERE usuario LIKE 'x%' OR usuario = 'lanterna'").run();
  const r = await ranking(env, "lanterna", "");
  assert.equal(r.linhas.length, 100);
  assert.equal(r.total, 157); // 150 + lanterna + u1 a u6 (u3 a u6 com 0 ponto)
  assert.equal(r.linhas[0].pontos, 249);
  assert.deepEqual([r.voce.pos, r.voce.pontos], [153, 1]);
  await limpaTotais(env);
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM bolao_totais").get().n, 157, "todos têm palpite: ninguém sai");
});
await t("sem a tabela de totais (migração não rodada): o ranking soma os palpites como antes", async () => {
  const D2 = d1Simulado();
  D2._db.exec("DROP TABLE bolao_totais; DROP TABLE bolao_contados;");
  D2._db.prepare("INSERT INTO apelidos (usuario, apelido, atualizado) VALUES ('a', 'Ana', 1)").run();
  D2._db.prepare(`INSERT INTO jogos (id, liga, competicao, temporada, data, hora, casa, fora, gols_casa, gols_fora, estado, atualizado) VALUES ('1', 'bra.1', 'B', '2026', '2026-11-01', '16:00', 'A', 'B', 2, 1, 'post', 1)`).run();
  D2._db.prepare("INSERT INTO palpites (usuario, jogo, casa, fora, criado, atualizado) VALUES ('a', '1', 2, 1, 1, 1)").run();
  const r = await ranking({ DB: D2 }, "a", "");
  assert.deepEqual([r.total, r.linhas[0].pontos, r.voce.pos], [1, 10, 1]);
});
await t("carga: 4.000 torcedores x 30 jogos (120 mil palpites), ranking pelos totais bem mais leve", async () => {
  const D3 = d1Simulado(), e3 = { DB: D3 };
  const ins = D3._db.prepare(`INSERT INTO jogos (id, liga, competicao, temporada, data, hora, casa, fora, gols_casa, gols_fora, estado, atualizado) VALUES (?, 'bra.1', 'B', '2026', '2026-10-01', '16:00', 'A', 'B', ?, ?, 'post', 1)`);
  for (let j = 0; j < 30; j++) ins.run(String(1000 + j), j % 4, j % 3);
  const ap = D3._db.prepare("INSERT INTO apelidos (usuario, apelido, atualizado) VALUES (?, ?, 1)"), pa = D3._db.prepare("INSERT INTO palpites (usuario, jogo, casa, fora, criado, atualizado) VALUES (?, ?, ?, ?, 1, 1)");
  D3._db.exec("BEGIN");
  for (let u = 0; u < 4000; u++) { ap.run(`u${u}`, `T${u}`); for (let j = 0; j < 30; j++) pa.run(`u${u}`, String(1000 + j), (u + j) % 4, (u * j) % 3); }
  D3._db.exec("COMMIT");
  const t0 = performance.now(); await ranking(e3, "u3999", "", ""); const primeira = performance.now() - t0; // soma tudo uma vez
  const t1 = performance.now(); const r = await ranking(e3, "u3999", ""); const depois = performance.now() - t1;
  const t2 = performance.now(); await ranking(e3, "u3999", "", "1000,1001,1002,1003,1004,1005,1006,1007,1008,1009"); const rodada = performance.now() - t2;
  assert.equal(r.total, 4000);
  assert.ok(r.voce.pos >= 1);
  console.log(`   primeira (monta os totais) ${primeira.toFixed(0)} ms · depois ${depois.toFixed(0)} ms · rodada ${rodada.toFixed(0)} ms`);
  assert.ok(depois < primeira, "com os totais prontos o ranking fica mais leve");
});
console.log(`\n${ok} testes do bolão por rodada passaram`);
