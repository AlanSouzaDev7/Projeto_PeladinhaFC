/* ==========================================================================
   PLACAR — aplicação (SPA com rotas por hash, sem dependências)
   ========================================================================== */
(async () => {
  await window.PD_BOOT; // dados ao vivo da API, quando ela estiver rodando
  const { CLUBS, byId, REAL, buildStandings, realMatches } = window.PD;
  let { ROUND, ROUNDS } = window.PD;
  const { crest, kitBg, onColor, display, flagBR } = window.GFX;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $("#view");
  const root = document.documentElement;

  /* ---------- estado ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("placar:" + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("placar:" + k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } },
  };
  const state = {
    standings: buildStandings(),
    matches: realMatches(ROUND),
    favs: new Set(store.get("favs", ["flamengo", "palmeiras"])),
    filter: "all",
    round: ROUND,
    route: null,
  };
  const rowOf = (id) => state.standings.find((r) => r.id === id);
  /* próximo jogo: o da rodada atual, se ainda não foi disputado; senão o que a CBF indica */
  const nextOf = (id) => {
    const m = state.matches.find((x) => x.status !== "ft" && (x.home === id || x.away === id));
    return m ? (m.home === id ? m.away : m.home) : rowOf(id).next;
  };

  /* ---------- utilidades ---------- */
  const ICON = {
    star: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/></svg>`,
    arrow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>`,
    pin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    cal: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/></svg>`,
    stadium: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="8" rx="9" ry="3.5"/><path d="M3 8v7c0 2 4 3.5 9 3.5s9-1.5 9-3.5V8"/></svg>`,
    ball: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z" fill="currentColor"/></svg>`,
  };
  const clubVars = (c) => `--k1:${c.colors[0]};--k2:${c.colors[1]};--k3:${c.colors[2]};--k-on:${onColor(c.colors[0])}`;
  const matchVars = (m) => `--h1:${display(byId[m.home])};--a1:${display(byId[m.away])}`;
  const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dayKey = (d) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  function dayName(date) {
    if (!date) return "Data não informada";
    const d = new Date(`${date}T12:00:00-03:00`), today = dayKey(new Date());
    const tomorrow = dayKey(new Date(Date.now() + 864e5)), yesterday = dayKey(new Date(Date.now() - 864e5));
    const dm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
    return date === today ? `Hoje · ${dm}` : date === tomorrow ? `Amanhã · ${dm}` : date === yesterday ? `Ontem · ${dm}` : `${WD[d.getUTCDay()]} · ${dm}`;
  }
  const statusLabel = (m) =>
    m.status === "ft" ? "Fim" : m.status === "progress" ? `<span>●</span> ${m.clock || "Agora"}` : m.status === "pending" ? "Aguard." : m.time || "A definir";
  const statusText = (m) =>
    m.status === "ft" ? "Encerrado" : m.status === "progress" ? `Ao vivo${m.clock ? ` · ${m.clock}` : ""}` : m.status === "pending" ? "Aguardando resultado" : m.time ? `${dayName(m.date)} · ${m.time}` : m.date ? `${dayName(m.date)} · horário a definir` : "A definir";
  const posClass = (p) => (p <= 4 ? "lib" : p <= 6 ? "pre" : p <= 12 ? "sul" : p >= 17 ? "z4" : "");
  /* ==========================================================================
     Tema do clube (cores aplicadas no :root)
     ========================================================================== */
  function applyTheme(club) {
    const c = club ? club.colors : null;
    root.style.setProperty("--c1", c ? c[0] : "var(--brand)");
    root.style.setProperty("--c2", c ? c[1] : "#ffffff");
    root.style.setProperty("--c3", c ? c[2] : "var(--brand-2)");
    root.style.setProperty("--on-c1", c ? onColor(c[0]) : "#ffffff");
    root.style.setProperty("--accent", club ? display(club) : "var(--brand)");
    root.style.setProperty("--on-accent", club ? onColor(display(club)) : "#ffffff");
    root.style.setProperty("--logo-spot", c ? c[1] : "var(--live)");
    $('meta[name="theme-color"]').content = c ? c[0] : "#0b0f17";
  }

  /* ==========================================================================
     Componentes
     ========================================================================== */
  function matchRow(m, i = 0) {
    const h = byId[m.home], a = byId[m.away];
    const live = m.status === "progress";
    const started = m.status === "ft" || (live && m.hs != null);
    const fav = state.favs.has(m.home) || state.favs.has(m.away);
    const lose = (s) => m.status === "ft" && (s === "home" ? m.hs < m.as : m.as < m.hs);
    return `<a class="match" href="#/partida/${m.id}" data-match="${m.id}" style="--i:${i};${matchVars(m)}">
      <div class="time ${live ? "live" : ""}">${statusLabel(m)}${m.adiado ? `<small class="adiado">adiado</small>` : ""}</div>
      <div class="teams">
        <div class="team ${lose("home") ? "loser" : ""}">${crest(h, 18)}<span>${h.abbr}</span></div>
        <div class="team ${lose("away") ? "loser" : ""}">${crest(a, 18)}<span>${a.abbr}</span></div>
      </div>
      <div class="score ${live ? "live" : ""}"><b data-s="h">${started ? m.hs : ""}</b><b data-s="a">${started ? m.as : ""}</b></div>
      <button class="star ${fav ? "on" : ""}" data-fav="${m.home}" aria-label="Favoritar ${h.abbr}">${ICON.star}</button>
    </a>`;
  }

  function standingsTable(rows, highlight = null, compact = false) {
    const hs = (t) => `<th class="hide-sm">${t}</th>`;
    return `<table class="table">
      <thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th>${compact ? "" : ["V", "E", "D", "GP", "GC"].map(hs).join("")}<th>SG</th>${compact ? "" : ["%", "CA", "CV", "Próx."].map(hs).join("")}</tr></thead>
      <tbody>${rows.map((r, i) => {
        const c = byId[r.id], nx = byId[nextOf(r.id)];
        const hd = (v) => `<td class="hide-sm">${v}</td>`;
        return `<tr class="${r.id === highlight ? "me" : ""}" style="--i:${i}">
          <td><span class="pos ${posClass(r.pos)}">${r.pos}</span></td>
          <td class="club"><a href="#/clube/${c.id}">${crest(c, 20)}<span>${compact ? c.abbr : c.name}</span></a></td>
          <td class="pts">${r.p}</td><td>${r.j}</td>
          ${compact ? "" : [r.w, r.d, r.l, r.gf, r.ga].map(hd).join("")}
          <td>${r.sg > 0 ? "+" : ""}${r.sg}</td>
          ${compact ? "" : [r.pct, r.ca, `<span class="cv">${r.cv}</span>`, nx ? `<a href="#/clube/${nx.id}" title="${nx.name}" style="display:inline-block">${crest(nx, 20)}</a>` : "—"].map(hd).join("")}
        </tr>`;
      }).join("")}</tbody></table>`;
  }
  const sourceNote = `<div class="source">Fonte: <a href="${REAL.url}" target="_blank" rel="noopener">${REAL.source}</a> · atualizado em ${REAL.updated}</div>`;

  /* artilharia oficial */
  /* ---------- estatísticas do elenco: pendurados, sequência, departamento médico e minutagem dos reservas ----------
     full = false: resumo de 4 blocos na visão geral; full = true: aba "Estatísticas" com tudo */
  function playerStatsHTML(id, full = false) {
    const all = window.PLAYER_STATS, d = all && all.clubs && all.clubs[id];
    if (!d) return full ? `<div class="card"><div class="empty" style="padding:40px">Estatísticas dos jogadores ainda não disponíveis.</div></div>` : "";
    const nums = Object.fromEntries((window.SQUADS[id] || []).map((p) => [p[4], p[0]]));
    const n = full ? 99 : 4;
    const fmt = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");
    const num = (pid) => `<span class="ps-n">${nums[pid] ?? "–"}</span>`;
    const empty = (t) => `<li class="ps-empty">${t}</li>`;
    const src = (x) => x ? `<a class="ps-src" href="${x.link}" target="_blank" rel="noopener" title="${(x.manchete || "").replace(/"/g, "&quot;")}">${x.fonte}${x.setorista ? " · setorista" : ""} · ${fmt(x.data)} ↗</a>` : "";
    const blocks = [
      ["pend", "Pendurados", "a um amarelo da suspensão", `<li class="ps-note"><b>O número ao lado do nome é o total de amarelos na temporada.</b>
          <span>No Brasileirão, o 3º, o 6º, o 9º… amarelo suspendem. Quem tem 2, 5 ou 8 está pendurado: mais um cartão e fica fora do próximo jogo.</span></li>` +
        (d.pendurados.length
        ? d.pendurados.slice(0, n).map((p) => `<li>${num(p.id)}<b>${p.name}</b><span class="ps-tag ${p.so_imprensa ? "warn" : p.imprensa ? "ok" : ""}">${p.so_imprensa ? "segundo a imprensa" : p.imprensa ? "confirmado pela imprensa" : "pela súmula"}${p.amarelos ? ` · suspende no ${p.amarelos + 1}º` : ""}</span><span class="ps-v" title="${p.amarelos ?? "–"} amarelos na temporada"><i class="rk-card y"></i>${p.amarelos ?? "–"}<small>na temporada</small></span>${full ? src(p.imprensa) : ""}</li>`).join("")
        : empty("Nenhum jogador pendurado."))],
      ["seq", "Jogos seguidos", "partidas em sequência, sem desfalcar", d.sequencia.length
        ? d.sequencia.slice(0, n).map((p) => `<li>${num(p.id)}<b>${p.name}</b><span class="ps-sub">${p.titular} como titular</span><span class="ps-v">${p.jogos}</span></li>`).join("")
        : empty("Ninguém com 2 ou mais jogos seguidos.")],
      ["dm", "Departamento médico", "lesões noticiadas pela imprensa", d.lesionados.length
        ? d.lesionados.slice(0, n).map((p) => `<li>${num(p.id)}<b>${p.name}</b><span class="ps-tag ${p.confirmado ? "ok" : "warn"}">${p.confirmado ? `${p.fontes.length} fonte${p.fontes.length > 1 ? "s" : ""}` : "1 fonte"}</span>${full ? p.noticias.map(src).join("") : src(p.noticias[0])}</li>`).join("")
        : empty("Nenhuma lesão noticiada nos últimos 21 dias.")],
      ["res", "Reservas mais usados", "minutos de quem foi titular em menos da metade dos jogos", d.reservas.length
        ? (() => { const max = d.reservas[0].minutos || 1; return d.reservas.slice(0, full ? 99 : 5).map((p) => `<li>${num(p.id)}<b>${p.name}</b><span class="ps-sub">${p.jogos} jogos · ${p.titular} titular</span><span class="ps-v">${p.minutos}'</span><span class="ps-bar"><i data-w="${((p.minutos / max) * 100).toFixed(1)}"></i></span></li>`).join(""); })()
        : empty("Sem reservas com minutos.")],
    ];
    const foot = `<div class="source">Súmulas: ${d.fontes?.sumulas || "ESPN"} · ${d.jogos} jogos do Brasileirão · lesões e pendurados conferidos em ${(d.fontes?.imprensa || []).length ? d.fontes.imprensa.join(", ") : "ge.globo, ESPN, UOL, Lance, Gazeta Esportiva e Terra"} e com os setoristas · atualizado em ${all.updated}</div>`;
    const grid = `<div class="pstats ${full ? "full" : ""}">${blocks.map(([k, t, sub, li]) => `<section class="ps-b ps-${k}"><h4>${t}<small>${sub}</small></h4><ul>${li}</ul></section>`).join("")}</div>`;
    return full ? `<div class="card">${grid}${foot}</div>`
      : `<div class="card reveal"><div class="card-h">Estatísticas do elenco <small><a href="#/clube/${id}/estatisticas" style="color:var(--accent)">ver tudo ›</a></small></div>${grid}${foot}</div>`;
  }

  /* ---------- retrospecto: últimos 5 e próximos 5 jogos, em todas as competições ---------- */
  function formInner(id, d) {
    if (!d) return `<div class="empty" style="padding:28px">Carregando o retrospecto…</div>`;
    if (!d.last?.length && !d.next?.length) return `<div class="empty" style="padding:28px">Retrospecto ainda não disponível.</div>`;
    const c = byId[id];
    const oppCrest = (e) => (e.oppId && byId[e.oppId] ? crest(byId[e.oppId], 26) : e.oppLogo ? `<img class="crest" src="${e.oppLogo}" width="26" height="26" alt="" loading="lazy" />` : `<i class="fm-nocrest"></i>`);
    const dm = (iso) => iso.split("-").reverse().slice(0, 2).join("/");
    const wk = (iso) => WD[new Date(`${iso}T12:00:00-03:00`).getDay()];
    const tag = (e) => `<span class="fm-comp">${e.comp}${e.stage ? ` · ${e.stage}` : ""}</span>`;
    const where = (e) => `<span class="fm-where ${e.home ? "casa" : "fora"}">${e.home ? "Casa" : "Fora"}</span>`;
    const RES = { V: "Vitória", E: "Empate", D: "Derrota" };
    const pts = d.last.reduce((t, e) => t + (e.res === "V" ? 3 : e.res === "E" ? 1 : 0), 0);
    const last = d.last.map((e, i) => `<li class="fm-row" style="--i:${i}">
        <span class="fm-res ${e.res}" title="${RES[e.res]}">${e.res}</span>
        <span class="fm-date"><b>${dm(e.date)}</b><small>${wk(e.date)}</small></span>
        <span class="fm-opp">${oppCrest(e)}<span><b>${e.home ? "" : "@ "}${e.oppId ? byId[e.oppId].abbr : e.opp}</b>${tag(e)}</span></span>
        <span class="fm-score"><b>${e.home ? `${e.gf}–${e.ga}` : `${e.ga}–${e.gf}`}</b>${e.pen ? `<small>pên. ${e.home ? `${e.pen[0]}–${e.pen[1]}` : `${e.pen[1]}–${e.pen[0]}`}</small>` : ""}</span>
        ${where(e)}</li>`).join("");
    const next = d.next.map((e, i) => `<li class="fm-row" style="--i:${i}">
        <span class="fm-n">${i + 1}</span>
        <span class="fm-date"><b>${dm(e.date)}</b><small>${wk(e.date)} · ${e.time || "A definir"}</small></span>
        <span class="fm-opp">${oppCrest(e)}<span><b>${e.home ? "" : "@ "}${e.oppId ? byId[e.oppId].abbr : e.opp}</b>${tag(e)}</span></span>
        <span class="fm-score"><small>${e.venue || ""}</small></span>
        ${where(e)}</li>`).join("");
    return `<div class="fm-grid">
        <section><h4>Últimos 5 <span class="fm-strip">${d.last.slice().reverse().map((e) => `<i class="fm-res ${e.res}" title="${dm(e.date)} · ${RES[e.res]}">${e.res}</i>`).join("")}</span>
          <small>${pts} de ${d.last.length * 3} pontos possíveis · do mais recente ao mais antigo</small></h4><ul>${last || `<li class="ps-empty">Sem jogos.</li>`}</ul></section>
        <section><h4>Próximos 5 <small>${d.next.length ? `próximo: ${dm(d.next[0].date)} ${d.next[0].time ? `às ${d.next[0].time}` : "· horário a definir"}` : "sem jogos marcados"}</small></h4><ul>${next || `<li class="ps-empty">Sem jogos marcados.</li>`}</ul></section>
      </div>
      <div class="source">Todas as competições (Brasileirão, Copa do Brasil, Libertadores e Sul-Americana) · fonte: ESPN · placar sempre do ponto de vista do mandante · “@” = ${c.abbr} fora de casa</div>`;
  }
  /* ---------- aba Partidas: temporada inteira (resultados e jogos por vir), por mês, com filtro de competição ---------- */
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function historyHTML(id, d, filtro = state.histFilter || "Todas") {
    const c = byId[id];
    if (!d?.all?.length) return `<div class="card"><div class="empty" style="padding:40px">Buscando os jogos do ${c.abbr}…</div></div>`;
    const comps = ["Todas", ...new Set(d.all.map((e) => e.comp))];
    if (!comps.includes(filtro)) filtro = "Todas";
    const list = d.all.filter((e) => filtro === "Todas" || e.comp === filtro);
    const done = list.filter((e) => e.state === "post");
    const n = (r) => done.filter((e) => e.res === r).length;
    const gp = done.reduce((t, e) => t + e.gf, 0), gc = done.reduce((t, e) => t + e.ga, 0);
    const side = (club, name, logo) => `<span class="hm-team">${club ? crest(club, 24) : logo ? `<img class="crest" src="${logo}" width="24" height="24" alt="" loading="lazy" />` : `<i class="fm-nocrest"></i>`}<b>${club ? club.abbr : name}</b></span>`;
    const opp = (e) => (e.oppId && byId[e.oppId] ? byId[e.oppId] : null);
    const row = (e) => {
      const H = e.home ? side(c) : side(opp(e), e.opp, e.oppLogo), A = e.home ? side(opp(e), e.opp, e.oppLogo) : side(c);
      const hs = e.home ? e.gf : e.ga, as = e.home ? e.ga : e.gf;
      const mid = e.state === "post" ? `<b class="hm-score">${hs}<i>×</i>${as}</b>${e.pen ? `<small>pên. ${e.home ? e.pen[0] : e.pen[1]}–${e.home ? e.pen[1] : e.pen[0]}</small>` : ""}`
        : e.state === "in" ? `<b class="hm-score live">${hs}<i>×</i>${as}</b><small class="live">● ${e.clock || "ao vivo"}</small>`
        : `<b class="hm-time ${e.time ? "" : "tbd"}">${e.time || "A definir"}</b>`;
      return `<li class="hm-row ${e.state} ${e.res ? `r${e.res}` : ""}">
        <span class="hm-date"><b>${e.date.slice(8, 10)}/${e.date.slice(5, 7)}</b><small>${WD[new Date(`${e.date}T12:00:00-03:00`).getDay()]}</small></span>
        <span class="hm-comp">${e.comp}${e.stage ? `<small>${e.stage}</small>` : ""}</span>
        <span class="hm-match">${H}<span class="hm-mid">${mid}</span>${A}</span>
        <span class="hm-res">${e.res ? `<i class="fm-res ${e.res}">${e.res}</i>` : ""}</span>
        <span class="hm-venue">${e.venue || ""}</span></li>`;
    };
    let month = "";
    const rows = list.map((e) => {
      const m = MESES[+e.date.slice(5, 7) - 1] + " " + e.date.slice(0, 4), head = m !== month ? `<li class="hm-month">${(month = m)}</li>` : "";
      return head + row(e);
    }).join("");
    const hasNext = list.some((e) => e.state !== "post");
    return `<div class="card hm">
      <div class="card-h">Jogos do ${c.abbr} na temporada <small>${done.length} disputados · ${list.length - done.length} por vir</small></div>
      <div class="hm-top">
        <div class="chips hm-chips">${comps.map((x) => `<button class="chip ${x === filtro ? "on" : ""}" data-hist-filter="${x}">${x}</button>`).join("")}</div>
        <div class="hm-sum"><span><b>${done.length}</b>jogos</span><span class="v"><b>${n("V")}</b>vitórias</span><span class="e"><b>${n("E")}</b>empates</span><span class="d"><b>${n("D")}</b>derrotas</span><span><b>${gp}</b>gols pró</span><span><b>${gc}</b>gols contra</span></div>
        ${hasNext ? `<a class="hm-jump" href="#" data-hist-next>Ir para o próximo jogo ↓</a>` : ""}
      </div>
      <ul class="hm-list">${rows}</ul>
      <div class="source">Temporada ${d.all[0].date.slice(0, 4)} · todas as competições oficiais · fonte: ESPN · horários de Brasília; "A definir" = horário ainda não marcado pela CBF/Conmebol${window.CLUB_FORM?.updated ? ` · atualizado em ${window.CLUB_FORM.updated}` : ""}</div>
    </div>`;
  }

  function formCard(id) {
    const d = window.CLUB_FORM?.clubs?.[id];
    return `<div class="card reveal fm" data-form="${id}"><div class="card-h">Retrospecto <small>últimos 5 e próximos 5 jogos</small></div>${formInner(id, d)}</div>`;
  }

  function scorersCard(limit = 10, clubId = null, clubs = null) {
    const list = REAL.scorers.filter((x) => (!clubId || x[1] === clubId) && (!clubs || clubs.includes(x[1]))).slice(0, limit);
    if (!list.length) return "";
    const max = REAL.scorers[0][2];
    return `<div class="card reveal"><div class="card-h">Artilharia <small>${REAL.source}</small></div>
      <ul class="squad-list">${list.map(([name, cid, g]) => {
        const pos = REAL.scorers.findIndex((x) => x[0] === name) + 1;
        const ficha = scorerOf(name, cid);
        return `<li${ficha ? ` class="has-ficha" data-scorer="${name}|${cid}" tabindex="0" aria-label="Ficha de ${name}"` : ""}><span class="n">${pos}º</span>${crest(byId[cid], 22)}<div style="flex:1;min-width:0"><b>${name}</b><div class="bar" style="height:5px;margin-top:5px"><i data-w="${(g / max) * 100}" style="background:${display(byId[cid])}"></i></div></div><b class="goals">${g}</b>${ficha ? `<span class="sc-more" aria-hidden="true">›</span>` : ""}</li>`;
      }).join("")}</ul>${list.some(([n, c]) => scorerOf(n, c)) ? `<div class="source">Passe o mouse (ou toque) no jogador para ver a ficha</div>` : ""}</div>`;
  }

  /* ---------- Ficha do artilheiro (cartão flutuante) ----------
     Dados do elenco e das súmulas da ESPN de todos os jogos do Brasileirão (gravados pela API / GitHub Actions). */
  const scorerOf = (name, cid) => (window.PLAYER_STATS?.artilheiros || []).find((x) => x.name === name && x.club === cid && x.jogos);
  const POSICAO = { G: "Goleiro", D: "Defensor", M: "Meio-campista", F: "Atacante" };
  const dataBR = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "—");
  function scorerHTML(p) {
    const c = byId[p.club], cor = display(c);
    const fatos = [
      ["Posição", POSICAO[p.posicao] || "—"], ["Idade", p.idade ? `${p.idade} anos` : "—"], ["Camisa", p.camisa ?? "—"],
      ["Jogos", `${p.jogos} <small>(${p.titular} como titular)</small>`], ["Minutos", p.min.toLocaleString("pt-BR")],
      ["Gols por jogo", (p.gols / p.jogos).toFixed(2).replace(".", ",")], ["Minutos por gol", p.gols ? Math.round(p.min / p.gols) : "—"],
      ["Assistências", p.assist], ["Finalizações", `${p.chutes} <small>(${p.noAlvo} no alvo)</small>`], ["Gols de pênalti", p.pen],
      ["Cartões", `${p.amarelos} 🟨 · ${p.vermelhos} 🟥`], ["Último gol", dataBR(p.ultimoGol)],
    ];
    const maxAdv = p.adversarios[0]?.[1] || 1;
    return `<div class="sc-h" style="--sc:${cor}">
        ${crest(c, 40)}
        <div><b>${p.name}</b><small>${c.name} · ${p.pos}º na artilharia</small></div>
        <div class="sc-g"><b>${p.gols}</b><small>gols</small></div>
      </div>
      <div class="sc-sec">Ficha técnica</div>
      <dl class="sc-ficha">${fatos.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      ${p.clubes.length > 1 ? `<div class="sc-sec">Gols por clube na temporada</div>
        <ul class="sc-clubes">${p.clubes.map(([k, j, g]) => `<li>${crest(byId[k], 18)}<span>${byId[k].abbr}</span><small>${j} jogos</small><b>${g}</b></li>`).join("")}</ul>` : ""}
      <div class="sc-sec">Contra quem marcou <small>${p.adversarios.length} clubes</small></div>
      ${p.adversarios.length ? `<ul class="sc-adv">${p.adversarios.map(([k, g]) => `<li>${crest(byId[k], 18)}<span>${byId[k].abbr}</span><i style="--w:${(g / maxAdv) * 100}%;background:${cor}"></i><b>${g}</b></li>`).join("")}</ul>` : `<p class="sc-none">Nenhum gol nas súmulas.</p>`}
      <div class="sc-src">Súmulas: ESPN${p.golsSumulas !== p.gols ? ` · ${p.golsSumulas} gols nas súmulas do Brasileirão` : ""}</div>`;
  }
  let scTip = null;
  function scorerCards(root) {
    const items = $$("[data-scorer]", root);
    if (!items.length) return;
    if (!scTip) {
      scTip = document.createElement("div");
      scTip.className = "scorer-card";
      scTip.setAttribute("role", "dialog");
      scTip.setAttribute("aria-hidden", "true");
      document.body.appendChild(scTip);
      // toque fora fecha (celular)
      document.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" && !e.target.closest("[data-scorer], .scorer-card")) hideScorer(); });
      addEventListener("scroll", () => { if (scTip.dataset.by === "mouse") hideScorer(); }, { passive: true });
      addEventListener("hashchange", hideScorer);
    }
    items.forEach((el) => {
      const [name, cid] = el.dataset.scorer.split("|");
      const open = (by) => { const p = scorerOf(name, cid); if (p) showScorer(el, p, by); };
      el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") open("mouse"); });
      el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hideScorer(); });
      // toque: abre; tocar de novo fecha (o foco do próprio toque pode já ter aberto a ficha: ela não fecha na mesma hora)
      el.addEventListener("click", (e) => {
        if (e.pointerType === "mouse") return;
        const aberto = scTip.dataset.for === el.dataset.scorer && scTip.classList.contains("open");
        if (aberto && Date.now() - +scTip.dataset.t > 450) hideScorer(); else open("touch");
      });
      el.addEventListener("focus", () => open("key"));
      el.addEventListener("blur", hideScorer);
      el.addEventListener("keydown", (e) => { if (e.key === "Escape") hideScorer(); });
    });
  }
  function showScorer(el, p, by) {
    $$("[data-scorer].peek").forEach((x) => x.classList.remove("peek"));
    el.classList.add("peek");
    scTip.innerHTML = scorerHTML(p);
    scTip.dataset.for = el.dataset.scorer;
    if (scTip.dataset.for !== el.dataset.scorer || !scTip.classList.contains("open")) scTip.dataset.t = Date.now();
    scTip.dataset.by = by;
    const b = el.getBoundingClientRect(), w = Math.min(340, innerWidth - 24);
    scTip.style.width = w + "px";
    const h = scTip.offsetHeight;
    // computador: ao lado da lista (à esquerda dela, que fica na coluna da direita); celular: abaixo ou acima do jogador
    const side = innerWidth >= 900 && b.left - w - 14 > 12;
    const left = side ? b.left - w - 14 : Math.max(12, Math.min(innerWidth - w - 12, b.left + b.width / 2 - w / 2));
    const top = side ? Math.max(12, Math.min(innerHeight - h - 12, b.top + b.height / 2 - h / 2))
      : b.bottom + 8 + h < innerHeight ? b.bottom + 8 : Math.max(12, b.top - 8 - h);
    scTip.style.left = left + "px";
    scTip.style.top = top + "px";
    scTip.classList.add("open");
    scTip.setAttribute("aria-hidden", "false");
  }
  function hideScorer() {
    if (!scTip) return;
    scTip.classList.remove("open");
    scTip.setAttribute("aria-hidden", "true");
    $$("[data-scorer].peek").forEach((x) => x.classList.remove("peek"));
  }

  /* pontos de todos os clubes, com o clube atual em destaque */
  function pointsChart(id) {
    const rows = state.standings, w = 640, h = 220, pb = 26, pt = 14, bw = w / rows.length;
    const max = rows[0].p;
    const Y = (p) => pt + (1 - p / max) * (h - pt - pb);
    return `<svg class="chart pts-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <line x1="0" x2="${w}" y1="${Y(rows[3].p)}" y2="${Y(rows[3].p)}" stroke="#1f6feb" stroke-dasharray="4 4"/>
      <line x1="0" x2="${w}" y1="${Y(rows[16].p)}" y2="${Y(rows[16].p)}" stroke="#ff4d5e" stroke-dasharray="4 4"/>
      <text x="${w - 4}" y="${Y(rows[3].p) - 4}" text-anchor="end">G4 · ${rows[3].p}</text>
      <text x="${w - 4}" y="${Y(rows[16].p) - 4}" text-anchor="end">Z4 · ${rows[16].p}</text>
      ${rows.map((r, i) => {
        const me = r.id === id, c = byId[r.id];
        return `<g><rect x="${i * bw + 3}" y="${Y(r.p)}" width="${bw - 6}" height="${h - pb - Y(r.p)}" rx="3" fill="${me ? display(c) : "var(--surface-3)"}" style="animation-delay:${i * 30}ms"/>
          ${me ? `<text x="${i * bw + bw / 2}" y="${Y(r.p) - 5}" text-anchor="middle" style="fill:var(--text);font-weight:800">${r.p}</text>` : ""}
          <text x="${i * bw + bw / 2}" y="${h - 9}" text-anchor="middle" style="${me ? "fill:var(--text);font-weight:800" : ""}">${c.short}</text></g>`;
      }).join("")}
    </svg>`;
  }

  const legend = `<div class="legend"><span><i style="background:#1f6feb"></i>Libertadores</span><span><i style="background:#1a9b8f"></i>Pré-Libertadores</span><span><i style="background:#7a5af8"></i>Sul-Americana</span><span><i style="background:var(--loss)"></i>Rebaixamento</span></div>`;

  /* comparação dos dois times com os números reais do campeonato */
  function compareHTML(m, limit = 99) {
    const A = rowOf(m.home), B = rowOf(m.away);
    const hc = display(byId[m.home]), ac = display(byId[m.away]);
    const rows = [
      ["Pontos", A.p, B.p], ["Aproveitamento", A.pct, B.pct, "%"], ["Vitórias", A.w, B.w],
      ["Gols marcados", A.gf, B.gf], ["Gols sofridos", A.ga, B.ga], ["Cartões amarelos", A.ca, B.ca], ["Cartões vermelhos", A.cv, B.cv],
    ];
    return rows.slice(0, limit).map(([label, a, b, unit = ""]) => {
      const t = a + b || 1;
      return `<div class="stat-row"><header><b>${a}${unit}</b><span>${label}</span><b>${b}${unit}</b></header>
        <div class="bars"><div class="bar"><i data-w="${(a / t) * 100}" style="background:${hc}"></i></div><div class="bar"><i data-w="${(b / t) * 100}" style="background:${ac}"></i></div></div></div>`;
    }).join("");
  }

  function scoreline(m, link = true) {
    const h = byId[m.home], a = byId[m.away];
    const started = m.status === "ft" || (m.status === "progress" && m.hs != null);
    const st = `<div class="status ${m.status === "progress" ? "" : "ft"}">${statusText(m)}</div>`;
    const side = (c, size) => link ? `<a href="#/clube/${c.id}" class="side">${crest(c, size)}<span>${c.abbr}</span></a>` : `<div class="side">${crest(c, size)}<span>${c.abbr}</span></div>`;
    return `<div class="scoreline">${side(h, 46)}<div><div class="big" data-score>${started ? `${m.hs} - ${m.as}` : "vs"}</div>${st}</div>${side(a, 46)}</div>`;
  }

  /* ==========================================================================
     Páginas
     ========================================================================== */
  function pageHome() {
    const list = state.round === ROUND ? state.matches : realMatches(state.round);
    const counts = { ft: list.filter((m) => m.status === "ft").length, ns: list.filter((m) => m.status !== "ft").length };
    const filtered = list.filter((m) =>
      state.filter === "all" ? true :
      state.filter === "fav" ? state.favs.has(m.home) || state.favs.has(m.away) :
      state.filter === "ft" ? m.status === "ft" : m.status !== "ft");
    const feats = featuredList(), fi = featIndex(feats), featured = feats[fi];
    const favClubs = CLUBS.filter((c) => state.favs.has(c.id));
    const round = state.round;
    const ri = ROUNDS.indexOf(round);
    // agrupa por dia, como nos apps de resultados
    const groups = [];
    filtered.forEach((m) => {
      const g = groups.find((x) => x.date === m.date);
      g ? g.items.push(m) : groups.push({ date: m.date, items: [m] });
    });
    let n = 0;

    return `<div class="layout">
      <aside class="left sticky">
        <div class="card">
          <div class="card-h">Favoritos <small>${favClubs.length}</small></div>
          <div class="side-list">${favClubs.length ? favClubs.map((c) => `<a href="#/clube/${c.id}" style="--club:${display(c)}">${crest(c, 20)}${c.abbr}<span class="count">${rowOf(c.id).pos}º</span></a>`).join("") : `<p class="empty" style="padding:16px">Toque na ★ de uma partida para favoritar.</p>`}</div>
        </div>
        <div class="card">
          <div class="card-h">Competições</div>
          <div class="side-list">
            <a href="#/tabela">${flagBR}Brasileirão Série A<span class="count">20</span></a>
            <a href="#/clubes">${flagBR}Todos os clubes<span class="count">20</span></a>
          </div>
        </div>
        <div class="card">
          <div class="card-h">Clubes</div>
          <div class="side-list">${CLUBS.map((c) => `<a href="#/clube/${c.id}" style="--club:${display(c)}">${crest(c, 20)}${c.abbr}</a>`).join("")}</div>
        </div>
      </aside>

      <section>
        <div class="card">
          <div class="round-nav">
            <button data-round="${ROUNDS[ri - 1] ?? ""}" ${ri > 0 ? "" : "disabled"} aria-label="Rodada anterior">‹</button>
            <div><b>${round}ª rodada</b><small>Brasileirão Série A 2026</small></div>
            <button data-round="${ROUNDS[ri + 1] ?? ""}" ${ri < ROUNDS.length - 1 ? "" : "disabled"} aria-label="Próxima rodada">›</button>
          </div>
          <div class="tabs" data-tabs>
            <span class="tab-ink"></span>
            <button class="tab ${state.filter === "all" ? "on" : ""}" data-filter="all">Todos</button>
            <button class="tab ${state.filter === "ft" ? "on" : ""}" data-filter="ft"><span class="l-long">Encerrados</span><span class="l-short">Fim</span> (${counts.ft})</button>
            <button class="tab ${state.filter === "ns" ? "on" : ""}" data-filter="ns"><span class="l-long">A disputar</span><span class="l-short">A jogar</span> (${counts.ns})</button>
            <button class="tab ${state.filter === "fav" ? "on" : ""}" data-filter="fav">★ Favoritos</button>
          </div>
          <div class="league-h">${flagBR}<span>BRASIL: Série A <small>· ${round}ª rodada</small></span><a href="#/tabela">Tabela ›</a></div>
          <div id="match-list">${groups.length ? groups.map((g) => `<div class="day-h">${dayName(g.date)}</div>${g.items.map((m) => matchRow(m, n++)).join("")}`).join("") : `<div class="empty">Nenhuma partida neste filtro.</div>`}</div>
          <div class="source">Jogos e resultados: ge.globo · tabela: CBF</div>
        </div>
      </section>

      <aside>
        ${featureCard(feats, fi)}
        ${voteCard(featured)}
        ${scorersCard(5)}
        <div class="card">
          <div class="card-h">Classificação <small><a href="#/tabela" style="color:var(--accent)">ver completa ›</a></small></div>
          ${standingsTable(state.standings.slice(0, 8), null, true)}${sourceNote}
        </div>
      </aside>
    </div>`;
  }

  function pageClubs() {
    const regions = { Todos: null, Sudeste: ["SP", "RJ", "MG"], Sul: ["PR", "RS", "SC"], "Norte/Nordeste": ["BA", "PA"] };
    const cur = state.region || "Todos";
    const list = CLUBS.filter((c) => !regions[cur] || regions[cur].includes(c.uf));
    return `<div class="page-head">
        <div><div class="eyebrow">Brasileirão · ${CLUBS.length} clubes</div><h1>Escolha seu<br/>clube</h1><p>Cada clube ganha uma página própria com as cores da camisa e uma aparição animada do escudo, inspirada no que ele significa.</p></div>
        <div class="chips">${Object.keys(regions).map((r) => `<button class="chip ${r === cur ? "on" : ""}" data-region="${r}">${r}</button>`).join("")}</div>
      </div>
      <div class="clubs">${list.map((c, i) => `
        <a class="club-card" href="#/clube/${c.id}" style="${clubVars(c)};--i:${i}" data-tilt>
          <div class="kit-bg" style="background:${kitBg(c)}"></div>
          <div class="card-scene">${SCENES.scene(c, "card")}</div>
          <div class="crest-wrap">${crest(c, 54, true)}</div>
          <span class="rank">${rowOf(c.id).pos}º</span>
          <div class="info"><h3>${c.abbr}</h3><p><span>${SCENES.caption(c.id)}</span><span>${c.city} · ${c.uf}</span></p></div>
          <span class="go">${ICON.arrow}</span>
        </a>`).join("")}</div>`;
  }

  function pageClub(id, tab = "geral") {
    const c = byId[id];
    if (!c) return pageNotFound();
    const r = rowOf(id);
    const words = c.name.split(" ");
    const m = state.matches.find((x) => x.home === id || x.away === id);
    const rival = byId[c.rival];
    const tabs = [["geral", "Visão geral"], ["partidas", "Partidas"], ["elenco", "Elenco"], ["estatisticas", "Estatísticas"], ["tabela", "Tabela"]];
    let body = "";

    if (tab === "geral") {
      body = `<div class="kpis">
          <div class="kpi" style="--i:0"><small>Posição</small><b data-count="${r.pos}">0</b><em>${r.pos <= 4 ? "Zona de Libertadores" : r.pos <= 6 ? "Pré-Libertadores" : r.pos <= 12 ? "Zona de Sul-Americana" : r.pos >= 17 ? "Zona de rebaixamento" : "Meio da tabela"}</em></div>
          <div class="kpi" style="--i:1"><small>Pontos</small><b data-count="${r.p}">0</b><em>${r.pct}% de aproveitamento</em></div>
          <div class="kpi" style="--i:2"><small>Vitórias</small><b data-count="${r.w}">0</b><em>${r.d} empates · ${r.l} derrotas</em></div>
          <div class="kpi" style="--i:3"><small>Saldo</small><b data-count="${r.sg}" data-sign>0</b><em>${r.gf} marcados · ${r.ga} sofridos</em></div>
        </div>
        ${formCard(id)}
        <div class="grid-2">
          <div>
            <div class="card reveal">
              <div class="card-h">Pontos no campeonato <small>${REAL.source} · ${REAL.updated}</small></div>
              <div class="card-b">${pointsChart(id)}</div>
            </div>
            ${m ? `<div class="card reveal"><div class="card-h">Jogo da ${ROUND}ª rodada <small>${m.venue || ""}</small></div>
              <a class="card-b feature" href="#/partida/${m.id}" style="display:block;${matchVars(m)}">${scoreline(m, false)}<div style="margin-top:12px">${compareHTML(m, 4)}</div></a></div>` : ""}
            ${playerStatsHTML(id)}
          </div>
          <div>
            <div class="card reveal">
              <div class="card-h">Seu time <small><a href="#/clube/${id}/elenco" style="color:var(--accent)">montar ›</a></small></div>
              ${(() => {
                const s = LINEUP.load(id), ps = LINEUP.players(id), map = Object.fromEntries(ps.map((p) => [p.id, p]));
                const by = (g) => ps.filter((p) => p.pos === g).length;
                const ages = ps.filter((p) => p.age), avg = ages.reduce((t, p) => t + p.age, 0) / (ages.length || 1);
                return `<div class="card-b season-grid"><div><b>${ps.length}</b><small>jogadores no elenco</small></div><div><b>${avg.toFixed(1)}</b><small>idade média</small></div><div><b>${s.f}</b><small>sua formação</small></div></div>
                  <ul class="squad-list">${s.xi.slice(0, 11).map((pid) => map[pid]).filter(Boolean).slice(-4).reverse().map((p) => `<li><span class="n">${p.n ?? "–"}</span><b>${p.name}</b><span class="p">${{ G: "GOL", D: "DEF", M: "MEI", F: "ATA" }[p.pos]}</span></li>`).join("")}</ul>`;
              })()}
            </div>
            <div class="card reveal">
              <div class="card-h">Temporada <small>${r.j} jogos · dados reais</small></div>
              <div class="card-b season-grid">
                <div><b>${(r.gf / r.j).toFixed(2)}</b><small>gols por jogo</small></div>
                <div><b>${(r.ga / r.j).toFixed(2)}</b><small>sofridos por jogo</small></div>
                <div><b>${r.pos === 1 ? "Líder" : state.standings[0].p - r.p}</b><small>${r.pos === 1 ? `${r.p - state.standings[1].p} pts à frente` : "pts atrás do líder"}</small></div>
                <div><b>${r.p - state.standings[16].p > 0 ? "+" : ""}${r.p - state.standings[16].p}</b><small>pts sobre o Z4</small></div>
                <div><b>${r.ca}</b><small>cartões amarelos</small></div>
                <div><b>${r.cv}</b><small>cartões vermelhos</small></div>
              </div>
            </div>
            ${byId[nextOf(id)] ? `<div class="card reveal"><div class="card-h">Próximo adversário</div>
              <a class="derby" href="#/clube/${nextOf(id)}">${crest(c, 34)}<span class="vs">VS</span>${crest(byId[nextOf(id)], 34)}<div style="margin-left:6px"><b>${byId[nextOf(id)].name}</b><br/><small style="color:var(--text-3)">${rowOf(nextOf(id)).pos}º · ${rowOf(nextOf(id)).p} pts</small></div></a></div>` : ""}
            ${scorersCard(3, id)}
            ${c.idol ? `<div class="card idol reveal${c.idolPhoto ? " has-photo" : ""}">${c.idolPhoto ? `<img class="idol-photo" src="${c.idolPhoto}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('has-photo');this.remove()" />` : ""}<div class="eyebrow" style="color:inherit;opacity:.8">Ídolo eterno</div><h4>${c.idol}</h4>${c.idolPhoto ? `<small class="idol-credit">Foto: Wikimedia Commons</small>` : ""}</div>` : ""}
            ${LIVE.hasNews() ? `<div class="card news" data-news="${id}"><div class="card-h">Últimas notícias <small>Google Notícias</small></div><ul><li class="mam-empty">Buscando notícias…</li></ul></div>` : ""}
            <div class="card reveal">
              <div class="card-h">Ficha do clube</div>
              <div class="card-b" style="display:grid;gap:10px">
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Fundação</span><b>${c.founded}</b></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Estádio</span><b>${c.stadium}</b></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Cidade</span><b>${c.city} · ${c.uf}</b></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Apelido</span><b>${c.nick}</b></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Idade</span><b>${new Date().getFullYear() - c.founded} anos</b></div>
              </div>
            </div>
            ${rival ? `<div class="card reveal"><div class="card-h">Grande rival</div>
              <a class="derby" href="#/clube/${rival.id}">${crest(c, 34)}<span class="vs">VS</span>${crest(rival, 34)}<div style="margin-left:6px"><b>${rival.name}</b><br/><small style="color:var(--text-3)">${rowOf(rival.id).pos}º na tabela · ${rowOf(rival.id).p} pts</small></div></a></div>` : ""}
          </div>
        </div>`;
    }

    if (tab === "partidas") body = `<div data-history="${id}">${historyHTML(id, window.CLUB_FORM?.clubs?.[id])}</div>`;

    if (tab === "elenco") body = LINEUP.builder(id);
    if (tab === "estatisticas") body = playerStatsHTML(id, true);

    if (tab === "tabela") {
      body = `<div class="card">${standingsTable(state.standings, id)}${legend}</div>`;
    }

    return `<div class="club-page">
      <section class="hero hero--gb" data-short="${c.short}">
        <div class="kit-bg" style="background:${kitBg(c)}"></div>
        <div class="hero-inner">
          <div class="hero-text">
            <div class="eyebrow">${c.nick} · desde ${c.founded}</div>
            <h1>${words.map((w, i) => `<span class="w"><span style="--i:${i}">${w}</span></span>`).join(" ")}</h1>
            <div class="facts">
              <span style="--i:0">${ICON.pin}${c.city} · ${c.uf}</span>
              <span style="--i:1">${ICON.stadium}${c.stadium}</span>
              <span style="--i:2">${ICON.cal}Fundado em ${c.founded}</span>
              <span style="--i:3">${ICON.ball}${r.pos}º lugar · ${r.p} pts</span>
            </div>
            <div class="palette">${c.colors.map((col, i) => `<i style="background:${col};--i:${i}" title="${col}"></i>`).join("")}</div>
          </div>
          <div class="hero-gb">${GOALBUG.html(c, SCENES.motto(id))}</div>
        </div>
      </section>
      <div class="club-tabs"><div class="tabs" data-tabs>
        <span class="tab-ink"></span>
        ${tabs.map(([k, l]) => `<a class="tab ${k === tab ? "on" : ""}" href="#/clube/${id}/${k}">${l}</a>`).join("")}
      </div></div>
      <div data-tab-body>${body}</div>
    </div>`;
  }

  function findMatch(id) {
    const rd = +(id.match(/-r(\d+)$/) || [])[1];
    return (rd === ROUND ? state.matches : realMatches(rd)).find((m) => m.id === id);
  }

  function pageMatch(id) {
    const m = findMatch(id);
    if (!m) return pageNotFound();
    const h = byId[m.home], a = byId[m.away];
    const info = [
      ["Competição", `Brasileirão Série A · ${m.round}ª rodada`],
      ["Data", m.date ? dayName(m.date) : "—"],
      ["Horário", m.time ? `${m.time} (Brasília)` : "A definir"],
      ["Estádio", m.venue || "—"],
      ["Situação", statusText(m)],
    ];
    const both = state.standings.filter((r) => r.id === m.home || r.id === m.away);
    return `<section class="match-hero" style="${matchVars(m)}">
        <div style="text-align:center;margin-bottom:18px"><span class="${m.status === "progress" ? "pill" : "pill muted"}">Brasileirão · ${m.round}ª rodada</span></div>
        ${scoreline(m)}
        ${m.venue ? `<p style="text-align:center;color:var(--text-2);margin:16px 0 0">${ICON.stadium.replace("<svg", '<svg style="display:inline;vertical-align:-2px;margin-right:4px"')}${m.venue}</p>` : ""}
      </section>
      <div class="grid-2">
        <div>
          <div class="card"><div class="card-h">Informações</div><div class="card-b" style="display:grid;gap:10px">
            ${info.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:var(--text-2)">${k}</span><b style="text-align:right"${k === "Situação" ? " data-situacao" : ""}>${v}</b></div>`).join("")}
          </div>${m.status === "pending" ? `<div class="source">O resultado deste jogo ainda não foi lançado no site.</div>` : ""}</div>
          ${m.espn || (LIVE.proxy() && m.status !== "ft") ? `<div class="card mam" data-mam="${m.espn || ""}" data-h="${m.home}" data-a="${m.away}" data-kick="${m.kick || ""}"><div class="card-h">Minuto a minuto <small class="mam-src">lances: ${LIVE.proxy() ? "API-Football" : "ESPN"} · narração: PLACAR</small></div>
            <div class="mam-top"></div><ul class="mam-list"><li class="mam-empty">Carregando a narração…</li></ul></div>` : ""}
          <div class="card"><div class="card-h">Comparação no campeonato <small>${REAL.source} · ${REAL.updated}</small></div><div class="card-b">${compareHTML(m)}</div></div>
        </div>
        <div>
          ${voteCard(m)}
          <div class="card"><div class="card-h">Na tabela</div>${standingsTable(both, null, true)}${sourceNote}</div>
          ${scorersCard(10, null, [m.home, m.away]).replace("Artilharia", "Artilheiros dos dois times")}
        </div>
      </div>`;
  }

  /* palpite de quem está vendo (guardado só neste navegador) */
  /* ---------- Próximo jogo: passa pelos jogos da rodada ----------
     Ordem: jogos rolando, depois os próximos pelo horário, até o último da rodada (sem jogo por vir: todos). */
  function featuredList() {
    const byKick = [...state.matches].sort((a, b) => (a.kick ?? Infinity) - (b.kick ?? Infinity));
    const open = byKick.filter((m) => m.status !== "ft" && !m.adiado);
    return open.length ? [...open.filter((m) => m.status === "progress"), ...open.filter((m) => m.status !== "progress")] : byKick;
  }
  // continua no jogo escolhido mesmo quando a página é redesenhada (placar ao vivo, favoritos...)
  function featIndex(list) {
    const i = list.findIndex((m) => m.id === state.featId);
    return i >= 0 ? i : 0;
  }
  function featureCard(list, i) {
    const m = list[i], n = list.length;
    const label = m.status === "progress" ? "Agora" : m.status === "ft" ? "Encerrado" : i === 0 || list[i - 1]?.status === "progress" ? "Próximo jogo" : "Depois";
    return `<div class="card feature" style="${matchVars(m)}" data-feature="${m.id}">
        <div class="feat-top">
          <span class="${m.status === "progress" ? "pill" : "pill muted"}">${label}</span>
          ${n > 1 ? `<div class="feat-nav">
            <button data-feat="${i - 1}" ${i > 0 ? "" : "disabled"} aria-label="Jogo anterior">‹</button>
            <span aria-live="polite"><b>${i + 1}</b> de ${n}</span>
            <button data-feat="${i + 1}" ${i < n - 1 ? "" : "disabled"} aria-label="Próximo jogo da rodada">›</button>
          </div>` : ""}
        </div>
        <a class="feat-link" href="#/partida/${m.id}">
          ${scoreline(m, false)}
          ${m.venue ? `<small class="feat-venue">${m.venue}</small>` : ""}
          <div class="feat-sub">No campeonato</div>
          <div style="margin-top:6px">${compareHTML(m, 3)}</div>
        </a>
        ${n > 1 ? `<div class="feat-dots">${list.map((x, k) => `<button data-feat="${k}" class="${k === i ? "on" : ""}" aria-label="${byId[x.home].abbr} x ${byId[x.away].abbr}"></button>`).join("")}</div>` : ""}
      </div>`;
  }
  function showFeature(i, dir) {
    const list = featuredList(), card = $("[data-feature]");
    if (!card || !list[i]) return;
    state.featId = list[i].id;
    card.outerHTML = featureCard(list, i);
    const vote = $("aside [data-vote-card]");
    if (vote) vote.outerHTML = voteCard(list[i]);
    const fresh = $("[data-feature]");
    if (!reduced && dir) fresh.querySelector(".feat-link").animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
    requestAnimationFrame(() => $$(".bar i[data-w]", fresh).forEach((x) => (x.style.width = x.dataset.w + "%")));
    featSwipe(fresh);
  }
  // celular: arrastar o cartão para o lado também passa o jogo
  function featSwipe(card) {
    if (!card) return;
    let x0 = null, y0 = 0, moved = false;
    card.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; moved = false; }, { passive: true });
    card.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      moved = true;
      const cur = featIndex(featuredList()), next = cur + (dx < 0 ? 1 : -1);
      if (next >= 0 && next < featuredList().length) showFeature(next, dx < 0 ? 1 : -1);
    });
    card.addEventListener("click", (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
  }

  function voteCard(m) {
    const mine = store.get("votes", {})[m.id];
    const closed = m.status === "ft";
    const result = closed ? (m.hs > m.as ? "1" : m.hs < m.as ? "2" : "X") : null;
    const opts = [["1", byId[m.home].abbr, display(byId[m.home])], ["X", "Empate", "var(--text-3)"], ["2", byId[m.away].abbr, display(byId[m.away])]];
    const note = closed ? (mine ? (mine === result ? "Você acertou!" : "Não foi dessa vez") : "Jogo encerrado") : mine ? "Palpite salvo" : "Toque para palpitar";
    return `<div class="card vote" data-vote-card="${m.id}">
      <div class="card-h">${closed ? "Resultado" : "Quem vai vencer?"} <small>${note}</small></div>
      <div class="card-b vote-opts ${mine || closed ? "done" : ""}">${opts.map(([k, l, c]) => `
        <button class="vote-opt ${mine === k ? "mine" : ""}" data-vote="${m.id}" data-pick="${k}" ${closed ? "disabled" : ""} style="--vc:${c}">
          <i class="vote-fill" style="width:${(closed ? result === k : mine === k) ? 100 : 0}%"></i>
          <b>${k}</b><span>${l}</span><em>${mine === k ? "Seu palpite" : closed && result === k ? "Resultado" : ""}</em>
        </button>`).join("")}</div>
    </div>`;
  }

  /* ---------- rankings do campeonato (subpáginas de #/tabela) ----------
     cada ranking: título, ordem, valor principal e colunas extras */
  const avg = (n, j) => (j ? n / j : 0).toFixed(2).replace(".", ",");
  const RANKINGS = {
    gols: {
      title: "Gols por clube", kpi: "Gols", lead: "Quantos gols cada clube marcou no Brasileirão, do que mais marcou ao que menos marcou.",
      sort: (a, b) => b.gf - a.gf || b.sg - a.sg, value: (r) => r.gf, unit: "gols marcados",
      cols: [["Sofridos", (r) => r.ga], ["Saldo", (r) => (r.sg > 0 ? "+" : "") + r.sg], ["Nos jogos", (r) => r.gf + r.ga]],
    },
    ataque: {
      title: "Melhor ataque", kpi: "Melhor ataque", lead: "Do melhor ao pior ataque, pela média de gols marcados por jogo.",
      sort: (a, b) => b.gf / b.j - a.gf / a.j || b.gf - a.gf, value: (r) => avg(r.gf, r.j), unit: "gols por jogo",
      cols: [["Gols", (r) => r.gf], ["Jogos", (r) => r.j]],
    },
    defesa: {
      title: "Melhor defesa", kpi: "Melhor defesa", lead: "Da melhor à pior defesa, pela média de gols sofridos por jogo (quanto menos, melhor).",
      sort: (a, b) => a.ga / a.j - b.ga / b.j || a.ga - b.ga, value: (r) => avg(r.ga, r.j), unit: "sofridos por jogo", invert: true,
      cols: [["Sofridos", (r) => r.ga], ["Jogos", (r) => r.j]],
    },
    amarelos: {
      title: "Cartões amarelos", kpi: "Mais amarelos", lead: "Do clube com mais cartões amarelos ao que tem menos.",
      sort: (a, b) => b.ca - a.ca || b.cv - a.cv, value: (r) => r.ca, unit: "amarelos", card: "y",
      cols: [["Por jogo", (r) => avg(r.ca, r.j)], ["Vermelhos", (r) => r.cv]],
    },
    vermelhos: {
      title: "Cartões vermelhos", kpi: "Mais vermelhos", lead: "Do clube com mais cartões vermelhos ao que tem menos.",
      sort: (a, b) => b.cv - a.cv || b.ca - a.ca, value: (r) => r.cv, unit: "vermelhos", card: "r",
      cols: [["Amarelos", (r) => r.ca], ["Jogos", (r) => r.j]],
    },
  };
  const ranked = (key) => [...state.standings].sort(RANKINGS[key].sort);

  /* números do campeonato, calculados da tabela real; cada cartão leva ao ranking completo */
  function leagueStats() {
    const t = state.standings;
    const games = t.reduce((a, r) => a + r.j, 0) / 2;
    const goals = t.reduce((a, r) => a + r.gf, 0);
    const best = (k, dir = 1) => [...t].sort((x, y) => dir * (y[k] - x[k]))[0];
    const att = best("gf"), def = best("ga", -1), yel = best("ca"), red = best("cv");
    const tile = (i, key, value, sub, c) => `<a class="kpi kpi-link" href="#/tabela/${key}" data-rank-preview="${key}" style="--i:${i}${c ? `;--c1:${c.colors[0]}` : ""}">
        <i class="kpi-sheet" aria-hidden="true"></i><i class="kpi-sheet" aria-hidden="true"></i>
        <small>${RANKINGS[key].kpi}</small><b>${value}</b><em>${c ? `<span style="display:inline-flex;align-items:center;gap:6px">${crest(c, 16)}${sub}</span>` : sub}</em>
        <span class="kpi-more">Ver ranking <svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></a>`;
    return `<div class="kpis league-kpis">
      ${tile(0, "gols", goals, `${(goals / games).toFixed(2)} por jogo · ${games} jogos`)}
      ${tile(1, "ataque", att.gf, byId[att.id].abbr, byId[att.id])}
      ${tile(2, "defesa", def.ga, `${byId[def.id].abbr} · gols sofridos`, byId[def.id])}
      ${tile(3, "amarelos", yel.ca, byId[yel.id].abbr, byId[yel.id])}
      ${tile(4, "vermelhos", red.cv, byId[red.id].abbr, byId[red.id])}
    </div>
    <div class="rank-preview" id="rank-preview" role="tooltip" aria-hidden="true"></div>`;
  }

  /* prévia: os 5 primeiros do ranking e o último, mostrada ao passar o mouse ou segurar o dedo */
  function rankPreviewHTML(key) {
    const R = RANKINGS[key], list = ranked(key), top = list.slice(0, 5), last = list[list.length - 1];
    const row = (r, i) => `<li style="--c1:${display(byId[r.id])}"><span class="rp-pos">${i}</span>${crest(byId[r.id], 18)}<span class="rp-nm">${byId[r.id].abbr}</span><b>${R.value(r)}</b></li>`;
    return `<div class="rp-h"><b>${R.title}</b><small>${R.unit}</small></div>
      <ol>${top.map((r, i) => row(r, i + 1)).join("")}</ol>
      <div class="rp-gap">⋯</div><ol class="rp-last">${row(last, list.length)}</ol>
      <div class="rp-foot">Abrir o ranking completo ›</div>`;
  }

  function pageRanking(key) {
    const R = RANKINGS[key];
    if (!R) return pageNotFound();
    const list = ranked(key), vals = list.map((r) => +String(R.value(r)).replace(",", "."));
    // barra cheia para o líder do ranking (na defesa, quem sofre menos)
    const max = Math.max(...vals) || 1, min = Math.min(...vals.filter((v) => v > 0)) || 1;
    const pct = (v) => Math.max(3, R.invert ? (v ? (min / v) * 100 : 100) : (v / max) * 100).toFixed(1);
    const chips = Object.entries(RANKINGS).map(([k, x]) => `<a class="chip ${k === key ? "on" : ""}" href="#/tabela/${k}">${x.title}</a>`).join("");
    const podium = [1, 0, 2].map((i) => {
      const r = list[i], c = byId[r.id];
      return `<a class="podium-step p${i + 1}" href="#/clube/${c.id}" style="--c1:${display(c)};--i:${i}">
        ${crest(c, i ? 54 : 72)}<b>${R.value(r)}</b><span>${c.abbr}</span><i>${i + 1}º</i></a>`;
    }).join("");
    const rows = list.map((r, i) => {
      const c = byId[r.id], v = vals[i];
      return `<li class="rank-row" style="--c1:${display(c)};--i:${Math.min(i, 14)}">
        <span class="rk-pos">${i + 1}</span>
        <a class="rk-club" href="#/clube/${c.id}">${crest(c, 26)}<span><b>${c.abbr}</b><small>${r.pos}º na tabela</small></span></a>
        <span class="rk-bar"><i data-w="${pct(v)}"></i></span>
        <b class="rk-val">${R.card ? `<i class="rk-card ${R.card}"></i>` : ""}${R.value(r)}</b>
        ${R.cols.map(([l, f]) => `<span class="rk-col"><small>${l}</small>${f(r)}</span>`).join("")}
      </li>`;
    }).join("");
    return `<div class="page-head"><div>
        <a class="back-link" href="#/tabela">‹ Classificação</a>
        <div class="eyebrow">Brasileirão Série A · ${ROUND}ª rodada · ranking</div><h1>${R.title}</h1><p>${R.lead}</p></div></div>
      <div class="chips rank-chips">${chips}</div>
      <div class="podium">${podium}</div>
      <div class="card"><ol class="rank-list">${rows}</ol>${sourceNote}</div>`;
  }

  function pageTable() {
    return `<div class="page-head"><div><div class="eyebrow">Brasileirão Série A · ${ROUND}ª rodada</div><h1>Classificação</h1><p>Classificação oficial da CBF, atualizada em ${REAL.updated}.</p></div></div>
      ${leagueStats()}
      <div class="grid-2" style="margin-top:16px">
        <div class="card">${standingsTable(state.standings)}${legend}${sourceNote}</div>
        <div>${scorersCard()}</div>
      </div>`;
  }

  function pageAbout() {
    const skills = [["HTML semântico & acessibilidade", 92], ["CSS moderno (grid, color-mix, view transitions)", 95], ["JavaScript (ES2022, sem framework)", 90], ["Visualização de dados com SVG", 86], ["Design de interface & motion", 88]];
    return `<div class="about">
      <div class="player-card" data-tilt>
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><div class="ovr">94</div><div class="role">DEV</div></div>
          <div style="text-align:right;font-weight:900">FRONT-END<br/><small style="font-weight:700;opacity:.7">20+ anos</small></div>
        </div>
        <div class="avatar" style="margin-top:20px">AS</div>
        <h2>Alan Souza</h2>
        <div class="attrs">
          <span><b>95</b>CSS</span><span><b>91</b>JS</span>
          <span><b>89</b>UX</span><span><b>88</b>MOT</span>
          <span><b>86</b>SVG</span><span><b>93</b>A11Y</span>
        </div>
      </div>
      <div>
        <div class="eyebrow">Sobre o projeto</div>
        <h1 class="display">Um placar<br/>com alma de arquibancada</h1>
        <p style="color:var(--text-2);font-size:16px;max-width:640px">O PLACAR. é um estudo de interface para plataformas de resultados esportivos: a densidade de informação das listas de partidas, o cuidado com gráficos de desempenho e, acima de tudo, a identidade de cada clube brasileiro aplicada à interface.</p>
        <div class="card reveal" style="margin-top:22px"><div class="card-h">Habilidades em campo</div><div class="card-b">
          ${skills.map(([s, v]) => `<div class="skill"><header><span>${s}</span><span>${v}</span></header><div class="bar"><i data-w="${v}"></i></div></div>`).join("")}
        </div></div>
        <div class="card reveal"><div class="card-h">Decisões técnicas</div><div class="card-b feature-list">
          <div><b>Tema por clube</b><p>Variáveis CSS trocadas em tempo real; cada página veste as cores e o padrão da camisa titular.</p></div>
          <div><b>Transições de página</b><p>Cortina com as listras do clube e View Transitions API com elemento compartilhado (escudo).</p></div>
          <div><b>Gráficos em SVG</b><p>Pontos de todos os clubes, comparação entre adversários e escalação no campo, sem bibliotecas.</p></div>
          <div><b>Dados reais</b><p>Classificação e artilharia da CBF, jogos e resultados do ge.globo; a situação de cada jogo muda sozinha pelo relógio.</p></div>
          <div><b>Escudos oficiais com reserva</b><p>Escudos da Wikimedia; se a imagem não carregar, entra um escudo desenhado a partir das cores do clube.</p></div>
          <div><b>Acessível e responsivo</b><p>Navegação por teclado (atalho /), tema claro/escuro, respeito a <i>reduced motion</i> e layout mobile.</p></div>
        </div></div>
        <div class="card reveal"><div class="card-h">Carreira</div><div class="card-b"><ul class="timeline-cv">
          <li><b>Front-end sênior / líder técnico</b><small>Produtos de dados em tempo real</small></li>
          <li><b>Desenvolvedor de interfaces</b><small>Portais, e-commerce e design systems</small></li>
          <li><b>Primeiros sites</b><small>HTML em tabelas, GIFs animados e muita vontade</small></li>
        </ul></div></div>
      </div>
    </div>`;
  }

  const pageNotFound = () => `<div class="empty" style="padding:120px 0"><h1 class="display">Impedimento!</h1><p>Essa página não existe. <a href="#/" style="color:var(--accent)">Voltar ao placar</a></p></div>`;

  /* ==========================================================================
     Roteador + transições
     ========================================================================== */
  function parse() {
    const [, page = "", id, tab] = location.hash.replace(/^#/, "").split("/");
    return { page, id, tab };
  }

  function render() {
    const r = parse();
    state.route = r;
    const club = r.page === "clube" ? byId[r.id] : null;
    applyTheme(club);
    const html =
      r.page === "" ? pageHome() :
      r.page === "clubes" ? pageClubs() :
      r.page === "clube" ? pageClub(r.id, r.tab) :
      r.page === "partida" ? pageMatch(r.id) :
      r.page === "tabela" ? (r.id ? pageRanking(r.id) : pageTable()) :
      r.page === "bora-pro-jogo" ? LINEUP.pageBora(r.id, r.tab) :
      r.page === "sobre" ? pageAbout() : pageNotFound();
    view.innerHTML = html;
    const navKey = r.page === "" || r.page === "partida" ? "home" : r.page === "clube" ? "clubes" : r.page;
    $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === navKey));
    document.title = club ? `${club.name} — Placar` : r.page === "tabela" && RANKINGS[r.id] ? `${RANKINGS[r.id].title} — Placar` : r.page === "partida" ? "Partida — Placar" : r.page === "bora-pro-jogo" ? "Bora pro jogo — Placar" : "Placar — Futebol Brasileiro";
    enhance();
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  // "?estatico" na URL mostra os números já no valor final (útil para prints)
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("estatico");
  let prev = parse();

  async function onRoute() {
    const next = parse();
    const sameClub = prev.page === "clube" && next.page === "clube" && prev.id === next.id;
    const samePage = prev.page === next.page && prev.id === next.id;
    const enteringClub = next.page === "clube" && byId[next.id] && !sameClub && prev.page !== "clubes";
    prev = next;

    if (enteringClub && !reduced) {
      await curtain(byId[next.id]);
    } else if (document.startViewTransition && !reduced) {
      document.startViewTransition(() => render());
    } else {
      render();
    }
    if (!samePage) window.scrollTo({ top: 0, behavior: "instant" });
  }

  /* cortina com as listras e o escudo do clube */
  async function curtain(club) {
    const el = $("#curtain");
    const [a, b] = club.colors;
    el.innerHTML = Array.from({ length: 6 }, (_, i) => `<i style="--i:${i};--cc:${i % 2 ? b : a}"></i>`).join("") +
      `<div class="mark">${GOALBUG.bar(club)}</div>`;
    el.className = "curtain in";
    await sleep(820);
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    el.className = "curtain out";
    await sleep(760);
    el.className = "curtain";
    el.innerHTML = "";
  }

  /* ---------- comportamentos após renderizar ---------- */
  function enhance() {
    SCENES.mount(view);
    GOALBUG.mount(view);
    LINEUP.mount(view);
    LIVE.mount(view);
    featSwipe($("[data-feature]", view));
    scorerCards(view);
    // tinta deslizante das abas
    $$("[data-tabs]").forEach((t) => {
      const ink = $(".tab-ink", t), on = $(".tab.on", t);
      if (!ink || !on) return;
      ink.style.width = on.offsetWidth + "px";
      ink.style.transform = `translateX(${on.offsetLeft}px)`;
    });
    // contadores
    $$("[data-count]").forEach((el) => {
      const to = +el.dataset.count, sign = el.hasAttribute("data-sign");
      if (reduced) { el.textContent = (sign && to > 0 ? "+" : "") + to; return; }
      const t0 = performance.now(), dur = 1100;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - (1 - k) ** 3));
        el.textContent = (sign && v > 0 ? "+" : "") + v;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    // revelar ao rolar + barras
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("seen");
      $$(".bar i[data-w]", e.target).forEach((i) => (i.style.width = i.dataset.w + "%"));
      io.unobserve(e.target);
    }), { threshold: 0.12 });
    $$(".reveal").forEach((el) => io.observe(el));
    requestAnimationFrame(() => $$(".bar i[data-w], .rk-bar i[data-w], .ps-bar i[data-w]").forEach((i) => { if (!i.closest(".reveal")) i.style.width = i.dataset.w + "%"; }));
    // inclinação 3D nos cartões
    $$("[data-tilt]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const b = el.getBoundingClientRect();
        const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
        el.style.setProperty("--tilt-y", `${(x - 0.5) * 10}deg`);
        el.style.setProperty("--tilt-x", `${(0.5 - y) * 10}deg`);
        el.style.setProperty("--mx", `${x * 100}%`);
        el.style.setProperty("--my", `${y * 100}%`);
      });
      el.addEventListener("pointerleave", () => { el.style.setProperty("--tilt-x", "0deg"); el.style.setProperty("--tilt-y", "0deg"); });
    });
    rankPreviews();
    // sem a API (GitHub Pages), o retrospecto é atualizado direto da ESPN ao abrir o clube;
    // enquanto isso, mostra a temporada gravada (js/club-form.js, baixado só nas páginas de clube)
    const paintForm = (el, d) => {
      if (el.dataset.history) el.innerHTML = historyHTML(el.dataset.history, d);
      else el.innerHTML = el.querySelector(".card-h").outerHTML + formInner(el.dataset.form, d);
    };
    $$("[data-history], [data-form]").forEach((el) => {
      if (LIVE.on()) return;
      const id = el.dataset.history || el.dataset.form;
      if (!window.CLUB_FORM?.clubs?.[id]) loadClubForm().then(() => { const d = window.CLUB_FORM?.clubs?.[id]; if (d && el.isConnected && !el.dataset.fresh) paintForm(el, d); });
      LIVE.form(id).then((d) => {
        if (!d || !el.isConnected) return;
        window.CLUB_FORM = window.CLUB_FORM || { clubs: {} };
        window.CLUB_FORM.clubs[id] = d;
        el.dataset.fresh = "1";
        paintForm(el, d);
      }).catch(() => {});
    });
  }

  let formScript = null;
  function loadClubForm() {
    if (formScript) return formScript;
    const before = window.CLUB_FORM;
    formScript = new Promise((res) => {
      const sc = document.createElement("script");
      sc.src = "js/club-form.js";
      sc.onload = sc.onerror = () => {
        // o que já veio da ESPN nesta visita vale mais que o arquivo gravado
        if (before?.clubs && window.CLUB_FORM?.clubs && before !== window.CLUB_FORM) Object.assign(window.CLUB_FORM.clubs, before.clubs);
        else if (before && !window.CLUB_FORM) window.CLUB_FORM = before;
        res();
      };
      document.head.appendChild(sc);
    });
    return formScript;
  }

  /* prévia dos rankings: com o mouse, aparece ao passar por cima; no toque, segurar o dedo mostra,
     deslizar troca de cartão e soltar abre o ranking. Um toque rápido abre a subpágina direto. */
  function rankPreviews() {
    const tip = $("#rank-preview"), tiles = $$("[data-rank-preview]");
    if (!tip || !tiles.length) return;
    let cur = null, hold = null, held = false;
    const show = (el) => {
      if (cur === el) return;
      tiles.forEach((t) => t.classList.toggle("peek", t === el));
      cur = el;
      tip.innerHTML = rankPreviewHTML(el.dataset.rankPreview);
      tip.style.setProperty("--c1", getComputedStyle(el).getPropertyValue("--c1").trim() || "var(--accent)");
      const b = el.getBoundingClientRect(), w = Math.min(280, innerWidth - 24);
      tip.style.width = w + "px";
      tip.style.left = Math.max(12, Math.min(innerWidth - w - 12, b.left + b.width / 2 - w / 2)) + "px";
      const h = tip.offsetHeight || 300;
      tip.style.top = (b.bottom + 10 + h < innerHeight ? b.bottom + 10 : Math.max(12, b.top - 10 - h)) + "px";
      tip.classList.add("open");
      tip.setAttribute("aria-hidden", "false");
    };
    const hide = () => { cur = null; tiles.forEach((t) => t.classList.remove("peek")); tip.classList.remove("open"); tip.setAttribute("aria-hidden", "true"); };
    tiles.forEach((el) => {
      el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(el); });
      el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
      el.addEventListener("focus", () => show(el));
      el.addEventListener("blur", hide);
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        held = false;
        clearTimeout(hold);
        hold = setTimeout(() => { held = true; navigator.vibrate?.(8); show(el); }, 260);
      });
      // depois de segurar, quem navega é o "soltar" abaixo; o clique nativo é ignorado
      el.addEventListener("click", (e) => { if (held) e.preventDefault(); });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    });
    const strip = tiles[0].parentNode;
    strip.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || !held) return;
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-rank-preview]");
      if (t) show(t);
    });
    strip.addEventListener("touchmove", (e) => { if (held) e.preventDefault(); }, { passive: false });
    strip.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      clearTimeout(hold);
      if (!held) return;
      const t = cur; hide();
      setTimeout(() => { held = false; if (t) location.hash = t.getAttribute("href"); }, 30);
    });
    strip.addEventListener("pointercancel", () => { clearTimeout(hold); if (held) hide(); held = false; });
    addEventListener("scroll", () => { if (!held) hide(); }, { passive: true });
  }

  /* ---------- eventos delegados ---------- */
  document.addEventListener("click", (e) => {
    const hf = e.target.closest("[data-hist-filter]");
    if (hf) {
      state.histFilter = hf.dataset.histFilter;
      const box = hf.closest("[data-history]");
      box.innerHTML = historyHTML(box.dataset.history, window.CLUB_FORM?.clubs?.[box.dataset.history]);
      return;
    }
    if (e.target.closest("[data-hist-next]")) {
      e.preventDefault();
      document.querySelector(".hm-row:not(.post)")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      return;
    }
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.preventDefault();
      const id = fav.dataset.fav;
      state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
      store.set("favs", [...state.favs]);
      fav.classList.toggle("on");
      fav.animate([{ transform: "scale(1.6) rotate(72deg)" }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.34,1.56,.64,1)" });
      if (state.route.page === "") setTimeout(soft, 300);
      return;
    }
    const f = e.target.closest("[data-filter]");
    if (f) { state.filter = f.dataset.filter; soft(); return; }
    const ft = e.target.closest("[data-feat]");
    if (ft) {
      e.preventDefault();
      const i = +ft.dataset.feat, cur = featIndex(featuredList());
      if (i !== cur) showFeature(i, i > cur ? 1 : -1);
      return;
    }
    const rd = e.target.closest("[data-round]");
    if (rd && rd.dataset.round) { state.round = +rd.dataset.round; soft(); return; }
    const v = e.target.closest("[data-vote]");
    if (v) {
      e.preventDefault();
      const votes = store.get("votes", {});
      votes[v.dataset.vote] = v.dataset.pick;
      store.set("votes", votes);
      const m = findMatch(v.dataset.vote);
      $$(`[data-vote-card="${m.id}"]`).forEach((card) => {
        card.outerHTML = voteCard(m);
      });
      return;
    }
    const rg = e.target.closest("[data-region]");
    if (rg) { state.region = rg.dataset.region; soft(); }
  });
  function soft() {
    const y = scrollY;
    document.startViewTransition && !reduced ? document.startViewTransition(render) : render();
    requestAnimationFrame(() => scrollTo(0, y));
  }

  /* ---------- tema claro/escuro ---------- */
  root.dataset.theme = store.get("theme", matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  $("#theme").addEventListener("click", (e) => {
    const go = () => { root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light"; store.set("theme", root.dataset.theme); render(); };
    if (!document.startViewTransition || reduced) return go();
    // transição circular a partir do botão
    const { clientX: x, clientY: y } = e;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(go).ready.then(() =>
      root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 600, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)" }));
  });

  /* ---------- busca ---------- */
  const input = $("#search"), results = $("#search-results");
  let sel = 0;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  input.addEventListener("input", () => {
    const q = norm(input.value.trim());
    sel = 0;
    if (!q) return results.classList.remove("open");
    const hits = CLUBS.filter((c) => norm([c.name, c.abbr, c.city, c.stadium, c.nick, c.uf].join(" ")).includes(q)).slice(0, 8);
    results.innerHTML = hits.length ? hits.map((c, i) => `<a href="#/clube/${c.id}" class="${i === 0 ? "sel" : ""}">${crest(c, 22)}<b>${c.name}</b><small>${c.stadium}</small></a>`).join("") : `<div class="empty" style="padding:16px">Nenhum clube encontrado.</div>`;
    results.classList.add("open");
  });
  input.addEventListener("keydown", (e) => {
    const items = $$("a", results);
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((a, i) => a.classList.toggle("sel", i === sel));
    }
    if (e.key === "Enter") { location.hash = items[sel].getAttribute("href"); close(); }
    if (e.key === "Escape") close();
  });
  const close = () => { results.classList.remove("open"); input.value = ""; input.blur(); };
  results.addEventListener("click", () => setTimeout(close));
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) results.classList.remove("open"); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });

  /* ---------- barra de progresso de rolagem ---------- */
  addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    root.style.setProperty("--scroll", max > 0 ? (scrollY / max).toFixed(3) : 0);
  }, { passive: true });

  /* ==========================================================================
     Status pelo relógio: a cada minuto, jogos que começaram mudam de situação
     ========================================================================== */
  const refresh = () => {
    ({ ROUND, ROUNDS } = window.PD);
    const sig = () => state.matches.map((m) => `${m.status}${m.hs}${m.as}${m.clock}`).join() + (state.route.page === "tabela" ? JSON.stringify(state.standings) : "");
    const before = sig();
    const antes = new Map(state.matches.map((m) => [m.id, m]));
    state.matches = realMatches(ROUND);
    golsAoVivo(antes);
    state.standings = buildStandings();
    // não redesenha a página da partida (o minuto a minuto atualiza sozinho) nem durante a montagem do time
    // na página da partida, troca só o placar do topo (o minuto a minuto continua onde está)
    if (sig() !== before && state.route.page === "partida") {
      const m = findMatch(state.route.id), el = $(".match-hero .scoreline");
      if (m && el) {
        el.outerHTML = scoreline(m);
        const sit = $(".match-hero ~ .grid-2 [data-situacao]") || $("[data-situacao]");
        if (sit) sit.textContent = statusText(m);
        $(".match-hero .pill")?.classList.toggle("muted", m.status !== "progress");
      }
    }
    if (sig() !== before && ["", "clube", "tabela"].includes(state.route.page) && state.route.tab !== "elenco") render();
  };
  window.addEventListener("placar:data", refresh);

  /* gol ao vivo: quando o placar de um jogo em andamento sobe, toca o GOL! do clube que marcou.
     A primeira atualização só serve de base (não anuncia gols que já tinham saído antes de abrir o site). */
  let golBase = false;
  function golsAoVivo(antes) {
    if (!golBase) { golBase = true; return; }
    for (const m of state.matches) {
      const o = antes.get(m.id);
      if (!o || m.status !== "progress" || o.hs == null || o.as == null || m.hs == null) continue;
      const h = byId[m.home], a = byId[m.away];
      const placar = `${h.abbr} ${m.hs} x ${m.as} ${a.abbr}${m.clock ? ` · ${m.clock}` : ""}`;
      const link = `#/partida/${m.id}`, relogio = m.clock || "AO VIVO";
      if (m.hs > o.hs) GOALBUG.alerta({ club: h, de: o.hs, para: m.hs, outro: m.as, relogio, texto: placar, link });
      if (m.as > o.as) GOALBUG.alerta({ club: a, de: o.as, para: m.as, outro: m.hs, relogio, texto: placar, link });
    }
  }
  setInterval(() => {
    refresh();
  }, 60000);

  /* ---------- início ---------- */
  addEventListener("hashchange", onRoute);
  render();
})();
