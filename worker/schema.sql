-- © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
-- CazéStats.TV — banco D1 (SQLite da Cloudflare, plano gratuito) para dados NÃO essenciais.
-- Criar:   npx wrangler d1 create cazestats      (cole o database_id em worker/wrangler.toml)
-- Tabelas: npx wrangler d1 execute cazestats --remote --file=worker/schema.sql
-- Nada aqui identifica pessoas: só contagens, mensagens de erro do navegador e escalações montadas.

-- "Em alta": quantas vezes cada clube (c:<id>) ou jogador (j:<id>) foi buscado em cada hora (AAAAMMDDHH, UTC)
CREATE TABLE IF NOT EXISTS buscas (
  hora  TEXT    NOT NULL,
  chave TEXT    NOT NULL,
  n     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (hora, chave)
);

-- observabilidade (E5): erros de JavaScript dos visitantes, guardados por 14 dias
CREATE TABLE IF NOT EXISTS erros (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  quando   INTEGER NOT NULL,
  mensagem TEXT    NOT NULL,
  onde     TEXT
);
CREATE INDEX IF NOT EXISTS erros_quando ON erros (quando);

-- escalações compartilhadas por link curto (janela de transferências, campinho da partida), guardadas por 1 ano
CREATE TABLE IF NOT EXISTS escalacoes (
  id     TEXT    PRIMARY KEY,
  criado INTEGER NOT NULL,
  dados  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS escalacoes_criado ON escalacoes (criado);
