/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — tomada de drone do estádio na faixa da partida
   Foto aérea real do estádio do jogo (Wikimedia Commons, licença livre, créditos na faixa) e uma câmera de drone
   feita em código: começa no céu, acima das nuvens, atravessa as nuvens descendo e inclinando para baixo até o
   estádio aparecer atrás do placar, freia como um drone de verdade e fica parada.
   Fluido: só transform e opacity (placa de vídeo), começa quando a foto já está decodificada, foto menor no celular.
   Sem animação (movimento reduzido ou ?estatico): a foto aparece já no quadro final.
   ========================================================================== */
window.DRONE = (() => {
  // estádio: foto (960 px e 1920 px), autor, licença, página da foto e o ponto (em %) onde está o estádio na foto
  const EST = {
    "mineirao": {
      "ar": 1.5,
      "nome": "Mineirão",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Mineir%C3%A3o_A%C3%A9rea.jpg/960px-Mineir%C3%A3o_A%C3%A9rea.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/Mineir%C3%A3o_A%C3%A9rea.jpg/1920px-Mineir%C3%A3o_A%C3%A9rea.jpg",
      "autor": "Rodrigo Lima/Portal da Copa",
      "licenca": "CC BY 2.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Mineir%C3%A3o_A%C3%A9rea.jpg",
      "foco": [
        47,
        45
      ]
    },
    "maracana": {
      "ar": 1.5,
      "nome": "Maracanã",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Aerial_view_of_the_Maracan%C3%A3_Stadium.jpg/960px-Aerial_view_of_the_Maracan%C3%A3_Stadium.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Aerial_view_of_the_Maracan%C3%A3_Stadium.jpg/1920px-Aerial_view_of_the_Maracan%C3%A3_Stadium.jpg",
      "autor": "Pedro Lopez from Ottawa, Canada",
      "licenca": "CC BY 2.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Aerial_view_of_the_Maracan%C3%A3_Stadium.jpg",
      "foco": [
        50,
        55
      ]
    },
    "arena-mrv": {
      "ar": 1.778,
      "nome": "Arena MRV",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/ARENA_MRV.jpg/960px-ARENA_MRV.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/ARENA_MRV.jpg/1920px-ARENA_MRV.jpg",
      "autor": "Heuler.silva",
      "licenca": "CC BY-SA 4.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:ARENA_MRV.jpg",
      "foco": [
        48,
        50
      ]
    },
    "fonte-nova": {
      "ar": 1.5,
      "nome": "Arena Fonte Nova",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Arena_Fonte_Nova_External_View.jpg/960px-Arena_Fonte_Nova_External_View.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/Arena_Fonte_Nova_External_View.jpg/1920px-Arena_Fonte_Nova_External_View.jpg",
      "autor": "Faquini Produção Fotográfica; Fotógrafo David Campbell;",
      "licenca": "CC BY 3.0 br",
      "pagina": "https://commons.wikimedia.org/wiki/File:Arena_Fonte_Nova_External_View.jpg",
      "foco": [
        50,
        48
      ]
    },
    "nabi-abi-chedid": {
      "ar": 1.333,
      "nome": "Nabi Abi Chedid",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/37/Est%C3%A1dio_Nabi_Abi_Chedid.jpg/960px-Est%C3%A1dio_Nabi_Abi_Chedid.jpg",
      "w1920": "https://upload.wikimedia.org/wikipedia/commons/3/37/Est%C3%A1dio_Nabi_Abi_Chedid.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
      "autor": "Renato Patinhas",
      "licenca": "CC BY 3.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Est%C3%A1dio_Nabi_Abi_Chedid.jpg",
      "foco": [
        50,
        55
      ]
    },
    "arena-conda": {
      "ar": 4.444,
      "nome": "Arena Condá",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Vista_Panor%C3%A2mica_da_Arena_Cond%C3%A1.jpg/960px-Vista_Panor%C3%A2mica_da_Arena_Cond%C3%A1.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Vista_Panor%C3%A2mica_da_Arena_Cond%C3%A1.jpg/1920px-Vista_Panor%C3%A2mica_da_Arena_Cond%C3%A1.jpg",
      "autor": "Faxinalense",
      "licenca": "CC BY-SA 4.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Vista_Panor%C3%A2mica_da_Arena_Cond%C3%A1.jpg",
      "foco": [
        40,
        60
      ]
    },
    "neo-quimica": {
      "ar": 1.778,
      "nome": "Neo Química Arena",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Arena_Corinthians_Vista_do_Metr%C3%B4.jpg/960px-Arena_Corinthians_Vista_do_Metr%C3%B4.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Arena_Corinthians_Vista_do_Metr%C3%B4.jpg/1920px-Arena_Corinthians_Vista_do_Metr%C3%B4.jpg",
      "autor": "Anderson Bueno Pereira",
      "licenca": "CC BY-SA 4.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Arena_Corinthians_Vista_do_Metr%C3%B4.jpg",
      "foco": [
        55,
        42
      ]
    },
    "couto-pereira": {
      "ar": 1.333,
      "nome": "Couto Pereira",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ca/Est%C3%A1dio_Major_Ant%C3%B4nio_Couto_Pereira%2C_2007-2.jpg/960px-Est%C3%A1dio_Major_Ant%C3%B4nio_Couto_Pereira%2C_2007-2.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ca/Est%C3%A1dio_Major_Ant%C3%B4nio_Couto_Pereira%2C_2007-2.jpg/1920px-Est%C3%A1dio_Major_Ant%C3%B4nio_Couto_Pereira%2C_2007-2.jpg",
      "autor": "Kevinklop",
      "licenca": "CC BY-SA 3.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Est%C3%A1dio_Major_Ant%C3%B4nio_Couto_Pereira,_2007-2.jpg",
      "foco": [
        50,
        50
      ]
    },
    "arena-gremio": {
      "ar": 1.5,
      "nome": "Arena do Grêmio",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/IBPA_14868_-_Est%C3%A1dio_Arena_do_Gr%C3%AAmio_-_2018-08-10_-_Luciano_Lanes-PMPA.jpg/960px-IBPA_14868_-_Est%C3%A1dio_Arena_do_Gr%C3%AAmio_-_2018-08-10_-_Luciano_Lanes-PMPA.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/IBPA_14868_-_Est%C3%A1dio_Arena_do_Gr%C3%AAmio_-_2018-08-10_-_Luciano_Lanes-PMPA.jpg/1920px-IBPA_14868_-_Est%C3%A1dio_Arena_do_Gr%C3%AAmio_-_2018-08-10_-_Luciano_Lanes-PMPA.jpg",
      "autor": "Luciano Lanes/ PMPA",
      "licenca": "Attribution",
      "pagina": "https://commons.wikimedia.org/wiki/File:IBPA_14868_-_Est%C3%A1dio_Arena_do_Gr%C3%AAmio_-_2018-08-10_-_Luciano_Lanes-PMPA.jpg",
      "foco": [
        32,
        42
      ]
    },
    "beira-rio": {
      "ar": 1.499,
      "nome": "Beira-Rio",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/IBPA_14814_-_Est%C3%A1dio_Beira-Rio_-_2018-08-10_-_Ricardo_Giusti-PMPA.jpg/960px-IBPA_14814_-_Est%C3%A1dio_Beira-Rio_-_2018-08-10_-_Ricardo_Giusti-PMPA.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/02/IBPA_14814_-_Est%C3%A1dio_Beira-Rio_-_2018-08-10_-_Ricardo_Giusti-PMPA.jpg/1920px-IBPA_14814_-_Est%C3%A1dio_Beira-Rio_-_2018-08-10_-_Ricardo_Giusti-PMPA.jpg",
      "autor": "Ricardo Giusti / PMPA",
      "licenca": "Attribution",
      "pagina": "https://commons.wikimedia.org/wiki/File:IBPA_14814_-_Est%C3%A1dio_Beira-Rio_-_2018-08-10_-_Ricardo_Giusti-PMPA.jpg",
      "foco": [
        42,
        70
      ]
    },
    "maiao": {
      "ar": 1.775,
      "nome": "Maião",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Cruzeiro-cruzeiro-mirassol-est%C3%A1dio_campos_maia-1755195575.png/960px-Cruzeiro-cruzeiro-mirassol-est%C3%A1dio_campos_maia-1755195575.png",
      "w1920": "https://upload.wikimedia.org/wikipedia/commons/8/8f/Cruzeiro-cruzeiro-mirassol-est%C3%A1dio_campos_maia-1755195575.png?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
      "autor": "Marcos Freitas/Agência Mirassol",
      "licenca": "CC BY 4.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Cruzeiro-cruzeiro-mirassol-est%C3%A1dio_campos_maia-1755195575.png",
      "foco": [
        45,
        50
      ]
    },
    "allianz": {
      "ar": 1.322,
      "nome": "Nubank Parque",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Imagens_da_Cidade_de_S%C3%A3o_Paulo_e_Zool%C3%B3gico_da_Capital_Paulista._%2847480340301%29.jpg/960px-Imagens_da_Cidade_de_S%C3%A3o_Paulo_e_Zool%C3%B3gico_da_Capital_Paulista._%2847480340301%29.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Imagens_da_Cidade_de_S%C3%A3o_Paulo_e_Zool%C3%B3gico_da_Capital_Paulista._%2847480340301%29.jpg/1920px-Imagens_da_Cidade_de_S%C3%A3o_Paulo_e_Zool%C3%B3gico_da_Capital_Paulista._%2847480340301%29.jpg",
      "autor": "Governo do Estado de São Paulo",
      "licenca": "CC BY 2.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Imagens_da_Cidade_de_S%C3%A3o_Paulo_e_Zool%C3%B3gico_da_Capital_Paulista._(47480340301).jpg",
      "foco": [
        48,
        48
      ]
    },
    "baenao": {
      "ar": 1.33,
      "nome": "Baenão",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Baen%C3%A3o_2019.jpg/960px-Baen%C3%A3o_2019.jpg",
      "w1920": "https://upload.wikimedia.org/wikipedia/commons/9/95/Baen%C3%A3o_2019.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
      "autor": "RemoUploud",
      "licenca": "CC BY-SA 4.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Baen%C3%A3o_2019.jpg",
      "foco": [
        50,
        62
      ]
    },
    "mangueirao": {
      "ar": 1.333,
      "nome": "Mangueirão",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fe/Est%C3%A1dio_Ol%C3%ADmpico_do_Par%C3%A1_-_2.jpg/960px-Est%C3%A1dio_Ol%C3%ADmpico_do_Par%C3%A1_-_2.jpg",
      "w1920": "https://upload.wikimedia.org/wikipedia/commons/f/fe/Est%C3%A1dio_Ol%C3%ADmpico_do_Par%C3%A1_-_2.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
      "autor": "Jorge Andrade from Rio de Janeiro, Brazil",
      "licenca": "CC BY 2.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Est%C3%A1dio_Ol%C3%ADmpico_do_Par%C3%A1_-_2.jpg",
      "foco": [
        45,
        55
      ]
    },
    "vila-belmiro": {
      "ar": 1.333,
      "nome": "Vila Belmiro",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fb/Est%C3%A1dio_Urbano_Caldeira_-_Vila_Belmiro.jpg/960px-Est%C3%A1dio_Urbano_Caldeira_-_Vila_Belmiro.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fb/Est%C3%A1dio_Urbano_Caldeira_-_Vila_Belmiro.jpg/1920px-Est%C3%A1dio_Urbano_Caldeira_-_Vila_Belmiro.jpg",
      "autor": "Nelson R. de Lima Filho",
      "licenca": "CC BY-SA 4.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Est%C3%A1dio_Urbano_Caldeira_-_Vila_Belmiro.jpg",
      "foco": [
        50,
        48
      ]
    },
    "morumbi": {
      "ar": 1.335,
      "nome": "MorumBIS",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Est%C3%A1dio_do_Morumbi.jpg/960px-Est%C3%A1dio_do_Morumbi.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Est%C3%A1dio_do_Morumbi.jpg/1920px-Est%C3%A1dio_do_Morumbi.jpg",
      "autor": "Arne Müseler",
      "licenca": "CC BY-SA 3.0 de",
      "pagina": "https://commons.wikimedia.org/wiki/File:Est%C3%A1dio_do_Morumbi.jpg",
      "foco": [
        45,
        52
      ]
    },
    "sao-januario": {
      "ar": 1.5,
      "nome": "São Januário",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Est%C3%A1dio_de_S%C3%A3o_Janu%C3%A1rio_by_Diego_Baravelli.jpg/960px-Est%C3%A1dio_de_S%C3%A3o_Janu%C3%A1rio_by_Diego_Baravelli.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Est%C3%A1dio_de_S%C3%A3o_Janu%C3%A1rio_by_Diego_Baravelli.jpg/1920px-Est%C3%A1dio_de_S%C3%A3o_Janu%C3%A1rio_by_Diego_Baravelli.jpg",
      "autor": "Diego Baravelli",
      "licenca": "CC BY-SA 4.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Est%C3%A1dio_de_S%C3%A3o_Janu%C3%A1rio_by_Diego_Baravelli.jpg",
      "foco": [
        55,
        55
      ]
    },
    "barradao": {
      "ar": 1.333,
      "nome": "Barradão",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/45/Est%C3%A1dio_Barrad%C3%A3o_-_Esporte_Clube_Vit%C3%B3ria.jpg/960px-Est%C3%A1dio_Barrad%C3%A3o_-_Esporte_Clube_Vit%C3%B3ria.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/45/Est%C3%A1dio_Barrad%C3%A3o_-_Esporte_Clube_Vit%C3%B3ria.jpg/1920px-Est%C3%A1dio_Barrad%C3%A3o_-_Esporte_Clube_Vit%C3%B3ria.jpg",
      "autor": "Jaorge",
      "licenca": "CC BY-SA 4.0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Est%C3%A1dio_Barrad%C3%A3o_-_Esporte_Clube_Vit%C3%B3ria.jpg",
      "foco": [
        45,
        50
      ]
    },
    "ligga-arena": {
      "ar": 1.333,
      "nome": "Ligga Arena",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Arenadabaixada2.jpg/960px-Arenadabaixada2.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Arenadabaixada2.jpg/1920px-Arenadabaixada2.jpg",
      "autor": "Gustavo Paolo",
      "licenca": "CC0",
      "pagina": "https://commons.wikimedia.org/wiki/File:Arenadabaixada2.jpg",
      "foco": [
        52,
        45
      ]
    },
    "nilton-santos": {
      "ar": 1.5,
      "nome": "Estádio Nilton Santos",
      "w960": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c9/Rio2016_Gerais_030_8069_-c-2016_GabrielHeusi_HeusiAction.jpg/960px-Rio2016_Gerais_030_8069_-c-2016_GabrielHeusi_HeusiAction.jpg",
      "w1920": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c9/Rio2016_Gerais_030_8069_-c-2016_GabrielHeusi_HeusiAction.jpg/1920px-Rio2016_Gerais_030_8069_-c-2016_GabrielHeusi_HeusiAction.jpg",
      "autor": "Gabriel Heusi/Brasil2016.gov.br",
      "licenca": "CC BY 3.0 br",
      "pagina": "https://commons.wikimedia.org/wiki/File:Rio2016_Gerais_030_8069_-c-2016_GabrielHeusi_HeusiAction.jpg",
      "foco": [
        42,
        50
      ]
    }
  };
  // nome do estádio que a ESPN publica -> estádio do catálogo
  const NOMES = [
    [/Mineir/i, "mineirao"], [/Maracan/i, "maracana"], [/MRV/i, "arena-mrv"], [/Fonte Nova/i, "fonte-nova"],
    [/Nilton Santos|Engenh/i, "nilton-santos"], [/Nabi|Abi Chedid/i, "nabi-abi-chedid"], [/Cond[áa]/i, "arena-conda"],
    [/Neo Qu[ií]mica|Arena Corinthians|Itaquer/i, "neo-quimica"], [/Couto Pereira/i, "couto-pereira"], [/Arena do Gr[êe]mio/i, "arena-gremio"],
    [/Beira[- ]?Rio/i, "beira-rio"], [/Campos Maia|Mai[ãa]o/i, "maiao"], [/Allianz|Nubank/i, "allianz"], [/Baen[ãa]o|Evandro Almeida/i, "baenao"],
    [/Mangueir|Ol[ií]mpico do Par/i, "mangueirao"], [/Vila Belmiro|Urbano Caldeira/i, "vila-belmiro"], [/Morumb|C[íi]cero Pompeu/i, "morumbi"],
    [/S[ãa]o Janu/i, "sao-januario"], [/Barrad/i, "barradao"], [/Ligga|Baixada|Joaquim Am[ée]rico/i, "ligga-arena"],
  ];
  // sem o nome do estádio no jogo: a casa do mandante
  const CASA = { "athletico-pr": "ligga-arena", "atletico-mg": "arena-mrv", bahia: "fonte-nova", botafogo: "nilton-santos", bragantino: "nabi-abi-chedid",
    chapecoense: "arena-conda", corinthians: "neo-quimica", coritiba: "couto-pereira", cruzeiro: "mineirao", flamengo: "maracana", fluminense: "maracana",
    gremio: "arena-gremio", internacional: "beira-rio", mirassol: "maiao", palmeiras: "allianz", remo: "baenao", santos: "vila-belmiro", "sao-paulo": "morumbi",
    vasco: "sao-januario", vitoria: "barradao" };

  function estadioDe(venue, mandante) {
    if (venue) { const n = NOMES.find(([re]) => re.test(venue)); return n ? n[1] : null; }   // estádio fora do catálogo: sem tomada (não mostra outro)
    return CASA[mandante] || null;
  }
  const esc = (s) => (window.SEG ? window.SEG.esc(s) : String(s).replace(/[&<>"']/g, ""));

  // a faixa: foto, nuvens e o céu do início; por cima, as cores dos clubes e a sombra que deixa o placar legível
  function html(venue, mandante) {
    const k = estadioDe(venue, mandante), e = k && EST[k];
    if (!e) return "";
    const [fx, fy] = e.foco;
    return `<div class="mh-drone" data-drone="${k}" data-ar="${e.ar}" aria-hidden="true" style="--fx:${fx}%;--fy:${fy}%;--ar:${e.ar}">
        <img class="dr-bg" alt="" decoding="async" src="${esc(e.w960.replace("/960px-", "/330px-"))}">
        <div class="dr-cam"><img class="dr-img" alt="" decoding="async" fetchpriority="high" src="${esc(e.w960)}" srcset="${esc(e.w960)} 960w, ${esc(e.w1920)} 1920w" sizes="100vw"></div>
        <div class="dr-sky"></div><i class="dr-cloud c1"></i><i class="dr-cloud c2"></i><i class="dr-cloud c3"></i>
        <div class="dr-shade"></div>
      </div>
      <a class="dr-credit" href="${esc(e.pagina)}" target="_blank" rel="noopener noreferrer" title="Foto aérea do ${esc(e.nome)} no Wikimedia Commons">Foto: ${esc(e.autor)} · ${esc(e.licenca)} · Wikimedia Commons</a>`;
  }

  const jaVoou = new Map();   // jogo -> quando a tomada tocou (redesenho da mesma página não repete)
  const reduzido = () => matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("estatico");
  const EASE = "cubic-bezier(.2,.66,.24,1)";   // desacelera até parar, como o drone freando

  function voar(el) {
    const cam = el.querySelector(".dr-cam"), sky = el.querySelector(".dr-sky"), nuvens = [...el.querySelectorAll(".dr-cloud")];
    const hero = el.closest(".match-hero");
    const fim = () => { el.classList.add("parado"); cam.style.willChange = "auto"; };
    const chave = (hero && hero.dataset.jogo) || "";
    if (reduzido() || (chave && Date.now() - (jaVoou.get(chave) || 0) < 90e3)) { el.classList.add("pronto"); return fim(); }
    jaVoou.set(chave, Date.now());
    el.classList.add("pronto", "voando");
    const D = innerWidth < 700 ? 5200 : 5800;
    cam.style.willChange = "transform";
    // câmera: no céu olhando o horizonte (a foto deslocada para baixo), desce inclinando e se aproximando, gira de leve e para
    const a = cam.animate([
      { transform: "translate3d(2%, 34%, 0) scale(1.62) rotate(-3.2deg)", offset: 0 },
      { transform: "translate3d(1.2%, 17%, 0) scale(1.46) rotate(-2.4deg)", offset: 0.28 },
      { transform: "translate3d(-0.6%, 5%, 0) scale(1.24) rotate(-0.9deg)", offset: 0.62 },
      { transform: "translate3d(0, 0, 0) scale(1.1) rotate(0deg)", offset: 1 },
    ], { duration: D, easing: EASE, fill: "both" });
    // céu do início: some enquanto a câmera desce
    sky.animate([{ opacity: 1 }, { opacity: 0.85, offset: 0.18 }, { opacity: 0 }], { duration: D * 0.45, easing: "ease-out", fill: "both" });
    // nuvens: o drone passa por elas (crescem, abrem para os lados e somem)
    nuvens.forEach((n, i) => {
      const lado = i % 2 ? 1 : -1;
      n.animate([
        { transform: "translate3d(0, 0, 0) scale(1)", opacity: 0.95 },
        { transform: `translate3d(${lado * 38}%, ${-10 - i * 6}%, 0) scale(2.8)`, opacity: 0 },
      ], { duration: D * (0.34 + i * 0.07), delay: i * 140, easing: "cubic-bezier(.4,0,.6,1)", fill: "both" });
    });
    a.finished.then(() => { el.classList.remove("voando"); fim(); }).catch(fim);
  }

  // faixa mais larga que a foto (PC): a câmera fica na proporção da foto, no centro, e o estádio aparece inteiro
  const enquadra = (el) => { const r = el.getBoundingClientRect(); el.classList.toggle("largo", r.height > 0 && r.width / r.height > +el.dataset.ar * 1.04); };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver((es) => es.forEach((x) => enquadra(x.target))) : null;
  function mount(root) {
    root.querySelectorAll(".mh-drone:not([data-montado])").forEach((el) => {
      el.dataset.montado = "1";
      enquadra(el);
      ro?.observe(el);
      const img = el.querySelector(".dr-img");
      let foi = false;
      const ir = () => { if (foi || !el.isConnected) return; foi = true; voar(el); };
      const falhou = () => { el.closest(".match-hero")?.classList.remove("has-drone"); el.nextElementSibling?.classList.contains("dr-credit") && el.nextElementSibling.remove(); el.remove(); };
      img.addEventListener("error", falhou, { once: true });
      const bg = el.querySelector(".dr-bg");
      bg?.addEventListener("error", () => { if (!bg.dataset.troca) { bg.dataset.troca = "1"; bg.src = img.getAttribute("src"); } }, { once: true });
      // começa quando a foto está pronta para desenhar (sem engasgo no primeiro quadro); internet lenta: até 5 s
      (img.decode ? img.decode() : Promise.resolve()).then(ir, () => { if (img.complete && img.naturalWidth) ir(); });
      setTimeout(() => { if (img.complete && img.naturalWidth) ir(); else if (!foi) img.addEventListener("load", ir, { once: true }); }, 5000);
    });
  }

  return { html, mount, estadioDe, EST };
})();
