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

  /* sem a API: dados gravados a cada 30 min pelo GitHub Actions (js/live-data.js) */
  function applySnapshot(d) {
    if (!d || !d.standings) return;
    PD.REAL.table = d.standings;
    if (d.scorers) PD.REAL.scorers = d.scorers;
    PD.REAL.updated = d.updated;
    PD.REAL.source = "ESPN";
    if (d.fixtures) {
      for (const k of Object.keys(PD.FIXTURES)) delete PD.FIXTURES[k];
      Object.assign(PD.FIXTURES, d.fixtures);
    }
    PD.ROUNDS = Object.keys(PD.FIXTURES).map(Number).sort((a, b) => a - b);
    PD.ROUND = d.round || PD.ROUND;
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

  /* ---------------- API-Football (opcional, pelo Worker) ----------------
     Com o endereço do Worker em js/config.js, placar e lances vêm primeiro da API-Football, que costuma
     registrar o lance antes. A ESPN continua de reserva: Worker fora do ar, limite do plano esgotado
     ou jogo que a API-Football não trouxe. */
  const CFG = window.PLACAR_CONFIG || {};
  const PROXY = String(CFG.aoVivo || "").replace(/\/+$/, "");
  const PROXY_MS = Math.max(5, +CFG.intervalo || 15) * 1000;
  let proxyHit = null;
  function proxyGames() {
    if (!PROXY) return Promise.resolve(null);
    // placar e minuto a minuto pedem juntos: uma consulta serve os dois
    if (proxyHit && Date.now() - proxyHit.t < 4000) return proxyHit.p;
    const p = (async () => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
      try {
        const r = await fetch(`${PROXY}/ao-vivo`, { cache: "no-store", signal: ctl.signal });
        if (!r.ok) return null;
        const d = await r.json();
        if (!d || !Array.isArray(d.games) || d.esgotado) return null;
        setTimeout(() => window.dispatchEvent(new Event("placar:proxy"))); // o minuto a minuto aproveita a mesma resposta
        return d;
      } catch { return null; } finally { clearTimeout(t); }
    })();
    proxyHit = { t: Date.now(), p };
    return p;
  }

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
    ? fetchState().then((s) => {
        if (s) return apply(s);
        applySnapshot(window.LIVE_DATA);
        return timeout(addUpcoming().then(() => (PD.ROUND = currentRound())).catch(() => {}), 4000);
      })
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
    const need = games.filter((g) => needsLive(g, now));
    if (!need.length) return false;
    let changed = false;
    // 1) API-Football pelo Worker: os jogos que ela trouxer não são sobrescritos pela ESPN
    const covered = new Set(), px = await proxyGames();
    for (const p of px?.games || []) {
      const g = games.find((x) => x[0] === p.home && x[1] === p.away);
      if (!g) continue;
      covered.add(g);
      while (g.length < 9) g.push(null);
      const before = JSON.stringify(g);
      if (p.state === "in" || p.state === "post") { g[2] = p.hs; g[3] = p.as; }
      g[8] = { state: p.state, clock: p.clock, detail: p.detail, live: p.state === "in", src: "API-Football" };
      if (JSON.stringify(g) !== before) changed = true;
    }
    // 2) ESPN para o que faltou
    const days = [...new Set(need.filter((g) => !covered.has(g)).map((g) => g[4].replace(/-/g, "")))];
    for (const day of days) {
      const sb = await scoreboard(`?dates=${day}`);
      if (!sb) continue;
      for (const ev of sb.events || []) {
        const comp = ev.competitions[0], { s: side, h, a } = sides(ev);
        const g = games.find((x) => x[0] === h && x[1] === a);
        if (!g || covered.has(g)) continue;
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
    return { proxy: covered.size > 0, next: px?.proximo };
  }
  // com o Worker: consulta logo depois que ele tiver placar novo (entre 2 s e o intervalo configurado)
  const proxyDelay = (next) => (next == null ? PROXY_MS : Math.min(PROXY_MS, Math.max(2000, next + 700)));
  (async function loop() {
    await window.PD_BOOT;
    const r = await pollScores().catch(() => false);
    setTimeout(loop, !r ? 60000 : r.proxy ? proxyDelay(r.next) : 20000);
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

  /* narração própria a partir dos lances da súmula da ESPN (a mesma regra da API em Python) */
  async function narrate(eid) {
    let d = null;
    for (const lg of ["bra.1", "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana"]) {
      try {
        const r = await (await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${eid}`, { cache: "no-store" })).json();
        if (r.header) { d = r; break; }
      } catch { /* tenta a próxima competição */ }
    }
    if (!d) return null;
    const comp = d.header.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === "home"), away = comp.competitors.find((c) => c.homeAway === "away");
    const tname = Object.fromEntries(comp.competitors.map((c) => [c.team.id, c.team.displayName]));
    const score = { [home.team.id]: 0, [away.team.id]: 0 };
    const placar = () => `${tname[home.team.id]} ${score[home.team.id]} x ${score[away.team.id]} ${tname[away.team.id]}`;
    const lines = [];
    (d.keyEvents || []).forEach((k, i) => {
      const typ = k.type?.type || "", clock = k.clock?.displayValue || "", tid = k.team?.id, team = tname[tid] || "";
      const ps = (k.participants || []).map((p) => p.athlete.displayName);
      let text = null, kind = typ;
      if (typ === "kickoff") [text, kind] = ["Rola a bola! Começa a partida.", "status"];
      else if (typ === "halftime") [text, kind] = [`Fim do primeiro tempo. ${placar()}.`, "status"];
      else if (typ === "start-2nd-half") [text, kind] = ["Bola rolando para o segundo tempo.", "status"];
      else if (["end-regular-time", "full-time", "end-of-game"].includes(typ)) [text, kind] = [`Fim de jogo! ${placar()}.`, "status"];
      else if (k.scoringPlay && tid in score) {
        score[tid]++;
        if (typ === "own-goal") text = `GOL do ${team}! ${ps[0] || "O adversário"} manda contra o próprio gol. ${placar()}.`;
        else if (typ.includes("penalty")) text = `GOL do ${team}! ${ps[0] || ""} cobra o pênalti e marca. ${placar()}.`;
        else text = `GOL do ${team}! ${ps[0] || ""} marca${typ.includes("header") ? " de cabeça" : ""}${ps[1] ? `, com assistência de ${ps[1]}` : ""}. ${placar()}.`;
        kind = "goal";
      } else if (typ === "yellow-card") text = `Cartão amarelo para ${ps[0] || "jogador"} (${team}).`;
      else if (typ === "red-card" || typ === "second-yellow-card") [text, kind] = [`Expulso! ${ps[0] || "Jogador"} (${team}) recebe o vermelho e deixa o ${team} com um a menos.`, "red-card"];
      else if (typ === "substitution" && ps.length >= 2) text = `Substituição no ${team}: entra ${ps[0]}, sai ${ps[1]}.`;
      else if (typ === "start-delay") [text, kind] = ["Jogo paralisado.", "status"];
      else if (typ === "end-delay") [text, kind] = ["Partida reiniciada.", "status"];
      else if (typ === "penalty---missed" || typ === "penalty-missed") text = `Perdeu! ${ps[0] || "O batedor"} (${team}) desperdiça o pênalti.`;
      if (text) lines.push({ id: `${eid}-${i}`, min: clock, type: kind, text });
    });
    const st = comp.status;
    return { state: st.type.state, clock: clockOf(st), detail: st.type.shortDetail,
      home: { name: home.team.displayName, score: +home.score || 0 }, away: { name: away.team.displayName, score: +away.score || 0 }, lines };
  }

  /* narração própria a partir dos lances da API-Football (já organizados pelo Worker) */
  function narrateProxy(p) {
    const nome = (c) => PD.byId[c]?.name || c;
    const N = { home: nome(p.home), away: nome(p.away) }, sc = { home: 0, away: 0 };
    const placar = () => `${N.home} ${sc.home} x ${sc.away} ${N.away}`;
    const lines = [];
    for (const e of p.events || []) {
      const team = N[e.side] || "";
      let text = null, type = "status";
      if (e.kind === "kickoff") text = "Rola a bola! Começa a partida.";
      else if (e.kind === "halftime") text = `Fim do primeiro tempo. ${placar()}.`;
      else if (e.kind === "second-half") text = "Bola rolando para o segundo tempo.";
      else if (e.kind === "full-time") text = `Fim de jogo! ${placar()}.`;
      else if (e.kind === "goal" || e.kind === "penalty-goal" || e.kind === "own-goal") {
        sc[e.for || e.side]++; type = "goal";
        const quem = N[e.for || e.side];
        text = e.kind === "own-goal" ? `GOL do ${quem}! ${e.player || "O adversário"} manda contra o próprio gol. ${placar()}.`
          : e.kind === "penalty-goal" ? `GOL do ${quem}! ${e.player} cobra o pênalti e marca. ${placar()}.`
          : `GOL do ${quem}! ${e.player} marca${e.assist ? `, com assistência de ${e.assist}` : ""}. ${placar()}.`;
      } else if (e.kind === "var-cancel") {
        if (sc[e.side] > 0) sc[e.side]--;
        text = `O VAR anula o gol do ${team}. ${placar()}.`;
      } else if (e.kind === "missed-penalty") { type = "missed"; text = `Perdeu! ${e.player || "O batedor"} (${team}) desperdiça o pênalti.`; }
      else if (e.kind === "yellow") { type = "yellow-card"; text = `Cartão amarelo para ${e.player || "jogador"} (${team}).`; }
      else if (e.kind === "red") { type = "red-card"; text = `Expulso! ${e.player || "Jogador"} (${team}) recebe o vermelho e deixa o ${team} com um a menos.`; }
      else if (e.kind === "sub") { type = "substitution"; text = `Substituição no ${team}: entra ${e.assist || "?"}, sai ${e.player || "?"}.`; }
      // id pelo conteúdo: lance registrado com atraso não duplica os outros
      if (text) lines.push({ id: `af-${e.kind}-${e.elapsed}-${e.extra}-${e.side || ""}-${e.player || ""}`, min: e.min, type, text });
    }
    return { state: p.state, clock: p.clock, detail: p.detail, source: "API-Football",
      home: { name: N.home, score: p.hs ?? 0 }, away: { name: N.away, score: p.as ?? 0 }, lines };
  }

  /* sem a API local: API-Football (se configurada e se trouxe o jogo) ou ESPN */
  async function loadMam(id, h, a) {
    const px = await proxyGames();
    const p = px?.games.find((g) => g.home === h && g.away === a && g.events);
    if (p) return narrateProxy(p);
    if (!id) return null;
    const n = await narrate(id).catch(() => null);
    return n && Object.assign(n, { source: "ESPN" });
  }

  async function mountMam(el) {
    const id = el.dataset.mam, { h, a } = el.dataset;
    const list = el.querySelector(".mam-list"), top = el.querySelector(".mam-top"), src = el.querySelector(".mam-src");
    let n;
    if (PD.LIVE) {
      try { n = await (await fetch(`${API}/minuto-a-minuto/${id}`, { cache: "no-store" })).json(); } catch { n = null; }
    } else {
      n = await loadMam(id, h, a);
    }
    if (!n && !id) { list.innerHTML = `<li class="mam-empty">A narração começa com a bola rolando.</li>`; return; }
    if (!n || !n.lines) { list.innerHTML = `<li class="mam-empty">Narração indisponível agora.</li>`; return; }
    let fonte = n.source;
    if (src && fonte) src.textContent = `lances: ${fonte} · narração: PLACAR`;
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
    // página aberta antes do apito: sem a API local, já fica esperando a bola rolar (a partir de 15 min antes)
    const kick = +el.dataset.kick || 0, soon = n.state === "pre" && kick && Date.now() > kick - 15 * 60e3;
    if (n.state !== "in" && !(soon && !PD.LIVE)) return;
    if (!PD.LIVE) {
      // sem a API: com o Worker, atualiza junto com cada resposta dele; com a ESPN, a cada 20 s
      let busy = false;
      const tick = async () => {
        if (!el.isConnected) return stop();
        if (busy) return;
        busy = true;
        const p = await loadMam(id, h, a).finally(() => (busy = false));
        if (!p) return;
        top.innerHTML = head(p);
        if (p.source !== fonte) {
          // trocou de fonte no meio do jogo (ex.: limite da API-Football): redesenha a lista inteira
          fonte = p.source; seen.clear(); list.innerHTML = "";
          if (src) src.textContent = `lances: ${fonte} · narração: PLACAR`;
          add(p.lines, false);
        }
        const empty = list.querySelector(".mam-empty"); if (empty) empty.remove();
        add(p.lines, true);
        if (p.state === "post") stop();
      };
      const timer = setInterval(tick, 20000); // reserva: ESPN, ou Worker que parou de responder
      const stop = () => { clearInterval(timer); window.removeEventListener("placar:proxy", tick); };
      if (PROXY) window.addEventListener("placar:proxy", tick);
      streams.add({ close: stop });
      return;
    }
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
      const r = PD.LIVE ? await (await fetch(`${API}/news?club=${club}`, { cache: "no-store" })).json() : { items: window.LIVE_DATA?.news?.[club] || [] };
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
      root.querySelectorAll("[data-mam]").forEach(mountMam);
      root.querySelectorAll("[data-news]").forEach(mountNews);
    },
    on: () => !!PD.LIVE,
    // Worker da API-Football configurado em js/config.js
    proxy: () => !!PROXY,
    // notícias: pela API ou pelas manchetes gravadas pelo GitHub Actions
    hasNews: () => !!PD.LIVE || !!window.LIVE_DATA?.news,
  };
})();
