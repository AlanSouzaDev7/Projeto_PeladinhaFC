/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — peças de escala do Worker da Cloudflare (todas no plano gratuito)

   1) Cache compartilhado (E7 do relatório): guardaCompartilhado() usa a Cache API da Cloudflare, comum a todas as
      instâncias do Worker num mesmo data center, no lugar de uma variável em memória (uma por instância).
   2) Repasse da ESPN com cache de borda (E1 e ponto 3): GET /espn/<host>/<caminho> busca na ESPN e guarda a resposta
      por 1 a 2 s (placar) ou 60 s (agenda, elenco). Mil visitantes olhando o mesmo jogo = 1 consulta por segundo à
      ESPN, não 1.250. Só caminhos da ESPN conhecidos passam (lista fixa), e só GET.
   3) Banco de dados D1 (SQLite da Cloudflare, binding DB, opcional) para dados não essenciais:
        buscas      contagem por hora do que se busca no site ("Em alta");
        erros       erros de JavaScript dos visitantes, sem dado pessoal (E5, observabilidade);
        escalacoes  escalações compartilhadas por link curto (até 8 KB de JSON, sem login);
        arquivos    os dados públicos do site (dados/*.json), enviados pelo robô e lidos pelo site (5, abaixo).
      Esquema em worker/schema.sql. Sem o binding, as rotas respondem 503 e o site segue como hoje.
   4) Agendador (ponto 6): o gatilho de cron do Worker dispara o robô do GitHub (workflow_dispatch) a cada 30 min,
      sem depender do agendamento do GitHub, que atrasa horas. Precisa do segredo GITHUB_DISPARO (token só com
      permissão de Actions no repositório).
   ========================================================================== */

/* ---------- 1) cache compartilhado ---------- */
const memoria = new Map(); // reserva quando a Cache API não existe (testes em Node)
export const _cacheCompartilhado = { limpa: () => memoria.clear() }; // testes: simula outro data center
export async function guardaCompartilhado(chave, segundos, produz) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const url = `https://cache.cazestats.interno/${encodeURIComponent(chave)}`;
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return hit.json();
  } else {
    const m = memoria.get(chave);
    if (m && Date.now() - m.t < segundos * 1000) return m.v;
  }
  const v = await produz();
  if (cache) await cache.put(url, new Response(JSON.stringify(v), { headers: { "cache-control": `public, max-age=${Math.max(1, segundos)}`, "content-type": "application/json" } }));
  else memoria.set(chave, { t: Date.now(), v });
  return v;
}

/* ---------- 2) repasse da ESPN ---------- */
const ESPN_HOSTS = new Set(["site.api.espn.com", "site.web.api.espn.com"]);
// caminhos que o site usa (placar do dia, resumo do jogo, tabela, agenda e elenco dos times); nada além disso passa
const ESPN_OK = /^\/apis\/(site\/v2\/sports\/soccer\/[a-z0-9._]+\/(scoreboard|summary|teams(\/[0-9]+(\/(schedule|roster))?)?|news)|v2\/sports\/soccer\/[a-z0-9._]+\/standings|common\/v3\/sports\/soccer\/[a-z0-9._]+\/(athletes|teams)\/[0-9]+(\/[a-z]+)?)$/;
const ESPN_PARAMS = /^[a-zA-Z0-9_.,:=&%-]{0,200}$/;
export function rotaEspn(pathname, search) {
  const m = /^\/espn\/([a-z.]+)(\/apis\/.+)$/.exec(pathname);
  if (!m || !ESPN_HOSTS.has(m[1]) || !ESPN_OK.test(m[2]) || !ESPN_PARAMS.test((search || "").replace(/^\?/, ""))) return null;
  const ttl = /\/(scoreboard|summary)$/.test(m[2]) ? 2 : 60;
  // a ESPN recusa (403) site.web.api.espn.com vindo dos servidores da Cloudflare; site.api.espn.com tem os mesmos
  // caminhos e responde normal (conferido em 18/11/2026)
  return { url: `https://site.api.espn.com${m[2]}${search || ""}`, ttl };
}
export async function repassaEspn(alvo, cors) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(alvo.url);
    if (hit) return new Response(hit.body, { status: hit.status, headers: { ...cors, "cache-control": `public, max-age=${alvo.ttl}`, "x-cache": "HIT" } });
  }
  const r = await fetch(alvo.url, { headers: { accept: "application/json", "user-agent": "CazeStats/1.0 (+https://alansouzadev7.github.io/Projeto_PeladinhaFC/)" }, cf: { cacheTtl: alvo.ttl } });
  const corpo = await r.text();
  if (corpo.length > 3e6) return new Response(JSON.stringify({ erro: "resposta grande demais" }), { status: 502, headers: cors });
  const resp = new Response(corpo, { status: r.ok ? 200 : 502, headers: { ...cors, "cache-control": r.ok ? `public, max-age=${alvo.ttl}` : "no-store", "x-cache": "MISS", "x-origem": String(r.status) } });
  if (cache && r.ok) await cache.put(alvo.url, new Response(corpo, { headers: { "cache-control": `public, max-age=${alvo.ttl}`, "content-type": "application/json" } }));
  return resp;
}

/* ---------- 3) banco D1 ---------- */
const ERRO_OK = /^[\w\s.,:;'"()[\]{}<>!?@#$%&*+=/\\|`~^-]{1,300}$/u;
const ESCALACAO_ID = /^[a-z0-9]{8}$/;
export async function contaBuscaD1(env, chave, hora) {
  await env.DB.prepare("INSERT INTO buscas (hora, chave, n) VALUES (?1, ?2, 1) ON CONFLICT(hora, chave) DO UPDATE SET n = n + 1").bind(hora, chave).run();
}
export async function emAltaD1(env, horas) {
  const { results } = await env.DB.prepare(`SELECT hora, chave, n FROM buscas WHERE hora IN (${horas.map((_, i) => `?${i + 1}`).join(",")})`).bind(...horas).all();
  const pos = Object.fromEntries(horas.map((h, i) => [h, i])), peso = {};
  for (const r of results || []) peso[r.chave] = (peso[r.chave] || 0) + r.n * 0.5 ** (pos[r.hora] / 6); // meia-vida de 6 h
  return Object.entries(peso).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ t: k[0], id: k.slice(2), peso: +v.toFixed(2) }));
}
export async function registraErro(env, d) {
  const msg = String((d && d.m) || "").slice(0, 300), onde = String((d && d.o) || "").slice(0, 120);
  if (!ERRO_OK.test(msg) || (onde && !ERRO_OK.test(onde))) return false;
  await env.DB.prepare("INSERT INTO erros (quando, mensagem, onde) VALUES (?1, ?2, ?3)").bind(Date.now(), msg, onde).run();
  return true;
}
const novoId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
export async function salvaEscalacao(env, txt) {
  if (!txt || txt.length > 8192) return null;
  let d;
  try { d = JSON.parse(txt); } catch { return null; }
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const id = novoId();
  await env.DB.prepare("INSERT INTO escalacoes (id, criado, dados) VALUES (?1, ?2, ?3)").bind(id, Date.now(), JSON.stringify(d)).run();
  return id;
}
export async function lerEscalacao(env, id) {
  if (!ESCALACAO_ID.test(id)) return null;
  const r = await env.DB.prepare("SELECT dados FROM escalacoes WHERE id = ?1").bind(id).first();
  return r ? JSON.parse(r.dados) : null;
}
export async function limpaAntigos(env) {
  const agora = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM erros WHERE quando < ?1").bind(agora - 14 * 864e5),
    env.DB.prepare("DELETE FROM buscas WHERE hora < ?1").bind(new Date(agora - 3 * 864e5).toISOString().slice(0, 13).replace(/[-T]/g, "")),
    env.DB.prepare("DELETE FROM escalacoes WHERE criado < ?1").bind(agora - 365 * 864e5),
  ]);
}

/* ---------- 5) dados do site no banco ----------
   PUT /dados/<nome>.json   o robô envia um arquivo (Authorization: Bearer ROBO_CHAVE; cabeçalho x-hash com o sha-256)
   GET /dados/_lista        o robô pergunta o hash de cada arquivo guardado, para enviar só o que mudou (com a chave)
   GET /dados/<nome>.json   o site lê, com cache de borda curto e ETag; arquivo ausente = 404 (o site usa a cópia estática)
   O Worker não interpreta o JSON (o plano grátis dá 10 ms de CPU por pedido): confere só a chave, o tamanho e o formato.
   O robô é quem valida o JSON antes de enviar. */
export const DADOS_NOME = /^(meta|[a-z][a-z-]{1,30}(\/[a-z0-9][a-z0-9-]{0,30})?)$/;
const HASH_OK = /^[0-9a-f]{64}$/;
const DADOS_MAX = 1_900_000; // a linha do D1 aceita até 2 MB
const iguais = (a, b) => {
  // comparação em tempo constante (não revela quantos caracteres da chave acertou)
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
export function roboAutorizado(req, env) {
  const chave = (env.ROBO_CHAVE || "").trim();
  if (chave.length < 32) return false; // sem chave (ou chave fraca) configurada: ninguém grava
  return iguais((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim(), chave);
}
export async function gravaArquivo(env, nome, req) {
  if (!DADOS_NOME.test(nome)) return { status: 400, erro: "nome inválido" };
  const hash = (req.headers.get("x-hash") || "").toLowerCase();
  if (!HASH_OK.test(hash)) return { status: 400, erro: "x-hash inválido" };
  if (+(req.headers.get("content-length") || 0) > DADOS_MAX) return { status: 413, erro: "arquivo grande demais" };
  const txt = await req.text();
  if (!txt || txt.length > DADOS_MAX || !/^\s*[[{]/.test(txt)) return { status: 400, erro: "não parece JSON" };
  await env.DB.prepare(
    "INSERT INTO arquivos (nome, hash, quando, tamanho, dados) VALUES (?1, ?2, ?3, ?4, ?5) " +
      "ON CONFLICT(nome) DO UPDATE SET hash = ?2, quando = ?3, tamanho = ?4, dados = ?5",
  ).bind(nome, hash, Date.now(), txt.length, txt).run();
  return { status: 200, hash };
}
export async function listaArquivos(env) {
  const { results } = await env.DB.prepare("SELECT nome, hash FROM arquivos").all();
  return Object.fromEntries((results || []).map((r) => [r.nome, r.hash]));
}
export async function serveArquivo(env, nome, req, cors) {
  if (!DADOS_NOME.test(nome)) return new Response(JSON.stringify({ erro: "nome inválido" }), { status: 400, headers: cors });
  const ttl = nome === "meta" || nome === "live-data" ? 30 : 60;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = `https://cache.cazestats.interno/dados/${nome}.json`; // sem ?v=: o "fresco" do site não fura o cache de borda
  let r = cache ? await cache.match(chave) : null;
  if (!r) {
    const linha = await env.DB.prepare("SELECT hash, quando, dados FROM arquivos WHERE nome = ?1").bind(nome).first();
    if (!linha) return new Response(JSON.stringify({ erro: "arquivo não está no banco" }), { status: 404, headers: cors });
    r = new Response(linha.dados, { headers: { "content-type": "application/json; charset=utf-8", etag: `"${linha.hash}"`, "x-quando": String(linha.quando), "cache-control": `public, max-age=${ttl}` } });
    if (cache) await cache.put(chave, r.clone());
  }
  const etag = r.headers.get("etag"), cab = { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${ttl}`, etag, "x-quando": r.headers.get("x-quando") || "" };
  if (etag && req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: cab });
  return new Response(r.body, { headers: cab });
}

/* ---------- 4) agendador do robô ---------- */
export async function disparaRobo(env) {
  if (!env.GITHUB_DISPARO || !env.GITHUB_REPO) return "sem token";
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/dados.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.GITHUB_DISPARO}`, accept: "application/vnd.github+json", "user-agent": "CazeStats-agendador", "x-github-api-version": "2022-11-28" },
    body: JSON.stringify({ ref: "main" }),
  });
  return r.status === 204 ? "disparado" : `GitHub respondeu ${r.status}`;
}
