<!-- © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. -->
# CazéStats.TV — hospedagem gratuita, banco de dados e escala (sem domínio próprio)

> Premissa: **sem capital inicial**. Tudo abaixo é gratuito; o que for pago está marcado com 💲 e listado no fim.
> Contas, senhas e chaves ficam com o dono do projeto. O código já está pronto: só falta criar as contas e colar as chaves.

## Onde hospedar de graça (comparativo)

| Serviço | Endereço grátis | Limite do plano grátis | Serve para | Nota |
|---|---|---|---|---|
| **Cloudflare Pages** ✅ escolhido | `cazestats.pages.dev` | tráfego **sem limite**, 500 publicações/mês, 20 mil arquivos, 25 MB por arquivo | site | CDN no mundo todo, inclusive no Brasil; uso comercial permitido |
| **Cloudflare Workers** ✅ | `cazestats-api.<usuario>.workers.dev` | 100 mil requisições/dia, cron grátis | API, placar ao vivo, agendador | resolve escala e cache compartilhado |
| **Cloudflare D1** ✅ | — | 5 GB, 5 milhões de linhas lidas/dia, 100 mil gravadas/dia, sem cartão | banco: dados do site, buscas, erros, escalações | SQLite gerenciado, na mesma rede do Worker |
| GitHub Pages (atual) | `alansouzadev7.github.io/...` | 100 GB de tráfego/mês (limite brando), 1 GB de site | site | termos não são para negócio/SaaS comercial |
| Netlify | `cazestats.netlify.app` | 100 GB de tráfego/mês, 300 min de build | site | bom, mas tráfego limitado |
| Vercel (Hobby) | `cazestats.vercel.app` | 100 GB/mês | site | plano Hobby **proíbe uso comercial** |
| Supabase | — | 500 MB de banco, pausa após 1 semana sem uso | banco + login | ótimo quando entrar login de usuário |
| Render (estático) | `cazestats.onrender.com` | 100 GB/mês | site | serviços dinâmicos grátis "dormem" |

**Recomendação:** Cloudflare (Pages + Workers + D1). É o único da lista com tráfego sem limite e uso comercial no
plano grátis, e o mesmo painel cobre site, API, cache de borda, agendador e banco.

## Situação (18/11/2026)

| Peça | Endereço | Estado |
|---|---|---|
| Site (Cloudflare Pages) | https://cazestats.pages.dev | no ar (primeira publicação feita pelo terminal) |
| Worker | https://cazestats-api.alanmartinsdesouza07.workers.dev | no ar, com banco D1 `cazestats` e cron de 30 min |
| Publicação automática pelo GitHub | workflow Publicar | funcionando (segredos criados em 18/11) |
| Dados do site no banco D1 (tabela `arquivos`) | `<Worker>/dados/<nome>.json` | tabela e rotas no ar; falta o segredo `ROBO_CHAVE` (passo 6) para o robô começar a enviar |
| GitHub Pages | https://alansouzadev7.github.io/Projeto_PeladinhaFC/ | continua no ar em paralelo |

Ao criar o token pelo modelo "Edit Cloudflare Workers", **apague a regra "Edit Zone policy"** (pede um domínio, que o projeto
não tem) e confira as permissões Workers Scripts, Cloudflare Pages e D1 como Edit.
A ESPN recusa `site.web.api.espn.com` vindo da Cloudflare: o Worker busca sempre em `site.api.espn.com` (mesmos caminhos).

## O que já está pronto no código

| Peça | Arquivo | O que resolve |
|---|---|---|
| Montagem do site com versão nos arquivos, cache e SEO | `scripts/montar-site.mjs` | E3, E6 |
| Publicação automática no Cloudflare Pages | `.github/workflows/publicar.yml` | hospedagem |
| Worker: placar, repasse da ESPN com cache de borda, banco, agendador | `worker/ao-vivo.mjs`, `worker/plataforma.mjs` | E1, E2, E7, ponto 3, ponto 6 |
| Banco D1 (buscas "Em alta", erros do navegador, escalações compartilhadas) | `worker/schema.sql` | banco de dados (Trello) |
| Site usando o Worker quando configurado | `js/rede.js` + `js/config.js` (`aoVivo`) | escala e observabilidade |
| Dados fora do `main` | variável `DADOS_NO_RAMO=1` | ponto 5 |
| Dados do site no banco D1: o robô envia só o que mudou, o site lê de lá e usa a cópia estática se o banco falhar | `server/enviar_d1.py`, `js/dados.js`, rotas `/dados/` do Worker | limite de 500 publicações/mês do Pages; dado novo sem republicar |

## Passo a passo (uns 20 minutos, uma vez)

### 1. Conta Cloudflare (grátis, sem cartão)
1. Crie a conta em https://dash.cloudflare.com/sign-up.
2. No painel, copie o **Account ID** (coluna da direita em "Workers & Pages").
3. Em *My Profile → API Tokens → Create Token*, use o modelo **"Edit Cloudflare Workers"** e acrescente a permissão
   *Account → Cloudflare Pages → Edit* e *Account → D1 → Edit*. Copie o token (aparece uma vez só).

### 2. Segredos no GitHub
Em *Settings → Secrets and variables → Actions* do repositório:
- **Secrets:** `CLOUDFLARE_API_TOKEN` (o token do passo 1) e `CLOUDFLARE_ACCOUNT_ID`.
- **Variables:** `CLOUDFLARE_PROJETO` = `cazestats` (ou outro nome livre; vira `<nome>.pages.dev`).

Na próxima mudança no `main` (ou em *Actions → Publicar → Run workflow*), o site sobe para `https://cazestats.pages.dev`.
O GitHub Pages continua no ar em paralelo até você decidir desligá-lo.

### 3. Worker e banco (no seu computador, com Node instalado)
```bash
cd worker
npx wrangler login
npx wrangler d1 create cazestats
```
Cole o `database_id` que aparecer no bloco `[[d1_databases]]` de `worker/wrangler.toml` (tire o `#` das 4 linhas), e:
```bash
npx wrangler d1 execute cazestats --remote --file=schema.sql
npx wrangler deploy
```
O Worker fica em `https://cazestats-api.<seu-usuario>.workers.dev`. Ponha esse endereço em `js/config.js`
(`aoVivo: "https://cazestats-api.<seu-usuario>.workers.dev"`) e troque, no `index.html`, `https://*.workers.dev` da
política de segurança pelo endereço exato do Worker.

### 4. Agendador confiável do robô (ponto 6)
1. No GitHub: *Settings (do seu perfil) → Developer settings → Fine-grained tokens → Generate*, só para este repositório,
   com a permissão **Actions: Read and write**.
2. `cd worker && npx wrangler secret put GITHUB_DISPARO` e cole o token.
Pronto: a cada 30 minutos o Worker dispara o robô (gatilho de cron grátis), sem os atrasos de horas do GitHub.

### 5. Dados fora do `main` (ponto 5, opcional)
Crie a variável `DADOS_NO_RAMO` = `1`. O robô passa a gravar no ramo `dados`, e o histórico do `main` fica só com código.
Se usar o GitHub Pages junto, mude *Settings → Pages → Source* para **GitHub Actions** e crie a variável
`PAGES_POR_ACTIONS` = `1`.

### 6. Dados do site no banco D1 (uma vez)

Por quê: o Cloudflare Pages grátis aceita **500 publicações por mês**, e o robô roda cerca de 70 vezes por dia. Sem o banco,
cada rodada republica o site e o limite acaba em cerca de uma semana. Com o banco, o robô grava os `dados/*.json` no D1
(`server/enviar_d1.py`, só o que mudou), o site lê de `<Worker>/dados/<nome>.json` (`js/dados.js`) e o Pages só é republicado
quando o código muda. Se o banco falhar, o site usa a cópia estática e o workflow volta a publicar do jeito antigo.

Falta só uma chave combinada entre o robô (GitHub) e o Worker (Cloudflare), o `ROBO_CHAVE`. O comando abaixo (PowerShell,
na pasta do projeto) sorteia uma chave forte e grava nos dois lugares, sem mostrar o valor na tela:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $k = -join ($b | % { $_.ToString('x2') }); $k | npx --yes wrangler@4.48.0 secret put ROBO_CHAVE --config worker/wrangler.toml; gh secret set ROBO_CHAVE --body $k; Remove-Variable k, b
```

Na rodada seguinte do robô, o passo "Enviar os dados ao banco" fica verde e o passo "Publicar o site" é pulado.

## Quanto aguenta (estimativa com o plano grátis)

| Cenário | Antes | Com Cloudflare |
|---|---|---|
| 1.000 pessoas vendo um jogo | 75 mil consultas/min à ESPN (bloqueio certo) | ~60 consultas/min à ESPN (cache de 1 s na borda) |
| Visitas por dia | limitado pelos 100 GB/mês do GitHub | tráfego estático sem limite; API até 100 mil requisições/dia |
| Robô atrasado | até 8 h sem gravar (13/11) | a cada 30 min pelo cron do Worker |
| Publicações do site | 1 por rodada do robô (~2.100/mês, acima do limite de 500) | só quando o código muda; os dados vão para o D1 (~80 linhas por rodada, bem abaixo das 100 mil gravações/dia) |
| Worker passa de 100 mil pedidos no dia | — | o site volta sozinho para a ESPN direta (`js/rede.js`) e para os dados estáticos (`js/dados.js`); nada sai do ar |

Acima de 100 mil requisições/dia na API: 💲 Workers Paid, US$ 5/mês (10 milhões de requisições).

## O que é pago (avisado e documentado)

| Item | Para quê | Custo | Obrigatório? |
|---|---|---|---|
| 💲 Domínio próprio (ex.: cazestats.com.br) | endereço sem `.pages.dev` | ~R$ 40/ano (.com.br) | não |
| 💲 Workers Paid | mais de 100 mil requisições/dia | US$ 5/mês | só com muito público |
| 💲 API-Football Pro | placar ao vivo licenciado, Séries C/D, fotos | US$ 16 a 36/mês | para vender |
| 💲 Fonte licenciada de dados de evento (Opta, Sportmonks) | mapa de calor e notas com licença | sob consulta | para vender |
| 💲 Agência de fotos | fotos com licença comercial | sob consulta | para vender |

A lista completa de funções premium está em `docs/FUNCIONALIDADES-PREMIUM.pdf`.
