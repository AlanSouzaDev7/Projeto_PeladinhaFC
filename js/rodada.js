/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — resumo da rodada (#/rodada/<n>): resultados e destaques automáticos
     · maior goleada, jogo com mais gols, viradas (pela ordem dos gols), zebra (quem venceu com menos chance),
       artilheiros da rodada, quem subiu e desceu na tabela, Craque do jogo mais votado e xG de cada jogo
   Tudo calculado no navegador com os dados que o site já tem; o cálculo dos destaques roda no Node (testes).
   ========================================================================== */
(function (raiz) {
  "use strict";
  /* ordem dos gols -> houve virada? (o time que venceu esteve atrás no placar) */
  function virada(m) {
    if (m.hs == null || m.as == null || m.hs === m.as) return null;
    let h = 0, a = 0, vencedorAtras = false;
    const venceu = m.hs > m.as ? "h" : "a";
    for (const g of m.gols || []) {
      const clube = g[2], contra = !!g[4];
      const paraCasa = contra ? clube === m.away : clube === m.home;
      if (paraCasa) h++; else a++;
      if ((venceu === "h" && h < a) || (venceu === "a" && a < h)) vencedorAtras = true;
    }
    return vencedorAtras && (m.gols || []).length === m.hs + m.as ? (venceu === "h" ? m.home : m.away) : null;
  }
  /* tabela depois de uma rodada: a atual menos os jogos encerrados das rodadas seguintes */
  function tabelaApos(tabela, jogosPorRodada, rodada) {
    const t = new Map(tabela.map((r) => [r.id, { ...r }]));
    for (const [rd, jogos] of Object.entries(jogosPorRodada)) {
      if (Number(rd) <= rodada) continue;
      for (const m of jogos) {
        if (m.status !== "ft" || m.hs == null || !t.has(m.home) || !t.has(m.away)) continue;
        const H = t.get(m.home), A = t.get(m.away);
        H.gf -= m.hs; H.ga -= m.as; A.gf -= m.as; A.ga -= m.hs;
        if (m.hs > m.as) { H.p -= 3; H.w--; } else if (m.hs < m.as) { A.p -= 3; A.w--; } else { H.p--; A.p--; }
      }
    }
    return [...t.values()].sort((x, y) => y.p - x.p || y.w - x.w || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf).map((r, i) => ({ ...r, pos: i + 1 }));
  }
  /* destaques de uma rodada. chance(m) -> {casa, empate, fora} antes do jogo (opcional) */
  function destaques(jogos, { antes = [], depois = [], chance } = {}) {
    const ft = jogos.filter((m) => m.status === "ft" && m.hs != null && m.as != null);
    const out = { encerrados: ft.length, total: jogos.length };
    if (!ft.length) return out;
    const dif = (m) => Math.abs(m.hs - m.as), gols = (m) => m.hs + m.as;
    const goleada = [...ft].sort((a, b) => dif(b) - dif(a) || gols(b) - gols(a))[0];
    if (dif(goleada) >= 3) out.goleada = goleada;
    const maisGols = [...ft].sort((a, b) => gols(b) - gols(a))[0];
    if (gols(maisGols) >= 4 && maisGols !== out.goleada) out.maisGols = maisGols;
    out.gols = ft.reduce((s, m) => s + gols(m), 0);
    out.viradas = ft.map((m) => ({ m, quem: virada(m) })).filter((x) => x.quem);
    if (chance) {
      const zebras = ft.filter((m) => m.hs !== m.as).map((m) => { const c = chance(m); return { m, quem: m.hs > m.as ? m.home : m.away, p: m.hs > m.as ? c.casa : c.fora }; })
        .filter((z) => Number.isFinite(z.p)).sort((a, b) => a.p - b.p);
      if (zebras[0] && zebras[0].p < 0.3) out.zebra = zebras[0];
    }
    const porJogador = new Map();
    for (const m of ft) for (const g of m.gols || []) {
      if (g[4]) continue; // gol contra não conta para artilheiro
      const k = `${g[0]}|${g[2]}`, x = porJogador.get(k) || { aid: g[0], nome: g[1], clube: g[2], gols: 0 };
      x.gols++; porJogador.set(k, x);
    }
    out.artilheiros = [...porJogador.values()].filter((x) => x.gols >= 2).sort((a, b) => b.gols - a.gols);
    if (antes.length && depois.length) {
      const pa = new Map(antes.map((r) => [r.id, r.pos]));
      const mov = depois.map((r) => ({ id: r.id, de: pa.get(r.id), para: r.pos, d: (pa.get(r.id) || r.pos) - r.pos })).filter((x) => x.d !== 0);
      out.subiu = [...mov].sort((a, b) => b.d - a.d).filter((x) => x.d > 0).slice(0, 3);
      out.desceu = [...mov].sort((a, b) => a.d - b.d).filter((x) => x.d < 0).slice(0, 3);
      out.lider = depois[0]?.id;
    }
    return out;
  }
  const api = { virada, tabelaApos, destaques };
  raiz.RODADA_CALC = api;
  /* seleção da rodada (4-3-3): os de maior nota em cada posição, entre os candidatos dos jogos da rodada
     (dados/notas-jogos.json, server/selecao.py). Desempate: participações em gol, depois minutos, depois o nome.
     Craque da rodada: a maior nota do time. Linhas: [aid, clube, nome, pos, nota, gols, assist, min] */
  const VAGAS = { G: 1, D: 4, M: 3, F: 3 };
  function selecao(porJogo, eids) {
    const todos = [];
    for (const eid of eids || []) for (const r of (porJogo && porJogo[eid]) || []) todos.push({ aid: r[0], clube: r[1], nome: r[2], pos: r[3], nota: r[4], g: r[5], a: r[6], min: r[7], eid: String(eid) });
    todos.sort((x, y) => y.nota - x.nota || (y.g + y.a) - (x.g + x.a) || y.min - x.min || String(x.nome).localeCompare(String(y.nome), "pt-BR"));
    const time = { G: [], D: [], M: [], F: [] }, ja = new Set();
    for (const j of todos) {
      const chave = `${j.aid}-${j.clube}`; // o mesmo jogador pode ter dois jogos na rodada (jogo adiado)
      if (time[j.pos] && time[j.pos].length < VAGAS[j.pos] && !ja.has(chave)) { time[j.pos].push(j); ja.add(chave); }
    }
    const escalados = [...time.G, ...time.D, ...time.M, ...time.F];
    if (!escalados.length) return null;
    const craque = escalados.reduce((m, j) => (j.nota > m.nota || (j.nota === m.nota && j.g + j.a > m.g + m.a) ? j : m));
    const porClube = {};
    for (const j of escalados) porClube[j.clube] = (porClube[j.clube] || 0) + 1;
    const [clubeMais, nMais] = Object.entries(porClube).sort((a, b) => b[1] - a[1])[0];
    return { time, craque, completo: escalados.length === 11, media: Math.round((escalados.reduce((t, j) => t + j.nota, 0) / escalados.length) * 10) / 10, clubeMais: nMais > 2 ? { id: clubeMais, n: nMais } : null };
  }
  api.selecao = selecao;

  if (typeof module === "object" && module.exports) module.exports = api;

  /* ---------- página (só no navegador) ---------- */
  if (typeof document === "undefined") return;
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const esc = (t) => SEG.esc(t);
  const ab = (id) => (typeof byId !== "undefined" && byId[id]?.abbr) || id;
  const escudo = (id, t = 22) => (typeof byId !== "undefined" && byId[id] ? window.GFX.crest(byId[id], t) : "");
  const placar = (m) => `${esc(ab(m.home))} ${m.hs} x ${m.as} ${esc(ab(m.away))}`;

  function rodadaPadrao() {
    const PD = window.PD;
    const com = (PD.ROUNDS || []).filter((rd) => PD.realMatches(rd).some((m) => m.status === "ft"));
    return com.length ? Math.max(...com) : PD.ROUND;
  }
  function page(id) {
    const PD = window.PD, feitas = (PD.ROUNDS || []).filter((r) => PD.realMatches(r).some((m) => m.status === "ft"));
    // só rodadas com jogo encerrado (#/rodada/999, -3 ou uma rodada sem jogos lidos caem na mais recente)
    const pedida = Number(id), rd = feitas.includes(pedida) ? pedida : rodadaPadrao();
    const aviso = id && pedida !== rd ? `<p class="st-txt rd-aviso">A ${esc(String(id))}ª rodada não tem jogos encerrados por aqui: este é o resumo da ${rd}ª.</p>` : "";
    const chips = feitas.map((r) => `<a class="chip ${r === rd ? "on" : ""}" href="#/rodada/${r}">${r}ª</a>`).join("");
    return `<div class="page-head"><div><h1>Resumo da ${rd}ª rodada</h1><p>Resultados e destaques automáticos do Brasileirão.</p></div></div>
      ${aviso}<div class="chips rd-chips">${chips}</div><div data-rodada="${rd}"><p class="st-txt">Montando o resumo…</p></div>`;
  }
  function jogosPorRodada() {
    const PD = window.PD, out = {};
    for (const r of PD.ROUNDS || []) out[r] = PD.realMatches(r);
    return out;
  }
  async function preenche(el) {
    const rd = Number(el.dataset.rodada), porR = jogosPorRodada(), jogos = porR[rd] || [];
    if (!window.CLUB_FORM) await DADOS.carrega("club-form").catch(() => null);
    if (!el.isConnected) return;
    const tabela = (window.PD.REAL?.table || []).map(([id, p, , w, , , gf, ga]) => ({ id, p, w, gf, ga }));
    const antes = tabelaApos(tabela, porR, rd - 1), depois = tabelaApos(tabela, porR, rd);
    const chance = (m) => window.CHANCE?.calcula({ ...m, status: "ns" }) || {};
    const D = destaques(jogos, { antes, depois, chance });
    const linhaJogo = (m) => {
      const gols = (m.gols || []).filter((g) => !g[4]).map((g) => `${esc(g[1])}${g[3] ? " (pên.)" : ""}`);
      return `<li><a href="#/partida/${esc(m.id)}"><span class="rd-t">${escudo(m.home)}${esc(ab(m.home))}</span><b>${m.status === "ft" ? `${m.hs} x ${m.as}` : m.status === "progress" ? `${m.hs ?? 0} x ${m.as ?? 0}` : "x"}</b><span class="rd-t dir">${esc(ab(m.away))}${escudo(m.away)}</span></a>
        ${gols.length ? `<small>${gols.join(", ")}</small>` : m.status !== "ft" ? `<small>${m.status === "progress" ? "ao vivo" : esc(m.time ? `${m.date ? m.date.slice(8, 10) + "/" + m.date.slice(5, 7) + " · " : ""}${m.time}` : "a definir")}</small>` : ""}
        <span class="rd-extra" data-rd-jogo="${esc(String(m.espn || ""))}"></span></li>`;
    };
    const item = (rotulo, txt, link) => `<li><span>${esc(rotulo)}</span><b>${link ? `<a href="${link}">${txt}</a>` : txt}</b></li>`;
    const itens = [];
    if (D.goleada) itens.push(item("Maior goleada", placar(D.goleada), `#/partida/${D.goleada.id}`));
    if (D.maisGols) itens.push(item("Jogo com mais gols", `${placar(D.maisGols)} (${D.maisGols.hs + D.maisGols.as} gols)`, `#/partida/${D.maisGols.id}`));
    D.viradas?.forEach((v) => itens.push(item("Virada", `${esc(ab(v.quem))} virou: ${placar(v.m)}`, `#/partida/${v.m.id}`)));
    if (D.zebra) itens.push(item("Zebra", `${esc(ab(D.zebra.quem))} venceu com ${Math.round(D.zebra.p * 100)}% de chance: ${placar(D.zebra.m)}`, `#/partida/${D.zebra.m.id}`));
    D.artilheiros?.forEach((a) => itens.push(item(a.gols >= 3 ? "Hat-trick" : "Fez dois", `${esc(a.nome)} (${esc(ab(a.clube))}), ${a.gols} gols`)));
    if (D.lider) itens.push(item("Líder", esc(byId[D.lider]?.name || D.lider)));
    const mov = (l, seta) => l.map((x) => `<li>${escudo(x.id, 18)}<span>${esc(ab(x.id))}</span><b>${x.de}º → ${x.para}º ${seta}</b></li>`).join("");
    el.innerHTML = `<section class="card rd-sel" data-rd-selecao><div class="card-h">Seleção da rodada <small>4-3-3 pelas notas do CazéStats.TV</small></div><div class="card-b"><p class="st-txt">Escalando…</p></div></section>
      <div class="grid-2">
      <section class="card"><div class="card-h">Resultados <small>${D.encerrados} de ${D.total} jogos encerrados${D.gols != null ? ` · ${D.gols} gols` : ""}</small></div><div class="card-b"><ul class="rd-jogos">${jogos.map(linhaJogo).join("")}</ul></div></section>
      <div>
        <section class="card"><div class="card-h">Destaques</div><div class="card-b">${itens.length ? `<ul class="rd-dest">${itens.join("")}</ul>` : `<p class="st-txt">Os destaques aparecem com os jogos encerrados.</p>`}</div></section>
        ${D.subiu?.length || D.desceu?.length ? `<section class="card"><div class="card-h">Sobe e desce na tabela</div><div class="card-b rd-mov">
          <div><h3 class="pn-h">Subiram</h3><ul>${mov(D.subiu || [], "▲")}</ul></div><div><h3 class="pn-h">Desceram</h3><ul>${mov(D.desceu || [], "▼")}</ul></div></div></section>` : ""}
        <section class="card"><div class="card-h">Craques da torcida e xG <small>votação e chances de cada jogo</small></div><div class="card-b"><ul class="rd-dest" data-rd-craques><li class="st-txt">Carregando…</li></ul></div></section>
        ${window.COMPARTILHAR ? `<div class="cp-wrap">${COMPARTILHAR.botao("rodada", String(rd))}</div>` : ""}
      </div></div>`;
    extras(el, jogos.filter((m) => m.status === "ft" && m.espn)).catch(() => {});
    pintaSelecao(el, rd, jogos).catch(() => {});
  }
  const NOTA_COR = (n) => (n >= 8 ? "n-top" : n >= 7 ? "n-boa" : n >= 6.5 ? "n-ok" : n >= 6 ? "n-med" : "n-ruim");
  const notaTxt = (n) => n.toFixed(1).replace(".", ",");
  async function pintaSelecao(el, rd, jogos) {
    const box = el.querySelector("[data-rd-selecao] .card-b");
    const ft = jogos.filter((m) => m.status === "ft" && m.espn).map((m) => String(m.espn));
    const D = window.NOTAS_JOGOS || (await DADOS.carrega("notas-jogos").catch(() => null), window.NOTAS_JOGOS);
    if (!window.FOTOS) await DADOS.carrega("fotos").catch(() => null); // fotos guardadas dos sites dos clubes (o campinho mostra os jogadores)
    if (!box?.isConnected) return;
    const S = D && selecao(D.jogos, ft);
    if (!S) { box.innerHTML = `<p class="st-txt">A seleção aparece quando as notas dos jogos encerrados forem lidas.</p>`; return; }
    selecoes[rd] = S;
    // jogador no campinho: a foto em destaque (guardada do site do clube ou da ESPN; sem nenhuma, as iniciais na cor do
    // clube), o escudo pequeno no canto, a nota em cima e o nome embaixo
    const cor = (cid) => (window.GFX?.display ? GFX.display(byId[cid]) : byId[cid]?.colors?.[0]) || "#1f6b3a";
    // nome que cabe embaixo da foto: "Túlio Eduardo Silva De Oliveira" -> "T. Oliveira", "Bruno Pacheco" -> "B. Pacheco"
    const curto = (n) => { const p = String(n).trim().split(/\s+/); return n.length <= 10 || p.length < 2 ? n : `${p[0][0]}. ${p[p.length - 1]}`; };
    const ini = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const foto = (j, cls = "rd-foto") => `<span class="${cls}" style="--cc:${esc(cor(j.clube))}"><i aria-hidden="true">${esc(ini(j.nome))}</i>${window.GFX?.imgReserva ? GFX.imgReserva(GFX.fotosJogador(j.clube, j.aid), "") : ""}<span class="rd-esc">${escudo(j.clube, 22)}</span></span>`;
    const peca = (j) => `<a class="rd-jg${j === S.craque ? " craque" : ""}" href="#/jogador/${esc(j.aid)}-${esc(j.clube)}" aria-label="${esc(j.nome)}, ${esc(byId[j.clube]?.name || j.clube)}, nota ${notaTxt(j.nota)}">
        <span class="nota ${NOTA_COR(j.nota)}">${notaTxt(j.nota)}</span>${foto(j)}<b title="${esc(j.nome)}">${esc(curto(j.nome))}</b>
        <small>${esc(ab(j.clube))}${j.g ? ` · ${j.g} gol${j.g > 1 ? "s" : ""}` : ""}${j.a ? ` · ${j.a} assist.` : ""}</small></a>`;
    const linha = (pos) => `<div class="rd-linha rd-l-${pos}" data-n="${S.time[pos].length}">${S.time[pos].map(peca).join("")}</div>`;
    const c = S.craque;
    const gramado = `<svg class="rd-linhas" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,0.78)" stroke-width="0.45">
      <rect x="1" y="1" width="66" height="103"/><path d="M1 52.5h66"/><circle cx="34" cy="52.5" r="9.15"/><circle cx="34" cy="52.5" r="0.5" fill="rgba(255,255,255,0.85)"/>
      <rect x="13.84" y="1" width="40.32" height="16.5"/><rect x="24.84" y="1" width="18.32" height="5.5"/><path d="M26.7 17.5a9.15 9.15 0 0 0 14.6 0"/>
      <rect x="13.84" y="87.5" width="40.32" height="16.5"/><rect x="24.84" y="98.5" width="18.32" height="5.5"/><path d="M26.7 87.5a9.15 9.15 0 0 1 14.6 0"/>
      <circle cx="34" cy="12" r="0.5" fill="rgba(255,255,255,0.85)"/><circle cx="34" cy="93" r="0.5" fill="rgba(255,255,255,0.85)"/></g></svg>`;
    box.innerHTML = `<div class="rd-sel-grid"><div class="rd-campo3d" role="group" aria-label="Seleção da ${rd}ª rodada em 4-3-3">
        <div class="rd-gramado" aria-hidden="true">${gramado}</div>
        <div class="rd-jogadores">${linha("F")}${linha("M")}${linha("D")}${linha("G")}</div></div>
      <div class="rd-sel-lado"><a class="rd-craque" href="#/jogador/${esc(c.aid)}-${esc(c.clube)}">${foto(c, "rd-foto rd-foto-g")}<span class="rd-craque-txt"><span>Craque da rodada</span><b>${esc(c.nome)}</b>
          <small>${esc(byId[c.clube]?.name || c.clube)}${c.g ? ` · ${c.g} gol${c.g > 1 ? "s" : ""}` : ""}${c.a ? ` · ${c.a} assist.` : ""}</small></span><em class="rd-craque-nota" title="Nota do CazéStats.TV">${notaTxt(c.nota)}</em></a>
        <ul class="rd-dest"><li><span>Nota média</span><b>${notaTxt(S.media)}</b></li>${S.clubeMais ? `<li><span>Mais escalado</span><b>${esc(byId[S.clubeMais.id]?.name || S.clubeMais.id)}, ${S.clubeMais.n} jogadores</b></li>` : ""}
        ${S.completo ? "" : `<li><span>Time incompleto</span><b>faltam notas de alguns jogos</b></li>`}</ul>
        ${window.COMPARTILHAR ? `<div class="cp-wrap">${COMPARTILHAR.botao("selecao", String(rd))}</div>` : ""}
        <p class="st-txt">Os de maior nota em cada posição, com pelo menos 30 minutos em campo. Desempate: gols e assistências.</p></div></div>`;
  }
  const selecoes = {};
  // craque mais votado e xG de cada jogo encerrado (um pedido por jogo; aparecem conforme chegam)
  async function extras(el, ft) {
    const ul = el.querySelector("[data-rd-craques]"), linhas = [];
    for (const m of ft) {
      const [voto, resumo] = await Promise.all([
        API ? fetch(`${API}/torcida/${encodeURIComponent(m.espn)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null,
        window.CHUTES_CALC ? fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event=${encodeURIComponent(m.espn)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null,
      ]);
      if (!el.isConnected) return;
      const craque = voto?.craque?.[0];
      let xg = "";
      if (resumo) {
        const cs = resumo.header?.competitions?.[0]?.competitors || [];
        const r = window.CHUTES_CALC.calcula(resumo.commentary || [], cs.find((c) => c.homeAway === "home")?.team?.displayName, cs.find((c) => c.homeAway === "away")?.team?.displayName);
        if (r.chutes.length) xg = `xG ${r.casa.xg.toFixed(1).replace(".", ",")} x ${r.fora.xg.toFixed(1).replace(".", ",")}`;
      }
      linhas.push(`<li><span><a href="#/partida/${esc(m.id)}">${placar(m)}</a></span><b>${craque ? `Craque: ${esc(craque.nome)}` : "sem votos"}${xg ? ` · ${xg}` : ""}</b></li>`);
      if (ul.isConnected) ul.innerHTML = linhas.join("");
    }
    if (!ft.length && ul.isConnected) ul.innerHTML = `<li class="st-txt">Aparece com os jogos encerrados.</li>`;
  }
  function mount(view) {
    const el = (view || document).querySelector("[data-rodada]:not([data-rd-ok])");
    if (!el) return;
    el.dataset.rdOk = "1";
    preenche(el);
  }
  raiz.RODADA = { page, mount, rodadaPadrao, selecaoDa: (rd) => selecoes[rd] || null };
})(typeof window !== "undefined" ? window : globalThis);
