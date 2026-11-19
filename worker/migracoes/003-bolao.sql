-- CazéStats.TV — bolão: palpites de placar, apelidos do ranking e ligas entre amigos (worker/bolao.mjs).
-- Mesmo texto do fim do worker/schema.sql. Para o banco que já existe, uma vez:
--   npx wrangler d1 execute cazestats --remote --file worker/migracoes/003-bolao.sql
CREATE TABLE IF NOT EXISTS palpites (
  usuario    TEXT    NOT NULL,    -- código da conta (o mesmo de usuarios.id)
  jogo       TEXT    NOT NULL,    -- id do jogo (o mesmo de jogos.id, da ESPN)
  casa       INTEGER NOT NULL,
  fora       INTEGER NOT NULL,
  criado     INTEGER NOT NULL,
  atualizado INTEGER NOT NULL,
  PRIMARY KEY (usuario, jogo)
);
CREATE INDEX IF NOT EXISTS palpites_jogo ON palpites (jogo);
CREATE TABLE IF NOT EXISTS apelidos (
  usuario    TEXT    PRIMARY KEY,
  apelido    TEXT    NOT NULL,    -- o único nome que aparece no ranking (escolhido pelo torcedor)
  atualizado INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS apelidos_unico ON apelidos (apelido COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS ligas (
  codigo TEXT    PRIMARY KEY,     -- código de convite de 6 letras e números
  nome   TEXT    NOT NULL,
  dono   TEXT    NOT NULL,
  criado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ligas_membros (
  codigo  TEXT    NOT NULL,
  usuario TEXT    NOT NULL,
  entrou  INTEGER NOT NULL,
  PRIMARY KEY (codigo, usuario)
);
CREATE INDEX IF NOT EXISTS ligas_membros_usuario ON ligas_membros (usuario);
