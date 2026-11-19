-- CazéStats.TV — avisos do bolão: lembrete antes do jogo e pontos ganhos (worker/bolao-avisos.mjs).
-- Mesmo texto do fim do worker/schema.sql. Para o banco que já existe, uma vez:
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/004-avisos-do-bolao.sql
CREATE TABLE IF NOT EXISTS bolao_push (
  endpoint TEXT    PRIMARY KEY,   -- endereço de push do aparelho (o mesmo do alerta de gol)
  usuario  TEXT    NOT NULL,
  criado   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bolao_push_usuario ON bolao_push (usuario);
CREATE TABLE IF NOT EXISTS bolao_avisos (
  id      TEXT    PRIMARY KEY,    -- lembrete:<jogo>:<usuario> ou pontos:<jogo>:<usuario> (cada aviso sai uma vez)
  usuario TEXT    NOT NULL,
  titulo  TEXT    NOT NULL,
  corpo   TEXT    NOT NULL,
  url     TEXT    NOT NULL,
  quando  INTEGER NOT NULL,
  cursor  TEXT    NOT NULL DEFAULT ''   -- 'fim' = já enviado
);
CREATE INDEX IF NOT EXISTS bolao_avisos_quando ON bolao_avisos (quando);
