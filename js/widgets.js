/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — página #/widgets: monta o código do widget para outros sites colarem (widget/index.html)
   Escolhe o tipo (tabela, clube ou jogo), o clube ou jogo e o tema; mostra a prévia e o <iframe> para copiar.
   ========================================================================== */
(() => {
  "use strict";
  const esc = (t) => SEG.esc(t);
  const SITE = "https://cazestats.pages.dev/";
  const ALTURA = { tabela: 640, clube: 430, jogo: 150 };

  function page() {
    const clubes = typeof byId !== "undefined" ? Object.values(byId).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : [];
    return `<div class="page-head"><div><h1>Widgets do CazéStats.TV</h1>
      <p>Tabela, jogos do seu clube ou placar de um jogo para colar no seu site, blog ou portal. Grátis, atualiza sozinho a cada minuto e não usa cookies.</p></div></div>
      <div class="wg-grade" data-widgets>
        <section class="card"><div class="card-b wg-form">
          <label>Tipo<select data-wg="tipo"><option value="tabela">Tabela do Brasileirão</option><option value="clube">Jogos de um clube</option><option value="jogo">Placar de um jogo</option></select></label>
          <label data-wg-campo="clube" hidden>Clube<select data-wg="clube">${clubes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label>
          <label data-wg-campo="jogo" hidden>Jogo<select data-wg="jogo"></select></label>
          <label data-wg-campo="linhas">Linhas da tabela<select data-wg="linhas"><option value="20">20 (todas)</option><option value="10">10</option><option value="6">6</option></select></label>
          <label>Tema<select data-wg="tema"><option value="escuro">Escuro</option><option value="claro">Claro</option></select></label>
          <label>Código para colar<textarea data-wg="codigo" rows="5" readonly></textarea></label>
          <button type="button" class="bl-btn" data-wg-copiar>Copiar código</button>
          <p class="st-txt wg-msg" role="status" aria-live="polite"></p>
          <p class="st-txt">Use à vontade, mantendo o rodapé com a marca e o link do CazéStats.TV.</p>
        </div></section>
        <section class="card wg-previa"><div class="card-h">Prévia</div><div class="card-b"><iframe data-wg="previa" title="Prévia do widget" loading="lazy"></iframe></div></section>
      </div>`;
  }
  function jogosDaRodada() {
    const lista = (window.PD?.realMatches?.(window.PD.ROUND) || []).concat();
    return lista.map((m) => ({ id: m.id, nome: `${byId[m.home]?.abbr || m.home} x ${byId[m.away]?.abbr || m.away}` }));
  }
  function atualiza(root) {
    const v = (k) => root.querySelector(`[data-wg="${k}"]`).value;
    const tipo = v("tipo");
    root.querySelectorAll("[data-wg-campo]").forEach((c) => { c.hidden = c.dataset.wgCampo !== tipo && !(c.dataset.wgCampo === "linhas" && tipo === "tabela"); });
    const p = new URLSearchParams({ tipo });
    if (tipo === "clube") p.set("clube", v("clube"));
    if (tipo === "jogo" && v("jogo")) p.set("jogo", v("jogo"));
    if (tipo === "tabela" && v("linhas") !== "20") p.set("linhas", v("linhas"));
    if (v("tema") === "claro") p.set("tema", "claro");
    const altura = tipo === "tabela" ? Math.round(ALTURA.tabela * (Number(v("linhas")) / 20)) + 90 : ALTURA[tipo];
    const local = `widget/?${p}`, publico = `${SITE}widget/?${p}`;
    root.querySelector('[data-wg="codigo"]').value = `<iframe src="${publico}" title="CazéStats.TV" width="100%" height="${altura}" style="border:0;max-width:480px" loading="lazy"></iframe>`;
    const f = root.querySelector('[data-wg="previa"]');
    f.style.height = `${altura}px`;
    if (f.getAttribute("src") !== local) f.setAttribute("src", local);
  }
  function mount(view) {
    const root = (view || document).querySelector("[data-widgets]:not([data-wg-ok])");
    if (!root) return;
    root.dataset.wgOk = "1";
    const sel = root.querySelector('[data-wg="jogo"]');
    sel.innerHTML = jogosDaRodada().map((j) => `<option value="${esc(j.id)}">${esc(j.nome)}</option>`).join("");
    root.addEventListener("change", () => atualiza(root));
    root.querySelector("[data-wg-copiar]").addEventListener("click", async () => {
      const t = root.querySelector('[data-wg="codigo"]'), msg = root.querySelector(".wg-msg");
      try { await navigator.clipboard.writeText(t.value); msg.textContent = "Código copiado. É só colar no seu site."; } catch { t.select(); msg.textContent = "Selecione e copie o código acima."; }
    });
    atualiza(root);
  }
  window.WIDGETS = { page, mount };
})();
