/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — Janela de transferências (#/clube/<id>/mercado[/etapa])
   Brincadeira de diretor de futebol, nas cores do clube, com cara de painel de aeroporto (partidas e chegadas):
   1) Elenco: quem fica, quem sai emprestado, quem é liberado; quem está emprestado fora (reintegrar, seguir, vender)
      e quem chegou emprestado (comprar ou devolver).
   2) Reforços: o mercado global (elencos das principais ligas, ESPN), com filtros e ordenação em tabela.
   3) Escalação: formação e titulares com quem ficou e quem chegou.
   4) Compartilhar: cartaz em PNG ou PDF e um link que abre o mesmo elenco para os amigos.
   Dois modos: "real" (orçamento estimado, limite de folha, tamanho de elenco e de estrangeiros) e "manager" (sem
   limites). Valores de mercado e salários são ESTIMATIVAS do PLACAR (não há fonte pública e permitida desses números).
   ========================================================================== */
(() => {
  const { byId } = window.PD;
  const { crest, crestOutro, display, onColor, fotoImg } = window.GFX;
  const esc = (t) => window.SEG.esc(t);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

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

  /* ---------- números ---------- */
  const eur = (v) => (v == null ? "—" : v >= 1e6 ? `€ ${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(".", ",")} mi` : `€ ${Math.round(v / 1e3)} mil`);
  const brl = (v) => (v >= 1e6 ? `R$ ${(v / 1e6).toFixed(2).replace(".", ",")} mi` : `R$ ${Math.round(v / 1e3)} mil`);
  const pesoLiga = (G, lg) => G?.ligas?.[lg]?.[2] ?? 0.3;
  const salario = (valor, peso) => Math.max(15000, Math.round((valor * (peso <= 0.3 ? 0.15 : peso <= 0.6 ? 0.10 : 0.09) * 6) / 12 / 1000) * 1000);
  const POS_NOME = { G: "Goleiros", D: "Defensores", M: "Meio-campistas", A: "Atacantes" };
  const POS_CURTO = { G: "GOL", D: "DEF", M: "MEI", A: "ATA" };
  const BANDEIRA = (p) => (p ? `<img class="jt-flag" src="https://a.espncdn.com/i/teamlogos/countries/500/${esc(p)}.png" alt="" width="18" height="18" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : "");
  const brasileiro = (j) => j.pais === "bra" || /brazil|brasil/i.test(j.nac || "");

  /* ---------- estado (por clube, neste aparelho) ---------- */
  const chave = (cid) => `placar:janela-${cid}`;
  const ler = (cid) => { try { return JSON.parse(localStorage.getItem(chave(cid)) || "null"); } catch { return null; } };
  const novo = () => ({ modo: null, dec: {}, chegadas: [], form: "4-3-3", esc: {} });
  function estado(cid) { const e = ler(cid) || novo(); e.dec = e.dec || {}; e.chegadas = e.chegadas || []; e.esc = e.esc || {}; return e; }
  function grava(cid, e) { try { localStorage.setItem(chave(cid), JSON.stringify(e)); } catch { /* sem armazenamento: vale só nesta visita */ } }

  // situação de cada jogador: elenco (fica | emprestar | liberar), chegou emprestado (comprar | devolver), emprestado fora (reintegrar | segue | vender)
  const OPC = {
    elenco: [["fica", "Fica"], ["emprestar", "Empresta"], ["liberar", "Libera"]],
    dentro: [["manter", "Fica emprestado"], ["comprar", "Compra"], ["devolver", "Devolve"]],
    fora: [["segue", "Segue fora"], ["reintegrar", "Reintegra"], ["vender", "Vende"]],
  };
  const tipoDe = (j) => (j.fora ? "fora" : j.emprestadoDe ? "dentro" : "elenco");
  const padrao = (j) => ({ elenco: "fica", dentro: "manter", fora: "segue" }[tipoDe(j)]);
  const decisao = (e, j) => e.dec[j.id] || padrao(j);
  const fica = (e, j) => ["fica", "manter", "comprar", "reintegrar"].includes(decisao(e, j));

  /* ---------- contas da janela ---------- */
  function contas(cid, D, e, G) {
    const todos = [...D.elenco, ...D.emprestados.map((x) => ({ ...x, fora: true }))];
    const chegadas = e.chegadas.map((id) => jogadorGlobal(G, id)).filter(Boolean);
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
    const orcamento = Math.round(D.valorTotal * 0.08 / 1e5) * 1e5; // orçamento de contratações estimado: 8% do valor do elenco
    const saidas = todos.filter((j) => ["emprestar", "liberar", "vender", "devolver"].includes(decisao(e, j)));
    const estrangeiros = elencoFinal.filter((j) => !brasileiro(j)).length;
    const real = e.modo !== "manager";
    const caixa = orcamento + receita - gasto;
    const alertas = [];
    if (real) {
      if (caixa < 0) alertas.push(`Orçamento estourado em ${eur(-caixa)}: venda alguém ou desista de um reforço.`);
      if (folha > D.folhaMensal * 1.1) alertas.push(`A folha passou do limite (${brl(D.folhaMensal * 1.1)} por mês, 10% acima da atual).`);
      const teto = Math.max(36, D.elenco.length); // o elenco da ESPN já inclui a base; o teto não pode ser menor que ele
      if (elencoFinal.length > teto) alertas.push(`Elenco com ${elencoFinal.length} jogadores: o limite aqui é ${teto}.`);
      if (elencoFinal.length < 22) alertas.push(`Elenco com ${elencoFinal.length} jogadores: são precisos pelo menos 22.`);
    }
    return { todos, chegadas, receita, gasto, caixa, orcamento, folha, elencoFinal, saidas, estrangeiros, alertas, real };
  }
  function jogadorGlobal(G, id) {
    if (!G) return null;
    const r = G.idx?.get(id);
    if (!r) return null;
    const [jid, nome, idade, pos, pais, nac, tid, num, valor, lesao] = r, t = G.times[tid] || ["", null, ""];
    return { id: jid, nome, idade, pos, pais, nac: nac || G.paises?.[pais] || "", time: tid, timeNome: t[0], timeLogo: t[1], lg: t[2], num, valor, lesao: !!lesao, salario: salario(valor, pesoLiga(G, t[2])), reforco: true };
  }
  function indexa(G) { if (G && !G.idx) G.idx = new Map(G.jogadores.map((r) => [r[0], r])); return G; }

  /* ---------- painel de aeroporto (letras de virar) ---------- */
  const antes = {}; // último valor de cada placa: só vira a que mudou
  const flap = (txt, cls = "", chave2 = "") => { const muda = chave2 && antes[chave2] !== String(txt); if (chave2) antes[chave2] = String(txt); return flapHTML(txt, `${cls}${muda ? " muda" : ""}`); };
  const flapHTML = (txt, cls = "") => `<span class="jt-flap ${cls}" aria-label="${esc(txt)}">${[...String(txt)].map((ch, i) => `<i style="--i:${i}">${ch === " " ? "&nbsp;" : esc(ch)}</i>`).join("")}</span>`;
  function painel(cid, D, e, k) {
    const c = byId[cid];
    return `<section class="jt-painel" style="--c1:${c.colors[0]};--c2:${c.colors[1]};--c3:${c.colors[2] || c.colors[1]}">
      <div class="jt-painel-topo"><span class="jt-aviao" aria-hidden="true">${AVIAO}</span><div><small>Janela de transferências 2027</small><h2>${esc(c.name)}</h2></div>
        <span class="jt-modo ${e.modo === "manager" ? "mg" : ""}">${e.modo === "manager" ? "Modo manager · sem limites" : "Modo real · orçamento e regras"}</span></div>
      <div class="jt-placar">
        <div><small>Saídas</small>${flap(String(k.saidas.length).padStart(2, "0"), "", `${cid}s`)}</div>
        <div><small>Chegadas</small>${flap(String(k.chegadas.length).padStart(2, "0"), "", `${cid}c`)}</div>
        <div><small>Elenco</small>${flap(String(k.elencoFinal.length).padStart(2, "0"), "", `${cid}e`)}</div>
        <div class="jt-p-grande"><small>${k.real ? "Caixa disponível" : "Gasto na janela"}</small>${flap(k.real ? eur(k.caixa) : eur(k.gasto), k.real && k.caixa < 0 ? "neg" : "", `${cid}x`)}</div>
        <div class="jt-p-grande"><small>Folha mensal</small>${flap(brl(k.folha), k.real && k.folha > D.folhaMensal * 1.1 ? "neg" : "", `${cid}f`)}</div>
      </div>
      ${k.alertas.length ? `<ul class="jt-alertas" role="status">${k.alertas.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
    </section>`;
  }
  const AVIAO = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M21 15.5v-1.8l-8-5V3.5a1.5 1.5 0 0 0-3 0v5.2l-8 5v1.8l8-2.5v5.2l-2 1.5V21l3.5-1 3.5 1v-1.3l-2-1.5V13z" fill="currentColor"/></svg>`;

  /* ---------- etapas ---------- */
  const ETAPAS = [["elenco", "Elenco"], ["reforcos", "Reforços"], ["escalacao", "Escalação"], ["compartilhar", "Compartilhar"]];
  function passos(cid, etapa) {
    return `<ol class="jt-passos">${ETAPAS.map(([k, l], i) => `<li class="${k === etapa ? "on" : ""}"><a href="#/clube/${cid}/mercado/${k}"${k === etapa ? ' aria-current="step"' : ""}><b>${i + 1}</b><span>${l}</span></a></li>`).join("")}</ol>`;
  }

  // tela de escolha do modo (primeira visita ou "trocar modo")
  function escolhaModo(cid) {
    const c = byId[cid];
    return `<div class="jt-escolha"><h2>Como você quer jogar?</h2><p>Monte o ${esc(c.name)} da próxima temporada e mande para os amigos montarem o deles.</p>
      <div class="jt-escolha-g">
        <button type="button" class="jt-cartao-modo" data-jt-modo="real"><b>Modo real</b><span>Orçamento estimado, folha com limite de 10% acima da atual, elenco de pelo menos 22 jogadores e até 9 estrangeiros entre os relacionados. Para quem quer pensar como diretor de verdade.</span><em>Jogar no modo real</em></button>
        <button type="button" class="jt-cartao-modo mg" data-jt-modo="manager"><b>Modo manager</b><span>Sem orçamento, sem limite de contratações, qualquer jogador do mundo. O time dos sonhos, do jeito que você quiser.</span><em>Jogar no modo manager</em></button>
      </div></div>`;
  }

  function linhaJogador(cid, j, e, k) {
    const tipo = tipoDe(j), d = decisao(e, j), opc = OPC[tipo];
    const sub = tipo === "fora" ? `Emprestado ao ${esc(j.clube || "?")}${j.ate ? ` até ${j.ate.split("-").reverse().join("/")}` : ""}`
      : tipo === "dentro" ? `Emprestado pelo ${esc(j.emprestadoDe)}${j.ateQuando ? ` até ${j.ateQuando.split("-").reverse().join("/")}` : ""}`
      : `${j.min ? `${j.min} min na temporada` : "Sem minutos na temporada"}${j.lesao ? ' · <b class="jt-les">lesionado</b>' : ""}`;
    const foto = j.foto?.url ? `<span class="jt-foto">${fotoImg(j.foto, "")}</span>` : `<span class="jt-foto jt-sem">${esc(j.num || POS_CURTO[j.pos])}</span>`;
    return `<tr class="jt-j d-${d}" data-jt-j="${esc(j.id)}">
      <td class="jt-quem">${foto}<div><b>${esc(j.nome)}</b><small>${sub}</small></div></td>
      <td class="jt-pos"><span class="jt-pos-t p-${j.pos}">${POS_CURTO[j.pos]}</span></td>
      <td class="hide-sm">${j.idade ?? "—"}</td><td class="hide-sm">${BANDEIRA(j.pais)}</td>
      <td class="jt-v">${eur(j.valor)}<small>${brl(j.salario)}/mês</small></td>
      <td class="jt-acao"><div class="jt-seg" role="radiogroup" aria-label="Decisão sobre ${esc(j.nome)}">${opc.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === d}" class="${v === d ? "on" : ""} o-${v}" data-jt-dec="${v}">${l}</button>`).join("")}</div></td></tr>`;
  }
  function etapaElenco(cid, D, e, k) {
    const grupos = ["G", "D", "M", "A"].map((p) => [p, D.elenco.filter((j) => j.pos === p)]);
    const cab = `<thead><tr><th>Jogador</th><th>Pos.</th><th class="hide-sm">Idade</th><th class="hide-sm">Nac.</th><th>Valor · salário</th><th>Decisão</th></tr></thead>`;
    return `<div class="card jt-tab-card"><div class="card-h">Elenco atual <small>${D.elenco.length} jogadores · valor estimado ${eur(D.valorTotal)} · folha ${brl(D.folhaMensal)}/mês</small></div>
        <div class="jt-atalhos"><button type="button" class="chip" data-jt-auto="limpa">Todos ficam</button><button type="button" class="chip" data-jt-auto="veteranos">Liberar quem tem 34+</button><button type="button" class="chip" data-jt-auto="base">Emprestar a base sem minutos</button></div>
        <div class="jt-scroll"><table class="table jt-tabela">${cab}${grupos.map(([p, js]) => js.length ? `<tbody><tr class="jt-grupo"><th colspan="6">${POS_NOME[p]} <small>${js.length}</small></th></tr>${js.map((j) => linhaJogador(cid, j, e, k)).join("")}</tbody>` : "").join("")}</table></div></div>
      ${D.emprestados.length ? `<div class="card jt-tab-card"><div class="card-h">Emprestados a outros clubes <small>${D.emprestados.length} · reintegre quem você quer de volta</small></div>
        <div class="jt-scroll"><table class="table jt-tabela">${cab}<tbody>${D.emprestados.map((j) => linhaJogador(cid, { ...j, fora: true }, e, k)).join("")}</tbody></table></div></div>` : ""}
      <div class="jt-seguir"><a class="jt-btn" href="#/clube/${cid}/mercado/reforcos">Ir aos reforços</a></div>
      <p class="source">Elenco: ESPN. Emprestados: Wikipédia em inglês${D.fonteEmprestimos ? ` (<a href="${esc(window.SEG.url(D.fonteEmprestimos))}" target="_blank" rel="noopener noreferrer" style="color:var(--ink)">artigo do clube</a>, CC BY-SA 4.0)` : ""}. Valores e salários são estimativas do Placar.TV, calculadas pela idade, posição, minutos jogados e força do time; não há fonte pública e permitida desses números. Atualizado em ${esc(D.updated)}.</p>`;
  }

  /* ---------- reforços: mercado global, filtros à moda das tabelas de transferências ---------- */
  const filtros = {};
  const fil = (cid) => (filtros[cid] = filtros[cid] || { q: "", pos: "", lg: "", nac: "", idMin: 16, idMax: 40, vMax: 0, ord: "valor", semLes: true, n: 25 });
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function resultados(cid, D, G, e) {
    const f = fil(cid), meus = new Set(D.elenco.map((j) => j.id)), escolhidos = new Set(e.chegadas), q = norm(f.q).trim();
    const meuTime = Object.entries(G.times).find(([, t]) => t[0] && norm(t[0]) === norm(byId[cid].name))?.[0];
    let L = G.jogadores.filter((r) => !meus.has(r[0]) && r[6] !== meuTime && (!f.pos || r[3] === f.pos) && (r[2] == null || (r[2] >= f.idMin && r[2] <= f.idMax))
      && (!f.vMax || r[8] <= f.vMax) && (!f.lg || G.times[r[6]]?.[2] === f.lg) && (!f.semLes || !r[9])
      && (!f.nac || (f.nac === "bra" ? r[4] === "bra" : f.nac === "est" ? r[4] !== "bra" : r[4] === f.nac))
      && (!q || norm(r[1]).split(/\s+/).some((w) => w.startsWith(q)) || (q.length > 2 && norm(r[1]).includes(q))));
    const ord = { valor: (a, b) => b[8] - a[8], idade: (a, b) => (a[2] ?? 99) - (b[2] ?? 99), nome: (a, b) => a[1].localeCompare(b[1], "pt-BR"), barato: (a, b) => a[8] - b[8] }[f.ord];
    L.sort(ord);
    return { L, escolhidos };
  }
  function etapaReforcos(cid, D, e, k, G) {
    if (!G) return `<div class="card"><div class="empty" style="padding:40px">Carregando o mercado global…</div></div>`;
    const f = fil(cid), { L, escolhidos } = resultados(cid, D, G, e);
    const paises = [...new Set(G.jogadores.map((r) => r[4]).filter(Boolean))];
    const nomePais = G.paises || {};
    const topPaises = paises.map((p) => [p, G.jogadores.filter((r) => r[4] === p).length]).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([p]) => p).sort((a, b) => (nomePais[a] || a).localeCompare(nomePais[b] || b, "pt-BR"));
    const sel = (nome, v, ops) => `<select data-jt-f="${nome}">${ops.map(([x, l]) => `<option value="${esc(x)}"${String(x) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const linhas = L.slice(0, f.n).map((r) => {
      const j = jogadorGlobal(G, r[0]), ja = escolhidos.has(j.id), semDinheiro = k.real && !ja && j.valor > k.caixa;
      return `<tr class="${ja ? "jt-ja" : ""}"><td class="jt-quem"><span class="jt-foto jt-sem">${esc(j.num || POS_CURTO[j.pos])}</span><div><b>${esc(j.nome)}</b><small>${j.timeLogo ? crestOutro(j.timeNome, j.timeLogo, 14) : ""} ${esc(j.timeNome)} · ${esc(G.ligas[j.lg]?.[0] || "")}</small></div></td>
        <td class="jt-pos"><span class="jt-pos-t p-${j.pos}">${POS_CURTO[j.pos]}</span></td><td class="hide-sm">${j.idade ?? "—"}</td><td class="hide-sm">${BANDEIRA(j.pais)}</td>
        <td class="jt-v">${eur(j.valor)}<small>${brl(j.salario)}/mês</small></td>
        <td class="jt-acao"><button type="button" class="jt-contratar ${ja ? "ja" : ""}" data-jt-add="${esc(j.id)}" ${semDinheiro ? `disabled title="Sem caixa no modo real"` : ""}>${ja ? "Na lista ✓" : semDinheiro ? "Sem caixa" : "Contratar"}</button></td></tr>`;
    }).join("");
    return `<div class="jt-mercado">
      <aside class="card jt-filtros"><div class="card-h">Filtros</div>
        <label class="jt-f-busca"><span>Nome</span><input type="search" data-jt-f="q" value="${esc(f.q)}" placeholder="Buscar jogador…" autocomplete="off"></label>
        <div class="jt-f-pos" role="group" aria-label="Posição">${[["", "Todas"], ["G", "GOL"], ["D", "DEF"], ["M", "MEI"], ["A", "ATA"]].map(([v, l]) => `<button type="button" class="chip ${f.pos === v ? "on" : ""}" data-jt-pos="${v}">${l}</button>`).join("")}</div>
        <label><span>Liga</span>${sel("lg", f.lg, [["", "Todas as ligas"], ...Object.entries(G.ligas).map(([k2, v]) => [k2, `${v[0]} (${v[1]})`])])}</label>
        <label><span>Nacionalidade</span>${sel("nac", f.nac, [["", "Todas"], ["bra", "Só brasileiros"], ["est", "Só estrangeiros"], ...topPaises.filter((p) => p !== "bra").map((p) => [p, nomePais[p] || p])])}</label>
        <div class="jt-f-2"><label><span>Idade mín.</span><input type="number" min="15" max="45" data-jt-f="idMin" value="${f.idMin}"></label><label><span>Idade máx.</span><input type="number" min="15" max="45" data-jt-f="idMax" value="${f.idMax}"></label></div>
        <label><span>Valor até</span>${sel("vMax", f.vMax, [[0, "Qualquer valor"], [1e6, "€ 1 mi"], [3e6, "€ 3 mi"], [5e6, "€ 5 mi"], [10e6, "€ 10 mi"], [20e6, "€ 20 mi"], [40e6, "€ 40 mi"]])}</label>
        <label><span>Ordenar por</span>${sel("ord", f.ord, [["valor", "Mais valiosos"], ["barato", "Mais baratos"], ["idade", "Mais jovens"], ["nome", "Nome"]])}</label>
        <label class="jt-f-chk"><input type="checkbox" data-jt-f="semLes" ${f.semLes ? "checked" : ""}> Esconder lesionados</label>
      </aside>
      <div>
        <div class="card jt-chegadas"><div class="card-h">Chegadas <small>${k.chegadas.length} · ${eur(k.chegadas.reduce((s, j) => s + j.valor, 0))}</small></div>
          ${k.chegadas.length ? `<ul class="jt-passes">${k.chegadas.map((j) => passe(cid, j, G)).join("")}</ul>` : `<div class="empty" style="padding:20px">Ninguém ainda. Escolha na lista abaixo: os reforços aparecem aqui como cartão de embarque.</div>`}</div>
        <div class="card jt-tab-card"><div class="card-h">Mercado global <small>${L.length.toLocaleString("pt-BR")} jogadores · ${Object.keys(G.ligas).length} ligas</small></div>
          <div class="jt-scroll"><table class="table jt-tabela"><thead><tr><th>Jogador</th><th>Pos.</th><th class="hide-sm">Idade</th><th class="hide-sm">Nac.</th><th>Valor · salário</th><th></th></tr></thead><tbody>${linhas || `<tr><td colspan="6"><div class="empty" style="padding:24px">Nenhum jogador com esses filtros.</div></td></tr>`}</tbody></table></div>
          ${L.length > f.n ? `<button type="button" class="jt-mais" data-jt-mais>Mostrar mais ${Math.min(25, L.length - f.n)}</button>` : ""}
          <p class="source">Elencos de ${Object.keys(G.ligas).length} ligas pela ESPN (atualizados toda semana). Valores e salários: estimativa do Placar.TV. ${esc(G.updated || "")}</p></div>
        <div class="jt-seguir"><a class="jt-btn sec" href="#/clube/${cid}/mercado/elenco">Voltar ao elenco</a><a class="jt-btn" href="#/clube/${cid}/mercado/escalacao">Montar a escalação</a></div>
      </div></div>`;
  }
  // reforço como cartão de embarque: de onde vem, para onde vai
  function passe(cid, j, G) {
    const c = byId[cid];
    return `<li class="jt-passe"><div class="jt-passe-a"><small>Passageiro</small><b>${esc(j.nome)}</b><span>${POS_CURTO[j.pos]} · ${j.idade ?? "—"} anos ${BANDEIRA(j.pais)}</span></div>
      <div class="jt-passe-rota"><span>${j.timeLogo ? crestOutro(j.timeNome, j.timeLogo, 26) : ""}<small>${esc(j.timeNome)}</small></span><i aria-hidden="true">${AVIAO}</i><span>${crest(c, 26)}<small>${esc(c.abbr)}</small></span></div>
      <div class="jt-passe-b"><small>Valor</small><b>${eur(j.valor)}</b><button type="button" class="jt-tirar" data-jt-del="${esc(j.id)}" aria-label="Tirar ${esc(j.nome)} da lista">×</button></div></li>`;
  }

  /* ---------- escalação ---------- */
  const FORMACOES = {
    "4-3-3": [["G", 50, 92], ["D", 15, 72], ["D", 38, 76], ["D", 62, 76], ["D", 85, 72], ["M", 28, 52], ["M", 50, 56], ["M", 72, 52], ["A", 18, 26], ["A", 50, 20], ["A", 82, 26]],
    "4-4-2": [["G", 50, 92], ["D", 15, 72], ["D", 38, 76], ["D", 62, 76], ["D", 85, 72], ["M", 15, 48], ["M", 38, 52], ["M", 62, 52], ["M", 85, 48], ["A", 38, 22], ["A", 62, 22]],
    "4-2-3-1": [["G", 50, 92], ["D", 15, 72], ["D", 38, 76], ["D", 62, 76], ["D", 85, 72], ["M", 36, 58], ["M", 64, 58], ["M", 18, 36], ["M", 50, 38], ["M", 82, 36], ["A", 50, 16]],
    "3-5-2": [["G", 50, 92], ["D", 25, 74], ["D", 50, 77], ["D", 75, 74], ["M", 10, 48], ["M", 32, 54], ["M", 50, 46], ["M", 68, 54], ["M", 90, 48], ["A", 38, 22], ["A", 62, 22]],
    "3-4-3": [["G", 50, 92], ["D", 25, 74], ["D", 50, 77], ["D", 75, 74], ["M", 14, 50], ["M", 38, 54], ["M", 62, 54], ["M", 86, 50], ["A", 18, 24], ["A", 50, 18], ["A", 82, 24]],
    "5-3-2": [["G", 50, 92], ["D", 10, 66], ["D", 30, 75], ["D", 50, 78], ["D", 70, 75], ["D", 90, 66], ["M", 28, 50], ["M", 50, 54], ["M", 72, 50], ["A", 38, 22], ["A", 62, 22]],
  };
  const sobrenome = (n) => { const p = String(n).split(" "); return p.length > 1 && p[p.length - 1].length > 2 ? p[p.length - 1] : n; };
  function autoEscala(k, form) {
    const usados = new Set(), esc2 = {};
    FORMACOES[form].forEach(([p], i) => {
      const op = k.elencoFinal.filter((j) => j.pos === p && !usados.has(j.id) && !j.lesao).sort((a, b) => b.valor - a.valor)[0]
        || k.elencoFinal.filter((j) => !usados.has(j.id) && j.pos !== "G").sort((a, b) => b.valor - a.valor)[0];
      if (op) { usados.add(op.id); esc2[i] = op.id; }
    });
    return esc2;
  }
  function escalacaoValida(e, k) {
    const ids = new Set(k.elencoFinal.map((j) => j.id)), esc2 = {};
    for (const [s, id] of Object.entries(e.esc)) if (ids.has(id) && +s < FORMACOES[e.form].length) esc2[s] = id;
    return Object.keys(esc2).length ? esc2 : autoEscala(k, e.form);
  }
  function etapaEscalacao(cid, D, e, k) {
    const c = byId[cid], esc2 = escalacaoValida(e, k), porId = new Map(k.elencoFinal.map((j) => [j.id, j]));
    const titulares = new Set(Object.values(esc2)), slot = estadoSlot[cid];
    const alvo = slot != null ? FORMACOES[e.form][slot][0] : null; // com uma posição escolhida, quem joga nela vem primeiro
    const reservas = k.elencoFinal.filter((j) => !titulares.has(j.id)).sort((a, b) => (alvo ? (b.pos === alvo) - (a.pos === alvo) : 0) || "GDMA".indexOf(a.pos) - "GDMA".indexOf(b.pos) || b.valor - a.valor);
    const estr = [...titulares].map((id) => porId.get(id)).filter((j) => j && !brasileiro(j)).length;
    return `<div class="jt-esc">
      <div class="card"><div class="card-h">Escalação <small>toque numa posição e depois num jogador</small></div>
        <div class="jt-forms" role="group" aria-label="Formação">${Object.keys(FORMACOES).map((f) => `<button type="button" class="chip ${f === e.form ? "on" : ""}" data-jt-form="${f}">${f}</button>`).join("")}<button type="button" class="chip" data-jt-auto-esc>Escalar sozinho</button></div>
        <div class="jt-campo" style="--c1:${c.colors[0]};--c2:${c.colors[1]}">
          <svg class="jt-linhas" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><rect x="2" y="2" width="96" height="136" rx="2"/><line x1="2" y1="70" x2="98" y2="70"/><circle cx="50" cy="70" r="11"/><rect x="24" y="2" width="52" height="20"/><rect x="24" y="118" width="52" height="20"/></svg>
          ${FORMACOES[e.form].map(([p, x, y], i) => { const j = porId.get(esc2[i]); return `<button type="button" class="jt-slot ${slot === i ? "on" : ""} ${j && j.reforco ? "novo" : ""}" style="left:${x}%;top:${y}%" data-jt-slot="${i}" aria-label="${POS_NOME[p]}: ${j ? esc(j.nome) : "vazio"}"><span class="jt-camisa">${j ? esc(j.num || POS_CURTO[p]) : "+"}</span><small>${j ? esc(sobrenome(j.nome)) : POS_CURTO[p]}</small></button>`; }).join("")}
        </div>
        ${k.real && estr > 9 ? `<p class="jt-alertas"><span>Mais de 9 estrangeiros entre os titulares: a CBF só deixa relacionar 9.</span></p>` : ""}</div>
      <div class="card"><div class="card-h">${slot != null ? `Escolha para ${POS_NOME[FORMACOES[e.form][slot][0]].toLowerCase().replace(/s$/, "")}` : "Banco e opções"} <small>${reservas.length}</small></div>
        <ul class="jt-banco">${reservas.map((j) => `<li><button type="button" data-jt-poe="${esc(j.id)}" class="${slot != null && j.pos === FORMACOES[e.form][slot][0] ? "cabe" : ""}"><span class="jt-pos-t p-${j.pos}">${POS_CURTO[j.pos]}</span><b>${esc(j.nome)}</b>${j.reforco ? '<em class="jt-novo">reforço</em>' : ""}<small>${eur(j.valor)}</small></button></li>`).join("")}</ul></div>
      <div class="jt-seguir"><a class="jt-btn sec" href="#/clube/${cid}/mercado/reforcos">Voltar aos reforços</a><a class="jt-btn" href="#/clube/${cid}/mercado/compartilhar">Compartilhar o elenco</a></div></div>`;
  }
  const estadoSlot = {};

  /* ---------- compartilhar: cartaz (canvas) em PNG e PDF, e link ---------- */
  function etapaCompartilhar(cid, D, e, k, ver = false) {
    const c = byId[cid];
    return `<div class="jt-share">
      <div class="card jt-cartaz-card"><canvas class="jt-cartaz" width="1080" height="1350" data-jt-cartaz aria-label="Cartaz do elenco do ${esc(c.name)}"></canvas></div>
      <div class="card jt-share-acoes"><div class="card-h">${ver ? "Elenco montado por um amigo" : "Mostre o seu elenco"}</div>
        <p>${ver ? `É assim que um amigo montou o ${esc(c.name)} para 2027. Faça o seu e mande de volta.` : "Baixe o cartaz ou mande o link: quem abrir vê o seu elenco e pode montar o dele."}</p>
        <div class="jt-share-btns">
          <button type="button" class="jt-btn" data-jt-png>Baixar PNG</button>
          <button type="button" class="jt-btn" data-jt-pdf>Baixar PDF</button>
          <button type="button" class="jt-btn sec" data-jt-link>${navigator.share ? "Compartilhar" : "Copiar link"}</button>
          ${ver ? `<button type="button" class="jt-btn sec" data-jt-usar>Usar como ponto de partida</button><a class="jt-btn sec" href="#/clube/${cid}/mercado/elenco">Montar o meu do zero</a>` : `<a class="jt-btn sec" href="#/clube/${cid}/mercado/elenco">Revisar decisões</a><button type="button" class="jt-btn sec" data-jt-zerar>Começar de novo</button>`}
        </div>
        <ul class="jt-resumo"><li><small>Chegadas</small><b>${k.chegadas.length}</b></li><li><small>Saídas</small><b>${k.saidas.length}</b></li><li><small>${k.real ? "Caixa" : "Gasto"}</small><b>${k.real ? eur(k.caixa) : eur(k.gasto)}</b></li><li><small>Folha</small><b>${brl(k.folha)}</b></li></ul>
        <p class="jt-share-msg" data-jt-msg role="status"></p></div></div>`;
  }
  const carregaImg = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.crossOrigin = "anonymous"; im.referrerPolicy = "no-referrer"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  async function desenhaCartaz(cv, cid, D, e, k) {
    const x = cv.getContext("2d"), W = cv.width, H = cv.height, c = byId[cid], [c1, c2] = c.colors, on = onColor(c1);
    await document.fonts?.ready;
    const F = (w, s, cond = true) => `${w} ${s}px ${cond ? '"Saira Condensed"' : "Saira"}, sans-serif`;
    // fundo: cor do clube com as faixas diagonais do painel
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, c1); g.addColorStop(1, "#0b0f14");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = 0.16; x.fillStyle = c2;
    for (let i = -2; i < 8; i++) { x.beginPath(); x.moveTo(i * 220, 0); x.lineTo(i * 220 + 90, 0); x.lineTo(i * 220 - 260, H); x.lineTo(i * 220 - 350, H); x.fill(); }
    x.restore();
    // cabeçalho
    const logo = await carregaImg(c.logo);
    if (logo) x.drawImage(logo, 64, 56, 132, 132);
    x.fillStyle = on === "#111111" ? "#111" : "#fff";
    x.font = F(700, 30, false); x.fillText("JANELA DE TRANSFERÊNCIAS 2027", 220, 92);
    x.font = F(800, 86); x.fillText(`Meu ${c.name}`.slice(0, 22), 216, 172);
    x.font = F(600, 26, false); x.globalAlpha = 0.85; x.fillText(e.modo === "manager" ? "Modo manager · sem limites" : "Modo real · orçamento e regras", 222, 212); x.globalAlpha = 1;
    // campo com a escalação
    const esc2 = escalacaoValida(e, k), porId = new Map(k.elencoFinal.map((j) => [j.id, j]));
    const px = 64, py = 250, pw = W - 128, ph = 640;
    x.fillStyle = "rgba(0,0,0,.28)"; rr(x, px, py, pw, ph, 28); x.fill();
    x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 3; rr(x, px + 20, py + 20, pw - 40, ph - 40, 10); x.stroke();
    x.beginPath(); x.moveTo(px + 20, py + ph / 2); x.lineTo(px + pw - 20, py + ph / 2); x.stroke();
    x.beginPath(); x.arc(px + pw / 2, py + ph / 2, 70, 0, Math.PI * 2); x.stroke();
    FORMACOES[e.form].forEach(([p, fx, fy], i) => {
      const j = porId.get(esc2[i]); if (!j) return;
      const cx = px + 20 + (pw - 40) * fx / 100, cy = py + 20 + (ph - 40) * (fy / 100) * 0.94;
      x.beginPath(); x.arc(cx, cy, 30, 0, Math.PI * 2); x.fillStyle = j.reforco ? "#ffd200" : c2; x.fill();
      x.lineWidth = 4; x.strokeStyle = j.reforco ? "#111" : c1; x.stroke();
      x.fillStyle = j.reforco ? "#111" : onColor(c2) === "#111111" ? "#111" : "#fff"; x.font = F(800, 26); x.textAlign = "center"; x.fillText(String(j.num || POS_CURTO[p]).slice(0, 3), cx, cy + 9);
      x.fillStyle = "#fff"; x.font = F(700, 27); x.fillText(sobrenome(j.nome).slice(0, 14), cx, cy + 62);
    });
    x.textAlign = "left";
    x.fillStyle = "#fff"; x.font = F(700, 24, false); x.fillText(e.form, px + 34, py + 54);
    // chegadas e saídas
    const lista = (tit, js, lx, cor) => {
      x.fillStyle = cor; x.font = F(800, 40); x.fillText(tit, lx, 950);
      x.font = F(600, 28, false); x.fillStyle = "#fff";
      js.slice(0, 7).forEach((j, i) => x.fillText(`${j.nome}`.slice(0, 24), lx, 998 + i * 40));
      if (js.length > 7) { x.globalAlpha = 0.75; x.fillText(`+ ${js.length - 7}`, lx, 998 + 7 * 40); x.globalAlpha = 1; }
      if (!js.length) { x.globalAlpha = 0.7; x.fillText("ninguém", lx, 998); x.globalAlpha = 1; }
    };
    lista("CHEGADAS", k.chegadas, 64, "#ffd200");
    lista("SAÍDAS", k.saidas, W / 2 + 20, "#ff8a8a");
    // rodapé
    x.fillStyle = "rgba(0,0,0,.4)"; x.fillRect(0, H - 96, W, 96);
    x.fillStyle = "#fff"; x.font = F(700, 30); x.fillText(`${k.real ? "Caixa" : "Gasto"} ${k.real ? eur(k.caixa) : eur(k.gasto)}   ·   Folha ${brl(k.folha)}/mês   ·   ${k.elencoFinal.length} jogadores`, 64, H - 38);
    x.textAlign = "right"; x.font = F(800, 34); x.fillText("O PLACAR.TV", W - 64, H - 38); x.textAlign = "left";
  }
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  // PDF de uma página com a imagem JPEG do cartaz (montado à mão: sem biblioteca externa)
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

  /* ---------- link para os amigos: decisões + chegadas + formação + titulares num código curto ---------- */
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
    const e = novo(); e.modo = m[1] === "m" ? "manager" : "real"; e.form = Object.keys(FORMACOES)[+m[2]] || "4-3-3";
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
    return `<div class="jt" data-jt="${cid}" data-jt-etapa="${esc(etapa)}"><div class="card"><div class="empty" style="padding:40px">Abrindo a janela de transferências…</div></div></div>`;
  }
  async function mount(root) {
    const el = root.querySelector("[data-jt]");
    if (!el) return;
    const cid = el.dataset.jt;
    let etapa = el.dataset.jtEtapa;
    const ver = /^v[mr]/.test(etapa);
    const D = await carrega(cid);
    if (!el.isConnected) return;
    if (!D) { el.innerHTML = `<div class="card"><div class="empty" style="padding:40px">Os dados de mercado deste clube ainda não foram gerados.</div></div>`; return; }
    let e = ver ? decodifica(D, etapa) || estado(cid) : estado(cid);
    let G = null;
    const precisaGlobal = () => e.chegadas.length || etapa === "reforcos";
    const pinta = () => {
      const k = contas(cid, D, e, G);
      if (ver && e._tit) aplicaTitulares(e, k);
      if (!e.modo && !ver) { el.innerHTML = painel(cid, D, { modo: "real" }, k) + escolhaModo(cid); return; }
      const corpo = ver || etapa === "compartilhar" ? etapaCompartilhar(cid, D, e, k, ver) : etapa === "reforcos" ? etapaReforcos(cid, D, e, k, G) : etapa === "escalacao" ? etapaEscalacao(cid, D, e, k) : etapaElenco(cid, D, e, k);
      const foco = document.activeElement?.dataset?.jtF;
      el.innerHTML = painel(cid, D, e, k) + (ver ? "" : `<div class="jt-barra">${passos(cid, etapa)}<button type="button" class="jt-trocar" data-jt-trocar>Trocar modo</button></div>`) + corpo;
      if (foco) { const i = el.querySelector(`[data-jt-f="${foco}"]`); if (i) { i.focus(); if (i.setSelectionRange && i.type === "search") i.setSelectionRange(i.value.length, i.value.length); } }
      const cv = el.querySelector("[data-jt-cartaz]");
      if (cv) desenhaCartaz(cv, cid, D, e, k);
    };
    const salva = () => { if (!ver) grava(cid, e); };
    if (precisaGlobal()) { pinta(); G = indexa(await carregaGlobal()); }
    else carregaGlobal().then((g) => { G = indexa(g); if (el.isConnected && e.chegadas.length) pinta(); });
    if (!el.isConnected) return;
    pinta();

    el.addEventListener("click", async (ev) => {
      const t = ev.target.closest("button, a");
      if (!t || !el.contains(t)) return;
      const d = t.dataset, k = () => contas(cid, D, e, G);
      if (d.jtModo) { e.modo = d.jtModo; salva(); return pinta(); }
      if ("jtTrocar" in d) { e.modo = null; salva(); return pinta(); }
      if (d.jtDec) { const id = t.closest("[data-jt-j]").dataset.jtJ; e.dec[id] = d.jtDec; salva(); return pinta(); }
      if (d.jtAuto) {
        if (d.jtAuto === "limpa") e.dec = {};
        if (d.jtAuto === "veteranos") D.elenco.forEach((j) => { if ((j.idade || 0) >= 34) e.dec[j.id] = tipoDe(j) === "dentro" ? "devolver" : "liberar"; });
        if (d.jtAuto === "base") D.elenco.forEach((j) => { if ((j.idade || 99) <= 21 && !j.min && tipoDe(j) === "elenco") e.dec[j.id] = "emprestar"; });
        salva(); return pinta();
      }
      if (d.jtPos != null) { fil(cid).pos = d.jtPos; fil(cid).n = 25; return pinta(); }
      if ("jtMais" in d) { fil(cid).n += 25; return pinta(); }
      if (d.jtAdd) { if (!e.chegadas.includes(d.jtAdd)) e.chegadas.push(d.jtAdd); else e.chegadas = e.chegadas.filter((x) => x !== d.jtAdd); salva(); return pinta(); }
      if (d.jtDel) { e.chegadas = e.chegadas.filter((x) => x !== d.jtDel); salva(); return pinta(); }
      if (d.jtForm) { e.form = d.jtForm; e.esc = autoEscala(k(), e.form); estadoSlot[cid] = null; salva(); return pinta(); }
      if ("jtAutoEsc" in d) { e.esc = autoEscala(k(), e.form); estadoSlot[cid] = null; salva(); return pinta(); }
      if (d.jtSlot != null) { estadoSlot[cid] = estadoSlot[cid] === +d.jtSlot ? null : +d.jtSlot; return pinta(); }
      if (d.jtPoe) {
        const s = estadoSlot[cid];
        if (s == null) { const msg = el.querySelector(".jt-campo"); msg?.classList.add("pisca"); setTimeout(() => msg?.classList.remove("pisca"), 700); return; }
        e.esc = { ...escalacaoValida(e, k()), [s]: d.jtPoe }; estadoSlot[cid] = null; salva(); return pinta();
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
      if ("jtUsar" in d) { const k2 = contas(cid, D, e, G); const novoE = { ...e, esc: escalacaoValida(e, k2) }; grava(cid, novoE); location.hash = `#/clube/${cid}/mercado/elenco`; return; }
      if ("jtZerar" in d) { e = novo(); salva(); location.hash = `#/clube/${cid}/mercado/elenco`; }
    });
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
  }

  window.MERCADO_UI = { page, mount, carrega, codifica, decodifica, pdfDeJpeg, valor: eur };
})();
