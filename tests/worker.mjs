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
await t("limite do dia no fim: para de consultar e avisa o site", async () => {
  remaining = LISTAS + 3; // na última consulta desta visita restam só 2 (a reserva)
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
console.log(`\n${ok} testes do Worker passaram`);
