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
    // Brasileirão: a Série A é o site principal; B, C e D usam esta página, com a identidade do Brasileirão em outro tom
    "serie-b": { nome: "Série B", longo: "Brasileirão Série B", lema: "20 clubes, 38 rodadas, 4 vagas na elite", cores: ["#2f6fe4", "#0a1a3f", "#ffd23f"], tipo: "liga", serie: "B", lg: "bra.2",
      como: ["20 clubes em pontos corridos, todos contra todos em turno e returno: 38 rodadas.", "Os 4 primeiros sobem para a Série A do ano seguinte.", "Os 4 últimos caem para a Série C.", "Desempate: vitórias, saldo de gols, gols pró, confronto direto, cartões vermelhos e amarelos."] },
    "serie-c": { nome: "Série C", longo: "Brasileirão Série C", lema: "Do pontos corridos ao quadrangular do acesso", cores: ["#12a37a", "#062a22", "#c8f169"], tipo: "liga", serie: "C", lg: "bra.3",
      como: ["1ª fase: 20 clubes em turno único, 19 rodadas.", "Os 8 primeiros vão à 2ª fase: dois grupos de 4, ida e volta. Os 2 primeiros de cada grupo sobem para a Série B.", "Os líderes dos grupos fazem a final, em ida e volta.", "Os 2 últimos da 1ª fase caem para a Série D."] },
    "serie-d": { nome: "Série D", longo: "Brasileirão Série D", lema: "96 clubes de todo o país atrás de 4 vagas", cores: ["#d9472b", "#2a0d08", "#ffb547"], tipo: "liga", serie: "D", lg: "bra.4",
      como: ["1ª fase: 96 clubes em 16 grupos de 6, divididos por região, em ida e volta.", "Os 4 primeiros de cada grupo seguem para o mata-mata (ida e volta) até a final.", "Os 4 semifinalistas sobem para a Série C."] },
  };
  const SERIES = ["serie-b", "serie-c", "serie-d"];
  const ESTADUAIS = ["paulistao", "carioca", "mineiro", "gauchao"];
  // identidade do Brasileirão 2026 (Série A): verde-bandeira, amarelo-ouro e azul-marinho
  const BRASILEIRAO = { nome: "Brasileirão", cores: ["#00a859", "#062a1a", "#ffd200"] };
  const familia = (id) => (id === "estaduais" ? "estaduais" : SERIES.includes(id) ? "brasileirao" : C[id] ? id : "brasileirao");

  /* ---------- emblemas (desenhos próprios do site) ---------- */
  // Desenhos do próprio site (nenhum logo oficial é copiado): cada um parte da forma do troféu ou da ideia do torneio
  const EMB = {
    // Brasileirão: taça de alças altas sobre base em degraus, com o losango e o círculo da bandeira no bojo
    brasileirao: `<path d="M21 8h22l-1.5 15.5C40.5 32 36.5 37 32 37s-8.5-5-9.5-13.5z" fill="var(--e3,#ffd200)"/><path d="M21 11c-6 0-9 3-8.5 7.5.6 5 5.5 7.5 10.5 7.6M43 11c6 0 9 3 8.5 7.5-.6 5-5.5 7.5-10.5 7.6" fill="none" stroke="var(--e3,#ffd200)" stroke-width="2.6" stroke-linecap="round"/><path d="m32 12.5 8 7.5-8 7.5-8-7.5z" fill="var(--e1,#00a859)"/><circle cx="32" cy="20" r="3.6" fill="#0a2a66"/><path d="M29 37h6v6h-6z" fill="var(--e3,#ffd200)"/><path d="M23 43h18l2 5H21zM19 48h26v5H19z" fill="var(--e3,#ffd200)"/><path d="M19 48h26" stroke="var(--e2,#062a1a)" stroke-width="1.2" opacity=".5"/>`,
    // Libertadores: taça com a figura no alto, em ouro
    libertadores: `<circle cx="32" cy="7" r="3.4" fill="var(--e1,currentColor)"/><path d="M29 11h6l1.5 6h-9z" fill="var(--e1,currentColor)"/><path d="M20 18h24c0 10-4.6 16-12 16s-12-6-12-16z" fill="var(--e1,currentColor)"/><path d="M20 21c-5 0-7 2.5-6.4 6 .6 3.4 4 5 8 5M44 21c5 0 7 2.5 6.4 6-.6 3.4-4 5-8 5" fill="none" stroke="var(--e1,currentColor)" stroke-width="2.4"/><path d="M29.5 34h5l1 7h-7z" fill="var(--e1,currentColor)"/><path d="M22 41h20v5H22zM19 47h26v6H19z" fill="var(--e1,currentColor)"/><path d="M22 47h20" stroke="var(--e2,#0b0b0d)" stroke-width="1.4"/>`,
    // Sul-Americana: disco do continente cortado por faixas em movimento
    "sul-americana": `<circle cx="32" cy="30" r="22" fill="var(--e1,currentColor)"/><path d="M12 24c8-6 16 4 24-2s12-4 16 0M11 33c9-6 17 4 25-2s12-4 17 0M14 42c8-5 15 3 22-1s10-3 14 0" fill="none" stroke="var(--e3,#7fd3ff)" stroke-width="3" stroke-linecap="round"/>`,
    // Copa do Brasil: linhas da chave que se fecham num troféu
    "copa-do-brasil": `<path d="M4 10h9v10h7M4 30h9V20M4 34h9v10h7M4 54h9V44M20 15v10h6M20 39v10h6" fill="none" stroke="var(--e3,currentColor)" stroke-width="2.4" stroke-linejoin="round"/><path d="M26 20v12M26 44V32h4" fill="none" stroke="var(--e3,currentColor)" stroke-width="2.4"/><path d="M34 17h22c0 11-4.5 17-11 17s-11-6-11-17z" fill="var(--e1,currentColor)"/><path d="M42.5 34h5l1 6h-7zM37 40h16v5H37zM35 46h20v6H35z" fill="var(--e1,currentColor)"/><path d="m45 21 2 4.2 4.6.5-3.4 3.1.9 4.5-4.1-2.3-4.1 2.3.9-4.5-3.4-3.1 4.6-.5z" fill="var(--e3,#ffd23f)"/>`,
    estadual: `<path d="M32 4 53 11v16c0 13-9 21.5-21 26C20 48.5 11 40 11 27V11z" fill="var(--e1,currentColor)"/><path d="M32 9 48 14.5v12c0 10.5-7 17.5-16 21-9-3.5-16-10.5-16-21v-12z" fill="none" stroke="var(--e3,#fff)" stroke-width="1.6" opacity=".8"/>`,
    estaduais: `<path d="M20 8 34 4l10 6 10-2-2 14 4 10-8 6-4 12-12 4-10-8-8 0 2-12-6-8 6-8z" fill="var(--e1,currentColor)" stroke-linejoin="round"/><circle cx="32" cy="28" r="5" fill="var(--e3,#fff)"/>`,
  };
  const corDe = (id) => (C[id]?.cores || (id === "estaduais" ? C.paulistao.cores : BRASILEIRAO.cores));
  const emblema = (id, n = 44) => {
    const f = familia(id), uf = C[id]?.uf, serie = C[id]?.serie || (f === "brasileirao" ? "A" : null), [e1, e2, e3] = corDe(id);
    const desenho = EMB[C[id]?.tipo === "estadual" ? "estadual" : f] || EMB.brasileirao;
    // a letra da série fica numa plaqueta sobre a base da taça (A, B, C, D)
    const placa = serie ? `<g class="cp-emb-serie"><rect x="38" y="38" width="20" height="20" rx="6" fill="var(--e2)" stroke="var(--e3)" stroke-width="2"/><text x="48" y="53" text-anchor="middle" font-family="var(--font-label)" font-weight="800" font-size="15" fill="var(--e3)">${serie}</text></g>` : "";
    const sigla = uf ? `<text x="32" y="34" text-anchor="middle" font-family="var(--font-label)" font-weight="800" font-size="15" fill="var(--e2)">${uf}</text>` : "";
    return `<svg class="cp-emb" width="${n}" height="${n}" viewBox="0 0 64 60" aria-hidden="true" style="--e1:${e1};--e2:${e2};--e3:${e3}">${desenho}${sigla}${placa}</svg>`;
  };

  /* ---------- trilho de competições (Brasileirão e as outras, no mesmo lugar) ----------
     Cada item leva o emblema nas cores do próprio torneio; o ativo se abre com o nome, preenchido com a cor dele. */
  function barra(ativo = "brasileirao") {
    const f = familia(ativo), est = ESTADUAIS.includes(ativo) || ativo === "estaduais";
    const item = (href, id, nome, on) => { const [a, b, c] = corDe(id); return `<a class="cp-bar-i ${on ? "on" : ""}" href="${href}" data-cp-ir="${id}" style="--cpc:${a};--cpc2:${b};--cpc3:${c}"${on ? ' aria-current="page"' : ""}>${emblema(id, 24)}<span>${nome}</span></a>`; };
    return `<nav class="cp-bar" aria-label="Competições">
      ${item("#/", "brasileirao", "Brasileirão", f === "brasileirao")}
      ${item("#/copa/libertadores", "libertadores", "Libertadores", f === "libertadores")}
      ${item("#/copa/sul-americana", "sul-americana", "Sul-Americana", f === "sul-americana")}
      ${item("#/copa/copa-do-brasil", "copa-do-brasil", "Copa do Brasil", f === "copa-do-brasil")}
      ${item("#/copa/estaduais", "estaduais", "Estaduais", est)}
    </nav>`;
  }
  // faixa da competição: o emblema grande, o nome e a temporada sobre o campo de cor do torneio (estilo grafismo de TV)
  const SERIE_HREF = { A: "#/", B: "#/copa/serie-b", C: "#/copa/serie-c", D: "#/copa/serie-d" };
  function faixa(id, opts = {}) {
    const f = familia(id), c = C[id], [e1, e2, e3] = corDe(id);
    const serie = c?.serie || (f === "brasileirao" ? "A" : null);
    const nome = f === "brasileirao" ? "Brasileirão" : id === "estaduais" ? "Estaduais" : c?.tipo === "estadual" ? c.nome : c?.longo || "";
    const sub = f === "brasileirao" ? `Série ${serie} · 2026` : opts.sub || (c?.tipo === "estadual" ? `${c.longo} · 2026` : "Temporada 2026");
    const series = f === "brasileirao" ? `<nav class="cpx-series" aria-label="Séries do Brasileirão">${["A", "B", "C", "D"].map((x) => `<a href="${SERIE_HREF[x]}" class="${x === serie ? "on" : ""}"${x === serie ? ' aria-current="page"' : ""}>Série ${x}</a>`).join("")}</nav>` : "";
    return `<section class="cpx-faixa cpx-${f === "brasileirao" ? `bra serie-${serie.toLowerCase()}` : f}${c?.uf ? ` uf-${c.uf.toLowerCase()}` : ""}" style="--e1:${e1};--e2:${e2};--e3:${e3}" data-cpx-faixa="${id}">
      <div class="cpx-campo" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="cpx-emb">${emblema(id, 64)}</div>
      <div class="cpx-txt"><small data-cp-eyebrow>${esc(sub)}</small><h1>${esc(nome)}</h1>${opts.lema !== false && c?.lema ? `<p class="cp-lema">${esc(c.lema)}</p>` : ""}</div>
      <div class="cpx-lado"><div class="cp-topo-fase" data-cp-fase>${opts.fase || ""}</div>${series}</div>
    </section>`;
  }

  /* ---------- tema (cores do site) e abertura animada ---------- */
  function tema(id) {
    const f = familia(id);
    if (f === "brasileirao" && !SERIES.includes(id)) return null;
    const cores = (C[id] || C.paulistao).cores;
    return { id: `comp-${id}`, colors: cores };
  }
  /* ---------- abertura animada ----------
     O emblema se desenha no centro sobre o campo de cor do torneio, o nome entra por uma máscara e tudo se recolhe para
     o lugar da faixa da competição (FLIP). Completa (1,4 s) na primeira vez de cada competição na visita; depois, só a
     varredura de cor (0,5 s). Um toque pula; com "reduzir movimento", nada. */
  let introEm = null;
  function intro(id) {
    if (reduzido()) return;
    const f = ESTADUAIS.includes(id) || SERIES.includes(id) ? id : familia(id), c = C[id], [e1, e2, e3] = corDe(id);
    const nome = f === "brasileirao" ? "Brasileirão" : id === "estaduais" ? "Estaduais" : c?.tipo === "estadual" ? c.nome : c?.nome || "";
    const sub = f === "brasileirao" ? "Série A · 2026" : SERIES.includes(id) ? `${c.longo.replace("Brasileirão ", "")} · 2026` : c?.lema || "Temporada 2026";
    document.querySelector(".cpx-intro")?.remove();
    const vistas = (() => { try { return JSON.parse(sessionStorage.getItem("placar:intros") || "[]"); } catch { return []; } })();
    const curta = vistas.includes(f);
    if (!curta) { vistas.push(f); try { sessionStorage.setItem("placar:intros", JSON.stringify(vistas)); } catch { /* ok */ } }
    const el = document.createElement("div");
    el.className = `cpx-intro cpx-${familia(id) === "brasileirao" ? "bra" : familia(id)}${curta ? " curta" : ""}`;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = `--e1:${e1};--e2:${e2};--e3:${e3}`;
    el.innerHTML = `<div class="cpx-i-fundo"></div><div class="cpx-i-faixas"><i></i><i></i><i></i></div>
      <div class="cpx-i-centro"><div class="cpx-i-emb">${emblema(id, 120)}</div><div class="cpx-i-nome"><b>${esc(nome)}</b><small>${esc(sub)}</small></div></div>`;
    document.body.appendChild(el);
    clearTimeout(introEm);
    const sai = () => {
      // recolhe para a faixa da página (se ela já estiver na tela)
      const alvo = document.querySelector(".cpx-faixa .cpx-emb"), centro = el.querySelector(".cpx-i-emb");
      if (alvo && centro && !curta) {
        const a = alvo.getBoundingClientRect(), b = centro.getBoundingClientRect();
        el.style.setProperty("--dx", `${a.left + a.width / 2 - (b.left + b.width / 2)}px`);
        el.style.setProperty("--dy", `${a.top + a.height / 2 - (b.top + b.height / 2)}px`);
        el.style.setProperty("--s", `${a.width / b.width}`);
      }
      el.classList.add("sai");
      setTimeout(() => el.remove(), 420);
    };
    introEm = setTimeout(sai, curta ? 120 : 1050);
    el.addEventListener("click", () => { clearTimeout(introEm); sai(); });
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
  function avisoGol(id, j, lado) {
    const t = lado === "casa" ? j.casa : j.fora, [e1, , e3] = corDe(id);
    const el = document.createElement("div");
    el.className = "cpx-gol";
    el.setAttribute("role", "status");
    el.style.cssText = `--e1:${e1};--e3:${e3}`;
    el.innerHTML = `${escudo(t, 36)}<div><b>Gol do ${esc(nomeT(t))}</b><small>${esc(nomeT(j.casa))} ${j.casa.gols} × ${j.fora.gols} ${esc(nomeT(j.fora))}${j.relogio ? ` · ${esc(j.relogio)}` : ""}</small></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("sai"), 5200);
    setTimeout(() => el.remove(), 5800);
  }
  function aoVivo(id, D, repinta) {
    clearInterval(vivoTimer);
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    if (D.aoVivo === false || !C[id].lg || !D.jogos.some((j) => j.data === hoje && j.estado !== "post")) return;
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
            if (st !== "pre" && lado.gols !== g) {
              const gol = lado.gols != null && g > lado.gols;
              lado.gols = g; mudou = true;
              if (gol) avisoGol(id, j, x.homeAway === "home" ? "casa" : "fora");
            }
          }
          if (j.estado !== st) { j.estado = st; mudou = true; }
          const rel = c.status?.displayClock;
          if (st === "in" && j.relogio !== rel) { j.relogio = rel; mudou = true; }
        }
        if (mudou) repinta();
      } catch { /* tenta de novo em 30 s */ }
    };
    // jogo rolando: a cada 10 s (o placar do dia da ESPN muda em segundos); antes de começar, a cada 30 s
    const ritmo = () => (D.jogos.some((j) => j.data === hoje && j.estado === "in") ? 10000 : 30000);
    let atual = ritmo();
    vivoTimer = setInterval(function volta() { tick(); const r = ritmo(); if (r !== atual) { atual = r; clearInterval(vivoTimer); vivoTimer = setInterval(volta, r); } }, atual);
    tick();
  }

  /* ---------- peças ---------- */
  const escudo = (t, n = 26) => (t.clube && byId[t.clube] ? crest(byId[t.clube], n) : crestOutro(t.nome, t.logo, n, t.cores));
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
  const zonaLiga = (D) => (p) => { const z = (D?.zonas || []).find(([a, b]) => p >= a && p <= b); return z ? (z[2] === "acesso" ? "lib" : "rel") : ""; };
  const legendaLiga = (D) => (D?.zonas?.length ? `<div class="legend">${D.zonas.map(([a, b, cls, nome]) => `<span><i style="background:${cls === "acesso" ? "var(--zona-acesso)" : "var(--zona-queda)"}"></i>${a}º a ${b}º · ${esc(nome)}</span>`).join("")}</div>` : "");
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
  ABAS.liga = [["geral", "Visão geral"], ["classificacao", "Classificação"], ["jogos", "Jogos"], ["rankings", "Rankings"], ["clubes", "Clubes"], ["simulador", "Simulador"]];

  function page(id, aba = "geral", extra) {
    if (id === "estaduais") return paginaEstaduais();
    const c = C[id];
    if (!c) return `<div class="empty" style="padding:120px 0"><h1 class="display">Competição não encontrada</h1><p><a href="#/" style="color:var(--ink)">Voltar ao Brasileirão</a></p></div>`;
    const abas = ABAS[c.tipo];
    if (aba !== "clube" && !abas.some(([k]) => k === aba)) aba = "geral";
    return `<div class="cp cp-${familia(id)}${c.tipo === "estadual" ? ` cp-est uf-${c.uf.toLowerCase()}` : ""}" data-copa="${id}" data-aba="${aba}" data-extra="${esc(extra || "")}">
      ${barra(id)}
      ${faixa(id)}
      ${c.tipo === "liga" ? "" : `<ol class="cp-linha" data-cp-linha aria-label="Fases da competição"></ol>`}
      <div class="club-tabs"><div class="tabs" data-tabs><span class="tab-ink"></span>
        ${abas.map(([k, l]) => `<a class="tab ${k === aba || (aba === "clube" && k === "clubes") ? "on" : ""}" href="#/copa/${id}/${k}">${l}</a>`).join("")}
      </div></div>
      <div data-cp-corpo><div class="card"><div class="empty" style="padding:40px">Carregando a competição…</div></div></div>
    </div>`;
  }

  function paginaEstaduais() {
    return `<div class="cp cp-estaduais" data-copa="estaduais">
      ${barra("estaduais")}
      ${faixa("estaduais", { sub: "Os campeonatos dos estados · janeiro a março" })}
      <div class="cp-est-grid">${ESTADUAIS.map((k) => `<a class="cp-est-card uf-${C[k].uf.toLowerCase()}" href="#/copa/${k}" style="--e1:${C[k].cores[0]};--e2:${C[k].cores[1]};--e3:${C[k].cores[2]}">
        <span class="cp-est-faixa"></span>${emblema(k, 54)}<b>${C[k].nome}</b><small>${C[k].longo}</small><em data-est="${k}">Carregando…</em></a>`).join("")}</div>
      <p class="source">Os estaduais com cobertura completa da ESPN (jogos, gols e cartões). Paranaense, Baiano, Catarinense e Paraense não têm essa cobertura.</p>
    </div>`;
  }

  /* ---------- séries do Brasileirão (pontos corridos) ---------- */
  function rodadaAtual(D) {
    const js = D.jogos.filter((j) => j.rodada);
    if (!js.length) return null;
    const prox = js.find((j) => j.estado !== "post");
    return prox ? prox.rodada : js[js.length - 1].rodada;
  }
  const fonteDe = (D) => `${esc(D.fonte || "ESPN")}${D.fonteUrl ? ` · <a href="${esc(window.SEG.url(D.fonteUrl))}" target="_blank" rel="noopener noreferrer" style="color:var(--ink)">artigo da temporada</a>` : ""}`;
  function geralLiga(id, D) {
    const r = rodadaAtual(D), daRodada = r ? D.jogos.filter((j) => j.rodada === r) : [];
    const tab = D.grupos[0]?.linhas || D.geral;
    const semJogos = !D.jogos.length;
    return `<div class="grid-2 cp-grid">
      <div>
        ${daRodada.length ? `<div class="card"><div class="card-h">${r}ª rodada <small><a href="#/copa/${id}/jogos" style="color:var(--ink)">todas as rodadas ›</a></small></div>${listaPorData(id, daRodada)}</div>` : ""}
        <div class="card"><div class="card-h">${esc(D.grupos[0]?.nome && D.grupos[0].nome !== "Classificação" ? D.grupos[0].nome : "Classificação")} <small><a href="#/copa/${id}/classificacao" style="color:var(--ink)">completa ›</a></small></div>${tabela(id, tab, zonaLiga(D), true)}${legendaLiga(D)}</div>
        ${semJogos ? `<div class="card cp-aviso"><div class="card-h">Sem placar ao vivo nesta série</div><p>A ESPN não cobre a ${esc(C[id].nome)} de 2026. Classificação e artilharia vêm da Wikipédia, que os editores atualizam depois de cada rodada. Com a chave paga da API-Football no robô, os jogos e o placar ao vivo entram aqui.</p></div>` : ""}
      </div>
      <div>
        <div class="card"><div class="card-h">Artilharia <small><a href="#/copa/${id}/rankings" style="color:var(--ink)">rankings ›</a></small></div>${artilharia(id, D, 10)}</div>
        <div class="card"><div class="card-h">Como funciona</div><ul class="cp-como">${como(id, D)}</ul></div>
        <div class="card"><div class="card-h">Notícias da ${esc(C[id].nome)}</div>${D.noticias?.length ? `<ul class="cp-news">${D.noticias.map((n) => `<li><a href="${esc(window.SEG.url(n.link))}" target="_blank" rel="noopener noreferrer"><b>${esc(n.title)}</b><small>${esc(n.source || "")}</small></a></li>`).join("")}</ul>` : `<div class="empty" style="padding:20px">Sem manchetes nos últimos dias.</div>`}
          <div class="source">Só título, veículo, data e link · Google Notícias</div></div>
      </div></div><p class="source">Fonte: ${fonteDe(D)}</p>`;
  }
  function jogosLiga(id, D, filtro) {
    const rods = [...new Set(D.jogos.map((j) => j.rodada).filter(Boolean))].sort((a, b) => a - b);
    if (!rods.length) return `<div class="card"><div class="empty" style="padding:40px">Sem jogos desta série nas fontes gratuitas. ${esc(C[id].longo)}: classificação e artilharia na visão geral.</div></div>`;
    const r = rods.includes(+filtro) ? +filtro : rodadaAtual(D);
    const lista = D.jogos.filter((j) => j.rodada === r);
    return `<div class="card"><div class="round-nav cp-rod"><button type="button" data-cp-fase="${rods[rods.indexOf(r) - 1] ?? ""}" ${rods.indexOf(r) > 0 ? "" : "disabled"} aria-label="Rodada anterior">‹</button>
        <div><b>${r}ª rodada</b><small>${esc(C[id].longo)} 2026</small></div>
        <button type="button" data-cp-fase="${rods[rods.indexOf(r) + 1] ?? ""}" ${rods.indexOf(r) < rods.length - 1 ? "" : "disabled"} aria-label="Próxima rodada">›</button></div>
      ${listaPorData(id, lista)}<div class="source">Horários de Brasília · fonte: ${fonteDe(D)}${D.updated ? ` · atualizado em ${esc(D.updated)}` : ""}</div></div>`;
  }
  function classificacaoLiga(id, D) {
    return D.grupos.map((g, i) => `<div class="card"><div class="card-h">${esc(g.nome)} <small>${g.linhas.length} clubes</small></div>${tabela(id, g.linhas, i === 0 || id === "serie-d" ? zonaLiga(D) : () => "")}${i === 0 ? legendaLiga(D) : ""}</div>`).join("")
      + (D.grupos.length ? "" : `<div class="card"><div class="card-h">Classificação</div>${tabela(id, D.geral, zonaLiga(D))}${legendaLiga(D)}</div>`)
      + `<p class="source">Fonte: ${fonteDe(D)}</p>`;
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
    return `<ul class="squad-list cp-art">${L.map((a, i) => `<li><span class="n">${i + 1}º</span>${escudo({ clube: a.clube, nome: a.timeNome, logo: a.logo }, 30)}<div style="flex:1;min-width:0"><b>${esc(a.nome)}</b><small class="sl-sub">${esc(a.clube && byId[a.clube] ? byId[a.clube].abbr : a.timeNome || "")}${a.jogos ? ` · ${a.jogos} jogo${a.jogos > 1 ? "s" : ""} com gol` : ""}${a.pen ? ` · ${a.pen} de pênalti` : ""}</small><div class="bar" style="height:5px;margin-top:5px"><i data-w="${(a.gols / max) * 100}" style="width:${(a.gols / max) * 100}%;background:var(--accent)"></i></div></div><b class="goals">${a.gols}</b></li>`).join("")}</ul>`;
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
    const semCartoes = !D.jogos.length;
    const R0 = [["Mais gols", (r) => r.gp, (a, b) => b.gp - a.gp, "gols marcados"], ["Melhor ataque", (r) => (r.gp / r.j).toFixed(2).replace(".", ","), (a, b) => b.gp / b.j - a.gp / a.j || b.gp - a.gp, "gols por jogo"],
      ["Melhor defesa", (r) => (r.gc / r.j).toFixed(2).replace(".", ","), (a, b) => a.gc / a.j - b.gc / b.j || b.j - a.j, "sofridos por jogo"], ["Mais amarelos", (r) => r.ca, (a, b) => b.ca - a.ca || a.j - b.j, "cartões amarelos"],
      ["Mais vermelhos", (r) => r.cv, (a, b) => b.cv - a.cv || b.ca - a.ca, "cartões vermelhos"]];
    const R = semCartoes ? R0.slice(0, 3) : R0;
    const bloco = ([t, v, s, un]) => {
      const top = [...L].sort(s).slice(0, 10), mx = Math.max(...top.map((r) => +String(v(r)).replace(",", "."))) || 1;
      return `<div class="card cp-rank"><div class="card-h">${t} <small>${un}</small></div><ol class="rank-list">${top.map((r, i) => `<li class="rank-row" style="--c1:var(--accent)"><span class="rk-pos">${i + 1}</span><a class="rk-club" href="${linkT(id, r)}">${escudo(r, 30)}<span><b>${nomeT(r)}</b><small>${r.j} jogos</small></span></a><span class="rk-bar"><i style="width:${Math.max(3, (+String(v(r)).replace(",", ".") / mx) * 100)}%"></i></span><b class="rk-val">${v(r)}</b></li>`).join("")}</ol></div>`;
    };
    return `<div class="card"><div class="card-h">Artilharia <small>top 20</small></div>${artilharia(id, D, 20)}</div><div class="cp-ranks">${R.map(bloco).join("")}</div>
      <div class="source">Melhor defesa: menos gols sofridos por jogo. ${semCartoes ? `Cartões indisponíveis nesta série (sem súmula nas fontes gratuitas). Fonte: ${fonteDe(D)}` : "Gols e cartões contados jogo a jogo (ESPN)."}</div>`;
  }
  function clubes(id, D) {
    const L = [...(D.participantes?.length ? D.participantes.map((p) => D.geral.find((r) => r.nome === p.nome) || p) : D.geral)].sort((a, b) => nomeT(a).localeCompare(nomeT(b), "pt-BR"));
    return `<div class="card"><div class="card-h">Clubes participantes <small>${L.length}</small></div><ul class="cp-clubes">${L.map((r) => { const s = situacao(D, r.id); return `<li><a href="${linkT(id, r)}">${escudo(r, 40)}<b>${nomeT(r)}</b><small class="cp-sit ${s.cls}">${esc(s.txt)}</small></a></li>`; }).join("")}</ul></div>`;
  }
  function clube(id, D, tid) {
    const r = D.geral.find((x) => x.id === tid) || (D.participantes || []).find((x) => x.id === tid);
    if (!r) return `<div class="card"><div class="empty" style="padding:40px">Clube não encontrado nesta competição.</div></div>`;
    const js = D.jogos.filter((j) => j.casa.id === tid || j.fora.id === tid), s = situacao(D, tid);
    const art = D.artilharia.filter((a) => a.time === tid || a.timeNome === r.nome);
    const k = (v, l) => `<div class="kpi"><small>${l}</small><b>${v}</b></div>`;
    return `<div class="card cp-cl-topo"><a class="back-link" href="#/copa/${id}/clubes">‹ Clubes</a><div class="cp-cl-in">${escudo(r, 84)}<div><h2>${nomeT(r)}</h2><small class="cp-sit ${s.cls}">${esc(s.txt)}</small>
        ${r.clube && byId[r.clube] ? `<a class="cp-cl-link" href="#/clube/${r.clube}">Página do clube ›</a>` : ""}</div></div></div>
      <div class="kpis">${k(r.j ?? "—", "Jogos")}${k(r.j != null ? `${r.v}-${r.e}-${r.d}` : "—", "V-E-D")}${k(r.j != null ? `${r.gp}:${r.gc}` : "—", "Gols pró : contra")}${D.jogos.length ? k(`${r.ca} · ${r.cv}`, "Amarelos · vermelhos") : k(esc(r.uf || "—"), "Estado")}</div>
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
      return `<li class="sim-j" data-cp-sim="${j.id}"><span class="sim-when">${dataLonga(j.data)} · ${j.rodada ? `${j.rodada}ª rodada` : esc(j.faseNome)}${j.grupo ? ` · ${esc(j.grupo)}` : ""}</span>
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
    if (C[id].tipo === "liga") return `<div class="card-h">Como ficaria</div>${tabela(id, tabelaSim(D.jogos.filter((j) => j.faseNome === "Pontos corridos" || j.rodada), palp), zonaLiga(D), true)}${legendaLiga(D)}`;
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
  async function clubesSerie(el) {
    const id = el.dataset.clubesSerie, D = await carrega(id);
    if (!el.isConnected) return;
    if (!D) { el.innerHTML = `<div class="empty" style="padding:40px">Lista da ${esc(C[id].longo)} indisponível agora.</div>`; return; }
    const L = (D.participantes?.length ? D.participantes : D.grupos[0]?.linhas || D.geral).slice().sort((a, b) => nomeT(a).localeCompare(nomeT(b), "pt-BR"));
    el.innerHTML = `<ul class="cl-serie">${L.map((t, i) => `<li style="--i:${Math.min(i, 30)}"><a href="${linkT(id, t)}">${escudo(t, 56)}<b>${nomeT(t)}</b><small>${esc(t.uf || "")}${t.cidade ? ` · ${esc(t.cidade)}` : ""}</small></a></li>`).join("")}</ul>
      <p class="source">${L.length} clubes · ${fonteDe(D)}. Escudos: ESPN e Wikimedia Commons (só imagens livres); sem imagem livre, o escudo é desenhado pelo site com as iniciais.</p>`;
  }
  async function mount(root) {
    ajustaBarras(root);
    root.querySelectorAll("[data-clubes-serie]").forEach(clubesSerie);
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
    const nClubes = D.participantes?.length || D.geral.length;
    el.querySelector("[data-cp-fase]").innerHTML = `<span class="cp-fase-pill${D.encerrado ? " fim" : ""}">${D.encerrado ? (D.campeao ? `🏆 ${nomeT(D.campeao)}` : "Encerrado") : `<i></i>${esc(C[id].tipo === "liga" && D.jogos.length ? `${rodadaAtual(D)}ª rodada` : D.faseAtual || "")}`}</span><small>${D.jogos.length ? `${D.jogos.length} jogos · ` : ""}${nClubes} clubes</small>`;
    const linha = el.querySelector("[data-cp-linha]");
    if (linha) linha.innerHTML = linhaDoTempo(D);
    if (linha) centraliza(linha, linha.querySelector(".cp-f.atual") || [...linha.querySelectorAll(".cp-f.feita")].pop());
    const pinta = () => {
      const aba = el.dataset.aba;
      const liga = C[id].tipo === "liga";
      corpo.innerHTML = liga && aba === "geral" ? geralLiga(id, D) : liga && aba === "classificacao" ? classificacaoLiga(id, D) : liga && aba === "jogos" ? jogosLiga(id, D, estado.fase[id])
        : aba === "classificacao" ? classificacao(id, D) : aba === "chave" ? chave(id, D) : aba === "jogos" ? jogos(id, D, estado.fase[id]) : aba === "rankings" ? rankings(id, D)
        : aba === "clubes" ? clubes(id, D) : aba === "clube" ? clube(id, D, decodeURIComponent(el.dataset.extra)) : aba === "simulador" ? simulador(id, D) : aba === "bora" ? bora(id, D) : geral(id, D);
      corpo.querySelector(".cp-col.atual")?.scrollIntoView?.({ block: "nearest", inline: "center" });
    };
    pinta();
    aoVivo(id, D, () => { if (!corpo.querySelector("input:focus")) pinta(); });
    corpo.addEventListener("click", (e) => {
      const f = e.target.closest("[data-cp-fase]");
      if (f) { if (f.dataset.cpFase === "") return; estado.fase[id] = f.dataset.cpFase; pinta(); return; }
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
    if (id === "estaduais") return "Estaduais — O Placar.TV";
    const c = C[id];
    if (!c) return "Competição — O Placar.TV";
    const D = window.COMPETICOES?.[id], t = aba === "clube" && D ? D.geral.find((r) => r.id === decodeURIComponent(extra || "")) : null;
    return `${t ? `${t.nome} na ` : ""}${c.longo} — O Placar.TV`;
  };

  window.COPA = { C, ESTADUAIS, SERIES, page, mount, barra, faixa, tema, intro, familia, titulo, carrega, emblema };
})();
