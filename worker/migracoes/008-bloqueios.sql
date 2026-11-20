-- CazéStats.TV — proteção contra abuso: origens bloqueadas por 24 h (worker/protecao.mjs).
-- Mesmo texto do fim do worker/schema.sql. Para o banco que já existe, uma vez:
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/008-bloqueios.sql
CREATE TABLE IF NOT EXISTS bloqueios (
  origem TEXT    PRIMARY KEY,     -- código anônimo da origem (resumo do IP que muda todo dia)
  ate    INTEGER NOT NULL,        -- bloqueado até (ms)
  motivo TEXT    NOT NULL,
  pais   TEXT,
  criado INTEGER NOT NULL
);
