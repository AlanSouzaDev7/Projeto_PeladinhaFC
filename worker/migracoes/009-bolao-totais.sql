-- CazéStats.TV — bolão pronto para crescer: totais de cada torcedor guardados quando o jogo acaba (worker/bolao.mjs).
-- O ranking geral e o das ligas leem esta tabela em vez de somar todos os palpites a cada consulta.
-- Mesmo texto do fim do worker/schema.sql. Para o banco que já existe, uma vez (antes de publicar o Worker):
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/009-bolao-totais.sql
CREATE TABLE IF NOT EXISTS bolao_totais (
  usuario    TEXT    PRIMARY KEY,
  pontos     INTEGER NOT NULL,
  exatos     INTEGER NOT NULL,
  jogos      INTEGER NOT NULL,    -- jogos encerrados com palpite
  atualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bolao_totais_ordem ON bolao_totais (pontos DESC, exatos DESC, jogos ASC);
-- jogos já somados, com o placar usado: se o placar for corrigido depois, o jogo é somado de novo
CREATE TABLE IF NOT EXISTS bolao_contados (
  jogo      TEXT    PRIMARY KEY,
  gols_casa INTEGER NOT NULL,
  gols_fora INTEGER NOT NULL,
  contado   INTEGER NOT NULL
);
-- jogos por data (busca dos jogos encerrados nos últimos dias e lembretes do bolão)
CREATE INDEX IF NOT EXISTS jogos_data ON jogos (data);
