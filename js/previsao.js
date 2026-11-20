/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — previsão da tabela final (#/previsao): o resto do Brasileirão simulado 10.000 vezes
   Cada jogo que falta: gols de cada time sorteados pelos gols esperados do modelo da "Chance de vitória" (js/chance.js).
   Desempate como no Brasileirão: pontos, vitórias, saldo de gols, gols pró.
   Resultado: % de título, G6 (Libertadores), 7º a 12º (Sul-Americana) e Z4 (rebaixamento), pontos médios e a chance
   de cada posição. Roda no navegador, em menos de um segundo; o cálculo (simula) também roda no Node (testes).
   ========================================================================== */
(function (raiz) {
  "use strict";
  // gerador aleatório com semente (o mesmo resultado em cada visita do mesmo dia; os testes usam semente fixa)
  function rng(semente) {
    let a = semente >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const poisson = (l, r) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 15); return k - 1; };

  /* tabela: [{id, p, w, gf, ga}]; jogos: [{home, away, xh, xa}] (gols esperados); devolve por clube as chances */
  function simula(tabela, jogos, n = 10000, semente = 1) {
    const r = rng(semente), ids = tabela.map((t) => t.id), N = ids.length, ix = new Map(ids.map((id, i) => [id, i]));
    const pos = ids.map(() => new Array(N).fill(0)), pts = new Array(N).fill(0);
    const base = tabela.map((t) => [t.p, t.w, t.gf - t.ga, t.gf]);
    const js = jogos.filter((j) => ix.has(j.home) && ix.has(j.away)).map((j) => [ix.get(j.home), ix.get(j.away), j.xh, j.xa, j.fixo || null]);
    const P = new Float64Array(N), W = new Float64Array(N), S = new Float64Array(N), G = new Float64Array(N), ordem = ids.map((_, i) => i);
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < N; i++) { P[i] = base[i][0]; W[i] = base[i][1]; S[i] = base[i][2]; G[i] = base[i][3]; }
      for (const [h, a, xh, xa, fixo] of js) {
        const gh = fixo ? fixo[0] : poisson(xh, r), ga = fixo ? fixo[1] : poisson(xa, r);
        S[h] += gh - ga; S[a] += ga - gh; G[h] += gh; G[a] += ga;
        if (gh > ga) { P[h] += 3; W[h]++; } else if (gh < ga) { P[a] += 3; W[a]++; } else { P[h]++; P[a]++; }
      }
      ordem.sort((x, y) => P[y] - P[x] || W[y] - W[x] || S[y] - S[x] || G[y] - G[x] || x - y);
      for (let k = 0; k < N; k++) { pos[ordem[k]][k]++; pts[ordem[k]] += P[ordem[k]]; }
    }
    return ids.map((id, i) => {
      const pp = pos[i].map((c) => c / n), soma = (a, b) => pp.slice(a, b).reduce((x, y) => x + y, 0);
      return { id, posicoes: pp, titulo: pp[0], g6: soma(0, 6), sula: soma(6, 12), z4: soma(N - 4, N), pontos: pts[i] / n, provavel: pp.indexOf(Math.max(...pp)) + 1 };
    });
  }
  /* o que ainda está em jogo para o clube: título, G6, escapar do Z4 ou Sul-Americana (o primeiro que não está decidido) */
  function objetivo(c) {
    const aberto = (v) => v > 0.01 && v < 0.99;
    if (aberto(c.titulo)) return { chave: "titulo", nome: "título", valor: (x) => x.titulo };
    if (aberto(c.g6)) return { chave: "g6", nome: "G6 (Libertadores)", valor: (x) => x.g6 };
    if (aberto(c.z4)) return { chave: "fica", nome: "escapar do Z4", valor: (x) => 1 - x.z4 };
    if (aberto(c.sula)) return { chave: "sula", nome: "Sul-Americana", valor: (x) => x.sula };
    return null;
  }
  /* chance do objetivo do clube se ele vencer, empatar ou perder um jogo (os outros jogos seguem sorteados) */
  function impacto(tabela, jogos, idJogo, clube, obj, n = 3000, semente = 1) {
    const jg = jogos.find((j) => j.id === idJogo);
    if (!jg || !obj) return null;
    const casa = jg.home === clube;
    const rodar = (fixo) => obj.valor(simula(tabela, jogos.map((j) => (j.id === idJogo ? { ...j, fixo } : j)), n, semente).find((x) => x.id === clube));
    return { vitoria: rodar(casa ? [1, 0] : [0, 1]), empate: rodar([1, 1]), derrota: rodar(casa ? [0, 1] : [1, 0]) };
  }
  const api = { simula, rng, poisson, objetivo, impacto };
  raiz.PREVISAO_CALC = api;
  if (typeof module === "object" && module.exports) module.exports = api;

  /* ---------- página (só no navegador) ---------- */
  if (typeof document === "undefined") return;
  const esc = (t) => SEG.esc(t);
  const pct = (v) => (v >= 0.995 ? ">99%" : v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`);
  function page() {
    return `<div class="page-head"><div><h1>Previsão da tabela final</h1>
      <p>O resto do Brasileirão simulado 10.000 vezes, jogo a jogo, com a força de cada time em casa e fora e a forma recente. Quanto mais forte a cor, maior a chance de terminar naquela posição.</p></div></div>
      <div data-previsao><p class="st-txt">Simulando o campeonato…</p></div>`;
  }
  // tabela de hoje e jogos que faltam, com os gols esperados de cada jogo (uma vez por visita)
  let dadosP = null;
  function dados() {
    dadosP = dadosP || (async () => {
      if (!window.CLUB_FORM) await DADOS.carrega("club-form").catch(() => null);
      const tabela = (window.PD?.REAL?.table || []).map(([id, p, , w, , , gf, ga]) => ({ id, p, w, gf, ga }));
      const jogos = restantes().map((m) => { const c = window.CHANCE?.calcula({ ...m, status: "ns" }); return { id: m.id, home: m.home, away: m.away, xh: c?.xg?.casa || 1.3, xa: c?.xg?.fora || 1.0, m }; });
      return { tabela, jogos, semente: Number(new Date().toISOString().slice(0, 10).replace(/-/g, "")) };
    })();
    return dadosP;
  }
  let baseP = null;
  const base = () => (baseP = baseP || dados().then((d) => ({ ...d, res: simula(d.tabela, d.jogos, 10000, d.semente) })));
  const OBJ_TXT = { titulo: "Chance de título", g6: "Chance de G6", fica: "Chance de escapar do Z4", sula: "Chance de Sul-Americana" };
  const barra3 = (i) => `<span class="pv-imp"><b class="v">${pct(i.vitoria)}</b><b class="e">${pct(i.empate)}</b><b class="d">${pct(i.derrota)}</b></span>`;
  function cardClube(id) {
    return `<div class="card pv-card" data-pv-clube="${esc(id)}"><div class="card-h">Previsão <small>10.000 simulações do resto do campeonato</small></div><div class="card-b"><p class="tc-txt">Simulando…</p></div></div>`;
  }
  function cardJogo(m) {
    if (m.status === "ft" || m.adiado) return "";
    return `<div class="card pv-card" data-pv-jogo="${esc(m.id)}" data-h="${esc(m.home)}" data-a="${esc(m.away)}"><div class="card-h">O que este jogo vale <small>chance do objetivo de cada um, conforme o resultado</small></div><div class="card-b"><p class="tc-txt">Simulando…</p></div></div>`;
  }
  async function preencheClube(el) {
    const d = await base(), id = el.dataset.pvClube, c = d.res.find((x) => x.id === id), corpo = el.querySelector(".card-b");
    if (!c) { corpo.innerHTML = `<p class="tc-txt">Previsão indisponível para este clube.</p>`; return; }
    const obj = objetivo(c), N = c.posicoes.length;
    const dist = c.posicoes.map((p, k) => `<i class="${k < 6 ? "g6" : k >= N - 4 ? "z4" : ""}" style="--h:${Math.max(2, p * 100)}%" title="${k + 1}º: ${pct(p)}"></i>`).join("");
    const meus = d.jogos.filter((j) => j.home === id || j.away === id);
    corpo.innerHTML = `<div class="pv-kpis"><div><b>${pct(c.titulo)}</b><small>título</small></div><div><b>${pct(c.g6)}</b><small>G6</small></div><div><b>${pct(c.sula)}</b><small>Sul-Americana</small></div><div class="z"><b>${pct(c.z4)}</b><small>Z4</small></div><div><b>${Math.round(c.pontos)}</b><small>pontos (média)</small></div></div>
      <div class="pv-dist" role="img" aria-label="Chance de cada posição final">${dist}</div><div class="pr-eixo"><span>1º</span><span>posição final mais provável: ${c.provavel}º</span><span>${N}º</span></div>
      ${obj && meus.length ? `<h3 class="pn-h">Jogos que decidem · ${esc(OBJ_TXT[obj.chave])} (hoje ${pct(obj.valor(c))})</h3><ul class="pv-jogos" data-pv-lista><li class="tc-txt">Calculando…</li></ul>
        <p class="tc-txt">Em cada jogo: se vencer · se empatar · se perder (os outros jogos seguem sorteados).</p>` : `<p class="tc-txt">${obj ? "" : "A situação do clube no campeonato já está praticamente definida."}</p>`}`;
    if (!obj || !meus.length) return;
    const ul = el.querySelector("[data-pv-lista]");
    const linhas = [];
    for (const j of meus) {
      await new Promise((ok) => setTimeout(ok, 0)); // não trava a página entre um jogo e outro
      const imp = impacto(d.tabela, d.jogos, j.id, id, obj, 3000, d.semente), outro = byId[j.home === id ? j.away : j.home];
      linhas.push(`<li><a href="#/partida/${esc(j.id)}">${j.home === id ? "x" : "@"} ${outro ? window.GFX.crest(outro, 18) : ""}<span>${esc(outro?.abbr || "")}</span><small>${esc(j.m.round)}ª rodada</small></a>${barra3(imp)}</li>`);
      if (ul.isConnected) ul.innerHTML = linhas.join("");
    }
  }
  async function preencheJogo(el) {
    const d = await base(), corpo = el.querySelector(".card-b");
    const jg = d.jogos.find((j) => j.id === el.dataset.pvJogo);
    if (!jg) { corpo.innerHTML = `<p class="tc-txt">Este jogo não está entre os que faltam no campeonato.</p>`; return; }
    const lado = (id) => {
      const c = d.res.find((x) => x.id === id), obj = c && objetivo(c), cl = byId[id];
      if (!obj) return `<div class="pv-lado"><b>${esc(cl?.abbr || id)}</b><p class="tc-txt">Situação já definida no campeonato.</p></div>`;
      const imp = impacto(d.tabela, d.jogos, jg.id, id, obj, 3000, d.semente);
      return `<div class="pv-lado"><b>${cl ? window.GFX.crest(cl, 20) : ""} ${esc(cl?.abbr || id)}</b><small>${esc(OBJ_TXT[obj.chave])}: hoje ${pct(obj.valor(c))}</small>
        <div class="pv-imp-l"><span>vence</span><span>empata</span><span>perde</span></div>${barra3(imp)}</div>`;
    };
    corpo.innerHTML = `<div class="pv-lados">${lado(jg.home)}${lado(jg.away)}</div><p class="tc-txt">Simulação do resto do campeonato com este resultado fixo. Não é palpite de aposta.</p>`;
  }

  function restantes() {
    const PD = window.PD;
    if (!PD) return [];
    return (PD.ROUNDS || []).filter((rd) => rd >= PD.ROUND).flatMap((rd) => PD.realMatches(rd)).filter((m) => m.status !== "ft" && !m.adiado);
  }
  async function preenche(el) {
    if (!window.CLUB_FORM) await DADOS.carrega("club-form").catch(() => null);
    if (!el.isConnected) return;
    const tabela = (window.PD?.REAL?.table || []).map(([id, p, , w, , , gf, ga]) => ({ id, p, w, gf, ga }));
    const jogos = restantes().map((m) => { const c = window.CHANCE?.calcula({ ...m, status: "ns" }); return { home: m.home, away: m.away, xh: c?.xg?.casa || 1.3, xa: c?.xg?.fora || 1.0 }; });
    if (!tabela.length) { el.innerHTML = `<p class="st-txt">Tabela indisponível agora.</p>`; return; }
    const hoje = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
    const t0 = performance.now(), res = simula(tabela, jogos, 10000, hoje).sort((a, b) => b.pontos - a.pontos), ms = Math.round(performance.now() - t0);
    const N = tabela.length, atual = new Map(tabela.map((t, i) => [t.id, i + 1]));
    const celula = (p, k) => `<td class="pv-c${k < 6 ? " g6" : k >= N - 4 ? " z4" : ""}" style="--a:${Math.min(1, p * 1.6).toFixed(2)}" title="${k + 1}º: ${pct(p)}">${p >= 0.1 ? Math.round(p * 100) : ""}</td>`;
    el.innerHTML = `<section class="card"><div class="card-b pv-wrap"><table class="pv-tab"><thead><tr><th>Clube</th><th title="posição hoje">Hoje</th><th title="pontos médios ao fim">Pts</th><th>Título</th><th>G6</th><th>Sul-Am.</th><th>Z4</th>
        ${Array.from({ length: N }, (_, k) => `<th class="pv-n${k < 6 ? " g6" : k >= N - 4 ? " z4" : ""}">${k + 1}</th>`).join("")}</tr></thead><tbody>
        ${res.map((c) => { const cl = byId[c.id]; return `<tr><th scope="row"><a href="#/clube/${esc(c.id)}">${cl ? window.GFX.crest(cl, 20) : ""}<span>${esc(cl?.abbr || c.id)}</span></a></th>
          <td>${atual.get(c.id)}º</td><td>${Math.round(c.pontos)}</td><td class="pv-p">${pct(c.titulo)}</td><td class="pv-p">${pct(c.g6)}</td><td class="pv-p">${pct(c.sula)}</td><td class="pv-p z">${pct(c.z4)}</td>
          ${c.posicoes.map(celula).join("")}</tr>`; }).join("")}
      </tbody></table></div></section>
      <p class="source">${jogos.length} jogos restantes · 10.000 simulações em ${ms} ms · modelo de Poisson do CazéStats.TV (gols em casa e fora no Brasileirão e forma recente). G6 = 1º ao 6º; Sul-Americana = 7º ao 12º; Z4 = 17º ao 20º. As vagas reais podem mudar com os campeões da Copa do Brasil e da Libertadores. Não é palpite de aposta.</p>`;
  }
  function mount(view) {
    const raizV = view || document;
    const el = raizV.querySelector("[data-previsao]:not([data-pv-ok])");
    if (el) { el.dataset.pvOk = "1"; preenche(el); }
    raizV.querySelectorAll("[data-pv-clube]:not([data-pv-ok])").forEach((x) => { x.dataset.pvOk = "1"; preencheClube(x).catch(() => {}); });
    raizV.querySelectorAll("[data-pv-jogo]:not([data-pv-ok])").forEach((x) => { x.dataset.pvOk = "1"; preencheJogo(x).catch(() => {}); });
  }
  raiz.PREVISAO = { page, mount, cardClube, cardJogo };
})(typeof window !== "undefined" ? window : globalThis);
