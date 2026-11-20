/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Proteção contra abuso sem rede: limite de pedidos (contador na memória, sem o limitador da Cloudflare),
   bloqueio automático de origem insistente e desbloqueio pela administração. Uso: node tests/protecao.mjs */
import assert from "node:assert/strict";
import worker from "../worker/ao-vivo.mjs";
import { LIMITES, BLOQUEIO_TENTATIVAS, _protecao } from "../worker/protecao.mjs";
import { _visitas, gravaPendentes } from "../worker/painel.mjs";
import { d1Simulado } from "./sim/d1.mjs";

let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };
const CLIENTE = "123-teste.apps.googleusercontent.com", ROBO = "r".repeat(40);
const par = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", par.publicKey)), kid: "chave-1", alg: "RS256", use: "sig" };
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, init) => (String(url).startsWith("https://www.googleapis.com/oauth2/v3/certs") ? new Response(JSON.stringify({ keys: [jwk] })) : fetchOriginal(url, init));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
async function comprovante(sub) {
  const cab = b64({ alg: "RS256", kid: "chave-1", typ: "JWT" }), corpo = b64({ iss: "https://accounts.google.com", aud: CLIENTE, sub, exp: Math.floor(Date.now() / 1000) + 3600 });
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", par.privateKey, new TextEncoder().encode(`${cab}.${corpo}`))).toString("base64url");
  return `${cab}.${corpo}.${sig}`;
}
const DB = d1Simulado(), env = { DB, GOOGLE_CLIENT_ID: CLIENTE, ROBO_CHAVE: ROBO, DONOS: "" };
const pede = (caminho, { ip = "198.51.100.7", metodo = "GET", corpo, token } = {}) => worker.fetch(new Request(`https://w.test${caminho}`, {
  method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { "cf-connecting-ip": ip, ...(token ? { authorization: `Bearer ${token}` } : {}) } }), env);

await t(`limite de escrita: o pedido ${LIMITES.escrita + 1} no mesmo minuto recebe 429, com Retry-After`, async () => {
  _protecao.reset(); _visitas.reset();
  let ultimo;
  for (let i = 0; i <= LIMITES.escrita; i++) ultimo = await pede("/busca", { metodo: "POST", corpo: { t: "c", id: "cruzeiro" } });
  assert.equal(ultimo.status, 429);
  assert.equal(ultimo.headers.get("retry-after"), "60");
  assert.notEqual((await pede("/busca", { ip: "198.51.100.8", metodo: "POST", corpo: { t: "c", id: "cruzeiro" } })).status, 429, "outra origem continua normal");
});
await t("o robô com a chave nunca é limitado", async () => {
  _protecao.reset();
  for (let i = 0; i <= LIMITES.escrita + 5; i++) {
    const r = await worker.fetch(new Request("https://w.test/dados/_lista", { headers: { "cf-connecting-ip": "203.0.113.50", authorization: `Bearer ${ROBO}` } }), env);
    assert.notEqual(r.status, 429);
  }
});
let dono;
await t(`bloqueio automático: ${BLOQUEIO_TENTATIVAS} varreduras em 1 hora bloqueiam a origem por 24 h (403)`, async () => {
  _protecao.reset(); _visitas.reset();
  for (let i = 0; i < BLOQUEIO_TENTATIVAS; i++) await pede(`/wp-admin/x${i}.php`, { ip: "192.0.2.66" });
  await gravaPendentes(env, true); // força a gravação do lote (no Worker, no máximo 1 vez por minuto)
  const r = await pede("/dados/meta", { ip: "192.0.2.66" });
  assert.equal(r.status, 403);
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM bloqueios").get().n, 1);
  assert.notEqual((await pede("/dados/meta", { ip: "192.0.2.77" })).status, 403, "outra origem continua normal");
});
await t("a administração continua acessível e o dono desbloqueia", async () => {
  dono = (await (await pede("/conta/entrar", { ip: "192.0.2.10", metodo: "POST", corpo: { credential: await comprovante("g-dono") } })).json()).sessao;
  env.DONOS = (await (await pede("/painel/eu", { ip: "192.0.2.10", token: dono })).json()).codigo;
  const p = await (await pede("/painel", { ip: "192.0.2.10", token: dono })).json();
  assert.equal(p.seguranca.bloqueios.length, 1);
  const origem = p.seguranca.bloqueios[0].origem;
  assert.match(origem, /^[0-9a-f]{10}$/);
  assert.equal((await pede("/painel/desbloquear", { ip: "192.0.2.10", metodo: "POST", corpo: { origem }, token: dono })).status, 200);
  assert.notEqual((await pede("/dados/meta", { ip: "192.0.2.66" })).status, 403, "desbloqueado");
  assert.equal((await pede("/painel/desbloquear", { ip: "192.0.2.10", metodo: "POST", corpo: { origem: "x" }, token: dono })).status, 400);
});
await t("conta comum não desbloqueia nada", async () => {
  const outra = (await (await pede("/conta/entrar", { ip: "192.0.2.11", metodo: "POST", corpo: { credential: await comprovante("g-outro") } })).json()).sessao;
  assert.equal((await pede("/painel/desbloquear", { ip: "192.0.2.11", metodo: "POST", corpo: { origem: "0123456789" }, token: outra })).status, 403);
});
globalThis.fetch = fetchOriginal;
console.log(`\n${ok} testes da proteção passaram`);
