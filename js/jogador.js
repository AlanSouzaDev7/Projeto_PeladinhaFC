/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Autor: Alan Evangelista de Souza Martins. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — página do jogador (#/jogador/<id>[/aba][/<id para comparar>])
   Abas: visão geral, últimos 10 jogos, temporada (todos os jogos, por competição), mapa de calor e comparativo.
   Dados: js/jogadores/<clube>.js (ou /api/elenco-temporada com a API), gravados a cada 30 min pelo robô:
     súmulas e lances com coordenadas da ESPN, fotos com licença livre do Wikimedia Commons.
   A lista de jogadores para a busca vem do elenco (js/squads.js), que já está carregado: buscar não baixa nada.
   ========================================================================== */
(() => {
  const { byId } = window.PD;
  const { crest, display, onColor } = window.GFX;
  const esc = (t) => window.SEG.esc(t);
  const POS = { G: "Goleiro", D: "Defensor", M: "Meio-campista", F: "Atacante" };
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  /* ---------- índice para a busca (do elenco já carregado) ---------- */
  // chave de cada jogador: "<id da ESPN>-<clube>" (a ESPN às vezes usa o mesmo número para dois homônimos de clubes diferentes)
  let idx = null, idxDe = null, porId = null;
  function indice() {
    const S = window.SQUADS || {};
    if (idx && idxDe === S) return idx;
    idx = new Map(); porId = new Map(); idxDe = S;
    for (const [cid, rows] of Object.entries(S)) {
      if (!byId[cid]) continue;
      for (const [num, nome, pos, idade, aid] of rows) {
        if (!aid) continue;
        const key = `${aid}-${cid}`;
        if (idx.has(key)) continue;
        idx.set(key, { key, aid: String(aid), cid, num, nome, pos, idade });
        (porId.get(String(aid)) || porId.set(String(aid), []).get(String(aid))).push(key);
      }
    }
    return idx;
  }
  // aceita "216098-cruzeiro" ou só "216098" (o primeiro clube com esse número)
  function get(id) {
    const I = indice(), k = String(id || "");
    if (I.has(k)) return I.get(k);
    const ks = porId.get(k.split("-")[0]);
    return ks ? I.get(ks[0]) : null;
  }
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // jogadores pelo começo do nome ou de um sobrenome ("pereira" acha Matheus Pereira); quem joga mais vem antes
  function busca(q, n = 6) {
    q = norm(q).trim();
    if (q.length < 2) return [];
    const out = [];
    for (const p of indice().values()) {
      const nm = norm(p.nome), w = nm.split(/[\s-]+/);
      const inicio = nm.startsWith(q), palavra = q.length >= 3 && w.some((x) => x.startsWith(q));
      if (inicio || palavra) out.push({ ...p, nota: (inicio ? 2 : 1) });
    }
    return out.sort((a, b) => b.nota - a.nota || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, n);
  }

  /* ---------- números ---------- */
  const soma = (comps, k) => Object.values(comps || {}).reduce((t, c) => t + (c[k] || 0), 0);
  const p90 = (v, min) => (min ? ((v * 90) / min) : 0);
  const fmt = (v, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d).replace(".", ","));
  const jogoObj = (campos, row) => Object.fromEntries(campos.map((k, i) => [k, row[i]]));
  const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  function oppHTML(o, n = 22) {
    if (o && byId[o]) return `${crest(byId[o], n)}<b>${byId[o].abbr}</b>`;
    return `${window.GFX.crestOutro(o || "Adversário", null, n)}<b>${esc(o || "Adversário")}</b>`;
  }
  const res = (j) => (j.gf == null || j.ga == null ? "" : j.gf > j.ga ? "V" : j.gf < j.ga ? "D" : "E");
  function avatar(p, j, c, n = 120) {
    if (j?.foto?.url) return `<span class="jg-av${j.foto.privada && !j.foto.recorte ? " foto-priv" : ""}" style="--tc:${display(c)};width:${n}px;height:${n}px">${window.GFX.fotoImg(j.foto, `Foto de ${p.nome}`)}</span>`;
    const reserva = window.GFX.imgReserva(window.GFX.fotosJogador(p.cid, String(p.key || p.id || "").split("-")[0]).filter((u) => /espncdn/.test(u)), `Foto de ${p.nome}`);
    return `<span class="jg-av sem${reserva ? " tem-foto" : ""}" style="--tc:${display(c)};width:${n}px;height:${n}px;background:${display(c)};color:${onColor(display(c))}"><b style="font-size:${Math.round(n * 0.38)}px">${p.num ?? ""}</b>${reserva}</span>`;
  }
  const fonteFoto = (f) => (f?.fonte === "Flickr" ? "Flickr" : "Wikimedia Commons");
  const credito = (j) => (j?.foto?.privada ? (j.foto.fonte === "Flickr" && j.foto.pagina ? `<a class="jg-cred" href="${esc(j.foto.pagina)}" target="_blank" rel="noopener noreferrer">Foto: ${esc(j.foto.autor)} · Flickr · uso privado</a>` : `<span class="jg-cred">Foto: ${esc(j.foto.fonte === "Clube" ? "site oficial do clube" : j.foto.fonte || "TheSportsDB")} · uso privado</span>`) : j?.foto ?`<a class="jg-cred" href="${esc(j.foto.pagina || "#")}" target="_blank" rel="noopener noreferrer">Foto: ${esc(j.foto.autor)} · ${esc(j.foto.licenca)} · ${fonteFoto(j.foto)}${j.foto.data ? ` · ${j.foto.data.split("-").reverse().join("/")}` : ""}</a>` : "");

  /* ---------- mapa de calor (campo deitado, atacando para a direita) ---------- */
  const campoSVG = `<svg class="jg-campo-linhas" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".45">
    <rect x=".5" y=".5" width="104" height="67"/><line x1="52.5" y1=".5" x2="52.5" y2="67.5"/><circle cx="52.5" cy="34" r="9.15"/>
    <rect x=".5" y="13.85" width="16.5" height="40.3"/><rect x="88" y="13.85" width="16.5" height="40.3"/><rect x=".5" y="24.85" width="5.5" height="18.3"/><rect x="99" y="24.85" width="5.5" height="18.3"/>
    <path d="M17 26.7 A9.15 9.15 0 0 1 17 41.3 M88 26.7 A9.15 9.15 0 0 0 88 41.3"/></g><circle cx="52.5" cy="34" r=".7" fill="currentColor"/></svg>`;
  function calorHTML(rotulo) {
    return `<div class="jg-campo" role="img" aria-label="${esc(rotulo)}">${campoSVG}<canvas class="jg-calor"></canvas><span class="jg-seta" aria-hidden="true">ataque →</span></div>`;
  }
  function pintaCalor(el, txt, grade) {
    const cv = el.querySelector("canvas");
    if (!cv || !window.HEATMAP) return;
    const blobs = HEATMAP.deGrade(txt, grade[0], grade[1]);
    // grade no ponto de vista do time (x = profundidade, y = lado); o canvas é o campo deitado: x da grade -> largura
    HEATMAP.paint(cv, blobs.map(([x, y, sx, sy, w]) => [x, y, sx, sy, w]), {});
  }

  /* ---------- linha do tempo da carreira, no fundo do topo ----------
     Os clubes por onde o jogador passou, em ordem, com os anos (dados/carreiras/<clube>.json: Wikipédia, ogol, Wikidata
     ou ESPN; escudos do site, da ESPN, do ogol ou desenhados). No estilo da faixa de notícias do site: a fita anda em
     looping (Web Animations API, como js/ticker.js) e cada escudo cresce ao passar pelo foco, um de cada vez. */
  const anoOk = (v) => (Number.isInteger(v) && v > 1900 && v < 2100 ? v : null);
  function anosDe(x, ultimo) {
    const i = anoOk(x.i), f = anoOk(x.f);
    if (!i) return ultimo ? "hoje" : f ? `até ${f}` : "";
    if (!f) return ultimo ? `desde ${i}` : `${i}–`;
    return f === i ? `${i}` : `${i}–${String(f).slice(2)}`;
  }
  const nomeDe = (x) => (x.s && byId[x.s] ? byId[x.s].name : String(x.c || ""));
  function itensHTML(lista) {
    return lista.map((x, i) => {
      const ultimo = i === lista.length - 1, site = x.s && byId[x.s], nome = nomeDe(x);
      const escudo = site ? crest(site, 38) : window.GFX.crestOutro(nome, typeof x.l === "string" ? x.l : null, 38);
      const anos = anosDe(x, ultimo), emp = x.e === 1 && !ultimo;
      const cls = [ultimo ? "atual" : "", emp ? "emp" : ""].filter(Boolean).join(" ");
      return `<li${cls ? ` class="${cls}"` : ""} title="${esc(nome)}${anos ? ` · ${esc(anos)}` : ""}${emp ? " · empréstimo" : ""}"><span class="jgl-esc">${escudo}</span><small>${esc(anos)}</small></li>`;
    }).join("");
  }
  function carreiraHTML(p, lista) {
    const clubes = new Set(lista.map((x) => x.s || x.q || x.c)).size; // ida e volta ao mesmo clube conta uma vez
    const resumo = lista.map((x, i) => {
      const anos = anosDe(x, i === lista.length - 1);
      return anos ? `${nomeDe(x)} (${anos})` : nomeDe(x);
    }).join(", ");
    return `<div class="jg-linha" role="img" aria-label="${esc(`Carreira de ${p.nome}: ${resumo}`)}">
      <div class="jgl-tag"><b>Carreira</b><span>${clubes} ${clubes === 1 ? "clube" : "clubes"}</span><a class="jgl-fonte" href="#/creditos" title="Fontes: Transfermarkt (transfermarkt-datasets, CC0), Wikipédia (CC BY-SA), Wikidata, ogol e ESPN">fontes</a></div>
      <div class="jgl-fita"><ol class="jgl-trilho">${itensHTML(lista)}</ol></div></div>`;
  }
  // fita em looping + foco: repete os clubes até cobrir a fita duas vezes e anda uma "volta" (a largura de uma cópia)
  function animaFita(linha, lista) {
    const fita = linha.querySelector(".jgl-fita"), trilho = linha.querySelector(".jgl-trilho");
    const parado = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const uma = trilho.scrollWidth;
    if (!uma || !fita.clientWidth) return;
    if (parado || !trilho.animate || lista.length < 2) { // um clube só: nada para passar na fita
      if (lista.length > 1) trilho.style.marginLeft = `${fita.clientWidth - uma}px`; // parado: o clube atual fica à direita
      return;
    }
    const copias = Math.max(2, Math.ceil((fita.clientWidth * 2) / uma) + 1);
    trilho.innerHTML = itensHTML(lista).repeat(copias);
    const passo = trilho.scrollWidth / copias; // largura exata de uma cópia
    const anim = trilho.animate([{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(${-passo}px, 0, 0)` }],
      { duration: Math.max(6000, (passo / 42) * 1000), iterations: Infinity, easing: "linear" });
    // foco: a cada quadro, o escudo mais perto do ponto de foco ganha a classe "foco" (cresce 45% por transição).
    // Sem medir a tela a cada quadro: o centro de cada escudo é lido uma vez e o deslocamento vem do relógio da animação.
    const itens = [...trilho.children], foco = 92, dur = anim.effect.getTiming().duration;
    const centros = itens.map((li) => li.offsetLeft + li.offsetWidth / 2);
    let atual = null;
    const quadro = () => {
      if (!linha.isConnected) return anim.cancel();
      const desloca = (((anim.currentTime || 0) % dur) / dur) * passo;
      let melhor = null, dist = 1e9;
      centros.forEach((c, k) => {
        const d = Math.abs(c - desloca - foco);
        if (d < dist) { dist = d; melhor = itens[k]; }
      });
      if (melhor !== atual) {
        atual?.classList.remove("foco");
        if (dist < 50) { melhor.classList.add("foco"); atual = melhor; } else atual = null;
      }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }
  async function pintaCarreira(el, p) {
    const d = await DADOS.carrega(`carreiras/${p.cid}`);
    if (!el.isConnected) return;
    const lista = Array.isArray(d?.[p.aid]) ? d[p.aid].filter((x) => x && (x.c || x.s)) : [];
    const topo = el.querySelector(".jg-topo");
    topo.querySelector(".jg-linha")?.remove();
    if (!lista.length) return topo.classList.remove("com-linha"); // jogador da base: sem linha do tempo
    topo.insertAdjacentHTML("afterbegin", carreiraHTML(p, lista));
    topo.classList.add("com-linha");
    setTimeout(() => animaFita(topo.querySelector(".jg-linha"), lista), 0); // depois do layout (rAF não roda em aba escondida)
  }

  /* ---------- páginas ---------- */
  const ABAS = [["geral", "Visão geral"], ["ultimos", "Últimos 10"], ["temporada", "Temporada"], ["calor", "Mapa de calor"], ["comparar", "Comparar"]];
  function page(aid, tab = "geral", extra) {
    const p = get(aid);
    if (!p) return `<div class="empty" style="padding:120px 0"><h1 class="display">Jogador não encontrado</h1><p>Ele pode ter saído do elenco. <a href="#/" style="color:var(--ink)">Voltar ao placar</a></p></div>`;
    if (!ABAS.some(([k]) => k === tab)) tab = "geral";
    const c = byId[p.cid];
    return `<div class="jg" data-jogador="${esc(p.key)}" data-aba="${tab}" data-extra="${esc(extra || "")}" style="--k1:${c.colors[0]};--tc:${display(c)}">
      <section class="jg-topo">
        <div class="jg-topo-av" data-jg-av>${avatar(p, null, c, 132)}</div>
        <div class="jg-topo-txt">
          <div class="eyebrow">${p.num != null ? `Camisa ${p.num} · ` : ""}${POS[p.pos] || "Jogador"}${p.idade ? ` · ${p.idade} anos` : ""}</div>
          <h1>${esc(p.nome)}</h1>
          <a class="jg-clube" href="#/clube/${c.id}">${crest(c, 26)}<span>${c.name}</span></a>
          <div data-jg-cred></div>
          ${window.COMPARTILHAR ? `<div class="cp-wrap">${COMPARTILHAR.botao("jogador", p.key)}</div>` : ""}
        </div>
        <div class="jg-topo-kpis" data-jg-kpis><span class="jg-load">Carregando a temporada…</span></div>
      </section>
      <div class="club-tabs"><div class="tabs" data-tabs><span class="tab-ink"></span>
        ${ABAS.map(([k, l]) => `<a class="tab ${k === tab ? "on" : ""}" href="#/jogador/${esc(p.key)}/${k}">${l}</a>`).join("")}
      </div></div>
      <div data-jg-corpo><div class="card"><div class="empty" style="padding:40px">Carregando as estatísticas…</div></div></div>
    </div>`;
  }

  function kpis(j) {
    const C = j.comps || {}, min = soma(C, "min");
    const k = (v, l, s = "") => `<div class="jg-k"><b>${v}</b><small>${l}</small>${s ? `<em>${s}</em>` : ""}</div>`;
    return k(soma(C, "j"), "jogos", `${soma(C, "tit")} como titular`) + k(min.toLocaleString("pt-BR"), "minutos") + k(soma(C, "g"), "gols", min ? `${fmt(p90(soma(C, "g"), min), 2)} por 90 min` : "") + k(soma(C, "a"), "assistências");
  }

  // linha de estatística comparável: [rótulo, chave, por 90?]
  const LINHAS = [["Jogos", "j"], ["Titular", "tit"], ["Minutos", "min"], ["Gols", "g", 1], ["Assistências", "a", 1], ["Finalizações", "ch", 1], ["No alvo", "alvo", 1], ["xG (chances)", "xg", 1],
    ["Ações com bola no campo", "toques", 1], ["Passes", "passes", 1], ["Cruzamentos", "cruz", 1], ["Dribles tentados", "dribles", 1], ["Desarmes", "desarmes", 1],
    ["Interceptações", "intercept", 1], ["Cortes", "cortes", 1], ["Chutes bloqueados", "bloq", 1], ["Duelos aéreos", "aereos", 1], ["Perdas de posse", "perdas", 1], ["Defesas (goleiro)", "defesas", 1],
    ["Amarelos", "ca"], ["Vermelhos", "cv"]];

  // gols do Brasileirão iguais em todo o site: vale o número da artilharia oficial (o mesmo da home e da tabela); o que as
  // súmulas somam fica guardado em gSumulas para a nota logo abaixo da tabela
  function oficial(p, j) {
    if (!j?.comps?.["Brasileirão"]) return j;
    const id = String(p.id || p.aid || String(p.key || "").split("-")[0]);
    const a = (window.PLAYER_STATS?.artilheiros || []).find((x) => String(x.id) === id);
    const br = j.comps["Brasileirão"];
    if (!a || a.gols == null || a.gols === br.g) return j;
    return { ...j, comps: { ...j.comps, "Brasileirão": { ...br, g: a.gols, gSumulas: br.g } } };
  }
  // a artilharia (home, tabela) usa o número oficial da ESPN; esta tabela soma as súmulas jogo a jogo. Quando os dois
  // não batem (gol revisado, contra ou contestado), a diferença fica explicada aqui, como na ficha do artilheiro
  function notaArtilharia(p, C) {
    const id = String(p.id || String(p.key || "").split("-")[0]);
    const a = (window.PLAYER_STATS?.artilheiros || []).find((x) => String(x.id) === id);
    const sum = C["Brasileirão"]?.gSumulas;
    if (!a || sum == null || a.gols === sum) return "";
    return `<p class="source jg-nota-art">Gols no Brasileirão pela artilharia oficial (ESPN): <b>${a.gols}</b>, o mesmo número da artilharia do site. As súmulas jogo a jogo registram ${sum} (gol revisado depois do jogo, contra ou contestado entra numa conta e não na outra).</p>`;
  }
  function geral(p, j, D) {
    const C = j.comps || {}, comps = Object.keys(C);
    const jogos = (j.jogos || []).map((r) => jogoObj(D.campos, r)), ult = jogos.slice(-5).reverse();
    const tabela = comps.length ? `<div class="jg-tab-wrap"><table class="table jg-tab"><thead><tr><th>Competição</th><th>J</th><th>Min</th><th>G</th><th>A</th><th class="hide-sm">Fin.</th><th class="hide-sm">No alvo</th><th class="hide-sm">CA</th><th class="hide-sm">CV</th></tr></thead>
      <tbody>${comps.map((k) => `<tr><td class="club">${esc(k)}</td><td>${C[k].j}</td><td>${C[k].min}</td><td>${C[k].g}</td><td>${C[k].a}</td><td class="hide-sm">${C[k].ch}</td><td class="hide-sm">${C[k].alvo}</td><td class="hide-sm">${C[k].ca}</td><td class="hide-sm">${C[k].cv}</td></tr>`).join("")}
      ${comps.length > 1 ? `<tr class="jg-tot"><td class="club">Total</td>${["j", "min", "g", "a"].map((k) => `<td>${soma(C, k)}</td>`).join("")}${["ch", "alvo", "ca", "cv"].map((k) => `<td class="hide-sm">${soma(C, k)}</td>`).join("")}</tr>` : ""}</tbody></table></div>` : `<div class="empty" style="padding:24px">Ainda sem jogos nesta temporada.</div>`;
    const min = soma(C, "min");
    const por90 = [["xG (chances)", "xg"], ["Ações com bola", "toques"], ["Passes", "passes"], ["Finalizações", "ch"], ["Dribles tentados", "dribles"], ["Desarmes", "desarmes"], ["Interceptações", "intercept"]]
      .map(([l, k]) => `<li><b>${fmt(p90(soma(C, k), min))}</b><span>${l}</span></li>`).join("");
    return `<div class="grid-2 jg-grid">
      <div>
        <div class="card"><div class="card-h">Temporada por competição <small>${D.updated ? `atualizado em ${esc(D.updated)}` : ""}</small></div>${tabela}${notaArtilharia(p, C)}</div>
        <div class="card"><div class="card-h">Por 90 minutos <small>todas as competições</small></div><ul class="jg-p90">${min ? por90 : `<li class="empty">Sem minutos em campo.</li>`}</ul></div>
        <div class="card"><div class="card-h">Últimos jogos <small><a href="#/jogador/${esc(p.key)}/ultimos" style="color:var(--ink)">ver os 10 ›</a></small></div>
          <ul class="jg-ult">${ult.map((x) => `<li><span class="jg-d">${dm(x.date)}</span><span class="jg-o">${oppHTML(x.opp)}</span><span class="jg-s ${res(x)}">${x.gf ?? "–"}–${x.ga ?? "–"}</span><span class="jg-m">${x.min}'</span>${notaBotao(x, p.pos)}<span class="jg-ga">${x.g ? `⚽${x.g > 1 ? `×${x.g}` : ""}` : ""}${x.a ? ` 🅰${x.a > 1 ? `×${x.a}` : ""}` : ""}</span></li>`).join("") || `<li class="empty">Sem jogos.</li>`}</ul></div>
      </div>
      <div>
        <div class="card"><div class="card-h">Mapa de calor <small>${j.lances ? `${j.lances.toLocaleString("pt-BR")} ações na temporada` : "sem lances registrados"}</small></div>
          ${j.lances ? calorHTML(`Mapa de calor de ${p.nome} na temporada`) : `<div class="empty" style="padding:24px">A ESPN não registrou lances com posição para este jogador.</div>`}
          <div class="source">Cada passe, desarme, cruzamento, drible e finalização com posição no campo (lances da ESPN) · <a href="#/jogador/${esc(p.key)}/calor" style="color:var(--ink)">mapa completo ›</a></div></div>
      </div></div>`;
  }

  function linhaJogo(x, cols, pos) {
    return `<tr><td>${dm(x.date)}</td><td class="hide-sm">${esc(x.comp)}</td><td class="club"><span class="jg-o">${x.home ? "" : "@ "}${oppHTML(x.opp, 20)}</span></td><td><span class="jg-s ${res(x)}">${x.gf ?? "–"}–${x.ga ?? "–"}</span></td>${cols.map(([k, hide]) => `<td${hide ? ' class="hide-sm"' : ""}>${k === "nota" ? notaBotao(x, pos) : k === "min" ? `${x.min}'${x.tit ? "" : "<small> (entrou)</small>"}` : (x[k] ?? 0)}</td>`).join("")}</tr>`;
  }
  const COLS = [["nota"], ["min"], ["g"], ["a"], ["ch", 1], ["alvo", 1], ["toques", 1], ["passes", 1], ["desarmes", 1], ["intercept", 1], ["dribles", 1], ["ca", 1], ["cv", 1]];
  const CAB = ["Nota", "Min", "G", "A", "Fin.", "Alvo", "Ações", "Passes", "Desarm.", "Interc.", "Dribles", "CA", "CV"];
  /* nota de 3 a 10 com a cor dos apps de placar: vermelho (abaixo de 6), laranja, amarelo, verde, azul (8+) */
  const corNota = (n) => (n == null ? "" : n >= 8 ? "n-top" : n >= 7 ? "n-boa" : n >= 6.5 ? "n-ok" : n >= 6 ? "n-med" : "n-ruim");
  const notaHTML = (n, vivo) => (n == null ? `<span class="nota n-sem" title="Menos de 10 minutos em campo">–</span>` : `<span class="nota ${corNota(n)}${vivo ? " vivo" : ""}" title="${vivo ? "Ao vivo: muda durante o jogo" : "Nota do CazéStats.TV"}">${n.toFixed(1).replace(".", ",")}</span>`);
  /* "Por que essa nota?" (js/nota.js): a nota vira botão; ao tocar, abre logo abaixo a conta parte por parte */
  const CAMPOS_NOTA = ["min", "g", "a", "ch", "alvo", "dribles", "cruz", "toques", "desarmes", "intercept", "cortes", "aereos", "defesas", "bloq", "ga", "gf", "perdas", "ca", "cv"];
  const notaBotao = (x, pos) => (x.nota == null || !window.NOTA ? notaHTML(x.nota, x.vivo)
    : `<button type="button" class="nota-exp" data-nota-x="${esc(JSON.stringify(Object.fromEntries(CAMPOS_NOTA.map((k) => [k, x[k] ?? null]))))}" data-pos="${esc(pos || "M")}" aria-expanded="false" title="Por que essa nota?" aria-label="Nota ${String(x.nota).replace(".", ",")}: ver por que">${notaHTML(x.nota, x.vivo)}</button>`);
  const v1 = (n) => `${n > 0 ? "+" : "−"}${Math.abs(n).toFixed(Math.abs(n) < 0.1 ? 2 : 1).replace(".", ",")}`;
  function painelNota(x, pos) {
    const r = window.NOTA.explica(x, pos);
    if (r.nota == null) return `<p>${esc(r.motivo)}</p>`;
    const max = Math.max(0.01, ...r.itens.map((i) => Math.abs(i.valor)));
    const mostra = r.itens.slice(0, 9), resto = r.itens.slice(9);
    const linha = (i) => `<li class="${i.valor > 0 ? "mais" : "menos"}"><span>${esc(i.rotulo)}</span><i style="--w:${Math.round((Math.abs(i.valor) / max) * 100)}%"></i><b>${v1(i.valor)}</b></li>`;
    return `<p class="ne-topo">Parte de <b>6,0</b>${r.itens.length ? " e muda com o que o jogador fez:" : "; nada mudou a nota neste jogo."}</p>
      <ul class="ne-lista">${mostra.map(linha).join("")}${resto.length ? `<li class="ne-resto"><span>Mais ${resto.length} detalhe${resto.length > 1 ? "s" : ""} pequeno${resto.length > 1 ? "s" : ""}</span><i></i><b>${v1(resto.reduce((t, i) => t + i.valor, 0))}</b></li>` : ""}</ul>
      <p class="ne-fim">Nota ${String(r.nota).replace(".", ",")}${r.limite === "teto" ? " (a conta passou de 10; a nota vai até 10)" : r.limite === "piso" ? " (a conta ficou abaixo de 3; a nota vai de 3 a 10)" : ""} · critérios do CazéStats.TV, os mesmos para todos</p>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".nota-exp");
    if (!b) return;
    e.preventDefault();
    const dono = b.closest("tr, li");
    if (!dono) return;
    const aberto = b.getAttribute("aria-expanded") === "true";
    const atual = dono.tagName === "TR" ? dono.nextElementSibling?.classList.contains("ne-linha") && dono.nextElementSibling : dono.querySelector(":scope > .ne-painel");
    if (atual) atual.remove();
    b.setAttribute("aria-expanded", String(!aberto));
    if (aberto) return;
    let x;
    try { x = JSON.parse(b.dataset.notaX); } catch { return; }
    const id = `ne-${Math.random().toString(36).slice(2, 8)}`;
    b.setAttribute("aria-controls", id);
    const html = `<div class="ne-painel" id="${id}" role="region" aria-label="Por que essa nota">${painelNota(x, b.dataset.pos)}</div>`;
    if (dono.tagName === "TR") dono.insertAdjacentHTML("afterend", `<tr class="ne-linha"><td colspan="${dono.children.length}">${html}</td></tr>`);
    else dono.insertAdjacentHTML("beforeend", html);
  });
  const mediaNota = (jogos) => { const xs = jogos.filter((x) => x.nota != null); return xs.length ? xs.reduce((t, x) => t + x.nota, 0) / xs.length : null; };
  const cab = (extra = "") => `<thead><tr><th>Data</th><th class="hide-sm">Competição</th><th>Adversário</th><th>Placar</th>${CAB.map((h, i) => `<th${COLS[i][1] ? ' class="hide-sm"' : ""}>${h}</th>`).join("")}${extra}</tr></thead>`;

  function ultimos(p, j, D) {
    const jogos = (j.jogos || []).map((r) => jogoObj(D.campos, r)).slice(-10);
    if (!jogos.length) return `<div class="card"><div class="empty" style="padding:40px">Ainda sem jogos nesta temporada.</div></div>`;
    const tot = (k) => jogos.reduce((t, x) => t + (x[k] || 0), 0), min = tot("min");
    const max = Math.max(1, ...jogos.map((x) => x.toques || 0));
    const barras = jogos.map((x) => `<li title="${dm(x.date)} · ${x.toques} ações · ${x.min} min"><i style="height:${Math.max(4, Math.round(((x.toques || 0) / max) * 100))}%"></i><span>${dm(x.date)}</span></li>`).join("");
    const mn = mediaNota(jogos);
    return `<div class="kpis jg-kpis10">${mn != null ? `<div class="kpi"><small>Nota média</small><b>${notaHTML(Math.round(mn * 10) / 10)}</b><em>nos últimos ${jogos.length} jogos</em></div>` : ""}${[["Jogos", jogos.length], ["Minutos", min], ["Gols", tot("g")], ["Assistências", tot("a")]].map(([l, v]) => `<div class="kpi"><small>${l}</small><b>${v}</b><em>${l === "Minutos" ? `média de ${Math.round(min / jogos.length)} por jogo` : l === "Jogos" ? `${tot("tit")} como titular` : `${fmt(p90(v, min), 2)} por 90 min`}</em></div>`).join("")}</div>
      <div class="grid-2 jg-grid">
        <div class="card"><div class="card-h">Jogo a jogo <small>do mais recente ao mais antigo</small></div>
          <div class="jg-tab-wrap"><table class="table jg-tab jg-jogos">${cab()}<tbody>${jogos.slice().reverse().map((x) => linhaJogo(x, COLS, p.pos)).join("")}</tbody></table></div>
          <div class="source">Ações = toda ação com bola registrada com posição no campo (passe, desarme, cruzamento, drible, finalização...). Fonte: ESPN.</div></div>
        <div>
          <div class="card"><div class="card-h">Ações com bola por jogo</div><ol class="jg-barras">${barras}</ol></div>
          <div class="card"><div class="card-h">Mapa de calor <small>últimos 10 jogos</small></div>${j.calor10 ? calorHTML(`Mapa de calor de ${p.nome} nos últimos 10 jogos`) : `<div class="empty" style="padding:24px">Sem lances com posição nesses jogos.</div>`}</div>
        </div></div>`;
  }

  function temporada(p, j, D, filtro) {
    const todos = (j.jogos || []).map((r) => jogoObj(D.campos, r));
    const comps = ["Todas", ...new Set(todos.map((x) => x.comp))];
    if (!comps.includes(filtro)) filtro = "Todas";
    const lista = todos.filter((x) => filtro === "Todas" || x.comp === filtro);
    let mes = "", linhas = "";
    for (const x of lista.slice().reverse()) {
      const m = `${MESES[+x.date.slice(5, 7) - 1]} ${x.date.slice(0, 4)}`;
      if (m !== mes) { mes = m; linhas += `<tr class="jg-mes"><td colspan="16">${m}</td></tr>`; }
      linhas += linhaJogo(x, COLS, p.pos);
    }
    const antes = j.antes?.length ? `<p class="jg-antes">Também jogou por ${j.antes.map(([cid, n]) => `${crest(byId[cid], 18)} ${byId[cid].abbr} (${n} jogo${n > 1 ? "s" : ""})`).join(", ")} nesta temporada.</p>` : "";
    return `<div class="card"><div class="card-h">Jogos da temporada pelo ${byId[p.cid].abbr} <small>${lista.length} jogo${lista.length === 1 ? "" : "s"}</small></div>
      <div class="chips jg-chips">${comps.map((k) => `<button type="button" class="chip ${k === filtro ? "on" : ""}" data-jg-filtro="${esc(k)}">${esc(k)}</button>`).join("")}</div>${antes}
      ${lista.length ? `<div class="jg-tab-wrap"><table class="table jg-tab jg-jogos">${cab()}<tbody>${linhas}</tbody></table></div>` : `<div class="empty" style="padding:24px">Sem jogos.</div>`}
      <div class="source">Todas as competições com súmula na ESPN (Brasileirão, Copa do Brasil, Libertadores, Sul-Americana e estaduais cobertos) · placar do ponto de vista do ${byId[p.cid].abbr}</div></div>`;
  }

  function calor(p, j, D) {
    const g = D.grade || [24, 16], z = (t) => window.HEATMAP ? HEATMAP.zonas(t, g[0], g[1]) : { tercos: [0, 0, 0], lados: [0, 0, 0] };
    const bloco = (titulo, txt, rot) => {
      if (!txt) return `<div class="card"><div class="card-h">${titulo}</div><div class="empty" style="padding:24px">Sem lances com posição no campo.</div></div>`;
      const Z = z(txt);
      return `<div class="card"><div class="card-h">${titulo}</div>${calorHTML(rot).replace('class="jg-campo"', `class="jg-campo grande" data-grade="${titulo.includes("10") ? "calor10" : "calor"}"`)}
        <div class="jg-zonas"><div><h5>Profundidade</h5><ul>${["Defesa", "Meio", "Ataque"].map((l, i) => `<li><span>${l}</span><i style="--p:${Z.tercos[i]}%"></i><b>${Z.tercos[i]}%</b></li>`).join("")}</ul></div>
          <div><h5>Faixa do campo</h5><ul>${["Esquerda", "Centro", "Direita"].map((l, i) => `<li><span>${l}</span><i style="--p:${Z.lados[i]}%"></i><b>${Z.lados[i]}%</b></li>`).join("")}</ul></div></div></div>`;
    };
    return `<div class="jg-calor-pg">${bloco(`Temporada · ${(j.lances || 0).toLocaleString("pt-BR")} ações`, j.calor, `Mapa de calor de ${p.nome} na temporada`)}${bloco("Últimos 10 jogos", j.calor10, `Mapa de calor de ${p.nome} nos últimos 10 jogos`)}</div>
      <div class="source">Como é feito: cada ação do jogador com posição registrada (passe, desarme, cruzamento, drible, corte, duelo aéreo, finalização) vira um ponto no campo, do ponto de vista do time (atacando para a direita). Fonte: lances da ESPN, em todas as competições com cobertura lance a lance.</div>`;
  }

  /* sugestões de comparação: quem disputa a mesma posição no clube e no rival do clube */
  function sugestoes(p, outroKey) {
    const I = [...indice().values()].filter((x) => x.pos === p.pos && x.key !== p.key && x.key !== outroKey);
    const rival = byId[p.cid]?.rival;
    const doClube = I.filter((x) => x.cid === p.cid).slice(0, 3), doRival = rival ? I.filter((x) => x.cid === rival).slice(0, 3) : [];
    const chip = (x) => `<a class="jg-sug" href="#/jogador/${esc(p.key)}/comparar/${esc(x.key)}">${crest(byId[x.cid], 18)}<span>${esc(x.nome)}</span></a>`;
    return doClube.length || doRival.length ? `<div class="jg-sugs">${doClube.length ? `<span class="jg-sug-t">Disputa de posição no ${esc(byId[p.cid].abbr)}</span>${doClube.map(chip).join("")}` : ""}${doRival.length ? `<span class="jg-sug-t">Mesma posição no rival</span>${doRival.map(chip).join("")}` : ""}</div>` : "";
  }
  /* radar de perfil: seis dimensões por 90 minutos, cada uma comparada com o maior valor dos dois */
  function perfil(a, b, ma, mb) {
    const v = (C, m) => {
      const s = (k) => soma(C, k), q = (x) => p90(x, m);
      const passes = s("passes"), perdas = s("perdas");
      return [q(s("g") * 3 + s("alvo")), q(s("a") * 3 + s("cruz") * 0.5 + passes * 0.05), q(s("dribles")), q(s("desarmes") + s("intercept") + s("cortes")), q(s("aereos")), passes + perdas ? passes / (passes + perdas) : 0];
    };
    const A = v(a, ma), B = v(b, mb), EIXOS = ["Ataque", "Criação", "Drible", "Defesa", "Jogo aéreo", "Posse segura"];
    const R = 70, cx = 110, cy = 92, pt = (i, f) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 6; return [cx + Math.cos(ang) * R * f, cy + Math.sin(ang) * R * f]; };
    const norm = A.map((x, i) => Math.max(x, B[i]) || 1);
    const poli = (V) => V.map((x, i) => pt(i, Math.max(0.06, x / norm[i])).map((n) => n.toFixed(1)).join(",")).join(" ");
    const grade = [0.33, 0.66, 1].map((f) => `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => pt(i, f).map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="currentColor" stroke-opacity=".15"/>`).join("");
    const rot = EIXOS.map((e, i) => { const [x, y] = pt(i, 1.22); return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" fill-opacity=".75">${e}</text>`; }).join("");
    return { svg: (corA, corB) => `<svg class="jg-radar" viewBox="0 0 220 190" role="img" aria-label="Perfil dos dois jogadores">${grade}
      <polygon points="${poli(A)}" fill="${corA}" fill-opacity=".28" stroke="${corA}" stroke-width="2"/><polygon points="${poli(B)}" fill="${corB}" fill-opacity=".22" stroke="${corB}" stroke-width="2" stroke-dasharray="4 3"/>${rot}</svg>`, A, B };
  }

  function comparar(p, j, D, outroId, J2, D2) {
    const o = outroId && get(outroId);
    const escolha = `<div class="card jg-escolha"><div class="card-h">Comparar ${esc(p.nome)} com…</div>
      <div class="jg-busca"><input type="search" data-jg-cmp placeholder="Nome do jogador" aria-label="Jogador para comparar" autocomplete="off" /><div class="jg-busca-res" data-jg-cmp-res role="listbox"></div></div>
      ${sugestoes(p, o?.key)}
      <p class="source" style="margin-top:8px">Qualquer jogador dos 20 clubes. Os números são por 90 minutos, para comparar quem jogou mais e quem jogou menos.</p></div>`;
    if (!o) return escolha;
    if (!J2) return escolha + `<div class="card"><div class="empty" style="padding:30px">Carregando ${esc(o.nome)}…</div></div>`;
    const a = j.comps || {}, b = J2.comps || {}, ma = soma(a, "min"), mb = soma(b, "min");
    const ca = byId[p.cid], cb = byId[o.cid];
    const rows = LINHAS.map(([l, k, por]) => {
      const va = por ? p90(soma(a, k), ma) : soma(a, k), vb = por ? p90(soma(b, k), mb) : soma(b, k), mx = Math.max(va, vb) || 1;
      const melhor = k === "perdas" || k === "ca" || k === "cv" ? (va < vb ? "a" : vb < va ? "b" : "") : (va > vb ? "a" : vb > va ? "b" : "");
      return `<li class="${melhor ? `m-${melhor}` : ""}"><b>${fmt(va, por ? 2 : 0)}</b><span class="jg-cl"><span>${l}${por ? " <small>/90</small>" : ""}</span><span class="jg-cb"><i style="--p:${(va / mx) * 100}%;--c:${display(ca)}"></i><i style="--p:${(vb / mx) * 100}%;--c:${display(cb)}"></i></span></span><b>${fmt(vb, por ? 2 : 0)}</b></li>`;
    }).join("");
    const lado = (q, J, c) => `<a class="jg-cmp-t" href="#/jogador/${esc(q.key)}">${avatar(q, J, c, 84)}<b>${esc(q.nome)}</b><small>${crest(c, 18)} ${c.abbr} · ${POS[q.pos] || ""}</small></a>`;
    // veredito: em quantos números por 90 minutos cada um é melhor (cartões e perdas: menos é melhor)
    let va = 0, vb = 0;
    for (const [, k, por] of LINHAS) {
      if (!por || (!soma(a, k) && !soma(b, k))) continue;
      const x = p90(soma(a, k), ma), y = p90(soma(b, k), mb), menos = k === "perdas";
      if (x !== y) ((menos ? x < y : x > y) ? va++ : vb++);
    }
    const na = mediaNota((j.jogos || []).map((r) => jogoObj(D.campos, r))), nb = J2 && D2 ? mediaNota((J2.jogos || []).map((r) => jogoObj(D2.campos, r))) : null;
    const veredito = va === vb ? "Empate técnico nos números por 90 minutos" : `${va > vb ? p.nome : o.nome} é melhor em ${Math.max(va, vb)} de ${va + vb} números por 90 minutos`;
    const rad = perfil(a, b, ma, mb);
    const corA = display(ca), corB = display(cb) === corA ? "var(--accent)" : display(cb); // mesma cor nos dois clubes: o segundo usa a cor do site
    return escolha + `<div class="card jg-cmp" data-cmp-a="${esc(p.key)}" data-cmp-b="${esc(o.key)}"><div class="jg-cmp-top">${lado(p, j, ca)}<span class="jg-vs">×</span>${lado(o, J2, cb)}</div>
      <p class="jg-veredito" data-cmp-veredito>${esc(veredito)}</p>
      <div class="jg-cmp-extra">
        <div class="jg-cmp-notas"><div><b>${na == null ? "–" : notaHTML(Math.round(na * 10) / 10)}</b><small>nota média</small></div><div><b>${nb == null ? "–" : notaHTML(Math.round(nb * 10) / 10)}</b><small>nota média</small></div></div>
        <figure class="jg-cmp-radar">${rad.svg(corA, corB)}<figcaption><span><i style="background:${corA}"></i>${esc(p.nome)}</span><span><i class="tracejado" style="border-color:${corB}"></i>${esc(o.nome)}</span></figcaption></figure>
        <div class="jg-cmp-carreira" data-cmp-carreira><small>Carregando a carreira…</small></div>
      </div>
      ${window.COMPARTILHAR ? `<div class="cp-wrap">${COMPARTILHAR.botao("comparacao", `${p.key}|${o.key}`)}</div>` : ""}
      <ul class="jg-cmp-l">${rows}</ul>
      <div class="jg-cmp-calor"><div><h5>${esc(p.nome)}</h5>${j.calor ? calorHTML(`Mapa de calor de ${p.nome}`).replace('class="jg-campo"', 'class="jg-campo" data-grade="calor" data-de="a"') : `<p class="empty">Sem lances.</p>`}</div>
        <div><h5>${esc(o.nome)}</h5>${J2.calor ? calorHTML(`Mapa de calor de ${o.nome}`).replace('class="jg-campo"', 'class="jg-campo" data-grade="calor" data-de="b"') : `<p class="empty">Sem lances.</p>`}</div></div>
      <div class="source">Temporada inteira, todas as competições com súmula na ESPN · por 90 min = valor x 90 ÷ minutos jogados</div></div>`;
  }

  async function carreirasLadoALado(corpo, p, o) {
    const el = corpo.querySelector("[data-cmp-carreira]");
    if (!el) return;
    const [ca, cb] = await Promise.all([DADOS.carrega(`carreiras/${p.cid}`), DADOS.carrega(`carreiras/${o.cid}`)]);
    const resumo = (q, d) => {
      const l = Array.isArray(d?.[q.aid]) ? d[q.aid] : [];
      const nomes = [...new Set(l.map((x) => (x.s && byId[x.s] ? byId[x.s].abbr : x.c)).filter(Boolean))];
      const desde = l.map((x) => x.i).filter(Number.isInteger).sort()[0];
      return nomes.length ? `<div><b>${nomes.length} ${nomes.length === 1 ? "clube" : "clubes"}${desde ? ` · desde ${desde}` : ""}</b><small>${esc(nomes.join(" → "))}</small></div>` : `<div><b>–</b><small>carreira não encontrada</small></div>`;
    };
    if (el.isConnected) el.innerHTML = `<h5>Carreira</h5><div class="jg-cmp-car">${resumo(p, ca)}${resumo(o, cb)}</div>`;
  }

  /* ---------- montar (depois que a página foi desenhada) ---------- */
  const estado = { filtro: "Todas" };
  async function mount(root) {
    const el = root.querySelector("[data-jogador]");
    if (!el) return;
    const p = get(el.dataset.jogador), c = byId[p.cid], aba = el.dataset.aba;
    const D = await HEATMAP.carregaClube(p.cid);
    if (!el.isConnected) return;
    const j = oficial(p, D?.jogadores?.[p.aid]);
    const corpo = el.querySelector("[data-jg-corpo]");
    pintaCarreira(el, p).catch(() => {}); // linha do tempo da carreira (fundo do topo); sem dados, nada aparece
    if (!j) {
      el.querySelector("[data-jg-kpis]").innerHTML = "";
      corpo.innerHTML = `<div class="card"><div class="empty" style="padding:40px">Ainda não há estatísticas deste jogador na temporada.</div></div>`;
      return;
    }
    el.querySelector("[data-jg-av]").innerHTML = avatar(p, j, c, 132);
    el.querySelector("[data-jg-cred]").innerHTML = credito(j);
    el.querySelector("[data-jg-kpis]").innerHTML = kpis(j);
    let J2 = null, D2 = null;
    const outro = el.dataset.extra && get(el.dataset.extra);
    if (aba === "comparar" && outro) {
      corpo.innerHTML = comparar(p, j, D, outro.aid, null);
      D2 = await HEATMAP.carregaClube(outro.cid);
      if (!el.isConnected) return;
      J2 = D2?.jogadores?.[outro.aid] || { comps: {}, jogos: [] };
    }
    corpo.innerHTML = aba === "ultimos" ? ultimos(p, j, D) : aba === "temporada" ? temporada(p, j, D, estado.filtro) : aba === "calor" ? calor(p, j, D) : aba === "comparar" ? comparar(p, j, D, outro?.aid, J2, D2) : geral(p, j, D);
    requestAnimationFrame(() => pintar(corpo, j, D, J2, D2));
    if (aba === "comparar" && outro && J2) carreirasLadoALado(corpo, p, outro).catch(() => {});
    ligar(el, p, j, D);
  }
  function pintar(corpo, j, D, J2, D2) {
    corpo.querySelectorAll(".jg-campo").forEach((cp) => {
      const de = cp.dataset.de === "b" ? J2 : j, grade = (cp.dataset.de === "b" ? D2 : D)?.grade || [24, 16];
      pintaCalor(cp, de?.[cp.dataset.grade || (corpo.closest("[data-aba]")?.dataset.aba === "ultimos" ? "calor10" : "calor")], grade);
    });
  }
  function ligar(el, p, j, D) {
    el.querySelectorAll("[data-jg-filtro]").forEach((b) => b.addEventListener("click", () => {
      estado.filtro = b.dataset.jgFiltro;
      el.querySelector("[data-jg-corpo]").innerHTML = temporada(p, j, D, estado.filtro);
      ligar(el, p, j, D);
    }));
    const inp = el.querySelector("[data-jg-cmp]"), box = el.querySelector("[data-jg-cmp-res]");
    if (inp) {
      inp.addEventListener("input", () => {
        const r = busca(inp.value, 8).filter((x) => x.key !== p.key);
        box.innerHTML = r.map((x) => `<a href="#/jogador/${esc(p.key)}/comparar/${esc(x.key)}" role="option">${crest(byId[x.cid], 22)}<b>${esc(x.nome)}</b><small>${byId[x.cid].abbr}${x.num != null ? ` · ${x.num}` : ""} · ${POS[x.pos] || ""}</small></a>`).join("") || (inp.value.trim().length >= 2 ? `<div class="empty" style="padding:10px">Nenhum jogador encontrado.</div>` : "");
        box.classList.toggle("open", !!box.innerHTML);
      });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = box.querySelector("a"); if (a) location.hash = a.getAttribute("href"); } });
    }
  }
  // tamanho da tela mudou: redesenha os mapas
  let rz = 0;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { const el = document.querySelector("[data-jogador]"); if (el) { const p = get(el.dataset.jogador), D = window.JOGADORES_CLUBE?.[p?.cid]; const j = D?.jogadores?.[p.aid]; const o = el.dataset.extra && get(el.dataset.extra); const D2 = o && window.JOGADORES_CLUBE?.[o.cid]; if (j) pintar(el, j, D, D2?.jogadores?.[o.aid], D2); } }, 200); });

  /* notas da partida: o time (nota coletiva) e cada jogador, para os dois clubes (página do jogo) */
  async function montaNotas(root) {
    const el = root.querySelector("[data-notas-partida]");
    if (!el || el.dataset.ok) return;
    el.dataset.ok = "1";
    const eid = el.dataset.notasPartida, lados = [el.dataset.h, el.dataset.a];
    const Ds = await Promise.all(lados.map((c) => HEATMAP.carregaClube(c)));
    if (!el.isConnected) return;
    const blocos = lados.map((cid, i) => {
      const D = Ds[i], c = byId[cid];
      if (!D || !D.campos?.includes("nota")) return "";
      const linhas = Object.entries(D.jogadores || {}).map(([aid, r]) => { const row = (r.jogos || []).find((x) => String(x[0]) === String(eid)); return row ? { aid, r, x: jogoObj(D.campos, row) } : null; }).filter(Boolean)
        .sort((a, b) => (b.x.tit - a.x.tit) || ((b.x.nota ?? 0) - (a.x.nota ?? 0)));
      if (!linhas.length) return "";
      const t = D.notasTime?.[eid];
      return `<div class="np-time"><div class="np-cab">${crest(c, 26)}<b>${esc(c.name)}</b>${t ? `${notaHTML(t[0])}<small>nota do time</small>` : ""}</div>
        <ul class="np-lista">${linhas.map(({ aid, r, x }) => `<li class="${t && t[1] === aid ? "melhor" : ""}"><a href="#/jogador/${aid}-${cid}">${esc(r.n)}</a><small>${x.min}'${x.tit ? "" : " (entrou)"}${x.g ? ` · ${x.g} ${x.g > 1 ? "gols" : "gol"}` : ""}${x.a ? ` · ${x.a} assist.` : ""}${t && t[1] === aid ? " · melhor em campo" : ""}</small>${notaBotao(x, r.pos)}</li>`).join("")}</ul></div>`;
    }).filter(Boolean);
    el.innerHTML = blocos.length ? `${el.querySelector(".card-h").outerHTML}<div class="np-grid">${blocos.join("")}</div><div class="source">${esc(Ds.find(Boolean)?.criteriosNota || "")}</div>`
      : `${el.querySelector(".card-h").outerHTML}<div class="empty" style="padding:18px">As notas aparecem quando a súmula do jogo for lida (durante o jogo, a cada atualização; no fim, com os números finais).</div>`;
  }

  window.JOGADOR = { indice, get, busca, page, mount, POS, avatar, montaNotas };
})();
