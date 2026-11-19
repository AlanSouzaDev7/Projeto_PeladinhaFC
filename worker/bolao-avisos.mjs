/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — avisos do bolão (Web Push, os mesmos do alerta de gol)
     · lembrete: cerca de 1 hora antes de cada jogo dos clubes favoritos (a estrela do site, sincronizada na conta),
       para quem ainda não deu palpite naquele jogo
     · pontos: quando o jogo termina, os pontos que o palpite fez
   Os avisos são da CONTA (não de um clube): POST /bolao/avisar liga ou desliga o aparelho; o service worker (sw.js)
   busca os avisos recentes da conta dona daquele aparelho (POST /bolao/avisos/recentes) e mostra.
   A cada 5 minutos o cron monta os avisos novos (só consultas no banco); a cada minuto manda até ENVIOS deles.
   ========================================================================== */
import { PUSH_OK, assinatura } from "./alertas.mjs";
import { pontos } from "./bolao.mjs";

export const ENVIOS = 6; // por minuto (o resto do orçamento de 50 pedidos externos é do alerta de gol)
const JANELA = 15 * 60e3, ANTES_MIN = 50 * 60e3, ANTES_MAX = 70 * 60e3;
const corpoJSON = (txt) => { try { return JSON.parse(txt || ""); } catch { return null; } };
const inicioDo = (j) => Date.parse(`${j.data}T${/^\d{2}:\d{2}$/.test(j.hora || "") ? j.hora : "00:00"}:00-03:00`);

/* liga (ou desliga) os avisos do bolão neste aparelho */
export async function avisar(env, usuario, txt) {
  const d = corpoJSON(txt), endpoint = String(d?.sub?.endpoint || "");
  if (!PUSH_OK.test(endpoint) || endpoint.length > 600) return { status: 400, erro: "serviço de push não aceito" };
  if (d.ligar === false) {
    await env.DB.prepare("DELETE FROM bolao_push WHERE endpoint = ?1 AND usuario = ?2").bind(endpoint, usuario).run();
    return { status: 200, ligado: false };
  }
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM bolao_push WHERE usuario = ?1").bind(usuario).first();
  if (n >= 10) return { status: 409, erro: "Avisos do bolão já ligados em 10 aparelhos." };
  await env.DB.prepare("INSERT INTO bolao_push (endpoint, usuario, criado) VALUES (?1, ?2, ?3) ON CONFLICT(endpoint) DO UPDATE SET usuario = ?2")
    .bind(endpoint, usuario, Date.now()).run();
  return { status: 200, ligado: true };
}

/* o service worker pede os avisos da conta dona do aparelho (o endereço de push é o "crachá"; não vale para outro) */
export async function recentes(env, txt) {
  const endpoint = String(corpoJSON(txt)?.endpoint || "");
  if (!PUSH_OK.test(endpoint)) return { status: 400, erro: "aparelho inválido" };
  const { results } = await env.DB.prepare(`SELECT a.id, a.titulo, a.corpo, a.url, a.quando FROM bolao_avisos a JOIN bolao_push p ON p.usuario = a.usuario
    WHERE p.endpoint = ?1 AND a.quando > ?2 ORDER BY a.quando DESC LIMIT 10`).bind(endpoint, Date.now() - JANELA).all();
  return { status: 200, avisos: results || [] };
}

const favoritosDe = (txt) => { try { const v = JSON.parse(txt || "[]"); return new Set(Array.isArray(v) ? v.map(String) : []); } catch { return new Set(); } };
const explica = (p) => (p === 10 ? "placar exato" : p === 7 ? "vencedor e saldo" : p === 5 ? "acertou o resultado" : "não foi dessa vez");

/* monta os avisos novos (lembretes e pontos). Só banco; roda a cada 5 minutos. */
export async function montaAvisos(env, agora = Date.now()) {
  const { results: quem } = await env.DB.prepare(`SELECT DISTINCT p.usuario, s.dados AS favs FROM bolao_push p
    LEFT JOIN salvos s ON s.usuario = p.usuario AND s.chave = 'placar:favs'`).all();
  if (!quem?.length) return 0;
  const hoje = new Date(agora - 3 * 3600e3).toISOString().slice(0, 10), amanha = new Date(agora + 27 * 3600e3).toISOString().slice(0, 10);
  const { results: jogos } = await env.DB.prepare(`SELECT id, data, hora, estado, casa_id, casa, fora_id, fora, gols_casa, gols_fora FROM jogos
    WHERE data BETWEEN ?1 AND ?2`).bind(hoje, amanha).all();
  const ops = [];
  let n = 0;
  const aviso = (id, usuario, titulo, corpo, url) => {
    ops.push(env.DB.prepare("INSERT OR IGNORE INTO bolao_avisos (id, usuario, titulo, corpo, url, quando, cursor) VALUES (?1, ?2, ?3, ?4, ?5, ?6, '')")
      .bind(id, usuario, titulo.slice(0, 90), corpo.slice(0, 170), url, agora));
    n++;
  };
  // lembretes: jogo dos favoritos que começa daqui a ~1 hora, sem palpite
  const perto = (jogos || []).filter((j) => j.estado === "pre" && /^\d{2}:\d{2}$/.test(j.hora || "") && inicioDo(j) - agora >= ANTES_MIN && inicioDo(j) - agora <= ANTES_MAX);
  // pontos: jogo encerrado (até 6 horas depois do início) em que a pessoa palpitou
  const fim = (jogos || []).filter((j) => j.estado === "post" && j.gols_casa != null && j.gols_fora != null && agora - inicioDo(j) < 6 * 3600e3);
  const ids = [...perto, ...fim].map((j) => j.id);
  if (!ids.length) return 0;
  const { results: palps } = await env.DB.prepare(`SELECT DISTINCT p.usuario, p.jogo, p.casa, p.fora FROM palpites p JOIN bolao_push b ON b.usuario = p.usuario
    WHERE p.jogo IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`).bind(...ids).all();
  const palpite = new Map((palps || []).map((p) => [`${p.usuario}|${p.jogo}`, p]));
  for (const q of quem) {
    const favs = favoritosDe(q.favs);
    for (const j of perto) {
      if (!(favs.has(j.casa_id) || favs.has(j.fora_id)) || palpite.has(`${q.usuario}|${j.id}`)) continue;
      aviso(`lembrete:${j.id}:${q.usuario}`, q.usuario, `Falta 1 hora: ${j.casa} x ${j.fora}`, `Você ainda não deu seu palpite no bolão (${j.hora}). Toque para palpitar.`, `#/partida/espn-${j.id}`);
    }
    for (const j of fim) {
      const p = palpite.get(`${q.usuario}|${j.id}`);
      if (!p) continue;
      const pt = pontos(p, { casa: j.gols_casa, fora: j.gols_fora });
      aviso(`pontos:${j.id}:${q.usuario}`, q.usuario, `${pt ? `+${pt} pontos` : "0 ponto"} no bolão`, `${j.casa} ${j.gols_casa} x ${j.gols_fora} ${j.fora} · seu palpite: ${p.casa} x ${p.fora} (${explica(pt)})`, "#/bolao");
    }
  }
  if (ops.length) await env.DB.batch(ops);
  return n;
}

/* envia os avisos pendentes (aviso sem conteúdo; o service worker busca o texto) */
export async function enviaAvisos(env, enviar = fetch, limite = ENVIOS) {
  if (!env.VAPID_PRIVADA || !env.VAPID_PUBLICA) return 0;
  const { results: pend } = await env.DB.prepare("SELECT id, usuario FROM bolao_avisos WHERE cursor != 'fim' AND quando > ?1 ORDER BY quando LIMIT 20").bind(Date.now() - JANELA).all();
  let orcamento = limite, enviados = 0;
  const cache = {}, ops = [], apagar = [];
  for (const a of pend || []) {
    const { results: aps } = await env.DB.prepare("SELECT endpoint FROM bolao_push WHERE usuario = ?1").bind(a.usuario).all();
    const lista = aps || [];
    if (lista.length > orcamento) break; // os aparelhos de uma conta vão juntos; o resto no minuto seguinte
    orcamento -= lista.length;
    await Promise.all(lista.map(async ({ endpoint }) => {
      try {
        const r = await enviar(endpoint, { method: "POST", headers: { TTL: "900", Urgency: "normal", Authorization: await assinatura(env, new URL(endpoint).origin, cache), "Content-Length": "0" } });
        if (r.status === 404 || r.status === 410) apagar.push(endpoint);
        else if (r.ok) enviados++;
      } catch { /* serviço fora do ar: este aviso se perde */ }
    }));
    ops.push(env.DB.prepare("UPDATE bolao_avisos SET cursor = 'fim' WHERE id = ?1").bind(a.id));
  }
  for (const e of apagar) ops.push(env.DB.prepare("DELETE FROM bolao_push WHERE endpoint = ?1").bind(e));
  if (ops.length) await env.DB.batch(ops);
  return enviados;
}
export async function limpaAvisos(env) {
  await env.DB.prepare("DELETE FROM bolao_avisos WHERE quando < ?1").bind(Date.now() - 2 * 864e5).run();
}
