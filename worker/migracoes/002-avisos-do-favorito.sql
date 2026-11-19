-- CazéStats.TV — mais alertas do favorito (início, intervalo, escalação e fim de jogo, além do gol).
-- Para o banco que já existe (o schema.sql só cria tabelas novas):
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/002-avisos-do-favorito.sql
ALTER TABLE alertas ADD COLUMN tipos TEXT NOT NULL DEFAULT 'gol';
ALTER TABLE placares ADD COLUMN estado TEXT NOT NULL DEFAULT '';
ALTER TABLE placares ADD COLUMN escalacao INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gols ADD COLUMN tipo TEXT NOT NULL DEFAULT 'gol';
