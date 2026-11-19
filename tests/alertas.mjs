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
/* ---------- mais alertas do favorito: início, intervalo, escalação e fim ---------- */
const DB2 = d1Simulado(), env2 = { ...env, DB: DB2 };
const req2 = (caminho, corpo) => worker.fetch(new Request(`https://w.test${caminho}`, { method: "POST", body: JSON.stringify(corpo) }), env2);
const INICIO = Date.parse("2026-11-22T21:30:00Z");
let est = { state: "pre", name: "STATUS_SCHEDULED" }, gc = 0, gf = 0, titulares = 0;
const espn2 = async (url) => ({
  ok: true,
  json: async () => {
    if (url.includes("/summary")) {
      const r = (id, ha, pref) => ({ homeAway: ha, team: { id }, roster: Array.from({ length: 18 }, (_, i) => ({ starter: i < titulares, athlete: { shortName: `${pref} ${i + 1}` } })) });
      return { rosters: [r("2026", "home", "SP"), r("2029", "away", "PAL")] };
    }
    return url.includes("/bra.1/") ? { events: [{ id: "401999777", date: "2026-11-22T21:30Z", status: { type: est, displayClock: "" }, competitions: [{
      competitors: [{ homeAway: "home", team: { id: "2026", shortDisplayName: "São Paulo" }, score: String(gc) },
                    { homeAway: "away", team: { id: "2029", shortDisplayName: "Palmeiras" }, score: String(gf) }], details: [] }] }] } : { events: [] };
  },
});
const avisos = () => DB2._db.prepare("SELECT tipo, clube, titulo, corpo FROM gols ORDER BY rowid").all();

await t("inscrição guarda os tipos escolhidos; site antigo (sem tipos) continua só com gol", async () => {
  assert.deepEqual((await (await req2("/alerta", { sub: sub(501), clubes: ["sao-paulo"], tipos: ["fim", "inicio", "inventado", "escalacao"] })).json()).tipos, ["inicio", "escalacao", "fim"]);
  await req2("/alerta", { sub: sub(502), clubes: ["sao-paulo"] });
  assert.equal(DB2._db.prepare("SELECT tipos FROM alertas WHERE endpoint LIKE '%502'").get().tipos, "gol");
  assert.equal((await req2("/alerta", { sub: sub(503), clubes: ["sao-paulo"], tipos: [] })).status, 400);
  await req2("/alerta", { sub: sub(504), clubes: ["palmeiras"], tipos: ["gol", "intervalo", "fim"] });
});
await t("escalação: só a partir de 75 min antes, uma vez por clube, e só para quem quer esse aviso", async () => {
  await verificaGols(env2, espn2, INICIO - 3 * 3600e3); // primeiro estado visto: só guarda
  titulares = 11;
  await verificaGols(env2, espn2, INICIO - 2 * 3600e3); // longe do jogo: nem procura
  assert.equal(avisos().length, 0);
  await verificaGols(env2, espn2, INICIO - 60 * 60e3);
  const a = avisos();
  assert.deepEqual(a.map((x) => [x.tipo, x.clube]), [["escalacao", "sao-paulo"]]); // Palmeiras: inscrito não quer escalação
  assert.equal(a[0].titulo, "Escalação do São Paulo");
  assert.match(a[0].corpo, /^x Palmeiras, 18:30: SP 1, SP 2, .*SP 11$/);
  await verificaGols(env2, espn2, INICIO - 50 * 60e3);
  assert.equal(avisos().length, 1);
});
await t("início, gol, intervalo e fim viram avisos com o resultado de cada lado", async () => {
  est = { state: "in", name: "STATUS_FIRST_HALF" };
  await verificaGols(env2, espn2, INICIO + 60e3);
  gf = 1;
  await verificaGols(env2, espn2, INICIO + 20 * 60e3);
  est = { state: "in", name: "STATUS_HALFTIME" };
  await verificaGols(env2, espn2, INICIO + 50 * 60e3);
  est = { state: "post", name: "STATUS_FULL_TIME" }; gc = 1;
  await verificaGols(env2, espn2, INICIO + 115 * 60e3);
  const por = Object.fromEntries(avisos().map((x) => [`${x.tipo}:${x.clube}`, x]));
  assert.equal(por["inicio:sao-paulo"].titulo, "Começou: São Paulo x Palmeiras");
  assert.equal(por["inicio:sao-paulo"].corpo, "Bola rolando · Brasileirão");
  assert.equal(por["intervalo:palmeiras"].corpo, "Palmeiras vence no 1º tempo");
  assert.equal(por["intervalo:sao-paulo"].corpo, "São Paulo perde no 1º tempo");
  assert.equal(por["fim:sao-paulo"].titulo, "Fim de jogo: São Paulo 1 x 1 Palmeiras");
  assert.equal(por["fim:palmeiras"].corpo, "Empate · Brasileirão");
  assert.ok(por["gol:palmeiras"] && por["gol:sao-paulo"]);
});
await t("envio: cada aviso só vai para quem escolheu aquele tipo", async () => {
  const recebidos = {};
  await enviaPushes(env2, async (url) => { recebidos[url.slice(-3)] = (recebidos[url.slice(-3)] || 0) + 1; return { ok: true, status: 201 }; });
  // 501 (São Paulo: escalação, início, fim) = 3; 502 (São Paulo, só gol) = 1; 504 (Palmeiras: gol, intervalo, fim) = 3
  assert.deepEqual(recebidos, { 501: 3, 502: 1, 504: 3 });
});
console.log(`\n${ok} testes do alerta de gol passaram`);
