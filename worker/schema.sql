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

-- dados públicos do site (os mesmos dados/*.json que o robô grava), servidos pelo Worker com cache de borda.
-- O robô envia só o que mudou (comparando o hash); o site lê daqui e, se o banco falhar, usa a cópia estática.
-- Assim o site não precisa ser republicado a cada rodada (o Pages grátis aceita 500 publicações por mês).
CREATE TABLE IF NOT EXISTS arquivos (
  nome    TEXT    PRIMARY KEY,   -- "live-data", "jogadores/cruzeiro", "meta"...
  hash    TEXT    NOT NULL,      -- sha-256 do conteúdo (hex), calculado pelo robô
  quando  INTEGER NOT NULL,      -- quando chegou ao banco (ms desde 1970)
  tamanho INTEGER NOT NULL,
  dados   TEXT    NOT NULL       -- o JSON, como o robô gravou
);

-- histórico dos jogos: cada jogo de cada competição que o site acompanha, guardado para sempre (nunca apagado).
-- Os arquivos de dados são regravados a cada rodada e só têm a temporada atual; aqui as temporadas se acumulam.
-- id = número do jogo na ESPN. *_id = id do clube no site ("cruzeiro") ou "espn:<id>" para os outros times.
CREATE TABLE IF NOT EXISTS jogos (
  id         TEXT    PRIMARY KEY,
  liga       TEXT    NOT NULL,   -- "bra.1", "bra.2", "conmebol.libertadores"...
  competicao TEXT    NOT NULL,   -- "Brasileirão", "Série B"...
  temporada  TEXT    NOT NULL,   -- "2026"
  data       TEXT    NOT NULL,   -- "2026-11-08"
  hora       TEXT,
  fase       TEXT,
  casa_id    TEXT,
  casa       TEXT    NOT NULL,
  fora_id    TEXT,
  fora       TEXT    NOT NULL,
  gols_casa  INTEGER,
  gols_fora  INTEGER,
  pen_casa   INTEGER,
  pen_fora   INTEGER,
  estado     TEXT    NOT NULL,   -- "pre", "in", "post"
  local      TEXT,
  atualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jogos_casa ON jogos (casa_id, data);
CREATE INDEX IF NOT EXISTS jogos_fora ON jogos (fora_id, data);
CREATE INDEX IF NOT EXISTS jogos_temporada ON jogos (temporada, liga);

-- alerta de gol do clube favorito (worker/alertas.mjs): inscrições de Web Push por clube, placares vistos e gols avisados
CREATE TABLE IF NOT EXISTS alertas (
  endpoint TEXT    NOT NULL,      -- endereço do serviço de push do navegador (Google, Mozilla, Apple, Microsoft)
  clube    TEXT    NOT NULL,
  criado   INTEGER NOT NULL,
  PRIMARY KEY (endpoint, clube)
);
CREATE INDEX IF NOT EXISTS alertas_clube ON alertas (clube, endpoint);
CREATE TABLE IF NOT EXISTS placares (
  jogo   TEXT    PRIMARY KEY,     -- id do jogo na ESPN
  casa   INTEGER NOT NULL,
  fora   INTEGER NOT NULL,
  quando INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gols (
  id     TEXT    PRIMARY KEY,     -- jogo:placar:clube
  clube  TEXT    NOT NULL,
  jogo   TEXT    NOT NULL,
  titulo TEXT    NOT NULL,
  corpo  TEXT    NOT NULL,
  quando INTEGER NOT NULL,
  cursor TEXT    NOT NULL DEFAULT ''  -- até qual inscrito já foi avisado ('fim' = todos)
);
CREATE INDEX IF NOT EXISTS gols_quando ON gols (quando);
