/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — cartão "Mapa de chutes" da página da partida (cálculo e desenho: js/chutes.js)
   Busca os lances no resumo da ESPN; com o jogo rolando, redesenha a cada minuto.
   ========================================================================== */
(() => {
  "use strict";
  const esc = (t) => SEG.esc(t);
  const LIGA = "bra.1";
  const f2 = (v) => Number(v || 0).toFixed(2).replace(".", ",");

  function card(m) {
    if (!m.espn || !window.CHUTES_CALC || (m.status !== "progress" && m.status !== "ft")) return "";
    return `<div class="card chutes" data-chutes="${esc(String(m.espn))}" data-h="${esc(m.home)}" data-a="${esc(m.away)}" data-st="${esc(m.status)}">
      <div class="card-h">Mapa de chutes <small>onde saiu cada finalização · xG estimado</small></div><div class="card-b"><p class="tc-txt">Carregando os chutes…</p></div></div>`;
  }
  async function desenha(el) {
    const corpo = el.querySelector(".card-b");
    let d;
    try {
      const r = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/${LIGA}/summary?event=${encodeURIComponent(el.dataset.chutes)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`ESPN respondeu ${r.status}`);
      d = await r.json();
    } catch (e) { corpo.innerHTML = `<p class="tc-txt">Chutes indisponíveis agora (${esc(e.message)}).</p>`; return; }
    const cs = d?.header?.competitions?.[0]?.competitors || [];
    const r = window.CHUTES_CALC.calcula(d?.commentary || [], cs.find((c) => c.homeAway === "home")?.team?.displayName, cs.find((c) => c.homeAway === "away")?.team?.displayName);
    if (!r.chutes.length) { corpo.innerHTML = `<p class="tc-txt">O mapa aparece com a primeira finalização do jogo.</p>`; return; }
    const H = byId[el.dataset.h], A = byId[el.dataset.a];
    const corH = window.GFX.display(H), corA0 = window.GFX.display(A), corA = corA0 === corH ? "var(--accent)" : corA0;
    const linha = (rot, a, b) => `<tr><td>${a}</td><th scope="row">${rot}</th><td>${b}</td></tr>`;
    corpo.innerHTML = `<div class="ch-times"><span><i style="background:${corH}"></i>${esc(H.abbr)} → ataca para a direita</span><span>ataca para a esquerda ← ${esc(A.abbr)}<i style="background:${corA}"></i></span></div>
      <div class="ch-campo">${window.CHUTES_CALC.svg(r, corH, corA, H.abbr, A.abbr)}</div>
      <div class="ch-leg"><span><b class="m gol"></b>gol</span><span><b class="m alvo"></b>no alvo</span><span><b class="m fora"></b>para fora</span><span><b class="m bloq">×</b>bloqueado</span><span>quanto maior, maior o xG</span></div>
      <table class="ch-tab"><tbody>
        ${linha("Finalizações", r.casa.chutes, r.fora.chutes)}${linha("No alvo", r.casa.alvo, r.fora.alvo)}${linha("Gols", r.casa.gols, r.fora.gols)}
        ${linha("xG estimado", f2(r.casa.xg), f2(r.fora.xg))}</tbody></table>
      <p class="tc-txt">xG: a chance de cada chute virar gol pela distância e pelo ângulo para o gol (cabeceio vale menos). Estimativa do CazéStats.TV com os lances da ESPN; passe o dedo ou o mouse num chute para ver quem chutou.</p>`;
  }
  function mount(view) {
    (view || document).querySelectorAll("[data-chutes]:not([data-ch-ok])").forEach((el) => {
      el.dataset.chOk = "1";
      desenha(el);
      if (el.dataset.st === "progress") {
        const t = setInterval(() => { if (!el.isConnected) return clearInterval(t); if (!document.hidden) desenha(el); }, 60e3);
      }
    });
  }
  window.CHUTES = { card, mount };
})();
