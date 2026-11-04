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

  /* o site espera isto antes de desenhar a primeira tela */
  window.PD_BOOT = location.protocol.startsWith("http") ? fetchState().then((s) => s && apply(s)) : Promise.resolve();

  /* atualização em segundo plano a cada minuto */
  setInterval(async () => {
    if (!PD.LIVE) return;
    const s = await fetchState(8000);
    if (s) { apply(s); window.dispatchEvent(new Event("placar:data")); }
  }, 60000);

  /* ---------------- Placar em tempo real ----------------
     Funciona com ou sem a API (no GitHub Pages também): enquanto houver jogo da rodada perto do horário
     ou em andamento, o navegador consulta o placar da ESPN a cada 20 s e atualiza a página. */
  // site.web.api libera o acesso a qualquer navegador; site.api bloqueia (CORS) navegadores de computador
  const ESPN_SB = ["https://site.web.api.espn.com", "https://site.api.espn.com"].map((h) => `${h}/apis/site/v2/sports/soccer/bra.1/scoreboard`);
  const ESPN_CLUB = { 3458: "athletico-pr", 7632: "atletico-mg", 9967: "bahia", 6086: "botafogo", 6079: "bragantino", 9318: "chapecoense", 874: "corinthians", 3456: "coritiba", 2022: "cruzeiro", 819: "flamengo", 3445: "fluminense", 6273: "gremio", 1936: "internacional", 9169: "mirassol", 2029: "palmeiras", 4936: "remo", 2674: "santos", 2026: "sao-paulo", 3454: "vasco", 3457: "vitoria" };
  const kickOf = (g) => (g[4] && g[5] ? new Date(`${g[4]}T${g[5]}:00-03:00`).getTime() : null);
  // jogo que precisa de placar ao vivo: começa em até 15 min, está rolando ou acabou há pouco sem resultado final
  const needsLive = (g, now) => {
    const k = kickOf(g), st = g[8] && g[8].state;
    return k && st !== "post" && now > k - 15 * 60e3 && now < k + 3 * 3600e3;
  };

  async function pollScores() {
    const games = PD.FIXTURES[PD.ROUND] || [], now = Date.now();
    const days = [...new Set(games.filter((g) => needsLive(g, now)).map((g) => g[4].replace(/-/g, "")))];
    if (!days.length) return false;
    let changed = false;
    for (const day of days) {
      let sb = null;
      for (const url of ESPN_SB) {
        try { sb = await (await fetch(`${url}?dates=${day}`, { cache: "no-store" })).json(); break; } catch { /* tenta o próximo endereço */ }
      }
      if (!sb) continue;
      for (const ev of sb.events || []) {
        const comp = ev.competitions[0], side = {};
        comp.competitors.forEach((c) => (side[c.homeAway] = c));
        const h = ESPN_CLUB[side.home?.team.id], a = ESPN_CLUB[side.away?.team.id];
        const g = games.find((x) => x[0] === h && x[1] === a);
        if (!g) continue;
        while (g.length < 9) g.push(null);
        const st = comp.status.type.state;
        const before = JSON.stringify(g);
        g[7] = ev.id;
        if (st === "in" || st === "post") { g[2] = +side.home.score; g[3] = +side.away.score; }
        g[8] = { state: st, clock: comp.status.displayClock, detail: comp.status.type.shortDetail, live: st === "in" };
        if (JSON.stringify(g) !== before) changed = true;
      }
    }
    if (changed) window.dispatchEvent(new Event("placar:data"));
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

  window.LIVE = {
    mount(root) {
      streams.forEach((s) => s.close()); streams.clear();
      if (!PD.LIVE) return;
      root.querySelectorAll("[data-mam]").forEach(mountMam);
      root.querySelectorAll("[data-news]").forEach(mountNews);
    },
    on: () => !!PD.LIVE,
  };
})();
