/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Conta com Google e sincronização, sem rede: comprovantes do Google assinados com uma chave RSA gerada na hora,
   chaves públicas do Google simuladas e banco D1 simulado (SQLite). Uso: node tests/conta.mjs */
import assert from "node:assert/strict";
import worker from "../worker/ao-vivo.mjs";
import { d1Simulado } from "./sim/d1.mjs";

let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };
const CLIENTE = "123-teste.apps.googleusercontent.com";
const par = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", par.publicKey)), kid: "chave-1", alg: "RS256", use: "sig" };
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, init) => (String(url).startsWith("https://www.googleapis.com/oauth2/v3/certs") ? new Response(JSON.stringify({ keys: [jwk] })) : fetchOriginal(url, init));
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
async function comprovante(mudar = {}, chave = par.privateKey) {
  const cab = b64({ alg: "RS256", kid: "chave-1", typ: "JWT" });
  const corpo = b64({ iss: "https://accounts.google.com", aud: CLIENTE, sub: "1098765", given_name: "Alan", picture: "https://lh3.googleusercontent.com/a/foto", exp: Math.floor(Date.now() / 1000) + 3600, ...mudar });
  const sig = Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(`${cab}.${corpo}`))).toString("base64url");
  return `${cab}.${corpo}.${sig}`;
}
const DB = d1Simulado(), env = { DB, GOOGLE_CLIENT_ID: CLIENTE };
const pede = (caminho, { metodo = "GET", corpo, token } = {}) =>
  worker.fetch(new Request(`https://w.test${caminho}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: token ? { authorization: `Bearer ${token}` } : {} }), env);

let sessao;
await t("entrar com um comprovante válido do Google cria a sessão (sem guardar e-mail, nome ou foto)", async () => {
  const r = await (await pede("/conta/entrar", { metodo: "POST", corpo: { credential: await comprovante() } })).json();
  assert.equal(r.ok, true); assert.equal(r.nome, "Alan"); assert.match(r.sessao, /^[\w-]{40,}$/);
  sessao = r.sessao;
  const u = DB._db.prepare("SELECT * FROM usuarios").get();
  assert.ok(!JSON.stringify(u).includes("1098765"), "o id do Google não fica guardado em claro");
  assert.ok(!JSON.stringify(DB._db.prepare("SELECT * FROM sessoes").get()).includes(sessao), "o token não fica guardado em claro");
});
await t("comprovante recusado: outro site, vencido, assinatura falsa ou emissor errado", async () => {
  const outra = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
  for (const c of [await comprovante({ aud: "outro.apps.googleusercontent.com" }), await comprovante({ exp: 1000 }), await comprovante({}, outra.privateKey), await comprovante({ iss: "evil.example" }), "a.b.c"]) {
    assert.equal((await pede("/conta/entrar", { metodo: "POST", corpo: { credential: c } })).status, 401);
  }
});
await t("sem sessão válida, nada de dados", async () => {
  assert.equal((await pede("/conta/dados")).status, 401);
  assert.equal((await pede("/conta/dados", { token: "x".repeat(43) })).status, 401);
});
await t("sincronização: grava, lê de volta e em cada item vale o mais recente", async () => {
  const agora = Date.now();
  let r = await pede("/conta/dados", { metodo: "PUT", token: sessao, corpo: { itens: [
    { chave: "placar:favs", dados: '["cruzeiro"]', atualizado: agora - 5000 },
    { chave: "placar:janela-cruzeiro", dados: '{"saem":[1]}', atualizado: agora - 5000 },
  ] } });
  assert.equal(r.status, 200);
  await pede("/conta/dados", { metodo: "PUT", token: sessao, corpo: { itens: [{ chave: "placar:favs", dados: '["velho"]', atualizado: agora - 9000 }] } }); // mais antigo: ignorado
  await pede("/conta/dados", { metodo: "PUT", token: sessao, corpo: { itens: [{ chave: "placar:janela-cruzeiro", dados: null, atualizado: agora - 1000 }] } }); // apagado depois
  const d = await (await pede("/conta/dados", { token: sessao })).json();
  const m = Object.fromEntries(d.itens.map((x) => [x.chave, x.dados]));
  assert.equal(m["placar:favs"], '["cruzeiro"]');
  assert.equal(m["placar:janela-cruzeiro"], null);
});
await t("só as chaves de conteúdo do torcedor, com limite de tamanho", async () => {
  const agora = Date.now();
  for (const it of [{ chave: "placar:data", dados: "x", atualizado: agora }, { chave: "outra", dados: "x", atualizado: agora },
    { chave: "placar:favs", dados: "x".repeat(20000), atualizado: agora }, { chave: "placar:favs", dados: "[]", atualizado: agora + 3600e3 }]) {
    assert.notEqual((await pede("/conta/dados", { metodo: "PUT", token: sessao, corpo: { itens: [it] } })).status, 200, it.chave);
  }
});
await t("sair encerra só esta sessão; apagar a conta remove tudo", async () => {
  const outra = (await (await pede("/conta/entrar", { metodo: "POST", corpo: { credential: await comprovante() } })).json()).sessao;
  assert.equal((await pede("/conta/sair", { metodo: "POST", token: sessao })).status, 200);
  assert.equal((await pede("/conta/dados", { token: sessao })).status, 401);
  assert.equal((await pede("/conta/dados", { token: outra })).status, 200); // o outro aparelho continua
  assert.equal((await pede("/conta", { metodo: "DELETE", token: outra })).status, 200);
  for (const tab of ["usuarios", "sessoes", "salvos"]) assert.equal(DB._db.prepare(`SELECT COUNT(*) n FROM ${tab}`).get().n, 0, tab);
});
await t("CORS: o navegador pode mandar o cabeçalho Authorization e usar PUT/DELETE", async () => {
  const r = await worker.fetch(new Request("https://w.test/conta/dados", { method: "OPTIONS" }), env);
  assert.match(r.headers.get("access-control-allow-headers"), /authorization/);
  assert.match(r.headers.get("access-control-allow-methods"), /PUT/);
});
await t("app Android: entrar no navegador e trocar o código de uso único pela sessão (com o verificador do app)", async () => {
  const b64u = (buf) => Buffer.from(buf).toString("base64url");
  const verificador = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const desafio = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
  const r1 = await (await pede("/conta/entrar-app", { metodo: "POST", corpo: { credential: await comprovante(), desafio } })).json();
  assert.equal(r1.ok, true); assert.match(r1.codigo, /^[\w-]{30,}$/);
  assert.equal(r1.sessao, undefined, "o navegador não recebe a sessão, só o código");
  // outro app que pegue o código sem o verificador não entra, e o código morre
  const outro = b64u(crypto.getRandomValues(new Uint8Array(32)));
  assert.equal((await pede("/conta/troca", { metodo: "POST", corpo: { codigo: r1.codigo, verificador: outro } })).status, 401);
  assert.equal((await pede("/conta/troca", { metodo: "POST", corpo: { codigo: r1.codigo, verificador } })).status, 401, "uso único");
  // fluxo certo
  const r2 = await (await pede("/conta/entrar-app", { metodo: "POST", corpo: { credential: await comprovante(), desafio } })).json();
  const r3 = await (await pede("/conta/troca", { metodo: "POST", corpo: { codigo: r2.codigo, verificador } })).json();
  assert.equal(r3.ok, true); assert.equal(r3.nome, "Alan");
  assert.equal((await pede("/conta/dados", { token: r3.sessao })).status, 200, "a sessão do app funciona na API");
  assert.equal((await pede("/conta/troca", { metodo: "POST", corpo: { codigo: r2.codigo, verificador } })).status, 401, "não troca duas vezes");
  // código vencido e desafio malformado
  const r4 = await (await pede("/conta/entrar-app", { metodo: "POST", corpo: { credential: await comprovante(), desafio } })).json();
  DB._db.prepare("UPDATE conta_trocas SET expira = 1").run();
  assert.equal((await pede("/conta/troca", { metodo: "POST", corpo: { codigo: r4.codigo, verificador } })).status, 401);
  assert.equal((await pede("/conta/entrar-app", { metodo: "POST", corpo: { credential: await comprovante(), desafio: "curto" } })).status, 400);
  assert.equal((await pede("/conta/entrar-app", { metodo: "POST", corpo: { credential: "falso", desafio } })).status, 401);
});
globalThis.fetch = fetchOriginal;
console.log(`\n${ok} testes da conta passaram`);
