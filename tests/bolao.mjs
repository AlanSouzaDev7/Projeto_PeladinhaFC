/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Bolão sem rede: contas com comprovantes do Google assinados na hora, banco D1 simulado (SQLite) com jogos.
   Uso: node tests/bolao.mjs */
import assert from "node:assert/strict";
import worker from "../worker/ao-vivo.mjs";
import { pontos } from "../worker/bolao.mjs";
import { d1Simulado } from "./sim/d1.mjs";

let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };
const CLIENTE = "123-teste.apps.googleusercontent.com";
const par = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", par.publicKey)), kid: "chave-1", alg: "RS256", use: "sig" };
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, init) => (String(url).startsWith("https://www.googleapis.com/oauth2/v3/certs") ? new Response(JSON.stringify({ keys: [jwk] })) : fetchOriginal(url, init));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
async function comprovante(sub) {
  const cab = b64({ alg: "RS256", kid: "chave-1", typ: "JWT" });
  const corpo = b64({ iss: "https://accounts.google.com", aud: CLIENTE, sub, given_name: "X", exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", par.privateKey, new TextEncoder().encode(`${cab}.${corpo}`))).toString("base64url");
  return `${cab}.${corpo}.${sig}`;
}
const DB = d1Simulado(), env = { DB, GOOGLE_CLIENT_ID: CLIENTE };
const pede = async (caminho, { metodo = "GET", corpo, token } = {}) => {
  const r = await worker.fetch(new Request(`https://w.test${caminho}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: token ? { authorization: `Bearer ${token}` } : {} }), env);
  return { status: r.status, ...(await r.json()) };
};
const entra = async (sub) => (await pede("/conta/entrar", { metodo: "POST", corpo: { credential: await comprovante(sub) } })).sessao;

// jogos: um encerrado (para pontuar), um por vir e um que já começou
const dia = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const jogo = (id, data, hora, estado, gc = null, gf = null) => DB._db.prepare(`INSERT INTO jogos (id, liga, competicao, temporada, data, hora, casa_id, casa, fora_id, fora, gols_casa, gols_fora, estado, atualizado)
  VALUES (?, 'bra.1', 'Brasileirão', '2026', ?, ?, 'cruzeiro', 'Cruzeiro', 'atletico-mg', 'Atlético-MG', ?, ?, ?, 1)`).run(id, data, hora, gc, gf, estado);
jogo("900", dia(3), "21:00", "pre");
jogo("901", dia(4), "16:00", "pre");
jogo("902", dia(-1), "16:00", "in");

await t("pontos: exato 10, vencedor e saldo 7, só o resultado 5, errou 0", async () => {
  const p = (casa, fora) => ({ casa, fora });
  assert.equal(pontos(p(2, 1), p(2, 1)), 10);
  assert.equal(pontos(p(2, 1), p(3, 2)), 7);
  assert.equal(pontos(p(2, 1), p(4, 0)), 5);
  assert.equal(pontos(p(1, 1), p(2, 2)), 5); // empate não exato: só o resultado
  assert.equal(pontos(p(0, 1), p(2, 1)), 0);
});

let ana, beto, caio;
await t("sem conta: não palpita; o ranking é público", async () => {
  assert.equal((await pede("/bolao/palpite", { metodo: "PUT", corpo: { jogo: "900", casa: 1, fora: 0 } })).status, 401);
  assert.equal((await pede("/bolao/ranking")).status, 200);
});
await t("apelido: tamanho e caracteres conferidos, e cada um é de um torcedor só", async () => {
  ana = await entra("g-ana"); beto = await entra("g-beto"); caio = await entra("g-caio");
  assert.equal((await pede("/bolao/apelido", { metodo: "PUT", token: ana, corpo: { apelido: "a" } })).status, 400);
  assert.equal((await pede("/bolao/apelido", { metodo: "PUT", token: ana, corpo: { apelido: "<script>" } })).status, 400);
  assert.equal((await pede("/bolao/apelido", { metodo: "PUT", token: ana, corpo: { apelido: "Ana da Raposa" } })).apelido, "Ana da Raposa");
  assert.equal((await pede("/bolao/apelido", { metodo: "PUT", token: beto, corpo: { apelido: "ana da raposa" } })).status, 409);
  await pede("/bolao/apelido", { metodo: "PUT", token: beto, corpo: { apelido: "Beto Galo" } });
  await pede("/bolao/apelido", { metodo: "PUT", token: caio, corpo: { apelido: "Caio" } });
});
await t("palpite: só antes do início, placar de 0 a 20, e dá para mudar até o jogo começar", async () => {
  assert.equal((await pede("/bolao/palpite", { metodo: "PUT", token: ana, corpo: { jogo: "902", casa: 1, fora: 0 } })).status, 409); // já começou
  assert.equal((await pede("/bolao/palpite", { metodo: "PUT", token: ana, corpo: { jogo: "999", casa: 1, fora: 0 } })).status, 404);
  assert.equal((await pede("/bolao/palpite", { metodo: "PUT", token: ana, corpo: { jogo: "900", casa: -1, fora: 0 } })).status, 400);
  assert.equal((await pede("/bolao/palpite", { metodo: "PUT", token: ana, corpo: { jogo: "900", casa: 1.5, fora: 0 } })).status, 400);
  await pede("/bolao/palpite", { metodo: "PUT", token: ana, corpo: { jogo: "900", casa: 1, fora: 0 } });
  await pede("/bolao/palpite", { metodo: "PUT", token: ana, corpo: { jogo: "900", casa: 2, fora: 1 } }); // mudou de ideia
  await pede("/bolao/palpite", { metodo: "PUT", token: beto, corpo: { jogo: "900", casa: 1, fora: 0 } });
  await pede("/bolao/palpite", { metodo: "PUT", token: caio, corpo: { jogo: "900", casa: 0, fora: 2 } });
  await pede("/bolao/palpite", { metodo: "PUT", token: ana, corpo: { jogo: "901", casa: 1, fora: 1 } });
  assert.deepEqual((await pede("/bolao/eu", { token: ana })).palpites.map((p) => [p.jogo, p.casa, p.fora]).sort(), [["900", 2, 1], ["901", 1, 1]]);
});
await t("jogo encerrado: pontos no /eu e ranking geral com posição e empate", async () => {
  DB._db.prepare("UPDATE jogos SET estado = 'post', gols_casa = 2, gols_fora = 1 WHERE id = '900'").run();
  const e = await pede("/bolao/eu", { token: ana });
  assert.equal(e.pontos, 10);
  assert.equal(e.palpites.find((p) => p.jogo === "900").pontos, 10);
  assert.equal(e.palpites.find((p) => p.jogo === "901").pontos, null); // ainda não jogou
  const r = await pede("/bolao/ranking", { token: beto });
  assert.deepEqual(r.linhas.map((x) => [x.pos, x.apelido, x.pontos]), [[1, "Ana da Raposa", 10], [2, "Beto Galo", 7], [3, "Caio", 0]]);
  assert.equal(r.voce.apelido, "Beto Galo");
  assert.ok(!JSON.stringify(r).includes("usuario"), "o código da conta não sai no ranking");
});
let codigo;
await t("liga: criar devolve um código; amigos entram com ele e veem o ranking só da liga", async () => {
  const sem = await entra("g-sem-apelido");
  assert.equal((await pede("/bolao/liga", { metodo: "POST", token: sem, corpo: { nome: "Firma" } })).status, 409); // precisa de apelido
  const c = await pede("/bolao/liga", { metodo: "POST", token: beto, corpo: { nome: "Galera do Trampo" } });
  codigo = c.codigo;
  assert.match(codigo, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal((await pede("/bolao/liga/entrar", { metodo: "POST", token: caio, corpo: { codigo: codigo.toLowerCase() } })).nome, "Galera do Trampo");
  assert.equal((await pede("/bolao/liga/entrar", { metodo: "POST", token: caio, corpo: { codigo: "ZZZZZZ" } })).status, 404);
  const r = await pede(`/bolao/ranking?liga=${codigo}`);
  assert.equal(r.nome, "Galera do Trampo");
  assert.deepEqual(r.linhas.map((x) => x.apelido), ["Beto Galo", "Caio"]); // a Ana não está na liga
  const eu = await pede("/bolao/eu", { token: caio });
  assert.deepEqual(eu.ligas.map((l) => [l.codigo, l.membros, l.dono]), [[codigo, 2, false]]);
});
await t("sair da liga; a última pessoa a sair apaga a liga", async () => {
  await pede("/bolao/liga/sair", { metodo: "POST", token: caio, corpo: { codigo } });
  await pede("/bolao/liga/sair", { metodo: "POST", token: beto, corpo: { codigo } });
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM ligas").get().n, 0);
});
await t("apagar a conta apaga palpites, apelido e ligas do bolão", async () => {
  const c = await pede("/bolao/liga", { metodo: "POST", token: ana, corpo: { nome: "Só eu" } });
  assert.ok(c.codigo);
  assert.equal((await pede("/conta", { metodo: "DELETE", token: ana })).status, 200);
  for (const [tab, n] of [["palpites WHERE usuario NOT IN (SELECT id FROM usuarios)", 0], ["apelidos WHERE apelido = 'Ana da Raposa'", 0], ["ligas", 0]]) {
    assert.equal(DB._db.prepare(`SELECT COUNT(*) n FROM ${tab}`).get().n, n, tab);
  }
});
/* ---------- avisos do bolão: lembrete antes do jogo e pontos ganhos ---------- */
const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
env.VAPID_PRIVADA = JSON.stringify(await crypto.subtle.exportKey("jwk", vapid.privateKey));
env.VAPID_PUBLICA = Buffer.from(await crypto.subtle.exportKey("raw", vapid.publicKey)).toString("base64url");
const { montaAvisos, enviaAvisos } = await import("../worker/bolao-avisos.mjs");
const ap = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/bolao-${n}` });
await t("avisos: ligar exige conta e serviço de push conhecido", async () => {
  assert.equal((await pede("/bolao/avisar", { metodo: "POST", corpo: { sub: ap(1) } })).status, 401);
  assert.equal((await pede("/bolao/avisar", { metodo: "POST", token: caio, corpo: { sub: { endpoint: "https://evil.example/x" } } })).status, 400);
  assert.equal((await pede("/bolao/avisar", { metodo: "POST", token: caio, corpo: { sub: ap("caio") } })).ligado, true);
  assert.equal((await pede("/bolao/avisar", { metodo: "POST", token: beto, corpo: { sub: ap("beto") } })).ligado, true);
});
await t("lembrete: ~1 hora antes do jogo de um favorito, só para quem não palpitou", async () => {
  const agora = Date.now(), ini = new Date(agora + 60 * 60e3 - 3 * 3600e3); // hora de Brasília
  const data = ini.toISOString().slice(0, 10), hora = ini.toISOString().slice(11, 16);
  jogo("903", data, hora, "pre");
  await pede("/conta/dados", { metodo: "PUT", token: caio, corpo: { itens: [{ chave: "placar:favs", dados: '["cruzeiro"]', atualizado: agora - 1000 }] } });
  await pede("/conta/dados", { metodo: "PUT", token: beto, corpo: { itens: [{ chave: "placar:favs", dados: '["cruzeiro"]', atualizado: agora - 1000 }] } });
  await pede("/bolao/palpite", { metodo: "PUT", token: beto, corpo: { jogo: "903", casa: 1, fora: 1 } }); // o Beto já palpitou
  const fim = new Date(agora - 2 * 3600e3 - 3 * 3600e3); // o jogo 900 (encerrado) começou há 2 horas
  DB._db.prepare("UPDATE jogos SET data = ?, hora = ? WHERE id = '900'").run(fim.toISOString().slice(0, 10), fim.toISOString().slice(11, 16));
  await montaAvisos(env, agora);
  const lemb = DB._db.prepare("SELECT id, titulo, url FROM bolao_avisos WHERE id LIKE 'lembrete:%'").all();
  assert.equal(lemb.length, 1);
  assert.match(lemb[0].titulo, /^Falta 1 hora: Cruzeiro x Atlético-MG/);
  assert.equal(lemb[0].url, "#/partida/espn-903");
});
await t("pontos: aviso com o placar e os pontos do palpite (jogo encerrado)", async () => {
  const p = DB._db.prepare("SELECT titulo, corpo FROM bolao_avisos WHERE id LIKE 'pontos:900:%'").all();
  assert.deepEqual(p.map((x) => x.titulo).sort(), ["+7 pontos no bolão", "0 ponto no bolão"]); // Beto 1x0 (saldo), Caio 0x2
  assert.match(p.find((x) => x.titulo.startsWith("+7")).corpo, /Cruzeiro 2 x 1 Atlético-MG · seu palpite: 1 x 0 \(vencedor e saldo\)/);
  const antes = DB._db.prepare("SELECT COUNT(*) n FROM bolao_avisos").get().n;
  await montaAvisos(env); // de novo: nada repetido
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM bolao_avisos").get().n, antes);
});
await t("envio aos aparelhos da conta; o service worker lê só os avisos da conta dele", async () => {
  const chamados = [];
  await enviaAvisos(env, async (url) => { chamados.push(url.slice(-5)); return { ok: true, status: 201 }; });
  assert.deepEqual(chamados.sort(), ["-beto", "-caio", "-caio"]); // Beto: pontos; Caio: lembrete e pontos
  assert.equal(await enviaAvisos(env, async () => ({ ok: true, status: 201 })), 0); // já enviados
  const r = await pede("/bolao/avisos/recentes", { metodo: "POST", corpo: { endpoint: ap("caio").endpoint } });
  assert.equal(r.avisos.length, 2);
  assert.equal((await pede("/bolao/avisos/recentes", { metodo: "POST", corpo: { endpoint: ap("ninguem").endpoint } })).avisos.length, 0);
});
await t("desligar e apagar a conta removem os aparelhos e os avisos", async () => {
  assert.equal((await pede("/bolao/avisar", { metodo: "POST", token: beto, corpo: { sub: ap("beto"), ligar: false } })).ligado, false);
  await pede("/conta", { metodo: "DELETE", token: caio });
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM bolao_push").get().n, 0);
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM bolao_avisos").get().n, 1); // sobra só o do Beto (a conta dele continua)
});
globalThis.fetch = fetchOriginal;
console.log(`\n${ok} testes do bolão passaram`);
