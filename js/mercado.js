/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   Placar.TV — Janela de transferências (#/clube/<id>/mercado[/etapa])
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
   Fotos dos jogadores: só no modo privado do dono (sem licença comercial); abra o site com ?privado=fotos para ligar
   e ?privado=0 para desligar. Antes de apresentar o produto, desligue.
   ========================================================================== */
(() => {
  const { byId } = window.PD;
  const { crest, crestOutro, onColor } = window.GFX;
  const CP = window.CAMPO;
  const esc = (t) => window.SEG.esc(t);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduz = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- fotos privadas (só para o dono ver) ---------- */
  const FOTO_KEY = "placar:fotos-privadas";
  try {
    const q = new URLSearchParams(location.search).get("privado");
    if (q === "fotos") localStorage.setItem(FOTO_KEY, "1");
    if (q === "0") localStorage.removeItem(FOTO_KEY);
  } catch { /* sem armazenamento */ }
  const fotosLigadas = () => { try { return localStorage.getItem(FOTO_KEY) === "1"; } catch { return false; } };

  /* ---------- dados ---------- */
  const prom = {};
  function carregaScript(src, pronto) {
    if (pronto()) return Promise.resolve();
    return new Promise((res) => { const s = document.createElement("script"); s.src = src; s.onload = s.onerror = res; document.head.appendChild(s); });
  }
  function carrega(cid) {
    if (window.MERCADO?.[cid]) return Promise.resolve(window.MERCADO[cid]);
    return (prom[cid] = prom[cid] || (async () => {
      if (window.PD?.LIVE) {
        try { const r = await fetch(`/api/mercado/${cid}`, { cache: "no-store" }); if (r.ok) { const d = await r.json(); window.SEG.limpa(d); (window.MERCADO = window.MERCADO || {})[cid] = d; return d; } } catch { /* arquivo */ }
      }
      await carregaScript(`js/mercado/${cid}.js`, () => window.MERCADO?.[cid]);
      return window.MERCADO?.[cid] || null;
    })());
  }
  const carregaGlobal = () => (prom.global = prom.global || carregaScript("js/mercado/global.js", () => window.MERCADO_GLOBAL).then(() => window.MERCADO_GLOBAL || null));
  const carregaPosicoes = () => (prom.pos = prom.pos || carregaScript("js/heatmaps.js", () => window.HEATMAPS));

  /* ---------- números ---------- */
  const eur = (v) => (v == null ? "—" : `${v < 0 ? "−" : ""}€ ${Math.abs(v) >= 1e6 ? `${(Math.abs(v) / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1).replace(".", ",")} mi` : `${Math.round(Math.abs(v) / 1e3)} mil`}`);
  const brl = (v) => (Math.abs(v) >= 1e6 ? `R$ ${(v / 1e6).toFixed(1).replace(".", ",")} mi` : `R$ ${Math.round(v / 1e3)} mil`);
  const mil = (v) => Number(v || 0).toLocaleString("pt-BR");
  const data = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
  const pesoLiga = (G, lg) => G?.ligas?.[lg]?.[2] ?? 0.3;
  const POS_CURTO = { G: "GOL", D: "DEF", M: "MEI", A: "ATA" };
  const GRUPOS = [["Goleiros", ["GOL"]], ["Zagueiros", ["ZAG"]], ["Laterais", ["LD", "LE", "ALD", "ALE"]], ["Volantes", ["VOL"]], ["Meias", ["MC", "MEI", "MD", "ME"]], ["Pontas", ["PD", "PE"]], ["Centroavantes", ["CA"]]];
  const BANDEIRA = (p) => (p ? `<img class="jt-flag" src="https://a.espncdn.com/i/teamlogos/countries/500/${esc(p)}.png" alt="" width="16" height="16" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : "");
  const brasileiro = (j) => j.pais === "bra" || /brazil|brasil/i.test(j.nac || "");
  const sobrenome = (n) => { const p = String(n).split(" "); return p.length > 1 && p[p.length - 1].length > 2 ? p[p.length - 1] : n; };

  /* ---------- estado (por clube, neste aparelho) ---------- */
  const chave = (cid) => `placar:janela-${cid}`;
  const ler = (cid) => { try { return JSON.parse(localStorage.getItem(chave(cid)) || "null"); } catch { return null; } };
  const novo = () => ({ modo: null, dec: {}, chegadas: [], form: "4-2-3-1", esc: {}, pos: {}, caixa: null });
  function estado(cid) { const e = { ...novo(), ...(ler(cid) || {}) }; e.dec = e.dec || {}; e.chegadas = e.chegadas || []; e.esc = e.esc || {}; e.pos = e.pos || {}; if (!FORMACOES[e.form]) e.form = "4-2-3-1"; return e; }
  function grava(cid, e) { try { localStorage.setItem(chave(cid), JSON.stringify(e)); } catch { /* sem armazenamento: vale só nesta visita */ } }

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
    const [jid, nome, idade, pos, pais, nac, tid, num, valor, lesao] = r, t = G.times[tid] || ["", null, ""];
    const cambio = D?.financas?.cambio?.valor || G.eurBrl || 6;
    const sal = Math.max(15000, Math.round((valor * (pesoLiga(G, t[2]) <= 0.3 ? 0.15 : pesoLiga(G, t[2]) <= 0.6 ? 0.10 : 0.09) * cambio) / 12 / 1000) * 1000);
    return { id: jid, nome, idade, pos, pais, nac: nac || G.paises?.[pais] || "", time: tid, timeNome: t[0], timeLogo: t[1], lg: t[2], num, valor, lesao: !!lesao, salario: sal, reforco: true, funcao: CP.PADRAO[pos] };
  }
  function indexa(G) { if (G && !G.idx) G.idx = new Map(G.jogadores.map((r) => [r[0], r])); return G; }

  /* ---------- avatar: foto (modo privado) ou o número na camisa do clube ---------- */
  function avatar(j, c, tam = 44) {
    const foto = fotosLigadas() && j.fotoPrivada;
    if (foto) return `<span class="jt-av foto" style="--t:${tam}px"><img src="${esc(window.SEG.url(foto))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><b>${esc(j.num || POS_CURTO[j.pos] || "")}</b></span>`;
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
    const origemCaixa = k.real || e.caixa == null ? (fin.orcamento?.tipo === "noticia" ? `orçamento divulgado (${esc(fin.orcamento.fonte)})` : "estimativa: duas folhas mensais") : "valor definido por você";
    const origemFolha = fin.folha ? (fin.folha.tipo === "estimativa" ? "estimativa do Placar.TV" : `${esc(fin.folha.fonte)}, ${data(fin.folha.data)}`) : "estimativa do Placar.TV";
    return `<section class="jt-mesa" style="--c1:${c.colors[0]};--c2:${c.colors[1]};--c3:${c.colors[2] || c.colors[1]};--tom:${onColor(c.colors[0]) === "#111111" ? c.colors[1] : c.colors[0]}">
      <svg class="jt-globo" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".8"><circle cx="100" cy="100" r="96"/><ellipse cx="100" cy="100" rx="40" ry="96"/><ellipse cx="100" cy="100" rx="72" ry="96"/><path d="M4 100h192M14 52h172M14 148h172"/></g></svg>
      <div class="jt-mesa-topo">
        <span class="jt-escudo">${crest(c, 64)}</span>
        <div class="jt-mesa-tit"><small>Janela de transferências 2027</small><h2>${esc(c.name)}</h2></div>
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
  function escolhaModo(cid) {
    const c = byId[cid];
    return `<div class="jt-escolha"><h2>Como você quer montar o ${esc(c.name)}?</h2><p>Decida quem fica, quem sai e quem chega, escale o time e mande para os amigos montarem o deles.</p>
      <div class="jt-escolha-g">
        <button type="button" class="jt-cartao-modo" data-jt-modo="real"><b>Modo real</b><span>Com o caixa e a folha do clube: folha até 10% acima da atual, elenco entre 22 e o limite, até 9 estrangeiros entre os titulares. Para pensar como diretor de futebol.</span><em>Jogar no modo real</em></button>
        <button type="button" class="jt-cartao-modo mg" data-jt-modo="manager"><b>Modo manager</b><span>Sem limite de contratações e com o caixa que você quiser: qualquer jogador do mundo, do jeito que você sonhar.</span><em>Jogar no modo manager</em></button>
      </div></div>`;
  }

  /* ---------- 1) elenco ---------- */
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
    return `<li class="jt-card d-${d}" data-jt-j="${esc(j.id)}">
      ${avatar(j, c)}
      <div class="jt-card-txt"><b class="jt-nome">${esc(j.nome)}</b><span class="jt-sub">${sub}</span><span class="jt-uso">${uso}</span>${status ? `<span class="jt-sits">${status}</span>` : ""}</div>
      <div class="jt-card-dir"><span class="jt-valor">${eur(j.valor)}<small>${brl(j.salario)}/mês</small></span>
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
        Folha: ${fin?.folha ? `${esc(fin.folha.fonte)}${fin.folha.data ? ` (${data(fin.folha.data)})` : ""}` : "estimativa"}, dividida entre os jogadores pelo tempo de carreira, pelos minutos e pelo valor (o salário de cada um não é público). Câmbio: ${fin?.cambio ? `${esc(fin.cambio.fonte)}, € 1 = R$ ${String(fin.cambio.valor).replace(".", ",")}` : "referência"}. Valor de mercado: estimativa do Placar.TV. Atualizado em ${esc(D.updated)}.</p>`;
  }

  /* ---------- 2) reforços ---------- */
  const filtros = {};
  const fil = (cid) => (filtros[cid] = filtros[cid] || { q: "", pos: "", lg: "", nac: "", idMin: 16, idMax: 40, vMax: 0, ord: "valor", semLes: true, n: 25 });
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function resultados(cid, D, G, e) {
    const f = fil(cid), meus = new Set(D.elenco.map((j) => j.id)), escolhidos = new Set(e.chegadas), q = norm(f.q).trim();
    const meuTime = Object.entries(G.times).find(([, t]) => t[0] && norm(t[0]) === norm(byId[cid].name))?.[0];
    const L = G.jogadores.filter((r) => !meus.has(r[0]) && r[6] !== meuTime && (!f.pos || r[3] === f.pos) && (r[2] == null || (r[2] >= f.idMin && r[2] <= f.idMax))
      && (!f.vMax || r[8] <= f.vMax) && (!f.lg || G.times[r[6]]?.[2] === f.lg) && (!f.semLes || !r[9])
      && (!f.nac || (f.nac === "bra" ? r[4] === "bra" : f.nac === "est" ? r[4] !== "bra" : r[4] === f.nac))
      && (!q || norm(r[1]).split(/\s+/).some((w) => w.startsWith(q)) || (q.length > 2 && norm(r[1]).includes(q))));
    const ord = { valor: (a, b) => b[8] - a[8], idade: (a, b) => (a[2] ?? 99) - (b[2] ?? 99), nome: (a, b) => a[1].localeCompare(b[1], "pt-BR"), barato: (a, b) => a[8] - b[8] }[f.ord];
    L.sort(ord);
    return { L, escolhidos };
  }
  function etapaReforcos(cid, D, e, k, G) {
    if (!G) return `<div class="jt-bloco"><div class="empty" style="padding:40px">Carregando o mercado global…</div></div>`;
    const c = byId[cid], f = fil(cid), { L, escolhidos } = resultados(cid, D, G, e);
    const nomePais = G.paises || {};
    const contPais = {};
    for (const r of G.jogadores) if (r[4]) contPais[r[4]] = (contPais[r[4]] || 0) + 1;
    const topPaises = Object.entries(contPais).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([p]) => p).sort((a, b) => (nomePais[a] || a).localeCompare(nomePais[b] || b, "pt-BR"));
    const sel = (nome, v, ops) => `<select data-jt-f="${nome}">${ops.map(([x, l]) => `<option value="${esc(x)}"${String(x) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const linhas = L.slice(0, f.n).map((r) => {
      const j = jogadorGlobal(G, r[0], D), ja = escolhidos.has(j.id), semDinheiro = k.real && !ja && j.valor > k.caixa;
      return `<tr class="${ja ? "jt-ja" : ""}"><td class="jt-quem">${avatar(j, c, 34)}<div><b>${esc(j.nome)}</b><small>${j.timeLogo ? crestOutro(j.timeNome, j.timeLogo, 14) : ""} ${esc(j.timeNome)} · ${esc(G.ligas[j.lg]?.[0] || "")}</small></div></td>
        <td class="jt-pos"><span class="jt-pos-t p-${j.pos}">${POS_CURTO[j.pos]}</span></td><td class="hide-sm">${j.idade ?? "—"}</td><td class="hide-sm">${BANDEIRA(j.pais)}</td>
        <td class="jt-v">${eur(j.valor)}<small>${brl(j.salario)}/mês</small></td>
        <td class="jt-acao"><button type="button" class="jt-contratar ${ja ? "ja" : ""}" data-jt-add="${esc(j.id)}" ${semDinheiro ? `disabled title="Sem caixa no modo real"` : ""}>${ja ? "Contratado" : semDinheiro ? "Sem caixa" : "Contratar"}</button></td></tr>`;
    }).join("");
    return `<div class="jt-mercado">
      <aside class="jt-bloco jt-filtros"><div class="jt-bloco-h"><h3>Filtros</h3></div>
        <label class="jt-f-busca"><span>Nome</span><input type="search" data-jt-f="q" value="${esc(f.q)}" placeholder="Buscar jogador" autocomplete="off"></label>
        <div class="jt-f-pos" role="group" aria-label="Posição">${[["", "Todas"], ["G", "GOL"], ["D", "DEF"], ["M", "MEI"], ["A", "ATA"]].map(([v, l]) => `<button type="button" class="chip ${f.pos === v ? "on" : ""}" data-jt-pos="${v}">${l}</button>`).join("")}</div>
        <label><span>Liga</span>${sel("lg", f.lg, [["", "Todas as ligas"], ...Object.entries(G.ligas).map(([k2, v]) => [k2, `${v[0]} (${v[1]})`])])}</label>
        <label><span>Nacionalidade</span>${sel("nac", f.nac, [["", "Todas"], ["bra", "Só brasileiros"], ["est", "Só estrangeiros"], ...topPaises.filter((p) => p !== "bra").map((p) => [p, nomePais[p] || p])])}</label>
        <div class="jt-f-2"><label><span>Idade mín.</span><input type="number" min="15" max="45" data-jt-f="idMin" value="${f.idMin}"></label><label><span>Idade máx.</span><input type="number" min="15" max="45" data-jt-f="idMax" value="${f.idMax}"></label></div>
        <label><span>Valor até</span>${sel("vMax", f.vMax, [[0, "Qualquer valor"], [1e6, "€ 1 mi"], [3e6, "€ 3 mi"], [5e6, "€ 5 mi"], [10e6, "€ 10 mi"], [20e6, "€ 20 mi"], [40e6, "€ 40 mi"]])}</label>
        <label><span>Ordenar por</span>${sel("ord", f.ord, [["valor", "Mais valiosos"], ["barato", "Mais baratos"], ["idade", "Mais jovens"], ["nome", "Nome"]])}</label>
        <label class="jt-f-chk"><input type="checkbox" data-jt-f="semLes" ${f.semLes ? "checked" : ""}> Esconder lesionados</label>
      </aside>
      <div>
        <div class="jt-bloco"><div class="jt-bloco-h"><h3>Chegadas</h3><span>${k.chegadas.length} · ${eur(k.chegadas.reduce((s, j) => s + j.valor, 0))}</span></div>
          ${k.chegadas.length ? `<ul class="jt-negocios">${k.chegadas.map((j) => negocio(cid, j, G)).join("")}</ul>` : `<div class="empty" style="padding:18px">Nenhum reforço ainda. Contrate na lista abaixo: cada negócio fechado aparece aqui.</div>`}</div>
        <div class="jt-bloco jt-tab-card"><div class="jt-bloco-h"><h3>Mercado global</h3><span>${L.length.toLocaleString("pt-BR")} jogadores · ${Object.keys(G.ligas).length} ligas</span></div>
          <div class="jt-scroll"><table class="table jt-tabela"><thead><tr><th>Jogador</th><th>Pos.</th><th class="hide-sm">Idade</th><th class="hide-sm">Nac.</th><th>Valor · salário</th><th></th></tr></thead><tbody>${linhas || `<tr><td colspan="6"><div class="empty" style="padding:24px">Nenhum jogador com esses filtros.</div></td></tr>`}</tbody></table></div>
          ${L.length > f.n ? `<button type="button" class="jt-mais" data-jt-mais>Mostrar mais ${Math.min(25, L.length - f.n)}</button>` : ""}
          <p class="source">Elencos de ${Object.keys(G.ligas).length} ligas pela ESPN (atualizados toda semana). Valores e salários: estimativa do Placar.TV. ${esc(G.updated || "")}</p></div>
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
  };
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
  function escalacaoValida(e, k) {
    const ids = new Set(k.elencoFinal.map((j) => j.id)), esc2 = {};
    for (const [s, id] of Object.entries(e.esc)) if (ids.has(id) && +s < FORMACOES[e.form].length) esc2[s] = id;
    return Object.keys(esc2).length >= 11 ? esc2 : { ...autoEscala(k, e.form), ...esc2 };
  }
  function etapaEscalacao(cid, D, e, k) {
    const c = byId[cid], esc2 = escalacaoValida(e, k), porId = new Map(k.elencoFinal.map((j) => [j.id, j]));
    const titulares = new Set(Object.values(esc2)), sel = estadoSlot[cid];
    const fora = k.elencoFinal.filter((j) => !titulares.has(j.id)).sort((a, b) => uso(b) - uso(a));
    const banco = fora.slice(0, 12), demais = fora.slice(12);
    const estr = [...titulares].map((id) => porId.get(id)).filter((j) => j && !brasileiro(j)).length;
    const item = (j) => { const f = CP.origem(j); return `<li><button type="button" class="jt-res" data-jt-poe="${esc(j.id)}">${avatar(j, c, 34)}<span><b>${esc(j.nome)}</b><small>${f} · ${CP.NOME[f] || ""}${j.min ? ` · ${mil(j.min)} min` : ""}</small></span>${j.reforco ? '<em class="jt-novo">reforço</em>' : ""}${j.lesao ? '<em class="jt-les">lesão</em>' : ""}</button></li>`; };
    const selJ = sel != null ? porId.get(esc2[sel]) : null;
    const pv = selJ ? CP.previa(selJ, CP.zona(...ptSlot(e, sel))) : null;
    return `<div class="jt-esc">
      <div class="jt-bloco jt-campo-bloco">
        <div class="jt-bloco-h"><h3>Escalação</h3><span>arraste para qualquer ponto do campo; solte um reserva em cima de um titular para trocar</span></div>
        <div class="jt-forms" role="group" aria-label="Formação">${Object.keys(FORMACOES).map((f) => `<button type="button" class="chip ${f === e.form ? "on" : ""}" data-jt-form="${f}">${f}</button>`).join("")}<button type="button" class="chip" data-jt-auto-esc>Escalar sozinho</button>${Object.keys(e.pos).length ? `<button type="button" class="chip" data-jt-alinha>Alinhar na formação</button>` : ""}</div>
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
  async function desenhaCartaz(cv, cid, D, e, k) {
    const x = cv.getContext("2d"), W = cv.width, H = cv.height, c = byId[cid], [c1, c2] = c.colors;
    try { await document.fonts?.load('900 100px "Big Shoulders Display"'); await document.fonts?.ready; } catch { /* sem fontes */ }
    const F = (w, s, fam = "d") => `${w} ${s}px ${fam === "d" ? '"Big Shoulders Display", "Saira Condensed"' : "Saira"}, sans-serif`;
    // fundo: cor do clube escurecendo para o grafite, com uma faixa diagonal de notícia
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, c1); g.addColorStop(0.55, "#0b1220"); g.addColorStop(1, "#05080f");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = 0.12; x.strokeStyle = "#fff"; x.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(W - 120, 200, 60 + i * 34, 200, 0, 0, Math.PI * 2); x.stroke(); }
    x.restore();
    const logo = await carregaImg(c.logo);
    if (logo) x.drawImage(logo, 64, 60, 120, 120);
    x.fillStyle = "#fff"; x.font = F(700, 28, "s"); x.globalAlpha = 0.85; x.fillText("Janela de transferências 2027", 210, 96); x.globalAlpha = 1;
    x.font = F(900, 104); x.fillText(`MEU ${c.name.toUpperCase()}`.slice(0, 18), 204, 184);
    x.fillStyle = e.modo === "manager" ? "#ffd200" : c2 === "#ffffff" || c2 === "#fff" ? "#fff" : "#00a859";
    rr(x, 210, 206, e.modo === "manager" ? 210 : 160, 40, 20); x.fill();
    x.fillStyle = "#0b1220"; x.font = F(800, 24, "s"); x.fillText(e.modo === "manager" ? "MODO MANAGER" : "MODO REAL", 228, 234);
    // campo 3D com a escalação
    const esc2 = escalacaoValida(e, k), porId = new Map(k.elencoFinal.map((j) => [j.id, j]));
    const pw = 720, ph = 760, gm = CP.geometria(pw, ph), ox = (W - pw) / 2, oy = 300;
    const P = (u, v) => { const p = gm.tela(u, v); return { x: ox + p.x, y: oy + (p.y - gm.topo), s: p.s }; };
    const quad = (u0, v0, u1, v1) => { const a = P(u0, v0), b = P(u1, v0), cc = P(u1, v1), d = P(u0, v1); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(cc.x, cc.y); x.lineTo(d.x, d.y); x.closePath(); };
    for (let i = 0; i < 12; i++) { quad(0, i / 12, 1, (i + 1) / 12); x.fillStyle = i % 2 ? "#1f7a3a" : "#238a42"; x.fill(); }
    x.strokeStyle = "rgba(255,255,255,.7)"; x.lineWidth = 3;
    quad(0.03, 0.02, 0.97, 0.98); x.stroke();
    const linha = (u0, v0, u1, v1) => { const a = P(u0, v0), b = P(u1, v1); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); };
    linha(0.03, 0.5, 0.97, 0.5);
    quad(0.2, 0.02, 0.8, 0.185); x.stroke(); quad(0.2, 0.815, 0.8, 0.98); x.stroke();
    x.beginPath(); for (let a = 0; a <= 64; a++) { const t = (a / 64) * Math.PI * 2, p = P(0.5 + 0.135 * Math.cos(t), 0.5 + 0.0915 * Math.sin(t)); a ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); } x.stroke();
    const fichas = FORMACOES[e.form].map((_, i) => ({ i, j: porId.get(esc2[i]), pt: ptSlot(e, i) })).filter((f) => f.j).sort((a, b) => a.pt[1] - b.pt[1]);
    for (const { j, pt } of fichas) {
      const p = P(pt[0] / 100, pt[1] / 100), r = 34 * p.s;
      x.beginPath(); x.ellipse(p.x, p.y + r * 0.9, r * 0.9, r * 0.28, 0, 0, Math.PI * 2); x.fillStyle = "rgba(0,0,0,.35)"; x.fill();
      x.beginPath(); x.arc(p.x, p.y, r, 0, Math.PI * 2); x.fillStyle = j.reforco ? "#ffd200" : c1; x.fill();
      x.lineWidth = 4; x.strokeStyle = j.reforco ? "#0b1220" : "#fff"; x.stroke();
      x.fillStyle = j.reforco ? "#0b1220" : onColor(c1) === "#111111" ? "#111" : "#fff"; x.font = F(900, Math.round(30 * p.s)); x.textAlign = "center"; x.fillText(String(j.num || POS_CURTO[j.pos]).slice(0, 3), p.x, p.y + 10 * p.s);
      x.fillStyle = "#fff"; x.font = F(800, Math.round(26 * p.s)); x.fillText(sobrenome(j.nome).toUpperCase().slice(0, 13), p.x, p.y + r + 26 * p.s);
      const cod = CP.zona(pt[0], pt[1]), a = CP.avalia(j, cod);
      if (a.tipo !== "igual") { x.font = F(800, 18, "s"); const t = `${a.de} → ${a.para}`, w = x.measureText(t).width + 16; x.fillStyle = a.tipo === "nova" ? "#ffb020" : "#5ab0ff"; rr(x, p.x - w / 2, p.y - r - 30, w, 24, 12); x.fill(); x.fillStyle = "#0b1220"; x.fillText(t, p.x, p.y - r - 12); }
    }
    x.textAlign = "left";
    x.fillStyle = "rgba(255,255,255,.9)"; x.font = F(800, 30); x.fillText(e.form, 64, 340);
    // chegadas e saídas
    const topoL = 1040;
    const lista = async (tit, js, lx, cor, det) => {
      x.fillStyle = cor; x.font = F(900, 44); x.fillText(tit, lx, topoL);
      x.font = F(600, 27, "s"); x.fillStyle = "#fff";
      const n = Math.min(js.length, 4);
      for (let i = 0; i < n; i++) {
        const j = js[i], yy = topoL + 46 + i * 44;
        x.fillText(`${j.nome}`.slice(0, 22), lx, yy);
        x.globalAlpha = 0.7; x.font = F(600, 21, "s"); x.fillText(det(j).slice(0, 30), lx + 300, yy); x.globalAlpha = 1; x.font = F(600, 27, "s");
      }
      if (js.length > 4) { x.globalAlpha = 0.75; x.fillText(`e mais ${js.length - 4}`, lx, topoL + 46 + 4 * 44); x.globalAlpha = 1; }
      if (!js.length) { x.globalAlpha = 0.7; x.fillText("ninguém", lx, topoL + 46); x.globalAlpha = 1; }
    };
    await lista("CHEGADAS", k.chegadas, 64, "#ffd200", (j) => eur(j.valor));
    await lista("SAÍDAS", k.saidas, W / 2 + 24, "#ff8a8a", (j) => ({ emprestar: "emprestado", liberar: "saiu", vender: "vendido", devolver: "devolvido" }[decisao(e, j)] || ""));
    x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(0, H - 92, W, 92);
    x.fillStyle = "#fff"; x.font = F(800, 30); x.fillText(`CAIXA ${eur(k.caixa)}   ·   FOLHA ${brl(k.folha)}/MÊS   ·   ${k.elencoFinal.length} JOGADORES`, 64, H - 36);
    x.textAlign = "right"; x.font = F(900, 36); x.fillText("O PLACAR.TV", W - 64, H - 34); x.textAlign = "left";
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
  function baixa(blob, nome) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

  /* ---------- link para os amigos ---------- */
  const LETRA = { fica: "f", emprestar: "e", liberar: "l", manter: "k", comprar: "c", devolver: "d", segue: "s", reintegrar: "r", vender: "v" };
  const DE_LETRA = Object.fromEntries(Object.entries(LETRA).map(([k, v]) => [v, k]));
  function codifica(D, e, k) {
    const todos = [...D.elenco, ...D.emprestados.map((x) => ({ ...x, fora: true }))];
    const dec = todos.map((j) => LETRA[decisao(e, j)]).join("");
    const ch = e.chegadas.map((id) => (+id).toString(36)).join("-");
    const esc2 = escalacaoValida(e, k), ordem = k.elencoFinal.map((j) => j.id);
    const tit = FORMACOES[e.form].map((_, i) => { const n = ordem.indexOf(esc2[i]); return n < 0 ? "zz" : n.toString(36).padStart(2, "0"); }).join("");
    return `v${e.modo === "manager" ? "m" : "r"}${Object.keys(FORMACOES).indexOf(e.form)}${dec}-${tit}${ch ? `-${ch}` : ""}`;
  }
  function decodifica(D, cod) {
    const m = /^v([mr])(\d)([a-z]*)-([0-9a-z]*)(?:-(.*))?$/.exec(cod || "");
    if (!m) return null;
    const e = novo(); e.modo = m[1] === "m" ? "manager" : "real"; e.form = Object.keys(FORMACOES)[+m[2]] || "4-2-3-1";
    const todos = [...D.elenco, ...D.emprestados.map((x) => ({ ...x, fora: true }))];
    [...m[3]].forEach((l, i) => { if (todos[i] && DE_LETRA[l]) e.dec[todos[i].id] = DE_LETRA[l]; });
    e.chegadas = (m[5] || "").split("-").filter(Boolean).map((x) => String(parseInt(x, 36)));
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

  /* ---------- página ---------- */
  function page(cid, etapa) {
    const ver = /^v[mr]/.test(etapa || "");
    if (!ver && !ETAPAS.some(([k]) => k === etapa)) etapa = "elenco";
    return `<div class="jt" data-jt="${cid}" data-jt-etapa="${esc(etapa)}"><div class="jt-bloco"><div class="empty" style="padding:40px">Abrindo a janela de transferências…</div></div></div>`;
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
    let G = null, confirmaReset = 0;
    const precisaGlobal = () => e.chegadas.length || etapa === "reforcos";
    const pinta = () => {
      const k = contas(cid, D, e, G);
      if (ver && e._tit) aplicaTitulares(e, k);
      if (!e.modo && !ver) { el.innerHTML = painel(cid, D, { modo: "real", pos: {} }, k, G) + escolhaModo(cid); animaNumeros(el); return; }
      const corpo = ver || etapa === "compartilhar" ? etapaCompartilhar(cid, D, e, k, ver) : etapa === "reforcos" ? etapaReforcos(cid, D, e, k, G) : etapa === "escalacao" ? etapaEscalacao(cid, D, e, k) : etapaElenco(cid, D, e);
      const foco = document.activeElement?.dataset?.jtF;
      const mexeu = Object.keys(e.dec).length || e.chegadas.length || Object.keys(e.pos).length || e.caixa != null;
      el.innerHTML = painel(cid, D, e, k, G)
        + (ver ? "" : `<div class="jt-barra">${passos(cid, etapa)}<div class="jt-barra-acoes">${fotosLigadas() ? `<button type="button" class="jt-priv" data-jt-fotos-off title="Fotos sem licença: só para você ver">Fotos privadas · desligar</button>` : ""}${mexeu ? `<button type="button" class="jt-reset ${confirmaReset ? "conf" : ""}" data-jt-reset>${confirmaReset ? "Confirmar: desfazer tudo" : "Desfazer tudo"}</button>` : ""}<button type="button" class="jt-trocar" data-jt-trocar>Trocar modo</button></div></div>`)
        + corpo;
      if (foco) { const i = el.querySelector(`[data-jt-f="${foco}"]`); if (i) { i.focus(); if (i.setSelectionRange && i.type === "search") i.setSelectionRange(i.value.length, i.value.length); } }
      animaNumeros(el);
      const campo = el.querySelector("[data-jt-campo]");
      if (campo) { montaCampo(campo); ro.observe(campo); }
      const cv = el.querySelector("[data-jt-cartaz]");
      if (cv) desenhaCartaz(cv, cid, D, e, k);
    };
    const ro = new ResizeObserver((ents) => { for (const en of ents) if (en.target.isConnected) montaCampo(en.target); });
    const salva = () => { if (!ver) grava(cid, e); };
    if (precisaGlobal()) { pinta(); G = indexa(await carregaGlobal()); }
    else carregaGlobal().then((g) => { G = indexa(g); if (el.isConnected && e.chegadas.length) pinta(); });
    if (!el.isConnected) return;
    pinta();

    // depois de uma mudança, só a peça mexida ganha um destaque curto
    const destaca = (sel) => { const n = el.querySelector(sel); if (n && !reduz()) { n.classList.remove("pulsa"); void n.offsetWidth; n.classList.add("pulsa"); } };

    el.addEventListener("click", async (ev) => {
      const t = ev.target.closest("button, a");
      if (!t || !el.contains(t)) return;
      if (t.closest(".jt-ficha") && arraste.moveu) return; // fim de um arraste, não é toque
      const d = t.dataset, k = () => contas(cid, D, e, G);
      if (d.jtModo) { e.modo = d.jtModo; salva(); return pinta(); }
      if ("jtTrocar" in d) { e.modo = null; salva(); return pinta(); }
      if ("jtFotosOff" in d) { try { localStorage.removeItem(FOTO_KEY); } catch { /* */ } return pinta(); }
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
      if (d.jtPos != null) { fil(cid).pos = d.jtPos; fil(cid).n = 25; return pinta(); }
      if ("jtMais" in d) { fil(cid).n += 25; return pinta(); }
      if (d.jtAdd) {
        const novoReforco = !e.chegadas.includes(d.jtAdd);
        e.chegadas = novoReforco ? [...e.chegadas, d.jtAdd] : e.chegadas.filter((x) => x !== d.jtAdd);
        salva(); pinta();
        if (novoReforco) carimbo(cid, jogadorGlobal(G, d.jtAdd, D));
        return;
      }
      if (d.jtDel) { e.chegadas = e.chegadas.filter((x) => x !== d.jtDel); salva(); return pinta(); }
      if (d.jtForm) { e.form = d.jtForm; e.pos = {}; e.esc = autoEscala(k(), e.form); estadoSlot[cid] = null; salva(); return pinta(); }
      if ("jtAutoEsc" in d) { e.esc = autoEscala(k(), e.form); e.pos = {}; estadoSlot[cid] = null; salva(); return pinta(); }
      if ("jtAlinha" in d) { e.pos = {}; salva(); return pinta(); }
      if (d.jtSlot != null) { estadoSlot[cid] = estadoSlot[cid] === +d.jtSlot ? null : +d.jtSlot; return pinta(); }
      if (d.jtPoe) {
        const s = estadoSlot[cid];
        if (s == null) { const msg = el.querySelector(".jt-campo"); msg?.classList.add("pisca"); setTimeout(() => msg?.classList.remove("pisca"), 700); return; }
        e.esc = { ...escalacaoValida(e, k()), [s]: d.jtPoe }; salva(); pinta();
        return destaca(`[data-jt-slot="${s}"]`);
      }
      const msg = el.querySelector("[data-jt-msg]"), cv = el.querySelector("[data-jt-cartaz]");
      if ("jtPng" in d && cv) { cv.toBlob((b) => b && baixa(b, `elenco-${cid}-2027.png`), "image/png"); if (msg) msg.textContent = "Cartaz em PNG baixado."; return; }
      if ("jtPdf" in d && cv) { baixa(pdfDeJpeg(cv.toDataURL("image/jpeg", 0.92), cv.width, cv.height), `elenco-${cid}-2027.pdf`); if (msg) msg.textContent = "Cartaz em PDF baixado."; return; }
      if ("jtLink" in d) {
        const url = `${location.origin}${location.pathname}#/clube/${cid}/mercado/${codifica(D, e, contas(cid, D, e, G))}`;
        const texto = `Montei o ${byId[cid].name} de 2027 na janela de transferências do Placar.TV. Monte o seu!`;
        try {
          if (navigator.share) {
            const b = cv ? await new Promise((r) => cv.toBlob(r, "image/png")) : null, file = b ? new File([b], `elenco-${cid}.png`, { type: "image/png" }) : null;
            await navigator.share(file && navigator.canShare?.({ files: [file] }) ? { title: "Meu elenco", text: texto, url, files: [file] } : { title: "Meu elenco", text: texto, url });
          } else { await navigator.clipboard.writeText(`${texto} ${url}`); if (msg) msg.textContent = "Link copiado: é só colar para os amigos."; }
        } catch { if (msg) msg.textContent = url; }
        return;
      }
      if ("jtUsar" in d) { const k2 = contas(cid, D, e, G); const novoE = { ...e, esc: escalacaoValida(e, k2) }; delete novoE._tit; grava(cid, novoE); location.hash = `#/clube/${cid}/mercado/elenco`; }
    });

    /* arrastar no campo 3D: titular para qualquer ponto (posição livre) ou em cima de outro titular (troca);
       reserva em cima de um titular (entra no lugar dele) */
    const arraste = { on: null, moveu: false };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0 || ver) return;
      const ficha = ev.target.closest(".jt-ficha"), res = ev.target.closest(".jt-res");
      if (!ficha && !res) return;
      const k = contas(cid, D, e, G), esc2 = escalacaoValida(e, k);
      const id = ficha ? esc2[+ficha.dataset.jtSlot] : res.dataset.jtPoe;
      if (!id) return;
      arraste.on = { ficha, res, id, x: ev.clientX, y: ev.clientY, pid: ev.pointerId, ativo: false, toque: ev.pointerType === "touch", t: Date.now() };
      arraste.moveu = false;
      if (ficha) ev.preventDefault();
    });
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
      const k = contas(cid, D, e, G), esc2 = escalacaoValida(e, k), campo = el.querySelector("[data-jt-campo]");
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
      e.esc = esc2; estadoSlot[cid] = slotMexido; salva(); pinta();
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
      clearTimeout(espera); espera = setTimeout(pinta, nome === "q" ? 180 : 0);
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

  window.MERCADO_UI = { page, mount, carrega, codifica, decodifica, pdfDeJpeg, valor: eur, FORMACOES };
})();
