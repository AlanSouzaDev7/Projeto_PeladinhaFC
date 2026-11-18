/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — confronto direto na página da partida
   Os jogos entre os dois clubes em todas as competições e temporadas guardadas no histórico do banco
   (GET <Worker>/jogos?clube=&contra=, tabela jogos do D1), com o resumo de vitórias, empates e gols.
   Se o banco não responder, usa os jogos da temporada que o site já tem (club-form), para o card nunca ficar vazio.
   ========================================================================== */
(() => {
  "use strict";
  const esc = (t) => SEG.esc(t);
  const { byId } = window.PD;
  const { display } = window.GFX;
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const ID_OK = /^[a-z][a-z-]{1,30}$/;
  const cache = new Map(); // "h|a" -> promessa dos jogos (uma consulta por par por visita)

  const sigla = (id) => byId[id]?.short || byId[id]?.abbr || id;
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

  // jogos do histórico do banco, já no formato da tabela (casa_id, fora_id, gols_casa...)
  async function doBanco(h, a) {
    if (!API) throw new Error("sem banco");
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(`${API}/jogos?clube=${h}&contra=${a}&limite=50`, { signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await SEG.json(r);
      if (!Array.isArray(d.jogos)) throw new Error("resposta inesperada");
      if (!d.jogos.length) throw new Error("par ainda não está no histórico"); // ex.: banco recém-criado: vale a temporada
      return { jogos: d.jogos, fonte: "banco" };
    } finally {
      clearTimeout(t);
    }
  }
  // reserva: a temporada atual pelo calendário do clube (o mesmo arquivo da página de comparação)
  async function daTemporada(h, a) {
    const cf = await DADOS.carrega("club-form");
    const jogos = (cf?.clubs?.[h]?.all || [])
      .filter((e) => e.oppId === a && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ""))
      .map((e) => ({ id: e.id, data: e.date, competicao: e.comp, estado: e.state, casa_id: e.home ? h : a, fora_id: e.home ? a : h, gols_casa: e.home ? e.gf : e.ga, gols_fora: e.home ? e.ga : e.gf }))
      .reverse();
    return { jogos, fonte: "temporada" };
  }
  // cada jogo conferido na chegada: só passa data AAAA-MM-DD, placar inteiro e ids no formato do site
  const inteiro = (v) => (Number.isInteger(+v) && v !== null && v !== "" ? +v : null);
  const normaliza = ({ jogos, fonte }) => ({
    fonte,
    jogos: jogos
      .map((x) => ({ id: String(x.id ?? ""), data: String(x.data ?? ""), competicao: String(x.competicao ?? ""), estado: String(x.estado ?? ""),
        casa_id: String(x.casa_id ?? ""), fora_id: String(x.fora_id ?? ""), gols_casa: inteiro(x.gols_casa), gols_fora: inteiro(x.gols_fora) }))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.data)),
  });
  const busca = (h, a) => {
    const k = `${h}|${a}`;
    if (!cache.has(k)) cache.set(k, doBanco(h, a).catch(() => daTemporada(h, a)).then(normaliza));
    return cache.get(k);
  };

  // resumo do ponto de vista do mandante desta partida (h)
  function resumo(jogos, h) {
    const r = { j: 0, vh: 0, e: 0, va: 0, gh: 0, ga: 0 };
    for (const x of jogos) {
      if (x.estado !== "post" || x.gols_casa == null || x.gols_fora == null) continue;
      const gh = x.casa_id === h ? x.gols_casa : x.gols_fora, ga = x.casa_id === h ? x.gols_fora : x.gols_casa;
      r.j++; r.gh += gh; r.ga += ga;
      r[gh > ga ? "vh" : gh < ga ? "va" : "e"]++;
    }
    return r;
  }

  function html(el, { jogos, fonte }) {
    const h = el.dataset.h, a = el.dataset.a, H = byId[h], A = byId[a];
    const lista = jogos.filter((x) => x.id !== el.dataset.jogo && x.estado === "post" && x.gols_casa != null && x.gols_fora != null); // só jogos encerrados com placar
    const r = resumo(lista, h);
    const anos = lista.map((x) => x.data.slice(0, 4)).sort();
    const nota = fonte === "banco"
      ? `Histórico do CazéStats.TV${anos.length ? `, desde ${anos[0]}` : ""}: cresce a cada temporada`
      : "Temporada atual, pelo calendário dos dois clubes";
    if (!r.j) return `<div class="empty" style="padding:18px">${H.name} e ${A.name} ainda não se enfrentaram ${fonte === "banco" ? "no período guardado" : "nesta temporada"}.</div><div class="source">${nota}</div>`;
    // cores dos dois na barra; se forem iguais (Flamengo x Vasco: os dois vermelhos), o visitante fica neutro
    const corH = display(H), corA = display(A) === corH ? "var(--text-2)" : display(A);
    const pct = (n) => `${((n / r.j) * 100).toFixed(1)}%`;
    const linhas = lista.slice(0, 8).map((x, i) => {
      const gh = x.casa_id === h ? x.gols_casa : x.gols_fora, ga = x.casa_id === h ? x.gols_fora : x.gols_casa;
      const res = gh > ga ? "V" : gh < ga ? "D" : "E";
      return `<li class="fm-row" style="--i:${i}"><span class="fm-date"><b>${dataBR(x.data)}</b><small>${esc(x.competicao || "")}</small></span>`
        + `<span>${esc(sigla(x.casa_id))} x ${esc(sigla(x.fora_id))}</span><span class="fm-score"><b>${x.gols_casa}–${x.gols_fora}</b></span>`
        + `<span class="fm-res ${res}" title="resultado do ${esc(H.name)}">${res}</span></li>`;
    }).join("");
    return `<div class="cd-resumo">
        <div class="cd-num"><b style="color:${corH}">${r.vh}</b><small>${esc(H.abbr)} venceu</small></div>
        <div class="cd-num"><b>${r.e}</b><small>${r.e === 1 ? "empate" : "empates"}</small></div>
        <div class="cd-num"><b style="color:${corA}">${r.va}</b><small>${esc(A.abbr)} venceu</small></div>
      </div>
      <div class="cd-barra" role="img" aria-label="Em ${r.j} jogos: ${esc(H.name)} venceu ${r.vh}, ${r.e} empates, ${esc(A.name)} venceu ${r.va}">
        <i style="width:${pct(r.vh)};background:${corH}"></i><i style="width:${pct(r.e)}" class="cd-emp"></i><i style="width:${pct(r.va)};background:${corA}"></i>
      </div>
      <p class="cd-gols">${r.j} ${r.j === 1 ? "jogo" : "jogos"} · gols: <b>${esc(sigla(h))} ${r.gh}</b> x <b>${r.ga} ${esc(sigla(a))}</b></p>
      <ul class="cc-h2h fm-list">${linhas}</ul>
      <div class="source">${nota}</div>`;
  }

  /* o card (vazio) que a página da partida coloca; mount() preenche */
  function card(m) {
    if (!ID_OK.test(m.home || "") || !ID_OK.test(m.away || "") || !byId[m.home] || !byId[m.away]) return "";
    return `<div class="card confronto" data-confronto data-h="${m.home}" data-a="${m.away}" data-jogo="${esc(String(m.espn || ""))}">
      <div class="card-h">Confronto direto <small>${esc(sigla(m.home))} x ${esc(sigla(m.away))} · todas as competições</small></div>
      <div class="card-b cd-corpo"><div class="empty" style="padding:18px">Buscando o histórico…</div></div></div>`;
  }
  function mount(view) {
    (view || document).querySelectorAll("[data-confronto]:not([data-cd-ok])").forEach((el) => {
      el.dataset.cdOk = "1";
      busca(el.dataset.h, el.dataset.a)
        .then((d) => { el.querySelector(".cd-corpo").innerHTML = html(el, d); })
        .catch(() => { el.querySelector(".cd-corpo").innerHTML = `<div class="empty" style="padding:18px">Não deu para carregar o confronto agora.</div>`; });
    });
  }

  window.CONFRONTO = { card, mount, _resumo: resumo };
})();
