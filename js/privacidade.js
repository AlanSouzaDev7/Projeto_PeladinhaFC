/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — página "Privacidade e termos" (#/privacidade), no site e no app
   RASCUNHO A REVISAR POR ADVOGADO. O texto descreve o que o código faz hoje; ao mudar o que o site grava,
   envia ou consulta, este texto muda junto. A lista do que fica no aparelho é lida do próprio código (CHAVES).
   ========================================================================== */
(() => {
  "use strict";
  const esc = (x) => window.SEG.esc(x);

  // o que fica guardado no aparelho (localStorage / sessionStorage), com a chave de cada um
  const CHAVES = [
    ["Tema claro ou escuro", "placar:theme"],
    ["Clubes favoritos", "placar:favs"],
    ["Votos e palpites do simulador da tabela e das copas", "placar:votes, placar:simulador, placar:copa-sim-*"],
    ["Escalações montadas por você (elenco, Bora pro jogo, Janela de transferências)", "placar:xi2:*, placar:bora, placar:janela-*"],
    ['Últimas 10 buscas e quando cada item foi contado no "Em alta"', "placar:busca-hist, placar:busca-enviada"],
    ["Preferência de fotos e pausa da faixa de notícias", "placar:fotos-privadas, tk-pausa"],
    ["Aberturas animadas já vistas nesta visita", "placar:intros, placar:tema-bora (apagadas ao fechar)"],
  ];
  // endereços de terceiros que o aparelho pode contatar, e por quê
  const TERCEIROS = [
    [
      "ESPN (site.api.espn.com, site.web.api.espn.com, a.espncdn.com)",
      "placar, tabela e agenda ao vivo; imagens de times de fora da Série A",
    ],
    ["Wikimedia Commons e Flickr", "só se você tocar no crédito de uma foto (as fotos livres são cópias guardadas no próprio projeto)"],
    ["GitHub Pages (alansouzadev7.github.io)", "hospedagem do site e dos arquivos de dados"],
    ["Cloudflare Workers", 'placar ao vivo e contagem do "Em alta", só quando configurado'],
  ];

  function page() {
    const li = (xs) => xs.map(([a, b]) => `<li><b>${esc(a)}</b><small>${esc(b)}</small></li>`).join("");
    return `<div class="page-head"><div><div class="eyebrow">Privacidade e termos</div><h1>Privacidade e termos de uso</h1>
        <p class="priv-aviso" role="note"><b>Rascunho a revisar por advogado.</b> Este texto ainda não foi revisado juridicamente e pode mudar.</p></div></div>
      <div class="priv">
        <section class="card"><div class="card-h">Resumo</div><div class="card-b">
          <p>CazéStats.TV não pede cadastro, não usa cookies e não tem ferramenta de análise de audiência. Suas preferências ficam no seu aparelho.
          O único dado enviado pelo site é a contagem anônima do que foi buscado, quando o "Em alta" estiver ligado.</p></div></section>
        <section class="card"><div class="card-h">O que fica no seu aparelho</div><div class="card-b">
          <p>Guardado só no navegador ou no app, no seu aparelho. Não sai dele e você pode apagar limpando os dados do site ou do app.</p>
          <ul class="priv-lista">${li(CHAVES)}</ul></div></section>
        <section class="card"><div class="card-h">O que é enviado</div><div class="card-b">
          <p><b>Contagem do "Em alta".</b> Ao abrir um clube ou jogador pela busca, o aparelho envia o tipo e o código do item (por exemplo, "clube: cruzeiro"),
          no máximo uma vez a cada 6 horas por item. Não vai nome, e-mail, localização nem identificador do aparelho. Só acontece quando o serviço do "Em alta" está configurado.</p></div></section>
        <section class="card"><div class="card-h">Serviços de terceiros</div><div class="card-b">
          <p>Para mostrar dados e imagens, o seu aparelho se conecta a estes serviços. Como em qualquer acesso à internet, eles recebem o endereço IP da conexão e seguem as próprias políticas de privacidade.</p>
          <ul class="priv-lista">${li(TERCEIROS)}</ul>
          <p>Links de notícias abrem o site do veículo, fora do CazéStats.TV.</p></div></section>
        <section class="card"><div class="card-h">Termos de uso</div><div class="card-b">
          <p>O conteúdo é informativo. Placares, tabelas, elencos e notícias vêm de fontes públicas e podem ter atraso ou erro; confira na fonte oficial antes de tomar qualquer decisão.</p>
          <p>Valores de mercado e salários individuais são <b>estimativas</b> do CazéStats.TV, mostradas em faixas, e não números oficiais. As notas dos jogadores seguem critérios próprios.</p>
          <p>Nomes e marcas de clubes e competições pertencem aos seus donos. Os escudos e emblemas mostrados são desenhos do próprio site.</p>
          <p>Código, design e marca do CazéStats.TV são protegidos (veja os direitos no rodapé).</p></div></section>
        <section class="card"><div class="card-h">Contato</div><div class="card-b">
          <p>Dúvidas e pedidos sobre privacidade: <a href="https://github.com/AlanSouzaDev7" target="_blank" rel="noopener noreferrer">página do autor no GitHub ↗</a>.</p></div></section>
      </div>`;
  }
  window.PRIVACIDADE = Object.freeze({ page, CHAVES, TERCEIROS });
})();
