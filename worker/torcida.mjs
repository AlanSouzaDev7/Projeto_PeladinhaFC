/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — voz da torcida: "quem vence?" e Craque do jogo (dados 100% do CazéStats.TV)

   POST /torcida/voto {jogo, tipo: "vencedor"|"craque", escolha, dispositivo}
     vencedor: escolha "1" | "X" | "2", até o jogo começar
     craque:   escolha = id do atleta na ESPN, do início do jogo até 8 horas depois; o nome e o clube vêm do elenco
               oficial da partida (resumo da ESPN, conferido aqui), nunca de texto enviado pelo navegador
   GET  /torcida/<jogo>  -> { vencedor: {"1","X","2"}, craque: [{id, nome, clube, votos}], total }
   Um voto por aparelho (código aleatório guardado no navegador; dá para trocar o voto) e no máximo 6 aparelhos por
   conexão em cada jogo (hash do IP com o jogo: o IP em si não é guardado).
   ========================================================================== */
import { CLUBE_POR_ESPN } from "./alertas.mjs";

const POR_IP = 6, JANELA_CRAQUE = 8 * 3600e3;
const LIGAS = ["bra.1", "bra.copa_do_brazil", "conmebol.libertadores", "conmebol.sudamericana"];
const corpoJSON = (txt) => { try { return JSON.parse(txt || ""); } catch { return null; } };
const inicioDo = (j) => Date.parse(`${j.data}T${/^\d{2}:\d{2}$/.test(j.hora || "") ? j.hora : "00:00"}:00-03:00`);
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha = async (t) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));

/* elenco da partida (titulares e quem entrou), pelo resumo da ESPN; guardado 10 min no cache da borda */
export async function elencoDoJogo(jogo, liga, buscar = fetch) {
  const ligas = liga ? [liga, ...LIGAS.filter((l) => l !== liga)] : LIGAS;
  for (const lg of ligas) {
    const r = await buscar(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${encodeURIComponent(jogo)}`, { headers: { accept: "application/json" }, cf: { cacheTtl: 600 } }).catch(() => null);
    if (!r?.ok) continue;
    const d = await r.json().catch(() => null);
    const out = new Map();
    for (const t of d?.rosters || []) {
      const clube = CLUBE_POR_ESPN[t.team?.id] || null, time = String(t.team?.shortDisplayName || t.team?.displayName || "").slice(0, 40);
      for (const x of t.roster || []) {
        if (!(x.starter || x.subbedIn)) continue;
        const id = String(x.athlete?.id || "");
        if (/^\d{1,12}$/.test(id)) out.set(id, { id, nome: String(x.athlete?.shortName || x.athlete?.displayName || "").slice(0, 40), clube, time });
      }
    }
    if (out.size) return out;
  }
  return new Map();
}

export async function vota(env, txt, ip, buscar = fetch, agora = Date.now()) {
  const d = corpoJSON(txt);
  const jogo = String(d?.jogo ?? ""), tipo = String(d?.tipo ?? ""), escolha = String(d?.escolha ?? ""), disp = String(d?.dispositivo ?? "");
  if (!/^\d{1,12}$/.test(jogo) || !["vencedor", "craque"].includes(tipo)) return { status: 400, erro: "voto inválido" };
  if (!/^[\w-]{16,64}$/.test(disp)) return { status: 400, erro: "aparelho inválido" };
  const j = await env.DB.prepare("SELECT liga, data, hora, estado FROM jogos WHERE id = ?1").bind(jogo).first();
  if (!j) return { status: 404, erro: "jogo fora da tabela" };
  const ini = inicioDo(j);
  let nome = null, clube = null;
  if (tipo === "vencedor") {
    if (!["1", "X", "2"].includes(escolha)) return { status: 400, erro: "escolha 1, X ou 2" };
    if (j.estado !== "pre" || !(ini > agora)) return { status: 409, erro: "A votação de quem vence fecha quando o jogo começa." };
  } else {
    if (!/^\d{1,12}$/.test(escolha)) return { status: 400, erro: "jogador inválido" };
    if (j.estado === "pre" || agora < ini || agora - ini > JANELA_CRAQUE) return { status: 409, erro: "O Craque do jogo abre quando a bola rola e fecha 8 horas depois." };
    const atleta = (await elencoDoJogo(jogo, j.liga, buscar)).get(escolha);
    if (!atleta) return { status: 400, erro: "Esse jogador não está no elenco da partida." };
    ({ nome, clube } = atleta);
  }
  const votante = await sha(`d:${disp}`), conexao = await sha(`ip:${ip || "?"}:${jogo}`);
  const ja = await env.DB.prepare("SELECT 1 AS x FROM torcida_votos WHERE jogo = ?1 AND tipo = ?2 AND votante = ?3").bind(jogo, tipo, votante).first();
  if (!ja) {
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM torcida_votos WHERE jogo = ?1 AND tipo = ?2 AND conexao = ?3").bind(jogo, tipo, conexao).first();
    if (n >= POR_IP) return { status: 429, erro: "Muitos votos desta conexão neste jogo." };
  }
  await env.DB.prepare(`INSERT INTO torcida_votos (jogo, tipo, votante, conexao, escolha, nome, clube, quando) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(jogo, tipo, votante) DO UPDATE SET escolha = ?5, nome = ?6, clube = ?7, quando = ?8`).bind(jogo, tipo, votante, conexao, escolha, nome, clube, agora).run();
  await limpaCache(jogo);
  return { status: 200, ...(await resultado(env, jogo, true)) };
}

export async function resultado(env, jogo, fresco = false) {
  if (!/^\d{1,12}$/.test(jogo)) return { status: 400, erro: "jogo inválido" };
  const cache = typeof caches !== "undefined" ? caches.default : null, chave = `https://cache.cazestats.interno/torcida/${jogo}`;
  if (cache && !fresco) {
    const hit = await cache.match(chave);
    if (hit) return { status: 200, ...(await hit.json()) };
  }
  const { results: v } = await env.DB.prepare("SELECT escolha, COUNT(*) AS n FROM torcida_votos WHERE jogo = ?1 AND tipo = 'vencedor' GROUP BY escolha").bind(jogo).all();
  const { results: c } = await env.DB.prepare(`SELECT escolha AS id, MAX(nome) AS nome, MAX(clube) AS clube, COUNT(*) AS votos FROM torcida_votos
    WHERE jogo = ?1 AND tipo = 'craque' GROUP BY escolha ORDER BY votos DESC, nome LIMIT 8`).bind(jogo).all();
  const vencedor = { 1: 0, X: 0, 2: 0 };
  for (const r of v || []) vencedor[r.escolha] = r.n;
  const craque = c || [];
  const out = { vencedor, totalVencedor: vencedor[1] + vencedor.X + vencedor[2], craque, totalCraque: craque.reduce((s, x) => s + x.votos, 0) };
  if (cache) await cache.put(chave, new Response(JSON.stringify(out), { headers: { "cache-control": "public, max-age=20" } }));
  return { status: 200, ...out };
}
async function limpaCache(jogo) {
  if (typeof caches !== "undefined") await caches.default.delete(`https://cache.cazestats.interno/torcida/${jogo}`);
}
export async function limpaVotos(env) {
  await env.DB.prepare("DELETE FROM torcida_votos WHERE quando < ?1").bind(Date.now() - 400 * 864e5).run(); // guarda a temporada
}
