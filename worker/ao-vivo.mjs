/* ==========================================================================
   PLACAR — placar ao vivo pela API-Football (Cloudflare Worker)
   O site no GitHub Pages não pode guardar a chave da API (qualquer um veria),
   então este Worker fica no meio: guarda a chave, consulta a API-Football e
   devolve só os jogos dos 20 clubes, já no formato do site.

   Rotas:
     GET /ao-vivo   jogos de hoje dos 20 clubes: placar, situação, relógio e lances
     GET /saude     se a chave está configurada e quantas consultas restam hoje

   Economia de consultas (o plano grátis dá ~100 por dia):
     - a lista de jogos do dia é baixada no máximo a cada LISTA_SEGUNDOS (padrão 30 min);
     - os detalhes (placar e lances) só são baixados para jogos perto do horário
       ou rolando, no máximo a cada INTERVALO_SEGUNDOS (padrão 15 s), e todos os
       visitantes recebem a mesma resposta;
     - quando o limite do dia está no fim, o Worker para de consultar até a meia-noite
       (UTC, quando a API-Football renova o limite) e o site volta para a ESPN sozinho.
   ========================================================================== */

const BASE = "https://v3.football.api-sports.io";

// nome que a API-Football usa (sem acento, minúsculo) -> clube do site
const CLUBES = {
  "athletico-pr": ["athletico paranaense", "atletico paranaense", "athletico pr", "atletico pr"],
  "atletico-mg": ["atletico mineiro", "atletico mg"],
  bahia: ["bahia", "ec bahia"],
  botafogo: ["botafogo", "botafogo rj"],
  bragantino: ["red bull bragantino", "rb bragantino", "bragantino"],
  chapecoense: ["chapecoense", "chapecoense sc"],
  corinthians: ["corinthians"],
  coritiba: ["coritiba"],
  cruzeiro: ["cruzeiro"],
  flamengo: ["flamengo", "flamengo rj"],
  fluminense: ["fluminense"],
  gremio: ["gremio"],
  internacional: ["internacional"],
  mirassol: ["mirassol"],
  palmeiras: ["palmeiras"],
  remo: ["remo", "clube do remo"],
  santos: ["santos"],
  "sao-paulo": ["sao paulo"],
  vasco: ["vasco da gama", "vasco"],
  vitoria: ["vitoria"],
};
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const NOME = Object.fromEntries(Object.entries(CLUBES).flatMap(([id, ns]) => ns.map((n) => [n, id])));
export const clubOf = (name) => NOME[norm(name)] || null;

// só futebol masculino profissional do Brasil (evita Santos Laguna, Vitória de Guimarães, sub-20, feminino...)
const ok = (f) => f.league?.country === "Brazil" && !/women|femin|u\d\d|sub.?\d\d|youth/i.test(f.league?.name || "");

const AO_VIVO = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const FIM = new Set(["FT", "AET", "PEN", "AWD", "WO", "ABD"]);
const RELOGIO = { HT: "Intervalo", BT: "Intervalo da prorrogação", P: "Pênaltis", SUSP: "Suspenso", INT: "Paralisado", PST: "Adiado", CANC: "Cancelado", ABD: "Abandonado" };
const PASSOU_INTERVALO = new Set(["HT", "2H", "ET", "BT", "P", "FT", "AET", "PEN"]);
const minuto = (el, ex) => (el == null ? "" : `${el}'${ex ? `+${ex}'` : ""}`);

/* lances da API-Football -> lances do site, em ordem, com início, intervalo, 2º tempo e fim */
function lances(f, short) {
  const lado = (t) => (t?.id === f.teams.home.id ? "home" : t?.id === f.teams.away.id ? "away" : null);
  const out = [];
  for (const e of f.events || []) {
    const side = lado(e.team), d = e.detail || "";
    let kind = null;
    if (e.type === "Goal") kind = d === "Own Goal" ? "own-goal" : d === "Penalty" ? "penalty-goal" : d === "Missed Penalty" ? "missed-penalty" : "goal";
    else if (e.type === "Card") kind = /yellow/i.test(d) && !/second/i.test(d) ? "yellow" : "red";
    else if (e.type === "subst") kind = "sub";
    else if (e.type === "Var" && /goal (cancel|disallow)/i.test(d)) kind = "var-cancel";
    if (!kind || !side) continue;
    // na substituição a API-Football põe quem sai em "player" e quem entra em "assist"
    out.push({ kind, side, elapsed: e.time?.elapsed ?? 0, extra: e.time?.extra || 0, min: minuto(e.time?.elapsed, e.time?.extra), player: e.player?.name || "", assist: e.assist?.name || "" });
  }
  // gol contra: a API às vezes credita o time do jogador, às vezes o beneficiado; fica a versão que bate com o placar
  const conta = (contraDoTime) => {
    const g = { home: 0, away: 0 }, outro = (s) => (s === "home" ? "away" : "home");
    for (const x of out) {
      if (x.kind === "goal" || x.kind === "penalty-goal") g[x.side]++;
      else if (x.kind === "own-goal") g[contraDoTime ? outro(x.side) : x.side]++;
      else if (x.kind === "var-cancel" && g[x.side] > 0) g[x.side]--;
    }
    return g.home === (f.goals.home ?? 0) && g.away === (f.goals.away ?? 0);
  };
  const contraDoTime = conta(true) || !conta(false);
  for (const x of out) {
    if (x.kind === "own-goal") x.for = contraDoTime ? (x.side === "home" ? "away" : "home") : x.side;
    else if (x.kind === "goal" || x.kind === "penalty-goal") x.for = x.side;
  }

  if (!AO_VIVO.has(short) && !FIM.has(short)) return [];
  out.push({ kind: "kickoff", elapsed: 0, extra: -1, min: "1'" });
  if (PASSOU_INTERVALO.has(short)) out.push({ kind: "halftime", elapsed: 45, extra: 98, min: "45'" });
  if (PASSOU_INTERVALO.has(short) && short !== "HT") out.push({ kind: "second-half", elapsed: 45, extra: 99, min: "46'" });
  if (FIM.has(short)) out.push({ kind: "full-time", elapsed: 999, extra: 0, min: minuto(f.fixture.status.elapsed, f.fixture.status.extra) });
  return out.sort((a, b) => a.elapsed - b.elapsed || a.extra - b.extra);
}

/* um jogo da API-Football -> jogo do site (null se não for entre dois dos 20 clubes) */
export function normalize(f) {
  if (!ok(f)) return null;
  const home = clubOf(f.teams.home.name), away = clubOf(f.teams.away.name);
  if (!home || !away) return null;
  const s = f.fixture.status, short = s.short;
  const state = AO_VIVO.has(short) ? "in" : FIM.has(short) ? "post" : "pre";
  return {
    id: f.fixture.id, home, away,
    hs: state === "pre" ? null : f.goals.home ?? 0, as: state === "pre" ? null : f.goals.away ?? 0,
    state, status: short, detail: short,
    clock: RELOGIO[short] || (state === "in" ? minuto(s.elapsed, s.extra) : null),
    kickoff: f.fixture.timestamp * 1000,
    events: f.events ? lances(f, short) : null,
  };
}

/* ---------------- consultas à API-Football ---------------- */
const mem = new Map(); // memória do Worker: uma consulta serve todos os visitantes
let bloqueadoAte = 0, restantes = null;

function guardado(key, ms, fn) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ms) return hit.p;
  const p = fn();
  mem.set(key, { t: Date.now(), p });
  p.catch(() => mem.delete(key));
  return p;
}
const meiaNoiteUTC = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };

async function api(path, env) {
  if (Date.now() < bloqueadoAte) throw new Error("limite do dia");
  const r = await fetch(`${BASE}${path}`, { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } });
  const rest = r.headers.get("x-ratelimit-requests-remaining");
  if (rest != null) {
    restantes = +rest;
    if (restantes <= (+env.RESERVA || 2)) bloqueadoAte = meiaNoiteUTC();
  }
  const d = await r.json();
  const err = d.errors && (Array.isArray(d.errors) ? d.errors.join(" ") : Object.values(d.errors).join(" "));
  if (err) {
    if (/limit|requests/i.test(err)) bloqueadoAte = meiaNoiteUTC();
    throw new Error(err);
  }
  return d.response || [];
}

const dataBRT = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);

export async function aoVivo(env, now = Date.now()) {
  const lista = +env.LISTA_SEGUNDOS || 1800, intervalo = +env.INTERVALO_SEGUNDOS || 15;
  // depois da meia-noite, o jogo que começou tarde ainda está na lista de ontem
  const dias = [dataBRT(now)];
  if (new Date(now - 3 * 3600e3).getUTCHours() < 3) dias.unshift(dataBRT(now - 864e5));
  const brutos = (await Promise.all(dias.map((d) => guardado(`lista-${d}`, lista * 1000, () => api(`/fixtures?date=${d}&timezone=America/Sao_Paulo`, env))))).flat();
  const jogos = [...new Map(brutos.map(normalize).filter(Boolean).map((g) => [g.id, g])).values()];
  // detalhes só dos jogos que podem estar rolando (de 15 min antes até 3 h depois do início)
  const ativos = jogos.filter((g) => now > g.kickoff - 15 * 60e3 && now < g.kickoff + 3 * 3600e3 && g.status !== "PST" && g.status !== "CANC");
  let proximo = null;
  if (ativos.length) {
    const ids = ativos.map((g) => g.id).sort((a, b) => a - b);
    const det = [];
    for (let i = 0; i < ids.length; i += 20) {
      const key = `det-${ids.slice(i, i + 20).join("-")}`;
      det.push(...(await guardado(key, intervalo * 1000, () => api(`/fixtures?ids=${ids.slice(i, i + 20).join("-")}`, env))));
      // quando este dado vence: o site consulta logo depois, sem somar a espera dele com a do Worker
      const fresh = mem.get(key) ? mem.get(key).t + intervalo * 1000 - Date.now() : 0;
      proximo = Math.max(0, Math.min(proximo ?? fresh, fresh));
    }
    for (const f of det) {
      const g = normalize(f);
      const i = g ? jogos.findIndex((x) => x.id === g.id) : -1;
      if (i >= 0) jogos[i] = g;
    }
  }
  // proximo: em quantos ms o Worker terá placar novo (null = nenhum jogo rolando)
  return { source: "API-Football", updated: new Date(now).toISOString(), proximo, restantes, games: jogos };
}

/* ---------------- Worker ---------------- */
export default {
  async fetch(req, env) {
    const cors = { "access-control-allow-origin": env.ORIGEM || "*", "access-control-allow-methods": "GET, OPTIONS", "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const path = new URL(req.url).pathname.replace(/\/+$/, "");
    const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: cors });
    if (path === "/saude") return json({ ok: !!env.API_FOOTBALL_KEY, restantes, esgotado: Date.now() < bloqueadoAte });
    if (path !== "/ao-vivo") return json({ erro: "rota desconhecida", rotas: ["/ao-vivo", "/saude"] }, 404);
    if (!env.API_FOOTBALL_KEY) return json({ erro: "chave API_FOOTBALL_KEY não configurada", games: [] }, 503);
    if (Date.now() < bloqueadoAte) return json({ esgotado: true, games: [] }, 503);
    try {
      return json(await aoVivo(env));
    } catch (e) {
      return json({ erro: String(e.message || e), esgotado: Date.now() < bloqueadoAte, games: [] }, 503);
    }
  },
};
