-- CazéStats.TV — visitas anônimas por tipo de página e dia (worker/painel.mjs), para o painel do dono.
-- Mesmo texto do fim do worker/schema.sql. Para o banco que já existe, uma vez:
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/006-visitas.sql
CREATE TABLE IF NOT EXISTS visitas (
  dia  TEXT    NOT NULL,          -- AAAA-MM-DD (Brasília)
  rota TEXT    NOT NULL,          -- tipo da página: inicio, jogo, bolao, clube:cruzeiro...
  n    INTEGER NOT NULL,
  PRIMARY KEY (dia, rota)
);
