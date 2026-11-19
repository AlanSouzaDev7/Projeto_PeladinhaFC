/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Agenda do favorito sem rede: banco D1 simulado (SQLite) com jogos e o calendário .ics que o Worker devolve.
   Uso: node tests/agenda.mjs */
import assert from "node:assert/strict";
import worker from "../worker/ao-vivo.mjs";
import { calendario } from "../worker/agenda.mjs";
import { d1Simulado } from "./sim/d1.mjs";

let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };
const DB = d1Simulado(), env = { DB };
const hoje = new Date(), dia = (n) => new Date(hoje.getTime() + n * 864e5).toISOString().slice(0, 10);
const jogo = (id, data, hora, casa_id, casa, fora_id, fora, extra = {}) => ({ id, liga: "bra.1", competicao: "Brasileirão", temporada: data.slice(0, 4), data, hora, fase: null,
  casa_id, casa, fora_id, fora, gols_casa: null, gols_fora: null, pen_casa: null, pen_fora: null, estado: "pre", local: null, atualizado: 1, ...extra });
const jogos = [
  jogo("701", dia(-60), "16:00", "cruzeiro", "Cruzeiro", "santos", "Santos", { estado: "post", gols_casa: 2, gols_fora: 0 }), // velho demais: fica fora
  jogo("702", dia(-3), "21:30", "cruzeiro", "Cruzeiro", "bahia", "Bahia", { estado: "post", gols_casa: 1, gols_fora: 1, local: "Mineirão" }),
  jogo("703", dia(4), "21:00", "chapecoense", "Chapecoense", "cruzeiro", "Cruzeiro", { local: "Arena Condá" }),
  jogo("704", dia(9), null, "cruzeiro", "Cruzeiro", "internacional", "Internacional, RS", { competicao: "Copa do Brasil", fase: "Final" }),
  jogo("705", dia(5), "18:00", "flamengo", "Flamengo", "vasco", "Vasco"), // de outros clubes
];
for (const j of jogos) {
  const cols = Object.keys(j);
  DB._db.prepare(`INSERT INTO jogos (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...Object.values(j));
}
const pede = (caminho) => worker.fetch(new Request(`https://w.test${caminho}`), env);

let ics;
await t("GET /agenda/cruzeiro.ics devolve um calendário com os jogos do clube (dos últimos 30 dias em diante)", async () => {
  const r = await pede("/agenda/cruzeiro.ics");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^text\/calendar/);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  ics = await r.text();
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.deepEqual([...ics.matchAll(/UID:(\d+)@/g)].map((m) => m[1]), ["702", "703", "704"]);
  assert.match(ics, /X-WR-CALNAME:Cruzeiro · CazéStats.TV/);
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT6H/);
});
await t("horário de Brasília vira UTC; sem horário, evento do dia inteiro", async () => {
  const ev = (id) => ics.split("BEGIN:VEVENT").find((b) => b.includes(`UID:${id}@`)).replace(/\r\n /g, "");
  assert.match(ev("703"), new RegExp(`DTSTART:${dia(5).replace(/-/g, "")}T000000Z`)); // 21:00 em Brasília = 00:00 UTC do dia seguinte
  assert.match(ev("702"), new RegExp(`DTSTART:${dia(-2).replace(/-/g, "")}T003000Z`)); // 21:30 -> 00:30 UTC
  assert.match(ev("704"), new RegExp(`DTSTART;VALUE=DATE:${dia(9).replace(/-/g, "")}`));
  assert.match(ev("704"), /Horário a definir/);
});
await t("jogo encerrado mostra o placar; texto escapado (vírgula) e local", async () => {
  const s = ics.replace(/\r\n /g, "");
  assert.match(s, /SUMMARY:Cruzeiro 1 x 1 Bahia \(Brasileirão\)/);
  assert.match(s, /SUMMARY:Cruzeiro x Internacional\\, RS \(Copa do Brasil · Final\)/);
  assert.match(s, /LOCATION:Arena Condá/);
});
await t("linhas longas dobradas em até 75 bytes, sem partir acentos", async () => {
  const longo = calendario("cruzeiro", "Cruzeiro", [jogo("9", dia(1), "20:00", "cruzeiro", "Cruzeiro Esporte Clube de Belo Horizonte", "atletico-mg", "Clube Atlético Mineiro de Belo Horizonte")]);
  for (const l of longo.split("\r\n")) assert.ok(new TextEncoder().encode(l).length <= 75, l);
  assert.match(longo.replace(/\r\n /g, ""), /Clube Atlético Mineiro de Belo Horizonte/);
});
await t("clube desconhecido: 404", async () => {
  assert.equal((await pede("/agenda/inventado.ics")).status, 404);
});
console.log(`\n${ok} testes da agenda passaram`);
