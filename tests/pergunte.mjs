/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* "Pergunte ao CazéStats" (js/pergunte.js) sem rede: jeitos diferentes de perguntar, apelidos de torcida e respostas
   calculadas com os dados reais (dados/live-data.json e dados/xg.json). Uso: node tests/pergunte.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const P = createRequire(import.meta.url)("../js/pergunte.js");
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
// clubes reais de js/data.js
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../js/data.js", import.meta.url), "utf8").replace(/^const /gm, "var "), ctx);
const CLUBS = ctx.window.PD.CLUBS, byId = ctx.window.PD.byId;
const LD = JSON.parse(readFileSync(new URL("../dados/live-data.json", import.meta.url), "utf8"));
const XG = JSON.parse(readFileSync(new URL("../dados/xg.json", import.meta.url), "utf8"));
const tabela = LD.standings.map(([id, p, j, v, e, d, gf, gc]) => ({ id, p, j, v, e, d, gf, gc }));
const jogos = [
  { id: "a-r1", round: 1, home: "cruzeiro", away: "flamengo", hs: 2, as: 1, status: "ft", date: "2026-02-01" },
  { id: "b-r2", round: 2, home: "palmeiras", away: "cruzeiro", hs: 0, as: 0, status: "ft", date: "2026-02-08" },
  { id: "c-r3", round: 3, home: "cruzeiro", away: "santos", hs: 0, as: 1, status: "ft", date: "2026-02-15" },
  { id: "d-r4", round: 4, home: "gremio", away: "cruzeiro", status: "ns", date: "2026-11-23", time: "16:00", venue: "Arena do Grêmio" },
];
const D = { clubes: CLUBS, nome: (id) => byId[id]?.name || id, tabela, jogos, artilheiros: LD.scorers.map(([nome, clube, gols]) => ({ nome, clube, gols })), xg: XG,
  previsao: CLUBS.map((c, i) => ({ id: c.id, titulo: c.id === "flamengo" ? 0.9 : c.id === "palmeiras" ? 0.1 : 0, z4: i > 15 ? 0.8 : 0.01, provavel: i + 1 })),
  chance: () => ({ casa: 0.45, empate: 0.28, fora: 0.27, provavel: { casa: 1, fora: 0 } }) };
const intencao = (q) => P.entende(q, CLUBS);

t("apelidos de torcida viram o clube certo", () => {
  const ids = (q) => P.clubesNa(q, CLUBS).map((c) => c.id);
  assert.deepEqual(ids("o mengão joga hoje?"), ["flamengo"]);
  assert.deepEqual(ids("Verdão x Timão"), ["palmeiras", "corinthians"]);
  assert.deepEqual(ids("e o galo e a raposa?"), ["atletico-mg", "cruzeiro"]);
  assert.deepEqual(ids("COLORADO"), ["internacional"]);
  assert.deepEqual(ids("como está o São Paulo"), ["sao-paulo"]);
  assert.deepEqual(ids("athletico paranaense ou atlético mineiro"), ["athletico-pr", "atletico-mg"]);
  assert.deepEqual(ids("qual é o melhor time?"), []);
});
t("jeitos diferentes de perguntar a mesma coisa", () => {
  for (const q of ["quem é o artilheiro?", "Quem fez mais gols no Brasileirão", "maior goleador do campeonato"]) assert.equal(intencao(q).intencao, "artilheiro", q);
  for (const q of ["em que posição está o cruzeiro", "onde está o Cruzeiro na tabela", "colocação do cruzeiro"]) assert.equal(intencao(q).intencao, "posicao", q);
  for (const q of ["quando o cruzeiro joga?", "próximo jogo do cruzeiro", "o cruzeiro joga quando"]) assert.equal(intencao(q).intencao, "proximo", q);
  for (const q of ["flamengo x palmeiras quem ganha", "Fla contra Verdão", "quem vence entre galo e raposa"]) assert.equal(intencao(q).intencao, "confronto", q);
  assert.equal(intencao("qual a chance do palmeiras ser campeão?").intencao, "chance-titulo");
  assert.equal(intencao("o remo vai cair?").intencao, "chance-queda");
  assert.equal(intencao("quem está no z4").intencao, "z4");
  assert.equal(intencao("como o galo vai em casa?").intencao, "casa-fora");
  assert.equal(intencao("cruzeiro").intencao, "posicao", "só o nome do clube: mostra a situação dele");
});
t("respostas com os números reais da tabela e da artilharia", () => {
  const ord = tabela.slice().sort((a, b) => b.p - a.p || b.v - a.v || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
  const r1 = P.responde("quem é o líder?", D);
  assert.ok(r1.ok && r1.texto.includes(byId[ord[0].id].name) && r1.texto.includes(String(ord[0].p)), r1.texto);
  const r2 = P.responde("em que posição está o cruzeiro?", D);
  const i = ord.findIndex((r) => r.id === "cruzeiro");
  assert.ok(r2.texto.startsWith(`Cruzeiro está em ${i + 1}º lugar, com ${ord[i].p} pontos`), r2.texto);
  assert.deepEqual(r2.links[0], ["Ver a tabela", "#/tabela"]);
  const r3 = P.responde("quem é o artilheiro do brasileirão", D);
  assert.ok(r3.texto.includes(LD.scorers[0][0]) && r3.texto.includes(`${LD.scorers[0][2]} gols`), r3.texto);
  const r4 = P.responde("artilheiro do mengão", D);
  const fla = LD.scorers.find((s) => s[1] === "flamengo");
  assert.ok(r4.texto.includes(fla[0]), r4.texto);
  const z4 = P.responde("quem está na zona de rebaixamento", D);
  assert.ok(ord.slice(-4).every((r) => z4.texto.includes(byId[r.id].name)), z4.texto);
});
t("jogos: próximo, último, forma e campanha em casa", () => {
  assert.ok(P.responde("quando o cruzeiro joga", D).texto.includes("visita o Grêmio em 23/11 às 16:00"));
  assert.ok(P.responde("último jogo do cruzeiro", D).texto.startsWith("No último jogo, derrota: Cruzeiro 0 x 1 Santos"));
  assert.ok(P.responde("como está a forma da raposa", D).texto.includes("fez 4 de 9 pontos: D E V"));
  const casa = P.responde("cruzeiro em casa", D).texto;
  assert.ok(casa.includes("1 vitórias, 0 empates e 1 derrotas em 2 jogos") && casa.includes("50% de aproveitamento"), casa);
});
t("chance, previsão e xG", () => {
  const c = P.responde("Cruzeiro x Grêmio, quem ganha?", D);
  assert.ok(c.texto.includes("No próximo GRE x CRU") || c.texto.includes("No próximo Grêmio x Cruzeiro") || /No próximo .* x .*/.test(c.texto), c.texto);
  assert.equal(c.links[0][1], "#/partida/d-r4");
  assert.ok(P.responde("chance de título", D).texto.startsWith("Chance de título: Flamengo 90%, Palmeiras 10%"));
  const xg = P.responde("xg do flamengo", D), fx = XG.clubes.find((x) => x.id === "flamengo");
  assert.ok(xg.texto.includes(`${fx.gols} gols`), xg.texto);
  assert.ok(P.responde("quem fez mais gols acima do esperado", D).texto.startsWith("Mais gols acima do esperado:"));
});
t("campanha em casa e fora com a temporada inteira (dados/club-form.json)", () => {
  const CF = JSON.parse(readFileSync(new URL("../dados/club-form.json", import.meta.url), "utf8"));
  const temporada = (id) => (CF.clubs[id]?.all || []).filter((j) => j.lg === "bra.1" && j.state === "post" && Number.isFinite(j.gf)).map((j) => ({ id: j.id, date: j.date, casa: !!j.home, adv: j.oppId || j.opp, gf: j.gf, gc: j.ga }));
  const D2 = { ...D, temporada };
  const casa = temporada("atletico-mg").filter((j) => j.casa);
  const v = casa.filter((j) => j.gf > j.gc).length;
  const r = P.responde("como o galo vai em casa?", D2).texto;
  assert.ok(r.includes(`tem ${v} vitórias`) && r.includes(`em ${casa.length} jogos`), r);
  assert.ok(casa.length >= 15, "a temporada inteira, não só as últimas rodadas");
  const f = P.responde("forma do galo", D2).texto;
  assert.ok(/fez \d+ de 15 pontos: [VED]( [VED]){4}/.test(f), f);
});
t("o que não entende, diz que não sabe e sugere perguntas", () => {
  const r = P.responde("qual a cor da chuteira do goleiro?", D);
  assert.equal(r.ok, false);
  assert.ok(r.sugestoes.length >= 4);
  assert.equal(P.responde("oi", D).ok, false);
  const s = P.responde("<img src=x onerror=alert(1)>", D);
  assert.equal(s.ok, false, "texto estranho não quebra nada");
});
console.log(`\n${ok} testes do Pergunte ao CazéStats passaram`);
