/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Autor: Alan Evangelista de Souza Martins. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — Janela de transferências (#/clube/<id>/mercado[/etapa])
   Mesa de transferências nas cores do clube, com a linguagem das páginas de notícia de mercado (cartão do negócio,
   carimbo de "negócio fechado", números grandes):
   1) Elenco: cartões por posição (goleiros, zagueiros, laterais, volantes, meias, pontas, centroavantes) com minutos
      reais da temporada e a situação (titular, reserva) conferida em várias fontes; emprestados a outros clubes com
      onde estão, até quando e quanto jogam lá.
   2) Reforços: mercado global (elencos de 17 ligas) com filtros e ordenação; cada contratação vira o cartão do negócio.
   3) Escalação: campo 3D; arraste o jogador para qualquer ponto; o campo diz a posição nova (ex.: MEI → PD), avisa
      quando ele não está acostumado e mostra como ele jogou ali.
   4) Compartilhar: cartaz em PNG ou PDF e um link que abre o mesmo elenco para os amigos.
   Modos: "real" (caixa e folha do clube, regras de elenco) e "manager" (sem limites; o caixa pode ser editado).
   Fotos dos jogadores: sempre ligadas, para todo mundo (sem botão nem opção de desligar, pedido do dono em 25/11/2026).
   Antes de vender, rode o robô com MODO_VENDA=1 (tira as fotos sem licença dos arquivos).
   ========================================================================== */
(() => {
  const { byId } = window.PD;
  const { crest, crestOutro, onColor } = window.GFX;
  const CP = window.CAMPO;
  const esc = (t) => window.SEG.esc(t);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- fotos dos jogadores: sempre ligadas ----------
     Regra do dono (25/11/2026): todo visitante vê as fotos, sem opção de desligar. Só o comando de retirada
     (MODO_VENDA=1 no robô) tira as fotos sem licença, apagando as cópias. A preferência "desligado" que versões antigas
     guardavam neste navegador é apagada aqui. Risco F2 em docs/RISCOS-APRESENTACAO.md. */
  try { localStorage.removeItem("placar:fotos-privadas"); } catch { /* sem armazenamento */ }
  const fotosLigadas = () => true;

  /* ---------- dados ---------- */
  const prom = {};
  function carrega(cid) {
    if (window.MERCADO?.[cid]) return Promise.resolve(window.MERCADO[cid]);
    return (prom[cid] = prom[cid] || (async () => {
      if (window.PD?.LIVE) {
        try { const r = await fetch(`/api/mercado/${cid}`, { cache: "no-store" }); if (r.ok) { const d = await SEG.json(r); (window.MERCADO = window.MERCADO || {})[cid] = d; return d; } } catch { /* arquivo */ }
      }
      return (await DADOS.carrega(`mercado/${cid}`)) || null;
    })());
  }
  // mercado global: elencos da ESPN + quem está nos elencos do Transfermarkt e não na ESPN (dados/mercado/global-tm.json,
  // arquivo à parte por causa do limite de tamanho do banco), juntos numa lista só
  const carregaGlobal = () => (prom.global = prom.global || Promise.all([DADOS.carrega("mercado/global"), DADOS.carrega("mercado/global-tm").catch(() => null), window.FOTOS ? null : DADOS.carrega("fotos").catch(() => null)])
    .then(async ([g, x]) => {
      if (!g || !x?.jogadores?.length || g._comTm) return g;
      // o arquivo do Transfermarkt vem em partes (limite de tamanho do banco): global-tm-2, global-tm-3...
      if (x.partes > 1 && !x._partes) {
        const resto = await Promise.all(Array.from({ length: Math.min(10, x.partes - 1) }, (_, i) => DADOS.carrega(`mercado/global-tm-${i + 2}`).catch(() => null)));
        for (const r of resto) if (r?.jogadores?.length) x.jogadores = x.jogadores.concat(r.jogadores);
        x._partes = true;
      }
      g.times = { ...g.times, ...(x.times || {}) };
      g.ligas = { ...g.ligas, ...(x.ligas || {}) };
      g.paises = { ...(g.paises || {}), ...(x.paises || {}) };
      g.jogadores = g.jogadores.concat(x.jogadores);
      g._comTm = true;
      return g;
    }));
  // detalhes do Transfermarkt e perfis da Série A: só quando alguém abre a ficha de um jogador nos reforços
  const carregaDetalhes = () => (prom.det = prom.det || DADOS.carrega("mercado/global-detalhes").catch(() => null));
  const carregaFichas = () => (prom.fichas = prom.fichas || DADOS.carrega("mercado/fichas").catch(() => null));
  const carregaPosicoes = () => (prom.pos = prom.pos || Promise.all([window.HEATMAPS || DADOS.carrega("heatmaps"), window.ESCALACOES || DADOS.carrega("escalacoes")]));

  /* ---------- números ---------- */
  const eur = (v) => (v == null ? "—" : `${v < 0 ? "−" : ""}€ ${Math.abs(v) >= 1e6 ? `${(Math.abs(v) / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1).replace(".", ",")} mi` : `${Math.round(Math.abs(v) / 1e3)} mil`}`);
  /* salário de cada jogador: só em faixas e sempre com "estimativa" (o valor individual não é público; é a folha do clube
     dividida pelo elenco). A folha do clube continua com o número e a fonte. A conta do modo real usa o valor interno. */
  const FAIXAS_SAL = [[50e3, "até R$ 50 mil"], [150e3, "R$ 50 a 150 mil"], [400e3, "R$ 150 a 400 mil"], [1e6, "R$ 400 mil a 1 mi"], [Infinity, "acima de R$ 1 mi"]];
  const salFaixa = (v) => (v > 0 ? `<small class="jt-sal" title="Estimativa do CazéStats.TV: a folha do clube dividida pelo elenco. O salário de cada jogador não é público.">${FAIXAS_SAL.find(([lim]) => v <= lim)[1]}/mês · <em>estimativa</em></small>` : "");
  const brl = (v) => (Math.abs(v) >= 1e6 ? `R$ ${(v / 1e6).toFixed(1).replace(".", ",")} mi` : `R$ ${Math.round(v / 1e3)} mil`);
  const mil = (v) => Number(v || 0).toLocaleString("pt-BR");
  const data = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
  const pesoLiga = (G, lg) => G?.ligas?.[lg]?.[2] ?? 0.3;
  const POS_CURTO = { G: "GOL", D: "DEF", M: "MEI", A: "ATA" };
  /* posição detalhada (Transfermarkt, ou a posição mais jogada no Brasileirão) e a zona de atuação */
  const SUB_NOME = { GOL: "Goleiro", ZAG: "Zagueiro", LD: "Lateral-direito", LE: "Lateral-esquerdo", VOL: "Volante", MC: "Meio-campista", MEI: "Meia-atacante",
    MD: "Meia pela direita", ME: "Meia pela esquerda", PD: "Ponta direita", PE: "Ponta esquerda", SA: "Segundo atacante", CA: "Centroavante" };
  const SUB_SETOR = { GOL: "G", ZAG: "D", LD: "D", LE: "D", VOL: "M", MC: "M", MEI: "M", MD: "M", ME: "M", PD: "A", PE: "A", SA: "A", CA: "A" };
  const GRUPOS_POS = { lat: ["LD", "LE"], pon: ["PD", "PE"], mei: ["MC", "MEI", "MD", "ME"], ata: ["SA", "CA"] };
  // onde cada posição costuma agir (terço D/M/A + lado E/C/D): só quando não há lances reais do jogador
  const ZONA_SUB = { GOL: "DC", ZAG: "DC", LD: "DD", LE: "DE", VOL: "MC", MC: "MC", MEI: "AC", MD: "MD", ME: "ME", PD: "AD", PE: "AE", SA: "AC", CA: "AC" };
  const TERCO = { D: "defesa", M: "meio-campo", A: "ataque" }, LADO = { E: "pela esquerda", C: "pelo centro", D: "pela direita" };
  const TM_FOTO = "https://img.a.transfermarkt.technology/portrait/header/";
  const ESPN_FOTO = (id) => `https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`;
  const TSDB_FOTO = "https://r2.thesportsdb.com/images/media/player/";
  const GRUPOS = [["Goleiros", ["GOL"]], ["Zagueiros", ["ZAG"]], ["Laterais", ["LD", "LE", "ALD", "ALE"]], ["Volantes", ["VOL"]], ["Meias", ["MC", "MEI", "MD", "ME"]], ["Pontas", ["PD", "PE"]], ["Centroavantes", ["CA"]]];
  const BANDEIRA = (p) => (p ? `<img class="jt-flag" src="https://a.espncdn.com/i/teamlogos/countries/500/${esc(p)}.png" alt="" width="16" height="16" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : "");
  const brasileiro = (j) => j.pais === "bra" || /brazil|brasil/i.test(j.nac || "");
  const sobrenome = (n) => { const p = String(n).split(" "); return p.length > 1 && p[p.length - 1].length > 2 ? p[p.length - 1] : n; };

  /* ---------- estado (por clube, neste aparelho) ---------- */
  const chave = (cid) => `placar:janela-${cid}`;
  const ler = (cid) => { try { return SEG.le(localStorage.getItem(chave(cid)) || "null"); } catch { return null; } };
  const novo = () => ({ modo: null, dec: {}, chegadas: [], form: "4-2-3-1", esc: {}, pos: {}, caixa: null });
  function estado(cid) { const e = { ...novo(), ...(ler(cid) || {}) }; e.dec = e.dec || {}; e.chegadas = e.chegadas || []; e.esc = e.esc || {}; e.pos = e.pos || {}; if (!FORMACOES[e.form]) e.form = "4-2-3-1"; return e; }
  function grava(cid, e) { try { const { _ultimaAplicada, _tit, ...g } = e; localStorage.setItem(chave(cid), JSON.stringify(g)); } catch { /* sem armazenamento: vale só nesta visita */ } }

  /* ---------- sessão da janela: o que a pessoa estava vendo (só neste aparelho, por 12 h) ----------
     As decisões ficam em placar:janela-<clube> para sempre (e vão para a conta). Aqui fica o resto da tela: se o modo
     já foi escolhido, a etapa, os filtros dos reforços e a rolagem. Assim um recarregar (F5, puxar para baixo no
     celular, o app reaberto) volta para o mesmo ponto em vez da escolha de modo. O prefixo cazestats: fica fora da
     sincronização da conta de propósito: é estado de tela, não decisão. */
  const SESSAO = "cazestats:janela-sessao", VALIDADE = 12 * 3600e3;
  const sessaoTudo = () => { try { return JSON.parse(localStorage.getItem(SESSAO) || "{}") || {}; } catch { return {}; } };
  const sessaoLe = (cid) => { const s = sessaoTudo()[cid]; return s && Date.now() - (s.t || 0) < VALIDADE ? s : null; };
  function sessaoGrava(cid, parcial) {
    try {
      const tudo = sessaoTudo(), agora = Date.now();
      for (const k of Object.keys(tudo)) if (!(agora - (tudo[k]?.t || 0) < VALIDADE)) delete tudo[k]; // vencidas saem
      tudo[cid] = { ...(tudo[cid] || {}), ...parcial, t: agora };
      localStorage.setItem(SESSAO, JSON.stringify(tudo));
    } catch { /* sem armazenamento: vale só nesta visita */ }
  }
  let primeiraMontagem = true; // a primeira tela depois de abrir ou recarregar a página

  const OPC = {
    elenco: [["fica", "Fica"], ["emprestar", "Empresta"], ["liberar", "Sai"]],
    dentro: [["manter", "Fica"], ["comprar", "Compra"], ["devolver", "Devolve"]],
    fora: [["segue", "Segue lá"], ["reintegrar", "Volta"], ["vender", "Vende"]],
  };
  const tipoDe = (j) => (j.fora ? "fora" : j.emprestadoDe ? "dentro" : "elenco");
  const padrao = (j) => ({ elenco: "fica", dentro: "manter", fora: "segue" }[tipoDe(j)]);
  const decisao = (e, j) => e.dec[j.id] || padrao(j);
  const fica = (e, j) => ["fica", "manter", "comprar", "reintegrar"].includes(decisao(e, j));

  /* ---------- contas da janela ---------- */
  function contas(cid, D, e, G) {
    const todos = [...D.elenco, ...D.emprestados.map((x) => ({ ...x, fora: true }))];
    const chegadas = e.chegadas.map((id) => jogadorGlobal(G, id, D)).filter(Boolean);
    let receita = 0, gasto = 0;
    for (const j of todos) {
      const d = decisao(e, j);
      if (d === "liberar" || d === "vender") receita += j.valor * 0.9;
      if (d === "emprestar") receita += j.valor * 0.05;
      if (d === "comprar") gasto += j.valor;
    }
    for (const c of chegadas) gasto += c.valor;
    const elencoFinal = [...todos.filter((j) => fica(e, j)), ...chegadas];
    const folha = elencoFinal.reduce((s, j) => s + (j.salario || 0), 0);
    const cambio = D.financas?.cambio?.valor || D.eurBrl || 6;
    const orcReal = D.financas?.orcamento?.valor ? Math.round(D.financas.orcamento.valor / cambio / 1e5) * 1e5 : Math.round(D.valorTotal * 0.08 / 1e5) * 1e5;
    const real = e.modo !== "manager";
    const orcamento = !real && e.caixa != null ? e.caixa : orcReal;
    const saidas = todos.filter((j) => ["emprestar", "liberar", "vender", "devolver"].includes(decisao(e, j)));
    const estrangeiros = elencoFinal.filter((j) => !brasileiro(j)).length;
    const caixa = orcamento + receita - gasto;
    const limiteFolha = D.folhaMensal * 1.1;
    const teto = Math.max(40, D.elenco.length + 4); // o cadastro já inclui a base: há folga para reforços
    const alertas = [];
    if (real) {
      if (caixa < 0) alertas.push(`Caixa estourado em ${eur(-caixa)}: venda alguém ou desista de um reforço.`);
      if (folha > limiteFolha) alertas.push(`A folha passou do limite de ${brl(limiteFolha)} por mês (10% acima da atual).`);
      if (elencoFinal.length > teto) alertas.push(`Elenco com ${elencoFinal.length} jogadores: o limite aqui é ${teto}.`);
      if (elencoFinal.length < 22) alertas.push(`Elenco com ${elencoFinal.length} jogadores: são precisos pelo menos 22.`);
    }
    return { todos, chegadas, receita, gasto, caixa, orcamento, orcReal, folha, limiteFolha, elencoFinal, saidas, estrangeiros, alertas, real, teto, cambio };
  }
  function jogadorGlobal(G, id, D) {
    if (!G) return null;
    const r = G.idx?.get(id);
    if (!r) return null;
    const [jid, nome, idade, pos, pais, nac, tid, num, valor, lesao, real, sub, foto, contrato, tm, def, zona, tat] = r, t = G.times[tid] || ["", null, ""];
    const cambio = D?.financas?.cambio?.valor || G.eurBrl || 6;
    const sal = Math.max(15000, Math.round((valor * (pesoLiga(G, t[2]) <= 0.3 ? 0.15 : pesoLiga(G, t[2]) <= 0.6 ? 0.10 : 0.09) * cambio) / 12 / 1000) * 1000);
    const cidT = cidDoTime(G, tid);
    return { id: jid, nome, idade, pos, pais, nac: nac || G.paises?.[pais] || "", time: tid, timeNome: t[0], timeLogo: t[1], lg: t[2], num, valor, lesao: !!lesao, salario: sal, reforco: true,
      funcao: sub && CP.NOME[sub] ? sub : CP.PADRAO[pos], sub: sub || "", real: !!real, contrato, tm, def, zona, tat: tat || "", cidSerieA: cidT, fotos: fotosGlobal(G, r, cidT) };
  }
  // clube da Série A do site a partir do time da ESPN no mercado global (para a foto guardada e os lances reais)
  function cidDoTime(G, tid) {
    G.cidTime = G.cidTime || {};
    if (tid in G.cidTime) return G.cidTime[tid];
    const t = G.times[tid];
    // a ESPN usa siglas ("Atlético-MG", "Athletico-PR"): confere o nome, a abreviação e o id do clube do site
    const n = t ? norm(t[0]) : "", bate = (x) => [x.name, x.abbr, x.id.replace(/-/g, " ")].filter(Boolean).map(norm).some((m) => m === n || n.includes(m) || m.includes(n) || m === n.replace(/-/g, " "));
    const c = t && t[2] === "bra.1" ? Object.values(byId).find((x) => norm(x.name) === n) || Object.values(byId).find(bate) : null;
    return (G.cidTime[tid] = c ? c.id : null);
  }
  /* as fotos possíveis do jogador, na ordem: a guardada pelo monitor (Série A), a do Transfermarkt, a da ESPN, a do
     TheSportsDB. A imagem que não abrir passa para a próxima (GFX: data-alt); sem nenhuma, fica o número da camisa. */
  function fotosGlobal(G, r, cidT) {
    const out = [], f = r[12] || "";
    const guardada = cidT && window.FOTOS?.[cidT]?.[r[0]]?.u;
    if (guardada) out.push(guardada);
    if (f === "e") out.push(ESPN_FOTO(r[0]));
    else if (f.startsWith("s:")) out.push(TSDB_FOTO + f.slice(2));
    else if (f.startsWith("g:")) out.push(f.slice(2)); // cópia guardada da busca de imagem do Brave
    else if (f) out.push((G.fotoBase || TM_FOTO) + f);
    return out;
  }
  // posição detalhada da linha do mercado global; sem ela, só o setor (G/D/M/A) da ESPN
  const subDe = (r) => r[11] || "";
  const setorDe = (r) => (r[11] ? SUB_SETOR[r[11]] : r[3]);
  function posBate(r, v) {
    if (!v) return true;
    if (v.length === 1) return setorDe(r) === v;
    if (GRUPOS_POS[v]) return GRUPOS_POS[v].includes(subDe(r));
    if (v === "VOL1" || v === "VOL2") return tipoVolante(r) === v[3];
    return subDe(r) === v;
  }
  // zona de atuação: dos lances reais (Série A) ou estimada pela posição
  function zonaDe(r) {
    if (r[16]) return { t: r[16][0], l: r[16][1], defPct: +r[16].slice(2), real: true };
    const z = ZONA_SUB[subDe(r)];
    return z ? { t: z[0], l: z[1], real: false } : null;
  }
  /* perfil tático (campo "tat", server/valores_tm.py: tatica): 1º caractere = tipo de volante ('1', '2', 'p' = sem dados,
     tratado como 1º pela posição do Transfermarkt, '-' = não é volante); depois as etiquetas; por último a fonte
     (L lances reais da Série A, F ficha de escalações do Transfermarkt, P só a posição) */
  const ETIQUETA = {
    M: ["Marca bem", "bom", "Boas valências defensivas"],
    m: ["Marca pouco", "fraco", "Poucas ações defensivas para a posição"],
    R: ["Recompõe bem", "bom", "Volta para recompor a defesa"],
    a: ["Recompõe às vezes", "neutro", "Volta para recompor em parte dos jogos: nem sempre fecha o lado"],
    r: ["Recompõe pouco", "fraco", "Fica mais à frente e volta pouco para marcar"],
    O: ["Lateral de apoio", "neutro", "Joga muito avançado: apoia o ataque e deixa espaço às costas"],
  };
  const FONTE_TAT = { L: "pelos lances reais no Brasileirão (ESPN)", F: "pela ficha técnica: posições em que foi escalado nas últimas duas temporadas (Transfermarkt)", P: "pela posição do Transfermarkt (sem lances nem escalações para conferir)" };
  function tatica(tat) {
    if (!tat) return { tipo: "", tags: [], fonte: "" };
    return { tipo: tat[0] === "-" ? "" : tat[0] === "p" ? "1" : tat[0], estimado: tat[0] === "p", tags: [...tat.slice(1, -1)].filter((c) => ETIQUETA[c]), fonte: tat.slice(-1) };
  }
  const tipoVolante = (r) => (subDe(r) === "VOL" ? tatica(r[17]).tipo || "1" : "");
  function etiquetas(tat, ficha = false) {
    const t = tatica(tat), fonte = FONTE_TAT[t.fonte] || "";
    const vol = t.tipo ? `<em class="jt-tag vol" title="${t.tipo === "1" ? "1º volante: cabeça de área, protege a zaga e marca mais" : "2º volante: sai para o jogo, chega ao ataque e participa dos gols"} (${esc(fonte)})">${t.tipo}º volante${t.estimado ? "*" : ""}</em>` : "";
    return vol + t.tags.map((c) => `<em class="jt-tag ${ETIQUETA[c][1]}" title="${esc(ETIQUETA[c][2])}, ${esc(fonte)}">${ETIQUETA[c][0]}${ficha || t.fonte === "L" ? "" : "*"}</em>`).join("");
  }
  function indexa(G) { if (G && !G.idx) G.idx = new Map(G.jogadores.map((r) => [r[0], r])); return G; }

  /* ---------- avatar: foto (modo privado) ou o número na camisa do clube ---------- */
  function avatar(j, c, tam = 44) {
    // candidatas: a guardada pelo monitor, depois Transfermarkt, ESPN, TheSportsDB (a que não abrir passa para a próxima)
    const lista = fotosLigadas() ? [...new Set([j.fotoPrivada, ...(j.fotos || [j.tm?.f ? TM_FOTO + j.tm.f : null, /^\d+$/.test(j.id) ? ESPN_FOTO(j.id) : null])].filter(Boolean))] : [];
    if (!j.fotoPrivada && lista.length) {
      const alt = lista.slice(1).map((u) => window.SEG.url(u)).join("|");
      return `<span class="jt-av foto" style="--t:${tam}px"><img src="${esc(window.SEG.url(lista[0]))}"${alt ? ` data-alt="${esc(alt)}"` : ""} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><b>${esc(j.num || POS_CURTO[j.pos] || "")}</b></span>`;
    }
    const foto = fotosLigadas() && j.fotoPrivada;
    const r = j.fotoInfo?.rosto;
    if (foto && r) { const [x, y, sx, sy] = r, pc = (v) => `${(v * 100).toFixed(2)}%`; return `<span class="jt-av foto rosto" style="--t:${tam}px"><img src="${esc(window.SEG.url(foto))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="width:${pc(1 / sx)};height:${pc(1 / sy)};left:${pc(-x / sx)};top:${pc(-y / sy)}"><b>${esc(j.num || POS_CURTO[j.pos] || "")}</b></span>`; }
    const altP = lista.slice(1).map((u) => window.SEG.url(u)).join("|");
    if (foto) return `<span class="jt-av foto" style="--t:${tam}px"><img src="${esc(window.SEG.url(foto))}"${altP ? ` data-alt="${esc(altP)}"` : ""} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><b>${esc(j.num || POS_CURTO[j.pos] || "")}</b></span>`;
    return `<span class="jt-av" style="--t:${tam}px"><b>${esc(j.num || POS_CURTO[j.pos] || "")}</b></span>`;
  }

  /* ---------- painel: os números da janela ---------- */
  const anteriores = {}; // último valor mostrado de cada número: só o que mudou anima
  function contador(chaveN, valor, fmt) {
    const de = anteriores[chaveN];
    anteriores[chaveN] = valor;
    return `<b class="jt-num" data-de="${de ?? valor}" data-para="${valor}" data-fmt="${fmt}">${fmtNum(fmt, valor)}</b>`;
  }
  const fmtNum = (fmt, v) => (fmt === "eur" ? eur(v) : fmt === "brl" ? brl(v) : String(Math.round(v)).padStart(2, "0"));
  function animaNumeros(el) {
    if (reduz()) return;
    $$(".jt-num", el).forEach((b) => {
      const de = +b.dataset.de, para = +b.dataset.para, fmt = b.dataset.fmt;
      if (de === para) return;
      b.classList.add("mudou");
      const t0 = performance.now(), dur = 650;
      const passo = (t) => {
        const p = Math.min(1, (t - t0) / dur), k = 1 - Math.pow(1 - p, 4);
        b.textContent = fmtNum(fmt, de + (para - de) * k);
        if (p < 1) requestAnimationFrame(passo); else b.textContent = fmtNum(fmt, para);
      };
      requestAnimationFrame(passo);
      setTimeout(() => b.classList.remove("mudou"), 900);
    });
  }
  const barra = (frac, cls = "") => `<span class="jt-bar ${cls}"><i style="--f:${Math.max(0, Math.min(1, frac)).toFixed(3)}"></i></span>`;

  let editandoCaixa = false;
  function painel(cid, D, e, k, G) {
    const c = byId[cid], fin = D.financas || {};
    const pontos = k.saidas.slice(0, 14).map((j) => `<i class="d-${decisao(e, j)}" title="${esc(j.nome)}"></i>`).join("") + (k.saidas.length > 14 ? `<em>+${k.saidas.length - 14}</em>` : "");
    const escudos = k.chegadas.slice(0, 4).map((j) => (j.timeLogo ? crestOutro(j.timeNome, j.timeLogo, 18) : "")).join("") + (k.chegadas.length > 4 ? `<em>+${k.chegadas.length - 4}</em>` : "");
    const disp = k.orcamento + k.receita;
    // caixa: orçamento divulgado (ge/ESPN) ou o que o clube gastou na última janela (balanço do ge), com a observação
    const origemCaixa = k.real || e.caixa == null ? (fin.orcamento?.tipo === "noticia" ? `orçamento divulgado (${esc(fin.orcamento.fonte)}, ${data(fin.orcamento.data)})`
      : fin.orcamento?.tipo === "ultima-janela" ? `base: ${esc(fin.orcamento.obs)}` : "estimativa: duas folhas mensais") : "valor definido por você";
    const origemFolha = fin.folha ? (fin.folha.tipo === "estimativa" ? "estimativa do CazéStats.TV" : `${esc(fin.folha.fonte)}, ${data(fin.folha.data)}`) : "estimativa do CazéStats.TV";
    return `<section class="jt-mesa" style="--c1:${c.colors[0]};--c2:${c.colors[1]};--c3:${c.colors[2] || c.colors[1]};--tom:${onColor(c.colors[0]) === "#111111" ? c.colors[1] : c.colors[0]}">
      <svg class="jt-globo" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".8"><circle cx="100" cy="100" r="96"/><ellipse cx="100" cy="100" rx="40" ry="96"/><ellipse cx="100" cy="100" rx="72" ry="96"/><path d="M4 100h192M14 52h172M14 148h172"/></g></svg>
      <div class="jt-mesa-topo">
        <span class="jt-escudo">${crest(c, 64)}</span>
        <div class="jt-mesa-tit"><small>${fin.janela ? `${esc(fin.janela.rotulo[0].toUpperCase() + fin.janela.rotulo.slice(1))}: ${data(fin.janela.abre)} a ${data(fin.janela.fecha)}` : "Janela de transferências 2027"}</small><h2>${esc(c.name)}</h2></div>
        <span class="jt-modo ${e.modo === "manager" ? "mg" : ""}">${e.modo === "manager" ? "Modo manager" : "Modo real"}</span>
      </div>
      <div class="jt-stats">
        <div class="jt-stat"><span class="jt-stat-l">Saídas</span>${contador(cid + "s", k.saidas.length, "n")}<span class="jt-pontos">${pontos || "<small>ninguém saiu</small>"}</span></div>
        <div class="jt-stat"><span class="jt-stat-l">Chegadas</span>${contador(cid + "c", k.chegadas.length, "n")}<span class="jt-escudos">${escudos || "<small>nenhum reforço</small>"}</span></div>
        <div class="jt-stat"><span class="jt-stat-l">Elenco</span>${contador(cid + "e", k.elencoFinal.length, "n")}
          <span class="jt-faixa-el" title="Mínimo 22, máximo ${k.teto}">${barra(k.elencoFinal.length / 44, k.real && (k.elencoFinal.length < 22 || k.elencoFinal.length > k.teto) ? "neg" : "")}<i class="m" style="--x:${(22 / 44).toFixed(3)}"></i><i class="m" style="--x:${(k.teto / 44).toFixed(3)}"></i></span></div>
        <div class="jt-stat larga ${k.real && k.caixa < 0 ? "neg" : ""}"><span class="jt-stat-l">Caixa disponível ${!k.real && !editandoCaixa ? `<button type="button" class="jt-edita" data-jt-caixa aria-label="Editar o caixa">Editar</button>` : ""}</span>${!k.real && editandoCaixa ? `<form class="jt-caixa-f" data-jt-caixa-f><label><span class="sr-only">Caixa para reforços em milhões de euros</span>€ <input type="number" inputmode="decimal" min="0" max="5000" step="0.5" value="${(k.orcamento / 1e6).toFixed(1)}" data-jt-caixa-v autofocus> mi</label><button type="submit" class="jt-edita">Salvar</button></form>` : contador(cid + "x", k.caixa, "eur")}
          ${barra(disp > 0 ? k.gasto / disp : 0, k.caixa < 0 ? "neg" : "")}<small class="jt-origem">${k.gasto ? `${eur(k.gasto)} gastos de ${eur(disp)}` : `${eur(disp)} para reforços`} · ${origemCaixa}</small></div>
        <div class="jt-stat larga ${k.real && k.folha > k.limiteFolha ? "neg" : ""}"><span class="jt-stat-l">Folha mensal</span>${contador(cid + "f", k.folha, "brl")}
          ${barra(k.folha / (k.limiteFolha || 1), k.folha > k.limiteFolha ? "neg" : "")}<small class="jt-origem">${k.real ? `limite ${brl(k.limiteFolha)}` : "sem limite"} · base: ${origemFolha}</small></div>
      </div>
      ${k.alertas.length ? `<ul class="jt-alertas" role="status">${k.alertas.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
    </section>`;
  }

  /* ---------- etapas ---------- */
  const ETAPAS = [["elenco", "Elenco"], ["reforcos", "Reforços"], ["escalacao", "Escalação"], ["compartilhar", "Compartilhar"]];
  function passos(cid, etapa) {
    const i0 = ETAPAS.findIndex(([k]) => k === etapa);
    return `<ol class="jt-passos" style="--p:${i0 / (ETAPAS.length - 1)}">${ETAPAS.map(([k, l], i) => `<li class="${k === etapa ? "on" : i < i0 ? "feito" : ""}"><a href="#/clube/${cid}/mercado/${k}"${k === etapa ? ' aria-current="step"' : ""}><b>${i + 1}</b><span>${l}</span></a></li>`).join("")}</ol>`;
  }
  function escolhaModo(cid, e = {}) {
    const c = byId[cid], ja = Object.keys(e.dec || {}).length || (e.chegadas || []).length;
    return `<div class="jt-escolha"><h2>Como você quer montar o ${esc(c.name)}?</h2><p>${ja ? `Suas decisões continuam guardadas (${(e.chegadas || []).length} ${(e.chegadas || []).length === 1 ? "reforço" : "reforços"}, ${Object.keys(e.dec || {}).length} ${Object.keys(e.dec || {}).length === 1 ? "decisão" : "decisões"}). Escolha o modo para continuar.` : "Decida quem fica, quem sai e quem chega, escale o time e mande para os amigos montarem o deles."}</p>
      <div class="jt-escolha-g">
        <button type="button" class="jt-cartao-modo ${e.modo === "real" ? "atual" : ""}" data-jt-modo="real"><b>Modo real</b><span>Com o caixa e a folha do clube: folha até 10% acima da atual, elenco entre 22 e o limite, até 9 estrangeiros entre os titulares. Para pensar como diretor de futebol.</span><em>Jogar no modo real</em></button>
        <button type="button" class="jt-cartao-modo mg ${e.modo === "manager" ? "atual" : ""}" data-jt-modo="manager"><b>Modo manager</b><span>Sem limite de contratações e com o caixa que você quiser: qualquer jogador do mundo, do jeito que você sonhar.</span><em>Jogar no modo manager</em></button>
      </div></div>`;
  }

  /* ---------- 1) elenco ---------- */
  // ficha técnica: jogador do clube, ou emprestado a um clube da Série A (ficha no clube de destino)
  function ficha(j, cid) {
    if (j.fora) { const dest = j.lgClube === "bra.1" && j.espn ? Object.values(byId).find((c) => c.name && j.clubeEspn && (j.clubeEspn.includes(c.name) || c.name.includes(j.clubeEspn))) : null; return dest ? `#/jogador/${j.espn}-${dest.id}` : null; }
    return /^\d+$/.test(j.id) && j.min ? `#/jogador/${j.id}-${cid}` : null;
  }
  // selo da verificação do robô (server/verifica_jogadores.py): está no clube por duas fontes ou mais
  const conferido = (j) => {
    const v = j.verif;
    if (!v || v.st !== "confirmado") return "";
    const txt = `Conferido no elenco: ${v.fontes.join(", ")}`;
    return `<span class="jt-conf" role="img" aria-label="${esc(txt)}" title="${esc(txt)}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.2l1.7 1.3 2.1-.2.7 2 1.8 1.1-.5 2.1.5 2.1-1.8 1.1-.7 2-2.1-.2L8 14.8l-1.7-1.3-2.1.2-.7-2-1.8-1.1.5-2.1-.5-2.1 1.8-1.1.7-2 2.1.2z" fill="currentColor"/><path d="M5.3 8.2l1.8 1.8 3.6-3.7" fill="none" stroke="var(--surface)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  };
  function cartaoJogador(cid, j, e, D) {
    const c = byId[cid], tipo = tipoDe(j), d = decisao(e, j), opc = OPC[tipo];
    const f = j.funcao || CP.origem(j), maxMin = Math.max(1, (D.jogosTime || 40) * 90);
    let sub, uso = "", status = "";
    if (tipo === "fora") {
      const ondeLogo = j.clubeLogo ? crestOutro(j.clubeEspn || j.clube, j.clubeLogo, 14) : "";
      sub = `${ondeLogo}<span>No ${esc(j.clube || j.clubeEspn || "?")}${j.ate ? ` até ${data(j.ate)}` : ""}</span>`;
      const t = j.temporada;
      uso = j.min != null ? `${barra(j.min / maxMin)}<small>${mil(j.min)} min · ${j.jogos} ${j.jogos === 1 ? "jogo" : "jogos"} lá</small>`
        : t ? `${barra((t.tit || 0) / 38)}<small>${t.tit} ${t.tit === 1 ? "jogo" : "jogos"} como titular lá${t.g ? ` · ${t.g} ${t.g === 1 ? "gol" : "gols"}` : ""}</small>` : `<small class="jt-sem-dado">Sem minutos divulgados pela fonte</small>`;
      status = j.confirmado ? `<span class="jt-sit ok" title="Wikipédia e elenco da ESPN batem">confirmado</span>` : j.clubeEspn ? `<span class="jt-sit dif" title="A Wikipédia diz ${esc(j.clube || "")}; a ESPN lista no ${esc(j.clubeEspn)}">ESPN: ${esc(j.clubeEspn)}</span>` : "";
    } else {
      sub = `<span>${CP.NOME[f] || ""}${j.num ? ` · ${esc(j.num)}` : ""}${j.idade ? ` · ${j.idade} anos` : ""}</span>${BANDEIRA(j.pais)}`;
      uso = `${barra((j.min || 0) / maxMin)}<small>${j.min ? `${mil(j.min)} min · ${j.jogos} ${j.jogos === 1 ? "jogo" : "jogos"}${j.tit ? ` · ${j.tit} como titular` : ""}` : "Sem minutos na temporada"}</small>`;
      const s = j.situacao;
      if (s) status = `<span class="jt-sit ${s.st === "titular" ? "tit" : s.st === "reserva" ? "res" : "pou"}" title="${esc((s.fontes || []).join(" · "))}">${s.st}${s.st === "titular" ? ` · ${s.conf}/${s.de} fontes` : ""}</span>`;
      if (tipo === "dentro") status += `<span class="jt-sit emp">emprestado pelo ${esc(j.emprestadoDe)}${j.ateQuando ? ` até ${data(j.ateQuando)}` : ""}</span>`;
      if (j.lesao) status += `<span class="jt-sit les">lesionado</span>`;
    }
    // cria da base (carreira no ogol, conferida pelo robô): o rótulo do clube, na cor dele; revelado fora, com o escudo de lá
    const b = j.base, cb = b && byId[b.clube];
    if (cb) status = `<span class="jt-sit cria" style="--cria:${cb.colors[0]};--cria2:${cb.colors[1] || cb.colors[0]}" title="Formado nas categorias de base do ${esc(cb.name)} (carreira no ogol.com.br)">${b.clube === cid ? esc(b.rotulo) : `${crest(cb, 14)}Revelado pelo ${esc(cb.name)}`}</span>` + status;
    return `<li class="jt-card d-${d}" data-jt-j="${esc(j.id)}">
      ${avatar(j, c)}
      <div class="jt-card-txt"><span class="jt-nome-l">${ficha(j, cid) ? `<a class="jt-nome" href="${ficha(j, cid)}" title="Ficha técnica: mapa de calor, jogos e notas">${esc(j.nome)}</a>` : `<b class="jt-nome">${esc(j.nome)}</b>`}${conferido(j)}</span><span class="jt-sub">${sub}</span><span class="jt-uso">${uso}</span>${status ? `<span class="jt-sits">${status}</span>` : ""}</div>
      <div class="jt-card-dir"><span class="jt-valor">${eur(j.valor)}${j.valorReal ? `<small class="jt-real" title="Valor de mercado do Transfermarkt${j.tm?.vd ? `, avaliação de ${data(j.tm.vd)}` : ""}">Transfermarkt</small>` : ""}${salFaixa(j.salario)}</span>
        <div class="jt-seg" role="radiogroup" aria-label="Decisão sobre ${esc(j.nome)}">${opc.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === d}" class="${v === d ? "on" : ""} o-${v}" data-jt-dec="${v}">${l}</button>`).join("")}</div></div></li>`;
  }
  function etapaElenco(cid, D, e) {
    const porGrupo = GRUPOS.map(([nome, cods]) => [nome, D.elenco.filter((j) => cods.includes(j.funcao || CP.origem(j))).sort((a, b) => (b.min || 0) - (a.min || 0))]);
    const usados = new Set(porGrupo.flatMap(([, js]) => js.map((j) => j.id)));
    const resto = D.elenco.filter((j) => !usados.has(j.id));
    if (resto.length) porGrupo.push(["Outros", resto]);
    const fin = D.financas;
    return `<div class="jt-bloco">
        <div class="jt-bloco-h"><h3>Elenco atual</h3><span>${D.elenco.length} jogadores · valor estimado ${eur(D.valorTotal)} · folha ${brl(D.folhaMensal)}/mês</span></div>
        <div class="jt-atalhos"><button type="button" class="chip" data-jt-auto="limpa">Todos ficam</button><button type="button" class="chip" data-jt-auto="veteranos">Liberar quem tem 34+</button><button type="button" class="chip" data-jt-auto="base">Emprestar a base sem minutos</button></div>
        ${porGrupo.filter(([, js]) => js.length).map(([nome, js]) => `<section class="jt-grupo"><h4>${nome} <small>${js.length}</small></h4><ul class="jt-cards">${js.map((j) => cartaoJogador(cid, j, e, D)).join("")}</ul></section>`).join("")}
      </div>
      <div class="jt-bloco">
        <div class="jt-bloco-h"><h3>Emprestados</h3><span>${D.emprestados.length ? `${D.emprestados.length} jogadores do ${esc(byId[cid].name)} em outros clubes · traga de volta quem você quiser` : "Nenhum emprestado encontrado nas fontes"}</span></div>
        ${D.emprestados.length ? `<ul class="jt-cards">${D.emprestados.map((j) => cartaoJogador(cid, { ...j, fora: true }, e, D)).join("")}</ul>` : ""}
      </div>
      <div class="jt-seguir"><a class="jt-btn" href="#/clube/${cid}/mercado/reforcos">Ir aos reforços</a></div>
      <p class="source">Elenco: cadastro da ESPN e do TheSportsDB, conferido com as súmulas (quem jogou nos últimos 45 dias entra mesmo fora do cadastro). Minutos: todas as competições da temporada, pelas súmulas. Situação: súmulas dos últimos 5 jogos, último jogo e manchetes de escalação. Emprestados: Wikipédia em inglês (CC BY-SA 4.0) conferida com os elencos da ESPN.
        Folha: ${fin?.folha ? `${esc(fin.folha.fonte)}${fin.folha.data ? ` (${data(fin.folha.data)})` : ""}` : "estimativa"}, dividida entre os jogadores pelo tempo de carreira, pelos minutos e pelo valor (o salário de cada um não é público). Câmbio: ${fin?.cambio ? `${esc(fin.cambio.fonte)}, € 1 = R$ ${String(fin.cambio.valor).replace(".", ",")}` : "referência"}. Valor de mercado: estimativa do CazéStats.TV. Atualizado em ${esc(D.updated)}.</p>`;
  }

  /* ---------- 2) reforços ---------- */
  const filtros = {};
  const FILTRO_PADRAO = { q: "", pos: "", lg: "", nac: "", idMin: 16, idMax: 40, vMax: 0, ord: "valor", semLes: true, n: 25, alt: "", lado: "", soReal: false };
  const fichaAberta = {}; // jogador com a mini aba aberta nos reforços, por clube
  // (filtros guardados antes de 25/11: o de retorno defensivo e a ordem "Mais recompõem" saíram)
  const fil = (cid) => (filtros[cid] = filtros[cid] || ((f) => { delete f.def; if (f.ord === "def") f.ord = "valor"; return f; })({ ...FILTRO_PADRAO, ...(sessaoLe(cid)?.filtros || {}) }));
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  /* busca pelo nome: cada palavra digitada precisa achar uma palavra do nome (começo ou palavra inteira), tolerando as
     grafias do mesmo som (z/s, y/i, ph/f, letras dobradas) e um erro de digitação em palavras de 5 letras ou mais:
     "brian rodrigues" acha "Brian Rodríguez"; "rodr" acha também */
  const som = (w) => w.replace(/ph/g, "f").replace(/y/g, "i").replace(/z/g, "s").replace(/(.)\1+/g, "$1").replace(/[^a-z0-9]/g, "");
  function umErro(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, dif = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++dif > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return dif + (a.length - i) + (b.length - j) <= 1;
  }
  function nomeBate(nome, palavras) {
    if (!palavras.length) return true;
    const ws = norm(nome).split(/[\s.'-]+/).filter(Boolean).map(som);
    return palavras.every((p) => ws.some((w) => w.startsWith(p) || (p.length >= 5 && umErro(w, p))));
  }
  function resultados(cid, D, G, e) {
    const f = fil(cid), meus = new Set(D.elenco.map((j) => j.id)), escolhidos = new Set(e.chegadas);
    const palavras = norm(f.q).split(/[\s.'-]+/).filter(Boolean).map(som);
    const meuTime = Object.entries(G.times).find(([, t]) => t[0] && norm(t[0]) === norm(byId[cid].name))?.[0];
    // quem tem o nome procurado mas está escondido pelos filtros (o aviso diz quantos e por quê)
    const pelosNomes = palavras.length ? G.jogadores.filter((r) => !meus.has(r[0]) && r[6] !== meuTime && nomeBate(r[1], palavras)) : [];
    const L = (palavras.length ? pelosNomes : G.jogadores).filter((r) => !meus.has(r[0]) && r[6] !== meuTime && posBate(r, f.pos) && (r[2] == null || (r[2] >= f.idMin && r[2] <= f.idMax))
      && (!f.soReal || r[10])
      && (!(f.alt || f.lado) || ((z) => z && (!f.alt || z.t === f.alt) && (!f.lado || z.l === f.lado))(zonaDe(r)))
      && (!f.vMax || r[8] <= f.vMax) && (!f.lg || G.times[r[6]]?.[2] === f.lg) && (!f.semLes || !r[9])
      && (!f.nac || (f.nac === "bra" ? r[4] === "bra" : f.nac === "est" ? r[4] !== "bra" : r[4] === f.nac)));
    const escondidos = pelosNomes.filter((r) => !L.includes(r));
    const ord = { valor: (a, b) => b[8] - a[8], idade: (a, b) => (a[2] ?? 99) - (b[2] ?? 99), nome: (a, b) => a[1].localeCompare(b[1], "pt-BR"), barato: (a, b) => a[8] - b[8] }[f.ord] || ((a, b) => b[8] - a[8]);
    L.sort(ord);
    return { L, escolhidos, escondidos };
  }
  const POS_FILTRO = [
    ["Setor", [["", "Todas"], ["G", "GOL", "Goleiros"], ["D", "DEF", "Defensores"], ["M", "MEI", "Meio-campistas"], ["A", "ATA", "Atacantes"]]],
    ["Defesa", [["ZAG", "Zagueiro"], ["lat", "Laterais"], ["LD", "Lat. dir.", "Lateral-direito"], ["LE", "Lat. esq.", "Lateral-esquerdo"]]],
    ["Meio", [["VOL1", "1º volante", "Cabeça de área: protege a zaga e marca mais"], ["VOL2", "2º volante", "Sai para o jogo: chega ao ataque e participa dos gols"], ["VOL", "Volantes", "1º e 2º volantes"], ["MC", "Meio-campista"], ["MEI", "Meia-atacante"], ["mei", "Todos os meias", "Meio-campista, meia-atacante e meias pelos lados"]]],
    ["Ataque", [["pon", "Pontas"], ["PD", "Ponta dir.", "Ponta direita"], ["PE", "Ponta esq.", "Ponta esquerda"], ["SA", "2º atacante", "Segundo atacante"], ["CA", "Centroavante"]]],
  ];
  const dataHttp = (t) => { const d = new Date(t); return isNaN(d) ? t : d.toLocaleDateString("pt-BR"); };
  function etapaReforcos(cid, D, e, k, G) {
    if (!G) return `<div class="jt-bloco"><div class="empty" style="padding:40px">Carregando o mercado global…</div></div>`;
    const c = byId[cid], f = fil(cid), { L, escolhidos, escondidos } = resultados(cid, D, G, e);
    const nomePais = G.paises || {};
    const contPais = {};
    for (const r of G.jogadores) if (r[4]) contPais[r[4]] = (contPais[r[4]] || 0) + 1;
    const topPaises = Object.entries(contPais).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([p]) => p).sort((a, b) => (nomePais[a] || a).localeCompare(nomePais[b] || b, "pt-BR"));
    const sel = (nome, v, ops) => `<select data-jt-f="${nome}">${ops.map(([x, l]) => `<option value="${esc(x)}"${String(x) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const linhas = L.slice(0, f.n).map((r) => {
      const j = jogadorGlobal(G, r[0], D), ja = escolhidos.has(j.id), semDinheiro = k.real && !ja && j.valor > k.caixa;
      const aberta = fichaAberta[cid] === j.id, z = zonaDe(r);
      const setor = j.sub ? SUB_SETOR[j.sub] : j.pos;
      const perfil = etiquetas(j.tat)
        + (z ? `<em class="jt-zona" title="${z.real ? "Onde mais age, pelos lances reais no Brasileirão" : "Estimado pela posição"}">${TERCO[z.t]} ${LADO[z.l]}${z.real ? "" : "*"}</em>` : "");
      return `<tr class="${ja ? "jt-ja" : ""}${aberta ? " jt-aberta" : ""}"><td class="jt-quem">${avatar(j, c, 34)}<div><b>${esc(j.nome)}</b><small>${j.timeLogo ? crestOutro(j.timeNome, j.timeLogo, 14) : ""} ${esc(j.timeNome)} · ${esc(G.ligas[j.lg]?.[0] || "")}</small>${perfil ? `<span class="jt-perfil">${perfil}</span>` : ""}</div></td>
        <td class="jt-pos"><span class="jt-pos-t p-${setor}" title="${esc(SUB_NOME[j.sub] || "")}">${j.sub || POS_CURTO[j.pos]}</span></td><td class="hide-sm">${j.idade ?? "—"}</td><td class="hide-sm">${BANDEIRA(j.pais)}</td>
        <td class="jt-v">${eur(j.valor)}${j.real ? `<small class="jt-real" title="Valor de mercado do Transfermarkt">Transfermarkt</small>` : `<small class="jt-est" title="Sem o jogador no Transfermarkt: estimativa do CazéStats.TV, calibrada pelos valores reais da mesma liga">estimativa</small>`}${salFaixa(j.salario)}</td>
        <td class="jt-acao"><button type="button" class="jt-contratar ${ja ? "ja" : ""}" data-jt-add="${esc(j.id)}" ${semDinheiro ? `disabled title="Sem caixa no modo real"` : ""}>${ja ? "Contratado" : semDinheiro ? "Sem caixa" : "Contratar"}</button>
          <button type="button" class="jt-ver" data-jt-ficha="${esc(j.id)}" aria-expanded="${aberta}" aria-controls="jt-mini-${esc(j.id)}">${aberta ? "Fechar" : "Ficha"}</button></td></tr>
        ${aberta ? `<tr class="jt-mini-tr"><td colspan="6"><div class="jt-mini" id="jt-mini-${esc(j.id)}" data-jt-mini="${esc(j.id)}"><div class="empty" style="padding:16px">Abrindo a ficha…</div></div></td></tr>` : ""}`;
    }).join("");
    return `<div class="jt-mercado">
      <aside class="jt-bloco jt-filtros"><div class="jt-bloco-h"><h3>Filtros</h3></div>
        <label class="jt-f-busca"><span>Nome</span><input type="search" data-jt-f="q" value="${esc(f.q)}" placeholder="Buscar jogador" autocomplete="off"></label>
        <div class="jt-f-pos" role="group" aria-label="Posição">${POS_FILTRO.map(([titulo, ops]) => `<div class="jt-f-pos-g"><span>${titulo}</span><div>${ops.map(([v, l, t]) => `<button type="button" class="chip ${f.pos === v ? "on" : ""}" data-jt-pos="${v}" aria-pressed="${f.pos === v}"${t ? ` title="${t}"` : ""}>${l}</button>`).join("")}</div></div>`).join("")}</div>
        <div class="jt-f-2"><label><span>Onde atua</span>${sel("alt", f.alt, [["", "Campo todo"], ["D", "Defesa"], ["M", "Meio-campo"], ["A", "Ataque"]])}</label><label><span>Lado</span>${sel("lado", f.lado, [["", "Qualquer"], ["E", "Esquerda"], ["C", "Centro"], ["D", "Direita"]])}</label></div>
        <label><span>Liga</span>${sel("lg", f.lg, [["", "Todas as ligas"], ...Object.entries(G.ligas).map(([k2, v]) => [k2, `${v[0]} (${v[1]})`])])}</label>
        <label><span>Nacionalidade</span>${sel("nac", f.nac, [["", "Todas"], ["bra", "Só brasileiros"], ["est", "Só estrangeiros"], ...topPaises.filter((p) => p !== "bra").map((p) => [p, nomePais[p] || p])])}</label>
        <div class="jt-f-2"><label><span>Idade mín.</span><input type="number" min="15" max="45" data-jt-f="idMin" value="${f.idMin}"></label><label><span>Idade máx.</span><input type="number" min="15" max="45" data-jt-f="idMax" value="${f.idMax}"></label></div>
        <label><span>Valor até</span>${sel("vMax", f.vMax, [[0, "Qualquer valor"], [1e6, "€ 1 mi"], [3e6, "€ 3 mi"], [5e6, "€ 5 mi"], [10e6, "€ 10 mi"], [20e6, "€ 20 mi"], [40e6, "€ 40 mi"]])}</label>
        <label><span>Ordenar por</span>${sel("ord", f.ord, [["valor", "Mais valiosos"], ["barato", "Mais baratos"], ["idade", "Mais jovens"], ["nome", "Nome"]])}</label>
        <label class="jt-f-chk"><input type="checkbox" data-jt-f="semLes" ${f.semLes ? "checked" : ""}> Esconder lesionados</label>
        <label class="jt-f-chk"><input type="checkbox" data-jt-f="soReal" ${f.soReal ? "checked" : ""}> Só com valor do Transfermarkt</label>
      </aside>
      <div>
        <div class="jt-bloco"><div class="jt-bloco-h"><h3>Chegadas</h3><span>${k.chegadas.length} · ${eur(k.chegadas.reduce((s, j) => s + j.valor, 0))}</span></div>
          ${k.chegadas.length ? `<ul class="jt-negocios">${k.chegadas.map((j) => negocio(cid, j, G)).join("")}</ul>` : `<div class="empty" style="padding:18px">Nenhum reforço ainda. Contrate na lista abaixo: cada negócio fechado aparece aqui.</div>`}</div>
        <div class="jt-bloco jt-tab-card"><div class="jt-bloco-h"><h3>Mercado global</h3><span>${L.length.toLocaleString("pt-BR")} jogadores · ${Object.keys(G.ligas).length} ligas</span></div>
          <div class="jt-scroll"><table class="table jt-tabela"><thead><tr><th>Jogador</th><th>Pos.</th><th class="hide-sm">Idade</th><th class="hide-sm">Nac.</th><th>Valor · salário</th><th></th></tr></thead><tbody>${linhas || `<tr><td colspan="6"><div class="empty" style="padding:24px">Nenhum jogador com esses filtros.</div></td></tr>`}</tbody></table></div>
          ${escondidos.length ? `<p class="jt-escondidos" role="status">${escondidos.length === 1 ? `<b>${esc(escondidos[0][1])}</b> (${esc(G.times[escondidos[0][6]]?.[0] || "")}) tem esse nome mas está escondido pelos filtros` : `${escondidos.length} jogadores com esse nome estão escondidos pelos filtros`} (posição, idade, liga, valor, nacionalidade ou lesionados). <button type="button" class="chip" data-jt-limpa-f>Limpar os filtros</button></p>` : ""}
          ${L.length > f.n ? `<button type="button" class="jt-mais" data-jt-mais>Mostrar mais ${Math.min(25, L.length - f.n)}</button>` : ""}
          <p class="source">Elencos de ${Object.keys(G.ligas).length} ligas pela ESPN (atualizados toda semana). Valor de mercado, contrato, posição e foto: Transfermarkt, pelo conjunto público transfermarkt-datasets (CC0)${G.valores?.arquivo ? `, versão de ${esc(dataHttp(G.valores.arquivo))}` : ""}, conferido a cada rodada do robô; ${(G.valores?.casados || 0).toLocaleString("pt-BR")} de ${(G.valores?.total || G.jogadores.length).toLocaleString("pt-BR")} jogadores achados lá. Quem não está lá tem valor estimado. Salário: estimativa (nenhuma fonte pública tem o salário de cada um). Etiquetas: lances reais da Série A; * pela ficha de escalações do Transfermarkt (outras ligas); zona com * estimada pela posição. ${esc(G.updated || "")}</p></div>
        <div class="jt-seguir"><a class="jt-btn sec" href="#/clube/${cid}/mercado/elenco">Voltar ao elenco</a><a class="jt-btn" href="#/clube/${cid}/mercado/escalacao">Montar a escalação</a></div>
      </div></div>`;
  }
  // o cartão do negócio: de onde vem, para onde vai, quanto custou
  function negocio(cid, j, G) {
    const c = byId[cid];
    return `<li class="jt-negocio">${avatar(j, c, 48)}
      <div class="jt-neg-txt"><b>${esc(j.nome)}</b><small>${POS_CURTO[j.pos]} · ${j.idade ?? "—"} anos ${BANDEIRA(j.pais)}</small></div>
      <div class="jt-neg-rota" aria-label="De ${esc(j.timeNome)} para ${esc(c.name)}">${j.timeLogo ? crestOutro(j.timeNome, j.timeLogo, 26) : ""}<svg viewBox="0 0 24 12" width="26" height="13" aria-hidden="true"><path d="M1 6h19m-5-5 6 5-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${crest(c, 26)}</div>
      <b class="jt-neg-v">${eur(j.valor)}</b>
      <button type="button" class="jt-tirar" data-jt-del="${esc(j.id)}" aria-label="Desfazer a contratação de ${esc(j.nome)}">×</button></li>`;
  }
  // carimbo de negócio fechado, por cima de tudo, por um instante
  function carimbo(cid, j) {
    if (!j) return;
    const c = byId[cid], d = document.createElement("div");
    d.className = "jt-fechado";
    d.setAttribute("role", "status");
    d.innerHTML = `<div class="jt-fechado-c" style="--c1:${c.colors[0]};--c2:${c.colors[1]}">${avatar(j, c, 72)}<b>${esc(j.nome)}</b>
      <span class="jt-neg-rota">${j.timeLogo ? crestOutro(j.timeNome, j.timeLogo, 30) : ""}<svg viewBox="0 0 24 12" width="30" height="15" aria-hidden="true"><path d="M1 6h19m-5-5 6 5-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${crest(c, 30)}</span>
      <small>${eur(j.valor)}</small><em>Negócio fechado</em></div>`;
    document.body.appendChild(d);
    setTimeout(() => d.classList.add("sai"), reduz() ? 900 : 1500);
    setTimeout(() => d.remove(), reduz() ? 1100 : 1900);
  }

  /* ---------- 3) escalação: campo 3D ---------- */
  const FORMACOES = {
    "4-3-3": [[50, 92], [15, 72], [38, 76], [62, 76], [85, 72], [28, 52], [50, 56], [72, 52], [18, 26], [50, 20], [82, 26]],
    "4-4-2": [[50, 92], [15, 72], [38, 76], [62, 76], [85, 72], [16, 48], [38, 52], [62, 52], [84, 48], [38, 22], [62, 22]],
    "4-2-3-1": [[50, 92], [15, 72], [38, 76], [62, 76], [85, 72], [36, 60], [64, 60], [18, 36], [50, 38], [82, 36], [50, 16]],
    "3-5-2": [[50, 92], [25, 74], [50, 77], [75, 74], [10, 50], [32, 52], [50, 46], [68, 52], [90, 50], [38, 22], [62, 22]],
    "3-4-3": [[50, 92], [25, 74], [50, 77], [75, 74], [10, 50], [38, 54], [62, 54], [90, 50], [18, 24], [50, 18], [82, 24]],
    "5-3-2": [[50, 92], [10, 66], [30, 75], [50, 78], [70, 75], [90, 66], [28, 50], [50, 54], [72, 50], [38, 22], [62, 22]],
    "4-1-4-1": [[50, 92], [15, 72], [38, 76], [62, 76], [85, 72], [50, 60], [16, 46], [38, 48], [62, 48], [84, 46], [50, 20]],
    "3-4-2-1": [[50, 92], [25, 74], [50, 77], [75, 74], [10, 50], [38, 54], [62, 54], [90, 50], [30, 34], [70, 34], [50, 16]],
  };
  /* escalação que o técnico mandou a campo no último jogo (súmula da ESPN, js/squads.js), posta na formação da janela:
     cada titular vai para a posição da janela com a mesma sigla (VOL, PE...) ou, sem ela, para a mais perto */
  // escalação anunciada para o jogo de hoje (ESPN, ou perfis oficiais no X e no Instagram): vale mais que a do último jogo
  function anunciada(cid) {
    const a = (window.ESCALACOES?.clubes || {})[cid], f = a?.fontes?.[0];
    if (!a?.confirmada || !f || (a.t && Date.now() / 1000 - a.t > 6 * 3600)) return null;
    return { formation: f.formacao, xi: f.xi, comp: a.jogo.comp, vs: a.jogo.adversario, home: a.jogo.casa, date: a.jogo.data, anunciada: a, fonte: f };
  }
  function ultimaEscalacao(cid, k) {
    const an = anunciada(cid);
    if (an && !(an.formation && window.LINEUP?.F?.[an.formation] && FORMACOES[an.formation])) {
      // sem formação (publicação do clube): mantém a formação do último jogo e põe cada um na posição de origem
      const ids = new Set(k.elencoFinal.map((j) => j.id)), xi = an.xi.map(([, id]) => id).filter((id) => ids.has(id));
      if (xi.length >= 9) { const form = (window.SQUADS_LAST || {})[cid]?.formation; const f = FORMACOES[form] ? form : "4-2-3-1"; return { form: f, esc: autoEscala({ elencoFinal: k.elencoFinal.filter((j) => xi.includes(j.id)) }, f), jogo: an }; }
    }
    const L = an && an.formation ? an : (window.SQUADS_LAST || {})[cid], LF = window.LINEUP?.F?.[L?.formation];
    if (!L || !LF || !FORMACOES[L.formation]) return null;
    const ids = new Set(k.elencoFinal.map((j) => j.id)), porLugar = Object.fromEntries((L.xi || []).map(([n, id]) => [n, String(id)]));
    const slots = FORMACOES[L.formation].map((p, i) => ({ i, cod: CP.zona(p[0], p[1]), x: p[0], y: p[1] })), usados = new Set(), esc2 = {};
    LF.forEach(([papel, , l, dd, da, lugar]) => {
      const id = porLugar[lugar];
      if (!id || !ids.has(id)) return;
      const y = 96 - ((dd + da) / 2) * 1.14;
      const livre = slots.filter((s) => !usados.has(s.i));
      const s = livre.find((s) => s.cod === papel) || livre.filter((s) => CP.SETOR[s.cod] === CP.SETOR[papel]).sort((a, b) => Math.hypot(a.x - l, a.y - y) - Math.hypot(b.x - l, b.y - y))[0] || livre.sort((a, b) => Math.hypot(a.x - l, a.y - y) - Math.hypot(b.x - l, b.y - y))[0];
      if (s) { usados.add(s.i); esc2[s.i] = id; }
    });
    return Object.keys(esc2).length >= 7 ? { form: L.formation, esc: esc2, jogo: L } : null;
  }
  const ptSlot = (e, i) => e.pos[i] || FORMACOES[e.form][i];
  const uso = (j) => (j.situacao?.st === "titular" ? 1e6 : 0) + (j.tit || 0) * 100 + (j.min || 0) / 10 + (j.reforco ? j.valor / 1e5 : 0);
  function autoEscala(k, form) {
    const usados = new Set(), esc2 = {}, disp = k.elencoFinal.filter((j) => !j.lesao);
    const ordem = FORMACOES[form].map((p, i) => [i, CP.zona(p[0], p[1])]).sort((a, b) => (a[1] === "GOL" ? -1 : b[1] === "GOL" ? 1 : 0));
    for (const [i, cod] of ordem) {
      const livres = disp.filter((j) => !usados.has(j.id));
      const pega = (f) => livres.filter(f).sort((a, b) => uso(b) - uso(a))[0];
      const op = pega((j) => CP.origem(j) === cod) || (cod !== "GOL" && (pega((j) => CP.historico(j)[cod]?.[1] >= 90) || pega((j) => CP.parecida(CP.origem(j), cod) && CP.origem(j) !== "GOL") || pega((j) => CP.SETOR[CP.origem(j)] === CP.SETOR[cod]) || pega((j) => CP.origem(j) !== "GOL")));
      if (op) { usados.add(op.id); esc2[i] = op.id; }
    }
    return esc2;
  }
  function escalacaoValida(e, k, cid) {
    if (!e.escManual && cid && !e._ultimaAplicada) {
      const u = ultimaEscalacao(cid, k);
      if (u) {
        e.form = u.form; e.pos = {}; e.esc = u.esc; e._ultimaAplicada = true;
        const usados = new Set(Object.values(u.esc)), falta = autoEscala({ elencoFinal: k.elencoFinal.filter((j) => !usados.has(j.id)) }, e.form);
        FORMACOES[e.form].forEach((_, i) => { if (!e.esc[i] && falta[i]) e.esc[i] = falta[i]; });
      }
    }
    const ids = new Set(k.elencoFinal.map((j) => j.id)), esc2 = {};
    for (const [s, id] of Object.entries(e.esc)) if (ids.has(id) && +s < FORMACOES[e.form].length) esc2[s] = id;
    return Object.keys(esc2).length >= 11 ? esc2 : { ...autoEscala(k, e.form), ...esc2 };
  }
  function etapaEscalacao(cid, D, e, k) {
    const c = byId[cid], esc2 = escalacaoValida(e, k, cid), porId = new Map(k.elencoFinal.map((j) => [j.id, j]));
    const titulares = new Set(Object.values(esc2)), sel = estadoSlot[cid];
    const L = (window.SQUADS_LAST || {})[cid], an = anunciada(cid);
    const origem = e.escManual ? "" : an ? `<p class="jt-ultima anunciada">Escalação anunciada para ${an.home ? `${esc(c.abbr)} x ${esc(an.vs)}` : `${esc(an.vs)} x ${esc(c.abbr)}`} (${esc(an.comp)}, ${data(an.date)}) · fonte: ${an.fonte.link ? `<a href="${esc(window.SEG.url(an.fonte.link))}" target="_blank" rel="noopener noreferrer">${esc(an.fonte.fonte)}</a>` : esc(an.fonte.fonte)}${an.anunciada.fontes.length > 1 ? ` e mais ${an.anunciada.fontes.length - 1}` : ""}</p>`
      : L && ultimaEscalacao(cid, k) ? `<p class="jt-ultima">Escalação do último jogo: ${esc(L.comp)}, ${L.home ? `${esc(c.abbr)} ${esc(L.score.replace("-", " x "))} ${esc(L.vs)}` : `${esc(L.vs)} ${esc(L.score.split("-").reverse().join(" x "))} ${esc(c.abbr)}`} · ${data(L.date)} · ${esc(L.formation)}</p>` : "";
    const fora = k.elencoFinal.filter((j) => !titulares.has(j.id)).sort((a, b) => uso(b) - uso(a));
    const banco = fora.slice(0, 12), demais = fora.slice(12);
    const estr = [...titulares].map((id) => porId.get(id)).filter((j) => j && !brasileiro(j)).length;
    const item = (j) => { const f = CP.origem(j); return `<li><button type="button" class="jt-res" data-jt-poe="${esc(j.id)}">${avatar(j, c, 34)}<span><b>${esc(j.nome)}</b><small>${f} · ${CP.NOME[f] || ""}${j.min ? ` · ${mil(j.min)} min` : ""}</small></span>${j.reforco ? '<em class="jt-novo">reforço</em>' : ""}${j.lesao ? '<em class="jt-les">lesão</em>' : ""}</button></li>`; };
    const selJ = sel != null ? porId.get(esc2[sel]) : null;
    const pv = selJ ? CP.previa(selJ, CP.zona(...ptSlot(e, sel))) : null;
    return `<div class="jt-esc">
      <div class="jt-bloco jt-campo-bloco">
        <div class="jt-bloco-h"><h3>Escalação</h3><span>arraste para qualquer ponto do campo; solte um reserva em cima de um titular para trocar</span></div>
        <div class="jt-forms" role="group" aria-label="Formação">${Object.keys(FORMACOES).map((f) => `<button type="button" class="chip ${f === e.form ? "on" : ""}" data-jt-form="${f}">${f}</button>`).join("")}${L ? `<button type="button" class="chip" data-jt-ultima>Último jogo</button>` : ""}<button type="button" class="chip" data-jt-auto-esc>Escalar sozinho</button>${Object.keys(e.pos).length ? `<button type="button" class="chip" data-jt-alinha>Alinhar na formação</button>` : ""}</div>
        ${origem}
        <div class="jt-campo" data-jt-campo style="--c1:${c.colors[0]};--c2:${c.colors[1]}">
          <div class="jt-palco"><div class="jt-grama"><svg viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.75)" stroke-width=".45"><rect x="2" y="2" width="64" height="96"/><line x1="2" y1="50" x2="66" y2="50"/><circle cx="34" cy="50" r="9.15"/><circle cx="34" cy="50" r=".6" fill="#fff"/><rect x="13.85" y="2" width="40.3" height="16.5"/><rect x="24.85" y="2" width="18.3" height="5.5"/><rect x="13.85" y="81.5" width="40.3" height="16.5"/><rect x="24.85" y="92.5" width="18.3" height="5.5"/><path d="M26.7 18.5a9.15 9.15 0 0 0 14.6 0M26.7 81.5a9.15 9.15 0 0 1 14.6 0"/></g><rect x="30.3" y="0.4" width="7.4" height="1.6" fill="rgba(255,255,255,.9)"/><rect x="30.3" y="98" width="7.4" height="1.6" fill="rgba(255,255,255,.9)"/></svg></div></div>
          <div class="jt-fichas">${FORMACOES[e.form].map((_, i) => {
            const j = porId.get(esc2[i]), [x, y] = ptSlot(e, i), cod = CP.zona(x, y), a = j ? CP.avalia(j, cod) : null;
            return `<button type="button" class="jt-ficha ${sel === i ? "on" : ""} ${j && j.reforco ? "novo" : ""} ${a ? `s-${a.tipo}` : ""}" data-jt-slot="${i}" data-x="${x}" data-y="${y}" aria-label="${CP.NOME[cod]}: ${j ? esc(j.nome) : "vazio"}${a && a.tipo !== "igual" ? `, saiu de ${a.de}` : ""}">
              ${a && a.tipo !== "igual" ? CP.selo(a) : `<span class="cp-selo s-igual"><b>${cod}</b></span>`}${j ? avatar(j, c, 40) : `<span class="jt-av vazio" style="--t:40px"><b>+</b></span>`}<small>${j ? esc(sobrenome(j.nome)) : cod}</small></button>`;
          }).join("")}</div>
        </div>
        ${k.real && estr > 9 ? `<p class="jt-alertas"><span>Mais de 9 estrangeiros entre os titulares: a CBF só deixa relacionar 9.</span></p>` : ""}
        <div class="jt-previa" data-jt-previa aria-live="polite">${pv ? pv.html : `<p class="cp-cab">Toque num titular para ver onde ele costuma jogar e como foi em cada posição.</p>`}</div>
      </div>
      <div class="jt-bloco jt-banco-bloco">
        <div class="jt-bloco-h"><h3>Banco</h3><span>${banco.length} de 12</span></div>
        <ul class="jt-banco">${banco.map(item).join("")}</ul>
        ${demais.length ? `<div class="jt-bloco-h"><h3>Demais do elenco</h3><span>${demais.length}</span></div><ul class="jt-banco">${demais.map(item).join("")}</ul>` : ""}
      </div>
      <div class="jt-seguir"><a class="jt-btn sec" href="#/clube/${cid}/mercado/reforcos">Voltar aos reforços</a><a class="jt-btn" href="#/clube/${cid}/mercado/compartilhar">Compartilhar o elenco</a></div></div>`;
  }
  const estadoSlot = {};
  // posiciona o palco e as fichas pela projeção 3D (refeito quando o tamanho muda)
  function montaCampo(campo) {
    const palco = $(".jt-palco", campo), grama = $(".jt-grama", campo);
    if (!palco) return null;
    // a borda de baixo (mais perto) aparece ~18% mais larga: o plano é mais estreito que a caixa para caber nela
    const CW = campo.clientWidth, W = Math.round(CW / 1.22), H = Math.round(W * 1.42), g = CP.geometria(W, H), esq = (CW - W) / 2;
    palco.style.cssText = `width:${W}px;height:${H}px;perspective:${g.P.toFixed(0)}px;top:${(14 - g.topo).toFixed(1)}px;left:${esq.toFixed(1)}px`;
    grama.style.transform = `rotateX(${g.rot}deg)`;
    campo.style.height = `${Math.round(g.base - g.topo + 46)}px`;
    $$(".jt-ficha", campo).forEach((f) => {
      const p = g.tela(+f.dataset.x / 100, +f.dataset.y / 100);
      f.style.left = `${p.x + esq}px`; f.style.top = `${p.y + 14 - g.topo}px`; f.style.setProperty("--s", p.s.toFixed(3)); f.style.zIndex = String(Math.round(p.y));
    });
    campo._g = g; campo._off = 14 - g.topo; campo._esq = esq;
    return g;
  }

  /* ---------- 4) compartilhar ---------- */
  function etapaCompartilhar(cid, D, e, k, ver = false) {
    const c = byId[cid];
    return `<div class="jt-share">
      <div class="jt-bloco jt-cartaz-card"><canvas class="jt-cartaz" width="1080" height="1350" data-jt-cartaz aria-label="Cartaz do elenco do ${esc(c.name)}"></canvas></div>
      <div class="jt-bloco jt-share-acoes"><div class="jt-bloco-h"><h3>${ver ? "Elenco montado por um amigo" : "Mostre o seu elenco"}</h3></div>
        <p>${ver ? `É assim que um amigo montou o ${esc(c.name)} para 2027. Faça o seu e mande de volta.` : "Baixe o cartaz ou mande o link: quem abrir vê o seu elenco e pode montar o dele."}</p>
        <div class="jt-share-btns">
          <button type="button" class="jt-btn" data-jt-png>Baixar PNG</button>
          <button type="button" class="jt-btn" data-jt-pdf>Baixar PDF</button>
          <button type="button" class="jt-btn sec" data-jt-link>${navigator.share ? "Compartilhar" : "Copiar link"}</button>
          ${ver ? `<button type="button" class="jt-btn sec" data-jt-usar>Usar como ponto de partida</button><a class="jt-btn sec" href="#/clube/${cid}/mercado/elenco">Montar o meu do zero</a>` : `<a class="jt-btn sec" href="#/clube/${cid}/mercado/elenco">Revisar decisões</a>`}
        </div>
        <ul class="jt-resumo"><li><small>Chegadas</small><b>${k.chegadas.length}</b></li><li><small>Saídas</small><b>${k.saidas.length}</b></li><li><small>Caixa</small><b>${eur(k.caixa)}</b></li><li><small>Folha</small><b>${brl(k.folha)}</b></li></ul>
        <p class="jt-share-msg" data-jt-msg role="status"></p></div></div>`;
  }
  const carregaImg = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.crossOrigin = "anonymous"; im.referrerPolicy = "no-referrer"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  // a primeira foto que abrir para o canvas: a guardada no site (mesmo endereço), Transfermarkt e ESPN (liberam CORS);
  // a do TheSportsDB não libera e travaria o PNG, então fica de fora. Nenhuma abrindo: o número da camisa.
  async function fotoCartaz(j) {
    const lista = [...new Set([j.fotoPrivada, ...(j.fotos || []), j.tm?.f ? TM_FOTO + j.tm.f : null, /^\d+$/.test(j.id) ? ESPN_FOTO(j.id) : null]
      .filter((u) => u && !/thesportsdb/.test(u)).map((u) => (/^https?:/.test(u) ? u : new URL(window.SEG.url(u), location.href).href)))];
    for (const u of lista) { const im = await carregaImg(u); if (im) return im; }
    return null;
  }
  // mistura de cor (hex) com branco/preto: t > 0 clareia, t < 0 escurece
  const tom = (hex, t) => { const n = parseInt(String(hex).replace("#", "").padEnd(6, "0").slice(0, 6), 16); const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255, f = (v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)); return `rgb(${f(r)},${f(gg)},${f(b)})`; };
  const lum = (hex) => { const n = parseInt(String(hex).replace("#", "").padEnd(6, "0").slice(0, 6), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  /* imagem dentro de uma caixa sem achatar: mantém a proporção (escudos não são quadrados) */
  function cabe(x, im, bx, by, bw, bh) {
    if (!im) return;
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, k = Math.min(bw / iw, bh / ih), w = iw * k, h = ih * k;
    x.drawImage(im, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
  }
  /* cartaz do elenco (1080 x 1350), com a cara do CazéStats.TV: escudo e título condensado no alto, etiquetas da
     formação e do modo, meio campo de cantos arredondados com o gramado cortado na cor do clube, cada titular num
     cartão (foto de cantos arredondados, pílula da nota média ou do valor, nome), faixa de chegadas e saídas e a marca */
  async function desenhaCartaz(cv, cid, D, e, k) {
    const x = cv.getContext("2d"), W = cv.width, H = cv.height, c = byId[cid];
    const [c1, c2raw] = c.colors, c2 = c2raw || "#ffffff", c3 = c.colors[2] || c2;
    const vivas = [c1, c2, c3].filter((cor) => lum(cor) > 0.32 && lum(cor) < 0.97);
    const destaque = vivas[0] || "#ffffff";
    try { await Promise.all(['900 96px "Big Shoulders Display"', '800 28px "Big Shoulders Display"', '700 24px "Saira"', '600 20px "Inter"'].map((f) => document.fonts?.load(f))); await document.fonts?.ready; } catch { /* sem fontes */ }
    const DISP = (w, s) => `${w} ${s}px "Big Shoulders Display", "Saira Condensed", sans-serif`, TXT = (w, s) => `${w} ${s}px "Saira", "Inter", sans-serif`;
    const esc2 = escalacaoValida(e, k, cid), porId = new Map(k.elencoFinal.map((j) => [j.id, j]));
    const fichas = FORMACOES[e.form].map((_, i) => ({ i, j: porId.get(esc2[i]), pt: ptSlot(e, i) })).filter((f) => f.j);
    const clubesNota = [...new Set([cid, ...fichas.map((f) => f.j.cidSerieA).filter(Boolean)])];
    if (window.HEATMAP) await Promise.all(clubesNota.map((cc) => HEATMAP.carregaClube(cc).catch(() => null)));
    const notaDe = (j) => {
      const C = window.JOGADORES_CLUBE?.[j.cidSerieA || cid], J = C?.jogadores?.[j.id];
      if (!J?.jogos?.length) return null;
      const iN = (C.campos || []).indexOf("nota"), iM = (C.campos || []).indexOf("min");
      const ns = J.jogos.filter((g) => g[iN] > 0 && (iM < 0 || g[iM] >= 30)).map((g) => g[iN]);
      return ns.length >= 3 ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
    };
    const [logo, marca, ...fotos] = await Promise.all([carregaImg(c.logo), carregaImg(new URL("assets/marca/simbolo.svg", location.href).href), ...fichas.map((f) => fotoCartaz(f.j))]);
    const escudos = new Map(await Promise.all([...new Set(k.chegadas.map((j) => j.timeLogo).filter(Boolean))].map(async (u) => [u, await carregaImg(u)])));
    fichas.forEach((f, i) => { f.foto = fotos[i]; f.nota = notaDe(f.j); });

    /* ---------- fundo: tom escuro do clube com listras diagonais finas nas cores dele ---------- */
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, tom(c1, -0.55)); g.addColorStop(1, tom(c1, -0.85));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = 0.07; x.lineWidth = 14;
    for (let i = -H; i < W; i += 46) { x.strokeStyle = [c1, c2, c3][Math.abs(i / 46) % 3 | 0]; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); }
    x.restore();

    /* ---------- topo: escudo, título condensado e as etiquetas ---------- */
    x.save(); x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = 22; cabe(x, logo, 48, 48, 132, 132); x.restore();
    let ts = 104; const titulo = `MEU ${c.name.toUpperCase()}`;
    x.font = DISP(900, ts); while (x.measureText(titulo).width > W - 250 && ts > 60) { ts -= 4; x.font = DISP(900, ts); }
    x.fillStyle = "#fff"; x.textBaseline = "alphabetic"; x.fillText(titulo, 204, 136);
    x.fillStyle = destaque; x.font = DISP(800, 34); x.fillText("JANELA DE TRANSFERÊNCIAS 2027", 206, 178);
    const pilula = (txt, px, py, fundo, cor) => { x.font = TXT(700, 19); const w = x.measureText(txt).width + 28; x.fillStyle = fundo; rr(x, px, py, w, 34, 17); x.fill(); x.fillStyle = cor; x.fillText(txt, px + 14, py + 23); return w + 10; };
    let px = 206;
    px += pilula(e.form, px, 198, "rgba(255,255,255,.14)", "#fff");
    px += pilula(e.modo === "manager" ? "MODO MANAGER" : "MODO REAL", px, 198, e.modo === "manager" ? "#ffd200" : "rgba(255,255,255,.14)", e.modo === "manager" ? "#111" : "#fff");
    if (k.chegadas.length) pilula(`${k.chegadas.length} ${k.chegadas.length === 1 ? "REFORÇO" : "REFORÇOS"} · ${eur(k.chegadas.reduce((s, j) => s + j.valor, 0))}`, px, 198, "rgba(255,255,255,.14)", "#fff");

    /* ---------- meio campo: retângulo de cantos arredondados, gramado cortado na cor do clube ---------- */
    const cx0 = 36, cy0 = 262, cw = W - 72, ch = 870;
    x.save(); rr(x, cx0, cy0, cw, ch, 30); x.clip();
    const gg = x.createLinearGradient(0, cy0, 0, cy0 + ch); gg.addColorStop(0, tom(c1, -0.38)); gg.addColorStop(1, tom(c1, -0.6));
    x.fillStyle = gg; x.fillRect(cx0, cy0, cw, ch);
    for (let i = 0; i < 10; i++) if (i % 2) { x.fillStyle = "rgba(255,255,255,.035)"; x.fillRect(cx0, cy0 + (ch / 10) * i, cw, ch / 10); }
    x.strokeStyle = "rgba(255,255,255,.22)"; x.lineWidth = 3;
    x.beginPath(); x.arc(cx0 + cw / 2, cy0, 120, 0, Math.PI); x.stroke(); // meia-lua do círculo central (a linha do meio é o alto do cartão)
    x.strokeRect(cx0 + cw * 0.2, cy0 + ch - 190, cw * 0.6, 192); x.strokeRect(cx0 + cw * 0.36, cy0 + ch - 66, cw * 0.28, 68); // grande e pequena área
    x.beginPath(); x.arc(cx0 + cw / 2, cy0 + ch - 190, 72, Math.PI, 0); x.stroke();
    x.restore();
    x.strokeStyle = "rgba(255,255,255,.28)"; x.lineWidth = 2; rr(x, cx0, cy0, cw, ch, 30); x.stroke();

    /* ---------- titulares em cartões, linhas da formação espalhadas por igual ---------- */
    const L = 96, RAIO = 24; // foto 96 px (antes 112): mais espaço entre os nomes
    const alturas = [...new Set(fichas.map((f) => f.pt[1]))].sort((a, b) => a - b), linhas = [];
    for (const y of alturas) { const l = linhas[linhas.length - 1]; if (l && y - l[l.length - 1] < 9) l.push(y); else linhas.push([y]); }
    const linhaDe = (y) => linhas.findIndex((l) => l.includes(y));
    // largura toda do campo (sem perspectiva): os quatro da defesa ficam mais de 20% mais afastados que antes
    const naTela = (pt) => { const n = Math.max(1, linhas.length - 1); return { x: cx0 + 70 + (pt[0] / 100) * (cw - 140), y: cy0 + 84 + (linhaDe(pt[1]) / n) * (ch - 226) }; };
    const larguraNome = (pt) => {
      const l = linhas[linhaDe(pt[1])], px0 = naTela(pt).x;
      const viz = fichas.filter((o) => o.pt !== pt && l.includes(o.pt[1])).map((o) => Math.abs(naTela(o.pt).x - px0));
      return Math.max(110, Math.min(250, (viz.length ? Math.min(...viz) : 400) - 22));
    };
    for (const f of fichas) {
      const { j, foto, nota } = f, p = naTela(f.pt), novo = !!j.reforco, fx = p.x - L / 2, fy = p.y - L / 2;
      // cartão da foto: sombra, borda na cor de destaque (dourada no reforço)
      x.save(); x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = 18; x.shadowOffsetY = 8; x.fillStyle = novo ? "#ffd200" : destaque; rr(x, fx - 4, fy - 4, L + 8, L + 8, RAIO + 4); x.fill(); x.restore();
      x.save(); rr(x, fx, fy, L, L, RAIO); x.clip(); x.fillStyle = "#eef0f3"; x.fillRect(fx, fy, L, L);
      if (foto) { const iw = foto.naturalWidth, ih = foto.naturalHeight, lado = Math.min(iw, ih); x.drawImage(foto, (iw - lado) / 2, 0, lado, lado, fx, fy, L, L); }
      else { x.fillStyle = c1; x.fillRect(fx, fy, L, L); x.fillStyle = onColor(c1) === "#111111" ? "#111" : "#fff"; x.font = DISP(900, 48); x.textAlign = "center"; x.fillText(String(j.num || POS_CURTO[j.pos]).slice(0, 3), p.x, p.y + 17); }
      x.restore();
      // reforço: escudo do clube de origem no canto (sem achatar)
      const eo = novo && j.timeLogo ? escudos.get(j.timeLogo) : null;
      if (eo) { x.beginPath(); x.arc(fx + L - 4, fy + 4, 19, 0, Math.PI * 2); x.fillStyle = "#fff"; x.fill(); x.lineWidth = 3; x.strokeStyle = "#ffd200"; x.stroke(); cabe(x, eo, fx + L - 17, fy - 9, 26, 26); }
      // pílula da nota (verde a partir de 7, amarela de 6,5 a 7) ou do valor, sobre a borda de baixo da foto
      const txt = nota != null ? nota.toFixed(2).replace(".", ",") : eur(j.valor).replace("€ ", "€").replace(" mil", "K").replace(" mi", "M").replace(",0M", "M");
      const corP = nota != null ? (nota >= 7 ? "#1fb84f" : nota >= 6.5 ? "#e0a812" : "#6f7787") : "#ffffff";
      x.font = DISP(900, 26); const pw = x.measureText(txt).width + 24;
      x.fillStyle = corP; rr(x, p.x - pw / 2, fy + L - 14, pw, 32, 16); x.fill();
      x.fillStyle = nota == null || lum(corP) > 0.6 ? "#111" : "#fff"; x.textAlign = "center"; x.fillText(txt, p.x, fy + L + 11);
      // nome
      const nome = String(j.nome || "").replace(/\s+/g, " ").trim().toUpperCase(), lmax = larguraNome(f.pt);
      let fs = 28; x.font = DISP(800, fs);
      while (x.measureText(nome).width > lmax && fs > 18) { fs--; x.font = DISP(800, fs); }
      x.fillStyle = "#fff"; x.fillText(nome, p.x, fy + L + 50, lmax);
      x.textAlign = "left";
    }

    /* ---------- chegadas e saídas ---------- */
    const faixa = (rotulo, js, yy, cor, txt) => {
      x.font = DISP(900, 28); x.fillStyle = cor; x.fillText(rotulo, 48, yy);
      let p0 = 48 + x.measureText(rotulo).width + 18;
      if (!js.length) { x.font = TXT(600, 19); x.fillStyle = "rgba(255,255,255,.55)"; x.fillText("ninguém", p0, yy - 2); return; }
      for (const j of js) {
        x.font = TXT(600, 19);
        const t = txt(j), eo = rotulo === "CHEGADAS" && j.timeLogo ? escudos.get(j.timeLogo) : null, w = x.measureText(t).width + (eo ? 30 : 0) + 24;
        if (p0 + w > W - 48) { x.fillStyle = "rgba(255,255,255,.6)"; x.fillText(`+${js.length - js.indexOf(j)}`, p0, yy - 2); break; }
        x.fillStyle = "rgba(255,255,255,.1)"; rr(x, p0, yy - 26, w, 34, 17); x.fill();
        if (eo) cabe(x, eo, p0 + 10, yy - 22, 24, 26);
        x.fillStyle = "#fff"; x.fillText(t, p0 + 12 + (eo ? 30 : 0), yy - 3);
        p0 += w + 10;
      }
    };
    faixa("CHEGADAS", k.chegadas, 1186, "#ffd200", (j) => `${j.nome} · ${eur(j.valor)}`);
    faixa("SAÍDAS", k.saidas, 1232, "#ff8a8a", (j) => j.nome);

    /* ---------- rodapé: a marca e o resumo ---------- */
    x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, H - 82, W, 82);
    if (marca) cabe(x, marca, 48, H - 62, 42, 42);
    x.fillStyle = "#fff"; x.font = DISP(900, 38); x.fillText("CAZÉSTATS.TV", 102, H - 28);
    x.textAlign = "right"; x.font = TXT(600, 17); x.fillStyle = "rgba(255,255,255,.75)";
    x.fillText(`CAIXA ${eur(k.caixa)} · FOLHA ${brl(k.folha)}/MÊS · ${k.elencoFinal.length} NO ELENCO`, W - 48, H - 46);
    x.fillText("pílula: nota média na temporada (ou valor de mercado)", W - 48, H - 22); x.textAlign = "left";
  }
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function pdfDeJpeg(dataUrl, wpx, hpx) {
    const bin = atob(dataUrl.split(",")[1]), img = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
    const W = 595, Hh = Math.round((595 * hpx) / wpx), enc = new TextEncoder(), partes = [], offs = [];
    let tam = 0;
    const add = (p) => { const u = typeof p === "string" ? enc.encode(p) : p; partes.push(u); tam += u.length; };
    const obj = (n, corpo) => { offs[n] = tam; add(`${n} 0 obj\n`); corpo(); add("\nendobj\n"); };
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, () => add("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
    obj(3, () => add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${Hh}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`));
    const cont = `q ${W} 0 0 ${Hh} 0 0 cm /Im0 Do Q`;
    obj(4, () => add(`<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`));
    obj(5, () => { add(`<< /Type /XObject /Subtype /Image /Width ${wpx} /Height ${hpx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); add(img); add("\nendstream"); });
    const xref = tam;
    add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offs[n]).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(partes, { type: "application/pdf" });
  }
  async function baixa(blob, nome) {
    // no app: o cartaz vai para o seletor do sistema (salvar em arquivos ou enviar), em vez do download do navegador
    try { if (await window.APP_NATIVO?.baixa(blob, nome)) return; } catch { /* segue com o download comum */ }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

  /* ---------- link para os amigos ---------- */
  const LETRA = { fica: "f", emprestar: "e", liberar: "l", manter: "k", comprar: "c", devolver: "d", segue: "s", reintegrar: "r", vender: "v" };
  const DE_LETRA = Object.fromEntries(Object.entries(LETRA).map(([k, v]) => [v, k]));
  function codifica(D, e, k) {
    const todos = [...D.elenco, ...D.emprestados.map((x) => ({ ...x, fora: true }))];
    const dec = todos.map((j) => LETRA[decisao(e, j)]).join("");
    const ch = e.chegadas.map((id) => (/^tm-\d+$/.test(id) ? "_" + (+id.slice(3)).toString(36) : (+id).toString(36))).join("-");
    const esc2 = escalacaoValida(e, k, D.clube), ordem = k.elencoFinal.map((j) => j.id);
    const tit = FORMACOES[e.form].map((_, i) => { const n = ordem.indexOf(esc2[i]); return n < 0 ? "zz" : n.toString(36).padStart(2, "0"); }).join("");
    return `v${e.modo === "manager" ? "m" : "r"}${Object.keys(FORMACOES).indexOf(e.form)}${dec}-${tit}${ch ? `-${ch}` : ""}`;
  }
  function decodifica(D, cod) {
    const m = /^v([mr])(\d)([a-z]*)-([0-9a-z]*)(?:-(.*))?$/.exec(cod || "");
    if (!m) return null;
    const e = novo(); e.modo = m[1] === "m" ? "manager" : "real"; e.form = Object.keys(FORMACOES)[+m[2]] || "4-2-3-1";
    const todos = [...D.elenco, ...D.emprestados.map((x) => ({ ...x, fora: true }))];
    [...m[3]].forEach((l, i) => { if (todos[i] && DE_LETRA[l]) e.dec[todos[i].id] = DE_LETRA[l]; });
    e.chegadas = (m[5] || "").split("-").filter(Boolean).map((x) => (x[0] === "_" ? `tm-${parseInt(x.slice(1), 36)}` : String(parseInt(x, 36))));
    e._tit = m[4];
    return e;
  }
  function aplicaTitulares(e, k) {
    if (!e._tit) return;
    const ordem = k.elencoFinal.map((j) => j.id);
    e.esc = {};
    for (let i = 0; i < e._tit.length / 2; i++) { const n = parseInt(e._tit.slice(i * 2, i * 2 + 2), 36); if (ordem[n]) e.esc[i] = ordem[n]; }
    delete e._tit;
  }

  /* ---------- mini aba do jogador nos reforços: valores, contrato, transferência, estatísticas e mapa de calor ---------- */
  const PE_NOME = { D: "direito", E: "esquerdo", A: "os dois" };
  const espelha = (b) => b.map(([x, y, sx, sy, w]) => [x, 100 - y, sx, sy, w]);
  // mapa estimado pela posição (ligas sem lances públicos): o modelo da posição no js/heatmap.js, espelhado para a direita
  function mapaDaPosicao(sub) {
    const T = window.HEATMAP?.T || {};
    const m = { LD: () => espelha(T.LE || []), PD: () => espelha(T.PE || []), MD: () => espelha(T.ME || []), SA: () => [...(T.MEI || []), ...(T.CA || [])] }[sub];
    return m ? m() : T[sub] || T.MC || [];
  }
  const CAMPO_SVG = `<svg class="jt-mini-linhas" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".5"><rect x=".5" y=".5" width="104" height="67"/><path d="M52.5 .5v67"/><circle cx="52.5" cy="34" r="9.15"/><rect x=".5" y="13.85" width="16.5" height="40.3"/><rect x="88" y="13.85" width="16.5" height="40.3"/><rect x=".5" y="24.85" width="5.5" height="18.3"/><rect x="99" y="24.85" width="5.5" height="18.3"/></g></svg>`;
  const linhaDado = (rotulo, valor, nota = "") => `<div class="jt-mini-d"><span>${rotulo}</span><b>${valor}</b>${nota ? `<small>${nota}</small>` : ""}</div>`;
  // bloco "Perfil tático" da ficha: as etiquetas e por que cada uma (lances reais ou escalações)
  function perfilTatico(j, pf, f) {
    const t = tatica(j.tat);
    const tags = etiquetas(j.tat, true);
    const linhas = [];
    if (t.tipo) linhas.push(linhaDado("Função", `${t.tipo}º volante`, t.estimado ? "sem lances nem escalações para conferir: pela posição de volante no Transfermarkt" : t.tipo === "1" ? "cabeça de área: mais ações defensivas, menos presença no ataque e nos gols" : "sai para o jogo: escalado também como meio-campista e/ou com mais gols e assistências que um volante comum"));
    if (pf?.def != null) linhas.push(linhaDado("Marcação", `${pf.def}/100`, "desarmes, interceptações e cortes por 90 min, comparados com quem joga na mesma posição no Brasileirão"));
    if (pf?.rec != null) linhas.push(linhaDado("Recomposição", `${pf.rec}/100`, `quanto das ações dele é no terço defensivo (${pf.z?.[0]?.[0] ?? "?"}%), comparado com a mesma posição`));
    if (f) {
      const pos = f[1].map(([p, n]) => `${n} de ${(SUB_NOME[p] || p).toLowerCase()}`).join(", ");
      linhas.push(linhaDado("Escalações", `${f[0]} como titular`, `desde julho de 2024: ${pos}${f[2] >= 450 ? ` · ${f[3]} gols e ${f[4]} assistências em ${mil(f[2])} min` : ""}`));
    }
    if (!tags && !linhas.length) return "";
    return `<section class="jt-mini-tat"><h4>Perfil tático</h4>${tags ? `<div class="jt-perfil">${tags}</div>` : ""}${linhas.join("")}
      <p class="jt-mini-obs">${t.fonte ? `Etiquetas ${esc(FONTE_TAT[t.fonte])}.` : ""}${t.fonte === "F" ? " Um ponta escalado como meia pelo lado ou lateral em 20% dos jogos ou mais recompõe bem; em menos que isso, às vezes; nunca, pouco; um lateral escalado de zagueiro ou volante marca bem." : ""}</p></section>`;
  }
  async function montaMini(box, cid, D, G) {
    const id = box.dataset.jtMini;
    if (box.dataset.pronto === id) return;
    box.dataset.pronto = id;
    const j = jogadorGlobal(G, id, D);
    if (!j) return;
    const [det, fichas] = await Promise.all([carregaDetalhes(), carregaFichas()]);
    if (!box.isConnected) return;
    const x = det?.jogadores?.[id] || {}, pf = det?.perfis?.[id], esc2 = fichas?.jogadores?.[String(j.tm || "")];
    const t = x.t; // [data, de, para, valor pago]
    const pago = t ? (t[3] == null ? "valor não divulgado" : t[3] === 0 ? "sem custo (livre ou empréstimo)" : eur(t[3])) : "";
    const clubeTm = x.c && !norm(x.c).includes(norm(j.timeNome).split(" ")[0]) ? `No Transfermarkt o último clube registrado é o ${esc(x.c)} (antes da janela de julho de 2026).` : "";
    box.innerHTML = `<div class="jt-mini-topo">${avatar(j, byId[cid], 64)}<div><b>${esc(j.nome)}</b><small>${esc(SUB_NOME[j.sub] || POS_CURTO[j.pos] || "")} · ${j.idade ?? "—"} anos${x.pe ? ` · pé ${PE_NOME[x.pe]}` : ""}${x.al ? ` · ${(x.al / 100).toFixed(2).replace(".", ",")} m` : ""}</small><small>${j.timeLogo ? crestOutro(j.timeNome, j.timeLogo, 14) : ""} ${esc(j.timeNome)}</small></div></div>
      <div class="jt-mini-g">
        <section><h4>Valor e contrato</h4>
          ${linhaDado("Valor de mercado", eur(j.valor), j.real ? `Transfermarkt${x.vd ? `, avaliação de ${data(x.vd)}` : ""}` : "estimativa do CazéStats.TV (sem o jogador no Transfermarkt)")}
          ${x.vm ? linhaDado("Maior valor da carreira", eur(x.vm), "Transfermarkt") : ""}
          ${x.ct ? linhaDado("Contrato até", data(x.ct)) : ""}
          ${t ? linhaDado("Última transferência", pago, `${esc(/^without club$/i.test(t[1]) ? "Sem clube" : t[1])} → ${esc(t[2])}, ${data(t[0])}`) : ""}
          ${linhaDado("Salário", salFaixa(j.salario).replace(/<[^>]+>/g, "").replace(/ · estimativa$/, ""), "estimativa: nenhuma fonte pública tem o salário de cada jogador")}
          ${clubeTm ? `<p class="jt-mini-obs">${clubeTm}</p>` : ""}
        </section>
        ${perfilTatico(j, pf, esc2)}
        <section><h4>Temporada</h4><div data-jt-mini-st><div class="empty" style="padding:10px">Carregando as estatísticas…</div></div></section>
        <section><h4>Mapa de calor</h4><div class="jt-mini-campo">${CAMPO_SVG}<canvas data-jt-mini-cv></canvas></div><small class="jt-mini-obs" data-jt-mini-mapa></small></section>
      </div>`;
    const st = box.querySelector("[data-jt-mini-st]"), cv = box.querySelector("[data-jt-mini-cv]"), legenda = box.querySelector("[data-jt-mini-mapa]");
    // Série A: lances e números reais de cada jogo (dados/jogadores/<clube>.json)
    let blobs = null;
    if (j.cidSerieA && window.HEATMAP) {
      await HEATMAP.carregaClube(j.cidSerieA);
      if (!box.isConnected) return;
      const J = window.JOGADORES_CLUBE?.[j.cidSerieA]?.jogadores?.[id];
      if (J) {
        const s = (k2) => Object.values(J.comps || {}).reduce((a, c) => a + (c[k2] || 0), 0), min = s("min"), p90 = (v) => (min ? ((v * 90) / min).toFixed(2).replace(".", ",") : "0");
        st.innerHTML = linhaDado("Jogos", `${s("j")}`, `${s("tit")} como titular · ${mil(min)} min`) + linhaDado("Gols e assistências", `${s("g")} · ${s("a")}`, `${s("ch")} finalizações`)
          + linhaDado("Desarmes por 90 min", p90(s("desarmes"))) + linhaDado("Interceptações por 90 min", p90(s("intercept"))) + linhaDado("Cortes por 90 min", p90(s("cortes")))
          + (pf?.z ? linhaDado("Onde age", `${pf.z[0][0]}% na defesa · ${pf.z[0][1]}% no meio · ${pf.z[0][2]}% no ataque`, `${pf.z[1][0]}% pela esquerda · ${pf.z[1][1]}% pelo centro · ${pf.z[1][2]}% pela direita`) : "")
          + `<p class="jt-mini-obs">Todas as competições da temporada, pelas súmulas e lances da ESPN.</p>`;
        const pr = HEATMAP.profile(id, j.funcao);
        if (pr?.blobs?.length) { blobs = pr.blobs; legenda.textContent = pr.estimado === "lances" ? `Lances reais: ${mil(J.lances || 0)} ações com posição no campo` : "Estimado pelas escalações"; }
      }
    }
    // outras ligas: os números da temporada pela ESPN (sem desarmes: a ESPN não publica de jogadores de fora)
    if (!st.querySelector(".jt-mini-d")) {
      try {
        if (!/^\d+$/.test(id) || /^tm:/.test(j.lg)) throw new Error("sem ESPN");
        const r = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/${encodeURIComponent(j.lg)}/athletes/${encodeURIComponent(id)}/overview`);
        const d2 = r.ok ? await window.SEG.json(r) : null, S = d2?.statistics;
        const ix = (n) => (S?.names || []).indexOf(n);
        const linhas2 = (S?.splits || []).filter((x2) => /20\d\d/.test(x2.displayName || "")).slice(0, 4).map((x2) => {
          const v = (n) => (ix(n) >= 0 ? x2.stats[ix(n)] : "–");
          return `<tr><th>${esc(x2.displayName)}</th><td>${v("starts")}</td><td>${v("totalGoals")}</td><td>${v("goalAssists")}</td><td>${v("totalShots")}</td><td>${v("foulsCommitted")}</td></tr>`;
        }).join("");
        if (!box.isConnected) return;
        st.innerHTML = linhas2 ? `<table class="jt-mini-t"><thead><tr><th>Competição</th><th title="Jogos como titular">Tit.</th><th>Gols</th><th title="Assistências">Ass.</th><th title="Finalizações">Fin.</th><th title="Faltas cometidas">Faltas</th></tr></thead><tbody>${linhas2}</tbody></table><p class="jt-mini-obs">Temporada atual pela ESPN. Desarmes e interceptações de ligas de fora não são publicados pela ESPN.</p>` : `<div class="empty" style="padding:10px">A ESPN não tem estatísticas desta temporada para ele.</div>`;
      } catch { if (box.isConnected) st.innerHTML = `<div class="empty" style="padding:10px">${/^\d+$/.test(id) ? "Não deu para ler as estatísticas agora." : "Jogador do elenco do Transfermarkt que a ESPN não cadastra: sem estatísticas da temporada aqui."}</div>`; }
    }
    if (!blobs) { blobs = mapaDaPosicao(j.sub || CP.PADRAO[j.pos]); legenda.textContent = `Estimado pela posição (${SUB_NOME[j.sub] || POS_CURTO[j.pos] || "?"}): não há lances públicos com posição no campo desta liga.`; }
    requestAnimationFrame(() => { if (cv.isConnected && window.HEATMAP) HEATMAP.paint(cv, blobs); });
  }

  /* rolagem da etapa: volta ao mesmo ponto depois de recarregar e vai sendo guardada enquanto a pessoa rola */
  let soltaRolagem = null;
  function guardaRolagem(cid, etapa, el, volta) {
    soltaRolagem?.();
    if (volta > 0) {
      // espera a lista ter altura (o mercado global e as fotos entram depois): tenta por até 6 s
      let n = 0;
      // depois de chegar, segura o ponto por 2 s: o resto do mercado (partes do Transfermarkt, fotos) ainda pode redesenhar a
      // lista e o navegador empurraria a página; qualquer gesto da pessoa (roda, toque, tecla) solta na hora
      let solto = false;
      const solta = () => { solto = true; };
      for (const ev of ["wheel", "touchstart", "keydown", "mousedown"]) addEventListener(ev, solta, { once: true, passive: true });
      const segura = (k) => { if (solto || !el.isConnected || k > 20) return; if (Math.abs(scrollY - volta) > 2) scrollTo({ top: volta, behavior: "instant" }); setTimeout(() => segura(k + 1), 100); };
      const tenta = () => { if (!el.isConnected) return; if (document.documentElement.scrollHeight - innerHeight >= volta || ++n > 60) { scrollTo({ top: volta, behavior: "instant" }); segura(0); } else setTimeout(tenta, 100); };
      requestAnimationFrame(tenta);
    }
    let t = 0;
    const grava = () => { if (el.isConnected) sessaoGrava(cid, { rolagem: { ...(sessaoLe(cid)?.rolagem || {}), [etapa]: Math.round(scrollY) } }); };
    const anota = () => { if (!el.isConnected) return soltaRolagem?.(); clearTimeout(t); t = setTimeout(grava, 250); };
    const saindo = () => { clearTimeout(t); grava(); }; // recarregar não espera o temporizador
    addEventListener("scroll", anota, { passive: true });
    addEventListener("pagehide", saindo);
    soltaRolagem = () => { removeEventListener("scroll", anota); removeEventListener("pagehide", saindo); clearTimeout(t); soltaRolagem = null; };
  }

  /* ---------- página ---------- */
  function page(cid, etapa) {
    const ver = /^v[mr]/.test(etapa || "");
    const entrada = !ver && !etapa; // entrou pela aba Janela: pergunta o modo, sempre
    if (!ver && !ETAPAS.some(([k]) => k === etapa)) etapa = "elenco";
    return `<div class="jt" data-jt="${cid}" data-jt-etapa="${esc(etapa)}"${entrada ? " data-jt-entrada" : ""}><div class="jt-bloco"><div class="empty" style="padding:40px">Abrindo a janela de transferências…</div></div></div>`;
  }
  async function mount(root) {
    const el = root.querySelector("[data-jt]");
    if (!el) return;
    const cid = el.dataset.jt;
    const etapa = el.dataset.jtEtapa;
    const ver = /^v[mr]/.test(etapa);
    const [D] = await Promise.all([carrega(cid), carregaPosicoes()]);
    if (!el.isConnected) return;
    if (!D) { el.innerHTML = `<div class="jt-bloco"><div class="empty" style="padding:40px">Os dados de mercado deste clube ainda não foram gerados.</div></div>`; return; }
    let e = ver ? decodifica(D, etapa) || estado(cid) : estado(cid);
    // recarregou a página na janela: volta para onde estava (modo já escolhido, etapa e rolagem), se foi há menos de 12 h
    const sess = ver ? null : sessaoLe(cid), restaura = primeiraMontagem && !!sess;
    primeiraMontagem = false;
    const entrada = el.hasAttribute("data-jt-entrada");
    if (restaura && entrada && sess.modoOk && e.modo && sess.etapa && sess.etapa !== etapa && ETAPAS.some(([x]) => x === sess.etapa)) {
      location.replace(`#/clube/${cid}/mercado/${sess.etapa}`); // o roteador desenha a etapa guardada
      return;
    }
    let G = null, confirmaReset = 0, perguntar = entrada && !(restaura && sess.modoOk && e.modo);
    // o endereço passa a dizer a etapa (sem criar um passo a mais no voltar): um recarregar cai nela, não na escolha de modo
    const fixaEtapa = () => { const h = `#/clube/${cid}/mercado/${etapa}`; if (!ver && location.hash !== h) history.replaceState(history.state, "", h); };
    if (!ver && !perguntar) { sessaoGrava(cid, { etapa, modoOk: !!e.modo }); if (e.modo) fixaEtapa(); }
    const precisaGlobal = () => e.chegadas.length || etapa === "reforcos";
    const pinta = () => {
      const k = contas(cid, D, e, G);
      if (ver && e._tit) aplicaTitulares(e, k);
      if ((!e.modo || perguntar) && !ver) { el.innerHTML = painel(cid, D, { ...e, modo: e.modo || "real" }, k, G) + escolhaModo(cid, e); animaNumeros(el); return; }
      const corpo = ver || etapa === "compartilhar" ? etapaCompartilhar(cid, D, e, k, ver) : etapa === "reforcos" ? etapaReforcos(cid, D, e, k, G) : etapa === "escalacao" ? etapaEscalacao(cid, D, e, k) : etapaElenco(cid, D, e);
      const foco = document.activeElement?.dataset?.jtF;
      const mexeu = Object.keys(e.dec).length || e.chegadas.length || Object.keys(e.pos).length || e.caixa != null;
      el.innerHTML = painel(cid, D, e, k, G)
        + (ver ? "" : `<div class="jt-barra">${passos(cid, etapa)}<div class="jt-barra-acoes">${mexeu ? `<button type="button" class="jt-reset ${confirmaReset ? "conf" : ""}" data-jt-reset>${confirmaReset ? "Confirmar: desfazer tudo" : "Desfazer tudo"}</button>` : ""}<button type="button" class="jt-trocar" data-jt-trocar>Trocar modo</button></div></div>`)
        + corpo;
      if (foco) { const i = el.querySelector(`[data-jt-f="${foco}"]`); if (i) { i.focus(); if (i.setSelectionRange && i.type === "search") i.setSelectionRange(i.value.length, i.value.length); } }
      animaNumeros(el);
      const campo = el.querySelector("[data-jt-campo]");
      if (campo) { montaCampo(campo); ro.observe(campo); }
      const cv = el.querySelector("[data-jt-cartaz]");
      if (cv) desenhaCartaz(cv, cid, D, e, k);
      const mini = el.querySelector("[data-jt-mini]");
      if (mini && G) montaMini(mini, cid, D, G);
    };
    const ro = new ResizeObserver((ents) => { for (const en of ents) if (en.target.isConnected) montaCampo(en.target); });
    const salva = () => { if (!ver) grava(cid, e); };
    // o mercado global (26 mil jogadores em três arquivos) carrega em paralelo: a tela e os cliques (escolha de modo,
    // decisões) funcionam desde o primeiro desenho; quando ele chega, a etapa que precisa dele é redesenhada. Antes os
    // cliques só eram ligados depois do carregamento, e quem clicava em "Modo manager" nesses segundos ficava sem resposta.
    carregaGlobal().then((g) => { G = indexa(g); if (el.isConnected && precisaGlobal()) pinta(); }).catch(() => {});
    if (!el.isConnected) return;
    pinta();
    if (!ver) guardaRolagem(cid, etapa, el, restaura ? sess.rolagem?.[etapa] : null);

    // depois de uma mudança, só a peça mexida ganha um destaque curto
    const destaca = (sel) => { const n = el.querySelector(sel); if (n && !reduz()) { n.classList.remove("pulsa"); void n.offsetWidth; n.classList.add("pulsa"); } };

    el.addEventListener("click", async (ev) => {
      const t = ev.target.closest("button, a");
      if (!t || !el.contains(t)) return;
      if (t.closest(".jt-ficha") && arraste.moveu) return; // fim de um arraste, não é toque
      const d = t.dataset, k = () => contas(cid, D, e, G);
      if (d.jtModo) { if (d.jtModo !== e.modo && e.modo) e.caixa = null; e.modo = d.jtModo; perguntar = false; salva(); sessaoGrava(cid, { etapa, modoOk: true }); fixaEtapa(); return pinta(); }
      if ("jtTrocar" in d) { perguntar = true; return pinta(); }
      if ("jtReset" in d) {
        if (!confirmaReset) { confirmaReset = setTimeout(() => { confirmaReset = 0; if (el.isConnected) pinta(); }, 4000); return pinta(); }
        clearTimeout(confirmaReset); confirmaReset = 0;
        e = { ...novo(), modo: e.modo }; estadoSlot[cid] = null; salva(); pinta();
        const m = el.querySelector(".jt-mesa"); if (m && !reduz()) m.classList.add("zerou");
        return;
      }
      if ("jtCaixa" in d) { editandoCaixa = true; pinta(); el.querySelector("[data-jt-caixa-v]")?.select(); return; }
      if (d.jtDec) { const id = t.closest("[data-jt-j]").dataset.jtJ; e.dec[id] = d.jtDec; salva(); pinta(); return destaca(`[data-jt-j="${CSS.escape(id)}"]`); }
      if (d.jtAuto) {
        if (d.jtAuto === "limpa") e.dec = {};
        if (d.jtAuto === "veteranos") D.elenco.forEach((j) => { if ((j.idade || 0) >= 34) e.dec[j.id] = tipoDe(j) === "dentro" ? "devolver" : "liberar"; });
        if (d.jtAuto === "base") D.elenco.forEach((j) => { if ((j.idade || 99) <= 21 && !j.min && tipoDe(j) === "elenco") e.dec[j.id] = "emprestar"; });
        salva(); return pinta();
      }
      if (d.jtFicha) { fichaAberta[cid] = fichaAberta[cid] === d.jtFicha ? null : d.jtFicha; pinta(); el.querySelector(`[data-jt-mini]`)?.closest("tr")?.scrollIntoView({ block: "nearest", behavior: reduz() ? "auto" : "smooth" }); return; }
      if (d.jtPos != null) { fil(cid).pos = d.jtPos; fil(cid).n = 25; sessaoGrava(cid, { filtros: fil(cid) }); return pinta(); }
      if ("jtLimpaF" in d) { filtros[cid] = { ...FILTRO_PADRAO, q: fil(cid).q, semLes: false }; sessaoGrava(cid, { filtros: filtros[cid] }); return pinta(); }
      if ("jtMais" in d) { fil(cid).n += 25; sessaoGrava(cid, { filtros: fil(cid) }); return pinta(); }
      if (d.jtAdd) {
        const novoReforco = !e.chegadas.includes(d.jtAdd);
        e.chegadas = novoReforco ? [...e.chegadas, d.jtAdd] : e.chegadas.filter((x) => x !== d.jtAdd);
        salva(); pinta();
        if (novoReforco) carimbo(cid, jogadorGlobal(G, d.jtAdd, D));
        return;
      }
      if (d.jtDel) { e.chegadas = e.chegadas.filter((x) => x !== d.jtDel); salva(); return pinta(); }
      if (d.jtForm) { e.form = d.jtForm; e.pos = {}; e.esc = autoEscala(k(), e.form); e.escManual = true; estadoSlot[cid] = null; salva(); return pinta(); }
      if ("jtAutoEsc" in d) { e.esc = autoEscala(k(), e.form); e.pos = {}; e.escManual = true; estadoSlot[cid] = null; salva(); return pinta(); }
      if ("jtUltima" in d) { e.escManual = false; e._ultimaAplicada = false; estadoSlot[cid] = null; salva(); return pinta(); }
      if ("jtAlinha" in d) { e.pos = {}; salva(); return pinta(); }
      if (d.jtSlot != null) { estadoSlot[cid] = estadoSlot[cid] === +d.jtSlot ? null : +d.jtSlot; return pinta(); }
      if (d.jtPoe) {
        const s = estadoSlot[cid];
        if (s == null) { const msg = el.querySelector(".jt-campo"); msg?.classList.add("pisca"); setTimeout(() => msg?.classList.remove("pisca"), 700); return; }
        e.esc = { ...escalacaoValida(e, k(), cid), [s]: d.jtPoe }; e.escManual = true; salva(); pinta();
        return destaca(`[data-jt-slot="${s}"]`);
      }
      const msg = el.querySelector("[data-jt-msg]"), cv = el.querySelector("[data-jt-cartaz]");
      if ("jtPng" in d && cv) { cv.toBlob((b) => b && baixa(b, `elenco-${cid}-2027.png`), "image/png"); if (msg) msg.textContent = "Cartaz em PNG baixado."; return; }
      if ("jtPdf" in d && cv) { baixa(pdfDeJpeg(cv.toDataURL("image/jpeg", 0.92), cv.width, cv.height), `elenco-${cid}-2027.pdf`); if (msg) msg.textContent = "Cartaz em PDF baixado."; return; }
      if ("jtLink" in d) {
        // no app o endereço da página é https://localhost: o link para os amigos aponta sempre para o site publicado
        const url = `${window.SITE_URL || location.origin + location.pathname}#/clube/${cid}/mercado/${codifica(D, e, contas(cid, D, e, G))}`;
        const texto = `Montei o ${byId[cid].name} de 2027 na janela de transferências do CazéStats.TV. Monte o seu!`;
        try {
          const b0 = window.APP_NATIVO && cv ? await new Promise((r) => cv.toBlob(r, "image/png")) : null;
          if (await window.APP_NATIVO?.compartilha({ title: "Meu elenco", text: texto, url, blob: b0, nome: `elenco-${cid}.png` })) return;
          if (navigator.share) {
            const b = cv ? await new Promise((r) => cv.toBlob(r, "image/png")) : null, file = b ? new File([b], `elenco-${cid}.png`, { type: "image/png" }) : null;
            await navigator.share(file && navigator.canShare?.({ files: [file] }) ? { title: "Meu elenco", text: texto, url, files: [file] } : { title: "Meu elenco", text: texto, url });
          } else { await navigator.clipboard.writeText(`${texto} ${url}`); if (msg) msg.textContent = "Link copiado: é só colar para os amigos."; }
        } catch { if (msg) msg.textContent = url; }
        return;
      }
      if ("jtUsar" in d) { const k2 = contas(cid, D, e, G); const novoE = { ...e, esc: escalacaoValida(e, k2, cid), escManual: true }; delete novoE._tit; grava(cid, novoE); location.hash = `#/clube/${cid}/mercado/elenco`; }
    });

    /* arrastar no campo 3D: titular para qualquer ponto (posição livre) ou em cima de outro titular (troca);
       reserva em cima de um titular (entra no lugar dele) */
    const arraste = { on: null, moveu: false };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0 || ver) return;
      const ficha = ev.target.closest(".jt-ficha"), res = ev.target.closest(".jt-res");
      if (!ficha && !res) return;
      const k = contas(cid, D, e, G), esc2 = escalacaoValida(e, k, cid);
      const id = ficha ? esc2[+ficha.dataset.jtSlot] : res.dataset.jtPoe;
      if (!id) return;
      arraste.on = { ficha, res, id, x: ev.clientX, y: ev.clientY, pid: ev.pointerId, ativo: false, toque: ev.pointerType === "touch", t: Date.now() };
      arraste.moveu = false;
      // no mouse, a foto do reserva é uma <img>: sem isto o navegador começa a arrastar a imagem e cancela o arraste
      // (pointercancel), e o reserva não entra no campo; no toque o padrão continua (a página precisa rolar)
      if (ficha || ev.pointerType !== "touch") ev.preventDefault();
    });
    el.addEventListener("dragstart", (ev) => { if (ev.target.closest(".jt-ficha, .jt-res")) ev.preventDefault(); });
    el.addEventListener("pointermove", (ev) => {
      const a = arraste.on;
      if (!a || ev.pointerId !== a.pid) return;
      const dist = Math.hypot(ev.clientX - a.x, ev.clientY - a.y);
      if (!a.ativo) {
        if (a.res && a.toque && Date.now() - a.t < 180) { if (dist > 10) arraste.on = null; return; }
        if (dist < 6) return;
        a.ativo = true; arraste.moveu = true;
        const j = contas(cid, D, e, G).elencoFinal.find((x) => x.id === a.id);
        a.fantasma = document.createElement("div");
        a.fantasma.className = "jt-fantasma";
        a.fantasma.innerHTML = `${avatar(j, byId[cid], 46)}<b>${esc(sobrenome(j.nome))}</b><span class="jt-fz"></span>`;
        document.body.appendChild(a.fantasma);
        (a.ficha || a.res).classList.add("arrastando");
        document.body.classList.add("no-select");
        a.j = j;
      }
      ev.preventDefault();
      a.fantasma.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
      // mostra, enquanto arrasta, a posição que ele vai ocupar
      const campo = el.querySelector("[data-jt-campo]"), pt = pontoNoCampo(campo, ev.clientX, ev.clientY);
      const alvo = alvoFicha(ev.clientX, ev.clientY, a.ficha);
      $$(".jt-ficha.alvo", el).forEach((f) => f !== alvo && f.classList.remove("alvo"));
      if (alvo) alvo.classList.add("alvo");
      const fz = a.fantasma.querySelector(".jt-fz");
      if (pt && a.ficha && !alvo) { const av = CP.avalia(a.j, CP.zona(pt.x, pt.y)); fz.innerHTML = av.tipo === "igual" ? `<span class="cp-selo s-igual"><b>${av.para}</b></span>` : CP.selo(av); }
      else fz.innerHTML = "";
    }, { passive: false });
    const solta = (ev) => {
      const a = arraste.on;
      if (!a || (ev && ev.pointerId !== a.pid)) return;
      arraste.on = null;
      if (!a.ativo) return;
      a.fantasma?.remove(); (a.ficha || a.res)?.classList.remove("arrastando"); document.body.classList.remove("no-select");
      $$(".jt-ficha.alvo", el).forEach((f) => f.classList.remove("alvo"));
      setTimeout(() => { arraste.moveu = false; }, 0);
      if (!ev || ev.type === "pointercancel") return;
      const k = contas(cid, D, e, G), esc2 = escalacaoValida(e, k, cid), campo = el.querySelector("[data-jt-campo]");
      const alvo = alvoFicha(ev.clientX, ev.clientY, a.ficha);
      let slotMexido = null;
      if (alvo) {
        const s2 = +alvo.dataset.jtSlot;
        if (a.ficha) { const s1 = +a.ficha.dataset.jtSlot; [esc2[s1], esc2[s2]] = [esc2[s2], esc2[s1]]; }
        else esc2[s2] = a.id;
        slotMexido = s2;
      } else if (a.ficha) {
        const pt = pontoNoCampo(campo, ev.clientX, ev.clientY);
        if (!pt) return;
        slotMexido = +a.ficha.dataset.jtSlot;
        e.pos = { ...e.pos, [slotMexido]: [pt.x, pt.y] };
      } else {
        // reserva solto na grama: entra no lugar do titular mais perto, se estiver perto
        const pt = pontoNoCampo(campo, ev.clientX, ev.clientY);
        if (!pt) return;
        let melhor = null, dm = 14;
        FORMACOES[e.form].forEach((_, i) => { const [x, y] = ptSlot(e, i), dd = Math.hypot(x - pt.x, (y - pt.y) * 0.7); if (dd < dm) { dm = dd; melhor = i; } });
        if (melhor == null) return;
        esc2[melhor] = a.id; slotMexido = melhor;
      }
      e.esc = esc2; e.escManual = true; estadoSlot[cid] = slotMexido; salva(); pinta();
      destaca(`[data-jt-slot="${slotMexido}"]`);
    };
    el.addEventListener("pointerup", solta);
    el.addEventListener("pointercancel", solta);
    function alvoFicha(x, y, propria) {
      const f = document.elementsFromPoint(x, y).map((n) => n.closest?.(".jt-ficha")).find((n) => n && n !== propria && el.contains(n));
      return f || null;
    }
    function pontoNoCampo(campo, x, y) {
      if (!campo || !campo._g) return null;
      const r = campo.getBoundingClientRect(), { u, v } = campo._g.plano(x - r.left - (campo._esq || 0), y - r.top - campo._off);
      if (u < -0.03 || u > 1.03 || v < -0.03 || v > 1.03) return null;
      const lim = (n) => Math.round(Math.max(3, Math.min(97, n * 100)) * 10) / 10;
      return { x: lim(u), y: lim(v) };
    }

    let espera = null;
    const filtra = (ev) => {
      const i = ev.target.closest("[data-jt-f]");
      if (!i) return;
      const f = fil(cid), nome = i.dataset.jtF;
      f[nome] = i.type === "checkbox" ? i.checked : i.type === "number" || nome === "vMax" ? +i.value : i.value;
      f.n = 25;
      clearTimeout(espera); espera = setTimeout(() => { if (!ver) sessaoGrava(cid, { filtros: f }); pinta(); }, nome === "q" ? 180 : 0);
    };
    el.addEventListener("input", filtra);
    el.addEventListener("change", filtra);
    el.addEventListener("submit", (ev) => {
      if (!ev.target.matches("[data-jt-caixa-f]")) return;
      ev.preventDefault();
      const n = parseFloat(String(ev.target.querySelector("[data-jt-caixa-v]").value).replace(",", "."));
      if (Number.isFinite(n) && n >= 0 && n <= 5000) { e.caixa = Math.round(n * 1e6); salva(); }
      editandoCaixa = false; pinta();
    });
    // foto que não carrega: fica o número da camisa
    el.addEventListener("error", (ev) => { const im = ev.target; if (im.tagName === "IMG" && im.parentNode?.classList.contains("foto")) { im.parentNode.classList.remove("foto"); im.remove(); } }, true);
  }

  window.MERCADO_UI = { page, mount, carrega, codifica, decodifica, pdfDeJpeg, valor: eur, FORMACOES, fotosLigadas };
})();
