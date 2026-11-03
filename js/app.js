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
    m.status === "ft" ? "Fim" : m.status === "progress" ? `<span>●</span> ${m.clock || "Agora"}` : m.status === "pending" ? "Aguard." : m.time || "—";
  const statusText = (m) =>
    m.status === "ft" ? "Encerrado" : m.status === "progress" ? `Ao vivo${m.clock ? ` · ${m.clock}` : ""}` : m.status === "pending" ? "Aguardando resultado" : m.time ? `${dayName(m.date)} · ${m.time}` : "A definir";
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
      <div class="time ${live ? "live" : ""}">${statusLabel(m)}</div>
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
  function scorersCard(limit = 10, clubId = null, clubs = null) {
    const list = REAL.scorers.filter((x) => (!clubId || x[1] === clubId) && (!clubs || clubs.includes(x[1]))).slice(0, limit);
    if (!list.length) return "";
    const max = REAL.scorers[0][2];
    return `<div class="card reveal"><div class="card-h">Artilharia <small>${REAL.source}</small></div>
      <ul class="squad-list">${list.map(([name, cid, g]) => {
        const pos = REAL.scorers.findIndex((x) => x[0] === name) + 1;
        return `<li><span class="n">${pos}º</span>${crest(byId[cid], 22)}<div style="flex:1;min-width:0"><b>${name}</b><div class="bar" style="height:5px;margin-top:5px"><i data-w="${(g / max) * 100}" style="background:${display(byId[cid])}"></i></div></div><b class="goals">${g}</b></li>`;
      }).join("")}</ul></div>`;
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
    const featured = state.matches.find((m) => m.status === "progress") || state.matches.find((m) => m.status === "ns") || state.matches[0];
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
            <button class="tab ${state.filter === "ft" ? "on" : ""}" data-filter="ft">Encerrados (${counts.ft})</button>
            <button class="tab ${state.filter === "ns" ? "on" : ""}" data-filter="ns">A disputar (${counts.ns})</button>
            <button class="tab ${state.filter === "fav" ? "on" : ""}" data-filter="fav">★ Favoritos</button>
          </div>
          <div class="league-h">${flagBR}<span>BRASIL: Série A <small>· ${round}ª rodada</small></span><a href="#/tabela">Tabela ›</a></div>
          <div id="match-list">${groups.length ? groups.map((g) => `<div class="day-h">${dayName(g.date)}</div>${g.items.map((m) => matchRow(m, n++)).join("")}`).join("") : `<div class="empty">Nenhuma partida neste filtro.</div>`}</div>
          <div class="source">Jogos e resultados: ge.globo · tabela: CBF</div>
        </div>
      </section>

      <aside>
        <a class="card feature" href="#/partida/${featured.id}" style="display:block;${matchVars(featured)}" data-feature="${featured.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <span class="${featured.status === "progress" ? "pill" : "pill muted"}">${featured.status === "progress" ? "Agora" : "Próximo jogo"}</span>
            <small style="color:var(--text-3)">${featured.venue || ""}</small>
          </div>
          ${scoreline(featured, false)}
          <div style="margin-top:14px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em">No campeonato</div>
          <div style="margin-top:6px">${compareHTML(featured, 3)}</div>
        </a>
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
    const tabs = [["geral", "Visão geral"], ["partidas", "Partidas"], ["elenco", "Elenco"], ["tabela", "Tabela"]];
    let body = "";

    if (tab === "geral") {
      body = `<div class="kpis">
          <div class="kpi" style="--i:0"><small>Posição</small><b data-count="${r.pos}">0</b><em>${r.pos <= 4 ? "Zona de Libertadores" : r.pos <= 6 ? "Pré-Libertadores" : r.pos <= 12 ? "Zona de Sul-Americana" : r.pos >= 17 ? "Zona de rebaixamento" : "Meio da tabela"}</em></div>
          <div class="kpi" style="--i:1"><small>Pontos</small><b data-count="${r.p}">0</b><em>${r.pct}% de aproveitamento</em></div>
          <div class="kpi" style="--i:2"><small>Vitórias</small><b data-count="${r.w}">0</b><em>${r.d} empates · ${r.l} derrotas</em></div>
          <div class="kpi" style="--i:3"><small>Saldo</small><b data-count="${r.sg}" data-sign>0</b><em>${r.gf} marcados · ${r.ga} sofridos</em></div>
        </div>
        <div class="grid-2">
          <div>
            <div class="card reveal">
              <div class="card-h">Pontos no campeonato <small>${REAL.source} · ${REAL.updated}</small></div>
              <div class="card-b">${pointsChart(id)}</div>
            </div>
            ${m ? `<div class="card reveal"><div class="card-h">Jogo da ${ROUND}ª rodada <small>${m.venue || ""}</small></div>
              <a class="card-b feature" href="#/partida/${m.id}" style="display:block;${matchVars(m)}">${scoreline(m, false)}<div style="margin-top:12px">${compareHTML(m, 4)}</div></a></div>` : ""}
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
            ${c.idol ? `<div class="card idol reveal"><div class="eyebrow" style="color:inherit;opacity:.8">Ídolo eterno</div><h4>${c.idol}</h4></div>` : ""}
            ${LIVE.on() ? `<div class="card news" data-news="${id}"><div class="card-h">Últimas notícias <small>Google Notícias</small></div><ul><li class="mam-empty">Buscando notícias…</li></ul></div>` : ""}
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

    if (tab === "partidas") {
      const games = ROUNDS.slice().reverse().flatMap((rd) => (rd === ROUND ? state.matches : realMatches(rd)).filter((x) => x.home === id || x.away === id));
      body = `<div class="card" style="max-width:820px"><div class="card-h">Jogos do ${c.abbr} <small>ge.globo · CBF</small></div>
          ${games.map((g, i) => `<div class="league-h">${flagBR}<span>${g.round}ª rodada <small>· ${dayName(g.date)}${g.venue ? ` · ${g.venue}` : ""}</small></span></div>${matchRow(g, i)}`).join("")}
        </div>`;
    }

    if (tab === "elenco") body = LINEUP.builder(id);

    if (tab === "tabela") {
      body = `<div class="card">${standingsTable(state.standings, id)}${legend}</div>`;
    }

    return `<div class="club-page">
      <section class="hero ${HERO_SCENES.has(id) ? "hero--canvas" : ""}" data-short="${c.short}">
        ${HERO_SCENES.has(id) ? `<canvas class="hero-canvas" data-hero-scene="${id}" aria-hidden="true"></canvas>
          <div class="hero-scene-cap"><b>${SCENES.caption(id)}</b><span>toque para ver de novo</span></div>` : `<div class="kit-bg" style="background:${kitBg(c)}"></div>`}
        <div class="hero-inner">
          <div class="crest-big">${crest(c, 128, true)}</div>
          <div>
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
          ${HERO_SCENES.has(id) ? "" : `<div class="scene-stage">${SCENES.scene(c, "hero")}</div>`}
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
      ["Horário", m.time ? `${m.time} (Brasília)` : "—"],
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
            ${info.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:var(--text-2)">${k}</span><b style="text-align:right">${v}</b></div>`).join("")}
          </div>${m.status === "pending" ? `<div class="source">O resultado deste jogo ainda não foi lançado no site.</div>` : ""}</div>
          ${m.espn && LIVE.on() ? `<div class="card mam" data-mam="${m.espn}"><div class="card-h">Minuto a minuto <small>lances: ESPN · narração: PLACAR</small></div>
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

  /* números do campeonato, calculados da tabela real */
  function leagueStats() {
    const t = state.standings;
    const games = t.reduce((a, r) => a + r.j, 0) / 2;
    const goals = t.reduce((a, r) => a + r.gf, 0);
    const best = (k, dir = 1) => [...t].sort((x, y) => dir * (y[k] - x[k]))[0];
    const att = best("gf"), def = best("ga", -1), yel = best("ca"), red = best("cv");
    const tile = (i, label, value, sub, c) => `<div class="kpi" style="--i:${i}${c ? `;--c1:${c.colors[0]}` : ""}"><small>${label}</small><b>${value}</b><em>${c ? `<span style="display:inline-flex;align-items:center;gap:6px">${crest(c, 16)}${sub}</span>` : sub}</em></div>`;
    return `<div class="kpis league-kpis">
      ${tile(0, "Gols", goals, `${(goals / games).toFixed(2)} por jogo · ${games} jogos`)}
      ${tile(1, "Melhor ataque", att.gf, byId[att.id].abbr, byId[att.id])}
      ${tile(2, "Melhor defesa", def.ga, `${byId[def.id].abbr} · gols sofridos`, byId[def.id])}
      ${tile(3, "Mais amarelos", yel.ca, byId[yel.id].abbr, byId[yel.id])}
      ${tile(4, "Mais vermelhos", red.cv, byId[red.id].abbr, byId[red.id])}
    </div>`;
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
      r.page === "tabela" ? pageTable() :
      r.page === "bora-pro-jogo" ? LINEUP.pageBora(r.id, r.tab) :
      r.page === "sobre" ? pageAbout() : pageNotFound();
    view.innerHTML = html;
    const navKey = r.page === "" || r.page === "partida" ? "home" : r.page === "clube" ? "clubes" : r.page;
    $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === navKey));
    document.title = club ? `${club.name} — Placar` : r.page === "partida" ? "Partida — Placar" : r.page === "bora-pro-jogo" ? "Bora pro jogo — Placar" : "Placar — Futebol Brasileiro";
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
      `<div class="mark">${crest(club, 110)}</div>`;
    el.className = "curtain in";
    await sleep(520);
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    el.className = "curtain out";
    await sleep(700);
    el.className = "curtain";
    el.innerHTML = "";
  }

  /* ---------- comportamentos após renderizar ---------- */
  function enhance() {
    SCENES.mount(view);
    HERO_SCENES.mount(view);
    LINEUP.mount(view);
    LIVE.mount(view);
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
    requestAnimationFrame(() => $$(".bar i[data-w]").forEach((i) => { if (!i.closest(".reveal")) i.style.width = i.dataset.w + "%"; }));
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
  }

  /* ---------- eventos delegados ---------- */
  document.addEventListener("click", (e) => {
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
    const sig = () => state.matches.map((m) => `${m.status}${m.hs}${m.as}${m.clock}`).join();
    const before = sig();
    state.matches = realMatches(ROUND);
    state.standings = buildStandings();
    // não redesenha a página da partida (o minuto a minuto atualiza sozinho) nem durante a montagem do time
    if (sig() !== before && ["", "clube"].includes(state.route.page) && state.route.tab !== "elenco") render();
  };
  window.addEventListener("placar:data", refresh);
  setInterval(() => {
    refresh();
  }, 60000);

  /* ---------- início ---------- */
  addEventListener("hashchange", onRoute);
  render();
})();
