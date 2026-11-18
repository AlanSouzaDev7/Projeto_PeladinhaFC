/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Alerta de gol do favorito sem rede: ESPN simulada, banco D1 simulado (SQLite), serviço de push falso e chaves VAPID
   geradas na hora. Uso: node tests/alertas.mjs */
import assert from "node:assert/strict";
import worker from "../worker/ao-vivo.mjs";
import { verificaGols, enviaPushes, ENVIOS_POR_MINUTO } from "../worker/alertas.mjs";
import { d1Simulado } from "./sim/d1.mjs";

let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };
const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = Buffer.from(await crypto.subtle.exportKey("raw", par.publicKey)).toString("base64url");
const DB = d1Simulado(), env = { DB, VAPID_PRIVADA: JSON.stringify(await crypto.subtle.exportKey("jwk", par.privateKey)), VAPID_PUBLICA: pub };
const req = (caminho, corpo) => worker.fetch(new Request(`https://w.test${caminho}`, corpo === undefined ? {} : { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }), env);
const sub = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/aparelho-${String(n).padStart(3, "0")}`, keys: { p256dh: "x", auth: "y" } });

// ESPN simulada: Cruzeiro x Atlético-MG ao vivo
let placarCasa = 0, placarFora = 0;
const espn = async (url) => ({
  ok: true,
  json: async () => (url.includes("/bra.1/") ? { events: [{ id: "401999001", status: { type: { state: "in" }, displayClock: "23'" }, competitions: [{
    competitors: [{ homeAway: "home", team: { id: "2022", shortDisplayName: "Cruzeiro" }, score: String(placarCasa) },
                  { homeAway: "away", team: { id: "7632", shortDisplayName: "Atlético-MG" }, score: String(placarFora) }],
    details: placarCasa ? [{ scoringPlay: true, team: { id: "2022" }, clock: { displayValue: "23'" }, athletesInvolved: [{ shortName: "Kaio Jorge" }] }] : [] }] }] } : { events: [] }),
});

await t("inscrição: só serviços de push conhecidos e só clubes do site", async () => {
  assert.equal((await req("/alerta", { sub: { endpoint: "https://evil.example/x" }, clubes: ["cruzeiro"] })).status, 400);
  assert.equal((await req("/alerta", "não é json")).status, 400);
  const r = await (await req("/alerta", { sub: sub(1), clubes: ["cruzeiro", "inventado", "flamengo"] })).json();
  assert.deepEqual(r.clubes, ["cruzeiro", "flamengo"]);
  await req("/alerta", { sub: sub(1), clubes: ["cruzeiro"] }); // trocar a lista substitui a anterior
  assert.deepEqual(DB._db.prepare("SELECT clube FROM alertas").all().map((x) => x.clube), ["cruzeiro"]);
});
await t("primeiro placar visto só é guardado (não avisa gol de antes)", async () => {
  placarCasa = 1;
  assert.equal(await verificaGols(env, espn), 0);
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM gols").get().n, 0);
});
await t("gol novo vira aviso com o placar e o autor", async () => {
  placarCasa = 2;
  assert.equal(await verificaGols(env, espn), 1);
  const g = DB._db.prepare("SELECT * FROM gols").get();
  assert.equal(g.clube, "cruzeiro");
  assert.equal(g.titulo, "GOL do Cruzeiro!");
  assert.match(g.corpo, /Cruzeiro 2 x 0 Atlético-MG · Kaio Jorge \(23'\)/);
  assert.equal(await verificaGols(env, espn), 0); // o mesmo placar de novo: nada
});
await t("envio: aviso assinado (VAPID) ao inscrito do clube; inscrição vencida (410) é apagada", async () => {
  await req("/alerta", { sub: sub(2), clubes: ["cruzeiro"] });
  await req("/alerta", { sub: sub(3), clubes: ["flamengo"] }); // segue outro clube: não recebe
  const chamados = [];
  const n = await enviaPushes(env, async (url, init) => { chamados.push([url, init]); return { ok: !url.endsWith("002"), status: url.endsWith("002") ? 410 : 201 }; });
  assert.equal(n, 1);
  assert.deepEqual(chamados.map(([u]) => u.slice(-3)).sort(), ["001", "002"]);
  const auth = chamados[0][1].headers.Authorization;
  assert.match(auth, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
  const [h, p, s] = auth.slice(8, auth.indexOf(",")).split(".");
  const okSig = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, par.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${p}`));
  assert.ok(okSig, "assinatura ES256 válida");
  assert.equal(JSON.parse(Buffer.from(p, "base64url")).aud, "https://fcm.googleapis.com");
  assert.equal(chamados[0][1].headers["Content-Length"], "0"); // aviso sem conteúdo
  assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM alertas WHERE endpoint LIKE '%002'").get().n, 0);
  assert.equal(DB._db.prepare("SELECT cursor FROM gols").get().cursor, "fim");
});
await t(`muitos inscritos: ${ENVIOS_POR_MINUTO} por minuto, o resto no minuto seguinte`, async () => {
  for (let i = 10; i < 10 + ENVIOS_POR_MINUTO + 5; i++) await req("/alerta", { sub: sub(i), clubes: ["atletico-mg"] });
  placarFora = 1;
  assert.equal(await verificaGols(env, espn), 1);
  const fake = async () => ({ ok: true, status: 201 });
  assert.equal(await enviaPushes(env, fake), ENVIOS_POR_MINUTO);
  assert.equal(await enviaPushes(env, fake), 5);
  assert.equal(await enviaPushes(env, fake), 0);
});
await t("o service worker lê os gols recentes; a chave pública fica disponível", async () => {
  const d = await (await req("/gols/recentes")).json();
  assert.deepEqual(d.gols.map((g) => g.clube).sort(), ["atletico-mg", "cruzeiro"]);
  assert.equal((await (await req("/alerta/chave")).json()).chave, pub);
});
console.log(`\n${ok} testes do alerta de gol passaram`);
