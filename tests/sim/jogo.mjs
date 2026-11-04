/* Jogo hipotético para testes: Cruzeiro x Flamengo, comprimido em ~2min40s.
   Gera, para qualquer instante, a resposta que a ESPN e a API-Football dariam. */
export const H = { id: "2022", af: 135, club: "cruzeiro", name: "Cruzeiro" };
export const A = { id: "819", af: 127, club: "flamengo", name: "Flamengo" };
export const ESPN_ID = "999001", AF_ID = 9990001;

// t = segundos reais desde o início da simulação
export const ROTEIRO = [
  { t: 0, kind: "kickoff" },
  { t: 25, kind: "goal", side: "home", player: "Camisa 9", assist: "Camisa 10", min: 12 },
  { t: 40, kind: "yellow", side: "away", player: "Camisa 5", min: 27 },
  { t: 60, kind: "halftime" },
  { t: 85, kind: "second-half" },
  { t: 100, kind: "sub", side: "away", player: "Camisa 7", assist: "Camisa 19", min: 58 },
  { t: 105, kind: "goal", side: "away", player: "Camisa 9", min: 61 },
  { t: 125, kind: "red", side: "away", player: "Camisa 4", min: 74 },
  { t: 140, kind: "penalty-goal", side: "home", player: "Camisa 10", min: 88 },
  { t: 160, kind: "full-time" },
];
export const DURACAO = 160;

/* situação do jogo no instante t */
export function estado(t) {
  const ev = ROTEIRO.filter((e) => e.t <= t);
  const has = (k) => ev.some((e) => e.kind === k);
  const phase = t < 0 ? "pre" : has("full-time") ? "ft" : has("second-half") ? "2h" : has("halftime") ? "ht" : "1h";
  const elapsed = phase === "1h" ? Math.min(45, 1 + Math.floor(t * 45 / 60)) : phase === "2h" ? Math.min(90, 46 + Math.floor((t - 85) * 44 / 75)) : phase === "ht" ? 45 : phase === "ft" ? 90 : null;
  const score = { home: 0, away: 0 };
  ev.forEach((e) => { if (e.kind === "goal" || e.kind === "penalty-goal") score[e.side]++; });
  return { phase, elapsed, score, ev };
}

/* ---------- ESPN ---------- */
const ESPN_STATUS = {
  pre: ["STATUS_SCHEDULED", "pre", "Agendado"], "1h": ["STATUS_FIRST_HALF", "in", "1º tempo"], ht: ["STATUS_HALFTIME", "in", "Intervalo"],
  "2h": ["STATUS_SECOND_HALF", "in", "2º tempo"], ft: ["STATUS_FULL_TIME", "post", "FT"],
};
function espnStatus(s) {
  const [name, state, shortDetail] = ESPN_STATUS[s.phase];
  return { displayClock: s.phase === "ht" ? "45'+2'" : s.elapsed ? `${s.elapsed}'` : "0'", type: { name, state, shortDetail } };
}
export function espnScoreboard(t, kickIso) {
  const s = estado(t);
  return { leagues: [{ calendar: [] }], events: [{ id: ESPN_ID, date: kickIso, competitions: [{
    competitors: [
      { homeAway: "home", team: { id: H.id, displayName: H.name }, score: String(s.score.home) },
      { homeAway: "away", team: { id: A.id, displayName: A.name }, score: String(s.score.away) },
    ], status: espnStatus(s), venue: { fullName: "Mineirão (simulação)" } }] }] };
}
const ESPN_KIND = { kickoff: "kickoff", goal: "goal", "penalty-goal": "penalty---scored", yellow: "yellow-card", red: "red-card", halftime: "halftime", "second-half": "start-2nd-half", sub: "substitution", "full-time": "end-regular-time" };
export function espnSummary(t) {
  const s = estado(t), team = (side) => ({ id: side === "home" ? H.id : A.id });
  return {
    header: { competitions: [{ competitors: [
      { homeAway: "home", team: { id: H.id, displayName: H.name }, score: String(s.score.home) },
      { homeAway: "away", team: { id: A.id, displayName: A.name }, score: String(s.score.away) },
    ], status: espnStatus(s) }] },
    keyEvents: s.ev.map((e) => ({
      type: { type: ESPN_KIND[e.kind] }, clock: { displayValue: e.min ? `${e.min}'` : e.kind === "halftime" ? "45'+2'" : e.kind === "full-time" ? "90'+4'" : "" },
      team: e.side ? team(e.side) : undefined, scoringPlay: e.kind === "goal" || e.kind === "penalty-goal",
      // substituição na ESPN: primeiro quem entra, depois quem sai
      participants: e.kind === "sub" ? [{ athlete: { displayName: e.assist } }, { athlete: { displayName: e.player } }]
        : [e.player, e.assist].filter(Boolean).map((n) => ({ athlete: { displayName: n } })),
    })),
  };
}

/* ---------- API-Football ---------- */
const AF_SHORT = { pre: "NS", "1h": "1H", ht: "HT", "2h": "2H", ft: "FT" };
export function apiFootballFixture(t, kickMs, withEvents = true) {
  const s = estado(t), team = (side) => (side === "home" ? { id: H.af, name: H.name } : { id: A.af, name: A.name });
  const AF_EV = { goal: ["Goal", "Normal Goal"], "penalty-goal": ["Goal", "Penalty"], yellow: ["Card", "Yellow Card"], red: ["Card", "Red Card"], sub: ["subst", "Substitution 1"] };
  return {
    fixture: { id: AF_ID, timestamp: Math.floor(kickMs / 1000), status: { short: AF_SHORT[s.phase], elapsed: s.elapsed, extra: s.phase === "ht" ? 2 : null } },
    league: { id: 71, name: "Serie A", country: "Brazil" },
    teams: { home: team("home"), away: team("away") },
    goals: { home: s.phase === "pre" ? null : s.score.home, away: s.phase === "pre" ? null : s.score.away },
    events: withEvents ? s.ev.filter((e) => AF_EV[e.kind]).map((e) => ({
      time: { elapsed: e.min, extra: null }, team: team(e.side), player: { name: e.player }, assist: { name: e.assist || null },
      type: AF_EV[e.kind][0], detail: AF_EV[e.kind][1],
    })) : undefined,
  };
}
