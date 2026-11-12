# PLACAR. — hospedagem, banco de dados e escala

Parecer de novembro de 2026, para quando o PLACAR. sair de projeto pessoal e virar produto apresentado a uma empresa esportiva.

## Como funciona hoje

| Peça | Onde roda | O que faz |
|---|---|---|
| Site (HTML, CSS, JS) | GitHub Pages | arquivos estáticos; os dados ficam em `js/*.js` |
| Robô de dados (`server/placar_api.py --snapshot`) | GitHub Actions, a cada 30 min | lê ESPN, Wikipédia/Wikidata, Google Notícias; grava os `.js` e faz commit |
| Placar ao vivo | navegador + Cloudflare Worker (`worker/ao-vivo.mjs`) | consulta a ESPN a cada 0,8 s (Série A) e 10 s (outras), com relógio em Web Worker |
| Contagem de buscas ("Em alta") | Cloudflare Worker + KV | única escrita do sistema |

Funciona bem para um projeto pessoal. Para um produto, há cinco limites.

1. **Termos do GitHub Pages.** O Pages não é feito para negócio online ou SaaS comercial, e tem limite brando de 100 GB de tráfego por mês e 1 GB de site. Uma empresa vai perguntar onde o produto roda e com qual contrato.
2. **Robô no GitHub Actions.** O agendamento atrasa de 5 a 30 min nos horários cheios e pode pular execuções. Além disso, cada atualização vira um commit: o histórico do repositório cresce sem parar (hoje há um commit de dados a cada 30 min) e cada commit dispara um novo deploy do Pages.
3. **Dados em arquivos.** Tudo é recalculado e regravado inteiro a cada execução, e não há histórico consultável (temporadas anteriores, confronto direto de anos passados, séries históricas de jogador). Com as Séries B, C e D, mais copas e estaduais, os arquivos já somam vários MB.
4. **Sem conta de usuário.** Favoritos, palpites do simulador e histórico de busca ficam só no aparelho (`localStorage`). Para notificações de gol, bolões ou sincronizar entre celular e computador, é preciso um banco com usuários.
5. **Fontes de dados.** A ESPN é usada pelos endpoints públicos do site deles, sem contrato. Para um produto comercial, isso não basta: é preciso uma fonte licenciada (veja abaixo).

## Recomendação

**Precisa de banco de dados? Sim**, a partir do momento em que houver contas de usuário ou histórico de temporadas. Para o site como está (só leitura), arquivos estáticos ainda dão conta.

**Migrar da hospedagem? Sim**, para um provedor com contrato comercial, deploy separado dos dados e agendador confiável. A proposta abaixo cabe nos planos gratuitos no começo e escala sem trocar de arquitetura.

### Arquitetura proposta

```
             ┌──────────────────────────── Cloudflare ────────────────────────────┐
navegador ── │  Pages (site estático, CDN global, tráfego sem limite)             │
             │  Workers (API /api/*, placar ao vivo, cache de borda de 1 a 5 s)   │
             │  Cron Triggers (robô a cada 1 min no dia de jogo, 30 min fora)     │
             │  R2 (snapshots JSON e imagens) · KV (contadores, cache)            │
             └──────────────────────────────┬─────────────────────────────────────┘
                                            │
                                   Supabase (Postgres)
                       times, jogos, eventos, jogadores, temporadas,
                  usuários (Auth), favoritos, palpites, notificações (Realtime)
```

- **Site:** Cloudflare Pages. É o mesmo HTML/CSS/JS de hoje, sem build. O deploy vem do GitHub só quando o código muda, não a cada dado novo.
- **Dados ao vivo:** Workers com cache de borda. Mil pessoas olhando o mesmo jogo geram uma consulta por segundo à fonte, não mil. O Worker `worker/ao-vivo.mjs` já existe e é o embrião disso.
- **Robô:** Cron Triggers do Cloudflare, ou a API Python num contêiner pequeno (Fly.io, Railway, Render) gravando no banco em vez de fazer commit. O Python atual só usa biblioteca padrão, então roda em qualquer um desses.
- **Banco:** Supabase (Postgres gerenciado com autenticação, Realtime e armazenamento). As tabelas de jogos e eventos ficam pequenas: uma temporada de todas as competições do site soma menos de 10 mil jogos. O Realtime do Supabase serve para empurrar o gol para o navegador sem consultas repetidas. Uma alternativa mais simples é o Cloudflare D1 (SQLite), que cobre só leitura e escrita leve.
- **Custo inicial:** Pages e Workers grátis até 100 mil requisições por dia (US$ 5 por mês no plano pago, com 10 milhões). Supabase grátis até 500 MB (US$ 25 por mês no Pro). Na prática, de US$ 0 a 30 por mês até alguns milhares de usuários por dia.

### Fontes de dados para um produto comercial

| Necessidade | Hoje | Para produto |
|---|---|---|
| Placar ao vivo, Série A e B, copas, estaduais | ESPN (endpoints públicos, sem contrato) | API-Football (a partir de US$ 19 por mês, já suportada pelo robô com `API_FOOTBALL_KEY`), Sportmonks ou um contrato com Stats Perform/Opta |
| Séries C e D | Wikipédia (sem placar ao vivo) | API-Football (ligas 75 e 76, já ligadas no robô) |
| Escudos | ESPN e Wikimedia Commons (só imagens livres) | licença das marcas com os clubes e a CBF, ou o pacote de imagens do provedor de dados |
| Logos das competições | emblemas desenhados pelo próprio site | licença com CBF, CONMEBOL e federações estaduais; sem ela, continuar com os emblemas próprios |
| Fotos de jogadores | Wikimedia Commons e Flickr (só licenças que permitem uso comercial) | agência de fotos (Getty, AGIF, Gazeta Press) ou o pacote do provedor |

### Ordem de migração sugerida

1. **Cloudflare Pages** com o mesmo repositório. O robô continua no Actions por enquanto, mas grava os snapshots no R2 em vez de fazer commit, e o site lê de lá. Isso já acaba com os commits de dados.
2. **Supabase** com as tabelas `competicoes`, `clubes`, `jogos`, `eventos`, `jogadores` e `classificacao`. O robô passa a gravar no banco, e o Worker serve `/api/*` lendo o banco com cache de borda.
3. **Contas de usuário** (Supabase Auth): favoritos e palpites sincronizados, e notificação de gol do clube favorito (Web Push).
4. **Fonte licenciada** no lugar dos endpoints públicos da ESPN, antes de qualquer lançamento comercial.

A migração depende de criar as contas no Cloudflare e no Supabase e de configurar as chaves. Isso cabe ao dono do projeto, porque envolve credenciais e cobrança.

## Login opcional e escalações salvas (revisto em 12/11/2026)

**Ainda não é obrigatório ter banco de dados**: tudo que o torcedor monta (janela de transferências, escalação do clube, simulador) fica no navegador dele (`localStorage`, uma chave por recurso, como `placar:janela-cruzeiro`) e o link de compartilhar carrega o elenco inteiro no endereço. Os dados públicos (elencos, jogos, finanças) seguem como arquivos estáticos gerados pelo robô, que é o jeito mais barato e rápido de servir.

**O banco passa a ser necessário no dia em que entrar o login**, porque o login só tem sentido se a escalação salva aparecer em outro aparelho. O caminho recomendado continua sendo o **Supabase** (Postgres + Auth):
- **Auth**: e-mail com link mágico e Google/Apple; login nunca obrigatório.
- **Tabela `salvos`**: `usuario (uuid) · tipo ('janela' | 'escalacao' | 'simulador') · clube · dados (jsonb, o mesmo objeto que hoje vai para o localStorage) · atualizado_em`, chave única em `(usuario, tipo, clube)`.
- **RLS** (row level security): cada usuário só lê e grava as próprias linhas; a chave pública (anon) do Supabase pode ficar no site.
- **Sincronização**: sem login, nada muda (localStorage). Ao entrar, o que está no aparelho sobe para a conta (o mais novo vence, por `atualizado_em`) e, dali em diante, cada gravação local também vai para o Supabase.
- **Elencos compartilhados**: o link curto atual continua; com login, dá para guardar o elenco com um id e ter página pública com o cartaz.
- **Custo**: o plano gratuito do Supabase cobre dezenas de milhares de usuários com esse volume (alguns KB por escalação).
