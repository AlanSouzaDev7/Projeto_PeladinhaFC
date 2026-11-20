/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — gráfico de pressão: quem está melhor no jogo, minuto a minuto (cálculo próprio)
   Fonte: os lances do resumo da ESPN (chutes, escanteios, impedimentos, faltas no ataque), cada um com um peso.
   O efeito de cada lance vai diminuindo ao longo de ~5 minutos; a pressão de cada minuto é
   (mandante − visitante) / (mandante + visitante + 1,5), de −1 (visitante sufocando) a +1 (mandante sufocando).
   Acima da linha, o mandante; abaixo, o visitante. Gols e o intervalo ficam marcados.
   O cálculo roda no navegador e no Node (testes): js/pressao.js exporta calcula().
   ========================================================================== */
(function (raiz) {
  "use strict";
  const PESOS = { "shot-on-target": 3, goal: 3, "shot-off-target": 2, "shot-blocked": 1.5, "shot-hit-woodwork": 2.5, "hit-woodwork": 2.5, "corner-awarded": 1.5, offside: 0.6, "penalty---scored": 3, "penalty---saved": 3, "penalty---missed": 2.5 };
  const MEIA_VIDA = 4; // minutos
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  /* commentary: lista do resumo da ESPN; casa/fora: nomes dos times como a ESPN escreve (header.competitions[0]) */
  function calcula(commentary, casa, fora) {
    const H = norm(casa), A = norm(fora), lances = [], gols = [];
    let fim = 0, intervalo = null;
    for (const c of commentary || []) {
      const p = c.play || {}, tipo = String(p.type?.type || "").toLowerCase(), seg = Number(p.clock?.value ?? c.time?.value) || 0;
      const min = seg / 60;
      if (min > fim) fim = min;
      if (tipo === "halftime" || /first half ends/i.test(c.text || "")) intervalo = intervalo ?? Math.max(45, min);
      const time = norm(p.team?.displayName);
      const lado = time && time === H ? 1 : time && time === A ? -1 : 0;
      if (!lado) continue;
      let peso = PESOS[tipo] || 0;
      if (!peso && (tipo === "free-kick-won" || /wins a free kick in the attacking half/i.test(c.text || ""))) peso = 0.7; // falta sofrida no ataque
      if (peso) lances.push({ min, lado, peso });
      if (tipo === "goal" || /^goal!/i.test(c.text || "") || tipo.startsWith("penalty---scored")) gols.push({ min, lado });
    }
    const total = Math.max(1, Math.ceil(fim));
    const serie = [];
    for (let t = 1; t <= total; t++) {
      let h = 0, a = 0;
      for (const l of lances) {
        if (l.min > t) continue;
        const f = l.peso * 0.5 ** ((t - l.min) / MEIA_VIDA);
        if (l.lado > 0) h += f; else a += f;
      }
      serie.push({ min: t, v: (h - a) / (h + a + 1.5) });
    }
    const dom = serie.reduce((s, x) => s + x.v, 0) / (serie.length || 1);
    return { serie, gols, intervalo, minutos: total, dominio: dom, lances: lances.length };
  }

  /* gráfico em SVG: barras divergentes (mandante para cima, visitante para baixo), gols e intervalo */
  function svg(r, corCasa, corFora, nomeCasa, nomeFora) {
    const L = 600, A = 160, meio = A / 2, n = Math.max(r.minutos, 90), w = L / n;
    const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    const barras = r.serie.map((p) => {
      const h = Math.abs(p.v) * (meio - 8), y = p.v >= 0 ? meio - h : meio;
      return `<rect x="${((p.min - 1) * w + w * 0.1).toFixed(1)}" y="${y.toFixed(1)}" width="${(w * 0.8).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${p.v >= 0 ? corCasa : corFora}"><title>${p.min}': ${p.v >= 0 ? esc(nomeCasa) : esc(nomeFora)} ${Math.round(Math.abs(p.v) * 100)}%</title></rect>`;
    }).join("");
    const gols = r.gols.map((g) => `<text x="${(g.min * w).toFixed(1)}" y="${g.lado > 0 ? 12 : A - 3}" text-anchor="middle" font-size="11">⚽</text>`).join("");
    const intervalo = r.intervalo ? `<line x1="${(r.intervalo * w).toFixed(1)}" x2="${(r.intervalo * w).toFixed(1)}" y1="4" y2="${A - 4}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="3 3"/>` : "";
    return `<svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="none" role="img" aria-label="Pressão no jogo: acima ${esc(nomeCasa)}, abaixo ${esc(nomeFora)}">
      <line x1="0" x2="${L}" y1="${meio}" y2="${meio}" stroke="currentColor" stroke-opacity=".3"/>${intervalo}${barras}${gols}</svg>`;
  }
  const api = { calcula, svg, PESOS };
  raiz.PRESSAO_CALC = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
