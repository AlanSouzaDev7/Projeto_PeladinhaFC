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
