/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — bolão: palpite de placar com pontos, ranking geral e ligas entre amigos

   Precisa da conta (Entrar com Google, worker/conta.mjs). No ranking aparece só o APELIDO que o torcedor escolhe:
   nada de nome, e-mail ou foto do Google.
     GET  /bolao/eu                   apelido, pontos, palpites (com os pontos de cada jogo encerrado) e ligas
     PUT  /bolao/apelido {apelido}
     PUT  /bolao/palpite {jogo, casa, fora}   só antes do início do jogo (conferido pelo horário na tabela jogos)
     GET  /bolao/ranking[?liga=COD]   ranking geral (top 100 + a sua posição) ou de uma liga
     POST /bolao/liga {nome}          cria uma liga e devolve o código de convite
     POST /bolao/liga/entrar {codigo} | POST /bolao/liga/sair {codigo}
   Pontos (calculados pelo servidor, com o placar da tabela jogos, que o robô atualiza):
     placar exato 10 · vencedor e saldo de gols certos 7 · só o resultado (vitória ou empate) 5 · errou 0
   ========================================================================== */

export const PONTOS = { exato: 10, saldo: 7, resultado: 5 };
const APELIDO_OK = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,18}[\p{L}\p{N}]$/u;
const CODIGO_LETRAS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I/L, que se confundem ao ditar o código
const CODIGO_OK = /^[A-HJKMNP-Z2-9]{6}$/;
const LIGAS_CRIADAS_MAX = 10, LIGAS_MAX = 20, MEMBROS_MAX = 200, GOLS_MAX = 20;

// pontos de um palpite contra o placar final (a mesma conta do SQL abaixo; usada nos testes e no site)
export function pontos(p, j) {
  if (p.casa === j.casa && p.fora === j.fora) return PONTOS.exato;
  const sinal = (a, b) => Math.sign(a - b);
  if (sinal(p.casa, p.fora) !== sinal(j.casa, j.fora)) return 0;
  return p.casa !== p.fora && p.casa - p.fora === j.casa - j.fora ? PONTOS.saldo : PONTOS.resultado;
}
const PONTOS_SQL = `CASE
    WHEN p.casa = j.gols_casa AND p.fora = j.gols_fora THEN ${PONTOS.exato}
    WHEN ((p.casa > p.fora) - (p.casa < p.fora)) <> ((j.gols_casa > j.gols_fora) - (j.gols_casa < j.gols_fora)) THEN 0
    WHEN p.casa <> p.fora AND p.casa - p.fora = j.gols_casa - j.gols_fora THEN ${PONTOS.saldo}
    ELSE ${PONTOS.resultado} END`;
// somas por torcedor; com "jogos" (ranking de uma rodada), só os jogos da lista (placeholders a partir de ?inicio)
const totais = (jogos = [], inicio = 1) => `WITH pts AS (SELECT p.usuario, ${PONTOS_SQL} AS pt FROM palpites p JOIN jogos j ON j.id = p.jogo
    WHERE j.estado = 'post' AND j.gols_casa IS NOT NULL AND j.gols_fora IS NOT NULL${jogos.length ? ` AND p.jogo IN (${jogos.map((_, i) => `?${inicio + i}`).join(",")})` : ""}),
  tot AS (SELECT usuario, SUM(pt) AS pontos, SUM(pt = ${PONTOS.exato}) AS exatos, COUNT(*) AS jogos FROM pts GROUP BY usuario)`;
const TOTAIS = totais();

const corpoJSON = (txt) => { try { return JSON.parse(txt || ""); } catch { return null; } };
const erro = (status, msg) => ({ status, erro: msg });
// início do jogo: data e hora de Brasília (UTC-3); sem hora definida, vale o começo do dia
const inicioDo = (j) => Date.parse(`${j.data}T${/^\d{2}:\d{2}$/.test(j.hora || "") ? j.hora : "00:00"}:00-03:00`);

async function apelidoDe(env, usuario) {
  return (await env.DB.prepare("SELECT apelido FROM apelidos WHERE usuario = ?1").bind(usuario).first())?.apelido || null;
}

/* conquistas (medalhas) e números do torcedor, pelos palpites e placares finais */
export const MEDALHAS = [
  { id: "exato-1", nome: "Na mosca", desc: "Acertou o primeiro placar exato", ok: (s) => s.exatos >= 1 },
  { id: "exato-5", nome: "Mira afiada", desc: "5 placares exatos", ok: (s) => s.exatos >= 5 },
  { id: "exato-10", nome: "Vidente", desc: "10 placares exatos", ok: (s) => s.exatos >= 10 },
  { id: "seq-3", nome: "Embalado", desc: "3 jogos seguidos pontuando", ok: (s) => s.maiorSequencia >= 3 },
  { id: "seq-5", nome: "Imparável", desc: "5 jogos seguidos pontuando", ok: (s) => s.maiorSequencia >= 5 },
  { id: "zebra", nome: "Faro de zebra", desc: "Acertou um resultado que menos de 20% dos torcedores acertaram", ok: (s) => s.zebras >= 1 },
  { id: "goleada", nome: "Profeta da goleada", desc: "Placar exato de um jogo com 4 gols ou mais", ok: (s) => s.goleadas >= 1 },
  { id: "fiel-10", nome: "Fiel", desc: "Palpitou em 10 jogos", ok: (s) => s.palpites >= 10 },
  { id: "fiel-30", nome: "Torcedor de arquibancada", desc: "Palpitou em 30 jogos", ok: (s) => s.palpites >= 30 },
  { id: "fiel-50", nome: "Sócio-torcedor", desc: "Palpitou em 50 jogos", ok: (s) => s.palpites >= 50 },
];
export async function numeros(env, usuario) {
  const { results } = await env.DB.prepare(`SELECT p.jogo, p.casa, p.fora, j.gols_casa AS gc, j.gols_fora AS gf, j.estado, j.data, j.hora FROM palpites p
    LEFT JOIN jogos j ON j.id = p.jogo WHERE p.usuario = ?1 ORDER BY j.data, j.hora`).bind(usuario).all();
  const todos = results || [], fim = todos.filter((r) => r.estado === "post" && r.gc != null && r.gf != null);
  const sinal = (a, b) => Math.sign(a - b);
  // quantos acertaram o resultado de cada jogo encerrado em que o torcedor palpitou
  const { results: share } = await env.DB.prepare(`SELECT p.jogo, COUNT(*) AS total, SUM(((p.casa > p.fora) - (p.casa < p.fora)) = ((j.gols_casa > j.gols_fora) - (j.gols_casa < j.gols_fora))) AS acertos
    FROM palpites p JOIN jogos j ON j.id = p.jogo WHERE j.estado = 'post' AND j.gols_casa IS NOT NULL AND p.jogo IN (SELECT jogo FROM palpites WHERE usuario = ?1) GROUP BY p.jogo`).bind(usuario).all();
  const acerto = new Map((share || []).map((r) => [r.jogo, r]));
  let seq = 0, maior = 0, exatos = 0, pontuou = 0, zebras = 0, goleadas = 0, pts = 0;
  for (const r of fim) {
    const pt = pontos({ casa: r.casa, fora: r.fora }, { casa: r.gc, fora: r.gf });
    pts += pt;
    if (pt > 0) { seq++; pontuou++; } else seq = 0;
    maior = Math.max(maior, seq);
    if (pt === PONTOS.exato) { exatos++; if (r.gc + r.gf >= 4) goleadas++; }
    const a = acerto.get(r.jogo);
    if (pt > 0 && sinal(r.casa, r.fora) === sinal(r.gc, r.gf) && a && a.total >= 5 && a.acertos / a.total < 0.2) zebras++;
  }
  const s = { palpites: todos.length, encerrados: fim.length, pontos: pts, exatos, aproveitamento: fim.length ? Math.round((pontuou / fim.length) * 100) : 0, sequencia: seq, maiorSequencia: maior, zebras, goleadas };
  return { ...s, conquistas: MEDALHAS.map((m) => ({ id: m.id, nome: m.nome, desc: m.desc, ganhou: m.ok(s) })) };
}

export async function eu(env, usuario) {
  const apelido = await apelidoDe(env, usuario);
  const { results: palps } = await env.DB.prepare(`SELECT p.jogo, p.casa, p.fora, j.casa AS time_casa, j.fora AS time_fora, j.data, j.hora, j.estado, j.gols_casa, j.gols_fora,
      CASE WHEN j.estado = 'post' AND j.gols_casa IS NOT NULL AND j.gols_fora IS NOT NULL THEN ${PONTOS_SQL} END AS pontos
    FROM palpites p LEFT JOIN jogos j ON j.id = p.jogo WHERE p.usuario = ?1 ORDER BY j.data DESC, j.hora DESC LIMIT 200`).bind(usuario).all();
  const { results: ligas } = await env.DB.prepare(`SELECT l.codigo, l.nome, l.dono = ?1 AS dono, (SELECT COUNT(*) FROM ligas_membros x WHERE x.codigo = l.codigo) AS membros
    FROM ligas_membros m JOIN ligas l ON l.codigo = m.codigo WHERE m.usuario = ?1 ORDER BY m.entrou`).bind(usuario).all();
  const lista = palps || [];
  return { status: 200, apelido, pontos: lista.reduce((s, p) => s + (p.pontos || 0), 0), palpites: lista, ligas: (ligas || []).map((l) => ({ ...l, dono: !!l.dono })), numeros: await numeros(env, usuario) };
}

export async function gravaApelido(env, usuario, txt) {
  const apelido = String(corpoJSON(txt)?.apelido ?? "").trim().replace(/\s+/g, " ");
  if (!APELIDO_OK.test(apelido)) return erro(400, "O apelido precisa de 3 a 20 letras ou números (pode ter espaço, ponto, hífen e _).");
  const outro = await env.DB.prepare("SELECT usuario FROM apelidos WHERE apelido = ?1 COLLATE NOCASE").bind(apelido).first();
  if (outro && outro.usuario !== usuario) return erro(409, "Esse apelido já é de outro torcedor. Tente outro.");
  await env.DB.prepare("INSERT INTO apelidos (usuario, apelido, atualizado) VALUES (?1, ?2, ?3) ON CONFLICT(usuario) DO UPDATE SET apelido = ?2, atualizado = ?3")
    .bind(usuario, apelido, Date.now()).run();
  return { status: 200, apelido };
}

export async function gravaPalpite(env, usuario, txt, agora = Date.now()) {
  const d = corpoJSON(txt);
  const jogo = String(d?.jogo ?? ""), casa = Number(d?.casa), fora = Number(d?.fora);
  if (!/^\d{1,12}$/.test(jogo)) return erro(400, "Jogo inválido.");
  if (![casa, fora].every((n) => Number.isInteger(n) && n >= 0 && n <= GOLS_MAX)) return erro(400, `O placar vai de 0 a ${GOLS_MAX} gols para cada time.`);
  const j = await env.DB.prepare("SELECT data, hora, estado FROM jogos WHERE id = ?1").bind(jogo).first();
  if (!j) return erro(404, "Esse jogo ainda não está na tabela do bolão.");
  if (j.estado !== "pre" || !(inicioDo(j) > agora)) return erro(409, "O jogo já começou: palpites encerrados.");
  await env.DB.prepare("INSERT INTO palpites (usuario, jogo, casa, fora, criado, atualizado) VALUES (?1, ?2, ?3, ?4, ?5, ?5) ON CONFLICT(usuario, jogo) DO UPDATE SET casa = ?3, fora = ?4, atualizado = ?5")
    .bind(usuario, jogo, casa, fora, agora).run();
  return { status: 200, jogo, casa, fora };
}

/* ranking: geral (só quem já escolheu apelido e tem jogo encerrado) ou da liga (todos os membros, mesmo com 0) */
/* ---------- totais guardados (escala): o ranking geral e o das ligas leem bolao_totais ----------
   Quando um jogo com palpites acaba (ou tem o placar corrigido), os totais de quem palpitou nele são refeitos a partir
   dos palpites: refazer em vez de somar mantém o número certo mesmo se o placar mudar ou a conta rodar duas vezes.
   Roda no agendador (a cada 5 minutos) e antes de montar um ranking que não está no cache. */
const DIAS_RECONTA = 4; // placar corrigido depois disso não é recontado sozinho (raríssimo)
const REFAZ = (filtro) => `INSERT OR REPLACE INTO bolao_totais (usuario, pontos, exatos, jogos, atualizado)
  SELECT p.usuario, SUM(${PONTOS_SQL}), SUM((${PONTOS_SQL}) = ${PONTOS.exato}), COUNT(*), ?1 FROM palpites p JOIN jogos j ON j.id = p.jogo
  WHERE j.estado = 'post' AND j.gols_casa IS NOT NULL AND j.gols_fora IS NOT NULL ${filtro} GROUP BY p.usuario`;
export async function atualizaTotais(env, agora = Date.now()) {
  const primeiraVez = !(await env.DB.prepare("SELECT 1 AS x FROM bolao_contados LIMIT 1").first());
  if (primeiraVez) {
    // primeira vez (ou banco recém-migrado): soma tudo de uma vez e marca todos os jogos encerrados com palpite
    await env.DB.batch([
      env.DB.prepare(REFAZ("")).bind(agora),
      env.DB.prepare(`INSERT OR REPLACE INTO bolao_contados (jogo, gols_casa, gols_fora, contado) SELECT j.id, j.gols_casa, j.gols_fora, ?1 FROM jogos j
        WHERE j.estado = 'post' AND j.gols_casa IS NOT NULL AND j.gols_fora IS NOT NULL AND j.id IN (SELECT DISTINCT jogo FROM palpites)`).bind(agora),
    ]);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM bolao_contados").first();
    if (n?.n) await limpaRanking();
    return n?.n || 0;
  }
  const desde = new Date(agora - DIAS_RECONTA * 864e5).toISOString().slice(0, 10);
  const { results: novos } = await env.DB.prepare(`SELECT j.id, j.gols_casa, j.gols_fora FROM jogos j
    WHERE j.data >= ?1 AND j.estado = 'post' AND j.gols_casa IS NOT NULL AND j.gols_fora IS NOT NULL
      AND EXISTS (SELECT 1 FROM palpites p WHERE p.jogo = j.id)
      AND NOT EXISTS (SELECT 1 FROM bolao_contados c WHERE c.jogo = j.id AND c.gols_casa = j.gols_casa AND c.gols_fora = j.gols_fora)
    LIMIT 40`).bind(desde).all();
  if (!novos?.length) return 0;
  const ids = novos.map((j) => j.id), marcas = ids.map((_, i) => `?${i + 2}`).join(",");
  await env.DB.batch([
    env.DB.prepare(REFAZ(`AND p.usuario IN (SELECT usuario FROM palpites WHERE jogo IN (${marcas}))`)).bind(agora, ...ids),
    ...novos.map((j) => env.DB.prepare("INSERT OR REPLACE INTO bolao_contados (jogo, gols_casa, gols_fora, contado) VALUES (?1, ?2, ?3, ?4)").bind(j.id, j.gols_casa, j.gols_fora, agora)),
  ]);
  await limpaRanking();
  return novos.length;
}
// limpeza diária: totais de quem apagou a conta (sem palpites) saem da tabela
export async function limpaTotais(env) {
  await env.DB.prepare("DELETE FROM bolao_totais WHERE usuario NOT IN (SELECT usuario FROM palpites)").run().catch(() => {});
}
const semTabela = (e) => /no such table/i.test(String(e?.message || e));
// ranking geral pelos totais guardados: os 100 primeiros, o total de torcedores e a posição de quem pediu
async function geralPorTotais(env, usuario) {
  const [{ results: linhas }, tot, eu] = await Promise.all([
    env.DB.prepare(`SELECT a.usuario, a.apelido, t.pontos, t.exatos, t.jogos FROM bolao_totais t JOIN apelidos a ON a.usuario = t.usuario
      ORDER BY t.pontos DESC, t.exatos DESC, t.jogos ASC, a.apelido LIMIT 100`).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM bolao_totais t JOIN apelidos a ON a.usuario = t.usuario").first(),
    usuario ? env.DB.prepare(`SELECT a.apelido, t.pontos, t.exatos, t.jogos,
        (SELECT COUNT(*) FROM bolao_totais o JOIN apelidos b ON b.usuario = o.usuario WHERE o.pontos > t.pontos OR (o.pontos = t.pontos AND o.exatos > t.exatos)) + 1 AS pos
      FROM bolao_totais t JOIN apelidos a ON a.usuario = t.usuario WHERE t.usuario = ?1`).bind(usuario).first() : null,
  ]);
  return { linhas: linhas || [], total: tot?.n || 0, eu };
}

export async function ranking(env, usuario, liga, jogosTxt = "") {
  if (liga && !CODIGO_OK.test(liga)) return erro(400, "Código de liga inválido.");
  // ranking de uma rodada: o site manda os ids dos jogos dela (até 20)
  const jogos = String(jogosTxt || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (jogos.length > 20 || jogos.some((x) => !/^\d{1,12}$/.test(x))) return erro(400, "Lista de jogos inválida.");
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = `https://cache.cazestats.interno/bolao/ranking/${liga || "geral"}/${jogos.join("-") || "todos"}`;
  let linhas = null, nome = null, total = null;
  const hit = cache && (await cache.match(chave));
  if (hit) ({ linhas, nome, total = null } = await hit.json());
  else {
    // totais guardados (geral e ligas); sem a tabela ainda (migração 009 não rodada), soma os palpites como antes
    let guardados = !jogos.length;
    if (guardados) await atualizaTotais(env).catch((e) => { if (semTabela(e)) guardados = false; else console.error("bolão totais:", e?.message); });
    if (guardados && !liga) {
      const g = await geralPorTotais(env, null);
      linhas = g.linhas; total = g.total;
    } else if (guardados && liga) {
      const l = await env.DB.prepare("SELECT nome FROM ligas WHERE codigo = ?1").bind(liga).first();
      if (!l) return erro(404, "Liga não encontrada. Confira o código.");
      nome = l.nome;
      ({ results: linhas } = await env.DB.prepare(`SELECT a.usuario, a.apelido, COALESCE(t.pontos, 0) AS pontos, COALESCE(t.exatos, 0) AS exatos, COALESCE(t.jogos, 0) AS jogos
        FROM ligas_membros m JOIN apelidos a ON a.usuario = m.usuario LEFT JOIN bolao_totais t ON t.usuario = m.usuario WHERE m.codigo = ?1
        ORDER BY pontos DESC, exatos DESC, jogos ASC, a.apelido`).bind(liga).all());
    } else if (liga) {
      const l = await env.DB.prepare("SELECT nome FROM ligas WHERE codigo = ?1").bind(liga).first();
      if (!l) return erro(404, "Liga não encontrada. Confira o código.");
      nome = l.nome;
      ({ results: linhas } = await env.DB.prepare(`${totais(jogos, 2)} SELECT a.usuario, a.apelido, COALESCE(t.pontos, 0) AS pontos, COALESCE(t.exatos, 0) AS exatos, COALESCE(t.jogos, 0) AS jogos
        FROM ligas_membros m JOIN apelidos a ON a.usuario = m.usuario LEFT JOIN tot t ON t.usuario = m.usuario WHERE m.codigo = ?1
        ORDER BY pontos DESC, exatos DESC, jogos ASC, a.apelido`).bind(liga, ...jogos).all());
    } else {
      ({ results: linhas } = await env.DB.prepare(`${totais(jogos, 1)} SELECT a.usuario, a.apelido, t.pontos, t.exatos, t.jogos FROM tot t JOIN apelidos a ON a.usuario = t.usuario
        ORDER BY t.pontos DESC, t.exatos DESC, t.jogos ASC, a.apelido LIMIT 5000`).bind(...jogos).all());
    }
    linhas = linhas || [];
    if (cache) await cache.put(chave, new Response(JSON.stringify({ linhas, nome, total }), { headers: { "cache-control": "public, max-age=60" } }));
  }
  // posição com empate: quem tem os mesmos pontos e placares exatos divide a posição
  let pos = 0;
  const comPos = linhas.map((r, i) => {
    if (i === 0 || r.pontos !== linhas[i - 1].pontos || r.exatos !== linhas[i - 1].exatos) pos = i + 1;
    return { pos, apelido: r.apelido, pontos: r.pontos, exatos: r.exatos, jogos: r.jogos, voce: !!usuario && r.usuario === usuario };
  });
  let voce = comPos.find((r) => r.voce) || null;
  // geral pelos totais: só os 100 primeiros vêm da lista; quem está abaixo recebe a posição contada no banco
  if (total != null && usuario && !voce) {
    const eu = (await geralPorTotais(env, usuario).catch(() => null))?.eu;
    if (eu) voce = { pos: eu.pos, apelido: eu.apelido, pontos: eu.pontos, exatos: eu.exatos, jogos: eu.jogos, voce: true };
  }
  return { status: 200, liga: liga || null, nome, rodada: jogos.length > 0, total: total ?? comPos.length, linhas: comPos.slice(0, 100), voce };
}
export async function limpaRanking(liga) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) await Promise.all(["geral", liga].filter(Boolean).map((x) => cache.delete(`https://cache.cazestats.interno/bolao/ranking/${x}/todos`)));
}

export async function criaLiga(env, usuario, txt) {
  if (!(await apelidoDe(env, usuario))) return erro(409, "Escolha um apelido antes de criar uma liga.");
  const nome = String(corpoJSON(txt)?.nome ?? "").trim().replace(/\s+/g, " ");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,'!&()-]{1,38}[\p{L}\p{N}.!)]$/u.test(nome)) return erro(400, "O nome da liga precisa de 3 a 40 letras ou números.");
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM ligas WHERE dono = ?1").bind(usuario).first();
  if (n >= LIGAS_CRIADAS_MAX) return erro(409, `Você já criou ${LIGAS_CRIADAS_MAX} ligas.`);
  if ((await env.DB.prepare("SELECT COUNT(*) AS n FROM ligas_membros WHERE usuario = ?1").bind(usuario).first()).n >= LIGAS_MAX) return erro(409, `Você já está em ${LIGAS_MAX} ligas.`);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const codigo = [...bytes].map((b) => CODIGO_LETRAS[b % CODIGO_LETRAS.length]).join("");
    if (await env.DB.prepare("SELECT 1 AS x FROM ligas WHERE codigo = ?1").bind(codigo).first()) continue;
    const agora = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ligas (codigo, nome, dono, criado) VALUES (?1, ?2, ?3, ?4)").bind(codigo, nome, usuario, agora),
      env.DB.prepare("INSERT INTO ligas_membros (codigo, usuario, entrou) VALUES (?1, ?2, ?3)").bind(codigo, usuario, agora),
    ]);
    return { status: 200, codigo, nome };
  }
  return erro(503, "Não deu para gerar o código agora. Tente de novo.");
}

export async function entraLiga(env, usuario, txt) {
  if (!(await apelidoDe(env, usuario))) return erro(409, "Escolha um apelido antes de entrar numa liga.");
  const codigo = String(corpoJSON(txt)?.codigo ?? "").trim().toUpperCase();
  if (!CODIGO_OK.test(codigo)) return erro(400, "O código tem 6 letras e números.");
  const l = await env.DB.prepare("SELECT nome, (SELECT COUNT(*) FROM ligas_membros WHERE codigo = ?1) AS membros FROM ligas WHERE codigo = ?1").bind(codigo).first();
  if (!l) return erro(404, "Liga não encontrada. Confira o código.");
  if (await env.DB.prepare("SELECT 1 AS x FROM ligas_membros WHERE codigo = ?1 AND usuario = ?2").bind(codigo, usuario).first()) return { status: 200, codigo, nome: l.nome };
  if (l.membros >= MEMBROS_MAX) return erro(409, `Essa liga já tem ${MEMBROS_MAX} participantes.`);
  if ((await env.DB.prepare("SELECT COUNT(*) AS n FROM ligas_membros WHERE usuario = ?1").bind(usuario).first()).n >= LIGAS_MAX) return erro(409, `Você já está em ${LIGAS_MAX} ligas.`);
  await env.DB.prepare("INSERT INTO ligas_membros (codigo, usuario, entrou) VALUES (?1, ?2, ?3)").bind(codigo, usuario, Date.now()).run();
  await limpaRanking(codigo);
  return { status: 200, codigo, nome: l.nome };
}

export async function saiLiga(env, usuario, txt) {
  const codigo = String(corpoJSON(txt)?.codigo ?? "").trim().toUpperCase();
  if (!CODIGO_OK.test(codigo)) return erro(400, "Código inválido.");
  await env.DB.prepare("DELETE FROM ligas_membros WHERE codigo = ?1 AND usuario = ?2").bind(codigo, usuario).run();
  // liga sem ninguém deixa de existir
  await env.DB.prepare("DELETE FROM ligas WHERE codigo = ?1 AND NOT EXISTS (SELECT 1 FROM ligas_membros WHERE codigo = ?1)").bind(codigo).run();
  await limpaRanking(codigo);
  return { status: 200 };
}

/* LGPD: apagar a conta também apaga palpites, apelido e participação em ligas (ligas que ficam vazias somem) */
export function apagaDoBolao(env, usuario) {
  return [
    env.DB.prepare("DELETE FROM palpites WHERE usuario = ?1").bind(usuario),
    env.DB.prepare("DELETE FROM bolao_push WHERE usuario = ?1").bind(usuario),
    env.DB.prepare("DELETE FROM bolao_avisos WHERE usuario = ?1").bind(usuario),
    env.DB.prepare("DELETE FROM apelidos WHERE usuario = ?1").bind(usuario),
    env.DB.prepare("DELETE FROM ligas_membros WHERE usuario = ?1").bind(usuario),
    env.DB.prepare("DELETE FROM ligas WHERE NOT EXISTS (SELECT 1 FROM ligas_membros m WHERE m.codigo = ligas.codigo)"),
  ];
}
