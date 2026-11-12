/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
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
    if (j?.foto?.url) return `<span class="jg-av${j.foto.privada ? " foto-priv" : ""}" style="--tc:${display(c)};width:${n}px;height:${n}px">${window.GFX.fotoImg(j.foto, `Foto de ${p.nome}`)}</span>`;
    return `<span class="jg-av sem" style="--tc:${display(c)};width:${n}px;height:${n}px;background:${display(c)};color:${onColor(display(c))}"><b style="font-size:${Math.round(n * 0.38)}px">${p.num ?? ""}</b></span>`;
  }
  const fonteFoto = (f) => (f?.fonte === "Flickr" ? "Flickr" : "Wikimedia Commons");
  const credito = (j) => (j?.foto?.privada ? `<span class="jg-cred">Foto: TheSportsDB · uso privado</span>` : j?.foto ?`<a class="jg-cred" href="${esc(j.foto.pagina || "#")}" target="_blank" rel="noopener noreferrer">Foto: ${esc(j.foto.autor)} · ${esc(j.foto.licenca)} · ${fonteFoto(j.foto)}${j.foto.data ? ` · ${j.foto.data.split("-").reverse().join("/")}` : ""}</a>` : "");

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
  const LINHAS = [["Jogos", "j"], ["Titular", "tit"], ["Minutos", "min"], ["Gols", "g", 1], ["Assistências", "a", 1], ["Finalizações", "ch", 1], ["No alvo", "alvo", 1],
    ["Ações com bola no campo", "toques", 1], ["Passes", "passes", 1], ["Cruzamentos", "cruz", 1], ["Dribles tentados", "dribles", 1], ["Desarmes", "desarmes", 1],
    ["Interceptações", "intercept", 1], ["Cortes", "cortes", 1], ["Duelos aéreos", "aereos", 1], ["Perdas de posse", "perdas", 1], ["Defesas (goleiro)", "defesas", 1],
    ["Amarelos", "ca"], ["Vermelhos", "cv"]];

  function geral(p, j, D) {
    const C = j.comps || {}, comps = Object.keys(C);
    const jogos = (j.jogos || []).map((r) => jogoObj(D.campos, r)), ult = jogos.slice(-5).reverse();
    const tabela = comps.length ? `<div class="jg-tab-wrap"><table class="table jg-tab"><thead><tr><th>Competição</th><th>J</th><th>Min</th><th>G</th><th>A</th><th class="hide-sm">Fin.</th><th class="hide-sm">No alvo</th><th class="hide-sm">CA</th><th class="hide-sm">CV</th></tr></thead>
      <tbody>${comps.map((k) => `<tr><td class="club">${esc(k)}</td><td>${C[k].j}</td><td>${C[k].min}</td><td>${C[k].g}</td><td>${C[k].a}</td><td class="hide-sm">${C[k].ch}</td><td class="hide-sm">${C[k].alvo}</td><td class="hide-sm">${C[k].ca}</td><td class="hide-sm">${C[k].cv}</td></tr>`).join("")}
      ${comps.length > 1 ? `<tr class="jg-tot"><td class="club">Total</td>${["j", "min", "g", "a"].map((k) => `<td>${soma(C, k)}</td>`).join("")}${["ch", "alvo", "ca", "cv"].map((k) => `<td class="hide-sm">${soma(C, k)}</td>`).join("")}</tr>` : ""}</tbody></table></div>` : `<div class="empty" style="padding:24px">Ainda sem jogos nesta temporada.</div>`;
    const min = soma(C, "min");
    const por90 = [["Ações com bola", "toques"], ["Passes", "passes"], ["Finalizações", "ch"], ["Dribles tentados", "dribles"], ["Desarmes", "desarmes"], ["Interceptações", "intercept"]]
      .map(([l, k]) => `<li><b>${fmt(p90(soma(C, k), min))}</b><span>${l}</span></li>`).join("");
    return `<div class="grid-2 jg-grid">
      <div>
        <div class="card"><div class="card-h">Temporada por competição <small>${D.updated ? `atualizado em ${esc(D.updated)}` : ""}</small></div>${tabela}</div>
        <div class="card"><div class="card-h">Por 90 minutos <small>todas as competições</small></div><ul class="jg-p90">${min ? por90 : `<li class="empty">Sem minutos em campo.</li>`}</ul></div>
        <div class="card"><div class="card-h">Últimos jogos <small><a href="#/jogador/${esc(p.key)}/ultimos" style="color:var(--ink)">ver os 10 ›</a></small></div>
          <ul class="jg-ult">${ult.map((x) => `<li><span class="jg-d">${dm(x.date)}</span><span class="jg-o">${oppHTML(x.opp)}</span><span class="jg-s ${res(x)}">${x.gf ?? "–"}–${x.ga ?? "–"}</span><span class="jg-m">${x.min}'</span>${notaHTML(x.nota, x.vivo)}<span class="jg-ga">${x.g ? `⚽${x.g > 1 ? `×${x.g}` : ""}` : ""}${x.a ? ` 🅰${x.a > 1 ? `×${x.a}` : ""}` : ""}</span></li>`).join("") || `<li class="empty">Sem jogos.</li>`}</ul></div>
      </div>
      <div>
        <div class="card"><div class="card-h">Mapa de calor <small>${j.lances ? `${j.lances.toLocaleString("pt-BR")} ações na temporada` : "sem lances registrados"}</small></div>
          ${j.lances ? calorHTML(`Mapa de calor de ${p.nome} na temporada`) : `<div class="empty" style="padding:24px">A ESPN não registrou lances com posição para este jogador.</div>`}
          <div class="source">Cada passe, desarme, cruzamento, drible e finalização com posição no campo (lances da ESPN) · <a href="#/jogador/${esc(p.key)}/calor" style="color:var(--ink)">mapa completo ›</a></div></div>
      </div></div>`;
  }

  function linhaJogo(x, cols) {
    return `<tr><td>${dm(x.date)}</td><td class="hide-sm">${esc(x.comp)}</td><td class="club"><span class="jg-o">${x.home ? "" : "@ "}${oppHTML(x.opp, 20)}</span></td><td><span class="jg-s ${res(x)}">${x.gf ?? "–"}–${x.ga ?? "–"}</span></td>${cols.map(([k, hide]) => `<td${hide ? ' class="hide-sm"' : ""}>${k === "nota" ? notaHTML(x.nota, x.vivo) : k === "min" ? `${x.min}'${x.tit ? "" : "<small> (entrou)</small>"}` : (x[k] ?? 0)}</td>`).join("")}</tr>`;
  }
  const COLS = [["nota"], ["min"], ["g"], ["a"], ["ch", 1], ["alvo", 1], ["toques", 1], ["passes", 1], ["desarmes", 1], ["intercept", 1], ["dribles", 1], ["ca", 1], ["cv", 1]];
  const CAB = ["Nota", "Min", "G", "A", "Fin.", "Alvo", "Ações", "Passes", "Desarm.", "Interc.", "Dribles", "CA", "CV"];
  /* nota de 3 a 10 com a cor dos apps de placar: vermelho (abaixo de 6), laranja, amarelo, verde, azul (8+) */
  const corNota = (n) => (n == null ? "" : n >= 8 ? "n-top" : n >= 7 ? "n-boa" : n >= 6.5 ? "n-ok" : n >= 6 ? "n-med" : "n-ruim");
  const notaHTML = (n, vivo) => (n == null ? `<span class="nota n-sem" title="Menos de 10 minutos em campo">–</span>` : `<span class="nota ${corNota(n)}${vivo ? " vivo" : ""}" title="${vivo ? "Ao vivo: muda durante o jogo" : "Nota do Placar.TV"}">${n.toFixed(1).replace(".", ",")}</span>`);
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
          <div class="jg-tab-wrap"><table class="table jg-tab jg-jogos">${cab()}<tbody>${jogos.slice().reverse().map((x) => linhaJogo(x, COLS)).join("")}</tbody></table></div>
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
      linhas += linhaJogo(x, COLS);
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

  function comparar(p, j, D, outroId, J2, D2) {
    const o = outroId && get(outroId);
    const escolha = `<div class="card jg-escolha"><div class="card-h">Comparar ${esc(p.nome)} com…</div>
      <div class="jg-busca"><input type="search" data-jg-cmp placeholder="Nome do jogador" aria-label="Jogador para comparar" autocomplete="off" /><div class="jg-busca-res" data-jg-cmp-res role="listbox"></div></div>
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
    return escolha + `<div class="card jg-cmp"><div class="jg-cmp-top">${lado(p, j, ca)}<span class="jg-vs">×</span>${lado(o, J2, cb)}</div>
      <ul class="jg-cmp-l">${rows}</ul>
      <div class="jg-cmp-calor"><div><h5>${esc(p.nome)}</h5>${j.calor ? calorHTML(`Mapa de calor de ${p.nome}`).replace('class="jg-campo"', 'class="jg-campo" data-grade="calor" data-de="a"') : `<p class="empty">Sem lances.</p>`}</div>
        <div><h5>${esc(o.nome)}</h5>${J2.calor ? calorHTML(`Mapa de calor de ${o.nome}`).replace('class="jg-campo"', 'class="jg-campo" data-grade="calor" data-de="b"') : `<p class="empty">Sem lances.</p>`}</div></div>
      <div class="source">Temporada inteira, todas as competições com súmula na ESPN · por 90 min = valor x 90 ÷ minutos jogados</div></div>`;
  }

  /* ---------- montar (depois que a página foi desenhada) ---------- */
  const estado = { filtro: "Todas" };
  async function mount(root) {
    const el = root.querySelector("[data-jogador]");
    if (!el) return;
    const p = get(el.dataset.jogador), c = byId[p.cid], aba = el.dataset.aba;
    const D = await HEATMAP.carregaClube(p.cid);
    if (!el.isConnected) return;
    const j = D?.jogadores?.[p.aid];
    const corpo = el.querySelector("[data-jg-corpo]");
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
        <ul class="np-lista">${linhas.map(({ aid, r, x }) => `<li class="${t && t[1] === aid ? "melhor" : ""}"><a href="#/jogador/${aid}-${cid}">${esc(r.n)}</a><small>${x.min}'${x.tit ? "" : " (entrou)"}${x.g ? ` · ${x.g} ${x.g > 1 ? "gols" : "gol"}` : ""}${x.a ? ` · ${x.a} assist.` : ""}${t && t[1] === aid ? " · melhor em campo" : ""}</small>${notaHTML(x.nota, x.vivo)}</li>`).join("")}</ul></div>`;
    }).filter(Boolean);
    el.innerHTML = blocos.length ? `${el.querySelector(".card-h").outerHTML}<div class="np-grid">${blocos.join("")}</div><div class="source">${esc(Ds.find(Boolean)?.criteriosNota || "")}</div>`
      : `${el.querySelector(".card-h").outerHTML}<div class="empty" style="padding:18px">As notas aparecem quando a súmula do jogo for lida (durante o jogo, a cada atualização; no fim, com os números finais).</div>`;
  }

  window.JOGADOR = { indice, get, busca, page, mount, POS, avatar, montaNotas };
})();
