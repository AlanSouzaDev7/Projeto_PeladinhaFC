/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — bolão: palpite de placar, pontos, ranking geral e ligas entre amigos (servidor: worker/bolao.mjs)
     · cartão "Bolão" na página da partida: palpite até o jogo começar; depois, o palpite e os pontos ganhos
     · página #/bolao: ranking geral ou da liga, apelido, ligas (criar, entrar com código, convidar) e meus palpites
     · convite: #/bolao/entrar/<código> entra na liga (depois de entrar com Google e escolher o apelido)
   Precisa da conta (js/conta.js). No ranking aparece só o apelido escolhido pelo torcedor.
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const esc = (t) => SEG.esc(t);
  const ligado = () => !!(API && window.CONTA && CONTA.ligado);
  const logado = () => !!window.CONTA?.sessao();
  const REGRA = [["Placar exato", 10], ["Vencedor e saldo de gols", 7], ["Só o resultado", 5]];

  async function api(caminho, { metodo = "GET", corpo } = {}) {
    const s = window.CONTA?.sessao();
    const r = await fetch(`${API}${caminho}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: s ? { authorization: `Bearer ${s.sessao}` } : {} });
    let d = {};
    try { d = await SEG.json(r); } catch { /* resposta sem JSON */ }
    if (!r.ok) throw new Error(d.erro || `servidor respondeu ${r.status}`);
    return d;
  }
  // os dados do torcedor (apelido, palpites, ligas): uma busca por visita, refeita depois de cada mudança
  let meuP = null;
  const meu = (novo) => (meuP = !novo && meuP ? meuP : api("/bolao/eu").catch((e) => { meuP = null; throw e; }));
  const sigla = (id) => (typeof byId !== "undefined" && byId[id]?.abbr) || id;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0); // números do servidor sempre como número na página
  const entrarBtn = (txt = "Entrar com Google") => `<button type="button" class="bl-btn" data-bl="entrar">${txt}</button>`;
  const explica = (p) => (p === 10 ? "placar exato" : p === 7 ? "vencedor e saldo" : p === 5 ? "acertou o resultado" : "não foi dessa vez");

  /* ---------- cartão da partida ---------- */
  function card(m) {
    if (!ligado() || !m.espn) return "";
    return `<div class="card bolao" data-bolao="${esc(String(m.espn))}" data-h="${esc(m.home)}" data-a="${esc(m.away)}" data-st="${esc(m.status)}" data-kick="${esc(String(m.kick || ""))}">
      <div class="card-h">Bolão <small><a href="#/bolao">ver ranking</a></small></div><div class="card-b bl-corpo"><p class="bl-txt">Carregando…</p></div></div>`;
  }
  const passo = (lado, v) => `<div class="bl-time"><span>${esc(sigla(lado.id))}</span>
    <div class="bl-passo"><button type="button" data-bl-passo="${lado.k}" data-d="-1" aria-label="Menos um gol para ${esc(sigla(lado.id))}">−</button>
    <output data-bl-gols="${lado.k}" aria-live="polite">${v}</output>
    <button type="button" data-bl-passo="${lado.k}" data-d="1" aria-label="Mais um gol para ${esc(sigla(lado.id))}">+</button></div></div>`;
  async function preencheCard(el) {
    const corpo = el.querySelector(".bl-corpo"), jogo = el.dataset.bolao, h = el.dataset.h, a = el.dataset.a, aberto = !["progress", "ft"].includes(el.dataset.st) && !(Number(el.dataset.kick) && Number(el.dataset.kick) <= Date.now()); // o servidor confere de novo
    if (!logado()) {
      corpo.innerHTML = `<p class="bl-txt">${aberto ? "Dê seu palpite de placar, some pontos e dispute com os amigos." : "Participe do bolão nos próximos jogos: palpite de placar, pontos e ranking."}</p>${entrarBtn()}`;
      return;
    }
    let d;
    try { d = await meu(); } catch (e) { corpo.innerHTML = `<p class="bl-txt">Não deu para carregar o bolão (${esc(e.message)}).</p>`; return; }
    const p = d.palpites.find((x) => x.jogo === jogo);
    if (aberto) {
      corpo.innerHTML = `<div class="bl-placar">${passo({ id: h, k: "casa" }, p ? n(p.casa) : 0)}<b class="bl-x">x</b>${passo({ id: a, k: "fora" }, p ? n(p.fora) : 0)}</div>
        <button type="button" class="bl-btn" data-bl="salvar">${p ? "Atualizar palpite" : "Salvar palpite"}</button>
        <p class="bl-txt bl-msg" role="status" aria-live="polite">${p ? `Seu palpite: ${esc(sigla(h))} ${n(p.casa)} x ${n(p.fora)} ${esc(sigla(a))}. Dá para mudar até o jogo começar.` : "Exato vale 10, vencedor e saldo 7, só o resultado 5."}</p>
        ${d.apelido ? "" : `<p class="bl-txt"><a href="#/bolao">Escolha um apelido</a> para aparecer no ranking.</p>`}`;
      return;
    }
    corpo.innerHTML = p
      ? `<p class="bl-res">Seu palpite: <b>${esc(sigla(h))} ${n(p.casa)} x ${n(p.fora)} ${esc(sigla(a))}</b></p>
         <p class="bl-txt">${p.pontos == null ? "Os pontos entram quando o jogo terminar." : `<b class="bl-pts${p.pontos ? "" : " zero"}">+${n(p.pontos)} pontos</b> (${explica(n(p.pontos))})`}</p>`
      : `<p class="bl-txt">Palpites encerrados: o jogo já começou. <a href="#/bolao">Ver ranking</a></p>`;
  }
  function mount(view) {
    if (!ligado()) return;
    (view || document).querySelectorAll("[data-bolao]:not([data-bl-ok])").forEach((el) => { el.dataset.blOk = "1"; preencheCard(el); });
    (view || document).querySelectorAll("[data-bolao-pagina]:not([data-bl-ok])").forEach((el) => { el.dataset.blOk = "1"; preenchePagina(el); });
  }

  /* ---------- página #/bolao ---------- */
  function page(id, tab) {
    const regra = REGRA.map(([t, p]) => `<li><b>${p}</b> ${t}</li>`).join("");
    return `<section class="wrap bolao-pagina">
      <header class="bl-topo"><h1>Bolão</h1>
        <p>Dê palpite no placar dos jogos até a bola rolar. Os pontos entram quando o jogo termina.</p>
        <ul class="bl-regra">${regra}</ul></header>
      <div data-bolao-pagina data-id="${esc(id || "")}" data-tab="${esc(tab || "")}"><p class="bl-txt">Carregando o bolão…</p></div></section>`;
  }
  // rodadas do bolão: os jogos encerrados de cada rodada, pelos ids da ESPN (os mesmos dos palpites)
  const jogosDaRodada = (rd) => (window.PD?.realMatches?.(rd) || []).filter((m) => m.espn && m.status === "ft").map((m) => String(m.espn));
  function ultimaRodada() {
    for (let rd = window.PD?.ROUND || 0; rd >= 1; rd--) if (jogosDaRodada(rd).length) return rd;
    return 0;
  }
  function tabelaRanking(r) {
    if (!r.linhas.length) return `<p class="bl-txt">${r.rodada ? "Ninguém pontuou nos jogos encerrados desta rodada." : r.liga ? "Ninguém da liga pontuou ainda." : "O ranking aparece depois do primeiro jogo encerrado com palpites."}</p>`;
    // rei da rodada: quem fez mais pontos nos jogos dela (empate divide a coroa)
    const rei = (x) => r.rodada && x.pos === 1 && x.pontos > 0;
    const linha = (x) => `<tr class="${x.voce ? "voce" : ""}${rei(x) ? " bl-rei" : ""}"><td>${n(x.pos)}º</td><th scope="row">${esc(x.apelido)}${x.voce ? " <small>(você)</small>" : ""}${rei(x) ? ' <span class="bl-coroa">Rei da rodada</span>' : ""}</th><td><b>${n(x.pontos)}</b></td><td>${n(x.exatos)}</td><td>${n(x.jogos)}</td></tr>`;
    const fora = r.voce && !r.linhas.some((x) => x.voce) ? `<tr class="bl-sep"><td colspan="5">…</td></tr>${linha(r.voce)}` : "";
    return `<table class="bl-tabela"><thead><tr><th scope="col">Pos.</th><th scope="col">Torcedor</th><th scope="col">Pontos</th><th scope="col" title="Placares exatos">Exatos</th><th scope="col">Jogos</th></tr></thead>
      <tbody>${r.linhas.map(linha).join("")}${fora}</tbody></table>${r.total > r.linhas.length ? `<p class="bl-txt">${n(r.total)} torcedores no ranking; aparecem os 100 primeiros.</p>` : ""}`;
  }
  let ultimoR = null;
  const convite = (codigo) => `${location.origin}${location.pathname}#/bolao/entrar/${codigo}`;
  async function preenchePagina(el) {
    const id = el.dataset.id, tab = (el.dataset.tab || "").toUpperCase();
    // convite: #/bolao/entrar/<código>
    if (id === "entrar" && tab) {
      if (!logado()) { el.innerHTML = `<div class="card bl-card"><p class="bl-txt">Você foi convidado para uma liga do bolão. Entre com Google para participar.</p>${entrarBtn()}</div>`; return; }
      try {
        const d = await meu();
        if (!d.apelido) { el.innerHTML = `<div class="card bl-card">${apelidoForm(null, "Escolha um apelido para entrar na liga. É o único nome que os outros veem.")}</div>`; el.dataset.depois = tab; return; }
        await api("/bolao/liga/entrar", { metodo: "POST", corpo: { codigo: tab } });
        meuP = null;
        location.replace(`#/bolao/liga/${tab}`);
      } catch (e) { el.innerHTML = `<div class="card bl-card"><p class="bl-txt">${esc(e.message)}</p><a class="bl-btn" href="#/bolao">Ir para o ranking</a></div>`; }
      return;
    }
    const liga = id === "liga" && tab ? tab : "";
    // ranking da rodada: #/bolao/rodada/<n> (sem número, a última rodada com jogo encerrado)
    const ultima = ultimaRodada(), rd = id === "rodada" ? Number(tab) || ultima : 0;
    const jogos = rd ? jogosDaRodada(rd) : [];
    let r, d = null;
    try {
      const q = liga ? `?liga=${encodeURIComponent(liga)}` : rd ? `?jogos=${jogos.join(",")}` : "";
      [r, d] = await Promise.all([rd && !jogos.length ? { linhas: [], total: 0, rodada: true } : api(`/bolao/ranking${q}`), logado() ? meu() : null]);
    } catch (e) { el.innerHTML = `<p class="bl-txt">Não deu para carregar o bolão (${esc(e.message)}).</p>`; return; }
    if (rd) { r.rodada = true; r.nome = `${rd}ª rodada`; }
    ultimoR = r; // o card para compartilhar usa a posição deste ranking
    const chave = rd ? "rodada" : liga;
    const abas = [["", "Geral", "#/bolao"], ...(ultima ? [["rodada", "Rodada", `#/bolao/rodada/${ultima}`]] : []), ...(d?.ligas || []).map((l) => [l.codigo, l.nome, `#/bolao/liga/${l.codigo}`])];
    const ligaAtual = d?.ligas.find((l) => l.codigo === liga);
    const navRodada = rd ? `<nav class="bl-rodadas" aria-label="Escolher rodada">${rd > 1 ? `<a href="#/bolao/rodada/${rd - 1}" aria-label="Rodada anterior">‹</a>` : "<span></span>"}
        <b>${rd}ª rodada</b>${rd < ultima ? `<a href="#/bolao/rodada/${rd + 1}" aria-label="Próxima rodada">›</a>` : "<span></span>"}</nav>
        <p class="bl-txt">Pontos só dos ${n(jogos.length)} jogo${jogos.length === 1 ? "" : "s"} encerrado${jogos.length === 1 ? "" : "s"} da rodada. Quem soma mais é o rei da rodada.</p>` : "";
    el.innerHTML = `<div class="bl-grade">
      <div class="card bl-card">
        <nav class="bl-abas" aria-label="Rankings">${abas.map(([c, nome, href]) => `<a href="${href}" class="${c === chave ? "on" : ""}" ${c === chave ? 'aria-current="page"' : ""}>${esc(nome)}</a>`).join("")}</nav>
        ${rd ? navRodada : `<h2 class="bl-h">${liga ? esc(r.nome || "Liga") : "Ranking geral"}</h2>`}
        ${liga ? `<p class="bl-txt">Código da liga: <b class="bl-cod">${esc(liga)}</b> ${ligaAtual ? `· ${n(ligaAtual.membros)} participante${n(ligaAtual.membros) === 1 ? "" : "s"}` : ""}</p>
          <div class="bl-acoes">${ligaAtual ? `<button type="button" class="bl-btn" data-bl="convidar" data-cod="${esc(liga)}">Copiar convite</button><button type="button" class="bl-btn sec" data-bl="sair" data-cod="${esc(liga)}">Sair da liga</button>` : logado() ? `<button type="button" class="bl-btn" data-bl="entrar-liga" data-cod="${esc(liga)}">Entrar nesta liga</button>` : ""}</div>` : ""}
        ${tabelaRanking(r)}
        ${r.voce && window.COMPARTILHAR ? `<div class="cp-wrap">${COMPARTILHAR.botao("bolao", liga || (rd ? `r${rd}` : ""))}</div>` : ""}
        <p class="bl-txt bl-msg" role="status" aria-live="polite"></p>
      </div>
      <div class="bl-lado">${logado() ? ladoLogado(d) : `<div class="card bl-card"><h2 class="bl-h">Participe</h2><p class="bl-txt">Entre com Google, escolha um apelido e dê palpites na página de cada jogo. Não mostramos seu nome nem seu e-mail.</p>${entrarBtn()}</div>`}</div>
    </div>`;
  }
  function apelidoForm(atual, txt) {
    return `<form class="bl-form" data-bl-form="apelido"><label for="bl-apelido" class="bl-h">Seu apelido</label>
      <p class="bl-txt">${txt || "É o nome que aparece no ranking. Não mostramos seu nome do Google."}</p>
      <div class="bl-linha"><input id="bl-apelido" name="apelido" maxlength="20" minlength="3" required autocomplete="nickname" value="${esc(atual || "")}" placeholder="ex.: Raposa1921"/><button class="bl-btn">${atual ? "Trocar" : "Salvar"}</button></div>
      <p class="bl-txt bl-msg" role="status" aria-live="polite"></p></form>`;
  }
  // avisos do bolão neste aparelho (lembrete 1 hora antes dos jogos dos favoritos sem palpite, e os pontos de cada jogo)
  const AVISOS = "cazestats:bolao-avisos"; // fora do prefixo "placar:": é deste aparelho, não sincroniza
  const avisosLigados = () => { try { return localStorage.getItem(AVISOS) === "1"; } catch { return false; } };
  function avisosHTML() {
    if (!window.ALERTAS || window.PLACAR_APP) return "";
    const on = avisosLigados();
    return `<div class="card bl-card"><h2 class="bl-h">Avisos do bolão</h2>
      <p class="bl-txt">Lembrete 1 hora antes dos jogos dos seus clubes favoritos (a estrela) quando faltar o palpite, e os pontos de cada jogo quando ele acabar.</p>
      <div class="bl-acoes"><button type="button" class="bl-btn${on ? " sec" : ""}" data-bl="avisos" aria-pressed="${on}">${on ? "Desligar avisos" : "Ligar avisos neste aparelho"}</button></div>
      <p class="bl-txt bl-msg" role="status" aria-live="polite"></p></div>`;
  }
  function conquistasHTML(s) {
    if (!s) return "";
    const ganhas = s.conquistas.filter((c) => c.ganhou).length;
    const num = (v, t) => `<div><b>${v}</b><small>${t}</small></div>`;
    return `<div class="card bl-card"><h2 class="bl-h">Suas conquistas <small>${n(ganhas)} de ${n(s.conquistas.length)}</small></h2>
      <div class="bl-nums">${num(`${n(s.aproveitamento)}%`, "dos jogos pontuando")}${num(n(s.sequencia), "seguidos agora")}${num(n(s.maiorSequencia), "maior sequência")}${num(n(s.exatos), "placares exatos")}</div>
      <ul class="bl-medalhas">${s.conquistas.map((c) => `<li class="${c.ganhou ? "ok" : ""}" title="${esc(c.desc)}"><span class="bl-med" aria-hidden="true"></span><b>${esc(c.nome)}</b><small>${esc(c.desc)}${c.ganhou ? "" : " · falta"}</small></li>`).join("")}</ul></div>`;
  }
  function ladoLogado(d) {
    const palps = d.palpites.slice(0, 15).map((p) => `<li><span>${esc(p.time_casa || "?")} <b>${n(p.casa)} x ${n(p.fora)}</b> ${esc(p.time_fora || "?")}</span>
      <em>${p.pontos == null ? (p.estado === "post" || p.estado === "in" ? "em jogo" : "aguardando") : `+${n(p.pontos)}`}</em></li>`).join("");
    return `<div class="card bl-card"><p class="bl-total"><b>${n(d.pontos)}</b> pontos</p>${apelidoForm(d.apelido)}</div>
      ${conquistasHTML(d.numeros)}
      <div class="card bl-card"><h2 class="bl-h">Ligas entre amigos</h2>
        ${d.ligas.length ? `<ul class="bl-ligas">${d.ligas.map((l) => `<li><a href="#/bolao/liga/${esc(l.codigo)}">${esc(l.nome)}</a> <small>${n(l.membros)} · ${esc(l.codigo)}</small></li>`).join("")}</ul>` : `<p class="bl-txt">Crie uma liga e mande o convite para a galera.</p>`}
        <form class="bl-form" data-bl-form="criar"><label class="bl-txt" for="bl-nova">Criar liga</label><div class="bl-linha"><input id="bl-nova" name="nome" maxlength="40" minlength="3" required placeholder="Nome da liga"/><button class="bl-btn">Criar</button></div></form>
        <form class="bl-form" data-bl-form="codigo"><label class="bl-txt" for="bl-cod">Entrar com um código</label><div class="bl-linha"><input id="bl-cod" name="codigo" maxlength="6" minlength="6" required autocapitalize="characters" placeholder="ABC234"/><button class="bl-btn">Entrar</button></div></form>
        <p class="bl-txt bl-msg" role="status" aria-live="polite"></p></div>
      ${avisosHTML()}
      <div class="card bl-card"><h2 class="bl-h">Meus palpites</h2>${palps ? `<ul class="bl-palps">${palps}</ul>` : `<p class="bl-txt">Ainda sem palpites. Abra um jogo da rodada e dê o seu.</p>`}</div>`;
  }

  /* ---------- ações ---------- */
  const msgDe = (el, t) => { const m = el.closest(".bl-card, .bolao, .bl-form")?.querySelector(".bl-msg") || el.closest(".card")?.querySelector(".bl-msg"); if (m) m.textContent = t; };
  const redesenha = () => { meuP = null; document.querySelectorAll("[data-bl-ok]").forEach((x) => delete x.dataset.blOk); mount(document); };
  document.addEventListener("click", async (e) => {
    const p = e.target.closest("[data-bl-passo]");
    if (p) {
      const out = p.closest(".bl-placar").querySelector(`[data-bl-gols="${p.dataset.blPasso}"]`);
      out.textContent = String(Math.max(0, Math.min(20, Number(out.textContent) + Number(p.dataset.d))));
      return;
    }
    const b = e.target.closest("[data-bl]");
    if (!b) return;
    const acao = b.dataset.bl;
    if (acao === "entrar") { e.stopPropagation(); return window.CONTA?.abre?.(); }
    b.disabled = true;
    try {
      if (acao === "salvar") {
        const el = b.closest("[data-bolao]"), g = (k) => Number(el.querySelector(`[data-bl-gols="${k}"]`).textContent);
        const r = await api("/bolao/palpite", { metodo: "PUT", corpo: { jogo: el.dataset.bolao, casa: g("casa"), fora: g("fora") } });
        meuP = null;
        b.textContent = "Atualizar palpite";
        msgDe(b, `Palpite salvo: ${sigla(el.dataset.h)} ${r.casa} x ${r.fora} ${sigla(el.dataset.a)}. Dá para mudar até o jogo começar.`);
      }
      if (acao === "convidar") {
        const link = convite(b.dataset.cod);
        try {
          if (navigator.share) await navigator.share({ title: "Bolão CazéStats.TV", text: "Entra na minha liga do bolão!", url: link });
          else { await navigator.clipboard.writeText(link); msgDe(b, "Convite copiado. Mande para a galera."); }
        } catch { msgDe(b, link); }
      }
      if (acao === "sair" && confirm("Sair desta liga? Seus pontos continuam no ranking geral.")) {
        await api("/bolao/liga/sair", { metodo: "POST", corpo: { codigo: b.dataset.cod } });
        meuP = null; location.hash = "#/bolao";
      }
      if (acao === "entrar-liga") { location.hash = `#/bolao/entrar/${b.dataset.cod}`; }
      if (acao === "avisos") {
        const A = window.ALERTAS, ligar = !avisosLigados();
        if (!A.suporta()) throw new Error(A.iOS && !A.instalado ? "no iPhone, adicione o site à tela de início e ative por lá" : "este navegador não recebe avisos");
        if (ligar && Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") throw new Error("sem permissão para notificar");
        const sub = await A.inscricao();
        await api("/bolao/avisar", { metodo: "POST", corpo: { sub: sub.toJSON(), ligar } });
        await A.marcaBolao(ligar);
        try { localStorage.setItem(AVISOS, ligar ? "1" : "0"); } catch { /* vale só nesta visita */ }
        b.textContent = ligar ? "Desligar avisos" : "Ligar avisos neste aparelho";
        b.classList.toggle("sec", ligar);
        b.setAttribute("aria-pressed", String(ligar));
        msgDe(b, ligar ? "Pronto: lembrete antes dos jogos dos favoritos e os pontos de cada jogo." : "Avisos do bolão desligados neste aparelho.");
      }
    } catch (err) {
      msgDe(b, err.message);
    } finally {
      b.disabled = false;
    }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-bl-form]");
    if (!f) return;
    e.preventDefault();
    const tipo = f.dataset.blForm, valor = f.querySelector("input").value.trim(), btn = f.querySelector("button");
    btn.disabled = true;
    try {
      if (tipo === "apelido") {
        await api("/bolao/apelido", { metodo: "PUT", corpo: { apelido: valor } });
        const depois = f.closest("[data-bolao-pagina]")?.dataset.depois;
        if (depois) { meuP = null; return redesenha(); }
        msgDe(f, "Apelido salvo.");
        meuP = null;
      }
      if (tipo === "criar") {
        const r = await api("/bolao/liga", { metodo: "POST", corpo: { nome: valor } });
        meuP = null; location.hash = `#/bolao/liga/${r.codigo}`;
      }
      if (tipo === "codigo") location.hash = `#/bolao/entrar/${valor.toUpperCase()}`;
    } catch (err) {
      msgDe(f, err.message);
    } finally {
      btn.disabled = false;
    }
  });
  // entrou ou saiu da conta (js/conta.js): o bolão aberto na tela se redesenha
  window.addEventListener("conta:mudou", redesenha);

  window.BOLAO = { card, mount, page, ligado, ultimo: () => ultimoR };
})();
