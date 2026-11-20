/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — página de status (#/status) e página de fontes e créditos (#/creditos)
     · status: quando cada parte do sistema trabalhou pela última vez (GET <api>/status, worker/status.mjs)
     · créditos: de onde vem cada dado e a licença de cada fonte (exigência da Wikipédia, CC BY-SA)
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const esc = (t) => SEG.esc(t);
  const ROTULO = { ok: "Funcionando", atencao: "Atrasado", fora: "Parado", "sem-dado": "Sem registro" };
  const GERAL = { ok: "Tudo funcionando", atencao: "Alguma parte está atrasada", fora: "Alguma parte parou" };
  const ha = (ms) => {
    if (!ms) return "nunca registrado";
    const min = Math.max(0, Math.round((Date.now() - ms) / 60e3));
    return min < 1 ? "agora há pouco" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} d`;
  };

  function pageStatus() {
    return `<div class="page-head"><div><h1>Status do sistema</h1><p>Quando cada parte do CazéStats.TV trabalhou pela última vez. A página se atualiza sozinha a cada minuto.</p></div></div>
      <section class="card st-card" data-status><div class="card-b"><p class="st-txt">Consultando…</p></div></section>`;
  }
  async function preencheStatus(el) {
    let s;
    try {
      const r = await fetch(`${API}/status`, { cache: "no-store" });
      s = await SEG.json(r);
      if (!s?.itens) throw new Error(`servidor respondeu ${r.status}`);
    } catch (e) {
      el.querySelector(".card-b").innerHTML = `<p class="st-geral fora"><i></i>Servidor fora do alcance</p><p class="st-txt">${esc(e.message)}. O site continua mostrando os últimos dados guardados.</p>`;
      return;
    }
    const geral = ["ok", "atencao", "fora"].includes(s.geral) ? s.geral : "atencao";
    el.querySelector(".card-b").innerHTML = `<p class="st-geral ${geral}"><i></i>${GERAL[geral]}</p>
      <ul class="st-lista">${s.itens.map((i) => {
        const e = ROTULO[i.estado] ? i.estado : "sem-dado";
        return `<li class="${e}"><i aria-hidden="true"></i><div><b>${esc(i.nome)}</b><small>${esc(i.explica || "")}</small></div><span>${ROTULO[e]}<small>${i.id === "banco" ? "respondeu agora" : ha(Number(i.quando) || 0)}</small></span></li>`;
      }).join("")}</ul>
      <p class="st-txt">Conferido ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Se alguma parte parar, o site continua no ar com os últimos dados guardados.</p>`;
  }

  const FONTES = [
    ["ESPN", "placar ao vivo, tabela, jogos, escalações, estatísticas e lista de clubes de cada atleta", "dados públicos da ESPN, usados com referência à fonte"],
    ["Wikipédia (português e inglês)", "carreira dos jogadores (clubes e anos da caixa de informações)", "Creative Commons Atribuição-CompartilhaIgual (CC BY-SA 4.0)", "https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br"],
    ["Wikidata", "identificação dos jogadores e carreira de reserva", "domínio público (CC0)", "https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br"],
    ["ogol.com.br", "carreira de jogadores sem artigo na Wikipédia", "dados factuais, com link para a fonte"],
    ["Wikimedia Commons e Flickr", "fotos livres de jogadores e escudos (autor e licença na própria foto)", "licença de cada arquivo (CC BY, CC BY-SA ou domínio público)"],
    ["Google Notícias", "manchetes (título, veículo, data e link): arbitragem, onde assistir, mercado", "só o título e o link; a matéria abre no site do veículo"],
    ["Torcida do CazéStats.TV", "Craque do jogo, quem vence, bolão e palpites", "dados próprios do CazéStats.TV"],
  ];
  function pageCreditos() {
    return `<div class="page-head"><div><h1>Fontes e créditos</h1><p>De onde vem cada informação do CazéStats.TV e a licença de cada fonte.</p></div></div>
      <section class="card"><div class="card-b"><ul class="cr-lista">${FONTES.map(([n, o, l, u]) => `<li><b>${esc(n)}</b><span>${esc(o)}</span><small>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>` : esc(l)}</small></li>`).join("")}</ul>
        <p class="st-txt">As carreiras tiradas da Wikipédia são uma adaptação (só clubes e anos) do conteúdo dos artigos de cada jogador e seguem a mesma licença CC BY-SA 4.0. Estatísticas próprias (notas, chance de vitória, mapa de calor, resumo) são cálculos do CazéStats.TV sobre esses dados.</p>
        <p class="st-txt">Nomes e marcas de clubes e competições pertencem aos seus donos. Encontrou um erro? Fale com o autor pela <a href="https://github.com/AlanSouzaDev7" target="_blank" rel="noopener noreferrer">página no GitHub ↗</a>.</p></div></section>`;
  }

  let timer = null;
  function mount(view) {
    const el = (view || document).querySelector("[data-status]:not([data-st-ok])");
    clearInterval(timer);
    if (!el) return;
    el.dataset.stOk = "1";
    preencheStatus(el);
    timer = setInterval(() => (el.isConnected ? preencheStatus(el) : clearInterval(timer)), 60e3);
  }

  window.STATUS = { pageStatus, pageCreditos, mount };
})();
