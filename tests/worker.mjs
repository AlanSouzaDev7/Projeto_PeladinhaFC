/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* Testa o Worker da API-Football sem chave real: a API é simulada.
   Uso: node tests/worker.mjs */
import assert from "node:assert/strict";
import worker, { normalize, clubOf } from "../worker/ao-vivo.mjs";
import { apiFootballFixture, AF_ID } from "./sim/jogo.mjs";

let ok = 0;
const t = (nome, fn) => Promise.resolve(fn()).then(() => { ok++; console.log("✓", nome); });

await t("nomes da API-Football viram os clubes do site", () => {
  assert.equal(clubOf("Atletico-MG"), "atletico-mg");
  assert.equal(clubOf("Athletico Paranaense"), "athletico-pr");
  assert.equal(clubOf("Sao Paulo"), "sao-paulo");
  assert.equal(clubOf("São Paulo"), "sao-paulo");
  assert.equal(clubOf("Vasco DA Gama"), "vasco");
  assert.equal(clubOf("RB Bragantino"), "bragantino");
  assert.equal(clubOf("Vitoria"), "vitoria");
  assert.equal(clubOf("Botafogo SP"), null); // outro clube
  assert.equal(clubOf("Santos Laguna"), null);
});

const kick = Date.now() - 60e3;
// entre 0h e 3h (Brasília) o Worker também lê a lista de ontem
const LISTAS = new Date(Date.now() - 3 * 3600e3).getUTCHours() < 3 ? 2 : 1;
await t("antes do jogo", () => {
  const g = normalize(apiFootballFixture(-5, kick));
  assert.deepEqual([g.home, g.away, g.state, g.hs, g.as, g.events.length], ["cruzeiro", "flamengo", "pre", null, null, 0]);
});
await t("1º tempo com gol: placar, relógio e lances", () => {
  const g = normalize(apiFootballFixture(30, kick));
  assert.equal(g.state, "in"); assert.equal(g.hs, 1); assert.equal(g.as, 0); assert.match(g.clock, /^\d+'$/);
  assert.deepEqual(g.events.map((e) => e.kind), ["kickoff", "goal"]);
  assert.equal(g.events[1].for, "home"); assert.equal(g.events[1].assist, "Camisa 10");
});
await t("intervalo aparece como Intervalo", () => {
  const g = normalize(apiFootballFixture(70, kick));
  assert.equal(g.clock, "Intervalo"); assert.equal(g.events.at(-1).kind, "halftime");
});
await t("fim de jogo: placar final e ordem dos lances", () => {
  const g = normalize(apiFootballFixture(170, kick));
  assert.equal(g.state, "post"); assert.equal(`${g.hs}x${g.as}`, "2x1");
  assert.deepEqual(g.events.map((e) => e.kind), ["kickoff", "goal", "yellow", "halftime", "second-half", "sub", "goal", "red", "penalty-goal", "full-time"]);
});
await t("gol contra é creditado a quem ganhou o gol", () => {
  const f = apiFootballFixture(170, kick);
  f.events.push({ time: { elapsed: 90, extra: 3 }, team: f.teams.away, player: { name: "Zagueiro" }, assist: {}, type: "Goal", detail: "Own Goal" });
  f.goals.home = 3; // o gol contra do Flamengo vira gol do Cruzeiro
  assert.equal(normalize(f).events.find((e) => e.kind === "own-goal").for, "home");
});
await t("time feminino e de outro país ficam de fora", () => {
  const f = apiFootballFixture(30, kick);
  assert.equal(normalize({ ...f, league: { ...f.league, name: "Brasileiro Women" } }), null);
  assert.equal(normalize({ ...f, league: { ...f.league, country: "Mexico" } }), null);
});

/* Worker completo, com a API simulada */
const calls = [];
let remaining = 50;
globalThis.fetch = async (url, init) => {
  calls.push(url);
  assert.equal(init.headers["x-apisports-key"], "chave-teste");
  const ids = /ids=/.test(url);
  const body = { errors: [], response: [apiFootballFixture(30, kick, ids), { ...apiFootballFixture(30, kick, ids), league: { country: "Spain", name: "La Liga" } }] };
  return new Response(JSON.stringify(body), { headers: { "x-ratelimit-requests-remaining": String(--remaining) } });
};
const env = { API_FOOTBALL_KEY: "chave-teste", INTERVALO_SEGUNDOS: "15", LISTA_SEGUNDOS: "1800" };
const get = async (p, e = env) => { const r = await worker.fetch(new Request(`https://w.test${p}`), e); return [r.status, await r.json(), r.headers]; };

await t("GET /ao-vivo devolve o jogo com lances e libera o site (CORS)", async () => {
  const [st, d, h] = await get("/ao-vivo");
  assert.equal(st, 200); assert.equal(d.source, "API-Football");
  assert.equal(d.games.length, 1); assert.equal(d.games[0].id, AF_ID); assert.equal(d.games[0].events.length, 2);
  assert.equal(h.get("access-control-allow-origin"), "*");
  assert.equal(calls.length, LISTAS + 1); // lista do dia + detalhes do jogo
});
await t("visitantes seguidos não gastam consultas novas (memória de 15 s)", async () => {
  for (let i = 0; i < 20; i++) await get("/ao-vivo");
  assert.equal(calls.length, LISTAS + 1);
});
await t("cache compartilhado (E7): outra instância do Worker no mesmo data center não gasta consulta", async () => {
  const antes = calls.length;
  const mod = await import(`../worker/ao-vivo.mjs?instancia=${Date.now()}`); // instância nova, mesmo cache da Cloudflare
  const r = await mod.default.fetch(new Request("https://w.test/ao-vivo"), env);
  assert.equal(r.status, 200); assert.equal(calls.length, antes);
});
await t("repasse da ESPN: só caminhos conhecidos, com cache curto no placar", async () => {
  const { rotaEspn } = await import("../worker/plataforma.mjs");
  const ok = rotaEspn("/espn/site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard", "?dates=20261117");
  assert.equal(ok.ttl, 2); assert.equal(ok.url, "https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=20261117");
  assert.equal(rotaEspn("/espn/site.api.espn.com/apis/site/v2/sports/soccer/bra.1/teams/6273/roster", "").ttl, 60);
  assert.equal(rotaEspn("/espn/site.web.api.espn.com/apis/v2/sports/soccer/bra.1/standings", "").url, "https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings");
  assert.equal(rotaEspn("/espn/evil.com/apis/site/v2/sports/soccer/bra.1/scoreboard", ""), null);
  assert.equal(rotaEspn("/espn/site.api.espn.com/apis/../../etc/passwd", ""), null);
  assert.equal(rotaEspn("/espn/site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard", "?x=<script>"), null);
});
await t("limite do dia no fim: para de consultar e avisa o site", async () => {
  remaining = LISTAS + 3; // na última consulta desta visita restam só 2 (a reserva)
  (await import("../worker/plataforma.mjs"))._cacheCompartilhado.limpa(); // outro data center: nem o cache compartilhado
  const mod = await import(`../worker/ao-vivo.mjs?novo=${Date.now()}`); // Worker novo, sem memória
  const r1 = await mod.default.fetch(new Request("https://w.test/ao-vivo"), env);
  assert.equal(r1.status, 200);
  const before = calls.length;
  const r2 = await mod.default.fetch(new Request("https://w.test/ao-vivo"), { ...env, INTERVALO_SEGUNDOS: "0.001", LISTA_SEGUNDOS: "0.001" });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(r2.status, 503); assert.equal((await r2.json()).esgotado, true); assert.equal(calls.length, before);
});
await t("sem chave: erro claro", async () => {
  const [st, d] = await get("/ao-vivo", {});
  assert.equal(st, 503); assert.match(d.erro, /API_FOOTBALL_KEY/);
});
// ---------- em alta: contagem de buscas (KV simulado em memória) ----------
{
  const kv = new Map(), BUSCAS = { get: async (k, tipo) => (kv.has(k) ? (tipo === "json" ? JSON.parse(kv.get(k)) : kv.get(k)) : null), put: async (k, v) => kv.set(k, v) };
  const mod = await import(`../worker/ao-vivo.mjs?buscas=${Date.now()}`);
  const post = (corpo, envx = { BUSCAS }) => mod.default.fetch(new Request("https://w.test/busca", { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), headers: { "content-type": "text/plain" } }), envx);
  await t("busca: sem KV configurado responde 503 (o site mostra Em destaque)", async () => {
    assert.equal((await post({ t: "c", id: "cruzeiro" }, {})).status, 503);
    assert.equal((await mod.default.fetch(new Request("https://w.test/em-alta"), {})).status, 503);
  });
  await t("busca: só ids de clube ou jogador; corpo grande ou estranho é recusado", async () => {
    assert.equal((await post({ t: "c", id: "cruzeiro" })).status, 200);
    assert.equal((await post({ t: "j", id: "216098-cruzeiro" })).status, 200);
    assert.equal((await post({ t: "x", id: "cruzeiro" })).status, 400);
    assert.equal((await post({ t: "c", id: "<script>" })).status, 400);
    assert.equal((await post("nao é json")).status, 400);
    assert.equal((await post({ t: "c", id: "a".repeat(300) })).status, 400);
  });
  await t("busca: outros métodos e rotas continuam recusados", async () => {
    assert.equal((await mod.default.fetch(new Request("https://w.test/ao-vivo", { method: "POST", body: "{}" }), { BUSCAS })).status, 405);
    assert.equal((await mod.default.fetch(new Request("https://w.test/busca", { method: "DELETE" }), { BUSCAS })).status, 405);
  });
  await t("em alta: os mais buscados primeiro, contando o que ainda não foi gravado", async () => {
    for (let i = 0; i < 3; i++) await post({ t: "j", id: "216098-cruzeiro" });
    const r = await mod.default.fetch(new Request("https://w.test/em-alta"), { BUSCAS });
    const d = await r.json();
    assert.equal(r.status, 200);
    assert.equal(d.itens[0].t, "j"); assert.equal(d.itens[0].id, "216098-cruzeiro");
    assert.ok(d.itens.some((x) => x.t === "c" && x.id === "cruzeiro"));
    assert.match(r.headers.get("cache-control"), /max-age=300/);
  });
  await t("em alta: grava no KV no máximo 1 vez por minuto (economiza gravações)", async () => {
    assert.ok([...kv.keys()].filter((k) => k.startsWith("h:")).length <= 1);
  });
}
// ---------- dados do site no banco D1 (SQLite simulado) ----------
{
  const { d1Simulado } = await import("./sim/d1.mjs");
  const { createHash } = await import("node:crypto");
  const DB = d1Simulado(), ROBO_CHAVE = "k".repeat(40), env = { DB, ROBO_CHAVE: ROBO_CHAVE + "\n" }; // a chave pode vir com quebra de linha
  const mod = await import(`../worker/ao-vivo.mjs?dados=${Date.now()}`);
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  const put = (nome, corpo, chave = ROBO_CHAVE, hash = sha(corpo)) =>
    mod.default.fetch(new Request(`https://w.test/dados/${nome}.json`, { method: "PUT", body: corpo, headers: { authorization: `Bearer ${chave}`, "x-hash": hash } }), env);
  const get = (caminho, cab = {}) => mod.default.fetch(new Request(`https://w.test${caminho}`, { headers: cab }), env);
  await t("dados no banco: só o robô com a chave grava", async () => {
    assert.equal((await put("live-data", '{"a":1}', "errada".repeat(8))).status, 401);
    assert.equal((await put("live-data", '{"a":1}', "")).status, 401);
    assert.equal((await mod.default.fetch(new Request("https://w.test/dados/live-data.json", { method: "PUT", body: "{}" }), { DB })).status, 401); // sem chave configurada
    assert.equal((await put("live-data", '{"a":1}')).status, 200);
  });
  await t("dados no banco: nome, hash e formato conferidos", async () => {
    assert.equal((await put("../segredo", "{}")).status, 405); // o endereço resolve o ".." antes: vira /segredo.json, fora da rota
    assert.equal((await put("x", "{}")).status, 400);
    assert.equal((await put("Jogadores/X", "{}")).status, 400);
    assert.equal((await put("live-data", "{}", ROBO_CHAVE, "abc")).status, 400);
    assert.equal((await put("live-data", "<html>")).status, 400);
  });
  await t("dados no banco: o site lê com ETag e cache de borda; 304 quando nada mudou", async () => {
    const corpo = '{"jogadores":[1,2,3]}';
    await put("jogadores/cruzeiro", corpo);
    const r = await get("/dados/jogadores/cruzeiro.json?v=123");
    assert.equal(r.status, 200);
    assert.equal(await r.text(), corpo);
    assert.equal(r.headers.get("etag"), `"${sha(corpo)}"`);
    assert.match(r.headers.get("cache-control"), /max-age=60/);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    assert.equal((await get("/dados/jogadores/cruzeiro.json", { "if-none-match": `"${sha(corpo)}"` })).status, 304);
    assert.equal((await get("/dados/nao-existe.json")).status, 404); // o site usa a cópia estática
  });
  await t("dados no banco: a lista de hashes (para enviar só o que mudou) exige a chave", async () => {
    assert.equal((await get("/dados/_lista")).status, 401);
    const d = await (await get("/dados/_lista", { authorization: `Bearer ${ROBO_CHAVE}` })).json();
    assert.equal(d["live-data"], sha('{"a":1}'));
    assert.equal(Object.keys(d).length, 2);
  });
  await t("dados no banco: reenviar troca o conteúdo (uma linha por arquivo)", async () => {
    await put("live-data", '{"a":2}');
    assert.equal(await (await get("/dados/live-data.json")).text(), '{"a":2}');
    assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM arquivos").get().n, 2);
    assert.equal((await mod.default.fetch(new Request("https://w.test/dados/live-data.json", { method: "DELETE" }), env)).status, 405);
  });
}
console.log(`\n${ok} testes do Worker passaram`);
