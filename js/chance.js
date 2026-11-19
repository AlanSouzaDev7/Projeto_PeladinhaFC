/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — chance de vitória, empate e derrota (página da partida)
   Modelo de Poisson com os jogos do Brasileirão de cada clube (window.CLUB_FORM, fonte ESPN):
     · força de ataque e de defesa em casa e fora, comparadas à média da liga (mandante x visitante)
     · amostra pequena puxada para a média (cada clube começa com 5 jogos "médios")
     · forma recente: os últimos 6 jogos valem 30% da conta
   Durante o jogo: parte do placar atual e conta só os gols esperados no tempo que falta.
   É uma estimativa estatística do CazéStats.TV, não um palpite de aposta.
   ========================================================================== */
(() => {
  "use strict";
  const LIGA = "bra.1", MEDIO = 5, RECENTE = 6, PESO_RECENTE = 0.3, MAX_GOLS = 10;

  const jogosDe = (id) => ((window.CLUB_FORM?.clubs?.[id]?.all) || []).filter((j) => j.lg === LIGA && j.state === "post" && Number.isFinite(j.gf) && Number.isFinite(j.ga));
  function mediasDaLiga() {
    let gc = 0, gf = 0, n = 0;
    for (const c of Object.values(window.CLUB_FORM?.clubs || {})) {
      for (const j of (c.all || [])) if (j.lg === LIGA && j.state === "post" && j.home && Number.isFinite(j.gf)) { gc += j.gf; gf += j.ga; n++; }
    }
    return n >= 20 ? { casa: gc / n, fora: gf / n } : { casa: 1.45, fora: 1.05 }; // sem dados: média histórica do Brasileirão
  }
  // razão "puxada para 1" quando há poucos jogos: (soma + MEDIO * média) / ((n + MEDIO) * média)
  const forca = (soma, n, media) => (soma + MEDIO * media) / ((n + MEDIO) * media);
  function perfil(id, med) {
    const js = jogosDe(id), casa = js.filter((j) => j.home), fora = js.filter((j) => !j.home);
    const s = (l, k) => l.reduce((t, j) => t + j[k], 0);
    const p = {
      ataqueCasa: forca(s(casa, "gf"), casa.length, med.casa), defesaCasa: forca(s(casa, "ga"), casa.length, med.fora),
      ataqueFora: forca(s(fora, "gf"), fora.length, med.fora), defesaFora: forca(s(fora, "ga"), fora.length, med.casa), n: js.length,
    };
    // forma recente: gols pró e contra dos últimos jogos em relação à média do próprio clube na temporada
    const ult = [...js].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, RECENTE);
    if (ult.length >= 3 && js.length >= 8) {
      const mg = (l, k) => (s(l, k) + 1) / (l.length + 1);
      p.formaAtaque = mg(ult, "gf") / mg(js, "gf");
      p.formaDefesa = mg(ult, "ga") / mg(js, "ga");
    } else { p.formaAtaque = 1; p.formaDefesa = 1; }
    return p;
  }
  const mistura = (x, forma) => x * (1 - PESO_RECENTE + PESO_RECENTE * forma);
  function golsEsperados(casaId, foraId) {
    const med = mediasDaLiga(), h = perfil(casaId, med), a = perfil(foraId, med);
    return {
      casa: med.casa * mistura(h.ataqueCasa, h.formaAtaque) * mistura(a.defesaFora, a.formaDefesa),
      fora: med.fora * mistura(a.ataqueFora, a.formaAtaque) * mistura(h.defesaCasa, h.formaDefesa),
      amostra: Math.min(h.n, a.n),
    };
  }
  const poisson = (l) => { const p = [Math.exp(-l)]; for (let k = 1; k <= MAX_GOLS; k++) p.push((p[k - 1] * l) / k); return p; };

  // minuto do jogo a partir do relógio ("67'", "45'+2'", "Intervalo", "HT")
  function minuto(clock) {
    const c = String(clock || "");
    if (/interv|half|^ht$/i.test(c)) return 45;
    const m = /(\d{1,3})/.exec(c);
    return m ? Math.min(90, Number(m[1])) : 0;
  }
  /* probabilidades do resultado final. m: jogo do site (home, away, status, hs, as, clock) */
  function calcula(m) {
    const xg = golsEsperados(m.home, m.away);
    const vivo = m.status === "progress" && m.hs != null && m.as != null;
    const resta = vivo ? Math.max(0, 90 - minuto(m.clock)) / 90 : 1;
    const ph = poisson(xg.casa * resta), pa = poisson(xg.fora * resta), h0 = vivo ? m.hs : 0, a0 = vivo ? m.as : 0;
    let casa = 0, empate = 0, fora = 0, melhor = null;
    for (let i = 0; i <= MAX_GOLS; i++) for (let j = 0; j <= MAX_GOLS; j++) {
      const p = ph[i] * pa[j], fh = h0 + i, fa = a0 + j;
      if (fh > fa) casa += p; else if (fh === fa) empate += p; else fora += p;
      if (!melhor || p > melhor.p) melhor = { p, casa: fh, fora: fa };
    }
    const t = casa + empate + fora;
    return { casa: casa / t, empate: empate / t, fora: fora / t, provavel: melhor, xg, vivo };
  }
  // porcentagens inteiras que somam 100 (maior resto)
  function cem(ps) {
    const base = ps.map((p) => Math.floor(p * 100)), resto = ps.map((p, i) => p * 100 - base[i]);
    let falta = 100 - base.reduce((a, b) => a + b, 0);
    while (falta-- > 0) { const i = resto.indexOf(Math.max(...resto)); base[i]++; resto[i] = -1; }
    return base;
  }

  /* cartão (região ao vivo: o site troca só os números e as larguras quando o placar ou o minuto mudam) */
  function card(m, cores = {}) {
    if (m.status === "ft" || m.status === "pending" || m.adiado || typeof byId === "undefined") return "";
    if (!window.CLUB_FORM) return `<div data-chance-vazio hidden></div>`; // a página carrega os jogos dos clubes e troca pelo cartão
    const c = calcula(m), [pc, pe, pf] = cem([c.casa, c.empate, c.fora]);
    const h = byId[m.home], a = byId[m.away], esc = SEG.esc;
    const seg = (p, cor, nome) => `<i style="width:${p}%;background:${cor}" title="${esc(nome)}: ${p}%"></i>`;
    return `<div class="card chance" data-live="chance">
      <div class="card-h">Chance de vitória <small>${c.vivo ? "ao vivo, pelo placar e o tempo que falta" : "antes do jogo"}</small></div>
      <div class="card-b">
        <div class="ch-nums"><div><b>${pc}%</b><span>${esc(h.abbr)}</span></div><div><b>${pe}%</b><span>Empate</span></div><div><b>${pf}%</b><span>${esc(a.abbr)}</span></div></div>
        <div class="ch-barra" role="img" aria-label="${esc(h.name)} ${pc}%, empate ${pe}%, ${esc(a.name)} ${pf}%">${seg(pc, cores.casa || "var(--accent)", h.name)}${seg(pe, "var(--text-3)", "Empate")}${seg(pf, cores.fora || "var(--text-2)", a.name)}</div>
        <p class="ch-nota">Placar mais provável: <b>${esc(h.abbr)} ${c.provavel.casa} x ${c.provavel.fora} ${esc(a.abbr)}</b> · gols esperados ${c.xg.casa.toFixed(1).replace(".", ",")} x ${c.xg.fora.toFixed(1).replace(".", ",")}${c.vivo ? " (jogo inteiro)" : ""}</p>
        <p class="ch-nota">Estimativa do CazéStats.TV com os gols em casa e fora no Brasileirão e a forma recente. Não é palpite de aposta.</p>
      </div></div>`;
  }

  window.CHANCE = { card, calcula, _minuto: minuto, _cem: cem };
})();
