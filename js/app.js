/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — aplicação (SPA com rotas por hash, sem dependências)
   ========================================================================== */
(async () => {
  await window.PD_BOOT; // dados ao vivo da API, quando ela estiver rodando
  const { CLUBS, byId, REAL, buildStandings, realMatches } = window.PD;
  let { ROUND, ROUNDS } = window.PD;
  const { crest, crestOutro, kitBg, onColor, display, flagBR } = window.GFX;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $("#view");
  const root = document.documentElement;

  /* ---------- estado ---------- */
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("placar:" + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("placar:" + k, JSON.stringify(v)); } catch { /* armazenamento indisponível */ } },
  };
  const state = {
    standings: buildStandings(),
    matches: realMatches(ROUND),
    favs: new Set(store.get("favs", ["flamengo", "palmeiras"])),
    filter: "all",
    round: ROUND,
    route: null,
  };
  const rowOf = (id) => state.standings.find((r) => r.id === id);
  /* próximo jogo: o da rodada atual, se ainda não foi disputado; senão o que a CBF indica */
  // próximo adversário: o primeiro jogo do clube ainda não encerrado, em qualquer rodada (inclusive adiados).
  // Assim que o jogo da rodada termina, a tabela já mostra o adversário seguinte; com a bola rolando, o de agora.
  const nextOf = (id) => {
    const enc = (g) => g[8]?.state === "post" || (g[2] != null && !(g[8] && g[8].state === "in"));
    let best = null, bk = Infinity;
    for (const g of Object.values(window.PD.FIXTURES || {}).flat()) {
      if ((g[0] !== id && g[1] !== id) || enc(g)) continue;
      const k = g[4] ? Date.parse(`${g[4]}T${g[5] || "23:59"}:00-03:00`) : Infinity;
      if (k < bk) { bk = k; best = g; }
    }
    return best ? (best[0] === id ? best[1] : best[0]) : rowOf(id).next;
  };

  /* ---------- utilidades ---------- */
  const ICON = {
    whistle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 9.5H21v3.2a5 5 0 0 1-5 5h-1.2A6.3 6.3 0 1 1 8.5 9.5Z"/><circle cx="8.5" cy="15.8" r="2.2"/><path d="M14 9.5V7M3 6l2.5 2M8 3.5l.8 3"/></svg>`,
    star: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/></svg>`,
    arrow: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>`,
    pin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    cal: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/></svg>`,
    stadium: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="12" cy="8" rx="9" ry="3.5"/><path d="M3 8v7c0 2 4 3.5 9 3.5s9-1.5 9-3.5V8"/></svg>`,
    ball: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z" fill="currentColor"/></svg>`,
  };
  const clubVars = (c) => `--k1:${c.colors[0]};--k2:${c.colors[1]};--k3:${c.colors[2]};--k-on:${onColor(c.colors[0])}`;
  const matchVars = (m) => `--h1:${display(byId[m.home])};--a1:${display(byId[m.away])}`;
  const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const dayKey = (d) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  function dayName(date) {
    if (!date) return "Data não informada";
    const d = new Date(`${date}T12:00:00-03:00`), today = dayKey(new Date());
    const tomorrow = dayKey(new Date(Date.now() + 864e5)), yesterday = dayKey(new Date(Date.now() - 864e5));
    const dm = `${date.slice(8, 10)}/${date.slice(5, 7)}`;
    return date === today ? `Hoje · ${dm}` : date === tomorrow ? `Amanhã · ${dm}` : date === yesterday ? `Ontem · ${dm}` : `${WD[d.getUTCDay()]} · ${dm}`;
  }
  const statusLabel = (m) =>
    m.status === "ft" ? "Fim" : m.status === "progress" ? `<span>●</span> ${m.clock || "Agora"}` : m.status === "pending" ? "Aguard." : m.time || "A definir";
  const statusText = (m) =>
    m.status === "ft" ? "Encerrado" : m.status === "progress" ? `Ao vivo${m.clock ? ` · ${m.clock}` : ""}` : m.status === "pending" ? "Aguardando resultado" : m.time ? `${dayName(m.date)} · ${m.time}` : m.date ? `${dayName(m.date)} · horário a definir` : "A definir";
  const posClass = (p) => (p <= 4 ? "lib" : p <= 6 ? "pre" : p <= 12 ? "sul" : p >= 17 ? "z4" : "");
  /* ==========================================================================
     Tema do clube (cores aplicadas no :root)
     ========================================================================== */
  /* contraste (WCAG): cor de fundo com texto legível e cor de texto legível sobre o fundo do tema */
  const rgbHex = (h) => { const m = /^#?([\da-f]{6})$/i.exec(String(h).trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const lumOf = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const toward = (c, t, k) => c.map((v, i) => v + (t[i] - v) * k);
  // escurece ou clareia a cor até ter contraste com todas as cores de "contra"
  function legible(hex, contra, min = 4.6) {
    const c = rgbHex(hex); if (!c) return hex;
    const bgs = contra.map(rgbHex), worst = (x) => Math.min(...bgs.map((b) => ratio(x, b)));
    if (worst(c) >= min) return toHex(c);
    const dark = lumOf(bgs[0]) > 0.4, t = dark ? [0, 0, 18] : [255, 255, 255];
    for (let k = 0.04; k <= 1; k += 0.04) { const x = toward(c, t, k); if (worst(x) >= min) return toHex(x); }
    return dark ? "#111111" : "#ffffff";
  }
  const BRAND = "#4b66f3"; // azul do PLACAR. um tom mais firme para botões com texto branco (4,7:1)
  function applyTheme(club) {
    const c = club ? club.colors : null, light = root.dataset.theme === "light";
    root.style.setProperty("--c1", c ? c[0] : "var(--brand)");
    root.style.setProperty("--c2", c ? c[1] : "#ffffff");
    root.style.setProperty("--c3", c ? c[2] : "var(--brand-2)");
    root.style.setProperty("--on-c1", c ? onColor(c[0]) : "#ffffff");
    // fundo de destaque (abas, botões ativos): ajustado para o texto branco/preto ficar legível
    const acc0 = club ? display(club) : BRAND, on = onColor(acc0);
    const acc = legible(acc0, [on], 4.5);
    root.style.setProperty("--accent", acc);
    root.style.setProperty("--on-accent", on);
    // texto de destaque (links, rótulos): legível sobre o fundo e os cartões do tema
    root.style.setProperty("--ink", legible(club ? display(club) : light ? "#435bdc" : "#8a9bff", light ? ["#eef1f6", "#ffffff"] : ["#141b28", "#0b0f17"], 4.6));
    root.style.setProperty("--logo-spot", c ? c[1] : "var(--live)");
    $('meta[name="theme-color"]').content = c ? c[0] : "#0b0f17";
  }

  /* ==========================================================================
     Componentes
     ========================================================================== */
  function matchRow(m, i = 0) {
    const h = byId[m.home], a = byId[m.away];
    const live = m.status === "progress";
    const started = m.status === "ft" || (live && m.hs != null);
    const fav = state.favs.has(m.home) || state.favs.has(m.away);
    const lose = (s) => m.status === "ft" && (s === "home" ? m.hs < m.as : m.as < m.hs);
    return `<a class="match" href="#/partida/${m.id}" data-match="${m.id}" style="--i:${i};${matchVars(m)}">
      <div class="time ${live ? "live" : ""}">${statusLabel(m)}${m.adiado ? `<small class="adiado">adiado</small>` : ""}</div>
      <div class="teams">
        <div class="team ${lose("home") ? "loser" : ""}">${crest(h, 30)}<span>${h.abbr}</span></div>
        <div class="team ${lose("away") ? "loser" : ""}">${crest(a, 30)}<span>${a.abbr}</span></div>
      </div>
      <div class="score ${live ? "live" : ""}"><b data-s="h">${started ? m.hs : ""}</b><b data-s="a">${started ? m.as : ""}</b></div>
      <button class="star ${fav ? "on" : ""}" data-fav="${m.home}" aria-label="Favoritar ${h.abbr}">${ICON.star}</button>
    </a>`;
  }

  function standingsTable(rows, highlight = null, compact = false) {
    const hs = (t) => `<th class="hide-sm">${t}</th>`;
    return `<table class="table">
      <thead><tr><th>#</th><th>Clube</th><th>P</th><th>J</th>${compact ? "" : ["V", "E", "D", "GP", "GC"].map(hs).join("")}<th>SG</th>${compact ? "" : ["%", "CA", "CV", "Próx."].map(hs).join("")}</tr></thead>
      <tbody>${rows.map((r, i) => {
        const c = byId[r.id], nx = byId[nextOf(r.id)];
        const hd = (v) => `<td class="hide-sm">${v}</td>`;
        return `<tr class="${r.id === highlight ? "me" : ""}" style="--i:${i}">
          <td><span class="pos ${posClass(r.pos)}">${r.pos}</span>${r.mov ? `<span class="mov ${r.mov > 0 ? "up" : "down"}" title="${r.mov > 0 ? "Subiu" : "Caiu"} ${Math.abs(r.mov)} ${Math.abs(r.mov) > 1 ? "posições" : "posição"} com os jogos de agora">${r.mov > 0 ? "▲" : "▼"}${Math.abs(r.mov)}</span>` : ""}</td>
          <td class="club"><a href="#/clube/${c.id}">${crest(c, compact ? 28 : 30)}${compact ? `<span>${c.abbr}</span>` : `<span class="nm-l">${c.name}</span><span class="nm-s">${c.abbr}</span>`}${r.vivo ? vivoChip(r.vivo, compact) : ""}</a></td>
          <td class="pts">${r.p}</td><td>${r.j}</td>
          ${compact ? "" : [r.w, r.d, r.l, r.gf, r.ga].map(hd).join("")}
          <td>${r.sg > 0 ? "+" : ""}${r.sg}</td>
          ${compact ? "" : [r.pct, r.ca, `<span class="cv">${r.cv}</span>`, nx ? `<a href="#/clube/${nx.id}" title="${nx.name}" style="display:inline-block">${crest(nx, 26)}</a>` : "—"].map(hd).join("")}
        </tr>`;
      }).join("")}</tbody></table>`;
  }
  // jogo do clube que já entrou na conta da classificação ao vivo: placar (do ponto de vista do clube) e minuto
  function vivoChip(v, curto = false) {
    if (v.sim) {
      const r = v.dp === 3 * v.n ? "w" : v.dp === 0 ? "l" : "d";
      return `<span class="live-chip sim ${r}" title="Simulado: ${v.res.join("; ")}">+${v.dp}${curto ? "" : ` pt${v.dp === 1 ? "" : "s"}`}</span>`;
    }
    const res = v.gf > v.ga ? "w" : v.gf < v.ga ? "l" : "d";
    return `<span class="live-chip ${res}${v.fim ? " fim" : ""}" title="${v.fim ? "Encerrado, ainda fora da tabela oficial" : "Jogo em andamento"}: ${v.gf} x ${v.ga} contra o ${byId[v.op].name}">${v.fim ? "" : `<i aria-hidden="true"></i>`}${v.gf}-${v.ga}${curto ? "" : ` ${byId[v.op].short}`}${v.fim ? " · fim" : v.clock ? ` · ${v.clock}` : ""}</span>`;
  }
  const temAoVivo = () => state.standings.some((r) => r.vivo);
  const sourceNote = `<div class="source">Fonte: <a href="${REAL.url}" target="_blank" rel="noopener noreferrer">${REAL.source}</a> · atualizado em ${REAL.updated}</div>`;

  /* artilharia oficial */
  /* ---------- departamento médico (js/departamento-medico.js ou /api/departamento-medico) ----------
     Quem está no DM, com a situação, desde quando, a parte do corpo, quantos veículos confirmam e as manchetes.
     Sai sozinho quando entra em campo, é relacionado ou uma manchete diz que foi liberado. */
  const DM_ST = { "fora da temporada": "bad", "longo prazo": "bad", lesionado: "bad", "em transição": "mid", "dúvida": "warn" };
  const dmSrc = (x, fmt) => `<a class="ps-src" href="${SEG.esc(SEG.url(x.link))}" target="_blank" rel="noopener noreferrer" title="${SEG.esc(x.manchete)}">${x.setorista ? `<em class="dm-set">setorista · ${SEG.esc(x.setorista)}</em> ` : ""}${SEG.esc(x.fonte)} · ${fmt(x.data)} · ${SEG.esc(x.manchete)}</a>`;
  function dmBlock(id, full, n, num, fmt, empty, d, src) {
    const c = window.DM?.clubs?.[id];
    if (!c) { // sem o monitor: as lesões das manchetes (versão antiga)
      return ["dm", "Departamento médico", "lesões noticiadas pela imprensa", d.lesionados.length
        ? d.lesionados.slice(0, n).map((p) => `<li>${num(p.id)}<b>${p.name}</b><span class="ps-tag ${p.confirmado ? "ok" : "warn"}">${p.confirmado ? `${p.fontes.length} fonte${p.fontes.length > 1 ? "s" : ""}` : "1 fonte"}</span>${full ? p.noticias.map(src).join("") : src(p.noticias[0])}</li>`).join("")
        : empty("Nenhuma lesão noticiada nos últimos 21 dias.")];
    }
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const li = (p) => `<li class="dm-li">${num(p.id)}<b>${SEG.esc(p.name)}${p.base ? ` <i class="dm-base" title="Jogador da base, fora do elenco cadastrado na ESPN">base</i>` : ""}</b><span class="ps-v dm-st ${DM_ST[p.status] || ""}">${SEG.esc(p.status)}</span>
      <span class="ps-sub">${[p.parte ? cap(SEG.esc(p.parte)) : null, `desde ${fmt(p.desde)}`, p.jogosFora ? `fora de ${p.jogosFora} jogo${p.jogosFora > 1 ? "s" : ""}` : null, p.ultimoJogo ? `último jogo em ${fmt(p.ultimoJogo)}` : "sem jogos no Brasileirão"].filter(Boolean).join(" · ")}</span>
      <span class="ps-tag ${p.confirmado ? "ok" : "warn"}">${p.oficial ? "site oficial · " : ""}${p.confirmado ? `confirmado · ${p.fontes.length} veículo${p.fontes.length > 1 ? "s" : ""}` : "1 fonte · sem confirmação"}</span>
      ${(full ? p.noticias.slice(0, 4) : p.noticias.slice(0, 1)).map((x) => dmSrc(x, fmt)).join("")}</li>`;
    const vistos = c.historico.length;
    const reps = (c.setoristas || []).length ? `<li class="ps-note dm-reps"><b>Setoristas monitorados</b><span>${c.setoristas.map((r) => `${SEG.esc(r.nome)}${r.veiculo ? ` (${SEG.esc(r.veiculo)})` : ""}`).join(" · ")}</span></li>` : "";
    return ["dm", "Departamento médico", `${c.ativos.length ? `${c.ativos.length} fora` : "elenco à disposição"} · ${vistos} saída${vistos === 1 ? "" : "s"} do DM na temporada`, c.ativos.length
      ? c.ativos.slice(0, full ? 99 : Math.max(n, 5)).map(li).join("") + (full ? reps : "")
      : empty("Ninguém no departamento médico: todos jogaram, foram relacionados ou não há notícia de lesão.") + (full ? reps : "")];
  }
  function dmHistBlock(c, num, fmt, empty) {
    return ["dmh", "Voltaram ao time", "saíram do departamento médico nesta temporada", c.historico.length
      ? c.historico.slice(0, 20).map((p) => `<li>${num(p.id)}<b>${SEG.esc(p.name)}</b><span class="ps-v">${fmt(p.desde)}–${fmt(p.ate)}</span><span class="ps-sub">${[p.parte ? SEG.esc(p.parte) : null, SEG.esc(p.motivo || "")].filter(Boolean).join(" · ")}</span></li>`).join("")
      : empty("Ninguém saiu do DM ainda nesta temporada.")];
  }

  /* ---------- estatísticas do elenco: pendurados, sequência, departamento médico e minutagem dos reservas ----------
     full = false: resumo de 4 blocos na visão geral; full = true: aba "Estatísticas" com tudo */
  function playerStatsHTML(id, full = false) {
    const all = window.PLAYER_STATS, d = all && all.clubs && all.clubs[id];
    if (!d) return full ? `<div class="card"><div class="empty" style="padding:40px">Estatísticas dos jogadores ainda não disponíveis.</div></div>` : "";
    const nums = Object.fromEntries((window.SQUADS[id] || []).map((p) => [p[4], p[0]]));
    const n = full ? 99 : 4;
    const fmt = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");
    const num = (pid) => `<span class="ps-n" data-pid="${pid}-${id}">${nums[pid] ?? "–"}</span>`;
    const empty = (t) => `<li class="ps-empty">${t}</li>`;
    const src = (x) => x ? `<a class="ps-src" href="${x.link}" target="_blank" rel="noopener noreferrer" title="${(x.manchete || "").replace(/"/g, "&quot;")}">${x.fonte}${x.setorista ? " · setorista" : ""} · ${fmt(x.data)} ↗</a>` : "";
    const blocks = [
      ["pend", "Pendurados", "a um amarelo da suspensão", `<li class="ps-note"><b>O número ao lado do nome é o total de amarelos na temporada.</b>
          <span>No Brasileirão, o 3º, o 6º, o 9º… amarelo suspendem. Quem tem 2, 5 ou 8 está pendurado: mais um cartão e fica fora do próximo jogo.</span></li>` +
        (d.pendurados.length
        ? d.pendurados.slice(0, n).map((p) => `<li>${num(p.id)}<b>${p.name}</b><span class="ps-tag ${p.so_imprensa ? "warn" : p.imprensa ? "ok" : ""}">${p.so_imprensa ? "segundo a imprensa" : p.imprensa ? "confirmado pela imprensa" : "pela súmula"}${p.amarelos ? ` · suspende no ${p.amarelos + 1}º` : ""}</span><span class="ps-v" title="${p.amarelos ?? "–"} amarelos na temporada"><i class="rk-card y"></i>${p.amarelos ?? "–"}<small>na temporada</small></span>${full ? src(p.imprensa) : ""}</li>`).join("")
        : empty("Nenhum jogador pendurado."))],
      ["seq", "Jogos seguidos", "partidas em sequência, sem desfalcar", d.sequencia.length
        ? d.sequencia.slice(0, n).map((p) => `<li>${num(p.id)}<b>${p.name}</b><span class="ps-sub">${p.titular} como titular</span><span class="ps-v">${p.jogos}</span></li>`).join("")
        : empty("Ninguém com 2 ou mais jogos seguidos.")],
      dmBlock(id, full, n, num, fmt, empty, d, src),
      ["res", "Reservas mais usados", "minutos de quem mais entra saindo do banco", d.reservas.length
        ? (() => { const max = d.reservas[0].minutos || 1; return d.reservas.slice(0, full ? 99 : 5).map((p) => `<li>${num(p.id)}<b>${p.name}</b><span class="ps-sub">${p.jogos} jogos · ${p.banco ?? p.jogos - p.titular} saindo do banco · ${p.titular} titular</span><span class="ps-v">${p.minutos}'</span><span class="ps-bar"><i data-w="${((p.minutos / max) * 100).toFixed(1)}"></i></span></li>`).join(""); })()
        : empty("Sem reservas com minutos.")],
    ];
    if (full && window.DM?.clubs?.[id]) blocks.push(dmHistBlock(window.DM.clubs[id], num, fmt, empty));
    const foot = `<div class="source">Súmulas: ${d.fontes?.sumulas || "ESPN"} · ${d.jogos} jogos do Brasileirão · ${window.DM ? `departamento médico: imprensa nacional e local, site oficial, setoristas e relacionados da ESPN (atualizado em ${SEG.esc(window.DM.updated)}) · ` : ""}pendurados conferidos em ${(d.fontes?.imprensa || []).length ? d.fontes.imprensa.join(", ") : "ge.globo, ESPN, UOL, Lance, Gazeta Esportiva e Terra"} e com os setoristas · atualizado em ${all.updated}</div>`;
    const grid = `<div class="pstats ${full ? "full" : ""}">${blocks.map(([k, t, sub, li]) => `<section class="ps-b ps-${k}"><h4>${t}<small>${sub}</small></h4><ul>${li}</ul></section>`).join("")}</div>`;
    return full ? `<div class="card">${grid}${foot}</div>`
      : `<div class="card reveal"><div class="card-h">Estatísticas do elenco <small><a href="#/clube/${id}/estatisticas" style="color:var(--ink)">ver tudo ›</a></small></div>${grid}${foot}</div>`;
  }

  /* ---------- Raio-X do clube (js/raio-x.js, baixado só na aba Estatísticas) ----------
     Números táticos do Brasileirão calculados das súmulas da ESPN, com a posição do clube entre os 20 e a média da liga,
     curiosidades geradas desses números e os créditos às páginas de estatística mantidas pela torcida. */
  const rxN = (v, d = 1) => (v == null ? "–" : (+v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const rxFem = (c) => c?.id === "chapecoense";
  const rxDo = (c) => (rxFem(c) ? "da " : "do ") + c.abbr, rxO = (c) => (rxFem(c) ? "a " : "o ") + c.abbr;
  const rxDate = (iso) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "");
  // [rótulo, "mais...", "menos...", unidade, casas decimais]
  const RX_M = {
    golsPorJogo: ["Gols por jogo", "que mais marca", "que menos marca", "gols por jogo", 2],
    sofridosPorJogo: ["Gols sofridos por jogo", "que mais sofre gols", "que menos sofre gols", "gols sofridos por jogo", 2],
    chutes: ["Finalizações", "que mais finaliza", "que menos finaliza", "finalizações por jogo", 1],
    noAlvo: ["No alvo", "que mais acerta o gol", "que menos acerta o gol", "finalizações no alvo por jogo", 1],
    posse: ["Posse de bola", "que mais fica com a bola", "que menos fica com a bola", "% de posse", 1],
    passes: ["Passes", "que mais troca passes", "que menos troca passes", "passes por jogo", 0],
    precisaoPasse: ["Passes certos", "que mais acerta passes", "que menos acerta passes", "% de passes certos", 1],
    escanteios: ["Escanteios", "que mais cobra escanteios", "que menos cobra escanteios", "escanteios por jogo", 1],
    desarmes: ["Desarmes", "que mais desarma", "que menos desarma", "desarmes por jogo", 1],
    interceptacoes: ["Interceptações", "que mais intercepta passes", "que menos intercepta passes", "interceptações por jogo", 1],
    cortes: ["Cortes", "que mais afasta a bola da área", "que menos afasta a bola da área", "cortes por jogo", 1],
    defesas: ["Defesas do goleiro", "que mais exige do próprio goleiro", "que menos exige do próprio goleiro", "defesas do goleiro por jogo", 1],
    chutesSofridos: ["Finalizações sofridas", "que mais sofre finalizações", "que menos sofre finalizações", "finalizações sofridas por jogo", 1],
    faltas: ["Faltas", "que mais faz faltas", "que menos faz faltas", "faltas por jogo", 1],
    amarelos: ["Amarelos", "que mais leva amarelo", "que menos leva amarelo", "amarelos por jogo", 1],
    pontaria: ["Pontaria", "que mais acerta o alvo proporcionalmente", "que menos acerta o alvo proporcionalmente", "% das finalizações no alvo", 1],
    conversao: ["Conversão", "que mais aproveita as finalizações", "que menos aproveita as finalizações", "% das finalizações viram gol", 1],
    semSofrer: ["Sem sofrer gol", "com mais jogos sem sofrer gol", "com menos jogos sem sofrer gol", "jogos sem sofrer gol", 0],
    pontosBuscados: ["Pontos buscados", "que mais pontos buscou saindo atrás", "que menos pontos buscou saindo atrás", "pontos depois de sair atrás no placar", 0],
    golsApos80: ["Gols depois dos 80'", "que mais marca depois dos 80 minutos", "que menos marca depois dos 80 minutos", "gols depois dos 80'", 0],
    aprovCasa: ["Em casa", "com melhor aproveitamento em casa", "com pior aproveitamento em casa", "% de aproveitamento em casa", 1],
    aprovFora: ["Fora de casa", "com melhor aproveitamento fora de casa", "com pior aproveitamento fora de casa", "% de aproveitamento fora", 1],
  };
  const rxVal = (c, k) => ({ chutes: c.media.chutes, noAlvo: c.media.noAlvo, posse: c.media.posse, passes: c.media.passes, escanteios: c.media.escanteios, desarmes: c.media.desarmes,
    interceptacoes: c.media.interceptacoes, cortes: c.media.cortes, defesas: c.media.defesas, faltas: c.media.faltas, amarelos: c.media.amarelos, chutesSofridos: c.sofre.chutes,
    aprovCasa: c.casa.aprov, aprovFora: c.fora.aprov })[k] ?? c[k];
  // posição entre os 20, já do jeito que se lê: "2º que mais finaliza"
  function rxRank(c, k, liga) {
    const r = c.ranks?.[k], L = liga[k];
    if (!r || !L) return null;
    const bom = r <= 10;
    return { r, bom, top: r <= 4, fundo: r >= 17, txt: `${r}º`, frase: L.maisEMelhor === bom ? RX_M[k][1] : RX_M[k][2], pos: bom ? r : 21 - r };
  }
  const rxChip = (rk) => (rk ? `<span class="rx-rank ${rk.top ? "top" : rk.fundo ? "low" : ""}" title="${rk.r}º entre os 20 clubes">${rk.txt}</span>` : "");
  // número que conta até o valor quando aparece na tela
  const rxNum = (v, d = 1, suf = "") => `<span class="rx-nw"><b class="rx-num" data-num="${v ?? 0}" data-dec="${d}">${rxN(v, d)}</b>${suf ? `<i class="rx-suf">${suf}</i>` : ""}</span>`;

  function rxFacts(c, liga, club) {
    const out = [];
    for (const k of Object.keys(RX_M)) {
      const rk = rxRank(c, k, liga), v = rxVal(c, k);
      if (!rk || v == null || rk.pos > 3) continue;
      const peso = rk.pos === 1 ? 10 : 8 - rk.pos;
      const ordinal = rk.pos === 1 ? "" : `${rk.pos}º `;
      out.push({ peso, big: rxN(v, RX_M[k][4]) + (RX_M[k][3].startsWith("%") ? "%" : ""), txt: `${rk.pos === 1 ? "É o time" : `É o ${ordinal}time`} ${rk.frase} no Brasileirão: ${rxN(v, RX_M[k][4])}${RX_M[k][3].startsWith("%") ? RX_M[k][3] : ` ${RX_M[k][3]}`} (média da liga: ${rxN(liga[k].media, RX_M[k][4])}).`, tag: rk.bom === liga[k].maisEMelhor ? "destaque" : "atenção" });
    }
    const fx = c.faixas, iMax = fx.pro.indexOf(Math.max(...fx.pro));
    const totPro = fx.pro.reduce((a, b) => a + b, 0);
    if (totPro >= 6) out.push({ peso: 6, big: `${fx.rotulos[iMax]}'`, txt: `A faixa mais letal: ${fx.pro[iMax]} dos ${totPro} gols saíram entre os ${fx.rotulos[iMax].replace("–", " e os ")} minutos.`, tag: "quando marca" });
    const t2 = c.tempos.pro[1], tt = c.tempos.pro[0] + t2;
    if (tt >= 8 && (t2 / tt >= 0.6 || t2 / tt <= 0.4)) out.push({ peso: 5, big: `${Math.round((100 * t2) / tt)}%`, txt: `${Math.round((100 * t2) / tt)}% dos gols marcados saem no segundo tempo${t2 / tt >= 0.6 ? ": o time cresce depois do intervalo" : ": o time resolve cedo"}.`, tag: "quando marca" });
    const f = c.saiuNaFrente, ft = f.V + f.E + f.D;
    if (ft >= 4) out.push({ peso: f.V / ft >= 0.75 ? 7 : 4, big: `${Math.round((100 * f.V) / ft)}%`, txt: `Quando abre o placar, vence ${Math.round((100 * f.V) / ft)}% das vezes (${f.V} de ${ft} jogos)${f.D ? ` e perdeu ${f.D}` : " e nunca perdeu"}.`, tag: "placar" });
    const at = c.saiuAtras;
    if (at.V) out.push({ peso: 6 + at.V, big: `${at.V}`, txt: `Já virou ${at.V} jogo${at.V > 1 ? "s" : ""} depois de sair atrás no placar: ${c.pontosBuscados} pontos buscados no campeonato.`, tag: "placar" });
    if (c.pontosApos80 > 0) out.push({ peso: 4 + c.pontosApos80, big: `${c.pontosApos80}`, txt: `${c.pontosApos80} ponto${c.pontosApos80 > 1 ? "s vieram" : " veio"} de gols depois dos 80 minutos.`, tag: "reta final" });
    if (c.maiorVitoria && c.maiorVitoria.gf - c.maiorVitoria.ga >= 3) out.push({ peso: 5, big: `${c.maiorVitoria.gf}x${c.maiorVitoria.ga}`, txt: `Maior vitória no campeonato: ${c.maiorVitoria.gf} a ${c.maiorVitoria.ga} sobre ${byId[c.maiorVitoria.op] ? rxO(byId[c.maiorVitoria.op]) : "o adversário"}${c.maiorVitoria.casa ? " em casa" : " fora de casa"}, em ${rxDate(c.maiorVitoria.date)}.`, tag: "marca" });
    if (c.sequencias.vitorias >= 4) out.push({ peso: 4 + c.sequencias.vitorias / 2, big: `${c.sequencias.vitorias}`, txt: `Maior sequência de vitórias no Brasileirão: ${c.sequencias.vitorias} seguidas.`, tag: "sequência" });
    if (c.sequencias.invictaAtual >= 5) out.push({ peso: 9, big: `${c.sequencias.invictaAtual}`, txt: `Está há ${c.sequencias.invictaAtual} jogos sem perder no campeonato.`, tag: "sequência" });
    const dc = c.destaques?.conversao?.[0];
    if (dc && dc.pct >= 20) out.push({ peso: 5, big: `${rxN(dc.pct, 0)}%`, txt: `${SEG.esc(dc.name)} transforma ${rxN(dc.pct, 0)}% das finalizações em gol (${dc.gols} gols em ${dc.chutes} chutes).`, tag: "individual" });
    const dif = (c.casa.aprov ?? 0) - (c.fora.aprov ?? 0);
    if (Math.abs(dif) >= 25) out.push({ peso: 5, big: `${rxN(Math.abs(dif), 0)}`, txt: `${dif > 0 ? "Muito mais forte em casa" : "Rende mais fora de casa"}: ${rxN(c.casa.aprov, 0)}% de aproveitamento como mandante e ${rxN(c.fora.aprov, 0)}% como visitante.`, tag: "casa e fora" });
    return out.sort((a, b) => b.peso - a.peso).slice(0, 8);
  }

  function raioxHTML(id) {
    const all = window.RAIO_X, c = all?.clubs?.[id], club = byId[id];
    if (!all) return `<div class="card rx-wait"><div class="empty" style="padding:28px">Carregando o Raio-X ${rxDo(club)}…</div></div>`;
    if (!c) return "";
    const L = all.liga, ring = (k, v, rot, sub) => {
      const p = Math.max(0, Math.min(100, v ?? 0)) / 100;
      return `<div class="rx-ring-w"><svg class="rx-ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" class="bg"/><circle cx="40" cy="40" r="34" class="v" style="--p:${p.toFixed(3)}"/></svg>
        <div class="rx-ring-t">${rxNum(v, 0, "%")}</div><span>${rot}</span><small>${sub} ${rxChip(rxRank(c, k, L))}</small></div>`;
    };
    // topo: quatro números grandes
    const heads = [["golsPorJogo", "Gols por jogo", c.golsPorJogo, 2, `${c.gf} gols em ${c.jogos} jogos`], ["sofridosPorJogo", "Sofridos por jogo", c.sofridosPorJogo, 2, `${c.ga} gols sofridos`],
      ["chutes", "Finalizações por jogo", c.media.chutes, 1, `${rxN(c.media.noAlvo)} no alvo`], ["semSofrer", "Jogos sem sofrer gol", c.semSofrer, 0, `${c.semMarcar} sem marcar`]];
    const top = `<div class="rx-heads">${heads.map(([k, t, v, d, sub], i) => `<div class="rx-head" style="--i:${i}"><small>${t}</small><div class="rx-big">${rxNum(v, d)}${rxChip(rxRank(c, k, L))}</div><em>${sub}</em></div>`).join("")}</div>`;
    // quando marca e quando sofre (gols por faixa de 15 minutos)
    const fx = c.faixas, mx = Math.max(1, ...fx.pro, ...fx.contra), iMax = fx.pro.indexOf(Math.max(...fx.pro));
    const faixas = `<section class="rx-b rx-when"><h4>Quando ${rxO(club)} marca e sofre<small>gols por faixa de 15 minutos · ${c.comLances} jogos com os lances completos</small></h4>
      <div class="rx-fx" role="img" aria-label="${fx.rotulos.map((r, i) => `${r} minutos: ${fx.pro[i]} gols marcados e ${fx.contra[i]} sofridos`).join("; ")}">
        ${fx.rotulos.map((r, i) => `<div class="rx-col${i === iMax && fx.pro[i] ? " hot" : ""}" style="--k:${i}"><span class="up"><i style="--h:${((fx.pro[i] / mx) * 100).toFixed(1)}"></i><b>${fx.pro[i]}</b></span><span class="lbl">${r}'</span><span class="dn"><i style="--h:${((fx.contra[i] / mx) * 100).toFixed(1)}"></i><b>${fx.contra[i]}</b></span></div>`).join("")}
      </div>
      <div class="rx-legend"><span><i class="pro"></i>marcados</span><span><i class="contra"></i>sofridos</span><span>1º tempo ${c.tempos.pro[0]} x ${c.tempos.contra[0]} · 2º tempo ${c.tempos.pro[1]} x ${c.tempos.contra[1]}</span></div></section>`;
    const aneis = `<section class="rx-b rx-rings"><h4>Estilo de jogo<small>médias por jogo no Brasileirão</small></h4><div class="rx-ring-grid">
      ${ring("posse", c.media.posse, "Posse de bola", `média da liga ${rxN(L.posse?.media, 0)}%`)}
      ${ring("precisaoPasse", c.precisaoPasse, "Passes certos", `${rxN(c.media.passes, 0)} passes por jogo`)}
      ${ring("pontaria", c.pontaria, "Chutes no alvo", `${rxN(c.conversao, 1)}% viram gol`)}
      ${ring("aprovCasa", c.casa.aprov, "Aproveitamento em casa", `fora: ${rxN(c.fora.aprov, 0)}%`)}</div></section>`;
    // comparado com a liga: onde o clube fica entre o pior e o melhor
    const comp = ["chutes", "noAlvo", "escanteios", "passes", "desarmes", "interceptacoes", "cortes", "defesas", "chutesSofridos", "faltas"].map((k, i) => {
      const v = rxVal(c, k), l = L[k];
      if (v == null || !l) return "";
      const span = l.max - l.min || 1, x = ((v - l.min) / span) * 100, xm = ((l.media - l.min) / span) * 100;
      const rk = rxRank(c, k, L);
      // nos extremos, a frase ("2º que mais finaliza"); no meio da tabela, só a posição
      const sub = !rk ? "" : rk.pos <= 5 ? `${rk.pos}º ${rk.frase.replace(/^que |^cujo /, "")}` : `${rk.r}º de 20`;
      return `<li style="--k:${i}"><span class="rx-cl">${RX_M[k][0]}<small>${sub}</small></span>
        <span class="rx-track" title="Liga: de ${rxN(l.min, RX_M[k][4])} a ${rxN(l.max, RX_M[k][4])}, média ${rxN(l.media, RX_M[k][4])}"><i class="avg" style="--x:${xm.toFixed(1)}"></i><i class="me${rk && rk.r >= 15 ? " bad" : ""}" style="--x:${x.toFixed(1)}"></i></span>
        <span class="rx-v">${rxN(v, RX_M[k][4])}<small>liga ${rxN(l.media, RX_M[k][4])}</small></span></li>`;
    }).join("");
    const liga = `<section class="rx-b rx-comp"><h4>Comparado com a liga<small>a bolinha é ${rxO(club)}; o traço, a média dos 20 clubes</small></h4><ul>${comp}</ul></section>`;
    // reação ao placar
    const stack = (o, t) => {
      const n = o.V + o.E + o.D;
      if (!n) return `<div class="rx-stack-w"><span class="rx-st-t">${t}</span><em class="rx-none">nunca aconteceu</em></div>`;
      return `<div class="rx-stack-w"><span class="rx-st-t">${t}<small>${n} jogo${n > 1 ? "s" : ""}</small></span><div class="rx-stack">${[["V", "v"], ["E", "e"], ["D", "d"]].map(([k, cl]) => (o[k] ? `<i class="${cl}" style="--w:${((o[k] / n) * 100).toFixed(1)}" title="${o[k]} ${k === "V" ? "vitória" : k === "E" ? "empate" : "derrota"}${o[k] > 1 ? "s" : ""}">${o[k]}${k}</i>` : "")).join("")}</div></div>`;
    };
    const s = c.sequencias;
    const placar = `<section class="rx-b rx-score"><h4>Reação ao placar<small>como termina o jogo depois do primeiro gol</small></h4>
      ${stack(c.saiuNaFrente, "Saiu na frente")}${stack(c.saiuAtras, "Saiu atrás")}
      <div class="rx-mini"><div><b>${rxNum(c.pontosBuscados, 0)}</b><span>pontos buscados saindo atrás</span></div><div><b>${rxNum(c.pontosApos80, 0)}</b><span>pontos com gols depois dos 80'</span></div><div><b>${rxNum(c.penaltis, 0)}</b><span>gols de pênalti</span></div></div></section>`;
    const seqs = `<section class="rx-b rx-seq"><h4>Sequências e marcas<small>no Brasileirão</small></h4><div class="rx-mini">
      <div><b>${rxNum(s.vitorias, 0)}</b><span>vitórias seguidas (a maior)</span></div><div><b>${rxNum(s.invicta, 0)}</b><span>jogos sem perder (a maior)</span></div>
      <div><b>${rxNum(s.invictaAtual, 0)}</b><span>jogos sem perder agora</span></div><div><b>${c.maiorVitoria ? `${c.maiorVitoria.gf}x${c.maiorVitoria.ga}` : "–"}</b><span>maior vitória${c.maiorVitoria ? ` · ${byId[c.maiorVitoria.op]?.abbr || ""} · ${rxDate(c.maiorVitoria.date)}` : ""}</span></div></div>
      <div class="rx-form" aria-label="Últimos ${c.ultimos.length} jogos">${c.ultimos.map((r, i) => `<i class="${r === "V" ? "v" : r === "E" ? "e" : "d"}" style="--k:${i}">${r}</i>`).join("")}<small>últimos ${c.ultimos.length}</small></div></section>`;
    // você sabia?
    const facts = rxFacts(c, L, club);
    const sabia = facts.length ? `<section class="rx-b rx-facts"><h4>Você sabia?<small>curiosidades tiradas dos números ${rxDo(club)}</small></h4>
      <div class="rx-cards">${facts.map((f, i) => `<article class="rx-fact" style="--k:${i}"><span class="rx-tag">${f.tag}</span><b>${f.big}</b><p>${f.txt}</p></article>`).join("")}</div></section>` : "";
    // destaques individuais
    const d = c.destaques || {}, nm = (p) => `${SEG.esc(p.name)}${p.noClube === false ? ` <i class="rx-out" title="Já não está no elenco">saiu</i>` : ""}`;
    const lb = (t, lst, val, sub) => (lst?.length ? `<div class="rx-lb"><h5>${t}</h5><ol>${lst.map((p, i) => `<li style="--k:${i}"><span class="rx-pos">${i + 1}</span><span class="rx-pn">${nm(p)}<small>${sub(p)}</small></span><b>${val(p)}</b></li>`).join("")}</ol></div>` : "");
    const indiv = `<section class="rx-b rx-ind"><h4>Destaques individuais<small>Brasileirão, pelas súmulas</small></h4><div class="rx-lbs">
      ${lb("Participações em gol", d.participacoes, (p) => p.gols + p.assist, (p) => `${p.gols} gols · ${p.assist} assistências`)}
      ${lb("Quem mais finaliza", d.finalizadores, (p) => p.chutes, (p) => `${p.noAlvo} no alvo · ${p.jogos} jogos`)}
      ${lb("Melhor conversão", d.conversao, (p) => `${rxN(p.pct, 0)}%`, (p) => `${p.gols} gols em ${p.chutes} chutes`)}
      ${lb("Minutos por gol", d.minutosPorGol, (p) => `${p.mpg}'`, (p) => `${p.gols} gols em ${p.min} minutos`)}
      ${lb("Garçons", d.garcons, (p) => p.assist, (p) => `${p.jogos} jogos`)}</div></section>`;
    return `<div class="card rx" data-rx>
      <div class="card-h">Raio-X ${rxDo(club)}<small>Brasileirão · ${c.jogos} jogos · ${c.pontos} pontos (${rxN(c.aprov, 0)}%)</small></div>
      ${top}<div class="rx-grid">${faixas}${aneis}${liga}${placar}${seqs}${sabia}${indiv}</div>
      <div class="source">Números calculados pelo PLACAR a partir das ${SEG.esc(all.fonte || "súmulas da ESPN")} · posição entre os 20 clubes ao lado de cada número · atualizado em ${SEG.esc(all.updated)}</div></div>
      ${torcidaHTML(id)}`;
  }

  // créditos: páginas de estatística mantidas por torcedores (o conteúdo delas é dos autores; aqui vão o perfil, o que a imprensa publicou citando a página e, com a API oficial do X, as publicações)
  function torcidaHTML(id) {
    const all = window.RAIO_X, club = byId[id], pags = all?.torcida?.[id] || [], gerais = all?.gerais || [];
    const fmt = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
    const ini = (n) => SEG.esc(n.replace(/[^A-Za-zÀ-ÿ ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "@");
    const perfil = (p, geral) => `<li class="rx-page${geral ? " geral" : ""}">
        <a class="rx-pg-h" href="https://x.com/${encodeURIComponent(p.x)}" target="_blank" rel="noopener noreferrer"><span class="rx-av" aria-hidden="true">${ini(p.nome)}</span>
          <span class="rx-pg-n"><b>${SEG.esc(p.nome)}</b><small>@${SEG.esc(p.x)} no X${p.sobre ? ` · ${SEG.esc(p.sobre)}` : ""}</small></span><em>seguir ↗</em></a>
        ${(p.posts || []).map((x) => `<a class="rx-post" href="${SEG.esc(SEG.url(x.link))}" target="_blank" rel="noopener noreferrer"><span>${SEG.esc(x.texto)}</span><small>publicado no X · ${fmt(x.ts)} ↗</small></a>`).join("")}
        ${(p.imprensa || []).length ? `<div class="rx-press"><small>Na imprensa, citando a página</small>${p.imprensa.map((x) => `<a class="ps-src" href="${SEG.esc(SEG.url(x.link))}" target="_blank" rel="noopener noreferrer">${SEG.esc(x.source || "")} · ${fmt(x.ts)} · ${SEG.esc(x.title)}</a>`).join("")}</div>` : ""}
      </li>`;
    const lista = pags.length ? `<ul class="rx-pages">${pags.map((p) => perfil(p)).join("")}</ul>`
      : `<p class="rx-none-p">Ainda não encontramos uma página de estatística da torcida ${rxDo(club)} com dados conferíveis e atualizados. As páginas abaixo cobrem todos os clubes.</p>`;
    return `<div class="card rx-torcida reveal"><div class="card-h">Estatística feita pela torcida<small>créditos</small></div>
      <div class="card-b">${lista}
        ${gerais.length ? `<h5 class="rx-sub">Cobrem todos os clubes</h5><ul class="rx-pages">${gerais.map((p) => perfil(p, true)).join("")}</ul>` : ""}
        <p class="rx-credit">Torcedores que estudam o clube a fundo e publicam análises, recordes e curiosidades. O que eles publicam pertence a eles: aqui ficam o perfil, as reportagens que citaram a página e, quando a API oficial do X está ligada, as publicações com link para o original. Os números do Raio-X acima são calculados pelo PLACAR, no mesmo espírito.</p></div></div>`;
  }

  // anima o Raio-X quando aparece na tela (contadores, barras, anéis); sem animação: já no valor final
  function rxMount(root) {
    const els = $$("[data-rx]", root);
    if (!els.length) return;
    const fin = (el) => { el.classList.add("on"); $$(".rx-num", el).forEach((b) => (b.textContent = rxN(+b.dataset.num, +b.dataset.dec))); };
    if (reduced) return els.forEach(fin);
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      e.target.classList.add("on");
      $$(".rx-num", e.target).forEach((b) => {
        const to = +b.dataset.num, d = +b.dataset.dec, t0 = performance.now(), dur = 1300;
        const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); b.textContent = rxN(to * (1 - (1 - k) ** 3), d); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    }), { threshold: 0.08 });
    // cada bloco anima quando chega na tela
    els.forEach((el) => $$(".rx-heads, .rx-b", el).forEach((b) => { b.setAttribute("data-rx-part", ""); io.observe(b); }));
  }
  let rxScript = null;
  function loadRaioX() {
    if (rxScript) return rxScript;
    rxScript = new Promise((res) => {
      const sc = document.createElement("script");
      sc.src = "js/raio-x.js";
      sc.onload = sc.onerror = () => res();
      document.head.appendChild(sc);
    });
    return rxScript;
  }

  /* ---------- nome do estádio: a ESPN escreve os brasileiros sem acento ("Estadio do Maracana") ---------- */
  const ESTADIO_BR = /\b(do|da|dos|das)\b|Mineir|Beira-Rio|Maracan|Manoel Barradas|Barrad|José Maria de Campos|Evandro Almeida|Baen|Eucaliptos|Magalhães|Lourival|Morumb|Pacaembu|Nilton Santos|São Januário|Couto Pereira|Vila Belmiro|Fonte Nova|Castelão|Mangueir|Cícero|Cicero|Lucarelli|Brinco de Ouro|Moça Bonita|Raulino|Independência|Serra Dourada|Arruda|Ilha do Retiro|Almeidão|Kleber Andrade|Bezerrão|Mané Garrincha|Estadual|Municipal [A-ZÁÉÍÓÚ][a-zà-ÿ]+ (de|do|da) /;
  const estadio = (v) => {
    if (!v) return "";
    let s = String(v).replace(/\bMaracana\b/, "Maracanã").replace(/\bCicero\b/, "Cícero").replace(/\bBaenao\b/, "Baenão");
    if (/^Estadio /.test(s) && ESTADIO_BR.test(s.slice(8))) s = "Estádio " + s.slice(8);
    return s;
  };

  /* ---------- aba Partidas: temporada inteira (resultados e jogos por vir), por mês, com filtro de competição ---------- */
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function historyHTML(id, d, filtro = state.histFilter || "Todas") {
    const c = byId[id];
    if (!d?.all?.length) return `<div class="card"><div class="empty" style="padding:40px">Buscando os jogos do ${c.abbr}…</div></div>`;
    const comps = ["Todas", ...new Set(d.all.map((e) => e.comp))];
    if (!comps.includes(filtro)) filtro = "Todas";
    const list = d.all.filter((e) => filtro === "Todas" || e.comp === filtro);
    const done = list.filter((e) => e.state === "post");
    const n = (r) => done.filter((e) => e.res === r).length;
    const gp = done.reduce((t, e) => t + e.gf, 0), gc = done.reduce((t, e) => t + e.ga, 0);
    const side = (club, name, logo) => `<span class="hm-team">${club ? crest(club, 30) : crestOutro(name, logo, 30)}<b>${club ? club.abbr : SEG.esc(name)}</b></span>`;
    const opp = (e) => (e.oppId && byId[e.oppId] ? byId[e.oppId] : null);
    const row = (e) => {
      const H = e.home ? side(c) : side(opp(e), e.opp, e.oppLogo), A = e.home ? side(opp(e), e.opp, e.oppLogo) : side(c);
      const hs = e.home ? e.gf : e.ga, as = e.home ? e.ga : e.gf;
      const mid = e.state === "post" ? `<b class="hm-score">${hs}<i>×</i>${as}</b>${e.pen ? `<small>pên. ${e.home ? e.pen[0] : e.pen[1]}–${e.home ? e.pen[1] : e.pen[0]}</small>` : ""}`
        : e.state === "in" ? `<b class="hm-score live">${hs}<i>×</i>${as}</b><small class="live">● ${e.clock || "ao vivo"}</small>`
        : `<b class="hm-time ${e.time ? "" : "tbd"}">${e.time || "A definir"}</b>`;
      return `<li class="hm-row ${e.state} ${e.res ? `r${e.res}` : ""}">
        <span class="hm-date"><b>${e.date.slice(8, 10)}/${e.date.slice(5, 7)}</b><small>${WD[new Date(`${e.date}T12:00:00-03:00`).getDay()]}</small></span>
        <span class="hm-comp">${e.comp}${e.stage ? `<small>${e.stage}</small>` : ""}</span>
        <span class="hm-match">${H}<span class="hm-mid">${mid}</span>${A}</span>
        <span class="hm-res">${e.res ? `<i class="fm-res ${e.res}">${e.res}</i>` : ""}</span>
        <span class="hm-venue">${estadio(e.venue)}</span></li>`;
    };
    let month = "";
    const rows = list.map((e) => {
      const m = MESES[+e.date.slice(5, 7) - 1] + " " + e.date.slice(0, 4), head = m !== month ? `<li class="hm-month">${(month = m)}</li>` : "";
      return head + row(e);
    }).join("");
    const hasNext = list.some((e) => e.state !== "post");
    return `<div class="card hm">
      <div class="card-h">Jogos do ${c.abbr} na temporada <small>${done.length} disputados · ${list.length - done.length} por vir</small></div>
      <div class="hm-top">
        <div class="chips hm-chips">${comps.map((x) => `<button class="chip ${x === filtro ? "on" : ""}" data-hist-filter="${x}">${x}</button>`).join("")}</div>
        <div class="hm-sum"><span><b>${done.length}</b>jogos</span><span class="v"><b>${n("V")}</b>vitórias</span><span class="e"><b>${n("E")}</b>empates</span><span class="d"><b>${n("D")}</b>derrotas</span><span><b>${gp}</b>gols pró</span><span><b>${gc}</b>gols contra</span></div>
        ${hasNext ? `<a class="hm-jump" href="#" data-hist-next>Ir para o próximo jogo ↓</a>` : ""}
      </div>
      <ul class="hm-list">${rows}</ul>
      <div class="source">Temporada ${d.all[0].date.slice(0, 4)} · todas as competições oficiais · fonte: ESPN · horários de Brasília; "A definir" = horário ainda não marcado pela CBF/Conmebol${window.CLUB_FORM?.updated ? ` · atualizado em ${window.CLUB_FORM.updated}` : ""}</div>
    </div>`;
  }

  /* ==========================================================================
     Comparativo entre clubes (#/clube/<id>/comparar/<outro>): tabela do Brasileirão lado a lado, temporada em todas
     as competições, casa e fora, últimos 5, confrontos na temporada e artilheiros. Sem escolher, compara com o rival.
     ========================================================================== */
  function compararClubes(a, b) {
    const A = byId[a], B = byId[b], ra = rowOf(a), rb = rowOf(b);
    const fa = window.CLUB_FORM?.clubs?.[a], fb = window.CLUB_FORM?.clubs?.[b];
    const esc = `<div class="card"><div class="card-h">Comparar o ${A.abbr} com <small>qualquer clube da Série A</small></div>
      <div class="cc-esc">${CLUBS.filter((x) => x.id !== a).map((x) => `<a href="#/clube/${a}/comparar/${x.id}" class="${x.id === b ? "on" : ""}">${crest(x, 24)}${x.abbr}</a>`).join("")}</div></div>`;
    const temp = (f) => {
      const ps = (f?.all || []).filter((e) => e.state === "post");
      const n = (r) => ps.filter((e) => e.res === r).length;
      const br = ps.filter((e) => e.comp === "Brasileirão"), casa = br.filter((e) => e.home), fora = br.filter((e) => !e.home);
      const pts = (l) => l.reduce((t, e) => t + (e.res === "V" ? 3 : e.res === "E" ? 1 : 0), 0);
      return { j: ps.length, v: n("V"), e: n("E"), d: n("D"), gp: ps.reduce((t, e) => t + (e.gf || 0), 0), gc: ps.reduce((t, e) => t + (e.ga || 0), 0),
        casa: casa.length ? Math.round((pts(casa) / (casa.length * 3)) * 100) : null, fora: fora.length ? Math.round((pts(fora) / (fora.length * 3)) * 100) : null,
        ult: ps.slice(-5), comps: new Set(ps.map((e) => e.comp)).size };
    };
    const ta = temp(fa), tb = temp(fb);
    const avg = (x, j) => (j ? (x / j).toFixed(2).replace(".", ",") : "–");
    // [rótulo, A, B, maior é melhor?, texto A, texto B]
    const L = [
      ["Posição", ra.pos, rb.pos, false, `${ra.pos}º`, `${rb.pos}º`], ["Pontos", ra.p, rb.p, true], ["Aproveitamento", ra.pct, rb.pct, true, `${ra.pct}%`, `${rb.pct}%`],
      ["Vitórias", ra.w, rb.w, true], ["Empates", ra.d, rb.d, null], ["Derrotas", ra.l, rb.l, false], ["Gols marcados", ra.gf, rb.gf, true], ["Gols sofridos", ra.ga, rb.ga, false],
      ["Saldo", ra.sg, rb.sg, true, `${ra.sg > 0 ? "+" : ""}${ra.sg}`, `${rb.sg > 0 ? "+" : ""}${rb.sg}`], ["Gols por jogo", ra.gf / (ra.j || 1), rb.gf / (rb.j || 1), true, avg(ra.gf, ra.j), avg(rb.gf, rb.j)],
      ["Sofridos por jogo", ra.ga / (ra.j || 1), rb.ga / (rb.j || 1), false, avg(ra.ga, ra.j), avg(rb.ga, rb.j)], ["Cartões amarelos", ra.ca, rb.ca, false], ["Cartões vermelhos", ra.cv, rb.cv, false],
    ];
    if (fa && fb) L.push(["Aproveitamento em casa", ta.casa ?? 0, tb.casa ?? 0, true, ta.casa == null ? "–" : `${ta.casa}%`, tb.casa == null ? "–" : `${tb.casa}%`],
      ["Aproveitamento fora", ta.fora ?? 0, tb.fora ?? 0, true, ta.fora == null ? "–" : `${ta.fora}%`, tb.fora == null ? "–" : `${tb.fora}%`],
      ["Jogos na temporada (todas as competições)", ta.j, tb.j, null], ["Vitórias na temporada", ta.v, tb.v, true], ["Gols na temporada", ta.gp, tb.gp, true]);
    const linha = ([l, va, vb, maior, xa, xb]) => {
      const mx = Math.max(Math.abs(va), Math.abs(vb)) || 1, m = maior == null || va === vb ? "" : (maior ? va > vb : va < vb) ? "m-a" : "m-b";
      return `<li class="${m}"><b>${xa ?? va}</b><span class="jg-cl"><span>${l}</span><span class="jg-cb"><i style="--p:${(Math.abs(va) / mx) * 100}%;--c:${display(A)}"></i><i style="--p:${(Math.abs(vb) / mx) * 100}%;--c:${display(B)}"></i></span></span><b>${xb ?? vb}</b></li>`;
    };
    const forma = (t) => `<span class="cc-forma">${t.ult.map((e) => `<i class="fm-res ${e.res}" title="${e.date.slice(8, 10)}/${e.date.slice(5, 7)} · ${SEG.esc(e.opp)} · ${e.home ? `${e.gf}–${e.ga}` : `${e.ga}–${e.gf}`}">${e.res}</i>`).join("")}</span>`;
    const lado = (C, r, t) => `<a class="cc-t" href="#/clube/${C.id}">${crest(C, 72)}<b>${C.name}</b><small>${r.pos}º · ${r.p} pts</small>${t.ult.length ? forma(t) : ""}</a>`;
    const h2h = (fa?.all || []).filter((e) => e.oppId === b && e.state !== "in");
    const top = (id) => clubTop(id, 3).map((p) => `<li><b>${p.gols}</b> ${SEG.esc(p.name)}</li>`).join("") || "<li>—</li>";
    return esc + `<div class="card"><div class="cc-top">${lado(A, ra, ta)}<span class="jg-vs">×</span>${lado(B, rb, tb)}</div>
        <ul class="jg-cmp-l">${L.map(linha).join("")}</ul>
        ${!fa || !fb ? `<p class="source">Carregando a temporada dos dois clubes…</p>` : ""}
        <div class="source">Brasileirão: tabela ${REAL.source} · temporada (todas as competições), casa e fora: ESPN · em verde, o melhor número de cada linha</div></div>
      <div class="grid-2 even">
        <div class="card"><div class="card-h">Confrontos na temporada <small>${A.abbr} x ${B.abbr}</small></div>
          <ul class="cc-h2h fm-list">${h2h.map((e) => `<li class="fm-row"><span class="fm-date"><b>${e.date.slice(8, 10)}/${e.date.slice(5, 7)}</b><small>${SEG.esc(e.comp)}</small></span><span>${e.home ? `${A.abbr} x ${B.abbr}` : `${B.abbr} x ${A.abbr}`}</span><span class="fm-score"><b>${e.state === "post" ? (e.home ? `${e.gf}–${e.ga}` : `${e.ga}–${e.gf}`) : e.time || "a definir"}</b></span>${e.res ? `<span class="fm-res ${e.res}">${e.res}</span>` : ""}</li>`).join("") || `<li class="empty" style="padding:14px">Os dois ainda não se enfrentaram nesta temporada.</li>`}</ul></div>
        <div class="card"><div class="card-h">Artilheiros <small>top 3 · Brasileirão</small></div>
          <div class="grid-2 even" style="gap:12px"><div><h5 class="cc-h5">${crest(A, 20)} ${A.abbr}</h5><ul class="cc-top3">${top(a)}</ul></div><div><h5 class="cc-h5">${crest(B, 20)} ${B.abbr}</h5><ul class="cc-top3">${top(b)}</ul></div></div></div>
      </div>`;
  }

  /* ==========================================================================
     Calendário do clube (visão geral): o mês com cada jogo no seu dia, em todas as competições.
     Meses anteriores mostram placar e local; os próximos, horário e local. Clicar num jogo abre as estatísticas
     rápidas (gols, posse, finalizações, escanteios, cartões...) pelo resumo da ESPN (ou /api/jogo com a API).
     Dados: a temporada do clube (js/club-form.js, gravado a cada 30 min, ou /api/calendario) e a ESPN direto ao abrir.
     ========================================================================== */
  const COMP_COR = { "Brasileirão": "#19a35b", "Copa do Brasil": "#e0a200", "Libertadores": "#c9973a", "Sul-Americana": "#2f7bdc", "Supercopa": "#e5484d", "Recopa": "#e5484d",
    "Mundial de Clubes": "#e5484d", "Intercontinental": "#e5484d", "Copa do Nordeste": "#f97316", "Copa Verde": "#10b981" };
  const compCor = (c) => COMP_COR[c] || "#9b6cf2"; // estaduais e outros: roxo
  const mesDe = (iso) => iso.slice(0, 7);
  const mesNome = (m) => `${MESES[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
  const somaMes = (m, n) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  state.cal = {};
  function calMeses(d) {
    const ms = [...new Set(d.all.map((e) => mesDe(e.date)))].sort();
    if (!ms.length) return [];
    const out = [];
    for (let m = ms[0]; m <= ms[ms.length - 1]; m = somaMes(m, 1)) out.push(m);
    return out;
  }
  function calMesInicial(d) {
    const ms = calMeses(d), hoje = mesDe(dayKey(new Date()));
    if (ms.includes(hoje)) return hoje;
    const prox = d.all.find((e) => e.state !== "post");
    return prox ? mesDe(prox.date) : ms[ms.length - 1];
  }
  const calOpp = (e) => (e.oppId && byId[e.oppId] ? byId[e.oppId] : null);
  const calCrest = (e, n) => { const o = calOpp(e); return o ? crest(o, n) : crestOutro(e.opp, e.oppLogo, n); };
  const calNome = (e) => SEG.esc(calOpp(e)?.abbr || e.opp || "?");
  const calPlacar = (e) => (e.home ? `${e.gf}–${e.ga}` : `${e.ga}–${e.gf}`); // sempre mandante primeiro
  function calInner(id, d) {
    const c = byId[id];
    if (!d) return `<div class="empty" style="padding:28px">Carregando o calendário…</div>`;
    if (!d.all?.length) return `<div class="empty" style="padding:28px">Calendário ainda não disponível.</div>`;
    const ms = calMeses(d);
    let mes = state.cal[id];
    if (!mes || !ms.includes(mes)) mes = state.cal[id] = calMesInicial(d);
    const i = ms.indexOf(mes), jogos = d.all.filter((e) => mesDe(e.date) === mes);
    const porDia = {};
    jogos.forEach((e) => (porDia[e.date] = porDia[e.date] || []).push(e));
    const hoje = dayKey(new Date()), ano = +mes.slice(0, 4), mm = +mes.slice(5, 7);
    const ini = new Date(Date.UTC(ano, mm - 1, 1)).getUTCDay(), dias = new Date(Date.UTC(ano, mm, 0)).getUTCDate();
    const feitos = jogos.filter((e) => e.state === "post"), n = (r) => feitos.filter((e) => e.res === r).length;
    let cel = "";
    for (let k = 0; k < ini; k++) cel += `<div class="cal-d vazio" aria-hidden="true"></div>`;
    for (let dd = 1; dd <= dias; dd++) {
      const iso = `${mes}-${String(dd).padStart(2, "0")}`, js = porDia[iso] || [];
      cel += `<div class="cal-d${iso === hoje ? " hoje" : ""}${js.length ? " tem" : ""}"><span class="cal-n">${dd}</span>${js.map((e) => {
        const quando = e.state === "post" ? calPlacar(e) : e.state === "in" ? `${calPlacar(e)}` : e.time || "a def.";
        const rot = `${e.comp}${e.stage ? `, ${e.stage}` : ""}: ${e.home ? `${c.name} x ${calNome(e)}` : `${calNome(e)} x ${c.name}`}, ${e.state === "post" ? `${calPlacar(e)} (${{ V: "vitória", E: "empate", D: "derrota" }[e.res]})` : e.state === "in" ? `ao vivo, ${calPlacar(e)}` : e.time ? `às ${e.time}` : "horário a definir"}`;
        return `<button type="button" class="cal-j ${e.state}${e.res ? ` r${e.res}` : ""}" data-cal-jogo="${SEG.esc(e.id)}" style="--cc:${compCor(e.comp)}" aria-label="${SEG.esc(rot)}" title="${SEG.esc(rot)}">${calCrest(e, 24)}<span class="cal-x">${e.state === "in" ? `<i class="cal-vivo"></i>` : ""}${quando}</span></button>`;
      }).join("")}</div>`;
    }
    const comps = [...new Set(jogos.map((e) => e.comp))];
    const lista = jogos.map((e) => `<li><button type="button" class="cal-l ${e.state}${e.res ? ` r${e.res}` : ""}" data-cal-jogo="${SEG.esc(e.id)}" style="--cc:${compCor(e.comp)}">
        <span class="cal-ld"><b>${e.date.slice(8, 10)}/${e.date.slice(5, 7)}</b><small>${WD[new Date(`${e.date}T12:00:00-03:00`).getDay()]}</small></span>
        <span class="cal-lo">${calCrest(e, 28)}<span><b>${e.home ? "" : "@ "}${calNome(e)}</b><small class="cal-comp">${SEG.esc(e.comp)}${e.stage ? ` · ${SEG.esc(e.stage)}` : ""}</small></span></span>
        <span class="cal-lp">${e.state === "post" ? `<b>${calPlacar(e)}</b>${e.pen ? `<small>pên. ${e.home ? `${e.pen[0]}–${e.pen[1]}` : `${e.pen[1]}–${e.pen[0]}`}</small>` : ""}` : e.state === "in" ? `<b class="vivo">${calPlacar(e)}</b><small>● ${SEG.esc(e.clock || "ao vivo")}</small>` : `<b class="hora">${e.time || "A definir"}</b>`}</span>
        <span class="cal-lr">${e.res ? `<i class="fm-res ${e.res}">${e.res}</i>` : ""}</span>
        <span class="cal-lv">${SEG.esc(estadio(e.venue) || "Local a definir")}</span></button></li>`).join("");
    return `<div class="cal-top">
        <button type="button" class="cal-nav" data-cal-nav="-1" ${i <= 0 ? "disabled" : ""} aria-label="Mês anterior">‹</button>
        <h4 class="cal-mes" aria-live="polite">${mesNome(mes)}</h4>
        <button type="button" class="cal-nav" data-cal-nav="1" ${i >= ms.length - 1 ? "disabled" : ""} aria-label="Próximo mês">›</button>
        <button type="button" class="chip cal-hoje" data-cal-hoje ${mes === calMesInicial(d) ? "hidden" : ""}>Hoje</button>
      </div>
      <div class="cal-resumo">${jogos.length ? `<span><b>${jogos.length}</b> jogo${jogos.length > 1 ? "s" : ""}</span>${feitos.length ? `<span class="v"><b>${n("V")}</b>V</span><span class="e"><b>${n("E")}</b>E</span><span class="d"><b>${n("D")}</b>D</span>` : ""}` : `<span>Sem jogos neste mês</span>`}
        ${comps.map((x) => `<span class="cal-leg" style="--cc:${compCor(x)}"><i></i>${SEG.esc(x)}</span>`).join("")}</div>
      <div class="cal-grade" role="grid" aria-label="Jogos do ${c.abbr} em ${mesNome(mes)}">${WD.map((w) => `<div class="cal-w" aria-hidden="true">${w}</div>`).join("")}${cel}</div>
      <div class="cal-detalhe" data-cal-det hidden></div>
      ${jogos.length ? `<ol class="cal-lista">${lista}</ol>` : ""}
      <div class="source">Todas as competições que o ${c.abbr} disputa na temporada${d.all.some((e) => e.src === "API-Football") ? "" : " (estaduais do PR, BA, SC e PA e Copa do Nordeste/Verde só com a API-Football)"} · fonte: ESPN${d.all.some((e) => e.src === "API-Football") ? " e API-Football" : ""} · horários de Brasília · placar com o mandante primeiro · toque num jogo para ver as estatísticas</div>`;
  }
  function calendarCard(id) {
    return `<div class="card reveal cal" data-cal="${id}"><div class="card-h">Calendário <small>todas as competições</small></div>${calInner(id, window.CLUB_FORM?.clubs?.[id])}</div>`;
  }
  // partida do Brasileirão no site (para o link "Ver a partida")
  function calPartida(id, e) {
    if (e.comp !== "Brasileirão" || !e.oppId) return null;
    const [h, a] = e.home ? [id, e.oppId] : [e.oppId, id];
    for (const [rd, l] of Object.entries(window.PD.FIXTURES || {})) if (l.some((g) => g[0] === h && g[1] === a)) return `#/partida/${h}-x-${a}-r${rd}`;
    return null;
  }
  function calDetalhe(box, id, e) {
    const c = byId[id], o = calOpp(e), d = window.CLUB_FORM?.clubs?.[id];
    const [H, A] = e.home ? [{ club: c, nome: c.name }, { club: o, nome: o?.name || e.opp, e }] : [{ club: o, nome: o?.name || e.opp, e }, { club: c, nome: c.name }];
    const lado = (t) => `<div class="cd-t">${t.club ? crest(t.club, 56) : calCrest(t.e, 56)}<b>${SEG.esc(t.club?.abbr || t.nome)}</b></div>`;
    const data = new Date(`${e.date}T12:00:00-03:00`), dataTxt = `${["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][data.getDay()]}, ${e.date.slice(8, 10)}/${e.date.slice(5, 7)}/${e.date.slice(0, 4)}`;
    const meio = e.state === "post" ? `<b class="cd-placar">${calPlacar(e).replace("–", "<i>×</i>")}</b>${e.pen ? `<small>pênaltis ${e.home ? `${e.pen[0]}–${e.pen[1]}` : `${e.pen[1]}–${e.pen[0]}`}</small>` : ""}<span class="fm-res ${e.res}">${{ V: "Vitória", E: "Empate", D: "Derrota" }[e.res]} do ${c.abbr}</span>`
      : e.state === "in" ? `<b class="cd-placar vivo">${calPlacar(e).replace("–", "<i>×</i>")}</b><small class="vivo">● ${SEG.esc(e.clock || "ao vivo")}</small>`
      : `<b class="cd-hora">${e.time || "A definir"}</b><small>${(() => { const k = Math.round((Date.parse(`${e.date}T12:00:00-03:00`) - Date.parse(`${dayKey(new Date())}T12:00:00-03:00`)) / 864e5); return k === 0 ? "é hoje" : k === 1 ? "é amanhã" : `faltam ${k} dias`; })()}</small>`;
    const link = calPartida(id, e);
    // antes do jogo: os confrontos com esse adversário na temporada e a fase do clube
    const confrontos = (d?.all || []).filter((x) => x.state === "post" && x.id !== e.id && ((x.oppId && x.oppId === e.oppId) || (!x.oppId && x.opp === e.opp)));
    const ult5 = (d?.all || []).filter((x) => x.state === "post" && x.date < e.date).slice(-5);
    const preJogo = `<div class="cd-sec"><h5>Antes do jogo</h5><ul class="cd-fatos">
        <li><span>Últimos 5 do ${c.abbr}</span><b class="fm-strip">${ult5.map((x) => `<i class="fm-res ${x.res}" title="${x.date.slice(8, 10)}/${x.date.slice(5, 7)} · ${calNome(x)} ${calPlacar(x)}">${x.res}</i>`).join("") || "—"}</b></li>
        <li><span>Contra o ${calNome(e)} na temporada</span><b>${confrontos.length ? confrontos.map((x) => `${calPlacar(x)} <small>(${SEG.esc(x.comp)})</small>`).join(" · ") : "primeiro jogo"}</b></li>
        <li><span>Mando</span><b>${e.home ? "em casa" : "fora de casa"}</b></li></ul></div>`;
    box.innerHTML = `<button type="button" class="cd-fechar" data-cal-fechar aria-label="Fechar as estatísticas">×</button>
      <div class="cd-meta" style="--cc:${compCor(e.comp)}"><span class="cd-comp"><i></i>${SEG.esc(e.comp)}${e.stage ? ` · ${SEG.esc(e.stage)}` : ""}</span><span>${dataTxt}${e.time && e.state !== "pre" ? ` · ${e.time}` : ""}</span><span>${SEG.esc(estadio(e.venue) || "Local a definir")}</span></div>
      <div class="cd-placarbox">${lado(H)}<div class="cd-meio">${meio}</div>${lado(A)}</div>
      <div class="cd-corpo">${e.state === "pre" ? preJogo : `<div class="empty" style="padding:18px">Carregando as estatísticas…</div>`}</div>
      ${link ? `<a class="cd-link" href="${link}">Ver a partida completa ›</a>` : ""}`;
    box.hidden = false;
    box.dataset.jogo = e.id;
    if (e.state === "pre") return;
    if (!e.lg || e.src === "API-Football") { $(".cd-corpo", box).innerHTML = `<p class="cd-nada">Estatísticas detalhadas não disponíveis para esta competição.</p>`; return; }
    LIVE.jogo(e.id, e.lg).then((s) => {
      if (!box.isConnected || box.dataset.jogo !== e.id) return;
      const corpo = $(".cd-corpo", box);
      if (!s) { corpo.innerHTML = `<p class="cd-nada">Não foi possível carregar as estatísticas agora.</p>`; return; }
      const cor = (side) => display((side === "home" ? H : A).club || c);
      const gols = (side) => s.gols.filter((g) => g.lado === side).map((g) => `<li>${SEG.esc(g.nome || "Gol")}${g.pen ? " <small>(pên.)</small>" : g.contra ? " <small>(contra)</small>" : ""} <b>${SEG.esc(g.min)}</b></li>`).join("");
      const verm = (side) => s.vermelhos.filter((g) => g.lado === side).map((g) => `<li><i class="rk-card r"></i>${SEG.esc(g.nome)} <b>${SEG.esc(g.min)}</b></li>`).join("");
      const barras = s.stats.map(([rot, h, a, u]) => {
        const t = h + a || 1, ph = h + a ? Math.round((h / t) * 100) : 50;
        return `<li><span class="cd-v">${h}${u}</span><span class="cd-r">${rot}<span class="cd-bar${h + a ? "" : " zero"}" style="--ph:${ph}%;--ch:${cor("home")};--ca:${cor("away")}"><i></i><i></i></span></span><span class="cd-v">${a}${u}</span></li>`;
      }).join("");
      corpo.innerHTML = `${s.gols.length || s.vermelhos.length ? `<div class="cd-gols"><ul>${gols("home")}${verm("home")}</ul><span class="cd-bola" aria-hidden="true">⚽</span><ul class="dir">${gols("away")}${verm("away")}</ul></div>` : `<p class="cd-nada">${s.state === "in" ? "Ainda sem gols." : "Jogo sem gols."}</p>`}
        ${barras ? `<ul class="cd-stats">${barras}</ul>` : `<p class="cd-nada">A ESPN ainda não publicou as estatísticas deste jogo.</p>`}
        <div class="cd-info">${s.arbitro ? `<span>Árbitro: <b>${SEG.esc(s.arbitro)}</b></span>` : ""}${s.publico ? `<span>Público: <b>${(+s.publico).toLocaleString("pt-BR")}</b></span>` : ""}${s.cidade ? `<span>${SEG.esc(s.cidade)}</span>` : ""}<span>fonte: ESPN</span></div>`;
    });
  }



  /* artilheiros de um clube: top 5 pelas súmulas (quem está na artilharia oficial fica com o número da CBF);
     sem os dados das súmulas, cai na artilharia oficial filtrada pelo clube */
  // artilharia com os gols dos jogos de agora (js/live.js); sem os dados das súmulas, a artilharia oficial
  const ART = () => (window.PD.aoVivoArtilharia ? window.PD.aoVivoArtilharia() : null);
  function artilhariaGeral() {
    const L = ART();
    return L ? L.geral : REAL.scorers.map(([n, c, g]) => [n, c, g, 0, false, null]);
  }
  const golHoje = (vivo, rolando) => (vivo ? `<span class="gol-hoje${rolando ? " on" : ""}" title="${vivo} ${vivo > 1 ? "gols" : "gol"} ${rolando ? "no jogo de agora" : "ainda fora das súmulas gravadas"}">+${vivo}${rolando ? " ao vivo" : ""}</span>` : "");
  // artilheiro que já saiu do clube: os gols pelo clube continuam na lista, com o aviso
  const saiuDo = (name, cid) => (window.PLAYER_STATS?.artilhariaClubes?.[cid] || []).some((x) => x.name === name && x.noClube === false);
  function clubTop(cid, n = 5) {
    const L = ART();
    if (L && L.clubs[cid]) return L.clubs[cid].slice(0, n).map((p, k) => ({ name: p.name, gols: p.g, pos: L.posDe[p.aid], rank: k + 1, vivo: p.vivo, rolando: !!p.rolando, saiu: saiuDo(p.name, cid) }));
    const t = window.PLAYER_STATS?.artilhariaClubes?.[cid];
    if (t) return t.slice(0, n).map((p) => ({ name: p.name, gols: p.gols, pos: p.pos, rank: p.rank, saiu: p.noClube === false }));
    return REAL.scorers.map(([name, c, gols], k) => ({ name, c, gols, pos: k + 1 })).filter((x) => x.c === cid).slice(0, n).map((x, k) => ({ ...x, rank: k + 1 }));
  }
  const scorerAttrs = (name, cid) => (scorerOf(name, cid) ? ` class="has-ficha" data-scorer="${name}|${cid}" tabindex="0" aria-label="Ficha de ${name}"` : "");
  function scorersCard(limit = 10, clubId = null) {
    if (clubId) {
      const list = clubTop(clubId, limit), c = byId[clubId];
      if (!list.length) return "";
      return `<div class="card reveal" data-live="art-clube"><div class="card-h">Artilheiros do ${c.abbr} <small>Brasileirão</small></div>
        <ul class="squad-list">${list.map((p) => `<li${scorerAttrs(p.name, clubId)}><span class="n">${p.rank}º</span><div style="flex:1;min-width:0"><b>${p.name}</b>${golHoje(p.vivo, p.rolando)}${p.pos || p.saiu ? `<small class="sl-sub">${[p.pos ? `${p.pos}º na artilharia` : "", p.saiu ? "saiu do clube" : ""].filter(Boolean).join(" · ")}</small>` : ""}<div class="bar" style="height:5px;margin-top:5px"><i data-w="${(p.gols / list[0].gols) * 100}" style="background:${display(c)}"></i></div></div><b class="goals">${p.gols}</b>${scorerOf(p.name, clubId) ? `<span class="sc-more" aria-hidden="true">›</span>` : ""}</li>`).join("")}</ul>
        ${list.some((p) => scorerOf(p.name, clubId)) ? `<div class="source">Clique (ou toque) no jogador para ver a ficha; clique de novo para fechar</div>` : ""}</div>`;
    }
    const geral = artilhariaGeral(), list = geral.slice(0, limit);
    if (!list.length) return "";
    const max = geral[0][2];
    return `<div class="card reveal" data-live="art"><div class="card-h">Artilharia <small>${geral.some((x) => x[4]) ? "ao vivo · " : ""}${REAL.source}</small></div>
      <ul class="squad-list">${list.map(([name, cid, g, vivo, rolando], k) => {
        const ficha = scorerOf(name, cid);
        return `<li${scorerAttrs(name, cid)}><span class="n">${k + 1}º</span>${crest(byId[cid], 36)}<div style="flex:1;min-width:0"><b>${name}</b>${golHoje(vivo, rolando)}<div class="bar" style="height:5px;margin-top:5px"><i data-w="${(g / max) * 100}" style="background:${display(byId[cid])}"></i></div></div><b class="goals">${g}</b>${ficha ? `<span class="sc-more" aria-hidden="true">›</span>` : ""}</li>`;
      }).join("")}</ul>${list.some(([n, c]) => scorerOf(n, c)) ? `<div class="source">Clique (ou toque) no jogador para ver a ficha; clique de novo para fechar</div>` : ""}</div>`;
  }

  /* partida: top 5 de cada time lado a lado (1º contra 1º, 2º contra 2º...), como nos comparativos dos apps */
  function scorersDuel(m) {
    const H = clubTop(m.home), A = clubTop(m.away), h = byId[m.home], a = byId[m.away];
    if (!H.length && !A.length) return "";
    const max = Math.max(H[0]?.gols || 0, A[0]?.gols || 0, 1);
    const tot = (L) => L.reduce((t, p) => t + p.gols, 0);
    const cell = (p, c, side) => p ? `<div class="sd-p sd-${side}${scorerOf(p.name, c.id) ? ` has-ficha" data-scorer="${p.name}|${c.id}" tabindex="0" aria-label="Ficha de ${p.name}` : ""}">
        <span class="sd-nm"><b>${p.name}</b>${p.pos || p.vivo || p.saiu ? `<small>${[p.pos ? `${p.pos}º geral` : "", p.saiu ? "saiu do clube" : ""].filter(Boolean).join(" · ")}${golHoje(p.vivo, p.rolando)}</small>` : ""}</span>
        <b class="sd-g">${p.gols}</b>
        <i class="sd-bar" style="--f:${(p.gols / max).toFixed(3)};--c:${display(c)}"></i></div>` : `<div class="sd-p sd-${side} sd-none">—</div>`;
    const rows = Array.from({ length: Math.max(H.length, A.length) }, (_, k) => `<li>${cell(H[k], h, "h")}<span class="sd-k">${k + 1}º</span>${cell(A[k], a, "a")}</li>`).join("");
    return `<div class="card reveal scorers-duel" data-live="duel"><div class="card-h">Artilheiros dos dois times <small>top 5 · Brasileirão</small></div>
      <div class="sd-head"><div class="sd-t">${crest(h, 42)}<b>${h.abbr}</b></div><span class="sd-vs">gols</span><div class="sd-t sd-ta"><b>${a.abbr}</b>${crest(a, 42)}</div></div>
      <ul class="sd-list">${rows}</ul>
      <div class="sd-foot"><span><b>${tot(H)}</b> gols do top 5</span><span><b>${tot(A)}</b> gols do top 5</span></div>
      <div class="source">Súmulas da ESPN; quem está no top 10 da CBF aparece com o número oficial. Gols contra não entram.${H.some((p) => scorerOf(p.name, m.home)) || A.some((p) => scorerOf(p.name, m.away)) ? " Clique (ou toque) no jogador para ver a ficha; clique de novo para fechar." : ""}</div></div>`;
  }

  /* ---------- Ficha do artilheiro (cartão flutuante) ----------
     Dados do elenco e das súmulas da ESPN de todos os jogos do Brasileirão (gravados pela API / GitHub Actions). */
  const fichaDe = (name, cid) => (window.PLAYER_STATS?.artilheiros || []).find((x) => x.name === name && x.club === cid && x.jogos)
    || (window.PLAYER_STATS?.artilhariaClubes?.[cid] || []).find((x) => x.name === name && x.jogos);
  // a ficha soma os gols de agora (que ainda não estão nas súmulas gravadas)
  function scorerOf(name, cid) {
    const f = fichaDe(name, cid), t = f && ART()?.tot[f.id];
    if (!f || !t || !t.vivo) return f;
    // contra quem marcou e por qual clube: súmulas gravadas + gols dos jogos de agora
    const adv = Object.fromEntries(f.adversarios.map(([k, g]) => [k, g]));
    for (const [k, g] of Object.entries(t.adv)) adv[k] = (adv[k] || 0) + g;
    const clubes = f.clubes.map(([k, j, g]) => [k, j, g]);
    for (const [k, x] of Object.entries(t.porClube)) {
      const c = clubes.find((r) => r[0] === k);
      if (c) { c[1] += x.jogos; c[2] += x.gols; } else clubes.push([k, x.jogos, x.gols]);
    }
    return { ...f, gols: t.g, aoVivo: t.vivo, pos: ART().posDe[f.id] || null, golsSumulas: (f.golsSumulas || 0) + t.vivo,
      jogosComGol: (f.jogosComGol || 0) + t.jogosGol, ultimoGol: t.ultimo && t.ultimo > (f.ultimoGol || "") ? t.ultimo : f.ultimoGol,
      adversarios: Object.entries(adv).sort((a, b) => b[1] - a[1]), adversariosVivo: t.adv,
      clubes: clubes.sort((a, b) => b[2] - a[2] || b[1] - a[1]) };
  }
  const POSICAO = { G: "Goleiro", D: "Defensor", M: "Meio-campista", F: "Atacante" };
  const dataBR = (d) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "—");
  function scorerHTML(p) {
    const c = byId[p.club], cor = display(c);
    const fatos = [
      ["Posição", POSICAO[p.posicao] || "—"], ["Idade", p.idade ? `${p.idade} anos` : "—"], ["Camisa", p.camisa ?? "—"],
      ["Jogos", `${p.jogos} <small>(${p.titular} como titular)</small>`], ["Minutos", p.min.toLocaleString("pt-BR")],
      ["Gols por jogo", (p.gols / p.jogos).toFixed(2).replace(".", ",")], ["Minutos por gol", p.gols ? Math.round(p.min / p.gols) : "—"],
      ["Assistências", p.assist], ["Finalizações", `${p.chutes} <small>(${p.noAlvo} no alvo)</small>`], ["Gols de pênalti", p.pen],
      ["Cartões", `${p.amarelos} 🟨 · ${p.vermelhos} 🟥`], ["Último gol", dataBR(p.ultimoGol)],
    ];
    const maxAdv = p.adversarios[0]?.[1] || 1;
    return `<div class="sc-h" style="--sc:${cor}">
        ${crest(c, 52)}
        <div><b>${p.name}</b><small>${c.name} · ${p.pos ? `${p.pos}º na artilharia` : `${p.rank}º artilheiro do clube`}</small></div>
        <div class="sc-g"><b>${p.gols}</b><small>${p.aoVivo ? `gols · +${p.aoVivo} hoje` : "gols"}</small></div>
      </div>
      <div class="sc-sec">Ficha técnica</div>
      <dl class="sc-ficha">${fatos.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      ${p.clubes.length ? `<div class="sc-sec">Gols por clube na temporada</div>
        <ul class="sc-clubes">${p.clubes.map(([k, j, g]) => `<li>${crest(byId[k], 26)}<span>${byId[k].abbr}</span><small>${j} jogos</small><b>${g}</b></li>`).join("")}</ul>` : ""}
      <div class="sc-sec">Contra quem marcou <small>${p.adversarios.length} clubes</small></div>
      ${p.adversarios.length ? `<ul class="sc-adv">${p.adversarios.map(([k, g]) => `<li>${crest(byId[k], 26)}<span>${byId[k].abbr}</span><i style="--w:${(g / maxAdv) * 100}%;background:${cor}"></i><b>${g}${p.adversariosVivo?.[k] ? `<small class="sc-hoje">+${p.adversariosVivo[k]} hoje</small>` : ""}</b></li>`).join("")}</ul>` : `<p class="sc-none">Nenhum gol nas súmulas.</p>`}
      <div class="sc-src">Súmulas: ESPN${p.golsSumulas !== p.gols ? ` · ${p.golsSumulas} gols nas súmulas do Brasileirão` : ""}</div>`;
  }
  let scTip = null;
  /* ficha do artilheiro: abre e fecha no clique (mouse, toque ou Enter/Espaço), como um botão.
     Fica aberta enquanto a pessoa rola a ficha ou a página; fecha clicando de novo no jogador, fora dela, no ✕ ou com Esc. */
  function scorerCards(root) {
    const items = $$("[data-scorer]", root);
    if (!items.length) return;
    if (!scTip) {
      scTip = document.createElement("div");
      scTip.className = "scorer-card";
      scTip.setAttribute("role", "dialog");
      scTip.setAttribute("aria-hidden", "true");
      document.body.appendChild(scTip);
      document.addEventListener("pointerdown", (e) => { if (scTip.classList.contains("open") && !e.target.closest("[data-scorer], .scorer-card")) hideScorer(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && scTip.classList.contains("open")) { const el = $(`[data-scorer].peek`); hideScorer(); el?.focus(); } });
      scTip.addEventListener("click", (e) => { if (e.target.closest(".sc-close")) { const el = $(`[data-scorer].peek`); hideScorer(); el?.focus(); } });
      addEventListener("hashchange", hideScorer);
      addEventListener("resize", hideScorer);
      let raf = 0;
      addEventListener("scroll", () => { if (scTip.classList.contains("open") && !raf) raf = requestAnimationFrame(() => { raf = 0; placeScorer(false); }); }, { passive: true });
    }
    items.forEach((el) => {
      if (el._ficha) return;
      el._ficha = true;
      const [name, cid] = el.dataset.scorer.split("|");
      el.setAttribute("role", "button");
      el.setAttribute("aria-expanded", "false");
      const toggle = () => {
        const aberto = scTip.dataset.for === el.dataset.scorer && scTip.classList.contains("open");
        if (aberto) return hideScorer();
        const p = scorerOf(name, cid);
        if (p) showScorer(el, p);
      };
      el.addEventListener("click", (e) => { if (!e.target.closest("a")) toggle(); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
  }
  function showScorer(el, p) {
    $$("[data-scorer].peek").forEach((x) => { x.classList.remove("peek"); x.setAttribute("aria-expanded", "false"); });
    el.classList.add("peek");
    el.setAttribute("aria-expanded", "true");
    scTip.innerHTML = `<button type="button" class="sc-close" aria-label="Fechar a ficha">✕</button>` + scorerHTML(p);
    scTip.setAttribute("aria-label", `Ficha de ${p.name}`);
    scTip.dataset.for = el.dataset.scorer;
    scTip.scrollTop = 0;
    scAnchor = el;
    placeScorer(true);
    scTip.classList.add("open");
    scTip.setAttribute("aria-hidden", "false");
  }
  /* posição da ficha. Computador largo: ao lado da lista. Celular / tela baixa: acima ou abaixo do jogador,
     sem cobri-lo (para tocar nele de novo e fechar), com a altura do espaço livre e rolagem por dentro; sem espaço,
     a página sobe até o jogador ficar perto do topo. Ao rolar a página, a ficha acompanha o jogador. */
  let scAnchor = null, scSide = "below";
  function placeScorer(first) {
    const el = scAnchor, w = Math.min(340, innerWidth - 24);
    if (!el || !el.isConnected) return hideScorer();
    let b = el.getBoundingClientRect();
    const beside = innerWidth >= 900 && b.left - w - 14 > 12;
    if (first) { scTip.style.width = w + "px"; scTip.style.maxHeight = ""; }
    let h = scTip.offsetHeight;
    if (beside) {
      scTip.style.left = b.left - w - 14 + "px";
      scTip.style.top = Math.max(12, Math.min(innerHeight - h - 12, b.top + b.height / 2 - h / 2)) + "px";
      return;
    }
    const head = Math.max(0, $(".header")?.getBoundingClientRect().bottom || 0), gap = 8, topMin = Math.max(12, head + 4);
    if (first) {
      let below = innerHeight - b.bottom - gap - 12, above = b.top - gap - topMin;
      if (h > below && h > above && Math.max(below, above) < Math.min(h, 300)) {
        scrollBy({ top: b.top - topMin, behavior: "instant" });
        b = el.getBoundingClientRect();
        below = innerHeight - b.bottom - gap - 12; above = b.top - gap - topMin;
      }
      scSide = h <= below || below >= above ? "below" : "above";
      if (h > (scSide === "below" ? below : above)) { scTip.style.maxHeight = Math.max(below, above) + "px"; h = scTip.offsetHeight; }
      scTip.style.left = Math.max(12, Math.min(innerWidth - w - 12, b.left + b.width / 2 - w / 2)) + "px";
    }
    scTip.style.top = (scSide === "below" ? b.bottom + gap : b.top - gap - h) + "px";
  }
  function hideScorer() {
    if (!scTip) return;
    scTip.classList.remove("open");
    scTip.setAttribute("aria-hidden", "true");
    $$("[data-scorer].peek").forEach((x) => { x.classList.remove("peek"); x.setAttribute("aria-expanded", "false"); });
  }

  /* pontos de todos os clubes, com o clube atual em destaque */
  function pointsChart(id) {
    const rows = state.standings, w = 640, h = 220, pb = 26, pt = 14, bw = w / rows.length;
    const max = rows[0].p;
    const Y = (p) => pt + (1 - p / max) * (h - pt - pb);
    return `<svg class="chart pts-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <line x1="0" x2="${w}" y1="${Y(rows[3].p)}" y2="${Y(rows[3].p)}" stroke="#1f6feb" stroke-dasharray="4 4"/>
      <line x1="0" x2="${w}" y1="${Y(rows[16].p)}" y2="${Y(rows[16].p)}" stroke="#ff4d5e" stroke-dasharray="4 4"/>
      <text x="${w - 4}" y="${Y(rows[3].p) - 4}" text-anchor="end">G4 · ${rows[3].p}</text>
      <text x="${w - 4}" y="${Y(rows[16].p) - 4}" text-anchor="end">Z4 · ${rows[16].p}</text>
      ${rows.map((r, i) => {
        const me = r.id === id, c = byId[r.id];
        return `<g><rect x="${i * bw + 3}" y="${Y(r.p)}" width="${bw - 6}" height="${h - pb - Y(r.p)}" rx="3" fill="${me ? display(c) : "var(--surface-3)"}" style="animation-delay:${i * 30}ms"/>
          ${me ? `<text x="${i * bw + bw / 2}" y="${Y(r.p) - 5}" text-anchor="middle" style="fill:var(--text);font-weight:800">${r.p}</text>` : ""}
          <text x="${i * bw + bw / 2}" y="${h - 9}" text-anchor="middle" style="${me ? "fill:var(--text);font-weight:800" : ""}">${c.short}</text></g>`;
      }).join("")}
    </svg>`;
  }

  const legend = `<div class="legend"><span><i style="background:#1f6feb"></i>Libertadores</span><span><i style="background:#1a9b8f"></i>Pré-Libertadores</span><span><i style="background:#7a5af8"></i>Sul-Americana</span><span><i style="background:var(--loss)"></i>Rebaixamento</span></div>`;

  /* comparação dos dois times com os números reais do campeonato */
  function compareHTML(m, limit = 99) {
    const A = rowOf(m.home), B = rowOf(m.away);
    const hc = display(byId[m.home]), ac = display(byId[m.away]);
    const rows = [
      ["Pontos", A.p, B.p], ["Aproveitamento", A.pct, B.pct, "%"], ["Vitórias", A.w, B.w],
      ["Gols marcados", A.gf, B.gf], ["Gols sofridos", A.ga, B.ga], ["Cartões amarelos", A.ca, B.ca], ["Cartões vermelhos", A.cv, B.cv],
    ];
    return rows.slice(0, limit).map(([label, a, b, unit = ""]) => {
      const t = a + b || 1;
      return `<div class="stat-row"><header><b>${a}${unit}</b><span>${label}</span><b>${b}${unit}</b></header>
        <div class="bars"><div class="bar"><i data-w="${(a / t) * 100}" style="background:${hc}"></i></div><div class="bar"><i data-w="${(b / t) * 100}" style="background:${ac}"></i></div></div></div>`;
    }).join("");
  }

  function scoreline(m, link = true, tam = 46) {
    const h = byId[m.home], a = byId[m.away];
    const started = m.status === "ft" || (m.status === "progress" && m.hs != null);
    const st = `<div class="status ${m.status === "progress" ? "" : "ft"}">${statusText(m)}</div>`;
    const side = (c, size) => link ? `<a href="#/clube/${c.id}" class="side">${crest(c, size)}<span>${c.abbr}</span></a>` : `<div class="side">${crest(c, size)}<span>${c.abbr}</span></div>`;
    return `<div class="scoreline">${side(h, tam)}<div><div class="big" data-score>${started ? `${m.hs} - ${m.as}` : "vs"}</div>${st}</div>${side(a, tam)}</div>`;
  }

  /* ==========================================================================
     Páginas
     ========================================================================== */
  function pageHome() {
    const list = state.round === ROUND ? state.matches : realMatches(state.round);
    const counts = { ft: list.filter((m) => m.status === "ft").length, ns: list.filter((m) => m.status !== "ft").length };
    const filtered = list.filter((m) =>
      state.filter === "all" ? true :
      state.filter === "fav" ? state.favs.has(m.home) || state.favs.has(m.away) :
      state.filter === "ft" ? m.status === "ft" : m.status !== "ft");
    const feats = featuredList(), fi = featIndex(feats), featured = feats[fi];
    const favClubs = CLUBS.filter((c) => state.favs.has(c.id));
    const round = state.round;
    const ri = ROUNDS.indexOf(round);
    // agrupa por dia, como nos apps de resultados
    const groups = [];
    filtered.forEach((m) => {
      const g = groups.find((x) => x.date === m.date);
      g ? g.items.push(m) : groups.push({ date: m.date, items: [m] });
    });
    let n = 0;

    return `<div class="layout">
      <aside class="left sticky">
        <div class="card">
          <div class="card-h">Favoritos <small>${favClubs.length}</small></div>
          <div class="side-list">${favClubs.length ? favClubs.map((c) => `<a href="#/clube/${c.id}" style="--club:${display(c)}">${crest(c, 30)}${c.abbr}<span class="count">${rowOf(c.id).pos}º</span></a>`).join("") : `<p class="empty" style="padding:16px">Toque na ★ de uma partida para favoritar.</p>`}</div>
        </div>
        <div class="card">
          <div class="card-h">Competições</div>
          <div class="side-list">
            <a href="#/tabela">${flagBR}Brasileirão Série A<span class="count">20</span></a>
            <a href="#/clubes">${flagBR}Todos os clubes<span class="count">20</span></a>
          </div>
        </div>
        <div class="card">
          <div class="card-h">Clubes</div>
          <div class="side-list">${CLUBS.map((c) => `<a href="#/clube/${c.id}" style="--club:${display(c)}">${crest(c, 30)}${c.abbr}</a>`).join("")}</div>
        </div>
      </aside>

      <section>
        <h1 class="sr-only">Placar ao vivo do Brasileirão Série A 2026 — ${round}ª rodada</h1>
        <div class="card">
          <div class="round-nav">
            <button data-round="${ROUNDS[ri - 1] ?? ""}" ${ri > 0 ? "" : "disabled"} aria-label="Rodada anterior">‹</button>
            <div><b>${round}ª rodada</b><small>Brasileirão Série A 2026</small></div>
            <button data-round="${ROUNDS[ri + 1] ?? ""}" ${ri < ROUNDS.length - 1 ? "" : "disabled"} aria-label="Próxima rodada">›</button>
          </div>
          <div class="tabs" data-tabs>
            <span class="tab-ink"></span>
            <button class="tab ${state.filter === "all" ? "on" : ""}" data-filter="all">Todos</button>
            <button class="tab ${state.filter === "ft" ? "on" : ""}" data-filter="ft"><span class="l-long">Encerrados</span><span class="l-short">Fim</span> (${counts.ft})</button>
            <button class="tab ${state.filter === "ns" ? "on" : ""}" data-filter="ns"><span class="l-long">A disputar</span><span class="l-short">A jogar</span> (${counts.ns})</button>
            <button class="tab ${state.filter === "fav" ? "on" : ""}" data-filter="fav">★ Favoritos</button>
          </div>
          <div class="league-h">${flagBR}<span>BRASIL: Série A <small>· ${round}ª rodada</small></span><a href="#/tabela">Tabela ›</a></div>
          <div id="match-list">${groups.length ? groups.map((g) => `<div class="day-h">${dayName(g.date)}</div>${g.items.map((m) => matchRow(m, n++)).join("")}`).join("") : `<div class="empty">Nenhuma partida neste filtro.</div>`}</div>
          <div class="source">Jogos e resultados: ge.globo · tabela: CBF</div>
        </div>
      </section>

      <aside>
        ${featureCard(feats, fi)}
        ${voteCard(featured)}
        ${scorersCard(5)}
        <div class="card">
          <div class="card-h">Classificação <small><a href="#/tabela" style="color:var(--ink)">ver completa ›</a></small></div>
          ${standingsTable(state.standings.slice(0, 8), null, true)}${sourceNote}
        </div>
      </aside>
    </div>`;
  }

  function pageClubs() {
    const regions = { Todos: null, Sudeste: ["SP", "RJ", "MG"], Sul: ["PR", "RS", "SC"], "Norte/Nordeste": ["BA", "PA"] };
    const cur = state.region || "Todos";
    const list = CLUBS.filter((c) => !regions[cur] || regions[cur].includes(c.uf));
    return `<div class="page-head">
        <div><div class="eyebrow">Brasileirão · ${CLUBS.length} clubes</div><h1>Escolha seu<br/>clube</h1><p>Cada clube ganha uma página própria com as cores da camisa e uma aparição animada do escudo, inspirada no que ele significa.</p></div>
        <div class="chips">${Object.keys(regions).map((r) => `<button class="chip ${r === cur ? "on" : ""}" data-region="${r}">${r}</button>`).join("")}</div>
      </div>
      <div class="clubs">${list.map((c, i) => `
        <a class="club-card" href="#/clube/${c.id}" style="${clubVars(c)};--i:${i}" data-tilt>
          <div class="kit-bg" style="background:${kitBg(c)}"></div>
          <div class="card-scene">${SCENES.scene(c, "card")}</div>
          <div class="crest-wrap">${crest(c, 80, true)}</div>
          <span class="rank">${rowOf(c.id).pos}º</span>
          <div class="info"><h3>${c.abbr}</h3><p><span>${SCENES.caption(c.id)}</span><span>${c.city} · ${c.uf}</span></p></div>
          <span class="go">${ICON.arrow}</span>
        </a>`).join("")}</div>`;
  }

  // crédito da foto da cidade que aparece ao fundo da cena (licença livre do Wikimedia Commons)
  function fotoCidade(id) {
    const f = window.HERO_SCENES?.foto?.(id);
    if (!f) return "";
    const e = (x) => (window.SEG ? SEG.esc(x) : String(x).replace(/[&<>"']/g, ""));
    const txtFoto = `Foto: ${f.autor} · ${f.licenca} · Wikimedia Commons`;
    // com o vídeo da cidade (Pexels): o crédito é do vídeo; se o vídeo não tocar, volta o da foto
    const v = window.HERO_SCENES?.video?.(id), semVideo = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("estatico");
    if (v && !semVideo) return `<a class="hero-credit" href="${e(v.pagina)}" target="_blank" rel="noopener noreferrer" title="${e(v.titulo)} — vídeo no Pexels" data-foto="${e(txtFoto)}" data-foto-href="${e(f.pagina)}">Vídeo: ${e(v.autor)} · Pexels</a>`;
    return `<a class="hero-credit" href="${e(f.pagina)}" target="_blank" rel="noopener noreferrer" title="${e(f.nome)} — foto no Wikimedia Commons">${e(txtFoto)}</a>`;
  }
  // cenas de dia (mais claras) pedem uma sombra mais forte atrás do texto do topo
  const SCRIM = { bahia: 0.8, mirassol: 0.84, chapecoense: 0.62, coritiba: 0.6 };
  function pageClub(id, tab = "geral", extra) {
    const c = byId[id];
    if (!c) return pageNotFound();
    const r = rowOf(id);
    const words = c.name.split(" ");
    const m = state.matches.find((x) => x.home === id || x.away === id);
    const rival = byId[c.rival];
    const tabs = [["geral", "Visão geral"], ["partidas", "Partidas"], ["elenco", "Elenco"], ["estatisticas", "Estatísticas"], ["comparar", "Comparar"], ["tabela", "Tabela"]];
    let body = "";

    if (tab === "geral") {
      body = `<div class="kpis" data-live="kpis">
          <div class="kpi" style="--i:0"><small>Posição</small><b data-count="${r.pos}">0</b><em>${r.pos <= 4 ? "Zona de Libertadores" : r.pos <= 6 ? "Pré-Libertadores" : r.pos <= 12 ? "Zona de Sul-Americana" : r.pos >= 17 ? "Zona de rebaixamento" : "Meio da tabela"}</em></div>
          <div class="kpi" style="--i:1"><small>Pontos</small><b data-count="${r.p}">0</b><em>${r.pct}% de aproveitamento</em></div>
          <div class="kpi" style="--i:2"><small>Vitórias</small><b data-count="${r.w}">0</b><em>${r.d} empates · ${r.l} derrotas</em></div>
          <div class="kpi" style="--i:3"><small>Saldo</small><b data-count="${r.sg}" data-sign>0</b><em>${r.gf} marcados · ${r.ga} sofridos</em></div>
        </div>
        ${calendarCard(id)}
        <div class="grid-2">
          <div>
            <div class="card reveal">
              <div class="card-h">Pontos no campeonato <small>${REAL.source} · ${REAL.updated}</small></div>
              <div class="card-b">${pointsChart(id)}</div>
            </div>
            ${m ? `<div class="card reveal"><div class="card-h">Jogo da ${ROUND}ª rodada <small>${estadio(m.venue)}</small></div>
              <a class="card-b feature" href="#/partida/${m.id}" style="display:block;${matchVars(m)}">${scoreline(m, false)}<div style="margin-top:12px">${compareHTML(m, 4)}</div></a></div>` : ""}
            ${playerStatsHTML(id)}
          </div>
          <div>
            <div class="card reveal">
              <div class="card-h">Seu time <small><a href="#/clube/${id}/elenco" style="color:var(--ink)">montar ›</a></small></div>
              ${(() => {
                const s = LINEUP.load(id), ps = LINEUP.players(id), map = Object.fromEntries(ps.map((p) => [p.id, p]));
                const by = (g) => ps.filter((p) => p.pos === g).length;
                const ages = ps.filter((p) => p.age), avg = ages.reduce((t, p) => t + p.age, 0) / (ages.length || 1);
                return `<div class="card-b season-grid"><div><b>${ps.length}</b><small>jogadores no elenco</small></div><div><b>${avg.toFixed(1).replace(".", ",")}</b><small>idade média</small></div><div><b>${s.f}</b><small>sua formação</small></div></div>
                  <ul class="squad-list">${s.xi.slice(0, 11).map((pid) => map[pid]).filter(Boolean).slice(-4).reverse().map((p) => `<li><span class="n">${p.n ?? "–"}</span><b>${p.name}</b><span class="p">${{ G: "GOL", D: "DEF", M: "MEI", F: "ATA" }[p.pos]}</span></li>`).join("")}</ul>`;
              })()}
            </div>
            <div class="card reveal">
              <div class="card-h">Temporada <small>${r.j} jogos · dados reais</small></div>
              <div class="card-b season-grid">
                <div><b>${(r.gf / r.j).toFixed(2).replace(".", ",")}</b><small>gols por jogo</small></div>
                <div><b>${(r.ga / r.j).toFixed(2).replace(".", ",")}</b><small>sofridos por jogo</small></div>
                <div><b>${r.pos === 1 ? "Líder" : state.standings[0].p - r.p}</b><small>${r.pos === 1 ? `${r.p - state.standings[1].p} pts à frente` : "pts atrás do líder"}</small></div>
                <div><b>${r.p - state.standings[16].p > 0 ? "+" : ""}${r.p - state.standings[16].p}</b><small>pts sobre o Z4</small></div>
                <div><b>${r.ca}</b><small>cartões amarelos</small></div>
                <div><b>${r.cv}</b><small>cartões vermelhos</small></div>
              </div>
            </div>
            ${byId[nextOf(id)] ? `<div class="card reveal"><div class="card-h">Próximo adversário</div>
              <a class="derby" href="#/clube/${nextOf(id)}">${crest(c, 46)}<span class="vs">VS</span>${crest(byId[nextOf(id)], 46)}<div style="margin-left:6px"><b>${byId[nextOf(id)].name}</b><br/><small style="color:var(--text-3)">${rowOf(nextOf(id)).pos}º · ${rowOf(nextOf(id)).p} pts</small></div></a></div>` : ""}
            ${scorersCard(5, id)}
            ${c.idol ? `<div class="card idol reveal${c.idolPhoto ? " has-photo" : ""}">${c.idolPhoto ? `<img class="idol-photo" src="${c.idolPhoto}" alt="" loading="lazy" referrerpolicy="no-referrer" data-sem-foto />` : ""}<div class="eyebrow" style="color:inherit;opacity:.92;text-shadow:0 1px 3px rgb(0 0 0 / .5)">Ídolo eterno</div><h4>${c.idol}</h4>${c.idolPhoto ? `<small class="idol-credit">Foto: Wikimedia Commons</small>` : ""}</div>` : ""}
            ${LIVE.hasNews() ? `<div class="card news" data-news="${id}"><div class="card-h">Últimas notícias <small>Google Notícias</small></div><ul><li class="mam-empty">Buscando notícias…</li></ul></div>` : ""}
            <div class="card reveal">
              <div class="card-h">Ficha do clube</div>
              <div class="card-b" style="display:grid;gap:10px">
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Fundação</span><b>${c.founded}</b></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Estádio</span><b>${c.stadium}</b></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Cidade</span><b>${c.city} · ${c.uf}</b></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Apelido</span><b>${c.nick}</b></div>
                <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Idade</span><b>${new Date().getFullYear() - c.founded} anos</b></div>
              </div>
            </div>
            ${rival ? `<div class="card reveal"><div class="card-h">Grande rival</div>
              <a class="derby" href="#/clube/${rival.id}">${crest(c, 46)}<span class="vs">VS</span>${crest(rival, 46)}<div style="margin-left:6px"><b>${rival.name}</b><br/><small style="color:var(--text-3)">${rowOf(rival.id).pos}º na tabela · ${rowOf(rival.id).p} pts</small></div></a></div>` : ""}
          </div>
        </div>`;
    }

    if (tab === "partidas") body = `<div data-history="${id}">${historyHTML(id, window.CLUB_FORM?.clubs?.[id])}</div>`;

    if (tab === "elenco") body = LINEUP.builder(id);
    if (tab === "estatisticas") body = `<div data-raiox="${id}">${raioxHTML(id)}</div>${playerStatsHTML(id, true)}`;

    if (tab === "tabela") {
      body = `<div class="card">${standingsTable(state.standings, id)}${legend}</div>`;
    }
    if (tab === "comparar") body = `<div data-comparar="${id}|${byId[extra] && extra !== id ? extra : c.rival}">${compararClubes(id, byId[extra] && extra !== id ? extra : c.rival)}</div>`;

    return `<div class="club-page">
      <section class="hero hero--gb ${HERO_SCENES.has(id) ? "hero--canvas" : ""}" data-short="${c.short}"${SCRIM[id] ? ` style="--scrim:${SCRIM[id]}"` : ""}>
        ${HERO_SCENES.has(id) && window.HERO_SCENES.video?.(id) ? `<video class="hero-video" muted playsinline loop preload="none" aria-hidden="true" tabindex="-1"></video><div class="hero-tinta" aria-hidden="true"></div>` : ""}
        ${HERO_SCENES.has(id) ? `<canvas class="hero-canvas" data-hero-scene="${id}" aria-hidden="true"></canvas>` : `<div class="kit-bg" style="background:${kitBg(c)}"></div>`}
        ${fotoCidade(id)}
        <div class="hero-inner">
          <div class="hero-text">
            <div class="eyebrow">${c.nick} · desde ${c.founded}</div>
            <h1 style="--len:${Math.max(...words.map((w) => w.length))}">${words.map((w, i) => `<span class="w"><span style="--i:${i}">${w}</span></span>`).join(" ")}</h1>
            <div class="facts" data-live="facts">
              <span style="--i:0">${ICON.pin}${c.city} · ${c.uf}</span>
              <span style="--i:1">${ICON.stadium}${c.stadium}</span>
              <span style="--i:2">${ICON.cal}Fundado em ${c.founded}</span>
              <span style="--i:3">${ICON.ball}${r.pos}º lugar · ${r.p} pts</span>
            </div>
            <div class="palette">${c.colors.map((col, i) => `<i style="background:${col};--i:${i}" title="${col}"></i>`).join("")}</div>
          </div>
          <div class="hero-gb">${GOALBUG.html(c, SCENES.motto(id), { atraso: HERO_SCENES.has(id) ? HERO_SCENES.crestTime(id) - 0.75 : 0 })}</div>
        </div>
      </section>
      <div class="club-tabs"><div class="tabs" data-tabs>
        <span class="tab-ink"></span>
        ${tabs.map(([k, l]) => `<a class="tab ${k === tab ? "on" : ""}" href="#/clube/${id}/${k}">${l}</a>`).join("")}
      </div></div>
      <div data-tab-body>${body}</div>
    </div>`;
  }

  function findMatch(id) {
    const rd = +(id.match(/-r(\d+)$/) || [])[1];
    return (rd === ROUND ? state.matches : realMatches(rd)).find((m) => m.id === id);
  }

  function pageMatch(id) {
    const m = findMatch(id);
    if (!m) return pageNotFound();
    const h = byId[m.home], a = byId[m.away];
    const info = [
      ["Competição", `Brasileirão Série A · ${m.round}ª rodada`],
      ["Data", m.date ? dayName(m.date) : "—"],
      ["Horário", m.time ? `${m.time} (Brasília)` : "A definir"],
      ["Estádio", estadio(m.venue) || "—"],
      ["Situação", statusText(m)],
    ];
    // arbitragem pelas manchetes (a escala oficial é da CBF, que não permite reutilizar os dados do site)
    const arb = m.status !== "ft" ? arbitragemDe(m) : null;
    if (arb) info.push(["Árbitro", arb.arbitro ? `${arb.arbitro}<small class="arb-src">segundo ${arb.confirmacoes > 1 ? `${arb.confirmacoes} manchetes` : "a imprensa"}</small>` : `<span class="arb-pend">Ainda não noticiado</span>`]);
    const both = state.standings.filter((r) => r.id === m.home || r.id === m.away);
    const drone = window.DRONE ? DRONE.html(m.venue, m.home) : "";
    return `<section class="match-hero${drone ? " has-drone" : ""}" data-jogo="${m.id}" style="${matchVars(m)}">${drone}<h1 class="sr-only">${h.name} x ${a.name} — ${statusText(m)}</h1>
        <div style="text-align:center;margin-bottom:18px" data-live="pill"><span class="${m.status === "progress" ? "pill" : "pill muted"}">Brasileirão · ${m.round}ª rodada</span></div>
        ${scoreline(m, true, 128)}
        <div class="mh-marks" data-marks hidden></div>
        ${m.venue ? `<p style="text-align:center;color:var(--text-2);margin:16px 0 0">${ICON.stadium.replace("<svg", '<svg style="display:inline;vertical-align:-2px;margin-right:4px"')}${estadio(m.venue)}</p>` : ""}
      </section>
      <div class="grid-2">
        <div>
          <div class="card"><div class="card-h">Informações</div><div class="card-b" style="display:grid;gap:10px">
            ${info.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:var(--text-2)">${k}</span><b style="text-align:right"${k === "Situação" ? " data-situacao" : ""}>${v}</b></div>`).join("")}
          </div>${arb ? arbitragemHTML(arb) : ""}${m.status === "pending" ? `<div class="source">O resultado deste jogo ainda não foi lançado no site.</div>` : ""}</div>
          ${m.espn || (LIVE.proxy() && m.status !== "ft") ? `<div class="card mam" data-mam="${m.espn || ""}" data-h="${m.home}" data-a="${m.away}" data-kick="${m.kick || ""}"><div class="card-h">Minuto a minuto <small class="mam-src">lances: ${LIVE.proxy() ? "API-Football" : "ESPN"} · narração: PLACAR</small></div>
            <div class="mam-top"></div><ul class="mam-list"><li class="mam-empty">Carregando a narração…</li></ul></div>` : ""}
          <div class="card"><div class="card-h">Comparação no campeonato <small>${REAL.source} · ${REAL.updated}</small></div><div class="card-b">${compareHTML(m)}</div></div>
        </div>
        <div>
          ${voteCard(m)}
          <div class="card"><div class="card-h">Na tabela</div>${standingsTable(both, null, true)}${sourceNote}</div>
          ${scorersDuel(m)}
        </div>
      </div>`;
  }

  /* ---------- arbitragem do jogo pelas manchetes (GET /api/arbitragem ou js/live-data.js, a cada 30 min) ---------- */
  function arbitragemDe(m) {
    const j = window.ARBITRAGEM?.jogos;
    if (!j) return null;
    const a = j[m.espn] || j[`${m.home}|${m.away}`];
    return a && (a.arbitro || a.manchetes?.length) ? a : null;
  }
  const haTempo = (ts) => { const min = Math.max(1, Math.round((Date.now() / 1000 - ts) / 60)); return min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} d`; };
  function arbitragemHTML(a) {
    const esc = (x) => String(x || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
    return `<div class="arb" data-live="arb">
      <div class="arb-h">${ICON.whistle || ""}<b>Arbitragem nas manchetes</b><small>atualiza a cada 30 min</small></div>
      ${a.manchetes?.length ? `<ul class="arb-list">${a.manchetes.slice(0, 3).map((x) => `<li><a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer"><b>${esc(x.title)}</b><small>${esc(x.source)} · ${haTempo(x.ts)} ↗</small></a></li>`).join("")}</ul>` : `<p class="arb-none">Os veículos ainda não publicaram a escala deste jogo.</p>`}
      <p class="arb-aviso">A escala completa (assistentes, quarto árbitro e VAR) é divulgada pela CBF; aqui aparece o que a imprensa já noticiou, com link para cada matéria. <a href="https://www.cbf.com.br/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/${new Date().getFullYear()}" target="_blank" rel="noopener noreferrer">Escala oficial na CBF ↗</a></p>
    </div>`;
  }

  /* palpite de quem está vendo (guardado só neste navegador) */
  /* ---------- Próximo jogo: passa pelos jogos da rodada ----------
     Ordem: jogos rolando, depois os próximos pelo horário, até o último da rodada (sem jogo por vir: todos). */
  function featuredList() {
    const byKick = [...state.matches].sort((a, b) => (a.kick ?? Infinity) - (b.kick ?? Infinity));
    const open = byKick.filter((m) => m.status !== "ft" && !m.adiado);
    return open.length ? [...open.filter((m) => m.status === "progress"), ...open.filter((m) => m.status !== "progress")] : byKick;
  }
  // continua no jogo escolhido mesmo quando a página é redesenhada (placar ao vivo, favoritos...)
  function featIndex(list) {
    const i = list.findIndex((m) => m.id === state.featId);
    return i >= 0 ? i : 0;
  }
  function featureCard(list, i) {
    const m = list[i], n = list.length;
    const label = m.status === "progress" ? "Agora" : m.status === "ft" ? "Encerrado" : i === 0 || list[i - 1]?.status === "progress" ? "Próximo jogo" : "Depois";
    return `<div class="card feature" style="${matchVars(m)}" data-feature="${m.id}">
        <div class="feat-top">
          <span class="${m.status === "progress" ? "pill" : "pill muted"}">${label}</span>
          ${n > 1 ? `<div class="feat-nav">
            <button data-feat="${i - 1}" ${i > 0 ? "" : "disabled"} aria-label="Jogo anterior">‹</button>
            <span aria-live="polite"><b>${i + 1}</b> de ${n}</span>
            <button data-feat="${i + 1}" ${i < n - 1 ? "" : "disabled"} aria-label="Próximo jogo da rodada">›</button>
          </div>` : ""}
        </div>
        <a class="feat-link" href="#/partida/${m.id}">
          ${scoreline(m, false)}
          ${m.venue ? `<small class="feat-venue">${estadio(m.venue)}</small>` : ""}
          <div class="feat-sub">No campeonato</div>
          <div style="margin-top:6px">${compareHTML(m, 3)}</div>
        </a>
        ${n > 1 ? `<div class="feat-dots">${list.map((x, k) => `<button data-feat="${k}" class="${k === i ? "on" : ""}" aria-label="${byId[x.home].abbr} x ${byId[x.away].abbr}"></button>`).join("")}</div>` : ""}
      </div>`;
  }
  function showFeature(i, dir) {
    const list = featuredList(), card = $("[data-feature]");
    if (!card || !list[i]) return;
    state.featId = list[i].id;
    card.outerHTML = featureCard(list, i);
    const vote = $("aside [data-vote-card]");
    if (vote) vote.outerHTML = voteCard(list[i]);
    const fresh = $("[data-feature]");
    if (!reduced && dir) fresh.querySelector(".feat-link").animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
    requestAnimationFrame(() => $$(".bar i[data-w]", fresh).forEach((x) => (x.style.width = x.dataset.w + "%")));
    featSwipe(fresh);
  }
  // celular: arrastar o cartão para o lado também passa o jogo
  function featSwipe(card) {
    if (!card) return;
    let x0 = null, y0 = 0, moved = false;
    card.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; moved = false; }, { passive: true });
    card.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      moved = true;
      const cur = featIndex(featuredList()), next = cur + (dx < 0 ? 1 : -1);
      if (next >= 0 && next < featuredList().length) showFeature(next, dx < 0 ? 1 : -1);
    });
    card.addEventListener("click", (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
  }

  function voteCard(m) {
    const mine = store.get("votes", {})[m.id];
    const closed = m.status === "ft";
    const result = closed ? (m.hs > m.as ? "1" : m.hs < m.as ? "2" : "X") : null;
    const opts = [["1", byId[m.home].abbr, display(byId[m.home])], ["X", "Empate", "var(--text-3)"], ["2", byId[m.away].abbr, display(byId[m.away])]];
    const note = closed ? (mine ? (mine === result ? "Você acertou!" : "Não foi dessa vez") : "Jogo encerrado") : mine ? "Palpite salvo" : "Toque para palpitar";
    return `<div class="card vote" data-vote-card="${m.id}" data-live="vote">
      <div class="card-h">${closed ? "Resultado" : "Quem vai vencer?"} <small>${note}</small></div>
      <div class="card-b vote-opts ${mine || closed ? "done" : ""}">${opts.map(([k, l, c]) => `
        <button class="vote-opt ${mine === k ? "mine" : ""}" data-vote="${m.id}" data-pick="${k}" ${closed ? "disabled" : ""} style="--vc:${c}">
          <i class="vote-fill" style="width:${(closed ? result === k : mine === k) ? 100 : 0}%"></i>
          <b>${k}</b><span>${l}</span><em>${mine === k ? "Seu palpite" : closed && result === k ? "Resultado" : ""}</em>
        </button>`).join("")}</div>
    </div>`;
  }

  /* ---------- rankings do campeonato (subpáginas de #/tabela) ----------
     cada ranking: título, ordem, valor principal e colunas extras */
  const avg = (n, j) => (j ? n / j : 0).toFixed(2).replace(".", ",");
  const RANKINGS = {
    gols: {
      title: "Gols por clube", kpi: "Gols", lead: "Quantos gols cada clube marcou no Brasileirão, do que mais marcou ao que menos marcou.",
      sort: (a, b) => b.gf - a.gf || b.sg - a.sg, value: (r) => r.gf, unit: "gols marcados",
      cols: [["Sofridos", (r) => r.ga], ["Saldo", (r) => (r.sg > 0 ? "+" : "") + r.sg], ["Nos jogos", (r) => r.gf + r.ga]],
    },
    ataque: {
      title: "Melhor ataque", kpi: "Melhor ataque", lead: "Do melhor ao pior ataque, pela média de gols marcados por jogo.",
      sort: (a, b) => b.gf / b.j - a.gf / a.j || b.gf - a.gf, value: (r) => avg(r.gf, r.j), unit: "gols por jogo",
      cols: [["Gols", (r) => r.gf], ["Jogos", (r) => r.j]],
    },
    defesa: {
      title: "Melhor defesa", kpi: "Melhor defesa", lead: "Da melhor à pior defesa, pela média de gols sofridos por jogo (quanto menos, melhor).",
      sort: (a, b) => a.ga / a.j - b.ga / b.j || a.ga - b.ga, value: (r) => avg(r.ga, r.j), unit: "sofridos por jogo", invert: true,
      cols: [["Sofridos", (r) => r.ga], ["Jogos", (r) => r.j]],
    },
    amarelos: {
      title: "Cartões amarelos", kpi: "Mais amarelos", lead: "Do clube com mais cartões amarelos ao que tem menos.",
      sort: (a, b) => b.ca - a.ca || b.cv - a.cv, value: (r) => r.ca, unit: "amarelos", card: "y",
      cols: [["Por jogo", (r) => avg(r.ca, r.j)], ["Vermelhos", (r) => r.cv]],
    },
    vermelhos: {
      title: "Cartões vermelhos", kpi: "Mais vermelhos", lead: "Do clube com mais cartões vermelhos ao que tem menos.",
      sort: (a, b) => b.cv - a.cv || b.ca - a.ca, value: (r) => r.cv, unit: "vermelhos", card: "r",
      cols: [["Amarelos", (r) => r.ca], ["Jogos", (r) => r.j]],
    },
  };
  const ranked = (key) => [...state.standings].sort(RANKINGS[key].sort);

  /* números do campeonato, calculados da tabela real; cada cartão leva ao ranking completo */
  function leagueStats() {
    const t = state.standings;
    const games = t.reduce((a, r) => a + r.j, 0) / 2;
    const goals = t.reduce((a, r) => a + r.gf, 0);
    const best = (k, dir = 1) => [...t].sort((x, y) => dir * (y[k] - x[k]))[0];
    const att = best("gf"), def = best("ga", -1), yel = best("ca"), red = best("cv");
    const tile = (i, key, value, sub, c) => `<a class="kpi kpi-link" href="#/tabela/${key}" data-rank-preview="${key}" style="--i:${i}${c ? `;--c1:${c.colors[0]}` : ""}">
        <i class="kpi-sheet" aria-hidden="true"></i><i class="kpi-sheet" aria-hidden="true"></i>
        <small>${RANKINGS[key].kpi}</small><b>${value}</b><em>${c ? `<span style="display:inline-flex;align-items:center;gap:6px">${crest(c, 22)}${sub}</span>` : sub}</em>
        <span class="kpi-more">Ver ranking <svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></a>`;
    return `<div class="kpis league-kpis" data-live="liga">
      ${tile(0, "gols", goals, `${(goals / games).toFixed(2).replace(".", ",")} por jogo · ${games} jogos`)}
      ${tile(1, "ataque", att.gf, byId[att.id].abbr, byId[att.id])}
      ${tile(2, "defesa", def.ga, `${byId[def.id].abbr} · gols sofridos`, byId[def.id])}
      ${tile(3, "amarelos", yel.ca, byId[yel.id].abbr, byId[yel.id])}
      ${tile(4, "vermelhos", red.cv, byId[red.id].abbr, byId[red.id])}
    </div>
    <div class="rank-preview" id="rank-preview" role="tooltip" aria-hidden="true"></div>`;
  }

  /* prévia: os 5 primeiros do ranking e o último, mostrada ao passar o mouse ou segurar o dedo */
  function rankPreviewHTML(key) {
    const R = RANKINGS[key], list = ranked(key), top = list.slice(0, 5), last = list[list.length - 1];
    const row = (r, i) => `<li style="--c1:${display(byId[r.id])}"><span class="rp-pos">${i}</span>${crest(byId[r.id], 26)}<span class="rp-nm">${byId[r.id].abbr}</span><b>${R.value(r)}</b></li>`;
    return `<div class="rp-h"><b>${R.title}</b><small>${R.unit}</small></div>
      <ol>${top.map((r, i) => row(r, i + 1)).join("")}</ol>
      <div class="rp-gap">⋯</div><ol class="rp-last">${row(last, list.length)}</ol>
      <div class="rp-foot">Abrir o ranking completo ›</div>`;
  }

  function pageRanking(key) {
    const R = RANKINGS[key];
    if (!R) return pageNotFound();
    const list = ranked(key), vals = list.map((r) => +String(R.value(r)).replace(",", "."));
    // barra cheia para o líder do ranking (na defesa, quem sofre menos)
    const max = Math.max(...vals) || 1, min = Math.min(...vals.filter((v) => v > 0)) || 1;
    const pct = (v) => Math.max(3, R.invert ? (v ? (min / v) * 100 : 100) : (v / max) * 100).toFixed(1);
    const chips = Object.entries(RANKINGS).map(([k, x]) => `<a class="chip ${k === key ? "on" : ""}" href="#/tabela/${k}">${x.title}</a>`).join("");
    const podium = [1, 0, 2].map((i) => {
      const r = list[i], c = byId[r.id];
      return `<a class="podium-step p${i + 1}" href="#/clube/${c.id}" style="--c1:${display(c)};--i:${i}">
        ${crest(c, i ? 66 : 88)}<b>${R.value(r)}</b><span>${c.abbr}</span><i>${i + 1}º</i></a>`;
    }).join("");
    const rows = list.map((r, i) => {
      const c = byId[r.id], v = vals[i];
      return `<li class="rank-row" style="--c1:${display(c)};--i:${Math.min(i, 14)}">
        <span class="rk-pos">${i + 1}</span>
        <a class="rk-club" href="#/clube/${c.id}">${crest(c, 34)}<span><b>${c.abbr}</b><small>${r.pos}º na tabela</small></span></a>
        <span class="rk-bar"><i data-w="${pct(v)}"></i></span>
        <b class="rk-val">${R.card ? `<i class="rk-card ${R.card}"></i>` : ""}${R.value(r)}</b>
        ${R.cols.map(([l, f]) => `<span class="rk-col"><small>${l}</small>${f(r)}</span>`).join("")}
      </li>`;
    }).join("");
    return `<div class="page-head"><div>
        <a class="back-link" href="#/tabela">‹ Classificação</a>
        <div class="eyebrow">Brasileirão Série A · ${ROUND}ª rodada · ranking</div><h1>${R.title}</h1><p>${R.lead}</p></div></div>
      <div class="chips rank-chips">${chips}</div>
      <div class="podium">${podium}</div>
      <div class="card"><ol class="rank-list">${rows}</ol>${sourceNote}</div>`;
  }

  function pageTable() {
    return `<div class="page-head"><div><div class="eyebrow">Brasileirão Série A · ${ROUND}ª rodada</div><h1>Classificação</h1><p data-live="aviso">${temAoVivo() ? `<span class="pill">Ao vivo</span> Com os placares dos jogos em andamento; a tabela oficial é de ${REAL.updated}.` : `Classificação oficial, atualizada em ${REAL.updated}.`}</p></div></div>
      ${leagueStats()}
      <div class="grid-2" style="margin-top:16px">
        <div class="card">${standingsTable(state.standings)}${legend}${sourceNote}</div>
        <div>${scorersCard()}</div>
      </div>`;
  }

  /* ==========================================================================
     Simulador da tabela: o usuário dá o placar dos jogos que faltam e vê a classificação mudar.
     Entram só os jogos que ainda não começaram (os que estão rolando já contam na tabela com o placar de agora).
     Os jogos vêm da mesma fonte do placar (ESPN): quando a tabela de 2027 sair e os jogos ganharem data,
     eles aparecem aqui sozinhos. Os palpites ficam guardados no aparelho.
     ========================================================================== */
  const simPalpites = () => store.get("simulador", {});
  function simJogos() {
    const out = [];
    for (const [rd, lista] of Object.entries(window.PD.FIXTURES || {})) {
      for (const g of lista) {
        const st = g[8] && g[8].state;
        if (st === "in" || st === "post" || (g[2] != null && !(g[8] && g[8].state === "pre"))) continue;
        out.push({ k: `${g[0]}-x-${g[1]}`, rd: +rd, home: g[0], away: g[1], date: g[4], time: g[5], adiado: g[9] === "adiado" });
      }
    }
    const quando = (j) => (j.date ? Date.parse(`${j.date}T${j.time || "23:59"}:00-03:00`) : Infinity);
    return out.filter((j) => byId[j.home] && byId[j.away]).sort((a, b) => a.rd - b.rd || quando(a) - quando(b));
  }
  // classificação com os palpites: mesma conta da tabela ao vivo (pontos, vitórias, saldo, gols pró)
  function simTabela(jogos, palp) {
    const base = state.standings;
    const rows = base.map((r) => ({ ...r, vivo: null, mov: 0, n: 0, dp: 0, res: [] })), by = Object.fromEntries(rows.map((r) => [r.id, r]));
    let n = 0;
    for (const j of jogos) {
      const pl = palp[j.k];
      if (!pl || pl[0] == null || pl[1] == null) continue;
      n++;
      for (const [me, op, gf, ga] of [[j.home, j.away, pl[0], pl[1]], [j.away, j.home, pl[1], pl[0]]]) {
        const r = by[me];
        if (!r) continue;
        const pts = gf > ga ? 3 : gf === ga ? 1 : 0;
        r.p += pts; r.dp += pts; r.j++; r.w += +(gf > ga); r.d += +(gf === ga); r.l += +(gf < ga); r.gf += gf; r.ga += ga; r.n++;
        r.res.push(`${gf} x ${ga} contra o ${byId[op].name}`);
      }
    }
    const ordem = Object.fromEntries(base.map((r, i) => [r.id, i]));
    rows.sort((x, y) => y.p - x.p || y.w - x.w || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || ordem[x.id] - ordem[y.id]);
    rows.forEach((r, i) => {
      r.sg = r.gf - r.ga; r.pct = r.j ? Math.floor((r.p / (r.j * 3)) * 100) : 0;
      r.mov = ordem[r.id] - i; r.pos = i + 1;
      if (r.n) r.vivo = { sim: true, n: r.n, dp: r.dp, res: r.res };
    });
    return { rows, n };
  }
  function simTabelaHTML(jogos, palp) {
    const { rows, n } = simTabela(jogos, palp);
    return { n, html: standingsTable(rows).replace(/com os jogos de agora/g, "com os placares simulados") };
  }
  // jogos que entram na tabela de uma rodada: os dela e os das rodadas anteriores (o palpite de antes continua valendo)
  const simAte = (jogos, rd) => (rd == null ? jogos : jogos.filter((j) => j.rd <= rd));
  function simContagem(jogos, palp, rd) {
    const dado = (j) => { const pl = palp[j.k]; return pl && pl[0] != null && pl[1] != null; };
    const aqui = jogos.filter((j) => (rd == null || j.rd === rd) && dado(j)).length, antes = rd == null ? 0 : jogos.filter((j) => j.rd < rd && dado(j)).length;
    if (!aqui && !antes) return "dê um placar ao lado";
    const pl = (n) => `${n} jogo${n > 1 ? "s" : ""}`;
    return [aqui ? `${pl(aqui)} simulado${aqui > 1 ? "s" : ""}` : "", antes ? `${aqui ? "+ " : ""}${pl(antes)} das rodadas anteriores` : ""].filter(Boolean).join(" ");
  }
  function simRodadas(jogos) { return [...new Set(jogos.map((j) => j.rd))]; }
  function simLinha(j, palp) {
    const h = byId[j.home], a = byId[j.away], pl = palp[j.k] || [];
    const v = (x) => (x == null ? "" : x);
    const res = pl[0] == null || pl[1] == null ? "" : pl[0] > pl[1] ? "h" : pl[0] < pl[1] ? "a" : "e";
    const quando = j.date ? `${dayName(j.date)}${j.time ? ` · ${j.time}` : " · horário a definir"}` : "Data a definir";
    return `<li class="sim-j ${res ? `tem r-${res}` : ""}" data-k="${j.k}" style="${matchVars(j)}">
      <span class="sim-when">${quando}${j.adiado ? ` · <em>adiado</em>` : ""}</span>
      <span class="sim-t h"><b title="${h.name}">${h.abbr}</b>${crest(h, 34)}</span>
      <span class="sim-placar">
        <input type="number" inputmode="numeric" min="0" max="19" step="1" placeholder="–" value="${v(pl[0])}" data-lado="0" aria-label="Gols do ${h.name} contra o ${a.name}">
        <i aria-hidden="true">×</i>
        <input type="number" inputmode="numeric" min="0" max="19" step="1" placeholder="–" value="${v(pl[1])}" data-lado="1" aria-label="Gols do ${a.name} contra o ${h.name}">
      </span>
      <span class="sim-t a">${crest(a, 34)}<b title="${a.name}">${a.abbr}</b></span>
      <span class="sim-rap" role="group" aria-label="Resultado rápido de ${h.abbr} x ${a.abbr}">
        <button type="button" data-rap="h" class="${res === "h" ? "on" : ""}" aria-label="Vitória do ${h.name} (1 x 0)">${h.short}</button>
        <button type="button" data-rap="e" class="${res === "e" ? "on" : ""}" aria-label="Empate (1 x 1)">Empate</button>
        <button type="button" data-rap="a" class="${res === "a" ? "on" : ""}" aria-label="Vitória do ${a.name} (0 x 1)">${a.short}</button>
      </span>
    </li>`;
  }
  function pageSim(sel) {
    const jogos = simJogos(), palp = simPalpites();
    if (!jogos.length) {
      return `<div class="page-head"><div><div class="eyebrow">Brasileirão Série A · simulador</div><h1>Simulador da tabela</h1>
        <p>Não há jogos por disputar agora. Quando a tabela da próxima temporada for divulgada e os jogos ganharem data, eles aparecem aqui para você simular.</p></div></div>`;
    }
    const rds = simRodadas(jogos), todas = sel === "todas";
    const rd = todas ? null : rds.includes(+sel) ? +sel : rds[0];
    const vis = todas ? jogos : jogos.filter((j) => j.rd === rd);
    const chips = rds.map((r) => `<a class="chip ${r === rd ? "on" : ""}" href="#/simulador/${r}">${r}ª rodada</a>`).join("") + `<a class="chip ${todas ? "on" : ""}" href="#/simulador/todas">Todas (${jogos.length})</a>`;
    let lista = "", rdAtual = null;
    for (const j of vis) {
      if (todas && j.rd !== rdAtual) { rdAtual = j.rd; lista += `<li class="sim-rd">${j.rd}ª rodada</li>`; }
      lista += simLinha(j, palp);
    }
    const t = simTabelaHTML(simAte(jogos, todas ? null : rd), palp);
    return `<div class="page-head"><div><div class="eyebrow">Brasileirão Série A · simulador</div><h1>Simulador da tabela</h1>
        <p>Dê o placar dos jogos que faltam e veja onde cada clube ficaria. Só entram jogos que ainda não começaram${temAoVivo() ? "; os que estão rolando já contam com o placar de agora" : ""}.</p></div></div>
      <div class="chips sim-chips">${chips}</div>
      <div class="sim-grid" data-sim="${todas ? "todas" : rd}">
        <div class="card sim-jogos">
          <div class="card-h">${todas ? `Todos os jogos que faltam` : `Jogos da ${rd}ª rodada`}<small>${vis.length} jogo${vis.length > 1 ? "s" : ""}</small></div>
          <div class="sim-atalhos">
            <button type="button" class="chip" data-sim-auto="casa">Mandantes vencem</button>
            <button type="button" class="chip" data-sim-auto="empate">Tudo empate</button>
            <button type="button" class="chip" data-sim-auto="limpa">Limpar ${todas ? "tudo" : "rodada"}</button>
          </div>
          <ol class="sim-list">${lista}</ol>
          <p class="sim-nota">Jogos e datas: ESPN, a mesma fonte do placar. A tabela de cada rodada já soma os placares que você deu nas rodadas anteriores. Os placares ficam guardados só neste aparelho.</p>
        </div>
        <div class="card sim-tab-card">
          <div class="card-h">Classificação simulada<small data-sim-n>${simContagem(jogos, palp, todas ? null : rd)}</small></div>
          <div class="sim-tab" data-sim-tabela>${t.html}</div>${legend}
        </div>
      </div>`;
  }
  function simBind(root) {
    const grid = $(".sim-grid", root);
    if (!grid) return;
    const sel = grid.dataset.sim, todas = sel === "todas";
    const jogosDaVista = () => simAte(simJogos(), todas ? null : +sel);
    const salva = (palp) => store.set("simulador", palp);
    function atualiza() {
      const palp = simPalpites(), tab = $("[data-sim-tabela]", grid);
      // FLIP: cada clube desliza da posição antiga para a nova
      const antes = new Map($$("tbody tr", tab).map((tr) => [$("td.club a", tr).getAttribute("href"), tr.getBoundingClientRect().top]));
      const t = simTabelaHTML(jogosDaVista(), palp);
      tab.innerHTML = t.html;
      tab.classList.add("sem-entrada");
      $("[data-sim-n]", grid).textContent = simContagem(simJogos(), palp, todas ? null : +sel);
      if (reduced) return;
      $$("tbody tr", tab).forEach((tr) => {
        const y0 = antes.get($("td.club a", tr).getAttribute("href")), dy = y0 == null ? 0 : y0 - tr.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) tr.animate([{ transform: `translateY(${dy}px)`, background: "color-mix(in srgb, var(--accent) 18%, transparent)" }, { transform: "none", background: "transparent" }], { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" });
      });
    }
    function pintaLinha(li, pl) {
      const res = !pl || pl[0] == null || pl[1] == null ? "" : pl[0] > pl[1] ? "h" : pl[0] < pl[1] ? "a" : "e";
      li.classList.toggle("tem", !!res);
      ["h", "a", "e"].forEach((x) => li.classList.toggle(`r-${x}`, res === x));
      $$("[data-rap]", li).forEach((b) => b.classList.toggle("on", b.dataset.rap === res));
    }
    function grava(li) {
      const palp = simPalpites(), [ih, ia] = $$("input", li);
      const num = (i) => { if (i.value === "") return null; const v = Math.max(0, Math.min(19, Math.floor(+i.value))); if (String(v) !== i.value) i.value = v; return Number.isFinite(v) ? v : null; };
      const pl = [num(ih), num(ia)];
      if (pl[0] == null && pl[1] == null) delete palp[li.dataset.k]; else palp[li.dataset.k] = pl;
      salva(palp); pintaLinha(li, pl); atualiza();
    }
    grid.addEventListener("input", (e) => { const li = e.target.closest(".sim-j"); if (li && e.target.matches("input")) grava(li); });
    grid.addEventListener("focusin", (e) => { if (e.target.matches(".sim-j input")) e.target.select?.(); });
    grid.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rap]"), auto = e.target.closest("[data-sim-auto]");
      if (b) {
        const li = b.closest(".sim-j"), [ih, ia] = $$("input", li), x = b.dataset.rap;
        [ih.value, ia.value] = x === "h" ? ["1", "0"] : x === "a" ? ["0", "1"] : ["1", "1"];
        grava(li);
      }
      if (auto) {
        const palp = simPalpites(), modo = auto.dataset.simAuto;
        $$(".sim-j", grid).forEach((li) => {
          const [ih, ia] = $$("input", li);
          if (modo === "limpa") { ih.value = ia.value = ""; delete palp[li.dataset.k]; pintaLinha(li, null); return; }
          if (ih.value !== "" && ia.value !== "") return; // não apaga o que já foi dado
          [ih.value, ia.value] = modo === "casa" ? ["1", "0"] : ["1", "1"];
          palp[li.dataset.k] = [+ih.value, +ia.value]; pintaLinha(li, palp[li.dataset.k]);
        });
        salva(palp); atualiza();
      }
    });
  }

  function pageAbout() {
    const skills = [["HTML semântico & acessibilidade", 92], ["CSS moderno (grid, color-mix, view transitions)", 95], ["JavaScript (ES2022, sem framework)", 90], ["Visualização de dados com SVG", 86], ["Design de interface & motion", 88]];
    return `<div class="about">
      <div class="player-card" data-tilt>
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div><div class="ovr">94</div><div class="role">DEV</div></div>
          <div style="text-align:right;font-weight:900">FRONT-END<br/><small style="font-weight:700;opacity:.7">20+ anos</small></div>
        </div>
        <div class="avatar" style="margin-top:20px">AS</div>
        <h2>Alan Souza</h2>
        <div class="attrs">
          <span><b>95</b>CSS</span><span><b>91</b>JS</span>
          <span><b>89</b>UX</span><span><b>88</b>MOT</span>
          <span><b>86</b>SVG</span><span><b>93</b>A11Y</span>
        </div>
      </div>
      <div>
        <div class="eyebrow">Sobre o projeto</div>
        <h1 class="display">Um placar<br/>com alma de arquibancada</h1>
        <p style="color:var(--text-2);font-size:16px;max-width:640px">O PLACAR. é um estudo de interface para plataformas de resultados esportivos: a densidade de informação das listas de partidas, o cuidado com gráficos de desempenho e, acima de tudo, a identidade de cada clube brasileiro aplicada à interface.</p>
        <div class="card reveal" style="margin-top:22px"><div class="card-h">Habilidades em campo</div><div class="card-b">
          ${skills.map(([s, v]) => `<div class="skill"><header><span>${s}</span><span>${v}</span></header><div class="bar"><i data-w="${v}"></i></div></div>`).join("")}
        </div></div>
        <div class="card reveal"><div class="card-h">Decisões técnicas</div><div class="card-b feature-list">
          <div><b>Tema por clube</b><p>Variáveis CSS trocadas em tempo real; cada página veste as cores e o padrão da camisa titular.</p></div>
          <div><b>Transições de página</b><p>Cortina com as listras do clube e View Transitions API com elemento compartilhado (escudo).</p></div>
          <div><b>Gráficos em SVG</b><p>Pontos de todos os clubes, comparação entre adversários e escalação no campo, sem bibliotecas.</p></div>
          <div><b>Dados reais</b><p>Classificação e artilharia da CBF, jogos e resultados do ge.globo; a situação de cada jogo muda sozinha pelo relógio.</p></div>
          <div><b>Escudos oficiais com reserva</b><p>Escudos da Wikimedia; se a imagem não carregar, entra um escudo desenhado a partir das cores do clube.</p></div>
          <div><b>Acessível e responsivo</b><p>Navegação por teclado (atalho /), tema claro/escuro, respeito a <i>reduced motion</i> e layout mobile.</p></div>
        </div></div>
        <div class="card reveal"><div class="card-h">Carreira</div><div class="card-b"><ul class="timeline-cv">
          <li><b>Front-end sênior / líder técnico</b><small>Produtos de dados em tempo real</small></li>
          <li><b>Desenvolvedor de interfaces</b><small>Portais, e-commerce e design systems</small></li>
          <li><b>Primeiros sites</b><small>HTML em tabelas, GIFs animados e muita vontade</small></li>
        </ul></div></div>
      </div>
    </div>${docsHTML()}`;
  }

  /* ---------- "Sobre o projeto": como o PLACAR funciona (painel, fluxo dos dados e gráficos) ---------- */
  function docsHTML() {
    const S = window.PLAYER_STATS || {}, sq = window.SQUADS || {};
    const kpis = [
      [CLUBS.length, "clubes com identidade própria", "cores, cena animada, GOL! e goleada no relógio"],
      [(S.sumulas || []).length || 336, "súmulas lidas", "cada jogo do Brasileirão, gol a gol"],
      [Object.values(sq).flat().length || 945, "jogadores", "elencos e escalações reais"],
      [13, "rotas de API", "servidor em Python, sem dependências"],
      [34, "testes automáticos", "PC, iPhone e Android, com testes de invasão"],
      [0, "frameworks", "HTML, CSS e JavaScript puros"],
    ];
    // fluxo: de onde vem cada dado até a tela
    const flow = [
      ["Fontes", "ESPN · CBF · Google Notícias · API-Football (opcional)", ["placar e lances", "tabela e súmulas", "manchetes"]],
      ["Coleta", "server/placar_api.py · robô do GitHub Actions", ["a cada 30 min", "filtra, cruza e confere", "nunca raspa site que proíbe"]],
      ["Arquivos", "js/live-data.js · player-stats.js · heatmaps.js · raio-x.js", ["o site funciona sem servidor", "GitHub Pages"]],
      ["Navegador", "js/live.js · ticker.js · app.js", ["placar ao vivo a cada 0,8 s", "tabela e artilharia ao vivo", "troca só o que mudou"]],
    ];
    // de quanto em quanto tempo cada coisa se atualiza (escala logarítmica: de segundos a horas)
    const ritmo = [["Faixa: troca a manchete", 8], ["Placar ao vivo", 0.8], ["Minuto a minuto", 4], ["Tabela da ESPN (rodada)", 120], ["Manchetes do futebol", 1800], ["Arbitragem nas manchetes", 1800], ["Departamento médico", 1800], ["Notícias de cada clube", 1800], ["Tabela, artilharia e súmulas", 1800], ["Elencos", 21600]];
    const fmt = (s) => (s < 60 ? `${s} s` : s < 3600 ? `${s / 60} min` : `${s / 3600} h`);
    const lmin = Math.log(0.6), lmax = Math.log(30000), pos = (s) => ((Math.log(s) - lmin) / (lmax - lmin)) * 100;
    // o que foi construído, na ordem
    const fases = [
      ["Base", "20 clubes com tema próprio, tabela, rodada, partidas e o campinho do elenco"],
      ["Identidade", "GOL! no placar de transmissão com o símbolo de cada clube, cenas animadas e cortina de entrada"],
      ["Bora pro jogo", "prancheta tática com arrastar e mapa de calor estimado pelas escalações"],
      ["QA", "contraste AA, alinhamento, escudos inteiros, fluidez e 66 links conferidos em 3 aparelhos"],
      ["Ao vivo", "tabela, artilharia, fichas e GOL! em tempo real; a página não se redesenha sozinha"],
      ["Notícias", "faixa de manchetes embaixo do menu e notícias filtradas por clube"],
      ["Jogo", "top 5 de artilheiros lado a lado e arbitragem pelas manchetes"],
      ["Segurança", "política de conteúdo, dados de fora sempre limpos, API endurecida e testes de invasão"],
      ["Departamento médico", "temporada inteira: imprensa nacional e local, setoristas, sites oficiais e relacionados de cada jogo"],
    ];
    // testes por área
    const testes = [["Telas e alinhamento", 7], ["Ao vivo e dados", 9], ["Animações e escudos", 5], ["Bora pro jogo e elenco", 4], ["Notícias, arbitragem e DM", 5], ["Desempenho e acesso", 2], ["Segurança e invasão", 2]];
    const tMax = Math.max(...testes.map((t) => t[1]));
    // de que é feito o código (linhas)
    const codigo = [["Interface (JS)", 3200, "var(--accent)"], ["Cenas e GOL! (JS)", 1570, "#e0182a"], ["Estilos (CSS)", 2370, "#13a37a"], ["Servidor (Python)", 1500, "#f0a020"]];
    const cTot = codigo.reduce((a, c) => a + c[1], 0);
    return `<section class="docs" aria-labelledby="docs-h">
      <div class="docs-head"><div class="eyebrow">Por dentro do PLACAR.</div><h2 id="docs-h" class="docs-title">Como o site funciona</h2>
        <p>Um resumo do que foi construído, de onde vêm os dados e com que frequência eles chegam à tela.</p></div>
      <div class="docs-kpis">${kpis.map(([n, t, s], i) => `<div class="dk" style="--i:${i}"><b data-count="${n}">${n}</b><span>${t}</span><small>${s}</small></div>`).join("")}</div>

      <div class="card docs-card"><div class="card-h">Caminho dos dados <small>da fonte até a tela</small></div>
        <ol class="flow">${flow.map(([t, s, xs], i) => `<li class="fl" style="--i:${i}"><span class="fl-n">${i + 1}</span><b>${t}</b><small>${s}</small><ul>${xs.map((x) => `<li>${x}</li>`).join("")}</ul></li>`).join("")}</ol>
        <div class="source">Sem a API ligada, o site usa os arquivos gravados pelo robô e consulta a ESPN direto do navegador durante os jogos.</div></div>

      <div class="docs-grid">
        <div class="card docs-card"><div class="card-h">Ritmo das atualizações <small>escala de segundos a horas</small></div>
          <div class="rt">${ritmo.map(([t, s]) => `<div class="rt-row"><span>${t}</span><div class="rt-bar"><i style="--w:${pos(s).toFixed(1)}%"></i></div><b>${fmt(s)}</b></div>`).join("")}
          <div class="rt-axis" aria-hidden="true">${[[10, "10 s"], [60, "1 min"], [600, "10 min"], [3600, "1 h"], [21600, "6 h"]].map(([s, l]) => `<span style="left:${pos(s).toFixed(1)}%">${l}</span>`).join("")}</div></div></div>
        <div class="card docs-card"><div class="card-h">Testes automáticos <small>por área · PC, iPhone e Android</small></div>
          <div class="tz">${testes.map(([t, n]) => `<div class="tz-row"><span>${t}</span><i style="--w:${((n / tMax) * 100).toFixed(0)}%"></i><b>${n}</b></div>`).join("")}</div>
          <div class="source">Cada teste abre o site num navegador de verdade (Playwright) e confere o que a pessoa vê.</div></div>
      </div>

      <div class="docs-grid">
        <div class="card docs-card"><div class="card-h">O que foi construído <small>em ordem</small></div>
          <ol class="fases">${fases.map(([t, s], i) => `<li style="--i:${i}"><b>${t}</b><p>${s}</p></li>`).join("")}</ol></div>
        <div class="card docs-card"><div class="card-h">De que é feito <small>~${(cTot / 1000).toFixed(1).replace(".", ",")} mil linhas</small></div>
          <div class="cz" role="img" aria-label="${codigo.map(([t, n]) => `${t}: ${Math.round((n / cTot) * 100)}%`).join(", ")}">${codigo.map(([t, n, c]) => `<i style="flex:${n};background:${c}" title="${t}"></i>`).join("")}</div>
          <ul class="cz-leg">${codigo.map(([t, n, c]) => `<li><i style="background:${c}"></i><span>${t}</span><b>${Math.round((n / cTot) * 100)}%</b></li>`).join("")}</ul>
          <div class="cz-rules"><b>Regras do projeto</b><ul>
            <li>Dados de fontes públicas, com a fonte citada; notícia só com título, fonte e link</li>
            <li>Sem copiar conteúdo de site que proíbe (por isso a arbitragem vem das manchetes)</li>
            <li>Símbolos e cenas desenhados do zero; escudos oficiais só para identificar</li>
            <li>Legível (contraste AA), navegável por teclado e sem animação para quem pede menos movimento</li>
            <li>Seguro por padrão: todo dado de fora é tratado como não confiável e o site só roda o próprio código</li>
          </ul></div></div>
      </div>
    </section>`;
  }

  const pageNotFound = () => `<div class="empty" style="padding:120px 0"><h1 class="display">Impedimento!</h1><p>Essa página não existe. <a href="#/" style="color:var(--ink)">Voltar ao placar</a></p></div>`;

  /* ==========================================================================
     Roteador + transições
     ========================================================================== */
  function parse() {
    // só letras, números e hífen: qualquer outra coisa no endereço vira "página não existe"
    const ok = (x) => (x == null || (/^[\w-]{0,60}$/.test(x) && !(x in Object.prototype)) ? x : "-invalido-");
    const [, page = "", id, tab, extra] = location.hash.replace(/^#/, "").split("/").map(ok);
    return { page, id, tab, extra };
  }

  const pageHTML = (r) =>
      r.page === "" ? pageHome() :
      r.page === "clubes" ? pageClubs() :
      r.page === "clube" ? pageClub(r.id, r.tab, r.extra) :
      r.page === "partida" ? pageMatch(r.id) :
      r.page === "tabela" ? (r.id ? pageRanking(r.id) : pageTable()) :
      r.page === "bora-pro-jogo" ? LINEUP.pageBora(r.id, r.tab) :
      r.page === "simulador" ? pageSim(r.id) :
      r.page === "jogador" ? JOGADOR.page(r.id, r.tab, r.extra) :
      r.page === "sobre" ? pageAbout() : pageNotFound();
  function render() {
    const r = parse();
    state.route = r;
    const club = r.page === "clube" ? byId[r.id] : null;
    applyTheme(club);
    view.innerHTML = pageHTML(r);
    stamp(view);
    const navKey = r.page === "" || r.page === "partida" ? "home" : r.page === "clube" || r.page === "jogador" ? "clubes" : r.page;
    $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === navKey));
    document.title = club ? `${club.name} — Placar` : r.page === "tabela" && RANKINGS[r.id] ? `${RANKINGS[r.id].title} — Placar` : r.page === "partida" ? "Partida — Placar" : r.page === "bora-pro-jogo" ? "Bora pro jogo — Placar" : r.page === "simulador" ? "Simulador da tabela — Placar" : r.page === "jogador" ? `${JOGADOR.get(r.id)?.nome || "Jogador"} — Placar` : "Placar — Futebol Brasileiro";
    enhance();
  }

  /* ---------- atualização ao vivo sem redesenhar a página ----------
     Antes, cada placar novo (a cada 12 s com bola rolando) redesenhava a página inteira: o topo do clube tocava
     o GOL! de novo, os cards repetiam a entrada, a ficha aberta fechava e parecia que o site tinha recarregado.
     Agora só as regiões com dados ao vivo são comparadas (o HTML desenhado da última vez, o novo e o que está na
     tela) e só o texto e os atributos que mudaram são trocados: animações, carrossel e cliques continuam como estão. */
  const REGIONS = ".match[data-match], .scoreline, table.table, [data-live], [data-situacao]";
  const topRegions = (root) => [...root.querySelectorAll(REGIONS)].filter((el) => !(el.parentElement && el.parentElement.closest(REGIONS)));
  const regionKeys = (list) => {
    const n = {};
    return list.map((el) => { const k = el.dataset.match ? `m:${el.dataset.match}` : el.dataset.live ? `l:${el.dataset.live}` : el.hasAttribute("data-situacao") ? "sit" : el.className.split(" ")[0]; n[k] = (n[k] || 0) + 1; return `${k}#${n[k]}`; });
  };
  function stamp(root) { topRegions(root).forEach((el) => (el._src = el.outerHTML)); }
  const tplOf = (html) => { const t = document.createElement("template"); t.innerHTML = html; return t.content; };
  const RUNTIME = new Set(["seen", "peek", "in", "on", "open", "settled", "idle", "play", "patched", "bump"]);
  function morph(live, a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
    if (a.nodeType === 3) { if (a.data !== b.data) { live.data = b.data; bump(live.parentElement); } return true; }
    if (a.nodeType !== 1) return true;
    if (a.childNodes.length !== b.childNodes.length || live.childNodes.length !== a.childNodes.length) return false;
    for (const name of new Set([...a.getAttributeNames(), ...b.getAttributeNames()])) {
      const va = a.getAttribute(name), vb = b.getAttribute(name);
      if (va === vb) continue;
      if (name === "class") {
        const A = new Set((va || "").split(/\s+/).filter(Boolean)), B = new Set((vb || "").split(/\s+/).filter(Boolean));
        A.forEach((c) => !B.has(c) && !RUNTIME.has(c) && live.classList.remove(c));
        B.forEach((c) => live.classList.add(c));
      } else if (vb == null) live.removeAttribute(name);
      else live.setAttribute(name, vb);
      if (name === "data-w" && live.style.width) live.style.width = vb + "%"; // a barra desliza até o valor novo
      if (name === "data-count") { live.textContent = (live.hasAttribute("data-sign") && +vb > 0 ? "+" : "") + vb; bump(live); }
    }
    for (let i = 0; i < a.childNodes.length; i++) {
      const ok = morph(live.childNodes[i], a.childNodes[i], b.childNodes[i]);
      if (!ok) replaceRegion(live.childNodes[i], b.childNodes[i]);
    }
    return true;
  }
  // estrutura diferente: troca o pedaço, já no estado final (sem repetir a entrada)
  function replaceRegion(live, b) {
    const n = b.cloneNode(true);
    live.replaceWith(n);
    if (n.nodeType !== 1) return;
    n.classList.add("patched");
    [n, ...n.querySelectorAll(".reveal")].forEach((e) => e.classList.contains("reveal") && e.classList.add("seen"));
    [...(n.matches("[data-w]") ? [n] : []), ...n.querySelectorAll("[data-w]")].forEach((i) => (i.style.width = i.dataset.w + "%"));
    n.querySelectorAll("[data-count]").forEach((e) => (e.textContent = (e.hasAttribute("data-sign") && +e.dataset.count > 0 ? "+" : "") + e.dataset.count));
    scorerCards(n.parentElement || view);
  }
  // número que mudou (placar, pontos, gols): um pulo discreto
  function bump(el) {
    const t = el && el.closest && el.closest(".score b, [data-score], td.pts, .goals, .sd-g, .kpi b, .live-chip, .status, .time");
    if (!t) return;
    t.classList.remove("bump"); void t.offsetWidth; t.classList.add("bump");
  }
  function patchView() {
    const fresh = tplOf(pageHTML(state.route));
    const novos = topRegions(fresh), kn = regionKeys(novos);
    const velhos = topRegions(view), ko = regionKeys(velhos);
    const map = new Map(ko.map((k, i) => [k, velhos[i]]));
    // estrutura da página mudou (outra quantidade de regiões, ex.: rodada nova): redesenha, mas sem repetir entradas
    if (kn.join() !== ko.join()) {
      const y = scrollY, hero = $(".hero", view);
      render();
      // o topo do clube (cena e GOL!) continua onde estava, sem tocar de novo
      const novo = $(".hero", view);
      if (hero && novo && hero.dataset.short === novo.dataset.short) novo.replaceWith(hero);
      $$(".reveal", view).forEach((e) => e.classList.add("seen"));
      scrollTo(0, y);
      return;
    }
    novos.forEach((nv, i) => {
      const old = map.get(kn[i]);
      const src = nv.outerHTML;
      if (!old || old._src === src) return;
      // região trocada por outro código (carrossel, palpite): sem a versão desenhada, troca o pedaço inteiro
      const a = old._src ? tplOf(old._src).firstElementChild : null;
      if (!a || !morph(old, a, nv)) { replaceRegion(old, nv); map.set(kn[i], null); topRegions(view).forEach((e) => e._src ||= e.outerHTML); }
      else old._src = src;
    });
    topRegions(view).forEach((e) => { if (!e._src) e._src = e.outerHTML; });
  }

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  // "?estatico" na URL mostra os números já no valor final (útil para prints)
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("estatico");
  // faixa da partida: os escudos entram (cada um do seu lado) quando as imagens estão prontas;
  // o mesmo jogo redesenhado em menos de 90 s (placar ao vivo, troca de aba) não repete a entrada
  const escudosVistos = new Map();
  function escudosEntram(root) {
    const mh = root.querySelector(".match-hero[data-jogo]");
    if (!mh || mh.dataset.escudos) return;
    mh.dataset.escudos = "1";
    const k = mh.dataset.jogo, antes = escudosVistos.get(k) || 0;
    escudosVistos.set(k, Date.now());
    if (reduced || Date.now() - antes < 90e3) return mh.classList.add("escudos-ok");
    mh.classList.add("escudos-espera");
    const imgs = [...mh.querySelectorAll(".scoreline img.crest")];
    const pronto = (i) => (i.complete && i.naturalWidth ? (i.decode ? i.decode().catch(() => {}) : Promise.resolve()) : new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); }));
    let foi = false;
    const vai = () => { if (foi) return; foi = true; mh.classList.remove("escudos-espera"); mh.classList.add("escudos-entram"); };
    Promise.all(imgs.map(pronto)).then(vai);
    setTimeout(vai, 1200);   // internet lenta: entra assim mesmo
  }
  let prev = parse();

  async function onRoute() {
    const next = parse();
    const sameClub = prev.page === "clube" && next.page === "clube" && prev.id === next.id;
    const samePage = prev.page === next.page && prev.id === next.id;
    const enteringClub = next.page === "clube" && byId[next.id] && !sameClub && prev.page !== "clubes";
    prev = next;

    if (enteringClub && !reduced) {
      await curtain(byId[next.id]);
    } else if (document.startViewTransition && !reduced) {
      const vt = document.startViewTransition(() => render());
      vt.ready.catch(() => {}); vt.finished.catch(() => {});
    } else {
      render();
    }
    if (!samePage) window.scrollTo({ top: 0, behavior: "instant" });
  }

  /* cortina com as listras e o escudo do clube */
  async function curtain(club) {
    const el = $("#curtain");
    const [a, b] = club.colors;
    el.innerHTML = Array.from({ length: 6 }, (_, i) => `<i style="--i:${i};--cc:${i % 2 ? b : a}"></i>`).join("") +
      `<div class="mark">${GOALBUG.bar(club)}</div>`;
    el.className = "curtain in";
    await sleep(820);
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
    // a página nova desenha o primeiro quadro (o mais pesado) ainda atrás da cortina; só então a cortina sobe
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    el.className = "curtain out";
    await sleep(760);
    el.className = "curtain";
    el.innerHTML = "";
  }

  // abas com rolagem lateral: marca quando chegou ao fim (some o esmaecido da borda)
  document.addEventListener("scroll", (e) => {
    const t = e.target;
    if (t instanceof Element && t.matches(".club-tabs .tabs, .lu-tabs")) t.classList.toggle("at-end", t.scrollLeft + t.clientWidth >= t.scrollWidth - 4);
  }, { capture: true, passive: true });
  function placeInk() {
    $$("[data-tabs]").forEach((t) => {
      const ink = $(".tab-ink", t), on = $(".tab.on", t);
      if (!ink || !on) return;
      ink.style.width = on.offsetWidth + "px";
      ink.style.transform = `translateX(${on.offsetLeft}px)`;
    });
  }
  new ResizeObserver(() => requestAnimationFrame(placeInk)).observe(document.documentElement);

  /* ---------- comportamentos após renderizar ---------- */
  function enhance() {
    SCENES.mount(view);
    HERO_SCENES.mount(view);
    GOALBUG.mount(view);
    LINEUP.mount(view);
    window.DRONE?.mount(view);
    escudosEntram(view);
    if (state.route.page === "simulador") simBind(view);
    if (state.route.page === "jogador") JOGADOR.mount(view);
    // fotos dos jogadores (licença livre, Wikimedia Commons) nas listas de estatísticas; o nome abre a página do jogador
    if (state.route.page === "clube" && $("[data-pid]", view)) HEATMAP.carregaClube(state.route.id).then((D) => {
      $$("[data-pid]", view).forEach((el) => {
        const [aid] = el.dataset.pid.split("-"), j = D?.jogadores?.[aid];
        const nome = el.parentElement?.querySelector("b");
        if (nome && JOGADOR.get(el.dataset.pid) && !nome.closest("a")) nome.outerHTML = `<a class="ps-link" href="#/jogador/${el.dataset.pid}">${nome.outerHTML}</a>`;
        if (j?.foto && !el.querySelector("img")) { el.classList.add("com-foto"); el.innerHTML = `<span class="foto-c">${window.GFX.fotoImg(j.foto)}</span><i>${el.textContent}</i>`; el.title = `Foto: ${j.foto.autor} · ${j.foto.licenca} · ${j.foto.fonte === "Flickr" ? "Flickr" : "Wikimedia Commons"}`; }
      });
    });
    LIVE.mount(view);
    featSwipe($("[data-feature]", view));
    scorerCards(view);
    // tinta deslizante das abas (de novo quando a fonte terminar de carregar ou a tela mudar de tamanho)
    placeInk();
    document.fonts?.ready.then(placeInk);
    // contadores
    $$("[data-count]").forEach((el) => {
      const to = +el.dataset.count, sign = el.hasAttribute("data-sign");
      if (reduced) { el.textContent = (sign && to > 0 ? "+" : "") + to; return; }
      const t0 = performance.now(), dur = 1100;
      const step = () => {
        if (+el.dataset.count !== to) return; // o número mudou ao vivo no meio da contagem
        const k = Math.min(1, (performance.now() - t0) / dur), v = Math.round(to * (1 - (1 - k) ** 3));
        el.textContent = (sign && v > 0 ? "+" : "") + v;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    // revelar ao rolar + barras
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("seen");
      $$(".bar i[data-w]", e.target).forEach((i) => (i.style.width = i.dataset.w + "%"));
      io.unobserve(e.target);
    }), { threshold: 0.12 });
    $$(".reveal").forEach((el) => io.observe(el));
    requestAnimationFrame(() => $$(".bar i[data-w], .rk-bar i[data-w], .ps-bar i[data-w]").forEach((i) => { if (!i.closest(".reveal")) i.style.width = i.dataset.w + "%"; }));
    // inclinação 3D nos cartões
    $$("[data-tilt]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const b = el.getBoundingClientRect();
        const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
        el.style.setProperty("--tilt-y", `${(x - 0.5) * 10}deg`);
        el.style.setProperty("--tilt-x", `${(0.5 - y) * 10}deg`);
        el.style.setProperty("--mx", `${x * 100}%`);
        el.style.setProperty("--my", `${y * 100}%`);
      });
      el.addEventListener("pointerleave", () => { el.style.setProperty("--tilt-x", "0deg"); el.style.setProperty("--tilt-y", "0deg"); });
    });
    rankPreviews();
    // Raio-X: o arquivo só é baixado na aba Estatísticas
    $$("[data-raiox]", view).forEach((el) => {
      if (window.RAIO_X) return rxMount(el);
      loadRaioX().then(() => { if (!el.isConnected) return; el.innerHTML = raioxHTML(el.dataset.raiox); rxMount(el); $$(".reveal", el).forEach((r) => r.classList.add("seen")); });
    });
    // sem a API (GitHub Pages), o retrospecto é atualizado direto da ESPN ao abrir o clube;
    // enquanto isso, mostra a temporada gravada (js/club-form.js, baixado só nas páginas de clube)
    const paintForm = (el, d) => {
      if (el.dataset.history) el.innerHTML = historyHTML(el.dataset.history, d);
      else if (el.dataset.cal) {
        // o painel aberto continua aberto quando os dados chegam atualizados
        const aberto = $("[data-cal-det]", el)?.dataset.jogo;
        el.innerHTML = el.querySelector(".card-h").outerHTML + calInner(el.dataset.cal, d);
        const e = aberto && d?.all?.find((x) => x.id === aberto);
        if (e && mesDe(e.date) === state.cal[el.dataset.cal]) calDetalhe($("[data-cal-det]", el), el.dataset.cal, e);
      }
    };
    $$("[data-comparar]").forEach((el) => {
      const [a, b] = el.dataset.comparar.split("|");
      const falta = [a, b].filter((x) => !window.CLUB_FORM?.clubs?.[x]);
      if (!falta.length) return;
      const pinta = () => { if (el.isConnected) el.innerHTML = compararClubes(a, b); };
      loadClubForm().then(pinta);
      if (!LIVE.on()) Promise.all(falta.map((x) => LIVE.form(x).then((d) => { if (d) { window.CLUB_FORM = window.CLUB_FORM || { clubs: {} }; window.CLUB_FORM.clubs[x] = d; } }))).then(pinta);
    });
    $$("[data-history], [data-cal]").forEach((el) => {
      if (LIVE.on()) return;
      const id = el.dataset.history || el.dataset.cal;
      if (!window.CLUB_FORM?.clubs?.[id]) loadClubForm().then(() => { const d = window.CLUB_FORM?.clubs?.[id]; if (d && el.isConnected && !el.dataset.fresh) paintForm(el, d); });
      LIVE.form(id).then((d) => {
        if (!d || !el.isConnected) return;
        window.CLUB_FORM = window.CLUB_FORM || { clubs: {} };
        window.CLUB_FORM.clubs[id] = d;
        el.dataset.fresh = "1";
        paintForm(el, d);
      }).catch(() => {});
    });
  }

  let formScript = null;
  function loadClubForm() {
    if (formScript) return formScript;
    const before = window.CLUB_FORM;
    formScript = new Promise((res) => {
      const sc = document.createElement("script");
      sc.src = "js/club-form.js";
      sc.onload = sc.onerror = () => {
        // o que já veio da ESPN nesta visita vale mais que o arquivo gravado
        if (before?.clubs && window.CLUB_FORM?.clubs && before !== window.CLUB_FORM) Object.assign(window.CLUB_FORM.clubs, before.clubs);
        else if (before && !window.CLUB_FORM) window.CLUB_FORM = before;
        res();
      };
      document.head.appendChild(sc);
    });
    return formScript;
  }

  /* prévia dos rankings: com o mouse, aparece ao passar por cima; no toque, segurar o dedo mostra,
     deslizar troca de cartão e soltar abre o ranking. Um toque rápido abre a subpágina direto. */
  function rankPreviews() {
    const tip = $("#rank-preview"), tiles = $$("[data-rank-preview]");
    if (!tip || !tiles.length) return;
    let cur = null, hold = null, held = false;
    const show = (el) => {
      if (cur === el) return;
      tiles.forEach((t) => t.classList.toggle("peek", t === el));
      cur = el;
      tip.innerHTML = rankPreviewHTML(el.dataset.rankPreview);
      tip.style.setProperty("--c1", getComputedStyle(el).getPropertyValue("--c1").trim() || "var(--accent)");
      const b = el.getBoundingClientRect(), w = Math.min(280, innerWidth - 24);
      tip.style.width = w + "px";
      tip.style.left = Math.max(12, Math.min(innerWidth - w - 12, b.left + b.width / 2 - w / 2)) + "px";
      const h = tip.offsetHeight || 300;
      tip.style.top = (b.bottom + 10 + h < innerHeight ? b.bottom + 10 : Math.max(12, b.top - 10 - h)) + "px";
      tip.classList.add("open");
      tip.setAttribute("aria-hidden", "false");
    };
    const hide = () => { cur = null; tiles.forEach((t) => t.classList.remove("peek")); tip.classList.remove("open"); tip.setAttribute("aria-hidden", "true"); };
    tiles.forEach((el) => {
      el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(el); });
      el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
      el.addEventListener("focus", () => show(el));
      el.addEventListener("blur", hide);
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        held = false;
        clearTimeout(hold);
        hold = setTimeout(() => { held = true; navigator.vibrate?.(8); show(el); }, 260);
      });
      // depois de segurar, quem navega é o "soltar" abaixo; o clique nativo é ignorado
      el.addEventListener("click", (e) => { if (held) e.preventDefault(); });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    });
    const strip = tiles[0].parentNode;
    strip.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || !held) return;
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-rank-preview]");
      if (t) show(t);
    });
    strip.addEventListener("touchmove", (e) => { if (held) e.preventDefault(); }, { passive: false });
    strip.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      clearTimeout(hold);
      if (!held) return;
      const t = cur; hide();
      setTimeout(() => { held = false; if (t) location.hash = t.getAttribute("href"); }, 30);
    });
    strip.addEventListener("pointercancel", () => { clearTimeout(hold); if (held) hide(); held = false; });
    addEventListener("scroll", () => { if (!held) hide(); }, { passive: true });
  }

  /* ---------- eventos delegados ---------- */
  // Esc fecha as estatísticas do jogo no calendário e devolve o foco ao jogo
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const box = $("[data-cal-det]:not([hidden])");
    if (!box) return;
    const id = box.dataset.jogo; box.hidden = true; delete box.dataset.jogo;
    const cal = box.closest("[data-cal]"); $$(".on", cal).forEach((x) => x.classList.remove("on"));
    $(`[data-cal-jogo="${CSS.escape(id || "")}"]`, cal)?.focus();
  });
  document.addEventListener("click", (e) => {
    const cal = e.target.closest("[data-cal]");
    if (cal) {
      const id = cal.dataset.cal, d = window.CLUB_FORM?.clubs?.[id];
      const nav = e.target.closest("[data-cal-nav], [data-cal-hoje]");
      if (nav && d) {
        const ms = calMeses(d);
        state.cal[id] = nav.dataset.calHoje != null ? calMesInicial(d) : ms[Math.max(0, Math.min(ms.length - 1, ms.indexOf(state.cal[id]) + +nav.dataset.calNav))];
        cal.innerHTML = cal.querySelector(".card-h").outerHTML + calInner(id, d);
        $(".cal-mes", cal)?.focus?.();
        return;
      }
      if (e.target.closest("[data-cal-fechar]")) {
        const box = $("[data-cal-det]", cal); box.hidden = true; delete box.dataset.jogo;
        cal.querySelector(".cal-j.on, .cal-l.on") && $$(".cal-j.on, .cal-l.on", cal).forEach((b) => b.classList.remove("on"));
        return;
      }
      const bj = e.target.closest("[data-cal-jogo]");
      if (bj && d) {
        const jogo = d.all.find((x) => x.id === bj.dataset.calJogo), box = $("[data-cal-det]", cal);
        if (!jogo) return;
        if (box.dataset.jogo === jogo.id && !box.hidden) { box.hidden = true; delete box.dataset.jogo; $$(".on", cal).forEach((b) => b.classList.remove("on")); return; }
        $$(".cal-j.on, .cal-l.on", cal).forEach((b) => b.classList.remove("on"));
        $$(`[data-cal-jogo="${CSS.escape(jogo.id)}"]`, cal).forEach((b) => b.classList.add("on"));
        calDetalhe(box, id, jogo);
        box.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
        return;
      }
    }
    const hf = e.target.closest("[data-hist-filter]");
    if (hf) {
      state.histFilter = hf.dataset.histFilter;
      const box = hf.closest("[data-history]");
      box.innerHTML = historyHTML(box.dataset.history, window.CLUB_FORM?.clubs?.[box.dataset.history]);
      return;
    }
    if (e.target.closest("[data-hist-next]")) {
      e.preventDefault();
      document.querySelector(".hm-row:not(.post)")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      return;
    }
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.preventDefault();
      const id = fav.dataset.fav;
      state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
      store.set("favs", [...state.favs]);
      fav.classList.toggle("on");
      fav.animate([{ transform: "scale(1.6) rotate(72deg)" }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.34,1.56,.64,1)" });
      if (state.route.page === "") setTimeout(soft, 300);
      return;
    }
    const f = e.target.closest("[data-filter]");
    if (f) { state.filter = f.dataset.filter; soft(); return; }
    const ft = e.target.closest("[data-feat]");
    if (ft) {
      e.preventDefault();
      const i = +ft.dataset.feat, cur = featIndex(featuredList());
      if (i !== cur) showFeature(i, i > cur ? 1 : -1);
      return;
    }
    const rd = e.target.closest("[data-round]");
    if (rd && rd.dataset.round) { state.round = +rd.dataset.round; soft(); return; }
    const v = e.target.closest("[data-vote]");
    if (v) {
      e.preventDefault();
      const votes = store.get("votes", {});
      votes[v.dataset.vote] = v.dataset.pick;
      store.set("votes", votes);
      const m = findMatch(v.dataset.vote);
      $$(`[data-vote-card="${m.id}"]`).forEach((card) => {
        card.outerHTML = voteCard(m);
      });
      return;
    }
    const rg = e.target.closest("[data-region]");
    if (rg) { state.region = rg.dataset.region; soft(); }
  });
  function soft() {
    const y = scrollY;
    if (document.startViewTransition && !reduced) { const vt = document.startViewTransition(render); vt.ready.catch(() => {}); vt.finished.catch(() => {}); } else render();
    requestAnimationFrame(() => scrollTo(0, y));
  }

  /* ---------- tema claro/escuro ---------- */
  root.dataset.theme = ((t) => (t === "light" || t === "dark" ? t : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"))(store.get("theme"));
  $("#theme").addEventListener("click", (e) => {
    const go = () => { root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light"; store.set("theme", root.dataset.theme); render(); };
    if (!document.startViewTransition || reduced) return go();
    // transição circular a partir do botão
    const { clientX: x, clientY: y } = e;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(go); vt.finished.catch(() => {});
    vt.ready.then(() =>
      root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 600, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
  });

  /* ---------- busca: clubes e jogadores, histórico e em alta ----------
     - clubes pelo começo do nome; jogadores pelo começo do nome ou de um sobrenome (a lista vem do elenco já carregado);
     - histórico: as últimas buscas abertas, guardadas só neste aparelho (localStorage, até 10);
     - em alta: com a API (ou o Worker), os clubes e jogadores mais buscados nas últimas 24 h por todos (só contagens,
       sem nada de quem buscou; cada aparelho conta cada item no máximo uma vez a cada 6 h, num envio pequeno e
       assíncrono). Sem servidor (GitHub Pages puro), a lista vira "Em destaque": jogos de hoje e artilheiros. */
  const input = $("#search"), results = $("#search-results");
  let sel = 0;
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const HIST = "busca-hist";
  const histLer = () => (store.get(HIST, []) || []).filter((x) => x && (x.t === "c" ? byId[x.id] : x.t === "j" && JOGADOR.get(x.id)));
  const itemClube = (c, i, extra = "") => `<a href="#/clube/${c.id}" data-busca="c|${c.id}" class="${i === 0 ? "sel" : ""}" role="option">${crest(c, 32)}<b>${c.name}</b><small>${extra || c.stadium}</small></a>`;
  const itemJog = (p, i, extra = "") => {
    const c = byId[p.cid];
    return `<a href="#/jogador/${p.key}" data-busca="j|${p.key}" class="${i === 0 ? "sel" : ""}" role="option"><span class="sr-num" style="background:${display(c)};color:${onColor(display(c))}">${p.num ?? "–"}</span><b>${SEG.esc(p.nome)}</b><small>${extra || `${crest(c, 18)} ${c.abbr} · ${JOGADOR.POS[p.pos] || "jogador"}`}</small></a>`;
  };
  const item = (x, i, extra) => (x.t === "c" ? itemClube(byId[x.id], i, extra) : itemJog(JOGADOR.get(x.id), i, extra));
  function mostrar(html) { results.innerHTML = html; results.classList.toggle("open", !!html); sel = 0; }
  // em alta: API > Worker > destaque calculado aqui (sem servidor)
  let alta = null;
  const altaBase = () => (LIVE.on() ? "/api" : String(window.PLACAR_CONFIG?.aoVivo || "").replace(/\/+$/, ""));
  function emAlta() {
    if (alta && Date.now() - alta.t < 5 * 60e3) return alta.p;
    const base = altaBase();
    const destaque = () => {
      const itens = [];
      state.matches.filter((m) => m.status === "progress" || (m.date && m.date === dayKey(new Date()))).slice(0, 3).forEach((m) => itens.push({ t: "c", id: m.home }, { t: "c", id: m.away }));
      (window.PLAYER_STATS?.artilheiros || []).slice(0, 3).forEach((a) => { const p = JOGADOR.get(`${a.id}-${a.club}`); if (p) itens.push({ t: "j", id: p.key }); });
      if (state.standings[0]) itens.push({ t: "c", id: state.standings[0].id });
      const vist = new Set();
      return { fonte: "destaque", itens: itens.filter((x) => !vist.has(x.t + x.id) && vist.add(x.t + x.id)).slice(0, 6) };
    };
    const p = !base ? Promise.resolve(destaque()) : fetch(`${base}/em-alta`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const itens = (d?.itens || []).filter((x) => (x.t === "c" ? byId[x.id] : JOGADOR.get(x.id))).map((x) => (x.t === "j" ? { t: "j", id: JOGADOR.get(x.id).key } : x)).slice(0, 6);
      return itens.length >= 3 ? { fonte: "buscas", itens } : destaque(); // pouca busca ainda: completa com o destaque
    }).catch(() => destaque());
    alta = { t: Date.now(), p };
    return p;
  }
  function contaBusca(t, id) {
    const base = altaBase();
    if (!base) return;
    const k = `${t}:${id}`, vistos = store.get("busca-enviada", {}), agora = Date.now();
    if (vistos[k] && agora - vistos[k] < 6 * 3600e3) return; // cada aparelho conta cada item no máximo a cada 6 h
    for (const [kk, v] of Object.entries(vistos)) if (agora - v > 6 * 3600e3) delete vistos[kk];
    vistos[k] = agora; store.set("busca-enviada", vistos);
    const corpo = new Blob([JSON.stringify({ t, id: String(id) })], { type: "text/plain" });
    try { navigator.sendBeacon?.(`${base}/busca`, corpo) || fetch(`${base}/busca`, { method: "POST", body: corpo, keepalive: true }).catch(() => {}); } catch { /* sem envio, sem problema */ }
  }
  function registrar(a) {
    const [t, id] = (a.dataset.busca || "").split("|");
    if (!t) return;
    const h = histLer().filter((x) => !(x.t === t && x.id === id));
    h.unshift({ t, id });
    store.set(HIST, h.slice(0, 10));
    contaBusca(t, id);
  }
  async function painelVazio() {
    const h = histLer();
    const recentes = h.length ? `<div class="sr-sec"><span>Buscas recentes</span><button type="button" class="sr-limpa" data-busca-limpa>Limpar</button></div>${h.slice(0, 5).map((x, i) => item(x, i)).join("")}` : "";
    mostrar(recentes + `<div class="sr-sec"><span>Em alta</span></div><div class="sr-load">Carregando…</div>`);
    const a = await emAlta();
    if (document.activeElement !== input || input.value.trim()) return;
    const titulo = a.fonte === "buscas" ? "Em alta <small>mais buscados nas últimas 24 h</small>" : "Em destaque agora <small>jogos de hoje e artilheiros</small>";
    mostrar(recentes + `<div class="sr-sec"><span>${titulo}</span></div>${a.itens.map((x, i) => item(x, h.length ? 99 : i)).join("") || `<div class="empty" style="padding:12px">Nada por aqui ainda.</div>`}`);
  }
  input.addEventListener("input", () => {
    const q = norm(input.value.trim());
    if (!q) return painelVazio();
    // clubes: só os que começam com o que foi digitado (nome ou forma curta), em ordem alfabética
    const clubes = CLUBS.filter((c) => [c.name, c.abbr].some((n) => norm(n).startsWith(q))).sort((x, y) => x.name.localeCompare(y.name, "pt-BR")).slice(0, 6);
    const jogs = JOGADOR.busca(q, clubes.length ? 5 : 8);
    const html = (clubes.length ? `<div class="sr-sec"><span>Clubes</span></div>${clubes.map((c, i) => itemClube(c, i)).join("")}` : "") +
      (jogs.length ? `<div class="sr-sec"><span>Jogadores</span></div>${jogs.map((p, i) => itemJog(p, clubes.length ? 99 : i)).join("")}` : "");
    mostrar(html || `<div class="empty" style="padding:16px">Nenhum clube ou jogador encontrado.</div>`);
  });
  input.addEventListener("focus", () => { if (!input.value.trim()) painelVazio(); });
  input.addEventListener("keydown", (e) => {
    const items = $$("a", results);
    if (e.key === "Escape") return close();
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((a, i) => a.classList.toggle("sel", i === sel));
      items[sel].scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter") { const a = items[sel] || items[0]; registrar(a); location.hash = a.getAttribute("href"); close(); }
  });
  const close = () => { results.classList.remove("open"); input.value = ""; input.blur(); };
  results.addEventListener("click", (e) => {
    if (e.target.closest("[data-busca-limpa]")) { e.preventDefault(); store.set(HIST, []); input.focus(); painelVazio(); return; }
    const a = e.target.closest("a[data-busca]");
    if (a) registrar(a);
    setTimeout(close);
  });
  // o botão "Limpar" não pode tirar o foco do campo antes do clique
  results.addEventListener("mousedown", (e) => { if (e.target.closest("[data-busca-limpa]")) e.preventDefault(); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) results.classList.remove("open"); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });

  /* ---------- barra de progresso de rolagem ---------- */
  addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    root.style.setProperty("--scroll", max > 0 ? (scrollY / max).toFixed(3) : 0);
  }, { passive: true });

  /* ==========================================================================
     Status pelo relógio: a cada minuto, jogos que começaram mudam de situação
     ========================================================================== */
  const refresh = () => {
    ({ ROUND, ROUNDS } = window.PD);
    const sig = () => state.matches.map((m) => `${m.status}${m.hs}${m.as}${m.clock}`).join() + JSON.stringify(state.standings) + JSON.stringify(artilhariaGeral());
    const before = sig();
    const antes = new Map(state.matches.map((m) => [m.id, m]));
    state.matches = realMatches(ROUND);
    const anunciou = golsAoVivo(antes);
    state.standings = buildStandings();
    // troca só o que mudou (o minuto a minuto, o topo do clube e a montagem do time continuam onde estão)
    if (sig() !== before && ["", "clube", "tabela", "partida"].includes(state.route.page) && state.route.tab !== "elenco") {
      // com gol: o alerta GOL! aparece primeiro e o resto da página é atualizado no quadro seguinte
      // (a atualização leva ~0,3 s no PC e mais no celular; antes, o alerta só aparecia depois dela)
      if (anunciou) requestAnimationFrame(() => setTimeout(patchView, 0)); else patchView();
    }
  };
  // foto do ídolo que não carregou: o card volta ao visual sem foto (sem script embutido no HTML)
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img && img.matches && img.matches("img[data-sem-foto]")) { img.parentNode?.classList.remove("has-photo"); img.remove(); }
  }, true);
  window.addEventListener("placar:data", refresh);

  /* gol ao vivo: quando o placar de um jogo em andamento sobe, toca o GOL! do clube que marcou.
     A primeira atualização só serve de base (não anuncia gols que já tinham saído antes de abrir o site). */
  let golBase = false;
  function golsAoVivo(antes) {
    if (!golBase) { golBase = true; return false; }
    let n = 0;
    for (const m of state.matches) {
      const o = antes.get(m.id);
      if (!o || m.status !== "progress" || o.hs == null || o.as == null || m.hs == null) continue;
      const h = byId[m.home], a = byId[m.away];
      const placar = `${h.abbr} ${m.hs} x ${m.as} ${a.abbr}${m.clock ? ` · ${m.clock}` : ""}`;
      const link = `#/partida/${m.id}`, relogio = m.clock || "AO VIVO";
      // quem marcou (se a fonte já trouxer): o último gol a favor do clube
      const autor = (cid) => { const x = [...m.gols].reverse().find((q) => q[2] === cid); return x && x[1] ? `${x[1]}${x[3] ? " (contra)" : x[4] ? " (pênalti)" : ""} · ` : ""; };
      if (m.hs > o.hs) { n++; GOALBUG.alerta({ club: h, de: o.hs, para: m.hs, outro: m.as, relogio, texto: autor(h.id) + placar, link }); }
      if (m.as > o.as) { n++; GOALBUG.alerta({ club: a, de: o.as, para: m.as, outro: m.hs, relogio, texto: autor(a.id) + placar, link }); }
    }
    return n > 0;
  }
  setInterval(() => {
    refresh();
  }, 60000);

  /* ---------- início ---------- */
  addEventListener("hashchange", onRoute);
  render();
})();
