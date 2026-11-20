/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Voz da torcida sem rede: banco D1 simulado e elenco da ESPN simulado. Uso: node tests/torcida.mjs */
import assert from "node:assert/strict";
import worker from "../worker/ao-vivo.mjs";
import { vota } from "../worker/torcida.mjs";
import { d1Simulado } from "./sim/d1.mjs";

let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };
const DB = d1Simulado(), env = { DB };
const brt = (ms) => { const d = new Date(ms - 3 * 3600e3).toISOString(); return [d.slice(0, 10), d.slice(11, 16)]; };
const jogo = (id, ini, estado) => DB._db.prepare(`INSERT INTO jogos (id, liga, competicao, temporada, data, hora, casa_id, casa, fora_id, fora, estado, atualizado)
  VALUES (?, 'bra.1', 'Brasileirão', '2026', ?, ?, 'sao-paulo', 'São Paulo', 'fluminense', 'Fluminense', ?, 1)`).run(id, ...brt(ini), estado);
const agora = Date.now();
jogo("801", agora + 3 * 3600e3, "pre"); // ainda vai começar
jogo("802", agora - 3600e3, "in"); // rolando
jogo("803", agora - 20 * 3600e3, "post"); // acabou faz tempo
const espn = async () => ({ ok: true, json: async () => ({ rosters: [
  { team: { id: "2026", shortDisplayName: "São Paulo" }, roster: [{ starter: true, athlete: { id: "319168", shortName: "Pablo Maia" } }, { starter: false, subbedIn: false, athlete: { id: "999", shortName: "Reserva" } }] },
  { team: { id: "3445", shortDisplayName: "Fluminense" }, roster: [{ starter: true, athlete: { id: "200", shortName: "Ganso" } }] },
] }) });
const voto = (corpo, ip = "1.1.1.1", quando = agora) => vota(env, JSON.stringify(corpo), ip, espn, quando);
const disp = (n) => `aparelho-${String(n).padStart(12, "0")}`;

await t("quem vence: só antes do jogo, escolha 1, X ou 2; trocar o voto não duplica", async () => {
  assert.equal((await voto({ jogo: "801", tipo: "vencedor", escolha: "1", dispositivo: disp(1) })).status, 200);
  await voto({ jogo: "801", tipo: "vencedor", escolha: "X", dispositivo: disp(1) }); // mudou de ideia
  await voto({ jogo: "801", tipo: "vencedor", escolha: "2", dispositivo: disp(2) });
  assert.equal((await voto({ jogo: "801", tipo: "vencedor", escolha: "Y", dispositivo: disp(3) })).status, 400);
  assert.equal((await voto({ jogo: "802", tipo: "vencedor", escolha: "1", dispositivo: disp(3) })).status, 409); // já começou
  const r = await (await worker.fetch(new Request("https://w.test/torcida/801"), env)).json();
  assert.deepEqual(r.vencedor, { 1: 0, X: 1, 2: 1 });
  assert.equal(r.totalVencedor, 2);
});
await t("craque: só com o jogo rolando ou até 8 horas depois, e só quem entrou em campo", async () => {
  assert.equal((await voto({ jogo: "801", tipo: "craque", escolha: "319168", dispositivo: disp(1) })).status, 409); // não começou
  assert.equal((await voto({ jogo: "803", tipo: "craque", escolha: "319168", dispositivo: disp(1) })).status, 409); // fechou
  assert.equal((await voto({ jogo: "802", tipo: "craque", escolha: "999", dispositivo: disp(1) })).status, 400); // não jogou
  assert.equal((await voto({ jogo: "802", tipo: "craque", escolha: "319168", dispositivo: disp(1) })).status, 200);
  const r = await voto({ jogo: "802", tipo: "craque", escolha: "200", dispositivo: disp(2) });
  assert.deepEqual(r.craque.map((x) => [x.nome, x.clube, x.votos]).sort(), [["Ganso", "fluminense", 1], ["Pablo Maia", "sao-paulo", 1]]);
});
await t("o nome do jogador vem do elenco oficial, nunca do navegador", async () => {
  await voto({ jogo: "802", tipo: "craque", escolha: "200", dispositivo: disp(5), nome: "<b>Inventado</b>" });
  assert.ok(!JSON.stringify(DB._db.prepare("SELECT nome FROM torcida_votos").all()).includes("Inventado"));
});
await t("limite por conexão: no máximo 6 aparelhos por jogo; o IP não fica guardado", async () => {
  for (let i = 10; i < 16; i++) assert.equal((await voto({ jogo: "801", tipo: "vencedor", escolha: "1", dispositivo: disp(i) }, "9.9.9.9")).status, 200);
  assert.equal((await voto({ jogo: "801", tipo: "vencedor", escolha: "1", dispositivo: disp(99) }, "9.9.9.9")).status, 429);
  assert.equal((await voto({ jogo: "801", tipo: "vencedor", escolha: "2", dispositivo: disp(10) }, "9.9.9.9")).status, 200); // trocar o próprio voto continua valendo
  assert.ok(!JSON.stringify(DB._db.prepare("SELECT * FROM torcida_votos").all()).includes("9.9.9.9"));
});
await t("pedido malformado é recusado", async () => {
  assert.equal((await voto({ jogo: "abc", tipo: "vencedor", escolha: "1", dispositivo: disp(1) })).status, 400);
  assert.equal((await voto({ jogo: "801", tipo: "vencedor", escolha: "1", dispositivo: "x" })).status, 400);
  assert.equal((await voto({ jogo: "777", tipo: "vencedor", escolha: "1", dispositivo: disp(1) })).status, 404);
});
/* ---------- saúde do sistema (GET /status) ---------- */
const { batimento } = await import("../worker/status.mjs");
const arquivo = (nome, quando) => DB._db.prepare("INSERT OR REPLACE INTO arquivos (nome, hash, quando, tamanho, dados) VALUES (?, 'h', ?, 2, '{}')").run(nome, quando);
await t("status: tudo em dia fica verde; robô parado há 2 horas fica fora do ar", async () => {
  arquivo("meta", agora - 3 * 60e3); arquivo("live-data", agora - 10 * 60e3);
  await batimento(env, "cron", agora - 2 * 60e3);
  let s = await (await worker.fetch(new Request("https://w.test/status"), env)).json();
  assert.equal(s.geral, "ok");
  assert.deepEqual(s.itens.map((i) => [i.id, i.estado]), [["robo", "ok"], ["agendador", "ok"], ["placar", "ok"], ["banco", "ok"]]);
  arquivo("meta", agora - 2 * 3600e3);
  s = await (await worker.fetch(new Request("https://w.test/status"), env)).json();
  assert.equal(s.geral, "fora");
  assert.equal(s.itens.find((i) => i.id === "robo").estado, "fora");
  assert.ok(s.itens.every((i) => !("dados" in i) && !("hash" in i)), "o status não expõe conteúdo, só horários");
});
console.log(`\n${ok} testes da voz da torcida e do status passaram`);
