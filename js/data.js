/* ==========================================================================
   PLACAR — base de dados
   Fatos fixos dos clubes (cidade, fundação, estádio, apelido, cores) são reais.
   Tabela, partidas e estatísticas são SIMULADAS de forma determinística
   (mesma semente = mesmos números), para fins de demonstração do portfólio.
   ========================================================================== */

/* kit: padrão da camisa titular
   solid | vstripes | hoops | sash | band | tri  */
const CLUBS = [
  { id: "athletico-pr", name: "Athletico Paranaense", short: "CAP", abbr: "Athletico", city: "Curitiba", uf: "PR", founded: 1924, stadium: "Ligga Arena", nick: "Furacão", idol: "Sicupira", colors: ["#c8102e", "#111111", "#ffffff"], kit: "hoops", rival: "coritiba" },
  { id: "atletico-mg", name: "Atlético Mineiro", short: "CAM", abbr: "Atlético-MG", city: "Belo Horizonte", uf: "MG", founded: 1908, stadium: "Arena MRV", nick: "Galo", idol: "Reinaldo", colors: ["#111111", "#ffffff", "#c9a54a"], kit: "vstripes", rival: "cruzeiro" },
  { id: "bahia", name: "Bahia", short: "BAH", abbr: "Bahia", city: "Salvador", uf: "BA", founded: 1931, stadium: "Arena Fonte Nova", nick: "Tricolor de Aço", idol: "Bobô", colors: ["#0055a5", "#e30613", "#ffffff"], kit: "tri", rival: "vitoria" },
  { id: "botafogo", name: "Botafogo", short: "BOT", abbr: "Botafogo", city: "Rio de Janeiro", uf: "RJ", founded: 1904, stadium: "Estádio Nilton Santos", nick: "Glorioso", idol: "Garrincha", colors: ["#111111", "#ffffff", "#9a9a9a"], kit: "vstripes", rival: "fluminense" },
  { id: "bragantino", name: "Bragantino", short: "RBB", abbr: "Bragantino", city: "Bragança Paulista", uf: "SP", founded: 1928, stadium: "Nabi Abi Chedid", nick: "Massa Bruta", idol: null, colors: ["#d7182a", "#ffffff", "#0b1f45"], kit: "band", rival: "mirassol" },
  { id: "chapecoense", name: "Chapecoense", short: "CHA", abbr: "Chapecoense", city: "Chapecó", uf: "SC", founded: 1973, stadium: "Arena Condá", nick: "Verdão do Oeste", idol: null, colors: ["#00843d", "#ffffff", "#0a3d22"], kit: "solid", rival: "gremio" },
  { id: "corinthians", name: "Corinthians", short: "COR", abbr: "Corinthians", city: "São Paulo", uf: "SP", founded: 1910, stadium: "Neo Química Arena", nick: "Timão", idol: "Sócrates", colors: ["#ffffff", "#111111", "#b8b8b8"], kit: "solid", rival: "palmeiras" },
  { id: "coritiba", name: "Coritiba", short: "CFC", abbr: "Coritiba", city: "Curitiba", uf: "PR", founded: 1909, stadium: "Couto Pereira", nick: "Coxa", idol: "Alex", colors: ["#00543c", "#ffffff", "#0b2e22"], kit: "hoops", rival: "athletico-pr" },
  { id: "cruzeiro", name: "Cruzeiro", short: "CRU", abbr: "Cruzeiro", city: "Belo Horizonte", uf: "MG", founded: 1921, stadium: "Mineirão", nick: "Raposa", idol: "Tostão", colors: ["#0033a0", "#ffffff", "#5b8cff"], kit: "solid", rival: "atletico-mg" },
  { id: "flamengo", name: "Flamengo", short: "FLA", abbr: "Flamengo", city: "Rio de Janeiro", uf: "RJ", founded: 1895, stadium: "Maracanã", nick: "Mengão", idol: "Zico", colors: ["#e4002b", "#111111", "#ffffff"], kit: "hoops", rival: "vasco" },
  { id: "fluminense", name: "Fluminense", short: "FLU", abbr: "Fluminense", city: "Rio de Janeiro", uf: "RJ", founded: 1902, stadium: "Maracanã", nick: "Tricolor das Laranjeiras", idol: "Castilho", colors: ["#7a1333", "#00664b", "#ffffff"], kit: "vstripes3", rival: "flamengo" },
  { id: "gremio", name: "Grêmio", short: "GRE", abbr: "Grêmio", city: "Porto Alegre", uf: "RS", founded: 1903, stadium: "Arena do Grêmio", nick: "Imortal Tricolor", idol: "Renato Portaluppi", colors: ["#0d80bf", "#111111", "#ffffff"], kit: "vstripes3", rival: "internacional" },
  { id: "internacional", name: "Internacional", short: "INT", abbr: "Internacional", city: "Porto Alegre", uf: "RS", founded: 1909, stadium: "Beira-Rio", nick: "Colorado", idol: "Falcão", colors: ["#e30613", "#ffffff", "#7a0000"], kit: "solid", rival: "gremio" },
  { id: "mirassol", name: "Mirassol", short: "MIR", abbr: "Mirassol", city: "Mirassol", uf: "SP", founded: 1925, stadium: "Maião", nick: "Leão", idol: null, colors: ["#ffd400", "#00843d", "#111111"], kit: "solid", rival: "bragantino" },
  { id: "palmeiras", name: "Palmeiras", short: "PAL", abbr: "Palmeiras", city: "São Paulo", uf: "SP", founded: 1914, stadium: "Allianz Parque", nick: "Verdão", idol: "Ademir da Guia", colors: ["#006437", "#ffffff", "#0b3d24"], kit: "solid", rival: "corinthians" },
  { id: "remo", name: "Remo", short: "REM", abbr: "Remo", city: "Belém", uf: "PA", founded: 1905, stadium: "Baenão", nick: "Leão Azul", idol: null, colors: ["#0b2a5b", "#ffffff", "#3c6fd1"], kit: "solid", rival: "bahia" },
  { id: "santos", name: "Santos", short: "SAN", abbr: "Santos", city: "Santos", uf: "SP", founded: 1912, stadium: "Vila Belmiro", nick: "Peixe", idol: "Pelé", colors: ["#ffffff", "#111111", "#c9c9c9"], kit: "solid", rival: "sao-paulo" },
  { id: "sao-paulo", name: "São Paulo", short: "SAO", abbr: "São Paulo", city: "São Paulo", uf: "SP", founded: 1930, stadium: "MorumBIS", nick: "Tricolor Paulista", idol: "Rogério Ceni", colors: ["#ffffff", "#e30613", "#111111"], kit: "band", rival: "corinthians" },
  { id: "vasco", name: "Vasco da Gama", short: "VAS", abbr: "Vasco", city: "Rio de Janeiro", uf: "RJ", founded: 1898, stadium: "São Januário", nick: "Gigante da Colina", idol: "Roberto Dinamite", colors: ["#111111", "#ffffff", "#c8102e"], kit: "sash", rival: "flamengo" },
  { id: "vitoria", name: "Vitória", short: "VIT", abbr: "Vitória", city: "Salvador", uf: "BA", founded: 1899, stadium: "Barradão", nick: "Leão da Barra", idol: null, colors: ["#e30613", "#111111", "#ffffff"], kit: "hoops", rival: "bahia" },
];

/* Escudos oficiais (Wikimedia, os mesmos usados na Wikipédia em português).
   São marcas registradas dos clubes; usadas aqui só para identificação, sem fins comerciais. */
const CRESTS = {
  "athletico-pr": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/43/Athletico_Paranaense_%28Logo_2019%29.svg/330px-Athletico_Paranaense_%28Logo_2019%29.svg.png",
  "atletico-mg": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/Clube_Atl%C3%A9tico_Mineiro_logo.svg/330px-Clube_Atl%C3%A9tico_Mineiro_logo.svg.png",
  "bahia": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2c/Esporte_Clube_Bahia_logo.svg/330px-Esporte_Clube_Bahia_logo.svg.png",
  "botafogo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/52/Botafogo_de_Futebol_e_Regatas_logo.svg/330px-Botafogo_de_Futebol_e_Regatas_logo.svg.png",
  "bragantino": "https://thumb.wikimedia.org/wikipedia/pt/thumb/9/9e/RedBullBragantino.png/330px-RedBullBragantino.png",
  "chapecoense": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Logo_Associa%C3%A7%C3%A3o_Chapecoense_de_Futebol.svg/330px-Logo_Associa%C3%A7%C3%A3o_Chapecoense_de_Futebol.svg.png",
  "corinthians": "https://thumb.wikimedia.org/wikipedia/pt/thumb/b/b4/Corinthians_simbolo.png/330px-Corinthians_simbolo.png",
  "coritiba": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/Coritiba_Foot_Ball_Club_logo.svg/330px-Coritiba_Foot_Ball_Club_logo.svg.png",
  "cruzeiro": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/90/Cruzeiro_Esporte_Clube_%28logo%29.svg/330px-Cruzeiro_Esporte_Clube_%28logo%29.svg.png",
  "flamengo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/Clube_de_Regatas_do_Flamengo_logo.svg/330px-Clube_de_Regatas_do_Flamengo_logo.svg.png",
  "fluminense": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/12/Fluminense_Football_Club.svg/330px-Fluminense_Football_Club.svg.png",
  "gremio": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Gremio_logo.svg/330px-Gremio_logo.svg.png",
  "internacional": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Sport_Club_Internacional_logo.svg/330px-Sport_Club_Internacional_logo.svg.png",
  "mirassol": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fd/Mirassol_Futebol_Clube_logo_%283_stars%29.png/330px-Mirassol_Futebol_Clube_logo_%283_stars%29.png",
  "palmeiras": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/Sociedade_Esportiva_Palmeiras_logo_%281_red_star%29.svg/330px-Sociedade_Esportiva_Palmeiras_logo_%281_red_star%29.svg.png",
  "remo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/Clube_do_Remo.svg/330px-Clube_do_Remo.svg.png",
  "santos": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0e/Santos_Futebol_Clube_logo_%28with_stars_and_crown%29.png/330px-Santos_Futebol_Clube_logo_%28with_stars_and_crown%29.png",
  "sao-paulo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f4/S%C3%A3o_Paulo_Futebol_Clube_logo_%282022%29.svg/330px-S%C3%A3o_Paulo_Futebol_Clube_logo_%282022%29.svg.png",
  "vasco": "https://thumb.wikimedia.org/wikipedia/pt/thumb/8/8b/EscudoDoVascoDaGama.svg/330px-EscudoDoVascoDaGama.svg.png",
  "vitoria": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Esporte_Clube_Vit%C3%B3ria_%282024%29.svg/330px-Esporte_Clube_Vit%C3%B3ria_%282024%29.svg.png"
};
CLUBS.forEach((c) => (c.logo = CRESTS[c.id]));

/* fotos dos ídolos: imagens livres do Wikimedia Commons (as mesmas da Wikipédia em português) */
const IDOL_PHOTOS = {
  "athletico-pr": "Atletiba_1972.jpg",
  "atletico-mg": "JPP4693_(54137928249)_(cropped).jpg",
  bahia: "Bobô_em_Amigos_de_Neymar_vs._Seleção_Baiana.jpg",
  botafogo: "MFdSantos-Garrincha_(cropped).jpg",
  corinthians: "Socrates87660.jpg",
  cruzeiro: "Tostão_(Eduardo_Gonçalves_de_Andrade,_1970).jpg",
  flamengo: "Zico_2012_3.jpg",
  fluminense: "Castilho,_1956.tif",
  gremio: "Renato_Portaluppi_-_Grêmio.png",
  internacional: "Paulo_Roberto_Falcão,_Roma_1983-84.jpg",
  palmeiras: "WK_74,_training_Brazilie_Ademir_da_Guia,_Bestanddeelnr_927-2956.jpg",
  santos: "Pele_con_brasil_(cropped).jpg",
  "sao-paulo": "Rogerio-Ceni-Sao-Paulo-Juventude-jun-2022_(cropped).jpg",
  vasco: "Roberto_Dinamite_Vasco_da_Gama.jpg",
};
CLUBS.forEach((c) => {
  const f = IDOL_PHOTOS[c.id];
  if (f) c.idolPhoto = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f)}?width=640`;
});

const byId = Object.fromEntries(CLUBS.map((c) => [c.id, c]));

/* ---------- gerador pseudoaleatório com semente (mulberry32) ---------- */
function rng(seed) {
  let s = typeof seed === "string" ? [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7) : seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
/* ---------- tabela REAL do Brasileirão Série A 2026 ----------
   Fonte: CBF (cbf.com.br), classificação oficial de 03/11/2026, 07:02.
   Para atualizar, edite os números abaixo.
   Colunas: id, pontos, jogos, vitórias, empates, derrotas, gols pró, gols contra,
            amarelos, vermelhos, próximo adversário */
const REAL = {
  source: "CBF",
  url: "https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a",
  updated: "03/11/2026 às 07:02",
  round: 34,
  table: [
    ["flamengo", 73, 33, 22, 7, 4, 68, 28, 69, 7, "gremio"],
    ["palmeiras", 70, 33, 20, 10, 3, 56, 22, 72, 7, "remo"],
    ["cruzeiro", 57, 33, 17, 6, 10, 52, 46, 83, 4, "bahia"],
    ["fluminense", 54, 33, 15, 9, 9, 52, 42, 93, 4, "vitoria"],
    ["athletico-pr", 54, 33, 15, 9, 9, 50, 40, 75, 3, "vasco"],
    ["bahia", 53, 33, 14, 11, 8, 48, 42, 84, 4, "cruzeiro"],
    ["atletico-mg", 50, 33, 14, 8, 11, 44, 39, 55, 5, "botafogo"],
    ["bragantino", 47, 34, 13, 8, 13, 44, 39, 86, 5, "vitoria"],
    ["santos", 47, 34, 12, 11, 11, 50, 49, 101, 10, "coritiba"],
    ["sao-paulo", 43, 33, 12, 7, 14, 39, 39, 73, 4, "corinthians"],
    ["coritiba", 42, 33, 11, 9, 13, 40, 50, 61, 10, "santos"],
    ["botafogo", 39, 33, 10, 9, 14, 45, 53, 89, 6, "atletico-mg"],
    ["vasco", 38, 32, 10, 8, 14, 40, 49, 63, 3, "athletico-pr"],
    ["vitoria", 38, 33, 10, 8, 15, 35, 48, 75, 4, "fluminense"],
    ["gremio", 37, 33, 9, 10, 14, 37, 44, 88, 9, "flamengo"],
    ["mirassol", 37, 33, 9, 10, 14, 37, 47, 86, 9, "atletico-mg"],
    ["corinthians", 36, 33, 9, 9, 15, 36, 42, 90, 7, "sao-paulo"],
    ["internacional", 35, 33, 8, 11, 14, 37, 42, 94, 8, "vasco"],
    ["remo", 29, 33, 6, 11, 16, 36, 51, 64, 7, "palmeiras"],
    ["chapecoense", 21, 32, 4, 9, 19, 32, 66, 72, 4, "vasco"],
  ],
  /* artilharia oficial (CBF), top 10 */
  scorers: [
    ["Kevin Viveros", "athletico-pr", 21],
    ["Pedro", "flamengo", 18],
    ["Gabriel Barbosa", "santos", 15],
    ["Kaio Jorge", "cruzeiro", 13],
    ["Samuel Lino", "flamengo", 11],
    ["Luciano Juba", "bahia", 11],
    ["Vinicius", "gremio", 11],
    ["Calleri", "sao-paulo", 10],
    ["Rene", "vitoria", 10],
    ["Danilo Santos", "botafogo", 10],
  ],
};

const ROUND = REAL.round;

/* com jogo rolando, a classificação ao vivo (js/live.js) soma os placares parciais à tabela oficial */
function buildStandings() {
  const L = window.PD && window.PD.aoVivoTabela ? window.PD.aoVivoTabela() : null;
  return (L ? L.rows : REAL.table).map(([id, p, j, w, d, l, gf, ga, ca, cv, next], i) => ({
    id, p, j, w, d, l, gf, ga, ca, cv, next, sg: gf - ga, pos: i + 1, pct: Math.floor((p / (j * 3)) * 100),
    vivo: L ? L.vivo[id] || null : null, mov: L ? L.mov[id] || 0 : 0,
  }));
}

/* ---------- jogos REAIS (fonte: ge.globo / CBF) ----------
   [mandante, visitante, gols mandante, gols visitante, data, hora (Brasília), estádio]
   Placar null = jogo ainda não disputado (ou resultado ainda não lançado aqui). */
const FIXTURES = {
  33: [
    ["fluminense", "internacional", 2, 1, "2026-10-28", null, "Maracanã"],
    ["santos", "palmeiras", 0, 0, "2026-10-28", null, "Vila Belmiro"],
    ["coritiba", "vitoria", 2, 0, null, null, null],
    ["corinthians", "mirassol", 2, 0, null, null, null],
    ["gremio", "athletico-pr", 2, 0, null, null, null],
    ["vasco", "flamengo", 1, 4, null, null, null],
    ["atletico-mg", "cruzeiro", 0, 1, null, null, null],
    ["remo", "botafogo", 2, 1, null, null, null],
    ["bahia", "sao-paulo", 3, 2, null, null, null],
    ["bragantino", "chapecoense", 3, 0, null, null, null],
  ],
  34: [
    ["bragantino", "santos", 2, 1, "2026-11-02", "20:00", "Cícero de Souza Marques"],
    ["chapecoense", "mirassol", null, null, "2026-11-03", "19:30", "Arena Condá"],
    ["internacional", "coritiba", null, null, "2026-11-03", "21:30", "Beira-Rio"],
    ["flamengo", "gremio", null, null, "2026-11-04", "19:30", "Maracanã"],
    ["athletico-pr", "vasco", null, null, "2026-11-04", "19:30", "Arena da Baixada"],
    ["botafogo", "atletico-mg", null, null, "2026-11-04", "21:30", "Nilton Santos"],
    ["sao-paulo", "corinthians", null, null, "2026-11-04", "21:30", "Vila Belmiro"],
    ["palmeiras", "remo", null, null, "2026-11-05", "19:30", "Nubank Parque"],
    ["cruzeiro", "bahia", null, null, "2026-11-05", "21:30", "Mineirão"],
    ["vitoria", "fluminense", null, null, "2026-11-06", "20:00", "Barradão"],
  ],
};
const ROUNDS = Object.keys(FIXTURES).map(Number);

/* status pelo relógio: antes do apito "ns"; até 2h depois "progress"; depois disso, sem placar, "pending" */
function realMatches(round = ROUND, now = Date.now()) {
  return (FIXTURES[round] || []).map(([home, away, hs, as, date, time, venue, espn, live, flag]) => {
    const kick = date && time ? new Date(`${date}T${time}:00-03:00`).getTime() : null;
    // com a API ligada, "live" diz a situação real do jogo; sem ela, a situação sai do relógio
    const status = live ? ({ in: "progress", post: "ft", pre: "ns" }[live.state] || "ns")
      : hs != null ? "ft" : !kick || now < kick ? "ns" : now < kick + 2 * 3600e3 ? "progress" : "pending";
    return { id: `${home}-x-${away}-r${round}`, round, home, away, hs, as, date, time, venue, kick, status, espn, clock: live && live.state === "in" ? live.clock : null, adiado: flag === "adiado", gols: (live && live.gols) || [] };
  });
}

window.PD = { CLUBS, byId, rng, ROUND, ROUNDS, REAL, FIXTURES, buildStandings, realMatches };
