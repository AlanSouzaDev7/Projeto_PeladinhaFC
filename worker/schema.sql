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
  tipos    TEXT    NOT NULL DEFAULT 'gol',  -- o que avisar: gol,inicio,intervalo,escalacao,fim (worker/migracoes/002)
  PRIMARY KEY (endpoint, clube)
);
CREATE INDEX IF NOT EXISTS alertas_clube ON alertas (clube, endpoint);
CREATE TABLE IF NOT EXISTS placares (
  jogo   TEXT    PRIMARY KEY,     -- id do jogo na ESPN
  casa   INTEGER NOT NULL,
  fora   INTEGER NOT NULL,
  quando INTEGER NOT NULL,
  estado TEXT    NOT NULL DEFAULT '',  -- pre, in, ht (intervalo) ou post: a mudança vira aviso de início, intervalo e fim
  escalacao INTEGER NOT NULL DEFAULT 0  -- escalações já avisadas: 1 mandante, 2 visitante
);
CREATE TABLE IF NOT EXISTS gols (
  id     TEXT    PRIMARY KEY,     -- jogo:placar:clube
  clube  TEXT    NOT NULL,
  jogo   TEXT    NOT NULL,
  titulo TEXT    NOT NULL,
  corpo  TEXT    NOT NULL,
  quando INTEGER NOT NULL,
  cursor TEXT    NOT NULL DEFAULT '',  -- até qual inscrito já foi avisado ('fim' = todos)
  tipo   TEXT    NOT NULL DEFAULT 'gol' -- gol, inicio, intervalo, escalacao ou fim (a tabela guarda todos os avisos)
);
CREATE INDEX IF NOT EXISTS gols_quando ON gols (quando);

-- conta opcional (Entrar com Google) e sincronização (worker/conta.mjs). Sem e-mail, nome ou foto: só um código da conta.
CREATE TABLE IF NOT EXISTS usuarios (
  id     TEXT    PRIMARY KEY,     -- hash do id da conta Google
  criado INTEGER NOT NULL,
  visto  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (
  token   TEXT    PRIMARY KEY,    -- hash do token da sessão (o token só fica no aparelho)
  usuario TEXT    NOT NULL,
  criado  INTEGER NOT NULL,
  expira  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_usuario ON sessoes (usuario);
CREATE TABLE IF NOT EXISTS salvos (
  usuario    TEXT    NOT NULL,
  chave      TEXT    NOT NULL,    -- "placar:favs", "placar:janela-cruzeiro"...
  dados      TEXT,                -- o mesmo texto do localStorage; NULL = apagado no aparelho
  atualizado INTEGER NOT NULL,
  PRIMARY KEY (usuario, chave)
);

-- bolão (worker/bolao.mjs): palpites de placar, apelidos do ranking e ligas entre amigos
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

-- avisos do bolão (worker/bolao-avisos.mjs)
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

-- voz da torcida (worker/torcida.mjs)
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

-- visitas anônimas (worker/painel.mjs)
CREATE TABLE IF NOT EXISTS visitas (
  dia  TEXT    NOT NULL,          -- AAAA-MM-DD (Brasília)
  rota TEXT    NOT NULL,          -- tipo da página: inicio, jogo, bolao, clube:cruzeiro...
  n    INTEGER NOT NULL,
  PRIMARY KEY (dia, rota)
);

-- administração (worker/painel.mjs)
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
