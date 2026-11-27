/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — assistente de reforços (aba Janela → Reforços) e continentes
   O torcedor pergunta em português ("promessas da Série B", "pontas que recompõem até 5 milhões", "2º volantes
   argentinos sub-23") e o assistente transforma a pergunta numa busca no mercado global: liga, continente,
   nacionalidade, posição, idade, valor, contrato e as etiquetas táticas (marca bem, recompõe). Por regras, como o
   "Pergunte ao CazéStats" (js/pergunte.js): sem IA paga, sem custo por pergunta e nada sai do aparelho.
   entende(pergunta, ctx) é pura (Node e navegador); quem busca e desenha é js/mercado.js.
   Continentes: o país de cada jogador (código da ESPN ou "x-<nome>" do Transfermarkt) e o país de cada liga. Para o
   futebol vale a confederação, exceto a Oceania, pedida à parte: Austrália e Nova Zelândia ficam na Oceania.
   ========================================================================== */
(function (raiz) {
  "use strict";
  const norm = (t) => ` ${String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9$€]+/g, " ").trim()} `;

  /* ---------- continentes ---------- */
  const CONTINENTES = { europa: "Europa", asia: "Ásia", africa: "África", america: "América", oceania: "Oceania" };
  const lista = (s) => s.trim().split(/\s+/);
  const POR_CONT = {
    europa: lista("alb arm aut aze bel bih blr bul cro cyp cze den eng esp est fin fra geo ger gre hun irl isl isr ita ltu lux lva mda mkd mtg ned nir nor pol por rom rus sba sco sui svk svn swe tur ukr wal x-andorra x-bosniaherzeg x-czechrepubli x-faroeislands x-gibraltar x-ireland x-kazakhstan x-kosovo x-liechtenstei x-malta"),
    asia: lista("idn irn irq jor jpn ksa lib mas pal phi syr tha uae uzb x-afghanistan x-bahrain x-bangladesh x-china x-chinesetaipe x-hongkong x-koreanorth x-koreasouth x-kyrgyzstan x-oman x-pakistan x-qatar x-singapore x-tajikistan x-turkmenistan x-yemen"),
    africa: lista("alg ang bdi ben bfa cgo civ cpv crm cta egy eqg gab gam gha gnb gui ken lbr lby mad mli mor moz mtn nga nig rdc rsa rwa sen sle tan tog tun uga zam zim x-botswana x-capeverde x-chad x-comoros x-cotedivoire x-drcongo x-eritrea x-malawi x-mauritius x-namibia x-saotomeandpr x-somalia x-southernsuda x-sudan x-thegambia"),
    america: lista("arg bol bra can chi col crc cuw dom ecu gua grn hai hon jam lca mex pan par per pur slv sur tri uru usa ven x-barbados x-bonaire x-cuba x-curacao x-frenchguiana x-guadeloupe x-guyana x-martinique x-sintmaarten x-stkittsnevis x-stlucia x-unitedstates"),
    oceania: lista("aus nzl ncd x-vanuatu"),
  };
  const PAIS_CONT = {};
  for (const [c, ps] of Object.entries(POR_CONT)) for (const p of ps) PAIS_CONT[p] = c;
  // ligas: prefixo da ESPN (eng.1, bra.2...) ou código do Transfermarkt (tm:GB2...)
  const LIGA_CONT = {
    eng: "europa", esp: "europa", ita: "europa", ger: "europa", fra: "europa", por: "europa", ned: "europa", tur: "europa", ksa: "asia",
    bra: "america", usa: "america", mex: "america", arg: "america", col: "america", uru: "america", chi: "america",
    "tm:GB2": "europa", "tm:ES2": "europa", "tm:IT2": "europa", "tm:L2": "europa", "tm:FR2": "europa", "tm:PO2": "europa", "tm:NL2": "europa", "tm:BE1": "europa",
    "tm:SC1": "europa", "tm:GR1": "europa", "tm:RU1": "europa", "tm:UKR1": "europa", "tm:A1": "europa", "tm:C1": "europa", "tm:DK1": "europa", "tm:NO1": "europa",
    "tm:SE1": "europa", "tm:PL1": "europa", "tm:TS1": "europa", "tm:RO1": "europa", "tm:SER1": "europa", "tm:KR1": "europa",
    "tm:EL1S": "america", "tm:PR1A": "america", "tm:TDeA": "america", "tm:JAP1": "asia", "tm:RSK1": "asia", "tm:CSL": "asia", "tm:QSL": "asia", "tm:UAE1": "asia", "tm:AUS1": "oceania",
  };
  const contDoPais = (p) => PAIS_CONT[p] || null;
  const contDaLiga = (lg) => LIGA_CONT[lg] || LIGA_CONT[String(lg || "").split(".")[0]] || null;

  /* ---------- vocabulário ---------- */
  // ligas pelo nome ou pelo país ("da Série B", "do Brasileirão", "da Premier League", "que jogam na Argentina")
  const LIGAS = [
    [/ serie b (da |do )?(italia|italiana|italiano) /, ["tm:IT2"], "Série B italiana"],
    [/ serie a (da |do )?(italia|italiana|italiano) | calcio /, ["ita.1"], "Serie A italiana"],
    [/ serie b | segunda divisao (do )?(brasil|brasileira|brasileiro) | brasileirao b /, ["bra.2"], "Série B do Brasileirão"],
    [/ serie a | brasileirao | primeira divisao (do )?brasil /, ["bra.1"], "Série A do Brasileirão"],
    [/ championship | segunda divisao inglesa /, ["tm:GB2"], "Championship"],
    [/ premier league | (liga|campeonato|futebol) ingles | (na |da )inglaterra /, ["eng.1"], "Premier League"],
    [/ laliga 2 | segunda divisao espanhola /, ["tm:ES2"], "LaLiga 2"],
    [/ laliga | la liga | (liga|campeonato|futebol) espanhol | (na |da )espanha /, ["esp.1"], "LaLiga"],
    [/ 2 bundesliga | segunda divisao alema /, ["tm:L2"], "2. Bundesliga"],
    [/ bundesliga | (liga|campeonato|futebol) alem(a|ao) | (na |da )alemanha /, ["ger.1"], "Bundesliga"],
    [/ ligue 2 /, ["tm:FR2"], "Ligue 2"],
    [/ ligue 1 | (liga|campeonato|futebol) frances | (na |da )franca /, ["fra.1"], "Ligue 1"],
    [/ liga portugal 2 | segunda divisao portuguesa /, ["tm:PO2"], "Liga Portugal 2"],
    [/ liga portugal | (liga|campeonato|futebol) portugues | (em |de )portugal /, ["por.1"], "Liga Portugal"],
    [/ eredivisie | (liga|campeonato|futebol) holandes | (na |da )holanda /, ["ned.1"], "Eredivisie"],
    [/ super lig | (liga|campeonato|futebol) turco | (na |da )turquia /, ["tur.1"], "Süper Lig"],
    [/ (liga|campeonato|futebol) (saudita|arabe) | (na |da )arabia | saudi /, ["ksa.1"], "liga saudita"],
    [/ mls | (liga|campeonato|futebol) americano | (nos |dos )(eua|estados unidos) /, ["usa.1"], "MLS"],
    [/ liga mx | (liga|campeonato|futebol) mexicano | (no |do )mexico /, ["mex.1"], "Liga MX"],
    [/ (liga|campeonato|futebol) argentino | (na |da )argentina /, ["arg.1"], "liga argentina"],
    [/ (liga|campeonato|futebol) colombiano | (na |da )colombia /, ["col.1"], "liga colombiana"],
    [/ (liga|campeonato|futebol) uruguaio | (no |do )uruguai /, ["uru.1"], "liga uruguaia"],
    [/ (liga|campeonato|futebol) chileno | (no |do )chile /, ["chi.1"], "liga chilena"],
    [/ (liga|campeonato|futebol) belga | (na |da )belgica /, ["tm:BE1"], "liga belga"],
    [/ (liga|campeonato|futebol) escoces | (na |da )escocia /, ["tm:SC1"], "liga escocesa"],
    [/ (liga|campeonato|futebol) japones | (no |do )japao | j league /, ["tm:JAP1"], "J1 League"],
    [/ (liga|campeonato|futebol) chines | (na |da )china /, ["tm:CSL"], "liga chinesa"],
    [/ (liga|campeonato|futebol) australiano | (na |da )australia | a league /, ["tm:AUS1"], "A-League"],
    [/ (liga|campeonato|futebol) equatoriano | (no |do )equador /, ["tm:EL1S"], "liga equatoriana"],
    [/ (liga|campeonato|futebol) paraguaio | (no |do )paraguai /, ["tm:PR1A"], "liga paraguaia"],
    [/ (liga|campeonato|futebol) peruano | (no |do )peru /, ["tm:TDeA"], "liga peruana"],
  ];
  // nacionalidade pelo gentílico ("argentinos", "brasileiros", "estrangeiros")
  const GENTILICOS = [
    [/ brasileir(o|os|a|as) /, "bra", "brasileiros"], [/ estrangeir(o|os|a|as) | gringos? /, "est", "estrangeiros"],
    [/ argentin(o|os|a|as) /, "arg", "argentinos"], [/ uruguai(o|os|a|as) /, "uru", "uruguaios"], [/ colombian(o|os|a|as) /, "col", "colombianos"],
    [/ paraguai(o|os|a|as) /, "par", "paraguaios"], [/ chilen(o|os|a|as) /, "chi", "chilenos"], [/ equatorian(o|os|a|as) /, "ecu", "equatorianos"],
    [/ peruan(o|os|a|as) /, "per", "peruanos"], [/ venezuelan(o|os|a|as) /, "ven", "venezuelanos"], [/ bolivian(o|os|a|as) /, "bol", "bolivianos"],
    [/ mexican(o|os|a|as) /, "mex", "mexicanos"], [/ portugues(es|a|as)? /, "por", "portugueses"], [/ espanho(l|is|la|las) /, "esp", "espanhóis"],
    [/ frances(es|a|as)? /, "fra", "franceses"], [/ italian(o|os|a|as) /, "ita", "italianos"], [/ alem(ao|aes|a|as) /, "ger", "alemães"],
    [/ ingles(es|a|as)? /, "eng", "ingleses"], [/ holandes(es|a|as)? /, "ned", "holandeses"], [/ belgas? /, "bel", "belgas"],
    [/ croatas? /, "cro", "croatas"], [/ servios? /, "sba", "sérvios"], [/ japones(es|a|as)? /, "jpn", "japoneses"],
  ];
  const CONT_PALAVRAS = [
    [/ europeus? | europeias? /, "europa", "nacionalidade"], [/ asiatic(o|os|a|as) /, "asia", "nacionalidade"], [/ african(o|os|a|as) /, "africa", "nacionalidade"],
    [/ (sul |norte |centro )?american(o|os|a|as) | latin(o|os|a|as) /, "america", "nacionalidade"], [/ oceanic(o|os|a|as) /, "oceania", "nacionalidade"],
    [/ (na |da |que jogam na |atuam na )europa | europa /, "europa", "liga"], [/ (na |da )asia | asia /, "asia", "liga"], [/ (na |da )africa | africa /, "africa", "liga"],
    [/ (nas |das )americas? | america (do sul|do norte|central)? /, "america", "liga"], [/ (na |da )oceania | oceania /, "oceania", "liga"],
  ];
  // posições: códigos dos filtros de js/mercado.js (POS_FILTRO); da mais específica para a mais geral
  const POSICOES = [
    [/ (1o|1|primeiro) volantes? | volantes? de contencao | cabecas? de area /, "VOL1", "1º volantes"],
    [/ (2o|2|segundo) volantes? | volantes? que (chega|sai)/, "VOL2", "2º volantes"],
    [/ volantes? /, "VOL", "volantes"],
    [/ laterais? direit(o|os) | ld /, "LD", "laterais-direitos"], [/ laterais? esquerd(o|os) | le /, "LE", "laterais-esquerdos"], [/ laterais? | alas? /, "lat", "laterais"],
    [/ zagueir(o|os) | beques? | defensores? centrais /, "ZAG", "zagueiros"],
    [/ pontas? direit(a|as) /, "PD", "pontas-direitas"], [/ pontas? esquerd(a|as) /, "PE", "pontas-esquerdas"], [/ pontas? | extremos? | wingers? /, "pon", "pontas"],
    [/ meias? atacantes? | camisas? 10 | armadores? /, "MEI", "meias-atacantes"], [/ meio campistas? | meio de campo /, "MC", "meio-campistas"], [/ meias? /, "mei", "meias"],
    [/ segundos? atacantes? /, "SA", "segundos atacantes"], [/ centroavantes? | camisas? 9 | homens? de area | artilheiros? /, "CA", "centroavantes"],
    [/ atacantes? /, "A", "atacantes"], [/ goleir(o|os)|arqueir(o|os) /, "G", "goleiros"], [/ defensores? | defesa /, "D", "defensores"],
  ];
  const num = (s) => parseFloat(String(s).replace(/\./g, "").replace(",", "."));

  /* ---------- a pergunta vira filtros ---------- */
  // ctx: { cambio (R$ por €) }. Devolve { f: {...}, entendi: [...], reconheceu }
  function entende(pergunta, ctx = {}) {
    const t = norm(pergunta), f = { n: 8 }, entendi = [];
    let r = t;
    // posição (antes da liga: "série a" não pode comer o "a" de "atacantes")
    for (const [re, cod, rot] of POSICOES) if (re.test(r)) { f.pos = cod; entendi.push(rot); r = r.replace(re, " "); break; }
    for (const [re, lgs, rot] of LIGAS) if (re.test(r)) { f.lgs = lgs; entendi.push(`da ${rot}`); r = r.replace(re, " "); break; }
    // "do Campeonato Brasileiro", "do futebol brasileiro": é a liga, não a nacionalidade dos jogadores
    r = r.replace(/ (do |no )?(campeonato|futebol|brasileirao) (brasileiro|nacional)? /g, " ").replace(/ (do |no )?brasileirao /g, " ");
    for (const [re, cod, rot] of GENTILICOS) if (re.test(r)) { f.nac = cod; entendi.push(rot); r = r.replace(re, " "); break; }
    if (!f.lgs) for (const [re, c, por] of CONT_PALAVRAS) if (re.test(r)) { f.cont = c; f.contPor = por; entendi.push(por === "liga" ? `que jogam na ${CONTINENTES[c]}` : `nascidos na ${CONTINENTES[c]}`); r = r.replace(re, " "); break; }
    // idade
    let m;
    if ((m = / sub ?(\d{2}) /.exec(t))) { f.idMax = +m[1]; entendi.push(`sub-${m[1]}`); }
    else if ((m = / entre (\d{2}) e (\d{2}) anos /.exec(t))) { f.idMin = +m[1]; f.idMax = +m[2]; entendi.push(`de ${m[1]} a ${m[2]} anos`); }
    else if ((m = / (ate|no maximo|com ate|menos de) (\d{2}) anos /.exec(t))) { f.idMax = +m[2] - (m[1] === "menos de" ? 1 : 0); entendi.push(`até ${f.idMax} anos`); }
    else if ((m = / (acima de|mais de|a partir de|com mais de) (\d{2}) anos /.exec(t))) { f.idMin = +m[2] + (m[1].startsWith("a partir") ? 0 : 1); entendi.push(`a partir de ${f.idMin} anos`); }
    const promessa = / promessas? | revelac(ao|oes) | joias? | jovens? talentos? | potencial | futuro /.test(t);
    if (promessa) { f.idMax = Math.min(f.idMax || 21, 21); f.ord = "promessa"; entendi.push("promessas (até 21 anos, pelo valor de mercado)"); }
    else if (/ jove(m|ns) | novos? | garotos? | moleques? /.test(t) && !f.idMax) { f.idMax = 23; entendi.push("jovens (até 23 anos)"); }
    if (/ experientes? | veteran(o|os) | rodad(o|os) | cascudos? /.test(t) && !f.idMin) { f.idMin = 30; entendi.push("experientes (30 anos ou mais)"); }
    // valor (em euros; "R$"/"reais" converte pelo câmbio)
    if ((m = / (ate|no maximo|abaixo de|menos de|por ate|custando ate) (r\$ |€ |euros? )?(\d+(?:[.,]\d+)?) ?(mi|milhoes|milhao|mil|m)?( de)? ?(euros?|reais|r\$)? /.exec(t))) {
      let v = num(m[3]) * (m[4] === "mil" ? 1e3 : 1e6);
      const reais = /r\$|reais/.test((m[2] || "") + (m[6] || ""));
      if (reais) v /= ctx.cambio || 6;
      f.vMax = Math.round(v);
      entendi.push(`até € ${f.vMax >= 1e6 ? (f.vMax / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : Math.round(f.vMax / 1e3) + " mil"}${reais ? " (convertido de reais)" : ""}`);
    } else if (/ barat(o|os|a|as|inhos?) | em conta | de baixo custo | pechinchas? /.test(t)) { f.vMax = 3e6; f.ord = f.ord || "barato"; entendi.push("baratos (até € 3 mi)"); }
    // fim de contrato (chega de graça ou barato)
    if (/ fim de contrato | contrato (acabando|terminando|no fim|vencendo) | sem contrato | livres? | de graca /.test(t)) { f.contrato = "2027-06"; entendi.push("com contrato até junho de 2027"); }
    // etiquetas táticas
    if (/ marca(m)? bem | bons? marcadores? | marcacao forte | defensiv(o|os) | bom na marcacao /.test(t)) { f.tags = [...(f.tags || []), "M"]; entendi.push("que marcam bem"); }
    if (/ recomp(oe|oem|ondo|osicao)| voltam? para marcar | ajudam? na defesa /.test(t)) { f.tags = [...(f.tags || []), "R"]; entendi.push("que recompõem"); }
    if (/ (laterais?|alas?) (de apoio|ofensiv(o|os)) | apoiam? o ataque /.test(t)) { f.tags = [...(f.tags || []), "O"]; entendi.push("laterais de apoio"); }
    // ordem
    if (!f.ord) {
      if (/ mais baratos? | menor(es)? valor(es)? /.test(t)) f.ord = "barato";
      else if (/ mais jove(m|ns) | mais novos? /.test(t)) f.ord = "idade";
      else if (/ destaques? | melhores? | craques? | estrelas? | mais valiosos? | top /.test(t)) f.ord = "valor";
    }
    if ((m = / (\d{1,2}) (jogadores|nomes|opcoes|atletas) | top (\d{1,2}) /.exec(t))) f.n = Math.min(20, Math.max(1, +(m[1] || m[3])));
    const reconheceu = !!(f.pos || f.lgs || f.nac || f.cont || f.idMin || f.idMax || f.vMax || f.tags || f.contrato || f.ord);
    // nada reconhecido: talvez seja um nome ("o Pedro", "Kaio Jorge")
    if (!reconheceu) { const nome = String(pergunta || "").replace(/[?!.]/g, "").replace(/^(quero|busca|buscar|procura|procurar|me mostra|mostra|tem o|o|a)\s+/i, "").trim(); if (nome.length >= 3) { f.q = nome; entendi.push(`jogadores com o nome "${nome}"`); } }
    return { f, entendi, reconheceu: reconheceu || !!f.q };
  }

  const SUGESTOES = ["Promessas da Série B", "Pontas que recompõem até 5 milhões", "2º volantes argentinos sub-23", "Zagueiros europeus experientes", "Laterais-esquerdos baratos que marcam bem", "Atacantes que jogam na Ásia"];
  const api = { entende, contDoPais, contDaLiga, CONTINENTES, PAIS_CONT, LIGA_CONT, SUGESTOES, _norm: norm };
  if (typeof module === "object" && module.exports) module.exports = api;
  else raiz.ASSISTENTE_REFORCOS = api;
})(typeof window !== "undefined" ? window : globalThis);
