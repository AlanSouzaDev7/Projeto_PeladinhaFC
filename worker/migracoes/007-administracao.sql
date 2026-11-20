-- CazéStats.TV — administração: tráfego por minuto e eventos de segurança (worker/painel.mjs).
-- Mesmo texto do fim do worker/schema.sql. Para o banco que já existe, uma vez:
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/007-administracao.sql
CREATE TABLE IF NOT EXISTS trafego (
  minuto  TEXT    PRIMARY KEY,    -- AAAA-MM-DDTHH:MM (UTC); guardado por 3 dias
  paginas INTEGER NOT NULL DEFAULT 0,  -- páginas abertas no site
  api     INTEGER NOT NULL DEFAULT 0   -- pedidos ao Worker
);
CREATE TABLE IF NOT EXISTS seguranca (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  quando  INTEGER NOT NULL,
  tipo    TEXT    NOT NULL,       -- varredura, login-invalido, admin-negado, chave-robo-invalida, excesso-de-pedidos...
  rota    TEXT    NOT NULL,
  metodo  TEXT    NOT NULL,
  status  INTEGER NOT NULL,
  origem  TEXT    NOT NULL,       -- resumo do IP que muda todo dia (não dá para voltar ao IP); guardado por 30 dias
  pais    TEXT
);
CREATE INDEX IF NOT EXISTS seguranca_quando ON seguranca (quando);
