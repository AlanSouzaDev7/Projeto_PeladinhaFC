/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — um endereço só: quem abre pelo GitHub Pages (alansouzadev7.github.io/Projeto_PeladinhaFC/) vai para o
   site publicado no Cloudflare (cazestats.pages.dev), com a mesma rota (#/clube/...), parâmetros e página.
   Por quê: o GitHub Pages serve os arquivos sem a versão no nome e com 10 min de cache, então podia mostrar código velho;
   e, sendo outro endereço, guarda à parte as preferências (fotos, tema, janela de transferências). Carregado primeiro no
   <head>, antes de qualquer estilo ou script, para a troca ser imediata.
   ========================================================================== */
(() => {
  "use strict";
  if (!/\.github\.io$/i.test(location.hostname)) return;
  const resto = location.pathname.replace(/^\/Projeto_PeladinhaFC\/?/i, "");
  location.replace(`https://cazestats.pages.dev/${resto}${location.search}${location.hash}`);
})();
