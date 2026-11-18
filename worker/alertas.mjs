/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — alerta de gol do clube favorito (Web Push, grátis)

   1) O site inscreve o navegador (POST /alerta: inscrição do Push + lista de clubes). Fica na tabela alertas do D1.
   2) A cada minuto (cron "* * * * *"), verificaGols() lê os placares da ESPN dos campeonatos dos 20 clubes. Placar que
      aumentou para um clube do site vira uma linha na tabela gols ("GOL do Cruzeiro! Cruzeiro 1 x 0 Atlético-MG").
      O primeiro placar visto de um jogo só é guardado (não avisa gol antigo).
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
const PUSH_OK = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com)\//;
export const ENVIOS_POR_MINUTO = 35;
const SITE = "https://cazestats.pages.dev";

/* ---------- inscrições ---------- */
export async function inscrever(env, txt) {
  if (!txt || txt.length > 4096) return { status: 400, erro: "inscrição inválida" };
  let d;
  try { d = JSON.parse(txt); } catch { return { status: 400, erro: "inscrição inválida" }; }
  const endpoint = String(d?.sub?.endpoint || "");
  if (!PUSH_OK.test(endpoint) || endpoint.length > 600) return { status: 400, erro: "serviço de push não aceito" };
  const clubes = [...new Set((Array.isArray(d.clubes) ? d.clubes : []).map(String))].filter((c) => CLUBES.has(c)).slice(0, 20);
  const agora = Date.now();
  const ops = [env.DB.prepare("DELETE FROM alertas WHERE endpoint = ?1").bind(endpoint)];
  for (const c of clubes) ops.push(env.DB.prepare("INSERT INTO alertas (endpoint, clube, criado) VALUES (?1, ?2, ?3)").bind(endpoint, c, agora));
  await env.DB.batch(ops);
  return { status: 200, clubes };
}

/* ---------- placares e gols ---------- */
const placar = (c) => { const n = parseInt(c?.score?.value ?? c?.score, 10); return Number.isFinite(n) ? n : null; };
function golsDoJogo(ev) {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const casa = comp.competitors?.find((c) => c.homeAway === "home"), fora = comp.competitors?.find((c) => c.homeAway === "away");
  if (!casa || !fora) return null;
  const estado = ev.status?.type?.state || comp.status?.type?.state;
  const nome = (c) => String(c.team?.shortDisplayName || c.team?.displayName || "").slice(0, 40);
  return {
    id: String(ev.id), estado, relogio: String(ev.status?.displayClock || comp.status?.displayClock || "").slice(0, 10),
    casa: { clube: CLUBE_POR_ESPN[casa.team?.id] || null, nome: nome(casa), gols: placar(casa) },
    fora: { clube: CLUBE_POR_ESPN[fora.team?.id] || null, nome: nome(fora), gols: placar(fora) },
    autores: (comp.details || []).filter((x) => x.scoringPlay).map((x) => ({ time: String(x.team?.id || ""), nome: String(x.athletesInvolved?.[0]?.shortName || x.athletesInvolved?.[0]?.displayName || "").slice(0, 40), min: String(x.clock?.displayValue || "").slice(0, 8) })),
  };
}
export function ligasDoDia(data = new Date()) {
  const mes = data.getUTCMonth() + 1;
  return mes <= 4 ? [...LIGAS, ...ESTADUAIS] : LIGAS;
}
export async function verificaGols(env, buscar = fetch) {
  // ninguém inscrito: nem consulta a ESPN (economiza pedidos e CPU do plano grátis a cada minuto)
  if (!(await env.DB.prepare("SELECT 1 AS x FROM alertas LIMIT 1").first())) return 0;
  const respostas = await Promise.all(ligasDoDia().map((lg) =>
    buscar(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard`, { headers: { accept: "application/json" }, cf: { cacheTtl: 20 } })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  const jogos = respostas.flatMap((d) => (d?.events || []).map(golsDoJogo)).filter((j) => j && (j.casa.clube || j.fora.clube) && (j.estado === "in" || j.estado === "post"));
  if (!jogos.length) return 0;
  const ids = jogos.map((j) => j.id);
  const { results } = await env.DB.prepare(`SELECT jogo, casa, fora FROM placares WHERE jogo IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`).bind(...ids).all();
  const antes = Object.fromEntries((results || []).map((r) => [r.jogo, r]));
  const agora = Date.now(), ops = [];
  let novos = 0;
  for (const j of jogos) {
    if (j.casa.gols == null || j.fora.gols == null) continue;
    const a = antes[j.id];
    if (a && a.casa === j.casa.gols && a.fora === j.fora.gols) continue;
    ops.push(env.DB.prepare("INSERT INTO placares (jogo, casa, fora, quando) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(jogo) DO UPDATE SET casa = ?2, fora = ?3, quando = ?4")
      .bind(j.id, j.casa.gols, j.fora.gols, agora));
    if (!a) continue; // primeira vez que o jogo aparece: só guarda (não avisa gol de antes)
    for (const [lado, ant] of [[j.casa, a.casa], [j.fora, a.fora]]) {
      if (!lado.clube || lado.gols <= ant) continue;
      const casaTxt = `${j.casa.nome} ${j.casa.gols} x ${j.fora.gols} ${j.fora.nome}`;
      const espnLado = Object.keys(CLUBE_POR_ESPN).find((k) => CLUBE_POR_ESPN[k] === lado.clube);
      const autor = j.autores.filter((x) => x.time === espnLado).at(-1);
      const id = `${j.id}:${j.casa.gols}-${j.fora.gols}:${lado.clube}`;
      ops.push(env.DB.prepare("INSERT OR IGNORE INTO gols (id, clube, jogo, titulo, corpo, quando, cursor) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '')")
        .bind(id, lado.clube, j.id, `GOL do ${lado.nome}!`, `${casaTxt}${autor?.nome ? ` · ${autor.nome}${autor.min ? ` (${autor.min})` : ""}` : j.relogio ? ` · ${j.relogio}` : ""}`, agora));
      novos++;
    }
  }
  if (ops.length) await env.DB.batch(ops);
  return novos;
}

/* ---------- envio (VAPID, aviso sem conteúdo) ---------- */
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const txt64 = (s) => b64url(new TextEncoder().encode(s));
async function assinatura(env, aud, cache) {
  if (cache[aud]) return cache[aud];
  const chave = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVADA), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const corpo = `${txt64(JSON.stringify({ typ: "JWT", alg: "ES256" }))}.${txt64(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE }))}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, new TextEncoder().encode(corpo));
  return (cache[aud] = `vapid t=${corpo}.${b64url(sig)}, k=${env.VAPID_PUBLICA}`);
}
export async function enviaPushes(env, enviar = fetch) {
  if (!env.VAPID_PRIVADA || !env.VAPID_PUBLICA) return 0;
  const { results: pend } = await env.DB.prepare("SELECT id, clube, cursor FROM gols WHERE cursor != 'fim' AND quando > ?1 ORDER BY quando").bind(Date.now() - 15 * 60e3).all();
  let orcamento = ENVIOS_POR_MINUTO, enviados = 0;
  const cache = {}, apagar = [], ops = [];
  for (const g of pend || []) {
    if (orcamento <= 0) break;
    const { results: subs } = await env.DB.prepare("SELECT endpoint FROM alertas WHERE clube = ?1 AND endpoint > ?2 ORDER BY endpoint LIMIT ?3").bind(g.clube, g.cursor || "", orcamento + 1).all();
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
  const { results } = await env.DB.prepare("SELECT id, clube, jogo, titulo, corpo, quando FROM gols WHERE quando > ?1 ORDER BY quando DESC LIMIT 30").bind(Date.now() - 15 * 60e3).all();
  return results || [];
}
export async function limpaGols(env) {
  const antigo = Date.now() - 2 * 864e5;
  await env.DB.batch([env.DB.prepare("DELETE FROM gols WHERE quando < ?1").bind(antigo), env.DB.prepare("DELETE FROM placares WHERE quando < ?1").bind(antigo)]);
}
