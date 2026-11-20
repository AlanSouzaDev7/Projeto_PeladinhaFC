/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Painel do dono e visitas anônimas, sem rede: contas com comprovantes do Google assinados na hora e D1 simulado.
   Uso: node tests/painel.mjs */
import assert from "node:assert/strict";
import worker from "../worker/ao-vivo.mjs";
import { _visitas } from "../worker/painel.mjs";
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
  const corpo = b64({ iss: "https://accounts.google.com", aud: CLIENTE, sub, exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", par.privateKey, new TextEncoder().encode(`${cab}.${corpo}`))).toString("base64url");
  return `${cab}.${corpo}.${sig}`;
}
const DB = d1Simulado(), env = { DB, GOOGLE_CLIENT_ID: CLIENTE, DONOS: "" };
const pede = async (caminho, { metodo = "GET", corpo, token } = {}) => {
  const r = await worker.fetch(new Request(`https://w.test${caminho}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: token ? { authorization: `Bearer ${token}` } : {} }), env);
  return { status: r.status, ...(r.status === 204 ? {} : await r.json()) };
};
const entra = async (sub) => (await pede("/conta/entrar", { metodo: "POST", corpo: { credential: await comprovante(sub) } })).sessao;

let dono, fa;
await t("sem conta: 401; conta comum: 403; /painel/eu mostra o código para pôr em DONOS", async () => {
  dono = await entra("g-dono"); fa = await entra("g-torcedor");
  assert.equal((await pede("/painel")).status, 401);
  const eu = await pede("/painel/eu", { token: dono });
  assert.match(eu.codigo, /^[\w-]{40,}$/);
  assert.equal(eu.dono, false);
  env.DONOS = `outro-codigo, ${eu.codigo}`;
  assert.equal((await pede("/painel", { token: fa })).status, 403);
  assert.equal((await pede("/painel/eu", { token: dono })).dono, true);
});
await t("visitas: só tipos de página conhecidos, somadas por dia, sem guardar quem visitou", async () => {
  _visitas.reset();
  for (const rota of ["inicio", "inicio", "clube:cruzeiro", "jogo", "<script>", "clube:../../x"]) await pede("/visita", { metodo: "POST", corpo: { rota } });
  const p = await pede("/painel", { token: dono });
  const m = Object.fromEntries(p.trafego.porRota.map((r) => [r.rota, r.n]));
  assert.deepEqual(m, { inicio: 2, "clube:cruzeiro": 1, jogo: 1 });
  assert.equal(p.trafego.hoje, 4);
  assert.equal(p.trafego.tempoReal.reduce((s, x) => s + x.paginas, 0), 4, "tempo real conta as páginas do minuto");
  assert.deepEqual(Object.keys(DB._db.prepare("SELECT * FROM visitas LIMIT 1").get()).sort(), ["dia", "n", "rota"]);
});
await t("uso das funções, abas, aparelho e origem (primeira página), widgets e os sites que colaram", async () => {
  for (const corpo of [{ rota: "uso:compartilhar" }, { rota: "uso:compartilhar" }, { rota: "aba:historico" }, { rota: "uso:inventado" },
    { rota: "jogo", primeira: true, ref: "https://www.google.com/" }, { rota: "jogo", primeira: true, ref: "https://l.instagram.com/x" }, { rota: "jogo", app: true },
    { rota: "widget:tabela", site: "blog-do-torcedor.com.br" }, { rota: "widget:tabela", site: "<script>" }]) await pede("/visita", { metodo: "POST", corpo });
  const p = await pede("/painel", { token: dono });
  const mapa = (l) => Object.fromEntries(l.map((x) => [x.chave, x.n]));
  assert.deepEqual(mapa(p.uso.funcoes), { compartilhar: 2 });
  assert.deepEqual(mapa(p.uso.abas), { historico: 1 });
  assert.deepEqual(mapa(p.publico.origens), { google: 1, "redes-sociais": 1 });
  assert.equal(mapa(p.publico.aparelhos).app, 1);
  assert.deepEqual(mapa(p.uso.sitesComWidget), { "blog-do-torcedor.com.br": 1 });
});
await t("segurança: varredura, login inválido e admin negado viram eventos, com origem anônima", async () => {
  for (const c of ["/wp-admin/setup.php", "/.env", "/phpmyadmin"]) await worker.fetch(new Request(`https://w.test${c}`, { headers: { "cf-connecting-ip": "203.0.113.9" } }), env);
  await worker.fetch(new Request("https://w.test/conta/entrar", { method: "POST", body: JSON.stringify({ credential: "a.b.c" }), headers: { "cf-connecting-ip": "203.0.113.9" } }), env);
  await pede("/painel", { token: fa }); // conta comum: negado
  const p = await pede("/painel", { token: dono });
  const tipos = Object.fromEntries(p.seguranca.tipos24h.map((x) => [x.tipo, x.n]));
  assert.equal(tipos.varredura, 3);
  assert.equal(tipos["login-invalido"], 1);
  assert.ok(tipos["admin-negado"] >= 1);
  const o = p.seguranca.origens.find((x) => x.n >= 4);
  assert.match(o.origem, /^[0-9a-f]{10}$/);
  assert.ok(!JSON.stringify(p).includes("203.0.113.9"), "o IP não aparece nem fica guardado");
  assert.ok(!JSON.stringify(DB._db.prepare("SELECT * FROM seguranca").all()).includes("203.0.113.9"));
});
await t("painel: contas, alertas por clube, bolão e torcida somados (sem dado de pessoa)", async () => {
  DB._db.prepare("INSERT INTO alertas (endpoint, clube, criado, tipos) VALUES ('https://fcm.googleapis.com/a', 'cruzeiro', 1, 'gol'), ('https://fcm.googleapis.com/b', 'cruzeiro', 1, 'gol'), ('https://fcm.googleapis.com/b', 'bahia', 1, 'gol')").run();
  DB._db.prepare("INSERT INTO torcida_votos (jogo, tipo, votante, conexao, escolha, quando) VALUES ('1', 'vencedor', 'v1', 'c1', '1', ?)").run(Date.now());
  const p = await pede("/painel", { token: dono });
  assert.equal(p.contas.total, 2);
  assert.equal(p.contas.ativos7, 2);
  assert.equal(p.alertas.aparelhos, 2);
  assert.deepEqual(p.alertas.porClube[0], { clube: "cruzeiro", n: 2 });
  assert.equal(p.torcida.votos, 1);
  assert.ok(!JSON.stringify(p).includes("fcm.googleapis.com"), "nenhum endereço de aparelho no painel");
});
globalThis.fetch = fetchOriginal;
console.log(`\n${ok} testes do painel passaram`);
