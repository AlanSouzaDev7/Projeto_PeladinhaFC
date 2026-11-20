-- CazéStats.TV — voz da torcida (worker/torcida.mjs) e saúde do sistema (worker/status.mjs).
-- Mesmo texto do fim do worker/schema.sql. Para o banco que já existe, uma vez:
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/005-torcida.sql
CREATE TABLE IF NOT EXISTS torcida_votos (
  jogo    TEXT    NOT NULL,       -- id do jogo (ESPN)
  tipo    TEXT    NOT NULL,       -- vencedor ou craque
  votante TEXT    NOT NULL,       -- hash do código aleatório do aparelho
  conexao TEXT    NOT NULL,       -- hash do IP com o jogo (limite por conexão; o IP não fica guardado)
  escolha TEXT    NOT NULL,       -- 1, X, 2 ou o id do atleta
  nome    TEXT,                   -- nome do atleta, do elenco oficial da partida
  clube   TEXT,
  quando  INTEGER NOT NULL,
  PRIMARY KEY (jogo, tipo, votante)
);
CREATE INDEX IF NOT EXISTS torcida_conexao ON torcida_votos (jogo, tipo, conexao);

-- saúde do sistema (worker/status.mjs): batimento do agendador
CREATE TABLE IF NOT EXISTS saude (
  chave  TEXT    PRIMARY KEY,     -- "cron"
  quando INTEGER NOT NULL
);
