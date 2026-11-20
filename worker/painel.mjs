/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — painel do dono (GET /painel) e contagem anônima de visitas (POST /visita)
   Painel: só números somados (contas, alertas, bolão, torcida, visitas). Nada de quem é quem.
     Acesso: conta Google do dono. DONOS (wrangler.toml) é a lista de códigos de conta (o hash que o servidor já usa,
     não é e-mail nem senha). GET /painel/eu mostra o código da conta de quem está logado, para pôr em DONOS.
   Visitas: o site manda só o tipo da página e o dia ("clube:cruzeiro", "jogo", "bolao"...). Sem cookie, sem IP,
     sem identificador do aparelho. Cada instância soma na memória e grava no máximo uma vez por minuto.
   ========================================================================== */
const ROTA_OK = /^(inicio|clubes|tabela|simulador|bora|bolao|jogo|jogador|copa|sobre|status|creditos|widgets|privacidade|clube:[a-z-]{2,30})$/;
let pendentes = {}, gravadoEm = 0;
const dia = (t = Date.now()) => new Date(t - 3 * 3600e3).toISOString().slice(0, 10); // dia de Brasília

export function contaVisita(txt) {
  let rota = "";
  try { rota = String(JSON.parse(txt || "{}").rota || ""); } catch { /* inválido */ }
  if (!ROTA_OK.test(rota)) return false;
  const k = `${dia()}|${rota}`;
  pendentes[k] = Math.min(1e6, (pendentes[k] || 0) + 1);
  return true;
}
export async function gravaVisitas(env, forcar = false) {
  if (!Object.keys(pendentes).length || (!forcar && Date.now() - gravadoEm < 60e3)) return 0;
  gravadoEm = Date.now();
  const soma = pendentes;
  pendentes = {};
  const ops = Object.entries(soma).map(([k, n]) => {
    const [d, rota] = k.split("|");
    return env.DB.prepare("INSERT INTO visitas (dia, rota, n) VALUES (?1, ?2, ?3) ON CONFLICT(dia, rota) DO UPDATE SET n = n + ?3").bind(d, rota, n);
  });
  await env.DB.batch(ops);
  return ops.length;
}
export const _visitas = { reset: () => { pendentes = {}; gravadoEm = 0; }, ROTA_OK };

export const ehDono = (env, usuario) => !!usuario && String(env.DONOS || "").split(/[\s,]+/).filter(Boolean).includes(usuario);

const um = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).first()) || {};
const varios = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];

export async function painel(env, agora = Date.now()) {
  const d7 = agora - 7 * 864e5, d30 = agora - 30 * 864e5, hoje = dia(agora), dia7 = dia(agora - 6 * 864e5), dia30 = dia(agora - 29 * 864e5);
  const [contas, ativos7, ativos30, sessoes, aparelhos, porClube, palpites, ligas, apelidos, votos, votos7, avisosBolao, visHoje, vis7, vis30, porRota, porDia] = await Promise.all([
    um(env, "SELECT COUNT(*) AS n FROM usuarios"),
    um(env, "SELECT COUNT(*) AS n FROM usuarios WHERE visto > ?1", d7),
    um(env, "SELECT COUNT(*) AS n FROM usuarios WHERE visto > ?1", d30),
    um(env, "SELECT COUNT(*) AS n FROM sessoes WHERE expira > ?1", agora),
    um(env, "SELECT COUNT(DISTINCT endpoint) AS n FROM alertas"),
    varios(env, "SELECT clube, COUNT(*) AS n FROM alertas GROUP BY clube ORDER BY n DESC LIMIT 20"),
    um(env, "SELECT COUNT(*) AS n, COUNT(DISTINCT usuario) AS pessoas FROM palpites"),
    um(env, "SELECT COUNT(*) AS n FROM ligas"),
    um(env, "SELECT COUNT(*) AS n FROM apelidos"),
    um(env, "SELECT COUNT(*) AS n, COUNT(DISTINCT jogo) AS jogos FROM torcida_votos"),
    um(env, "SELECT COUNT(*) AS n FROM torcida_votos WHERE quando > ?1", d7),
    um(env, "SELECT COUNT(*) AS n FROM bolao_push"),
    um(env, "SELECT COALESCE(SUM(n), 0) AS n FROM visitas WHERE dia = ?1", hoje),
    um(env, "SELECT COALESCE(SUM(n), 0) AS n FROM visitas WHERE dia >= ?1", dia7),
    um(env, "SELECT COALESCE(SUM(n), 0) AS n FROM visitas WHERE dia >= ?1", dia30),
    varios(env, "SELECT rota, SUM(n) AS n FROM visitas WHERE dia >= ?1 GROUP BY rota ORDER BY n DESC LIMIT 15", dia30),
    varios(env, "SELECT dia, SUM(n) AS n FROM visitas WHERE dia >= ?1 GROUP BY dia ORDER BY dia", dia30),
  ]);
  return {
    gerado: agora,
    contas: { total: contas.n || 0, ativos7: ativos7.n || 0, ativos30: ativos30.n || 0, sessoes: sessoes.n || 0 },
    alertas: { aparelhos: aparelhos.n || 0, porClube, avisosBolao: avisosBolao.n || 0 },
    bolao: { palpites: palpites.n || 0, pessoas: palpites.pessoas || 0, ligas: ligas.n || 0, apelidos: apelidos.n || 0 },
    torcida: { votos: votos.n || 0, jogos: votos.jogos || 0, votos7: votos7.n || 0 },
    visitas: { hoje: visHoje.n || 0, dias7: vis7.n || 0, dias30: vis30.n || 0, porRota, porDia },
  };
}
