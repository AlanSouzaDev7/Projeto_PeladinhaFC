/* ==========================================================================
   PLACAR — dados ao vivo
   Se a API (server/placar_api.py) estiver rodando, o site troca os dados
   gravados nos arquivos pelos atualizados: tabela, jogos, elencos e
   últimas escalações. Também liga o "Minuto a minuto" e as notícias.
   Sem a API, nada muda: o site usa os dados dos arquivos.
   ========================================================================== */
(() => {
  const API = "/api";
  const PD = window.PD;

  function apply(s) {
    PD.REAL.table = s.standings;
    if (s.scorers) PD.REAL.scorers = s.scorers;
    PD.REAL.updated = s.updated;
    PD.REAL.source = "ESPN";
    for (const k of Object.keys(PD.FIXTURES)) delete PD.FIXTURES[k];
    Object.assign(PD.FIXTURES, s.fixtures);
    PD.ROUND = s.round;
    PD.ROUNDS = Object.keys(PD.FIXTURES).map(Number).sort((a, b) => a - b);
    if (s.squads) window.SQUADS = s.squads;
    if (s.last) window.SQUADS_LAST = s.last;
    if (s.players) window.PLAYER_STATS = s.players;
    if (s.form) window.CLUB_FORM = s.form;
    PD.LIVE = true;
  }

  async function fetchState(timeout = 2500) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(`${API}/state`, { signal: ctl.signal, cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch { return null; } finally { clearTimeout(t); }
  }

  /* ---------------- ESPN direto do navegador ----------------
     Usado sem a API (GitHub Pages): placar ao vivo e jogos das próximas rodadas. */
  // site.web.api libera o acesso a qualquer navegador; site.api bloqueia (CORS) navegadores de computador
  const ESPN_SB = ["https://site.web.api.espn.com", "https://site.api.espn.com"].map((h) => `${h}/apis/site/v2/sports/soccer/bra.1/scoreboard`);
  const ESPN_CLUB = { 3458: "athletico-pr", 7632: "atletico-mg", 9967: "bahia", 6086: "botafogo", 6079: "bragantino", 9318: "chapecoense", 874: "corinthians", 3456: "coritiba", 2022: "cruzeiro", 819: "flamengo", 3445: "fluminense", 6273: "gremio", 1936: "internacional", 9169: "mirassol", 2029: "palmeiras", 4936: "remo", 2674: "santos", 2026: "sao-paulo", 3454: "vasco", 3457: "vitoria" };
  const LAST_ROUND = 38;
  const kickOf = (g) => (g[4] && g[5] ? new Date(`${g[4]}T${g[5]}:00-03:00`).getTime() : null);
  const allGames = () => Object.values(PD.FIXTURES).flat();

  async function scoreboard(q = "") {
    for (const url of ESPN_SB) {
      try { return await (await fetch(`${url}${q}`, { cache: "no-store" })).json(); } catch { /* tenta o próximo endereço */ }
    }
    return null;
  }
  const sides = (ev) => {
    const s = {};
    ev.competitions[0].competitors.forEach((c) => (s[c.homeAway] = c));
    return { s, h: ESPN_CLUB[s.home?.team.id], a: ESPN_CLUB[s.away?.team.id] };
  };
  // situações do jogo em que o relógio da ESPN fica parado (ex.: "45'+7'" durante o intervalo)
  const STATUS_PT = { STATUS_HALFTIME: "Intervalo", STATUS_END_OF_REGULATION: "Fim do tempo normal", STATUS_OVERTIME: "Prorrogação", STATUS_HALFTIME_ET: "Intervalo da prorrogação",
    STATUS_END_OF_EXTRATIME: "Fim da prorrogação", STATUS_SHOOTOUT: "Pênaltis", STATUS_DELAYED: "Paralisado", STATUS_SUSPENDED: "Suspenso", STATUS_ABANDONED: "Abandonado", STATUS_POSTPONED: "Adiado" };
  const clockOf = (st) => STATUS_PT[st?.type?.name] || st?.displayClock;
  const liveOf = (ev) => {
    const st = ev.competitions[0].status;
    return { state: st.type.state, clock: clockOf(st), detail: st.type.shortDetail, live: st.type.state === "in" };
  };
  // data e hora de Brasília (UTC-3) a partir do horário da ESPN
  const brt = (iso) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString();

  /* rodada em andamento: a primeira que ainda tem jogo por terminar (jogo adiado não segura a rodada) */
  function currentRound() {
    const rounds = Object.keys(PD.FIXTURES).map(Number).sort((a, b) => a - b);
    const done = (g) => (g[8] && g[8].state === "post") || (g[2] != null && !(g[8] && g[8].state === "in"));
    return rounds.find((r) => PD.FIXTURES[r].some((g) => g[9] !== "adiado" && !done(g))) || rounds[rounds.length - 1];
  }

  /* próximas rodadas: a ESPN não informa o número da rodada, então os jogos futuros são agrupados pela data
     (mesma regra da API: rodada nova depois de mais de 3 dias sem jogo ou quando um time voltaria a jogar;
     blocos pequenos entram na rodada seguinte e, se o time já joga nela, viram "adiado") */
  async function addUpcoming() {
    const last = Math.max(...Object.keys(PD.FIXTURES).map(Number));
    if (last >= LAST_ROUND) return;
    const base = await scoreboard();
    const today = brt(new Date().toISOString()).slice(0, 10);
    const days = [...new Set((base?.leagues?.[0]?.calendar || []).map((c) => c.slice(0, 10)).filter((d) => d >= today))];
    const known = new Set(allGames().map((g) => `${g[0]}|${g[1]}`));
    const boards = await Promise.all(days.map((d) => scoreboard(`?dates=${d.replace(/-/g, "")}`)));
    const games = [];
    boards.forEach((sb) => (sb?.events || []).forEach((ev) => {
      const { s, h, a } = sides(ev), lv = liveOf(ev), t = brt(ev.date);
      if (!h || !a || known.has(`${h}|${a}`)) return;
      known.add(`${h}|${a}`);
      const sc = lv.state === "in" || lv.state === "post";
      const hora = lv.state === "pre" && ev.competitions[0].timeValid === false ? null : t.slice(11, 16); // null = "A definir"
      games.push([h, a, sc ? +s.home.score : null, sc ? +s.away.score : null, t.slice(0, 10), hora, ev.competitions[0].venue?.fullName || null, ev.id, lv]);
    }));
    games.sort((x, y) => (x[4] + x[5]).localeCompare(y[4] + y[5]));
    const blocks = [];
    let cur = null;
    for (const g of games) {
      const day = new Date(`${g[4]}T00:00:00Z`).getTime();
      if (!cur || day - cur.last > 3 * 864e5 || ((cur.teams.has(g[0]) || cur.teams.has(g[1])) && day !== cur.last)) blocks.push((cur = { games: [], teams: new Set(), last: day }));
      cur.games.push(g); cur.teams.add(g[0]).add(g[1]); cur.last = day;
    }
    let rd = last + 1;
    blocks.forEach((b, i) => {
      const next = blocks[i + 1];
      if (b.games.length < 5 && next) {
        b.games.forEach((g) => { if (next.teams.has(g[0]) || next.teams.has(g[1])) g[9] = "adiado"; });
        next.games.unshift(...b.games);
        return;
      }
      if (rd <= LAST_ROUND) PD.FIXTURES[rd++] = b.games;
    });
    PD.ROUNDS = Object.keys(PD.FIXTURES).map(Number).sort((a, b) => a - b);
    PD.ROUND = currentRound();
  }

  /* o site espera isto antes de desenhar a primeira tela; sem a API, busca as próximas rodadas na ESPN (no máximo 4 s) */
  const timeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(res, ms))]);
  window.PD_BOOT = location.protocol.startsWith("http")
    ? fetchState().then((s) => (s ? apply(s) : timeout(addUpcoming().catch(() => {}), 4000)))
    : Promise.resolve();

  /* atualização em segundo plano a cada minuto */
  setInterval(async () => {
    if (!PD.LIVE) return;
    const s = await fetchState(8000);
    if (s) { apply(s); window.dispatchEvent(new Event("placar:data")); }
  }, 60000);

  /* ---------------- Placar em tempo real ----------------
     Funciona com ou sem a API: enquanto houver jogo perto do horário ou em andamento (de qualquer rodada,
     inclusive adiados), o navegador consulta o placar da ESPN a cada 20 s e atualiza a página. */
  // jogo que precisa de placar ao vivo: começa em até 15 min, está rolando ou acabou há pouco sem resultado final
  const needsLive = (g, now) => {
    const k = kickOf(g), st = g[8] && g[8].state;
    return k && st !== "post" && now > k - 15 * 60e3 && now < k + 3 * 3600e3;
  };

  async function pollScores() {
    const games = allGames(), now = Date.now();
    const days = [...new Set(games.filter((g) => needsLive(g, now)).map((g) => g[4].replace(/-/g, "")))];
    if (!days.length) return false;
    let changed = false;
    for (const day of days) {
      const sb = await scoreboard(`?dates=${day}`);
      if (!sb) continue;
      for (const ev of sb.events || []) {
        const comp = ev.competitions[0], { s: side, h, a } = sides(ev);
        const g = games.find((x) => x[0] === h && x[1] === a);
        if (!g) continue;
        while (g.length < 9) g.push(null);
        const st = comp.status.type.state;
        const before = JSON.stringify(g);
        g[7] = ev.id;
        if (st === "in" || st === "post") { g[2] = +side.home.score; g[3] = +side.away.score; }
        g[8] = { state: st, clock: clockOf(comp.status), detail: comp.status.type.shortDetail, live: st === "in" };
        if (JSON.stringify(g) !== before) changed = true;
      }
    }
    if (changed) {
      if (!PD.LIVE) PD.ROUND = currentRound(); // rodada terminou: passa para a próxima
      window.dispatchEvent(new Event("placar:data"));
    }
    return true;
  }
  (async function loop() {
    await window.PD_BOOT;
    const live = await pollScores().catch(() => false);
    setTimeout(loop, live ? 20000 : 60000);
  })();

  /* ---------------- Minuto a minuto ---------------- */
  const ICO = { goal: "⚽", "yellow-card": "🟨", "red-card": "🟥", substitution: "🔁", status: "⏱", panorama: "📊" };
  const streams = new Set();

  function lineHTML(l) {
    return `<li class="mam-l ${l.type}"><span class="mam-min">${l.min || ""}</span><span class="mam-ico">${ICO[l.type] || "•"}</span><p>${l.text}</p></li>`;
  }

  function head(n) {
    const live = n.state === "in";
    return `<div class="mam-head"><span class="${live ? "pill" : "pill muted"}">${live ? `Ao vivo · ${n.clock || ""}` : n.state === "post" ? "Encerrado" : "Ainda não começou"}</span>
      <b>${n.home.name} ${n.home.score} x ${n.away.score} ${n.away.name}</b></div>`;
  }

  async function mountMam(el) {
    const id = el.dataset.mam;
    const list = el.querySelector(".mam-list"), top = el.querySelector(".mam-top");
    let n;
    try { n = await (await fetch(`${API}/minuto-a-minuto/${id}`, { cache: "no-store" })).json(); } catch { n = null; }
    if (!n || !n.lines) { list.innerHTML = `<li class="mam-empty">Narração indisponível agora.</li>`; return; }
    top.innerHTML = head(n);
    const seen = new Set();
    const add = (lines, fresh) => lines.forEach((l) => {
      if (seen.has(l.id)) return;
      seen.add(l.id);
      list.insertAdjacentHTML("afterbegin", lineHTML(l));
      if (fresh) list.firstElementChild.classList.add("fresh");
    });
    list.innerHTML = n.lines.length ? "" : `<li class="mam-empty">${n.state === "pre" ? "A narração começa com a bola rolando." : "Sem lances registrados."}</li>`;
    add(n.lines.filter((l) => l.type !== "panorama"), false);
    if (n.state !== "in") return;
    // ao vivo: cada lance novo chega pelo canal de eventos do servidor
    const es = new EventSource(`${API}/minuto-a-minuto/${id}/stream`);
    streams.add(es);
    es.onmessage = (e) => {
      const p = JSON.parse(e.data);
      top.innerHTML = head(p);
      const empty = list.querySelector(".mam-empty"); if (empty) empty.remove();
      add(p.lines, true);
      if (p.state === "post") es.close();
    };
  }

  /* ---------------- Notícias ---------------- */
  async function mountNews(el) {
    const club = el.dataset.news;
    try {
      const r = await (await fetch(`${API}/news?club=${club}`, { cache: "no-store" })).json();
      const items = (r.items || []).slice(0, 6);
      if (!items.length) { el.querySelector("ul").innerHTML = `<li class="mam-empty">Nenhuma notícia nas últimas horas.</li>`; return; }
      const ago = (ts) => { const m = Math.round((Date.now() / 1000 - ts) / 60); return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
      el.querySelector("ul").innerHTML = items.map((x) => `<li><a href="${x.link}" target="_blank" rel="noopener"><b>${x.title.replace(/</g, "&lt;")}</b><small>${x.source} · ${ago(x.ts)}${x.tag && x.tag !== "clube" ? ` · ${x.tag}` : ""}</small></a></li>`).join("");
    } catch {
      el.remove();
    }
  }

  /* ---------------- Retrospecto (últimos 5 e próximos 5) direto da ESPN ----------------
     Sem a API, a página do clube busca a agenda atualizada das 4 competições (mesma regra da API). */
  // também estaduais e supercopas (a ESPN não cobre Paranaense, Baiano, Catarinense nem Paraense)
  const LEAGUES = { "bra.1": "Brasileirão", "bra.copa_do_brazil": "Copa do Brasil", "conmebol.libertadores": "Libertadores", "conmebol.sudamericana": "Sul-Americana",
    "conmebol.recopa": "Recopa", "bra.supercopa_do_brazil": "Supercopa", "bra.camp.carioca": "Carioca", "bra.camp.paulista": "Paulistão", "bra.camp.mineiro": "Mineiro", "bra.camp.gaucho": "Gauchão" };
  const STAGE_PT = { Semifinals: "Semifinal", Final: "Final", Finals: "Final", Quarterfinals: "Quartas de final", "Round of 16": "Oitavas de final", "Group Stage": "Fase de grupos", "Knockout Round Playoffs": "Playoffs" };
  const ESPN_ID = Object.fromEntries(Object.entries(ESPN_CLUB).map(([k, v]) => [v, k]));
  const scoreOf = (c) => (c.score && typeof c.score === "object" ? [+c.score.value, c.score.shootoutScore] : [c.score === "" || c.score == null ? null : +c.score, null]);

  async function fetchForm(cid) {
    const espn = ESPN_ID[cid], year = new Date().getFullYear(), past = [], next = [];
    const urls = Object.keys(LEAGUES).flatMap((lg) => ["", "&fixture=true"].map((fx) => [lg, `https://site.web.api.espn.com/apis/site/v2/sports/soccer/${lg}/teams/${espn}/schedule?season=${year}${fx}`]));
    const res = await Promise.all(urls.map(([lg, u]) => fetch(u, { cache: "no-store" }).then((r) => r.json()).then((d) => [lg, d]).catch(() => [lg, null])));
    if (res.every(([, d]) => !d)) return null;
    for (const [lg, d] of res) {
      for (const ev of d?.events || []) {
        const comp = ev.competitions[0], me = comp.competitors.find((c) => c.team.id === espn), op = comp.competitors.find((c) => c.team.id !== espn);
        if (!me || !op) continue;
        const t = brt(ev.date), st = comp.status.type.state;
        const e = { id: ev.id, date: t.slice(0, 10), time: t.slice(11, 16), comp: LEAGUES[lg], stage: lg === "bra.1" ? "" : STAGE_PT[ev.seasonType?.name] || "",
          home: me.homeAway === "home", opp: op.team.displayName, oppId: ESPN_CLUB[op.team.id] || null, oppLogo: op.team.logos?.[0]?.href, state: st, venue: comp.venue?.fullName };
        if (st === "pre" && comp.timeValid === false) e.time = null; // horário ainda não definido
        if (st === "in") Object.assign(e, { gf: scoreOf(me)[0], ga: scoreOf(op)[0], clock: clockOf(comp.status) });
        if (st === "post") {
          const [gf, pf] = scoreOf(me), [ga, pa] = scoreOf(op);
          Object.assign(e, { gf, ga, res: gf > ga ? "V" : gf < ga ? "D" : "E" });
          if (pf != null && pa != null) e.pen = [+pf, +pa];
        }
        (st === "post" ? past : next).push(e);
      }
    }
    const uniq = (xs) => [...new Map(xs.map((x) => [x.id, x])).values()];
    const key = (x) => x.date + (x.time || "99:99");
    const P = uniq(past).sort((a, b) => key(a).localeCompare(key(b))), N = uniq(next).sort((a, b) => key(a).localeCompare(key(b)));
    return { last: P.slice(-5).reverse(), next: N.slice(0, 5), all: [...P, ...N] };
  }

  // guarda por 5 min: a página do clube é redesenhada a cada lance ao vivo e não precisa baixar tudo de novo
  const formCache = new Map();
  const cachedForm = (cid) => {
    const hit = formCache.get(cid);
    if (hit && Date.now() - hit.t < 5 * 60e3) return hit.p;
    const p = fetchForm(cid).catch(() => null);
    formCache.set(cid, { t: Date.now(), p });
    return p;
  };

  window.LIVE = {
    form: cachedForm,
    mount(root) {
      streams.forEach((s) => s.close()); streams.clear();
      if (!PD.LIVE) return;
      root.querySelectorAll("[data-mam]").forEach(mountMam);
      root.querySelectorAll("[data-news]").forEach(mountNews);
    },
    on: () => !!PD.LIVE,
  };
})();
