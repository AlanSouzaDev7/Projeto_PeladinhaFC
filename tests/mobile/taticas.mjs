/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* Campinho tático da partida e aba Escalações do clube (js/taticas.js), no PC e no celular:
   a aba lista os jogos com a escalação de cada um; "Montar a minha" abre o campinho editável; na partida, os dois times;
   arrastar um jogador fora da escalação para o time salva só naquele jogo (a escalação do clube não muda); nada vaza.
   Uso: BASE=http://127.0.0.1:5173 node tests/mobile/taticas.mjs */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:5174";
const erros = [];
const ok = (c, m) => (c ? console.log("ok ·", m) : erros.push(m));
const espera = (p, fn, ms = 8000) => p.waitForFunction(fn, null, { timeout: ms }).then(() => true).catch(() => false);
const browser = await chromium.launch({ channel: "chrome" });
for (const [nome, opts] of [["pc", { viewport: { width: 1366, height: 900 } }], ["pixel", devices["Pixel 7"]]]) {
  const ctx = await browser.newContext(opts), p = await ctx.newPage();
  const jsErros = [];
  p.on("pageerror", (e) => jsErros.push(String(e.message)));
  await p.goto(`${BASE}/?t=${Date.now()}#/clube/cruzeiro/escalacoes`, { waitUntil: "load" });
  ok(await espera(p, () => document.querySelectorAll(".tat-jogo").length > 5), `${nome}: aba Escalações lista os jogos da temporada`);
  ok(await p.evaluate(() => document.querySelectorAll(".tat-pitch .tat-f").length === 11), `${nome}: campinho do jogo com os 11 titulares`);
  await p.click("[data-tat-editar]");
  ok(await espera(p, () => document.querySelectorAll(".tat-editor .lu-pitch [data-slot='xi']").length === 11), `${nome}: "Montar a minha" abre o campinho editável do jogo`);
  const vaza = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(vaza <= 1, `${nome}: nada vaza para o lado na aba (${vaza}px)`);
  // aba Histórico (js/historico.js): resumo, filtros e retrospecto, pelo banco ou, sem ele, pela temporada
  await p.goto(`${BASE}/?t=${Date.now()}#/clube/cruzeiro/historico`, { waitUntil: "load" });
  ok(await espera(p, () => document.querySelectorAll(".hs-aba .hs-jogo").length > 5 && document.querySelector(".hs-resumo")), `${nome}: aba Histórico com jogos e resumo`);
  const filtrou = await p.evaluate(() => {
    const antes = document.querySelector(".hs-resumo b").textContent, b = document.querySelectorAll("[data-hs-t]")[1];
    if (!b) return true; // só uma temporada (sem banco): nada a filtrar
    b.click();
    return document.querySelector(".hs-chip.on")?.dataset.hsT === b.dataset.hsT && document.querySelector(".hs-resumo b").textContent !== "" && antes !== null;
  });
  ok(filtrou, `${nome}: filtro de temporada do Histórico`);
  const vazaH = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(vazaH <= 1, `${nome}: nada vaza para o lado no Histórico (${vazaH}px)`);
  // partida: dois times e troca de jogador salva no jogo
  await p.goto(`${BASE}/?t=${Date.now()}#/`, { waitUntil: "load" });
  await espera(p, () => document.querySelector('a[href^="#/partida/"]'));
  const link = await p.evaluate(() => document.querySelector('a[href^="#/partida/"]').getAttribute("href"));
  await p.goto(`${BASE}/?t=${Date.now()}${link}`, { waitUntil: "load" });
  ok(await espera(p, () => document.querySelectorAll("[data-tatica] .lu-pitch [data-slot='xi']").length === 11), `${nome}: campinho tático na página da partida`);
  // confronto direto (js/confronto.js): preenchido pelo histórico do banco ou, sem ele, pela temporada
  ok(await espera(p, () => { const c = document.querySelector("[data-confronto] .cd-corpo"); return c && !/Buscando/.test(c.textContent) && /venceu|ainda não se enfrentaram/.test(c.textContent); }), `${nome}: confronto direto na página da partida`);
  ok(await p.evaluate(() => document.querySelectorAll("[data-tat-lado]").length === 2), `${nome}: os dois times podem ser editados`);
  if (nome === "pc") {
    const r = await p.evaluate(async () => {
      const card = document.querySelector("[data-tatica]"), lu = card.querySelector(".lineup"), chave = lu.dataset.luChave, cid = lu.dataset.lineup;
      const livre = [...lu.querySelectorAll(".lu-list li")].find((li) => !li.classList.contains("is-xi") && !li.classList.contains("is-bench"));
      // campo e lista ficam lado a lado no PC: a página rola até o campo e só a lista interna rola até o jogador
      card.querySelector(".lu-pitch").scrollIntoView({ block: "center", behavior: "instant" });
      const ul = livre.closest("ul");
      ul.scrollTop = livre.offsetTop - ul.offsetTop - 40;
      await new Promise((s) => setTimeout(s, 250));
      const a = livre.getBoundingClientRect();
      const ev = (t, x, y, el = document) => el.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 9, bubbles: true, button: 0, pointerType: "mouse" }));
      ev("pointerdown", a.x + 20, a.y + 10, livre);
      const b = card.querySelector('.lu-pitch [data-slot="xi"][data-i="10"]').getBoundingClientRect();
      for (let k = 1; k <= 8; k++) { ev("pointermove", a.x + 20 + (b.x + b.width / 2 - a.x - 20) * k / 8, a.y + 10 + (b.y + b.height / 2 - a.y - 10) * k / 8); await new Promise((s) => setTimeout(s, 25)); }
      ev("pointerup", b.x + b.width / 2, b.y + b.height / 2);
      await new Promise((s) => setTimeout(s, 400));
      const salvo = JSON.parse(localStorage.getItem(chave) || "null");
      return { ok: salvo?.xi?.[10] === livre.dataset.player, clube: localStorage.getItem(`placar:xi2:${cid}`) };
    });
    ok(r.ok, "pc: jogador que não estava escalado entra no time e fica salvo naquele jogo");
    ok(!r.clube, "pc: a escalação do clube (aba Elenco) não muda");
  }
  ok(!jsErros.length, `${nome}: sem erros de JavaScript${jsErros.length ? ` (${jsErros[0]})` : ""}`);
  await ctx.close();
}
await browser.close();
if (erros.length) { console.log(`\n${erros.length} falha(s):\n- ${erros.join("\n- ")}`); process.exit(1); }
console.log("\nCampinho tático e escalações conferidos.");
