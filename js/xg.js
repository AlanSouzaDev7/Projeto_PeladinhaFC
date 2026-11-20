/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — xG na temporada (#/xg): quem cria mais chances, quem sofre menos e quem finaliza acima do esperado
   Dados: dados/xg.json (server/xg.py), montado pelo robô a partir do xG de cada chute (o mesmo modelo de js/chutes.js).
   ========================================================================== */
(() => {
  "use strict";
  const esc = (t) => SEG.esc(t);
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const f1 = (v) => n(v).toFixed(1).replace(".", ",");
  const sinal = (v) => `${n(v) > 0 ? "+" : ""}${f1(v)}`;
  let ordem = "xg";

  function page() {
    return `<div class="page-head"><div><h1>xG no Brasileirão</h1>
      <p>xG (gols esperados) mede a qualidade das chances: cada chute vale a chance de virar gol pela distância e pelo ângulo para o gol. Quem tem xG alto cria boas chances; quem marca mais que o xG está finalizando acima do esperado.</p></div></div>
      <div data-xg><p class="st-txt">Carregando o xG da temporada…</p></div>`;
  }
  const COLS = [["xg", "xG pró"], ["gols", "Gols"], ["xgc", "xG contra"], ["gc", "Sofridos"], ["saldo", "Saldo de xG"], ["dif", "Gols − xG"]];
  function tabela(clubes) {
    const linhas = clubes.map((c) => ({ ...c, saldo: n(c.xg) - n(c.xgc), dif: n(c.gols) - n(c.xg) }))
      .sort((a, b) => (ordem === "xgc" || ordem === "gc" ? n(a[ordem]) - n(b[ordem]) : n(b[ordem]) - n(a[ordem])));
    const max = Math.max(1, ...linhas.map((c) => n(c.xg)));
    return `<div class="xg-tab-rola"><table class="table xg-tab"><thead><tr><th>#</th><th class="club">Clube</th><th>J</th>
      ${COLS.map(([k, l]) => `<th><button type="button" data-xg-ordem="${k}" class="${ordem === k ? "on" : ""}" aria-pressed="${ordem === k}">${l}</button></th>`).join("")}</tr></thead><tbody>
      ${linhas.map((c, i) => {
        const cl = byId[c.id];
        return `<tr><td>${i + 1}</td><td class="club"><a href="#/clube/${esc(c.id)}">${cl ? window.GFX.crest(cl, 20) : ""}<span>${esc(cl?.abbr || c.id)}</span></a><i class="xg-barra" style="--p:${(n(c.xg) / max) * 100}%"></i></td><td>${n(c.jogos)}</td>
          <td><b>${f1(c.xg)}</b></td><td>${n(c.gols)}</td><td>${f1(c.xgc)}</td><td>${n(c.gc)}</td><td class="${c.saldo >= 0 ? "xg-mais" : "xg-menos"}">${sinal(c.saldo)}</td><td class="${c.dif >= 0 ? "xg-mais" : "xg-menos"}">${sinal(c.dif)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }
  function jogadores(lista, titulo, sub, valor) {
    if (!lista.length) return "";
    return `<section class="card"><div class="card-h">${esc(titulo)} <small>${esc(sub)}</small></div><div class="card-b"><ol class="xg-jog">
      ${lista.map((j) => `<li><a href="#/jogador/${esc(j.key)}">${byId[j.clube] ? window.GFX.crest(byId[j.clube], 20) : ""}<span>${esc(j.n)}</span><small>${esc(byId[j.clube]?.abbr || j.clube)} · ${n(j.ch)} chutes · ${n(j.g)} gols</small></a><b>${valor(j)}</b></li>`).join("")}
    </ol></div></section>`;
  }
  async function preenche(el) {
    const d = await DADOS.carrega("xg");
    if (!el.isConnected) return;
    if (!d?.clubes?.length) { el.innerHTML = `<section class="card"><div class="card-b"><p class="st-txt">O xG da temporada aparece depois da próxima rodada do robô (ele está calculando o xG de cada chute de todos os jogos).</p></div></section>`; return; }
    const js = d.jogadores || [];
    el.innerHTML = `<section class="card"><div class="card-h">Clubes <small>toque no título da coluna para ordenar · ${esc(d.updated || "")}</small></div><div class="card-b" data-xg-tabela>${tabela(d.clubes)}</div></section>
      <div class="grid-2">
        ${jogadores(js.slice(0, 15), "Quem cria mais chances", "xG na temporada", (j) => f1(j.xg))}
        <div>
          ${jogadores([...js].sort((a, b) => b.dif - a.dif).slice(0, 8), "Finalizam acima do esperado", "gols − xG", (j) => sinal(j.dif))}
          ${jogadores([...js].sort((a, b) => a.dif - b.dif).slice(0, 8), "Finalizam abaixo do esperado", "gols − xG", (j) => sinal(j.dif))}
        </div>
      </div>
      <p class="source">Modelo do CazéStats.TV: ${esc(d.modelo || "")}. Lances da ESPN com a posição de cada chute; jogadores com pelo menos 8 chutes no Brasileirão.</p>`;
    el.querySelector("[data-xg-tabela]").addEventListener("click", (e) => {
      const b = e.target.closest("[data-xg-ordem]");
      if (!b) return;
      ordem = b.dataset.xgOrdem;
      el.querySelector("[data-xg-tabela]").innerHTML = tabela(d.clubes);
    });
  }
  function mount(view) {
    const el = (view || document).querySelector("[data-xg]:not([data-xg-ok])");
    if (!el) return;
    el.dataset.xgOk = "1";
    preenche(el);
  }
  window.XG = { page, mount };
})();
