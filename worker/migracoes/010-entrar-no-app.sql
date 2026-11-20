-- CazéStats.TV — entrar com Google no app Android (worker/conta.mjs: entrarApp e troca).
-- O Google não deixa entrar dentro do app (WebView); o app abre o navegador, a pessoa entra no site e volta para o app
-- com um código de uso único. O código só vira sessão com o verificador que ficou no app (o mesmo esquema PKCE dos apps
-- oficiais): outro app que pegue o código no caminho não consegue usá-lo. Vale 5 minutos.
-- Mesmo texto do fim do worker/schema.sql. Para o banco que já existe, uma vez (antes de publicar o Worker):
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/010-entrar-no-app.sql
CREATE TABLE IF NOT EXISTS conta_trocas (
  codigo  TEXT    PRIMARY KEY,   -- resumo (SHA-256) do código de uso único
  desafio TEXT    NOT NULL,      -- SHA-256 do verificador que ficou no app
  sessao  TEXT    NOT NULL,      -- a sessão criada no site, entregue uma vez só
  nome    TEXT,
  foto    TEXT,
  expira  INTEGER NOT NULL
);
