/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — administração: métricas anônimas, tráfego em tempo real e eventos de segurança
   POST /visita  o site manda o tipo da página (ou o uso de uma função) — sem cookie, sem IP guardado
   GET  /painel  números somados para as contas em DONOS (conta Google do dono, conferida aqui)
   Observador: cada resposta do Worker passa por observa(); 401/403/404 de varredura/413/429 viram eventos de
   segurança com um código de origem anônimo (resumo do IP que muda todo dia: dá para contar repetições, não para
   voltar ao IP) e o país informado pela Cloudflare.
   Gravação em lote: cada instância soma na memória e grava no máximo uma vez por minuto.
   ========================================================================== */
import { bloqueiaInsistentes, listaBloqueios } from "./protecao.mjs";

const PAGINAS = new Set(["inicio", "clubes", "tabela", "simulador", "bora", "bolao", "jogo", "jogador", "copa", "sobre", "status", "creditos", "widgets", "privacidade", "admin", "xg"]);
const USOS = new Set(["compartilhar", "agenda", "palpite-1x2", "craque", "alerta", "instalar", "widget-copiado", "bolao-palpite", "bolao-liga", "busca", "favorito", "simulador", "comparar"]);
const ABAS = new Set(["geral", "partidas", "escalacoes", "historico", "elenco", "mercado", "estatisticas", "comparar", "tabela", "ultimos", "temporada", "calor"]);
const VARREDURA = /\.(php|asp|aspx|jsp|cgi|env|git|sql|bak|ini|ya?ml)\b|wp-|wordpress|phpmyadmin|\/admin|\/\.|xmlrpc|cgi-bin|etc\/passwd|\.\.|\/vendor\/|\/actuator|\/console|\/server-status/i;
let pend = {}, minutos = {}, eventos = [], gravadoEm = 0;
const dia = (t = Date.now()) => new Date(t - 3 * 3600e3).toISOString().slice(0, 10); // dia de Brasília
const minuto = (t = Date.now()) => new Date(t).toISOString().slice(0, 16); // UTC, AAAA-MM-DDTHH:MM
const soma = (k, n = 1) => { const c = `${dia()}|${k}`; pend[c] = Math.min(1e7, (pend[c] || 0) + n); };
const somaMin = (campo) => { const m = minuto(); minutos[m] = minutos[m] || { paginas: 0, api: 0 }; minutos[m][campo]++; };

function origemDe(ref) {
  let h = "";
  try { h = new URL(ref).hostname.toLowerCase(); } catch { return "direto"; }
  if (!h) return "direto";
  if (/(^|\.)cazestats\./.test(h)) return null;
  if (/(^|\.)google\./.test(h)) return "google";
  if (/bing\.|duckduckgo|yahoo\.|ecosia|yandex/.test(h)) return "outras-buscas";
  if (/whatsapp|wa\.me/.test(h)) return "whatsapp";
  if (/instagram|facebook|fb\.|t\.co$|twitter|x\.com|threads|tiktok|youtube|reddit|linkedin/.test(h)) return "redes-sociais";
  return "outros-sites";
}
const hostOk = (h) => /^[a-z0-9.-]{3,80}$/.test(h) && h.includes(".") && !/(^|\.)cazestats\./.test(h);

/* POST /visita {rota, primeira?, ref?, app?, site?} */
export function contaVisita(txt, req) {
  let d = {};
  try { d = JSON.parse(txt || "{}") || {}; } catch { return false; }
  const rota = String(d.rota || "");
  const [tipo, valor] = rota.includes(":") ? [rota.slice(0, rota.indexOf(":")), rota.slice(rota.indexOf(":") + 1)] : [rota, ""];
  if (PAGINAS.has(rota) || (tipo === "clube" && /^[a-z-]{2,30}$/.test(valor))) {
    soma(rota); soma("total"); somaMin("paginas");
    const ua = String(req?.headers?.get?.("user-agent") || "");
    soma(`disp:${d.app ? "app" : /Mobi|Android|iPhone|iPad/i.test(ua) ? "celular" : "computador"}`);
    const pais = String(req?.cf?.country || "");
    if (/^[A-Z]{2}$/.test(pais)) soma(`pais:${pais}`);
    if (d.primeira) { const o = origemDe(String(d.ref || "")); if (o) soma(`origem:${o}`); }
    return true;
  }
  if (tipo === "uso" && USOS.has(valor)) { soma(rota); return true; }
  if (tipo === "aba" && ABAS.has(valor)) { soma(rota); return true; }
  if (tipo === "widget" && ["tabela", "clube", "jogo"].includes(valor)) {
    soma(rota);
    const site = String(d.site || "").toLowerCase();
    if (hostOk(site)) soma(`wsite:${site}`);
    return true;
  }
  return false;
}

/* observador: tráfego da API por minuto e eventos de segurança pelas respostas */
export async function observa(env, req, resp) {
  if (!env.DB) return;
  const url = new URL(req.url), path = url.pathname, st = resp.status, met = req.method;
  if (path !== "/visita") somaMin("api");
  let tipo = null;
  if (st === 404 && VARREDURA.test(path)) tipo = "varredura";
  else if (st === 404) tipo = "rota-desconhecida";
  else if (st === 401 && path === "/conta/entrar") tipo = "login-invalido";
  else if (st === 401 && (path.startsWith("/dados") || path === "/jogos")) tipo = "chave-robo-invalida";
  else if (st === 401 && path.startsWith("/painel")) tipo = "admin-sem-login";
  else if (st === 403 && path.startsWith("/painel")) tipo = "admin-negado";
  else if (st === 413 || st === 414) tipo = "pedido-grande";
  else if (st === 429) tipo = "excesso-de-pedidos";
  else if (st === 400 && met !== "GET") tipo = "pedido-invalido";
  if (st === 403 && resp.headers.get("x-bloqueio")) tipo = "bloqueado";
  if (tipo && eventos.length < 300) {
    const h = await origemDoIp(env, req.headers.get("cf-connecting-ip") || "");
    eventos.push({ quando: Date.now(), tipo, rota: path.slice(0, 120), metodo: met.slice(0, 8), status: st, origem: h, pais: /^[A-Z]{2}$/.test(String(req.cf?.country || "")) ? req.cf.country : "" });
  }
  await gravaPendentes(env).catch(() => {});
}
/* código anônimo da origem: resumo do IP com o dia (muda todo dia; não dá para voltar ao IP) */
export async function origemDoIp(env, ip) {
  return ip ? resumo(`${ip}|${dia()}|${env.SAL_PAINEL || "cazestats"}`) : "sem-ip";
}
async function resumo(t) {
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
  return [...b.slice(0, 5)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function gravaPendentes(env, forcar = false) {
  const tem = Object.keys(pend).length || Object.keys(minutos).length || eventos.length;
  if (!tem || (!forcar && Date.now() - gravadoEm < 60e3)) return 0;
  gravadoEm = Date.now();
  const [p, m, e] = [pend, minutos, eventos];
  pend = {}; minutos = {}; eventos = [];
  const ops = [];
  for (const [k, n] of Object.entries(p)) {
    const [d, rota] = k.split("|");
    ops.push(env.DB.prepare("INSERT INTO visitas (dia, rota, n) VALUES (?1, ?2, ?3) ON CONFLICT(dia, rota) DO UPDATE SET n = n + ?3").bind(d, rota, n));
  }
  for (const [mm, v] of Object.entries(m)) {
    ops.push(env.DB.prepare("INSERT INTO trafego (minuto, paginas, api) VALUES (?1, ?2, ?3) ON CONFLICT(minuto) DO UPDATE SET paginas = paginas + ?2, api = api + ?3").bind(mm, v.paginas, v.api));
  }
  for (const x of e) {
    ops.push(env.DB.prepare("INSERT INTO seguranca (quando, tipo, rota, metodo, status, origem, pais) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(x.quando, x.tipo, x.rota, x.metodo, x.status, x.origem, x.pais));
  }
  if (ops.length) await env.DB.batch(ops);
  if (e.length) await bloqueiaInsistentes(env).catch(() => {}); // proteção: origem insistente fica bloqueada por 24 h
  return ops.length;
}
export const gravaVisitas = gravaPendentes;
export const _visitas = { reset: () => { pend = {}; minutos = {}; eventos = []; gravadoEm = 0; }, origemDe };
export async function limpaPainel(env) {
  const agora = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM trafego WHERE minuto < ?1").bind(minuto(agora - 3 * 864e5)),
    env.DB.prepare("DELETE FROM seguranca WHERE quando < ?1").bind(agora - 30 * 864e5),
  ]);
}

export const ehDono = (env, usuario) => !!usuario && String(env.DONOS || "").split(/[\s,]+/).filter(Boolean).includes(usuario);
const um = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).first()) || {};
const varios = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const porPrefixo = (env, prefixo, desde, limite = 20) =>
  varios(env, `SELECT substr(rota, ${prefixo.length + 1}) AS chave, SUM(n) AS n FROM visitas WHERE rota LIKE ?1 AND dia >= ?2 GROUP BY rota ORDER BY n DESC LIMIT ${limite}`, `${prefixo}%`, desde);

export async function painel(env, agora = Date.now()) {
  const d7 = agora - 7 * 864e5, d30 = agora - 30 * 864e5, h24 = agora - 864e5;
  const hoje = dia(agora), dia7 = dia(agora - 6 * 864e5), dia14 = dia(agora - 13 * 864e5), dia30 = dia(agora - 29 * 864e5);
  const [contas, ativos7, ativos30, novas, sessoes, aparelhos, porClube, palpites, ligas, apelidos, votos, votos7, avisosBolao, erros24,
    tot, sem7, semAnt, porDia, porRota, usos, abas, paises, disp, origens, widgets, wsites, tempo, horas, segTipo24, segTipo7, segOrigens, segRecentes] = await Promise.all([
    um(env, "SELECT COUNT(*) AS n FROM usuarios"),
    um(env, "SELECT COUNT(*) AS n FROM usuarios WHERE visto > ?1", d7),
    um(env, "SELECT COUNT(*) AS n FROM usuarios WHERE visto > ?1", d30),
    varios(env, "SELECT date(criado / 1000 - 10800, 'unixepoch') AS dia, COUNT(*) AS n FROM usuarios WHERE criado > ?1 GROUP BY dia ORDER BY dia", d30),
    um(env, "SELECT COUNT(*) AS n FROM sessoes WHERE expira > ?1", agora),
    um(env, "SELECT COUNT(DISTINCT endpoint) AS n FROM alertas"),
    varios(env, "SELECT clube, COUNT(*) AS n FROM alertas GROUP BY clube ORDER BY n DESC LIMIT 20"),
    um(env, "SELECT COUNT(*) AS n, COUNT(DISTINCT usuario) AS pessoas FROM palpites"),
    um(env, "SELECT COUNT(*) AS n FROM ligas"),
    um(env, "SELECT COUNT(*) AS n FROM apelidos"),
    um(env, "SELECT COUNT(*) AS n, COUNT(DISTINCT jogo) AS jogos FROM torcida_votos"),
    um(env, "SELECT COUNT(*) AS n FROM torcida_votos WHERE quando > ?1", d7),
    um(env, "SELECT COUNT(*) AS n FROM bolao_push"),
    um(env, "SELECT COUNT(*) AS n FROM erros WHERE quando > ?1", h24),
    um(env, "SELECT COALESCE(SUM(CASE WHEN dia = ?1 THEN n END), 0) AS hoje, COALESCE(SUM(CASE WHEN dia >= ?2 THEN n END), 0) AS d7, COALESCE(SUM(n), 0) AS d30 FROM visitas WHERE rota = 'total' AND dia >= ?3", hoje, dia7, dia30),
    um(env, "SELECT COALESCE(SUM(n), 0) AS n FROM visitas WHERE rota = 'total' AND dia >= ?1", dia7),
    um(env, "SELECT COALESCE(SUM(n), 0) AS n FROM visitas WHERE rota = 'total' AND dia >= ?1 AND dia < ?2", dia14, dia7),
    varios(env, "SELECT dia, n FROM visitas WHERE rota = 'total' AND dia >= ?1 ORDER BY dia", dia30),
    varios(env, "SELECT rota, SUM(n) AS n FROM visitas WHERE dia >= ?1 AND rota != 'total' AND (rota NOT LIKE '%:%' OR rota LIKE 'clube:%') GROUP BY rota ORDER BY n DESC LIMIT 15", dia30),
    porPrefixo(env, "uso:", dia30), porPrefixo(env, "aba:", dia30), porPrefixo(env, "pais:", dia30, 10), porPrefixo(env, "disp:", dia30, 5),
    porPrefixo(env, "origem:", dia30, 8), porPrefixo(env, "widget:", dia30, 5), porPrefixo(env, "wsite:", dia30, 15),
    varios(env, "SELECT minuto, paginas, api FROM trafego WHERE minuto >= ?1 ORDER BY minuto", minuto(agora - 60 * 60e3)),
    varios(env, "SELECT substr(minuto, 1, 13) AS hora, SUM(paginas) AS paginas, SUM(api) AS api FROM trafego WHERE minuto >= ?1 GROUP BY hora ORDER BY hora", minuto(agora - 864e5)),
    varios(env, "SELECT tipo, COUNT(*) AS n FROM seguranca WHERE quando > ?1 GROUP BY tipo ORDER BY n DESC", h24),
    varios(env, "SELECT tipo, COUNT(*) AS n FROM seguranca WHERE quando > ?1 GROUP BY tipo ORDER BY n DESC", d7),
    varios(env, "SELECT origem, pais, COUNT(*) AS n, MAX(quando) AS ultimo, GROUP_CONCAT(DISTINCT tipo) AS tipos FROM seguranca WHERE quando > ?1 AND tipo != 'rota-desconhecida' GROUP BY origem ORDER BY n DESC LIMIT 10", d7),
    varios(env, "SELECT quando, tipo, rota, metodo, status, origem, pais FROM seguranca ORDER BY quando DESC LIMIT 25"),
  ]);
  const crescimento = semAnt.n ? Math.round(((sem7.n - semAnt.n) / semAnt.n) * 100) : null;
  return {
    gerado: agora,
    trafego: { hoje: tot.hoje || 0, dias7: tot.d7 || 0, dias30: tot.d30 || 0, crescimento, porDia, porRota, tempoReal: tempo, porHora: horas },
    publico: { paises, aparelhos: disp, origens },
    uso: { funcoes: usos, abas, widgets, sitesComWidget: wsites },
    contas: { total: contas.n || 0, ativos7: ativos7.n || 0, ativos30: ativos30.n || 0, sessoes: sessoes.n || 0, novasPorDia: novas },
    alertas: { aparelhos: aparelhos.n || 0, porClube, avisosBolao: avisosBolao.n || 0 },
    bolao: { palpites: palpites.n || 0, pessoas: palpites.pessoas || 0, ligas: ligas.n || 0, apelidos: apelidos.n || 0 },
    torcida: { votos: votos.n || 0, jogos: votos.jogos || 0, votos7: votos7.n || 0 },
    seguranca: { tipos24h: segTipo24, tipos7d: segTipo7, origens: segOrigens, recentes: segRecentes, bloqueios: await listaBloqueios(env, agora).catch(() => []) },
    erros24h: erros24.n || 0,
  };
}
