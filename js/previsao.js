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
    const js = jogos.filter((j) => ix.has(j.home) && ix.has(j.away)).map((j) => [ix.get(j.home), ix.get(j.away), j.xh, j.xa]);
    const P = new Float64Array(N), W = new Float64Array(N), S = new Float64Array(N), G = new Float64Array(N), ordem = ids.map((_, i) => i);
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < N; i++) { P[i] = base[i][0]; W[i] = base[i][1]; S[i] = base[i][2]; G[i] = base[i][3]; }
      for (const [h, a, xh, xa] of js) {
        const gh = poisson(xh, r), ga = poisson(xa, r);
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
  const api = { simula, rng, poisson };
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
    const el = (view || document).querySelector("[data-previsao]:not([data-pv-ok])");
    if (!el) return;
    el.dataset.pvOk = "1";
    preenche(el);
  }
  raiz.PREVISAO = { page, mount };
})(typeof window !== "undefined" ? window : globalThis);
