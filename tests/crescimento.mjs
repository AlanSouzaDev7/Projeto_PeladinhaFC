/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Crescimento sem rede: resumo automático da partida e páginas para buscadores (montagem do site).
   Uso: node tests/crescimento.mjs */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { geraPaginas } from "../scripts/paginas-busca.mjs";

const require = createRequire(import.meta.url);
const RESUMO = require("../js/resumo.js");
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
const nomes = { "sao-paulo": "São Paulo", fluminense: "Fluminense", chapecoense: "Chapecoense", cruzeiro: "Cruzeiro" };
const ctx = { nome: (c) => nomes[c], tabela: (c) => ({ "sao-paulo": { pos: 13, p: 44 }, fluminense: { pos: 4, p: 57 }, chapecoense: { pos: 19, p: 30 }, cruzeiro: { pos: 3, p: 63 } })[c], forma: (c) => ({ cruzeiro: "VVEDV" })[c] || "" };

t("prévia: dia da semana, hora, estádio com a preposição certa e o feminino (a Chapecoense, 19ª)", () => {
  const r = RESUMO.partida({ home: "chapecoense", away: "cruzeiro", status: "ns", round: 36, date: "2026-11-21", time: "21:00", venue: "Arena Condá" }, ctx).texto;
  assert.match(r, /^A Chapecoense recebe o Cruzeiro no sábado, 21 de novembro, às 21h, na Arena Condá, pela 36ª rodada/);
  assert.match(r, /a Chapecoense é 19ª, com 30 pontos/);
  assert.match(r, /o Cruzeiro é 3º, com 63 pontos, e vem de V-V-E-D-V/);
});
t("crônica: vitória fora de casa, gols com pênalti e contra (o gol contra conta para o adversário)", () => {
  const r = RESUMO.partida({ home: "sao-paulo", away: "fluminense", status: "ft", hs: 1, as: 3, round: 35, venue: "Estadio Morumbis",
    gols: [{ nome: "Lucas", clube: "sao-paulo" }, { nome: "Cano", clube: "fluminense", pen: true }, { nome: "Arias", clube: "fluminense" }, { nome: "Arboleda", clube: "sao-paulo", contra: true }] }, ctx).texto;
  assert.match(r, /^O Fluminense venceu o São Paulo fora de casa, por 3 a 1, no Estádio Morumbis/);
  assert.match(r, /Gols: Lucas para o São Paulo; Cano \(pênalti\), Arias e Arboleda \(contra\) para o Fluminense\./);
});
t("crônica: empate e goleada", () => {
  assert.match(RESUMO.partida({ home: "cruzeiro", away: "chapecoense", status: "ft", hs: 2, as: 2, round: 1 }, ctx).texto, /^O Cruzeiro empatou com a Chapecoense por 2 a 2/);
  assert.match(RESUMO.partida({ home: "cruzeiro", away: "chapecoense", status: "ft", hs: 4, as: 0, round: 1 }, ctx).texto, /Foi uma goleada: quatro gols de diferença/);
});

// páginas para buscadores, montadas numa pasta temporária com o index.html de verdade
const saida = fs.mkdtempSync(path.join(os.tmpdir(), "cazestats-paginas-"));
const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
const urls = geraPaginas({ raiz: RAIZ, saida, site: "https://exemplo.test/", html });
t("uma página por clube (20), por jogo da janela e por jogador do elenco", () => {
  assert.equal(urls.filter((u) => u.includes("/clube/")).length, 20);
  assert.ok(urls.filter((u) => u.includes("/jogo/")).length >= 10);
  assert.ok(urls.filter((u) => u.includes("/jogador/")).length >= 500);
});
t("cada página tem título, descrição, canônico, prévia (Open Graph), dados estruturados e texto inicial", () => {
  const p = fs.readFileSync(path.join(saida, "clube/cruzeiro.html"), "utf8");
  assert.match(p, /<title>Cruzeiro: elenco, jogos e estatísticas no Brasileirão \| CazéStats.TV<\/title>/);
  assert.match(p, /<link rel="canonical" href="https:\/\/exemplo.test\/clube\/cruzeiro" \/>/);
  assert.match(p, /<meta property="og:url" content="https:\/\/exemplo.test\/clube\/cruzeiro" \/>/);
  assert.match(p, /<base href="\/" \/>/);
  assert.match(p, /"@type":"SportsTeam","name":"Cruzeiro"/);
  assert.match(p, /<article class="wrap seo-inicial"><h1>/);
  assert.equal((p.match(/<title>/g) || []).length, 1);
});
t("texto vindo dos dados é escapado (nada de HTML injetado na página)", () => {
  const todas = fs.readdirSync(path.join(saida, "jogador")).slice(0, 200).map((f) => fs.readFileSync(path.join(saida, "jogador", f), "utf8"));
  assert.ok(todas.every((p) => !/<script>(?!.*ld\+json)/.test(p) && !p.includes("</script><script")));
  assert.ok(todas.every((p) => /application\/ld\+json">\{[^<]*\}<\/script>/.test(p)), "JSON-LD sem '<' cru");
});
fs.rmSync(saida, { recursive: true, force: true });
console.log(`\n${ok} testes de crescimento passaram`);
