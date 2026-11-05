/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* PLACAR — configuração do placar ao vivo.
   aoVivo: endereço do Worker da API-Football (passo a passo em worker/README.md),
           por exemplo "https://placar-ao-vivo.SEU-USUARIO.workers.dev".
           Vazio: placar e minuto a minuto vêm só da ESPN.
   intervalo: de quantos em quantos segundos o site consulta o Worker durante os jogos
              (use o mesmo INTERVALO_SEGUNDOS do worker/wrangler.toml). */
window.PLACAR_CONFIG = {
  aoVivo: "",
  intervalo: 15,
};
