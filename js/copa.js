/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — outras competições (#/copa/<id>[/aba][/extra])
   Libertadores, Sul-Americana, Copa do Brasil e estaduais, no mesmo desenho do Brasileirão, com a cara de cada
   torneio: cores, emblema e uma abertura animada próprios (criados para o site; nada de logo ou vinheta oficial).
   Abas: visão geral, classificação, mata-mata, jogos, rankings, clubes, simulador e Bora pro jogo.
   Dados: js/competicoes/<id>.js (ou /api/competicao/<id>), gravados pelo robô; no dia de jogo, o placar é
   atualizado direto da ESPN a cada 30 s.
   ========================================================================== */
(() => {
  const { byId } = window.PD;
  const { crest, crestOutro, display, onColor } = window.GFX;
  const esc = (t) => window.SEG.esc(t);
  const reduzido = () => matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("estatico");

  /* ---------- as competições ---------- */
  const C = {
    libertadores: { nome: "Libertadores", longo: "Copa Libertadores", lema: "A copa do continente", cores: ["#c9a24a", "#0b0b0d", "#f1dfa6"], tipo: "copa", lg: "conmebol.libertadores",
      como: ["47 clubes da América do Sul. As três fases preliminares são mata-mata em ida e volta.", "32 clubes na fase de grupos: 8 grupos de 4, todos contra todos em ida e volta. Os 2 primeiros avançam; o 3º vai para os playoffs da Sul-Americana.",
        "Das oitavas à semifinal, mata-mata em ida e volta. Empate no placar somado vai para os pênaltis (o gol fora de casa não desempata).", "Final em jogo único, em estádio escolhido antes do torneio."] },
    "sul-americana": { nome: "Sul-Americana", longo: "Copa Sul-Americana", lema: "O caminho do continente", cores: ["#2f7bdc", "#071a3a", "#7fd3ff"], tipo: "copa", lg: "conmebol.sudamericana",
      como: ["A 1ª fase é em jogo único, entre clubes do mesmo país.", "Fase de grupos: 8 grupos de 4, ida e volta. O 1º vai direto às oitavas; o 2º joga os playoffs contra um 3º colocado da Libertadores.",
        "Playoffs, oitavas, quartas e semifinal em ida e volta; empate no placar somado vai para os pênaltis.", "Final em jogo único, em estádio escolhido antes do torneio."] },
    "copa-do-brasil": { nome: "Copa do Brasil", longo: "Copa do Brasil", lema: "Mata-mata do primeiro ao último jogo", cores: ["#13a551", "#0a2a5e", "#ffd23f"], tipo: "mata", lg: "bra.copa_do_brazil", como: null },
    paulistao: { nome: "Paulistão", longo: "Campeonato Paulista", lema: "O estadual de São Paulo", cores: ["#d6202f", "#111111", "#ffffff"], tipo: "estadual", uf: "SP", lg: "bra.camp.paulista" },
    carioca: { nome: "Carioca", longo: "Campeonato Carioca", lema: "O estadual do Rio", cores: ["#2b6fd6", "#ffffff", "#0b2e6b"], tipo: "estadual", uf: "RJ", lg: "bra.camp.carioca" },
    mineiro: { nome: "Mineiro", longo: "Campeonato Mineiro", lema: "O estadual de Minas", cores: ["#d1202f", "#ffffff", "#8a0f18"], tipo: "estadual", uf: "MG", lg: "bra.camp.mineiro" },
    gauchao: { nome: "Gauchão", longo: "Campeonato Gaúcho", lema: "O estadual do Rio Grande do Sul", cores: ["#1e9e4a", "#d62828", "#f4c430"], tipo: "estadual", uf: "RS", lg: "bra.camp.gaucho" },
  };
  const ESTADUAIS = ["paulistao", "carioca", "mineiro", "gauchao"];
  const BRASILEIRAO = { nome: "Brasileirão", cores: ["#4f6bff", "#0b0f17", "#8a9bff"] };
  const familia = (id) => (id === "estaduais" ? "estaduais" : C[id] ? id : "brasileirao");

  /* ---------- emblemas (desenhos próprios do site) ---------- */
  const EMB = {
    libertadores: `<path d="M20 6h24v8a12 12 0 0 1-24 0z" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M20 9h-6a6 6 0 0 0 6 8M44 9h6a6 6 0 0 1-6 8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M32 26v8M24 40h16l-2-6H26z" fill="currentColor"/><path d="m32 44 1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="currentColor"/>`,
    "sul-americana": `<path d="M32 4 52 11v15c0 13-9 22-20 27C21 48 12 39 12 26V11z" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M18 25c5-4 9 4 14 0s9-4 14 0M18 33c5-4 9 4 14 0s9-4 14 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
    "copa-do-brasil": `<path d="M6 10h10v12h8M6 34h10V22M6 40h10v12h8M6 64h10V52M24 16v12h10M24 46v12h10M34 22v15h8M34 37v15" fill="none" stroke="currentColor" stroke-width="2.4" transform="scale(.8) translate(10 -6)"/><circle cx="50" cy="29" r="6" fill="currentColor"/>`,
    estadual: `<path d="M32 4 52 11v15c0 13-9 22-20 27C21 48 12 39 12 26V11z" fill="none" stroke="currentColor" stroke-width="2.6"/>`,
    estaduais: `<path d="M20 8 34 4l10 6 10-2-2 14 4 10-8 6-4 12-12 4-10-8-8 0 2-12-6-8 6-8z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="32" cy="28" r="4" fill="currentColor"/>`,
    brasileirao: `<circle cx="32" cy="30" r="20" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="m32 19 8 6-3 9h-10l-3-9z" fill="currentColor"/>`,
  };
  const emblema = (id, n = 44) => {
    const f = familia(id), uf = C[id]?.uf;
    return `<svg class="cp-emb" width="${n}" height="${n}" viewBox="0 0 64 60" aria-hidden="true">${EMB[C[id]?.tipo === "estadual" ? "estadual" : f]}${uf ? `<text x="32" y="33" text-anchor="middle" font-family="var(--font-display)" font-weight="900" font-size="15" fill="currentColor">${uf}</text>` : ""}</svg>`;
  };

  /* ---------- barra de competições (Brasileirão e as outras, no mesmo lugar) ---------- */
  function barra(ativo = "brasileirao") {
    const f = familia(ativo), est = ESTADUAIS.includes(ativo) || ativo === "estaduais";
    const item = (href, id, nome, on) => `<a class="cp-bar-i ${on ? "on" : ""}" href="${href}" data-cp-ir="${id}" style="--cpc:${(C[id] || (id === "estaduais" ? C.paulistao : BRASILEIRAO)).cores[0]}">${emblema(id, 22)}<span>${nome}</span></a>`;
    return `<nav class="cp-bar" aria-label="Competições">
      ${item("#/", "brasileirao", "Brasileirão", f === "brasileirao")}
      ${item("#/copa/libertadores", "libertadores", "Libertadores", f === "libertadores")}
      ${item("#/copa/sul-americana", "sul-americana", "Sul-Americana", f === "sul-americana")}
      ${item("#/copa/copa-do-brasil", "copa-do-brasil", "Copa do Brasil", f === "copa-do-brasil")}
      ${item("#/copa/estaduais", "estaduais", "Estaduais", est)}
    </nav>`;
  }

  /* ---------- tema (cores do site) e abertura animada ---------- */
  function tema(id) {
    const f = familia(id);
    if (f === "brasileirao") return null;
    const cores = (C[id] || C.paulistao).cores;
    return { id: `comp-${id}`, colors: cores };
  }
  const INTRO = {
    libertadores: { cls: "liber", txt: "LIBERTADORES", sub: "A copa do continente" },
    "sul-americana": { cls: "sula", txt: "SUL-AMERICANA", sub: "O caminho do continente" },
    "copa-do-brasil": { cls: "cdb", txt: "COPA DO BRASIL", sub: "Mata-mata do primeiro ao último jogo" },
    estaduais: { cls: "est", txt: "ESTADUAIS", sub: "Paulistão · Carioca · Mineiro · Gauchão" },
    brasileirao: { cls: "bra", txt: "BRASILEIRÃO", sub: "Série A" },
  };
  let introEm = null;
  function intro(id) {
    if (reduzido()) return;
    const f = ESTADUAIS.includes(id) ? id : familia(id), I = INTRO[f] || { cls: `est uf-${(C[id]?.uf || "").toLowerCase()}`, txt: C[id]?.nome.toUpperCase() || "", sub: C[id]?.lema || "" };
    if (C[id]?.tipo === "estadual") Object.assign(I, { cls: `est uf-${C[id].uf.toLowerCase()}`, txt: C[id].nome.toUpperCase(), sub: C[id].longo });
    document.querySelector(".cp-intro")?.remove();
    const vistas = (() => { try { return JSON.parse(sessionStorage.getItem("placar:intros") || "[]"); } catch { return []; } })();
    const curta = vistas.includes(f); // a primeira vez de cada competição na visita é a abertura completa; depois, a rápida
    if (!curta) { vistas.push(f); try { sessionStorage.setItem("placar:intros", JSON.stringify(vistas)); } catch { /* ok */ } }
    const el = document.createElement("div");
    el.className = `cp-intro ${I.cls}${curta ? " curta" : ""}`;
    el.setAttribute("aria-hidden", "true");
    const letras = [...I.txt].map((ch, i) => `<i style="--i:${i}">${ch === " " ? "&nbsp;" : esc(ch)}</i>`).join("");
    el.innerHTML = `<div class="cpi-fundo"></div><div class="cpi-luz"></div><div class="cpi-linhas">${Array.from({ length: 7 }, (_, i) => `<b style="--i:${i}"></b>`).join("")}</div>
      <div class="cpi-centro"><svg class="cpi-emb" viewBox="0 0 64 60">${EMB[C[id]?.tipo === "estadual" ? "estadual" : f] || EMB.brasileirao}${C[id]?.uf ? `<text x="32" y="33" text-anchor="middle" font-weight="900" font-size="15" fill="currentColor">${C[id].uf}</text>` : ""}</svg>
      <div class="cpi-txt">${letras}</div><div class="cpi-sub">${esc(I.sub)}</div></div>`;
    document.body.appendChild(el);
    clearTimeout(introEm);
    introEm = setTimeout(() => el.remove(), curta ? 900 : 2300);
    el.addEventListener("click", () => el.remove());
  }

  /* ---------- dados ---------- */
  const prom = {};
  function carrega(id) {
    if (!C[id]) return Promise.resolve(null);
    if (window.COMPETICOES?.[id]) return Promise.resolve(window.COMPETICOES[id]);
    if (prom[id]) return prom[id];
    return (prom[id] = (async () => {
      if (window.PD?.LIVE) {
        try { const r = await fetch(`/api/competicao/${id}`, { cache: "no-store" }); if (r.ok) { const d = await r.json(); window.SEG?.limpa(d); (window.COMPETICOES = window.COMPETICOES || {})[id] = d; return d; } } catch { /* arquivo */ }
      }
      await new Promise((res) => { const s = document.createElement("script"); s.src = `js/competicoes/${id}.js`; s.onload = s.onerror = res; document.head.appendChild(s); });
      const d = window.COMPETICOES?.[id] || null;
      if (d) window.SEG?.limpa(d);
      return d;
    })());
  }
  // no dia de jogo: placar direto da ESPN a cada 30 s (o arquivo do robô é de até 30 min atrás)
  let vivoTimer = null;
  function aoVivo(id, D, repinta) {
    clearInterval(vivoTimer);
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    if (!D.jogos.some((j) => j.data === hoje && j.estado !== "post")) return;
    const tick = async () => {
      if (!document.querySelector(`[data-copa="${id}"]`)) return clearInterval(vivoTimer);
      try {
        const sb = await (await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/${C[id].lg}/scoreboard?dates=${hoje.replace(/-/g, "")}`, { cache: "no-store" })).json();
        let mudou = false;
        for (const ev of sb.events || []) {
          const j = D.jogos.find((x) => x.id === ev.id);
          if (!j) continue;
          const c = ev.competitions[0], st = c.status?.type?.state;
          for (const x of c.competitors || []) {
            const lado = x.homeAway === "home" ? j.casa : j.fora, g = x.score === "" || x.score == null ? null : +((x.score && x.score.value) ?? x.score);
            if (st !== "pre" && lado.gols !== g) { lado.gols = g; mudou = true; }
          }
          if (j.estado !== st) { j.estado = st; mudou = true; }
          const rel = c.status?.displayClock;
          if (st === "in" && j.relogio !== rel) { j.relogio = rel; mudou = true; }
        }
        if (mudou) repinta();
      } catch { /* tenta de novo em 30 s */ }
    };
    vivoTimer = setInterval(tick, 30000);
    tick();
  }

  /* ---------- peças ---------- */
  const escudo = (t, n = 26) => (t.clube && byId[t.clube] ? crest(byId[t.clube], n) : crestOutro(t.nome, t.logo, n));
  const nomeT = (t) => (t.clube && byId[t.clube] ? byId[t.clube].abbr : esc(t.nome));
  const linkT = (id, t) => `#/copa/${id}/clube/${encodeURIComponent(t.id)}`;
  const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const dataLonga = (iso) => `${WD[new Date(`${iso}T12:00:00-03:00`).getDay()]}, ${iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]}`;
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  function linhaJogo(id, j, opts = {}) {
    const fim = j.estado === "post", vivo = j.estado === "in", pc = j.casa.pen != null && j.fora.pen != null;
    const meio = fim || vivo ? `<b class="cp-placar${vivo ? " vivo" : ""}">${j.casa.gols ?? "–"}<i>×</i>${j.fora.gols ?? "–"}</b>${pc ? `<small>pên. ${j.casa.pen}–${j.fora.pen}</small>` : vivo ? `<small class="vivo">● ${esc(j.relogio || "ao vivo")}</small>` : ""}`
      : `<b class="cp-hora">${j.hora || "a definir"}</b>`;
    const ven = (t) => (fim && ((j.casa.gols !== j.fora.gols && t.gols === Math.max(j.casa.gols, j.fora.gols)) || (pc && t.pen === Math.max(j.casa.pen, j.fora.pen))) ? " ven" : "");
    return `<li class="cp-j ${j.estado}">
      <span class="cp-j-q">${opts.data ? `<b>${dm(j.data)}</b>` : ""}<small>${esc(j.faseNome)}${j.grupo ? ` · ${esc(j.grupo)}` : ""}</small></span>
      <a class="cp-t casa${ven(j.casa)}" href="${linkT(id, j.casa)}"><b>${nomeT(j.casa)}</b>${escudo(j.casa)}</a>
      <span class="cp-meio">${meio}</span>
      <a class="cp-t fora${ven(j.fora)}" href="${linkT(id, j.fora)}">${escudo(j.fora)}<b>${nomeT(j.fora)}</b></a>
      <span class="cp-j-l">${esc(j.local || "")}</span></li>`;
  }
  function listaPorData(id, jogos, vazio = "Sem jogos.") {
    if (!jogos.length) return `<div class="empty" style="padding:24px">${vazio}</div>`;
    let d = "", h = "";
    for (const j of jogos) {
      if (j.data !== d) { d = j.data; h += `<li class="cp-dia">${dataLonga(d)}</li>`; }
      h += linhaJogo(id, j);
    }
    return `<ul class="cp-jogos">${h}</ul>`;
  }
  // tabela no mesmo desenho da classificação do Brasileirão
  function tabela(id, linhas, zonas = () => "", compacta = false) {
    return `<table class="table cp-tab"><thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th>${compacta ? "" : '<th class="hide-sm">V</th><th class="hide-sm">E</th><th class="hide-sm">D</th><th class="hide-sm">GP</th><th class="hide-sm">GC</th>'}<th>SG</th></tr></thead>
      <tbody>${linhas.map((r, i) => `<tr style="--i:${Math.min(i, 20)}"><td><span class="pos ${zonas(r.pos || i + 1, linhas.length)}">${r.pos || i + 1}</span></td>
        <td class="club"><a href="${linkT(id, r)}">${escudo(r, compacta ? 24 : 28)}<span class="nm-l">${nomeT(r)}</span></a></td><td class="pts">${r.p}</td><td>${r.j}</td>
        ${compacta ? "" : [r.v, r.e, r.d, r.gp, r.gc].map((v) => `<td class="hide-sm">${v}</td>`).join("")}<td>${r.gp - r.gc > 0 ? "+" : ""}${r.gp - r.gc}</td></tr>`).join("")}</tbody></table>`;
  }
  const zonasDe = (id) => (id === "libertadores" ? (p) => (p <= 2 ? "lib" : p === 3 ? "sul" : "") : id === "sul-americana" ? (p) => (p === 1 ? "lib" : p === 2 ? "pre" : "") : () => "");
  const legendaDe = (id) => (id === "libertadores" ? `<div class="legend"><span><i style="background:#1f6feb"></i>Avançam às oitavas</span><span><i style="background:#7a5af8"></i>Vai aos playoffs da Sul-Americana</span></div>`
    : id === "sul-americana" ? `<div class="legend"><span><i style="background:#1f6feb"></i>Direto às oitavas</span><span><i style="background:#1a9b8f"></i>Playoffs contra um 3º da Libertadores</span></div>` : "");

  // situação de cada clube na competição
  function situacao(D, tid) {
    if (D.campeao && D.campeao.id === tid) return { txt: "Campeão", cls: "camp" };
    const js = D.jogos.filter((j) => j.casa.id === tid || j.fora.id === tid);
    if (js.some((j) => j.estado !== "post")) return { txt: "Na disputa", cls: "vivo" };
    if (!js.length) return { txt: "—", cls: "" };
    const ult = js[js.length - 1];
    if (D.encerrado) return { txt: `Campanha até: ${ult.faseNome}`, cls: "fim" };
    // ainda há competição: quem não tem jogo marcado e perdeu o último confronto está fora
    const conf = D.chave.flatMap((c) => c.confrontos.map((x) => ({ ...x, fase: c.fase }))).filter((x) => x.a.id === tid || x.b.id === tid).pop();
    if (conf && conf.vencedor && conf.vencedor !== tid) return { txt: `Eliminado · ${conf.fase}`, cls: "fim" };
    return { txt: "Aguardando o próximo jogo", cls: "vivo" };
  }

  /* ---------- páginas ---------- */
  const ABAS = { copa: [["geral", "Visão geral"], ["classificacao", "Classificação"], ["chave", "Mata-mata"], ["jogos", "Jogos"], ["rankings", "Rankings"], ["clubes", "Clubes"], ["simulador", "Simulador"], ["bora", "Bora pro jogo"]],
    mata: [["geral", "Visão geral"], ["chave", "Mata-mata"], ["jogos", "Jogos"], ["classificacao", "Classificação geral"], ["rankings", "Rankings"], ["clubes", "Clubes"], ["simulador", "Simulador"], ["bora", "Bora pro jogo"]] };
  ABAS.estadual = ABAS.copa;

  function page(id, aba = "geral", extra) {
    if (id === "estaduais") return paginaEstaduais();
    const c = C[id];
    if (!c) return `<div class="empty" style="padding:120px 0"><h1 class="display">Competição não encontrada</h1><p><a href="#/" style="color:var(--ink)">Voltar ao Brasileirão</a></p></div>`;
    const abas = ABAS[c.tipo];
    if (aba !== "clube" && !abas.some(([k]) => k === aba)) aba = "geral";
    return `<div class="cp cp-${familia(id)}${c.tipo === "estadual" ? ` cp-est uf-${c.uf.toLowerCase()}` : ""}" data-copa="${id}" data-aba="${aba}" data-extra="${esc(extra || "")}">
      ${barra(id)}
      <section class="cp-topo">
        <div class="cp-topo-emb">${emblema(id, 76)}</div>
        <div class="cp-topo-txt"><div class="eyebrow" data-cp-eyebrow>${c.tipo === "estadual" ? `Estaduais · ${c.uf}` : "Temporada"}</div>
          <h1>${esc(c.longo)}</h1><p class="cp-lema">${esc(c.lema)}</p></div>
        <div class="cp-topo-fase" data-cp-fase></div>
      </section>
      <ol class="cp-linha" data-cp-linha aria-label="Fases da competição"></ol>
      <div class="club-tabs"><div class="tabs" data-tabs><span class="tab-ink"></span>
        ${abas.map(([k, l]) => `<a class="tab ${k === aba || (aba === "clube" && k === "clubes") ? "on" : ""}" href="#/copa/${id}/${k}">${l}</a>`).join("")}
      </div></div>
      <div data-cp-corpo><div class="card"><div class="empty" style="padding:40px">Carregando a competição…</div></div></div>
    </div>`;
  }

  function paginaEstaduais() {
    return `<div class="cp cp-estaduais" data-copa="estaduais">
      ${barra("estaduais")}
      <section class="cp-topo"><div class="cp-topo-emb">${emblema("estaduais", 76)}</div>
        <div class="cp-topo-txt"><div class="eyebrow">Temporada</div><h1>Estaduais</h1><p class="cp-lema">Os campeonatos dos estados, de janeiro a março</p></div></section>
      <div class="cp-est-grid">${ESTADUAIS.map((k) => `<a class="cp-est-card uf-${C[k].uf.toLowerCase()}" href="#/copa/${k}" style="--e1:${C[k].cores[0]};--e2:${C[k].cores[1]};--e3:${C[k].cores[2]}">
        <span class="cp-est-faixa"></span>${emblema(k, 54)}<b>${C[k].nome}</b><small>${C[k].longo}</small><em data-est="${k}">Carregando…</em></a>`).join("")}</div>
      <p class="source">Os estaduais com cobertura completa da ESPN (jogos, gols e cartões). Paranaense, Baiano, Catarinense e Paraense não têm essa cobertura.</p>
    </div>`;
  }

  /* ---------- abas ---------- */
  function linhaDoTempo(D) {
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    return D.fases.map((f) => {
      const st = D.encerrado || f.fim < hoje ? "feita" : f.rotulo === D.faseAtual ? "atual" : f.ini > hoje ? "futura" : "atual";
      return `<li class="cp-f ${st}" title="${esc(f.rotulo)}${f.detalhe ? ` · ${esc(f.detalhe)}` : ""}"><i></i><b>${esc(f.rotulo)}</b><small>${f.ini ? `${dm(f.ini)}${f.fim && f.fim !== f.ini ? ` a ${dm(f.fim)}` : ""}` : ""}</small></li>`;
    }).join("");
  }
  function como(id, D) {
    const c = C[id];
    if (c.como) return c.como.map((t) => `<li>${esc(t)}</li>`).join("");
    // Copa do Brasil e estaduais: o formato sai dos próprios jogos da temporada
    return D.fases.map((f) => `<li><b>${esc(f.rotulo)}</b>: ${f.mata ? (f.idaVolta ? "mata-mata em ida e volta" : "mata-mata em jogo único") : "fase de pontos corridos"}${f.jogos ? ` · ${f.jogos} jogo${f.jogos > 1 ? "s" : ""}` : ""}</li>`).join("")
      + (c.tipo === "mata" ? `<li>Empate no placar (ou no placar somado) vai para os pênaltis. Os grandes clubes entram nas fases seguintes, conforme o ranking e as vagas da Libertadores.</li>` : "");
  }

  function geral(id, D) {
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const prox = D.jogos.filter((j) => j.estado !== "post").slice(0, 10);
    const ult = D.jogos.filter((j) => j.estado === "post").slice(-8).reverse();
    const br = D.geral.filter((r) => r.clube && byId[r.clube]);
    const atual = D.chave.find((c) => c.fase === D.faseAtual) || D.chave[D.chave.length - 1];
    const camp = D.campeao ? `<div class="card cp-camp"><div class="cp-camp-in">${escudo(D.campeao, 84)}<div><small>Campeão ${esc(D.temporada)}</small><b>${nomeT(D.campeao)}</b></div><span class="cp-taca" aria-hidden="true">🏆</span></div></div>` : "";
    return `<div class="grid-2 cp-grid">
      <div>
        ${camp}
        <div class="card"><div class="card-h">${prox.length ? "Próximos jogos" : "Últimos resultados"} <small>${prox.length ? (prox[0].data === hoje ? "hoje" : dataLonga(prox[0].data)) : D.encerrado ? "competição encerrada" : ""}</small></div>${listaPorData(id, prox.length ? prox : ult)}</div>
        ${prox.length && ult.length ? `<div class="card"><div class="card-h">Últimos resultados</div>${listaPorData(id, ult.slice(0, 6))}</div>` : ""}
        ${atual ? `<div class="card"><div class="card-h">${esc(atual.fase)} <small><a href="#/copa/${id}/chave" style="color:var(--ink)">ver o mata-mata ›</a></small></div><div class="cp-chave-g">${atual.confrontos.map((x) => confronto(id, x)).join("")}</div></div>` : ""}
      </div>
      <div>
        <div class="card"><div class="card-h">Artilharia <small><a href="#/copa/${id}/rankings" style="color:var(--ink)">rankings ›</a></small></div>${artilharia(id, D, 10)}</div>
        ${br.length ? `<div class="card"><div class="card-h">Brasileiros na competição <small>${br.length}</small></div><ul class="cp-br">${br.map((r) => { const s = situacao(D, r.id); return `<li><a href="${linkT(id, r)}">${escudo(r, 30)}<b>${nomeT(r)}</b><small class="cp-sit ${s.cls}">${esc(s.txt)}</small></a></li>`; }).join("")}</ul></div>` : ""}
        <div class="card"><div class="card-h">Como funciona</div><ul class="cp-como">${como(id, D)}</ul></div>
        <div class="card"><div class="card-h">Notícias da competição</div>${D.noticias?.length ? `<ul class="cp-news">${D.noticias.map((n) => `<li><a href="${esc(window.SEG.url(n.link))}" target="_blank" rel="noopener noreferrer"><b>${esc(n.title)}</b><small>${esc(n.source || "")}${n.ts ? ` · ${dm(new Date(n.ts * 1000 - 3 * 3600e3).toISOString().slice(0, 10))}` : ""}</small></a></li>`).join("")}</ul>` : `<div class="empty" style="padding:20px">Sem manchetes nos últimos dias.</div>`}
          <div class="source">Só título, veículo, data e link · Google Notícias</div></div>
      </div></div>`;
  }
  function artilharia(id, D, n) {
    const L = D.artilharia.slice(0, n);
    if (!L.length) return `<div class="empty" style="padding:20px">Ainda sem gols.</div>`;
    const max = L[0].gols;
    return `<ul class="squad-list cp-art">${L.map((a, i) => `<li><span class="n">${i + 1}º</span>${escudo({ clube: a.clube, nome: a.timeNome, logo: a.logo }, 30)}<div style="flex:1;min-width:0"><b>${esc(a.nome)}</b><small class="sl-sub">${esc(a.clube && byId[a.clube] ? byId[a.clube].abbr : a.timeNome || "")} · ${a.jogos} jogo${a.jogos > 1 ? "s" : ""} com gol${a.pen ? ` · ${a.pen} de pênalti` : ""}</small><div class="bar" style="height:5px;margin-top:5px"><i data-w="${(a.gols / max) * 100}" style="width:${(a.gols / max) * 100}%;background:var(--accent)"></i></div></div><b class="goals">${a.gols}</b></li>`).join("")}</ul>`;
  }
  function confronto(id, x) {
    const lado = (t, g, p) => `<a class="cp-c-t ${x.vencedor === t.id ? "ven" : x.vencedor ? "per" : ""}" href="${linkT(id, t)}">${escudo(t, 24)}<b>${nomeT(t)}</b><span>${g ?? ""}${p != null ? `<small>(${p})</small>` : ""}</span></a>`;
    return `<div class="cp-c">${lado(x.a, x.ga, x.pen ? x.pen[0] : null)}${lado(x.b, x.gb, x.pen ? x.pen[1] : null)}<small class="cp-c-q">${x.pernas > 1 ? "ida e volta" : "jogo único"}${x.vencedor ? "" : x.ga != null ? " · em andamento" : ` · ${dm(x.data)}`}</small></div>`;
  }
  function chave(id, D) {
    if (!D.chave.length) return `<div class="card"><div class="empty" style="padding:40px">O mata-mata ainda não começou.</div></div>`;
    // a chave começa onde os confrontos caem pela metade até a final (8, 4, 2, 1); as fases anteriores ficam em listas
    let ini = D.chave.length - 1;
    while (ini > 0 && D.chave[ini - 1].confrontos.length === D.chave[ini].confrontos.length * 2 && D.chave[ini - 1].confrontos.length <= 8) ini--;
    const finais = D.chave.slice(ini).map((c) => ({ ...c, confrontos: [...c.confrontos] })), antes = D.chave.slice(0, ini);
    // ordem de cada coluna pelo caminho até a final: os dois confrontos que levam ao mesmo jogo ficam juntos
    for (let k = finais.length - 2; k >= 0; k--) {
      const prox = finais[k + 1].confrontos, col = finais[k].confrontos, usados = new Set(), nova = [];
      for (const x of prox) for (const t of [x.a.id, x.b.id]) {
        const i = col.findIndex((c, n) => !usados.has(n) && (c.vencedor === t || (!c.vencedor && (c.a.id === t || c.b.id === t))));
        if (i >= 0) { usados.add(i); nova.push(col[i]); }
      }
      col.forEach((c, n) => { if (!usados.has(n)) nova.push(c); });
      finais[k].confrontos = nova;
    }
    return `<div class="card cp-bracket-card"><div class="card-h">Mata-mata <small>placar somado · entre parênteses, os pênaltis</small></div>
        <div class="cp-bracket">${finais.map((c) => `<section class="cp-col ${c.fase === D.faseAtual ? "atual" : ""}"><h4>${esc(c.fase)}</h4><div class="cp-col-in">${c.confrontos.map((x) => confronto(id, x)).join("")}</div></section>`).join("")}</div></div>
      ${antes.map((c) => `<details class="card cp-antes"${c.fase === D.faseAtual ? " open" : ""}><summary class="card-h">${esc(c.fase)} <small>${c.confrontos.length} confrontos</small></summary><div class="cp-chave-g">${c.confrontos.map((x) => confronto(id, x)).join("")}</div></details>`).join("")}`;
  }
  function classificacao(id, D) {
    const grupos = D.grupos.length ? `<div class="cp-grupos">${D.grupos.map((g) => `<div class="card cp-grupo"><div class="card-h">${esc(g.nome)}</div>${tabela(id, g.linhas, zonasDe(id), true)}</div>`).join("")}</div>${legendaDe(id)}` : "";
    const lin = D.geral.filter((r) => r.j);
    return `${grupos}<div class="card"><div class="card-h">Classificação geral <small>todos os jogos da competição · 3 pontos por vitória</small></div>${tabela(id, lin, () => "")}
      <div class="source">Soma de todas as fases, para comparar a campanha de todos os clubes. Desempate: pontos, vitórias, saldo e gols pró. Fonte: ESPN</div></div>`;
  }
  function jogos(id, D, filtro) {
    const fases = [...new Set(D.jogos.map((j) => j.faseNome))];
    const f = fases.includes(filtro) ? filtro : D.faseAtual && fases.includes(D.faseAtual) ? D.faseAtual : "Todas";
    const lista = D.jogos.filter((j) => f === "Todas" || j.faseNome === f);
    return `<div class="card"><div class="card-h">Jogos <small>${lista.length}</small></div>
      <div class="chips cp-chips">${["Todas", ...fases].map((x) => `<button type="button" class="chip ${x === f ? "on" : ""}" data-cp-fase="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      ${listaPorData(id, lista)}<div class="source">Horários de Brasília · fonte: ESPN${D.updated ? ` · atualizado em ${esc(D.updated)}` : ""}</div></div>`;
  }
  function rankings(id, D) {
    const L = D.geral.filter((r) => r.j);
    const R = [["Mais gols", (r) => r.gp, (a, b) => b.gp - a.gp, "gols marcados"], ["Melhor ataque", (r) => (r.gp / r.j).toFixed(2).replace(".", ","), (a, b) => b.gp / b.j - a.gp / a.j || b.gp - a.gp, "gols por jogo"],
      ["Melhor defesa", (r) => (r.gc / r.j).toFixed(2).replace(".", ","), (a, b) => a.gc / a.j - b.gc / b.j || b.j - a.j, "sofridos por jogo"], ["Mais amarelos", (r) => r.ca, (a, b) => b.ca - a.ca || a.j - b.j, "cartões amarelos"],
      ["Mais vermelhos", (r) => r.cv, (a, b) => b.cv - a.cv || b.ca - a.ca, "cartões vermelhos"]];
    const bloco = ([t, v, s, un]) => {
      const top = [...L].sort(s).slice(0, 10), mx = Math.max(...top.map((r) => +String(v(r)).replace(",", "."))) || 1;
      return `<div class="card cp-rank"><div class="card-h">${t} <small>${un}</small></div><ol class="rank-list">${top.map((r, i) => `<li class="rank-row" style="--c1:var(--accent)"><span class="rk-pos">${i + 1}</span><a class="rk-club" href="${linkT(id, r)}">${escudo(r, 30)}<span><b>${nomeT(r)}</b><small>${r.j} jogos</small></span></a><span class="rk-bar"><i style="width:${Math.max(3, (+String(v(r)).replace(",", ".") / mx) * 100)}%"></i></span><b class="rk-val">${v(r)}</b></li>`).join("")}</ol></div>`;
    };
    return `<div class="card"><div class="card-h">Artilharia <small>top 20</small></div>${artilharia(id, D, 20)}</div><div class="cp-ranks">${R.map(bloco).join("")}</div>
      <div class="source">Melhor defesa: menos gols sofridos por jogo. Gols e cartões contados jogo a jogo (ESPN).</div>`;
  }
  function clubes(id, D) {
    const L = [...D.geral].sort((a, b) => nomeT(a).localeCompare(nomeT(b), "pt-BR"));
    return `<div class="card"><div class="card-h">Clubes participantes <small>${L.length}</small></div><ul class="cp-clubes">${L.map((r) => { const s = situacao(D, r.id); return `<li><a href="${linkT(id, r)}">${escudo(r, 40)}<b>${nomeT(r)}</b><small class="cp-sit ${s.cls}">${esc(s.txt)}</small></a></li>`; }).join("")}</ul></div>`;
  }
  function clube(id, D, tid) {
    const r = D.geral.find((x) => x.id === tid);
    if (!r) return `<div class="card"><div class="empty" style="padding:40px">Clube não encontrado nesta competição.</div></div>`;
    const js = D.jogos.filter((j) => j.casa.id === tid || j.fora.id === tid), s = situacao(D, tid);
    const art = D.artilharia.filter((a) => a.time === tid);
    const k = (v, l) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`;
    return `<div class="card cp-cl-topo"><a class="back-link" href="#/copa/${id}/clubes">‹ Clubes</a><div class="cp-cl-in">${escudo(r, 84)}<div><h2>${nomeT(r)}</h2><small class="cp-sit ${s.cls}">${esc(s.txt)}</small>
        ${r.clube && byId[r.clube] ? `<a class="cp-cl-link" href="#/clube/${r.clube}">Página do clube ›</a>` : ""}</div></div></div>
      <div class="kpis">${k(r.j, "Jogos")}${k(`${r.v}-${r.e}-${r.d}`, "V-E-D")}${k(`${r.gp}:${r.gc}`, "Gols pró : contra")}${k(`${r.ca} · ${r.cv}`, "Amarelos · vermelhos")}</div>
      <div class="grid-2 cp-grid"><div class="card"><div class="card-h">Jogos na competição</div>${listaPorData(id, js)}</div>
        <div class="card"><div class="card-h">Artilheiros do clube</div>${art.length ? `<ul class="squad-list">${art.map((a, i) => `<li><span class="n">${i + 1}º</span><div style="flex:1"><b>${esc(a.nome)}</b></div><b class="goals">${a.gols}</b></li>`).join("")}</ul>` : `<div class="empty" style="padding:20px">Sem gols registrados.</div>`}</div></div>`;
  }

  // simulador: placar dos jogos que faltam; grupos recalculados e quem avança no mata-mata
  const simKey = (id) => `placar:copa-sim-${id}`;
  const simLer = (id) => { try { return JSON.parse(localStorage.getItem(simKey(id)) || "{}"); } catch { return {}; } };
  const simGravar = (id, p) => { try { localStorage.setItem(simKey(id), JSON.stringify(p)); } catch { /* ok */ } };
  function tabelaSim(js, palp) {
    const T = {};
    for (const j of js) {
      for (const t of [j.casa, j.fora]) T[t.id] = T[t.id] || { ...t, p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
      const pl = j.estado === "post" ? [j.casa.gols, j.fora.gols] : palp[j.id];
      if (!pl || pl[0] == null || pl[1] == null) continue;
      for (const [me, op, a, b] of [[j.casa, j.fora, pl[0], pl[1]], [j.fora, j.casa, pl[1], pl[0]]]) {
        const r = T[me.id]; r.j++; r.gp += a; r.gc += b;
        if (a > b) { r.v++; r.p += 3; } else if (a === b) { r.e++; r.p++; } else r.d++;
      }
    }
    return Object.values(T).sort((a, b) => b.p - a.p || b.v - a.v || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp).map((r, i) => ({ ...r, pos: i + 1 }));
  }
  function simulador(id, D) {
    const palp = simLer(id), falta = D.jogos.filter((j) => j.estado !== "post");
    if (!falta.length) return `<div class="card"><div class="empty" style="padding:40px">Não há jogos por disputar: a competição ${D.encerrado ? "terminou" : "aguarda a definição dos próximos jogos"}. O simulador volta quando houver jogos marcados.</div></div>`;
    const linhas = falta.map((j) => {
      const pl = palp[j.id] || [];
      return `<li class="sim-j" data-cp-sim="${j.id}"><span class="sim-when">${dataLonga(j.data)} · ${esc(j.faseNome)}${j.grupo ? ` · ${esc(j.grupo)}` : ""}</span>
        <span class="sim-t h"><b>${nomeT(j.casa)}</b>${escudo(j.casa, 34)}</span>
        <span class="sim-placar"><input type="number" inputmode="numeric" min="0" max="19" placeholder="–" value="${pl[0] ?? ""}" data-lado="0" aria-label="Gols de ${esc(j.casa.nome)}"><i>×</i><input type="number" inputmode="numeric" min="0" max="19" placeholder="–" value="${pl[1] ?? ""}" data-lado="1" aria-label="Gols de ${esc(j.fora.nome)}"></span>
        <span class="sim-t a">${escudo(j.fora, 34)}<b>${nomeT(j.fora)}</b></span></li>`;
    }).join("");
    return `<div class="sim-grid"><div class="card"><div class="card-h">Jogos que faltam <small>${falta.length}</small></div>
        <div class="sim-atalhos"><button type="button" class="chip" data-cp-sim-auto="casa">Mandantes vencem</button><button type="button" class="chip" data-cp-sim-auto="limpa">Limpar</button></div>
        <ol class="sim-list">${linhas}</ol><p class="sim-nota">Dê o placar e veja os grupos e o mata-mata mudarem. Os placares ficam guardados só neste aparelho.</p></div>
      <div class="card" data-cp-sim-res>${simResultado(id, D, palp)}</div></div>`;
  }
  function simResultado(id, D, palp) {
    const grupos = [...new Set(D.jogos.filter((j) => j.grupo && !j.mata).map((j) => j.grupo))];
    const gHTML = grupos.filter((g) => D.jogos.some((j) => j.grupo === g && j.estado !== "post")).map((g) => `<h4 class="cp-sim-h">${esc(g)}</h4>${tabela(id, tabelaSim(D.jogos.filter((j) => j.grupo === g && !j.mata), palp), zonasDe(id), true)}`).join("");
    // mata-mata: confrontos com jogo por disputar, somando o que já foi jogado e o simulado
    const conf = D.chave.flatMap((c) => c.confrontos.map((x) => ({ ...x, fase: c.fase }))).filter((x) => x.jogos.some((jid) => D.jogos.find((j) => j.id === jid)?.estado !== "post"));
    const cHTML = conf.map((x) => {
      let ga = 0, gb = 0, ok = true;
      for (const jid of x.jogos) {
        const j = D.jogos.find((y) => y.id === jid), pl = j.estado === "post" ? [j.casa.gols, j.fora.gols] : palp[jid];
        if (!pl || pl[0] == null || pl[1] == null) { ok = false; continue; }
        if (j.casa.id === x.a.id) { ga += +pl[0]; gb += +pl[1]; } else { ga += +pl[1]; gb += +pl[0]; }
      }
      const v = ok ? (ga > gb ? x.a : gb > ga ? x.b : null) : null;
      return `<div class="cp-c"><span class="cp-c-t ${v === x.a ? "ven" : ""}">${escudo(x.a, 24)}<b>${nomeT(x.a)}</b><span>${ok ? ga : "–"}</span></span><span class="cp-c-t ${v === x.b ? "ven" : ""}">${escudo(x.b, 24)}<b>${nomeT(x.b)}</b><span>${ok ? gb : "–"}</span></span>
        <small class="cp-c-q">${esc(x.fase)} · ${!ok ? "dê o placar" : v ? `avança: ${nomeT(v)}` : "empate no placar somado: pênaltis"}</small></div>`;
    }).join("");
    return `<div class="card-h">Como ficaria</div>${gHTML || ""}${cHTML ? `<h4 class="cp-sim-h">Mata-mata</h4><div class="cp-chave-g">${cHTML}</div>` : ""}${!gHTML && !cHTML ? `<div class="empty" style="padding:20px">Dê o placar dos jogos ao lado.</div>` : ""}`;
  }
  // Bora pro jogo no clima da competição: os clubes brasileiros que estão nela
  function bora(id, D) {
    const br = D.geral.filter((r) => r.clube && byId[r.clube]);
    if (br.length < 2) return `<div class="card"><div class="empty" style="padding:40px">A prancheta do Bora pro jogo usa os elencos dos clubes da Série A: esta competição tem menos de dois deles.</div></div>`;
    const jogosBR = D.jogos.filter((j) => j.casa.clube && j.fora.clube && byId[j.casa.clube] && byId[j.fora.clube]);
    const prox = jogosBR.filter((j) => j.estado !== "post").slice(0, 6), ult = jogosBR.filter((j) => j.estado === "post").slice(-4).reverse();
    const sel = (n, v) => `<select data-cp-bora="${n}" aria-label="Clube ${n === "a" ? "mandante" : "visitante"}">${br.map((r) => `<option value="${r.clube}"${r.clube === v ? " selected" : ""}>${byId[r.clube].name}</option>`).join("")}</select>`;
    const par = prox[0] || ult[0] || { casa: br[0], fora: br[1] };
    const btn = (j) => `<a class="chip cp-bora-j" href="#/bora-pro-jogo/${j.casa.clube}/${j.fora.clube}" data-cp-tema="${id}">${crest(byId[j.casa.clube], 22)} ${byId[j.casa.clube].abbr} x ${byId[j.fora.clube].abbr} ${crest(byId[j.fora.clube], 22)} <small>${dm(j.data)} · ${esc(j.faseNome)}</small></a>`;
    return `<div class="card cp-bora"><div class="card-h">Bora pro jogo <small>no clima da ${esc(C[id].nome)}</small></div>
      <p>Monte a escalação dos dois times na prancheta, com o tema da competição.</p>
      <div class="cp-bora-sel">${sel("a", par.casa.clube)}<span>×</span>${sel("b", par.fora.clube)}<a class="cp-bora-ir" href="#/bora-pro-jogo/${par.casa.clube}/${par.fora.clube}" data-cp-tema="${id}" data-cp-bora-ir>Montar o jogo ›</a></div>
      ${prox.length ? `<h4 class="cp-sim-h">Próximos duelos brasileiros</h4><div class="cp-bora-lista">${prox.map(btn).join("")}</div>` : ""}
      ${ult.length ? `<h4 class="cp-sim-h">Duelos brasileiros que já aconteceram</h4><div class="cp-bora-lista">${ult.map(btn).join("")}</div>` : ""}</div>`;
  }

  /* ---------- montar ---------- */
  const estado = { fase: {} };
  // barra rolável: o item ativo (competição, fase atual) aparece no meio, sem mexer na rolagem da página
  const centraliza = (barra, item) => { if (barra && item) barra.scrollLeft = Math.max(0, item.offsetLeft - barra.clientWidth / 2 + item.clientWidth / 2); };
  function ajustaBarras(root) { root.querySelectorAll(".cp-bar").forEach((b) => centraliza(b, b.querySelector(".cp-bar-i.on"))); }
  async function mount(root) {
    ajustaBarras(root);
    const el = root.querySelector("[data-copa]");
    if (!el) return;
    const id = el.dataset.copa;
    if (id === "estaduais") {
      for (const k of ESTADUAIS) carrega(k).then((D) => {
        const em = root.querySelector(`[data-est="${k}"]`);
        if (!em || !D) return;
        em.innerHTML = D.campeao ? `🏆 Campeão: ${nomeT(D.campeao)}` : D.encerrado ? "Encerrado" : `Fase atual: ${esc(D.faseAtual || "—")}`;
      });
      return;
    }
    const D = await carrega(id);
    if (!el.isConnected) return;
    const corpo = el.querySelector("[data-cp-corpo]");
    if (!D) { corpo.innerHTML = `<div class="card"><div class="empty" style="padding:40px">Dados da competição indisponíveis agora.</div></div>`; return; }
    el.querySelector("[data-cp-eyebrow]").textContent = `${C[id].tipo === "estadual" ? `Estaduais · ${C[id].uf} · ` : ""}Temporada ${D.temporada}`;
    el.querySelector("[data-cp-fase]").innerHTML = `<span class="cp-fase-pill${D.encerrado ? " fim" : ""}">${D.encerrado ? (D.campeao ? `🏆 ${nomeT(D.campeao)}` : "Encerrado") : `<i></i>${esc(D.faseAtual || "")}`}</span><small>${D.jogos.length} jogos · ${D.geral.length} clubes</small>`;
    const linha = el.querySelector("[data-cp-linha]");
    linha.innerHTML = linhaDoTempo(D);
    centraliza(linha, linha.querySelector(".cp-f.atual") || [...linha.querySelectorAll(".cp-f.feita")].pop());
    const pinta = () => {
      const aba = el.dataset.aba;
      corpo.innerHTML = aba === "classificacao" ? classificacao(id, D) : aba === "chave" ? chave(id, D) : aba === "jogos" ? jogos(id, D, estado.fase[id]) : aba === "rankings" ? rankings(id, D)
        : aba === "clubes" ? clubes(id, D) : aba === "clube" ? clube(id, D, decodeURIComponent(el.dataset.extra)) : aba === "simulador" ? simulador(id, D) : aba === "bora" ? bora(id, D) : geral(id, D);
      corpo.querySelector(".cp-col.atual")?.scrollIntoView?.({ block: "nearest", inline: "center" });
    };
    pinta();
    aoVivo(id, D, () => { if (!corpo.querySelector("input:focus")) pinta(); });
    corpo.addEventListener("click", (e) => {
      const f = e.target.closest("[data-cp-fase]");
      if (f) { estado.fase[id] = f.dataset.cpFase; pinta(); return; }
      const auto = e.target.closest("[data-cp-sim-auto]");
      if (auto) {
        const palp = simLer(id);
        D.jogos.filter((j) => j.estado !== "post").forEach((j) => { if (auto.dataset.cpSimAuto === "limpa") delete palp[j.id]; else if (!palp[j.id]) palp[j.id] = [1, 0]; });
        simGravar(id, palp); pinta(); return;
      }
      const t = e.target.closest("[data-cp-tema]");
      if (t) { try { sessionStorage.setItem("placar:tema-bora", t.dataset.cpTema); } catch { /* ok */ } }
    });
    corpo.addEventListener("input", (e) => {
      const li = e.target.closest("[data-cp-sim]");
      if (!li) return;
      const palp = simLer(id), [a, b] = li.querySelectorAll("input"), n = (i) => (i.value === "" ? null : Math.max(0, Math.min(19, Math.floor(+i.value))));
      const pl = [n(a), n(b)];
      if (pl[0] == null && pl[1] == null) delete palp[li.dataset.cpSim]; else palp[li.dataset.cpSim] = pl;
      simGravar(id, palp);
      corpo.querySelector("[data-cp-sim-res]").innerHTML = simResultado(id, D, palp);
    });
    corpo.addEventListener("change", (e) => {
      const s = e.target.closest("[data-cp-bora]");
      if (!s) return;
      const a = corpo.querySelector('[data-cp-bora="a"]').value, b = corpo.querySelector('[data-cp-bora="b"]').value;
      corpo.querySelector("[data-cp-bora-ir]").setAttribute("href", `#/bora-pro-jogo/${a}/${b}`);
    });
  }
  const titulo = (id, aba, extra) => {
    if (id === "estaduais") return "Estaduais — Placar";
    const c = C[id];
    if (!c) return "Competição — Placar";
    const D = window.COMPETICOES?.[id], t = aba === "clube" && D ? D.geral.find((r) => r.id === decodeURIComponent(extra || "")) : null;
    return `${t ? `${t.nome} na ` : ""}${c.longo} — Placar`;
  };

  window.COPA = { C, ESTADUAIS, page, mount, barra, tema, intro, familia, titulo, carrega, emblema };
})();
