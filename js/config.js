/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Autor: Alan Evangelista de Souza Martins. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* PLACAR — configuração do placar ao vivo.
   aoVivo: endereço do Worker da API-Football (passo a passo em worker/README.md),
           por exemplo "https://placar-ao-vivo.SEU-USUARIO.workers.dev".
           Vazio: placar e minuto a minuto vêm só da ESPN.
   intervalo: de quantos em quantos segundos o site consulta o Worker durante os jogos
              (use o mesmo INTERVALO_SEGUNDOS do worker/wrangler.toml). */
window.PLACAR_CONFIG = {
  /* api: Worker da Cloudflare do CazéStats.TV (worker/): repasse da ESPN com cache de borda, "Em alta", banco D1
     e registro de erros (js/rede.js). Vazio: o site consulta tudo direto. */
  api: "https://cazestats-api.alanmartinsdesouza07.workers.dev",
  aoVivo: "",
  /* googleClientId: ID do cliente OAuth do Google ("Entrar com Google", js/conta.js). É público (vai no site). Vazio: sem login. */
  googleClientId: "545408326652-m42ttef21gt1oroe8ooaff7p2uv5uoc3.apps.googleusercontent.com",
  intervalo: 15,
  /* hinos: ids dos clubes com o instrumental do hino LICENCIADO em media/hinos/<id>.mp3 (ex.: ["cruzeiro"]).
     Vazio: o gol toca a fanfarra própria de cada clube (js/sons.js). */
  hinos: [],
  /* escudosOficiais: true = imagem oficial (Wikimedia/ESPN); false = escudo desenhado pelo site (cores + sigla).
     Os escudos são marcas registradas dos clubes (risco J3 em docs/RISCOS-APRESENTACAO.md): ligado enquanto o site é do
     dono; antes de apresentar a uma empresa, avaliar desligar. */
  escudosOficiais: true,
  /* marca: nome exibido (o app Android troca para "433Fut" ao empacotar, em app/montar-www.mjs) */
  marca: "CazéStats.TV",
};
