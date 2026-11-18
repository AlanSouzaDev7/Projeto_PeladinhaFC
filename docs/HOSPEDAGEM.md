<!-- © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. -->
# CazéStats.TV — hospedagem gratuita, banco de dados e escala (sem domínio próprio)

> Premissa: **sem capital inicial**. Tudo abaixo é gratuito; o que for pago está marcado com 💲 e listado no fim.
> Contas, senhas e chaves ficam com o dono do projeto. O código já está pronto: só falta criar as contas e colar as chaves.

## Onde hospedar de graça (comparativo)

| Serviço | Endereço grátis | Limite do plano grátis | Serve para | Nota |
|---|---|---|---|---|
| **Cloudflare Pages** ✅ escolhido | `cazestats.pages.dev` | tráfego **sem limite**, 500 publicações/mês, 20 mil arquivos, 25 MB por arquivo | site | CDN no mundo todo, inclusive no Brasil; uso comercial permitido |
| **Cloudflare Workers** ✅ | `cazestats-api.<usuario>.workers.dev` | 100 mil requisições/dia, cron grátis | API, placar ao vivo, agendador | resolve escala e cache compartilhado |
| **Cloudflare D1** ✅ | — | 5 GB, 5 milhões de leituras/dia | banco (dados não essenciais) | SQLite gerenciado |
| GitHub Pages (atual) | `alansouzadev7.github.io/...` | 100 GB de tráfego/mês (limite brando), 1 GB de site | site | termos não são para negócio/SaaS comercial |
| Netlify | `cazestats.netlify.app` | 100 GB de tráfego/mês, 300 min de build | site | bom, mas tráfego limitado |
| Vercel (Hobby) | `cazestats.vercel.app` | 100 GB/mês | site | plano Hobby **proíbe uso comercial** |
| Supabase | — | 500 MB de banco, pausa após 1 semana sem uso | banco + login | ótimo quando entrar login de usuário |
| Render (estático) | `cazestats.onrender.com` | 100 GB/mês | site | serviços dinâmicos grátis "dormem" |

**Recomendação:** Cloudflare (Pages + Workers + D1). É o único da lista com tráfego sem limite e uso comercial no
plano grátis, e o mesmo painel cobre site, API, cache de borda, agendador e banco.

## O que já está pronto no código

| Peça | Arquivo | O que resolve |
|---|---|---|
| Montagem do site com versão nos arquivos, cache e SEO | `scripts/montar-site.mjs` | E3, E6 |
| Publicação automática no Cloudflare Pages | `.github/workflows/publicar.yml` | hospedagem |
| Worker: placar, repasse da ESPN com cache de borda, banco, agendador | `worker/ao-vivo.mjs`, `worker/plataforma.mjs` | E1, E2, E7, ponto 3, ponto 6 |
| Banco D1 (buscas "Em alta", erros do navegador, escalações compartilhadas) | `worker/schema.sql` | banco de dados (Trello) |
| Site usando o Worker quando configurado | `js/rede.js` + `js/config.js` (`aoVivo`) | escala e observabilidade |
| Dados fora do `main` | variável `DADOS_NO_RAMO=1` | ponto 5 |

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

## Quanto aguenta (estimativa com o plano grátis)

| Cenário | Antes | Com Cloudflare |
|---|---|---|
| 1.000 pessoas vendo um jogo | 75 mil consultas/min à ESPN (bloqueio certo) | ~60 consultas/min à ESPN (cache de 1 s na borda) |
| Visitas por dia | limitado pelos 100 GB/mês do GitHub | tráfego estático sem limite; API até 100 mil requisições/dia |
| Robô atrasado | até 8 h sem gravar (13/11) | a cada 30 min pelo cron do Worker |

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
