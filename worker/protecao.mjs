/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — proteção contra abuso no Worker
   1) Limite de pedidos por origem (por minuto): leitura 600, escrita 60, visitas 240. Números folgados de propósito:
      muita gente da mesma operadora de celular pode sair pelo mesmo IP. Usa o limitador da Cloudflare (bindings
      LIMITE_LEITURA, LIMITE_ESCRITA e LIMITE_VISITA no wrangler.toml) e, sem ele, um contador na memória da instância.
   2) Bloqueio automático: origem com 20 ou mais tentativas graves em 1 hora (varredura, login falso, administração
      negada, chave do robô errada) fica bloqueada por 24 horas (tabela bloqueios). A administração mostra e desbloqueia.
   Isentos: o robô (com a chave) nunca é limitado; a rota da administração (/painel) nunca é bloqueada.
   A origem é o mesmo código anônimo da administração (resumo do IP que muda todo dia; o IP não é guardado).
   ========================================================================== */
import { origemDoIp } from "./painel.mjs";

export const LIMITES = { leitura: 600, escrita: 60, visita: 240 };
const GRAVES = ["varredura", "login-invalido", "admin-negado", "chave-robo-invalida"];
export const BLOQUEIO_TENTATIVAS = 20, BLOQUEIO_HORAS = 24;
let memoria = new Map(), bloqueadosCache = { ate: 0, set: new Set() };

const grupoDe = (req, path) => (path === "/visita" ? "visita" : req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" ? "leitura" : "escrita");

async function dentroDoLimite(env, grupo, origem) {
  const binding = { leitura: env.LIMITE_LEITURA, escrita: env.LIMITE_ESCRITA, visita: env.LIMITE_VISITA }[grupo];
  if (binding?.limit) {
    try { return (await binding.limit({ key: `${grupo}:${origem}` })).success; } catch { /* limitador indisponível: cai na memória */ }
  }
  const min = Math.floor(Date.now() / 60e3), k = `${grupo}:${origem}:${min}`;
  if (memoria.size > 5000) memoria = new Map([...memoria].filter(([kk]) => kk.endsWith(`:${min}`)));
  const n = (memoria.get(k) || 0) + 1;
  memoria.set(k, n);
  return n <= LIMITES[grupo];
}

async function estaBloqueado(env, origem) {
  if (!env.DB || origem === "sem-ip") return false;
  if (Date.now() > bloqueadosCache.ate) {
    try {
      const { results } = await env.DB.prepare("SELECT origem FROM bloqueios WHERE ate > ?1").bind(Date.now()).all();
      bloqueadosCache = { ate: Date.now() + 60e3, set: new Set((results || []).map((r) => r.origem)) };
    } catch { bloqueadosCache = { ate: Date.now() + 60e3, set: new Set() }; }
  }
  return bloqueadosCache.set.has(origem);
}

/* chamado antes do roteador: devolve uma resposta de recusa, ou null para seguir */
export async function protege(env, req, cors, roboAutorizado) {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return null;
  const origem = await origemDoIp(env, req.headers.get("cf-connecting-ip") || "");
  if (!path.startsWith("/painel") && await estaBloqueado(env, origem)) {
    return new Response(JSON.stringify({ erro: "Acesso bloqueado temporariamente por excesso de tentativas suspeitas." }), { status: 403, headers: { ...cors, "x-bloqueio": "1" } });
  }
  if (roboAutorizado(req, env) || origem === "sem-ip") return null; // robô com a chave; sem IP só acontece em teste local (a Cloudflare sempre informa)
  if (!(await dentroDoLimite(env, grupoDe(req, path), origem))) {
    return new Response(JSON.stringify({ erro: "Muitos pedidos em pouco tempo. Tente de novo em 1 minuto." }), { status: 429, headers: { ...cors, "retry-after": "60" } });
  }
  return null;
}

/* depois de gravar os eventos: bloqueia quem passou do limite de tentativas graves na última hora */
export async function bloqueiaInsistentes(env, agora = Date.now()) {
  const { results } = await env.DB.prepare(`SELECT origem, COUNT(*) AS n, MAX(pais) AS pais, GROUP_CONCAT(DISTINCT tipo) AS tipos FROM seguranca
    WHERE quando > ?1 AND origem != 'sem-ip' AND tipo IN (${GRAVES.map((_, i) => `?${i + 2}`).join(",")}) GROUP BY origem HAVING COUNT(*) >= ${BLOQUEIO_TENTATIVAS}`)
    .bind(agora - 3600e3, ...GRAVES).all();
  const novos = results || [];
  if (!novos.length) return 0;
  await env.DB.batch(novos.map((r) => env.DB.prepare(`INSERT INTO bloqueios (origem, ate, motivo, pais, criado) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(origem) DO UPDATE SET ate = MAX(bloqueios.ate, ?2), motivo = ?3`).bind(r.origem, agora + BLOQUEIO_HORAS * 3600e3, `${r.n} tentativas em 1 h (${r.tipos})`, r.pais || "", agora)));
  bloqueadosCache.ate = 0; // relê na próxima requisição
  return novos.length;
}

export async function listaBloqueios(env, agora = Date.now()) {
  const { results } = await env.DB.prepare("SELECT origem, ate, motivo, pais, criado FROM bloqueios WHERE ate > ?1 ORDER BY criado DESC LIMIT 50").bind(agora).all();
  return results || [];
}
export async function desbloqueia(env, txt) {
  let origem = "";
  try { origem = String(JSON.parse(txt || "{}").origem || ""); } catch { /* inválido */ }
  if (!/^[0-9a-f]{10}$/.test(origem)) return { status: 400, erro: "origem inválida" };
  await env.DB.prepare("DELETE FROM bloqueios WHERE origem = ?1").bind(origem).run();
  bloqueadosCache.ate = 0;
  return { status: 200, origem };
}
export async function limpaBloqueios(env) {
  await env.DB.prepare("DELETE FROM bloqueios WHERE ate < ?1").bind(Date.now()).run();
}
export const _protecao = { reset: () => { memoria = new Map(); bloqueadosCache = { ate: 0, set: new Set() }; } };
