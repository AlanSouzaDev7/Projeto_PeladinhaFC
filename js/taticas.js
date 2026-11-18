/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — escalações dos jogos e campinho tático da partida
     · Página da partida: "Campinho tático" editável dos dois times. Parte da escalação anunciada daquele jogo (ESPN,
       X, Instagram) ou, com o jogo encerrado, da escalação que entrou em campo; sem nenhuma das duas, da escalação do
       último jogo do técnico. Dá para pôr QUALQUER jogador do elenco: titular, reserva ou não relacionado (lista
       "Elenco completo"), trocar a formação e arrastar para qualquer ponto da grama. Fica salvo por jogo e por time.
     · Aba "Escalações" do clube: a escalação de cada jogo da temporada (passado e o próximo, quando anunciada), num
       campinho de leitura, com quem entrou durante o jogo; "Montar a minha" abre o mesmo jogo no campinho editável.
   Dados: dados/escalacoes-jogos/<clube>.json (súmulas da ESPN, gravado pelo robô), dados/escalacoes.json (anúncio) e o
   calendário do clube (club-form) para data, competição, adversário e placar. Fonte ESPN: risco J4 (lembrete).
   ========================================================================== */
(() => {
  "use strict";
  const esc = (t) => SEG.esc(t);
  const { byId } = window.PD;
  const crest = (c, n) => window.GFX.crest(c, n);
  const dataBR = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
  const chaveDe = (jogo, cid) => `placar:xi-jogo:${String(jogo).replace(/[^\w.-]/g, "").slice(0, 40)}:${cid}`;

  const jogosDo = (cid) => DADOS.carrega(`escalacoes-jogos/${cid}`).then((d) => d || {});
  const anunciada = (cid) => {
    const a = window.ESCALACOES?.clubes?.[cid];
    const f = a && a.confirmada && (a.fontes || [])[0];
    return f && f.xi && f.formacao ? { jogo: a.jogo || {}, f: f.formacao, xi: f.xi, fonte: f.fonte } : null;
  };

  /* contexto do campinho editável de um jogo: de onde vem a escalação inicial */
  function preparaJogo(jogoId, cid, lineups) {
    const chave = chaveDe(jogoId, cid);
    const an = anunciada(cid), real = lineups[jogoId];
    let inicial, rotulo, fonte;
    if (real) {
      inicial = () => LINEUP.deJogo(cid, real);
      rotulo = "do jogo";
      fonte = `Escalação que entrou em campo (${real.f}), pela súmula da ESPN. Troque, arraste e ponha qualquer jogador do elenco.`;
    } else if (an && String(an.jogo.id) === String(jogoId)) {
      inicial = () => LINEUP.deJogo(cid, { f: an.f, xi: an.xi });
      rotulo = "anunciada";
      fonte = `Escalação anunciada para este jogo (${an.f}, ${an.fonte}). Troque, arraste e ponha qualquer jogador do elenco.`;
    } else {
      inicial = () => LINEUP.fromLastMatch(cid);
      rotulo = "do último jogo";
      fonte = "Escalação ainda não anunciada: o ponto de partida é a do técnico no último jogo. Monte a sua com qualquer jogador do elenco.";
    }
    return LINEUP.contexto(chave, { inicial, rotulo, fonte });
  }

  /* ---------- página da partida ---------- */
  function cardPartida(m) {
    const jogo = m.espn || m.id;
    return `<section class="card tat-card" data-tatica="${esc(jogo)}|${esc(m.home)}|${esc(m.away)}">
      <div class="card-h">Campinho tático <small>edite as duas escalações: titulares, reservas e quem não foi relacionado</small></div>
      <div class="tabs tat-tabs" role="tablist">
        <button class="tab on" role="tab" data-tat-lado="${esc(m.home)}">${crest(byId[m.home], 18)} ${esc(byId[m.home].name)}</button>
        <button class="tab" role="tab" data-tat-lado="${esc(m.away)}">${crest(byId[m.away], 18)} ${esc(byId[m.away].name)}</button>
      </div>
      <div class="tat-corpo"><div class="empty" style="padding:24px">Carregando as escalações…</div></div>
    </section>`;
  }
  async function montaPartida(el, cid) {
    const [jogo] = el.dataset.tatica.split("|");
    const lineups = await jogosDo(cid);
    if (!el.isConnected) return;
    const chave = preparaJogo(jogo, cid, lineups);
    el.querySelector(".tat-corpo").innerHTML = LINEUP.builder(cid, true, chave);
    el.querySelectorAll("[data-tat-lado]").forEach((b) => b.classList.toggle("on", b.dataset.tatLado === cid));
  }

  /* ---------- aba Escalações do clube ---------- */
  const ui = { sel: {} };
  function campoLeitura(cid, l) {
    const F = LINEUP.F, s = LINEUP.deJogo(cid, l);
    if (!s) return `<div class="empty" style="padding:18px">Escalação incompleta na súmula.</div>`;
    const ps = Object.fromEntries(LINEUP.players(cid).map((p) => [p.id, p]));
    const nome = (id) => { const x = l.xi.find((r) => String(r[1]) === String(id)); return (x && x[2]) || ps[id]?.name || "—"; };
    const c = byId[cid];
    const fichas = F[l.f].map(([role, , x, dd, da], i) => {
      const id = s.xi[i], y = 96 - ((dd + da) / 2) * 1.14, p = ps[id];
      return `<div class="tat-f" style="left:${x}%;top:${y}%"><span class="tk" style="--tc:${c.colors[0]};--tb:${c.colors[1]};--to:${window.GFX.onColor(c.colors[0])}">${p?.n ?? "–"}</span><b>${esc(nome(id).split(" ").slice(-1)[0])}</b><i>${esc(role)}</i></div>`;
    }).join("");
    return `<div class="pitch tat-pitch"><svg class="lines" viewBox="0 0 68 100" preserveAspectRatio="none" fill="none" stroke="rgba(255,255,255,.45)" stroke-width=".4"><rect x="2" y="2" width="64" height="96"/><line x1="2" y1="50" x2="66" y2="50"/><circle cx="34" cy="50" r="9"/><rect x="14" y="2" width="40" height="16"/><rect x="24" y="2" width="20" height="6"/><rect x="14" y="82" width="40" height="16"/><rect x="24" y="92" width="20" height="6"/></svg>${fichas}</div>`;
  }
  function abaClube(cid) {
    return `<div class="tat-aba" data-tat-clube="${esc(cid)}"><div class="card"><div class="empty" style="padding:24px">Carregando as escalações da temporada…</div></div></div>`;
  }
  async function montaAba(el) {
    const cid = el.dataset.tatClube;
    const [lineups] = await Promise.all([jogosDo(cid), DADOS.carrega("club-form"), DADOS.carrega("escalacoes")]);
    if (!el.isConnected) return;
    const cal = (window.CLUB_FORM?.clubs?.[cid]?.all || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const an = anunciada(cid);
    const lista = [];
    if (an) lista.push({ id: String(an.jogo.id), date: an.jogo.data, comp: an.jogo.comp, opp: an.jogo.adversario, home: an.jogo.casa, anunciada: true });
    for (const g of cal) if (lineups[g.id] && !lista.some((x) => x.id === String(g.id))) lista.push({ ...g, id: String(g.id) });
    if (!lista.length) { el.innerHTML = `<div class="card"><div class="empty" style="padding:24px">Ainda não há escalações registradas nesta temporada.</div></div>`; return; }
    const sel = lista.find((g) => g.id === ui.sel[cid]) || lista[0];
    ui.sel[cid] = sel.id;
    const l = sel.anunciada ? { f: an.f, xi: an.xi.map(([lugar, id]) => [lugar, id, LINEUP.players(cid).find((p) => p.id === String(id))?.name || ""]) } : lineups[sel.id];
    const placar = sel.gf != null ? `${sel.home ? `${sel.gf} x ${sel.ga}` : `${sel.ga} x ${sel.gf}`}` : "";
    const titulo = sel.home ? `${esc(byId[cid].abbr)} ${placar || "x"} ${esc(sel.opp || "")}` : `${esc(sel.opp || "")} ${placar || "x"} ${esc(byId[cid].abbr)}`;
    el.innerHTML = `<div class="tat-grade">
      <div class="card tat-lista"><div class="card-h">Jogos <small>${lista.length} escalações · súmulas da ESPN</small></div>
        <ul>${lista.map((g) => `<li><button class="tat-jogo${g.id === sel.id ? " on" : ""}" data-tat-jogo="${esc(g.id)}">
          <span>${g.anunciada ? '<i class="tat-novo">anunciada</i>' : esc(dataBR(g.date))}</span><b>${g.home ? "x" : "@"} ${esc(g.opp || "")}</b>
          <small>${esc(g.comp || "")}${g.res ? ` · ${esc(g.res)}` : ""}</small></button></li>`).join("")}</ul></div>
      <div class="card tat-detalhe">
        <div class="card-h">${titulo} <small>${esc(sel.comp || "")} · ${sel.anunciada ? "escalação anunciada" : esc(dataBR(sel.date))} · ${esc(l.f)}</small></div>
        ${campoLeitura(cid, l)}
        ${l.entraram?.length ? `<div class="tat-entraram"><b>Entraram durante o jogo</b>${l.entraram.map(([, n, min]) => `<span>${esc(n)} <small>${min}'</small></span>`).join("")}</div>` : ""}
        <div class="tat-acoes"><button class="chip" data-tat-editar="${esc(sel.id)}">Montar a minha neste jogo ›</button></div>
        <div class="tat-editor"></div>
      </div></div>`;
  }

  /* ---------- cliques ---------- */
  document.addEventListener("click", (e) => {
    const lado = e.target.closest("[data-tat-lado]");
    if (lado) { const card = lado.closest("[data-tatica]"); if (card) montaPartida(card, lado.dataset.tatLado); return; }
    const jogo = e.target.closest("[data-tat-jogo]");
    if (jogo) { const aba = jogo.closest("[data-tat-clube]"); ui.sel[aba.dataset.tatClube] = jogo.dataset.tatJogo; montaAba(aba); return; }
    const ed = e.target.closest("[data-tat-editar]");
    if (ed) {
      const aba = ed.closest("[data-tat-clube]"), cid = aba.dataset.tatClube;
      jogosDo(cid).then((lineups) => {
        const chave = preparaJogo(ed.dataset.tatEditar, cid, lineups);
        const alvo = aba.querySelector(".tat-editor");
        alvo.innerHTML = LINEUP.builder(cid, true, chave);
        alvo.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      });
    }
  });

  function mount(root) {
    const card = root.querySelector("[data-tatica]");
    if (card) montaPartida(card, card.dataset.tatica.split("|")[1]);
    const aba = root.querySelector("[data-tat-clube]");
    if (aba) montaAba(aba);
  }
  window.TATICA = { cardPartida, abaClube, mount };
})();
