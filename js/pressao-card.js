/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — cartão "Pressão no jogo" da página da partida (cálculo: js/pressao.js)
   Busca os lances no resumo da ESPN e redesenha a cada minuto enquanto o jogo rola. Fora da região ao vivo da página
   (o próprio cartão cuida da atualização).
   ========================================================================== */
(() => {
  "use strict";
  const esc = (t) => SEG.esc(t);
  const LIGA = "bra.1";

  function card(m) {
    if (!m.espn || !window.PRESSAO_CALC || (m.status !== "progress" && m.status !== "ft")) return "";
    return `<div class="card pressao" data-pressao="${esc(String(m.espn))}" data-h="${esc(m.home)}" data-a="${esc(m.away)}" data-st="${esc(m.status)}">
      <div class="card-h">Pressão no jogo <small>quem está melhor, minuto a minuto</small></div><div class="card-b"><p class="tc-txt">Calculando…</p></div></div>`;
  }
  async function resumo(espn) {
    const r = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/${LIGA}/summary?event=${encodeURIComponent(espn)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`ESPN respondeu ${r.status}`);
    return r.json();
  }
  async function desenha(el) {
    const corpo = el.querySelector(".card-b");
    let d;
    try { d = await resumo(el.dataset.pressao); } catch (e) { corpo.innerHTML = `<p class="tc-txt">Lances indisponíveis agora (${esc(e.message)}).</p>`; return; }
    const cs = d?.header?.competitions?.[0]?.competitors || [];
    const casa = cs.find((c) => c.homeAway === "home")?.team?.displayName, fora = cs.find((c) => c.homeAway === "away")?.team?.displayName;
    const r = window.PRESSAO_CALC.calcula(d?.commentary || [], casa, fora);
    if (!r.lances) { corpo.innerHTML = `<p class="tc-txt">O gráfico aparece com os primeiros lances do jogo.</p>`; return; }
    const H = byId[el.dataset.h], A = byId[el.dataset.a];
    const cor = (c) => window.GFX.display(c);
    const lider = r.dominio > 0.08 ? `${H.abbr} pressionou mais` : r.dominio < -0.08 ? `${A.abbr} pressionou mais` : "Jogo equilibrado";
    const agora = r.serie.at(-1)?.v ?? 0;
    const momento = el.dataset.st === "progress" ? (agora > 0.25 ? ` · agora: ${H.abbr} em cima` : agora < -0.25 ? ` · agora: ${A.abbr} em cima` : " · agora: equilibrado") : "";
    corpo.innerHTML = `<div class="pr-leg"><span><i style="background:${cor(H)}"></i>${esc(H.abbr)}</span><b>${esc(lider + momento)}</b><span>${esc(A.abbr)}<i style="background:${cor(A)}"></i></span></div>
      <div class="pr-graf">${window.PRESSAO_CALC.svg(r, cor(H), cor(A), H.abbr, A.abbr)}</div>
      <div class="pr-eixo"><span>1'</span><span>45'</span><span>${Math.max(90, r.minutos)}'</span></div>
      <p class="tc-txt">Cálculo do CazéStats.TV com os lances do jogo (chutes, escanteios, impedimentos e faltas no ataque).</p>`;
  }
  function mount(view) {
    (view || document).querySelectorAll("[data-pressao]:not([data-pr-ok])").forEach((el) => {
      el.dataset.prOk = "1";
      desenha(el);
      if (el.dataset.st === "progress") {
        const t = setInterval(() => { if (!el.isConnected) return clearInterval(t); if (!document.hidden) desenha(el); }, 60e3);
      }
    });
  }
  window.PRESSAO = { card, mount };
})();
