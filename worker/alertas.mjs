/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — alertas do clube favorito: gol, início, intervalo, escalação e fim de jogo (Web Push, grátis)

   1) O site inscreve o navegador (POST /alerta: inscrição do Push + lista de clubes). Fica na tabela alertas do D1.
   2) A cada minuto (cron "* * * * *"), verificaGols() lê os placares da ESPN dos campeonatos dos 20 clubes. Placar que
      aumentou para um clube do site vira uma linha na tabela gols ("GOL do Cruzeiro! Cruzeiro 1 x 0 Atlético-MG").
      O primeiro placar visto de um jogo só é guardado (não avisa gol antigo). A mudança de estado do jogo (pre -> in ->
      ht -> post) vira aviso de início, intervalo e fim; perto do jogo, os titulares do resumo da ESPN viram o aviso de
      escalação. Cada inscrição escolhe os tipos que quer (coluna tipos).
   3) enviaPushes() manda um aviso SEM conteúdo para cada inscrito daquele clube (até ENVIOS_POR_MINUTO por vez: o plano
      grátis permite 50 pedidos externos por execução; o resto vai no minuto seguinte, pelo cursor do gol).
   4) O service worker do site (sw.js) recebe o aviso, busca GET /gols/recentes e mostra a notificação dos clubes que
      a pessoa segue. Aviso sem conteúdo dispensa criptografar a mensagem (só a assinatura VAPID).
   Segredos do Worker: VAPID_PRIVADA (chave privada em JWK) e VAPID_PUBLICA (pública, base64url) — worker/gerar-vapid.mjs.
   ========================================================================== */

// id do time na ESPN -> clube do site (os 20 da Série A)
export const CLUBE_POR_ESPN = { 3458: "athletico-pr", 7632: "atletico-mg", 9967: "bahia", 6086: "botafogo", 6079: "bragantino", 9318: "chapecoense",
  874: "corinthians", 3456: "coritiba", 2022: "cruzeiro", 819: "flamengo", 3445: "fluminense", 6273: "gremio", 1936: "internacional", 9169: "mirassol",
  2029: "palmeiras", 4936: "remo", 2674: "santos", 2026: "sao-paulo", 3454: "vasco", 3457: "vitoria" };
const CLUBES = new Set(Object.values(CLUBE_POR_ESPN));
const LIGAS = ["bra.1", "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana"];
const ESTADUAIS = ["bra.camp.paulista", "bra.camp.carioca", "bra.camp.mineiro", "bra.camp.gaucho"]; // de janeiro a abril
// destinos aceitos: só os serviços de push dos navegadores (ninguém usa o Worker para chamar outro site)
export const PUSH_OK = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)\//;
export const ENVIOS_POR_MINUTO = 30; // + até 8 placares, 4 escalações e 6 avisos do bolão: cabe nos 50 pedidos externos
// tipos de aviso que o torcedor escolhe (o mesmo para todos os clubes que segue)
export const TIPOS = ["gol", "inicio", "intervalo", "escalacao", "fim"];
// escalação: procurada a partir de 75 min antes do jogo, no máximo 4 jogos por minuto (cabe nos 50 pedidos externos:
// até 8 placares + 4 escalações + 35 envios)
const ESCALACAO_ANTES = 75 * 60e3, RESUMOS_POR_MINUTO = 4;
const LIGA_NOME = { "bra.1": "Brasileirão", "bra.copa_do_brazil": "Copa do Brasil", "conmebol.libertadores": "Libertadores", "conmebol.sudamericana": "Sul-Americana",
  "bra.camp.paulista": "Paulistão", "bra.camp.carioca": "Carioca", "bra.camp.mineiro": "Mineiro", "bra.camp.gaucho": "Gauchão" };
const SITE = "https://cazestats.pages.dev";

/* ---------- inscrições ---------- */
export async function inscrever(env, txt) {
  if (!txt || txt.length > 4096) return { status: 400, erro: "inscrição inválida" };
  let d;
  try { d = JSON.parse(txt); } catch { return { status: 400, erro: "inscrição inválida" }; }
  const endpoint = String(d?.sub?.endpoint || "");
  if (!PUSH_OK.test(endpoint) || endpoint.length > 600) return { status: 400, erro: "serviço de push não aceito" };
  const clubes = [...new Set((Array.isArray(d.clubes) ? d.clubes : []).map(String))].filter((c) => CLUBES.has(c)).slice(0, 20);
  // o que avisar; sem a lista (site antigo em cache), só gol, como antes
  const pedidos = Array.isArray(d.tipos) ? d.tipos.map(String) : ["gol"];
  const tipos = TIPOS.filter((t) => pedidos.includes(t));
  if (clubes.length && !tipos.length) return { status: 400, erro: "escolha pelo menos um tipo de aviso" };
  const agora = Date.now();
  const ops = [env.DB.prepare("DELETE FROM alertas WHERE endpoint = ?1").bind(endpoint)];
  for (const c of clubes) ops.push(env.DB.prepare("INSERT INTO alertas (endpoint, clube, criado, tipos) VALUES (?1, ?2, ?3, ?4)").bind(endpoint, c, agora, tipos.join(",")));
  await env.DB.batch(ops);
  return { status: 200, clubes, tipos };
}

/* ---------- placares, estado do jogo e escalações ---------- */
const placar = (c) => { const n = parseInt(c?.score?.value ?? c?.score, 10); return Number.isFinite(n) ? n : null; };
function golsDoJogo(ev, liga) {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const casa = comp.competitors?.find((c) => c.homeAway === "home"), fora = comp.competitors?.find((c) => c.homeAway === "away");
  if (!casa || !fora) return null;
  const estado = ev.status?.type?.state || comp.status?.type?.state;
  const nomeStatus = String(ev.status?.type?.name || comp.status?.type?.name || "");
  const nome = (c) => String(c.team?.shortDisplayName || c.team?.displayName || "").slice(0, 40);
  return {
    id: String(ev.id), liga, estado: nomeStatus === "STATUS_HALFTIME" ? "ht" : estado, inicio: Date.parse(ev.date || comp.date || "") || null,
    relogio: String(ev.status?.displayClock || comp.status?.displayClock || "").slice(0, 10),
    casa: { clube: CLUBE_POR_ESPN[casa.team?.id] || null, espn: String(casa.team?.id || ""), nome: nome(casa), gols: placar(casa) },
    fora: { clube: CLUBE_POR_ESPN[fora.team?.id] || null, espn: String(fora.team?.id || ""), nome: nome(fora), gols: placar(fora) },
    autores: (comp.details || []).filter((x) => x.scoringPlay).map((x) => ({ time: String(x.team?.id || ""), nome: String(x.athletesInvolved?.[0]?.shortName || x.athletesInvolved?.[0]?.displayName || "").slice(0, 40), min: String(x.clock?.displayValue || "").slice(0, 8) })),
  };
}
export function ligasDoDia(data = new Date()) {
  const mes = data.getUTCMonth() + 1;
  return mes <= 4 ? [...LIGAS, ...ESTADUAIS] : LIGAS;
}
const hora = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
// resultado do ponto de vista de um lado: "Vitória do Cruzeiro" / "Derrota do Cruzeiro" / "Empate"
function resultado(meu, outro, final) {
  if (meu.gols === outro.gols) return final ? "Empate" : "Empate no 1º tempo";
  const ganha = meu.gols > outro.gols;
  return final ? `${ganha ? "Vitória" : "Derrota"} do ${meu.nome}` : `${meu.nome} ${ganha ? "vence" : "perde"} no 1º tempo`;
}

/* lê os placares da ESPN e transforma o que mudou em avisos (tabela gols): gol, início, intervalo, fim e escalação.
   O primeiro estado visto de um jogo só é guardado: nada de avisar o que aconteceu antes. */
export async function verificaGols(env, buscar = fetch, agora = Date.now()) {
  // ninguém inscrito: nem consulta a ESPN (economiza pedidos e CPU do plano grátis a cada minuto)
  if (!(await env.DB.prepare("SELECT 1 AS x FROM alertas LIMIT 1").first())) return 0;
  const ligas = ligasDoDia(new Date(agora));
  const respostas = await Promise.all(ligas.map((lg) =>
    buscar(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard`, { headers: { accept: "application/json" }, cf: { cacheTtl: 20 } })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  const jogos = respostas.flatMap((d, k) => (d?.events || []).map((ev) => golsDoJogo(ev, ligas[k])))
    .filter((j) => j && (j.casa.clube || j.fora.clube) && ["pre", "in", "ht", "post"].includes(j.estado));
  if (!jogos.length) return 0;
  const ids = jogos.map((j) => j.id);
  const { results } = await env.DB.prepare(`SELECT jogo, casa, fora, estado, escalacao FROM placares WHERE jogo IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`).bind(...ids).all();
  const antes = Object.fromEntries((results || []).map((r) => [r.jogo, r]));
  const ops = [];
  let novos = 0;
  const aviso = (j, lado, tipo, titulo, corpo, id = `${j.id}:${tipo}:${lado.clube}`) => {
    ops.push(env.DB.prepare("INSERT OR IGNORE INTO gols (id, clube, jogo, titulo, corpo, quando, cursor, tipo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', ?7)")
      .bind(id, lado.clube, j.id, titulo.slice(0, 90), corpo.slice(0, 170), agora, tipo));
    novos++;
  };
  for (const j of jogos) {
    const gc = j.casa.gols ?? 0, gf = j.fora.gols ?? 0, a = antes[j.id];
    if (a && a.casa === gc && a.fora === gf && a.estado === j.estado) continue;
    ops.push(env.DB.prepare("INSERT INTO placares (jogo, casa, fora, quando, estado) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(jogo) DO UPDATE SET casa = ?2, fora = ?3, quando = ?4, estado = ?5")
      .bind(j.id, gc, gf, agora, j.estado));
    if (!a) continue; // primeira vez que o jogo aparece: só guarda
    const liga = LIGA_NOME[j.liga] || "";
    const placarTxt = `${j.casa.nome} ${gc} x ${gf} ${j.fora.nome}`;
    const lados = [[j.casa, j.fora, a.casa], [j.fora, j.casa, a.fora]].filter(([l]) => l.clube);
    for (const [lado, , ant] of lados) {
      if (j.estado === "pre" || (lado.gols ?? 0) <= ant) continue;
      const autor = j.autores.filter((x) => x.time === lado.espn).at(-1);
      aviso(j, lado, "gol", `GOL do ${lado.nome}!`, `${placarTxt}${autor?.nome ? ` · ${autor.nome}${autor.min ? ` (${autor.min})` : ""}` : j.relogio ? ` · ${j.relogio}` : ""}`,
        `${j.id}:${gc}-${gf}:${lado.clube}`);
    }
    const comGols = (l) => ({ ...l, gols: l.gols ?? 0 });
    for (const [lado, outro] of lados) {
      // estado '' = jogo visto antes desta versão: sem estado anterior confiável, não avisa a mudança
      if (a.estado === "pre" && (j.estado === "in" || j.estado === "ht")) aviso(j, lado, "inicio", `Começou: ${j.casa.nome} x ${j.fora.nome}`, `Bola rolando${liga ? ` · ${liga}` : ""}`);
      if (j.estado === "ht" && (a.estado === "pre" || a.estado === "in")) aviso(j, lado, "intervalo", `Intervalo: ${placarTxt}`, resultado(comGols(lado), comGols(outro), false));
      if (j.estado === "post" && (a.estado === "in" || a.estado === "ht")) aviso(j, lado, "fim", `Fim de jogo: ${placarTxt}`, `${resultado(comGols(lado), comGols(outro), true)}${liga ? ` · ${liga}` : ""}`);
    }
  }
  novos += await escalacoes(env, buscar, agora, jogos, antes, ops);
  if (ops.length) await env.DB.batch(ops);
  return novos;
}

/* escalação confirmada: a partir de 75 min antes do jogo, procura os titulares no resumo do jogo da ESPN.
   Só para clubes com alguém inscrito nesse aviso; cada lado avisa uma vez (bits na coluna escalacao). */
async function escalacoes(env, buscar, agora, jogos, antes, ops) {
  const perto = jogos.filter((j) => j.estado === "pre" && j.inicio && j.inicio - agora <= ESCALACAO_ANTES && j.inicio - agora > -15 * 60e3 && antes[j.id]);
  if (!perto.length) return 0;
  const { results } = await env.DB.prepare("SELECT DISTINCT clube FROM alertas WHERE instr(',' || tipos || ',', ',escalacao,') > 0").all();
  const querem = new Set((results || []).map((r) => r.clube));
  const bitDe = (j, l) => (l === j.casa ? 1 : 2);
  const fila = perto.filter((j) => [j.casa, j.fora].some((l) => querem.has(l.clube) && !(antes[j.id].escalacao & bitDe(j, l)))).slice(0, RESUMOS_POR_MINUTO);
  let novos = 0;
  await Promise.all(fila.map(async (j) => {
    let d = null;
    try {
      const r = await buscar(`https://site.api.espn.com/apis/site/v2/sports/soccer/${j.liga}/summary?event=${encodeURIComponent(j.id)}`, { headers: { accept: "application/json" }, cf: { cacheTtl: 60 } });
      d = r.ok ? await r.json() : null;
    } catch {
      return; // ESPN fora do ar: tenta no próximo minuto
    }
    let bits = antes[j.id].escalacao || 0;
    for (const [lado, outro] of [[j.casa, j.fora], [j.fora, j.casa]]) {
      const bit = bitDe(j, lado);
      if (bits & bit) continue;
      const rost = (d?.rosters || []).find((x) => String(x.team?.id || "") === lado.espn) || (d?.rosters || []).find((x) => x.homeAway === (bit === 1 ? "home" : "away"));
      const titulares = (rost?.roster || []).filter((x) => x.starter).map((x) => String(x.athlete?.shortName || x.athlete?.displayName || "").trim()).filter(Boolean);
      if (titulares.length < 11) continue; // ainda não saiu
      bits |= bit;
      if (!lado.clube || !querem.has(lado.clube)) continue;
      ops.push(env.DB.prepare("INSERT OR IGNORE INTO gols (id, clube, jogo, titulo, corpo, quando, cursor, tipo) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', 'escalacao')")
        .bind(`${j.id}:escalacao:${lado.clube}`, lado.clube, j.id, `Escalação do ${lado.nome}`.slice(0, 90), `x ${outro.nome}, ${hora(j.inicio)}: ${titulares.slice(0, 11).join(", ")}`.slice(0, 170), agora));
      novos++;
    }
    if (bits !== (antes[j.id].escalacao || 0)) ops.push(env.DB.prepare("UPDATE placares SET escalacao = ?1 WHERE jogo = ?2").bind(bits, j.id));
  }));
  return novos;
}

/* ---------- envio (VAPID, aviso sem conteúdo) ---------- */
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const txt64 = (s) => b64url(new TextEncoder().encode(s));
export async function assinatura(env, aud, cache) {
  if (cache[aud]) return cache[aud];
  const chave = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVADA), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const corpo = `${txt64(JSON.stringify({ typ: "JWT", alg: "ES256" }))}.${txt64(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE }))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(corpo));
  return (cache[aud] = `vapid t=${corpo}.${b64url(sig)}, k=${env.VAPID_PUBLICA}`);
}
export async function enviaPushes(env, enviar = fetch) {
  if (!env.VAPID_PRIVADA || !env.VAPID_PUBLICA) return 0;
  const { results: pend } = await env.DB.prepare("SELECT id, clube, cursor, tipo FROM gols WHERE cursor != 'fim' AND quando > ?1 ORDER BY quando").bind(Date.now() - 15 * 60e3).all();
  let orcamento = ENVIOS_POR_MINUTO, enviados = 0;
  const cache = {}, apagar = [], ops = [];
  for (const g of pend || []) {
    if (orcamento <= 0) break;
    const { results: subs } = await env.DB.prepare("SELECT endpoint FROM alertas WHERE clube = ?1 AND endpoint > ?2 AND instr(',' || tipos || ',', ',' || ?4 || ',') > 0 ORDER BY endpoint LIMIT ?3")
      .bind(g.clube, g.cursor || "", orcamento + 1, g.tipo || "gol").all();
    const lote = (subs || []).slice(0, orcamento);
    await Promise.all(lote.map(async ({ endpoint }) => {
      try {
        const r = await enviar(endpoint, { method: "POST", headers: { TTL: "600", Urgency: "high", Authorization: await assinatura(env, new URL(endpoint).origin, cache), "Content-Length": "0" } });
        if (r.status === 404 || r.status === 410) apagar.push(endpoint); // inscrição vencida ou cancelada no navegador
        else if (r.ok) enviados++;
      } catch { /* serviço fora do ar: este aviso se perde, os próximos seguem */ }
    }));
    orcamento -= lote.length;
    const acabou = (subs || []).length <= lote.length;
    ops.push(env.DB.prepare("UPDATE gols SET cursor = ?1 WHERE id = ?2").bind(acabou ? "fim" : lote.at(-1).endpoint, g.id));
  }
  for (const e of apagar) ops.push(env.DB.prepare("DELETE FROM alertas WHERE endpoint = ?1").bind(e));
  if (ops.length) await env.DB.batch(ops);
  return enviados;
}

/* ---------- o que o service worker lê ---------- */
export async function golsRecentes(env) {
  const { results } = await env.DB.prepare("SELECT id, clube, jogo, titulo, corpo, quando, tipo FROM gols WHERE quando > ?1 ORDER BY quando DESC LIMIT 30").bind(Date.now() - 15 * 60e3).all();
  return results || [];
}
export async function limpaGols(env) {
  const antigo = Date.now() - 2 * 864e5;
  await env.DB.batch([env.DB.prepare("DELETE FROM gols WHERE quando < ?1").bind(antigo), env.DB.prepare("DELETE FROM placares WHERE quando < ?1").bind(antigo)]);
}
