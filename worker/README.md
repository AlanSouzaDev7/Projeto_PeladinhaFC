# Placar ao vivo pela API-Football

Worker da Cloudflare que guarda a chave da [API-Football](https://www.api-football.com/) e entrega ao site o placar, a situação e os lances dos jogos dos 20 clubes. Sem ele, o site usa a ESPN (que continua de reserva mesmo com ele ligado).

```
navegador ──(a cada ~15 s, durante os jogos)──▶ Worker ──(no máximo 1 vez a cada INTERVALO_SEGUNDOS)──▶ API-Football
     └────────────── se o Worker falhar ou esgotar o limite ──────────────▶ ESPN
```

## Ligar (uns 10 minutos, uma vez só)

1. **Chave da API-Football:** crie a conta em <https://dashboard.api-football.com/register> e copie a chave em *Account › My Access*.
   - Confira no painel se o seu plano cobre a **temporada atual** do Brasileirão. Alguns planos grátis só liberam temporadas passadas.
2. **Conta na Cloudflare:** grátis em <https://dash.cloudflare.com/sign-up>.
3. **Publicar o Worker**, na pasta `worker/`:
   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put API_FOOTBALL_KEY
   npx wrangler deploy
   ```
   O `deploy` mostra o endereço, algo como `https://placar-ao-vivo.SEU-USUARIO.workers.dev`.
4. **Testar:** abra `https://placar-ao-vivo.SEU-USUARIO.workers.dev/saude`. Deve aparecer `"ok": true`.
5. **Ligar no site:** em [`js/config.js`](../js/config.js), coloque o endereço em `aoVivo` e envie para o GitHub.

## Plano grátis ou pago

| Plano | Consultas por dia | `INTERVALO_SEGUNDOS` sugerido | Placar no site |
|---|---|---|---|
| Grátis | 100 | 240 ou mais | atualiza a cada ~4 min (para placar mais rápido, a ESPN é melhor) |
| Pago (a partir de ~US$ 19/mês) | 7.500 ou mais | 15 | atualiza a cada ~15 s |

Ajuste em `wrangler.toml` e rode `npx wrangler deploy` de novo. Use o mesmo valor em `intervalo` no `js/config.js`.

Quando o limite do dia está perto do fim, o Worker para de consultar até a meia-noite (UTC) e o site volta para a ESPN sozinho.

## Testes

```bash
node tests/worker.mjs
```
Testa o Worker com a API-Football simulada: nomes dos clubes, placar, intervalo, gol contra, filtro de times, memória entre visitantes e limite do dia.

```bash
python -m http.server 5173
BASE=http://localhost:5173 node tests/mobile/simulacao.mjs
```
Roda um jogo hipotético ao vivo (Cruzeiro x Flamengo, ~3 min) em três cenários: só ESPN, com o Worker, e com o Worker fora do ar. Mede quantos segundos cada lance leva para aparecer no site.
