/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — saúde do sistema (GET /status, página #/status do site)
   Cada parte diz quando trabalhou pela última vez; passou do limite, fica em atenção; muito além, fora do ar.
     · robô de dados: quando o meta.json chegou ao banco (o robô regrava a cada rodada, ~5 min)
     · agendador do Worker: batimento gravado a cada 5 minutos pelo cron de minuto (alertas e bolão)
     · placar ao vivo: quando o live-data mudou pela última vez
     · banco: a própria consulta responder
   Nada de dado pessoal: só horários.
   ========================================================================== */
const MIN = 60e3;
const PARTES = [
  { id: "robo", nome: "Robô de dados", arquivo: "meta", atencao: 20 * MIN, fora: 90 * MIN, explica: "atualiza tabela, jogos, elencos e notícias a cada ~5 min" },
  { id: "agendador", nome: "Alertas e bolão", saude: "cron", atencao: 12 * MIN, fora: 60 * MIN, explica: "confere placares e manda os avisos a cada minuto" },
  { id: "placar", nome: "Placar ao vivo", arquivo: "live-data", atencao: 45 * MIN, fora: 6 * 60 * MIN, explica: "placar, tabela e rodada" },
];

export async function batimento(env, chave = "cron", agora = Date.now()) {
  await env.DB.prepare("INSERT INTO saude (chave, quando) VALUES (?1, ?2) ON CONFLICT(chave) DO UPDATE SET quando = ?2").bind(chave, agora).run();
}

export async function status(env, agora = Date.now()) {
  const itens = [];
  let bancoOk = true;
  for (const p of PARTES) {
    let quando = null;
    try {
      quando = p.arquivo
        ? (await env.DB.prepare("SELECT quando FROM arquivos WHERE nome = ?1").bind(p.arquivo).first())?.quando ?? null
        : (await env.DB.prepare("SELECT quando FROM saude WHERE chave = ?1").bind(p.saude).first())?.quando ?? null;
    } catch { bancoOk = false; }
    const idade = quando ? agora - quando : null;
    const estado = idade == null ? "sem-dado" : idade > p.fora ? "fora" : idade > p.atencao ? "atencao" : "ok";
    itens.push({ id: p.id, nome: p.nome, explica: p.explica, quando, estado });
  }
  itens.push({ id: "banco", nome: "Banco de dados", explica: "guarda dados, contas, bolão e votos", quando: bancoOk ? agora : null, estado: bancoOk ? "ok" : "fora" });
  const pior = itens.some((i) => i.estado === "fora") ? "fora" : itens.some((i) => i.estado === "atencao" || i.estado === "sem-dado") ? "atencao" : "ok";
  return { geral: pior, agora, itens };
}
