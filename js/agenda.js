/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — botão "Agenda no celular" da página do clube (agenda do favorito)
   O calendário vem do Worker (GET <api>/agenda/<clube>.ics). O torcedor ASSINA o endereço, não baixa um arquivo:
   o Google Agenda e o app Calendário do iPhone buscam de novo sozinhos, então mudança de data ou horário aparece no
   celular sem fazer nada.
     · Google Agenda: abre a tela "Adicionar agenda" com o endereço já preenchido (calendar.google.com/...?cid=webcal://...)
     · iPhone, Mac e Outlook: o link webcal:// abre o app de calendário pedindo para assinar
     · Copiar link: para colar em qualquer outro aplicativo de calendário
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const esc = (t) => SEG.esc(t);

  const endereco = (cid) => `${API}/agenda/${encodeURIComponent(cid)}.ics`;
  function botao(cid) {
    if (!/^https:\/\//.test(API)) return "";
    const https = endereco(cid), webcal = https.replace(/^https:/, "webcal:");
    const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
    return `<details class="agenda">
      <summary class="alerta-btn agenda-btn"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2Zm12 8H5v9h14v-9ZM7 12h4v4H7v-4Z"/></svg><span>Agenda no celular</span></summary>
      <div class="agenda-menu">
        <p>Os jogos entram no seu calendário e se atualizam sozinhos quando a data ou o horário mudam.</p>
        <a href="${esc(google)}" target="_blank" rel="noopener">Google Agenda</a>
        <a href="${esc(webcal)}">iPhone, Mac ou Outlook</a>
        <button type="button" data-agenda-copiar="${esc(https)}">Copiar link</button>
        <span class="agenda-msg" role="status" aria-live="polite"></span>
      </div></details>`;
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-agenda-copiar]");
    if (b) {
      e.preventDefault();
      const msg = b.parentElement.querySelector(".agenda-msg");
      try {
        await navigator.clipboard.writeText(b.dataset.agendaCopiar);
        msg.textContent = "Link copiado. No seu calendário, procure \"Adicionar agenda pelo URL\" e cole.";
      } catch {
        msg.textContent = b.dataset.agendaCopiar; // sem acesso à área de transferência: mostra o link para copiar à mão
      }
      return;
    }
    // clicar fora fecha o menu
    document.querySelectorAll("details.agenda[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });

  window.AGENDA = { botao, endereco };
})();
