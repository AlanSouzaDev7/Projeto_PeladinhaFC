/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Testa o envio dos dados ao banco de ponta a ponta, sem Cloudflare: o Worker real roda num servidor local com o
   D1 simulado (SQLite) e o robô (server/enviar_d1.py) envia os dados/*.json de verdade.
   Uso: node tests/enviar-d1.mjs */
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import fs from "node:fs";
import worker from "../worker/ao-vivo.mjs";
import { d1Simulado } from "./sim/d1.mjs";

const DB = d1Simulado(), ROBO_CHAVE = "c".repeat(48), env = { DB, ROBO_CHAVE };
let puts = 0;
const srv = http.createServer(async (req, res) => {
  const partes = [];
  for await (const p of req) partes.push(p);
  if (req.method === "PUT") puts++;
  const r = await worker.fetch(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(partes) }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const api = `http://127.0.0.1:${srv.address().port}`;
// assíncrono: com execFileSync o Node pararia e o servidor do Worker (no mesmo processo) nunca responderia
const roda = (chave = ROBO_CHAVE) =>
  new Promise((ok) =>
    execFile("python", ["-X", "utf8", "server/enviar_d1.py", "--api", api], { env: { ...process.env, ROBO_CHAVE: chave }, encoding: "utf8", timeout: 120000 }, (e, out, err) =>
      ok({ codigo: e ? (e.code ?? 1) : 0, saida: `${out}${err}` }),
    ),
  );
let ok = 0;
const t = async (nome, fn) => { await fn(); ok++; console.log("✓", nome); };
const locais = fs.readdirSync("dados", { recursive: true }).filter((f) => /\.json$/.test(f)).length;

try {
  await t("chave errada: nada é gravado e o robô avisa (código 1)", async () => {
    const r = await roda("x".repeat(48));
    assert.equal(r.codigo, 1);
    assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM arquivos").get().n, 0);
  });
  await t("primeira rodada: todos os arquivos chegam, meta por último", async () => {
    const r = await roda();
    assert.equal(r.codigo, 0, r.saida);
    const linhas = DB._db.prepare("SELECT nome FROM arquivos ORDER BY rowid").all().map((x) => x.nome);
    assert.equal(linhas.length, locais);
    assert.equal(linhas.at(-1), "meta");
  });
  await t("segunda rodada sem mudança: nenhum arquivo é reenviado (só o meta)", async () => {
    puts = 0;
    assert.equal((await roda()).codigo, 0);
    assert.equal(puts, 1);
  });
  await t("o site lê o mesmo conteúdo do arquivo local", async () => {
    const r = await fetch(`${api}/dados/raio-x.json`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), fs.readFileSync("dados/raio-x.json", "utf8"));
  });
  await t("histórico: todos os jogos dos arquivos chegam ao banco; na rodada seguinte nada é regravado", async () => {
    const total = DB._db.prepare("SELECT COUNT(*) n FROM jogos").get().n;
    const r = await roda();
    assert.match(r.saida, new RegExp(`histórico: ${total} jogos conferidos, 0 novos ou alterados, 0 lotes com falha`));
    assert.ok(total > 1000, `só ${total} jogos`);
    assert.equal(DB._db.prepare("SELECT COUNT(*) n FROM jogos WHERE liga = 'bra.1'").get().n, 380); // a Série A inteira
  });
  await t("histórico: consulta de um clube da Série A em todas as competições", async () => {
    const d = await (await fetch(`${api}/jogos?clube=cruzeiro&temporada=2026&limite=200`)).json();
    assert.ok(d.jogos.length >= 38);
    assert.ok(new Set(d.jogos.map((j) => j.liga)).size >= 3, "esperava Brasileirão, copa e estadual");
    assert.equal(d.resumo.jogos, d.jogos.filter((j) => j.estado === "post").length);
  });
} finally {
  srv.close();
}
console.log(`\n${ok} testes do envio ao banco passaram`);
