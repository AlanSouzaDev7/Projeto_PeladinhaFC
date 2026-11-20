/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — mapa de chutes da partida e xG estimado (cálculo próprio)
   Fonte: os lances de finalização do resumo da ESPN, que trazem onde o chute saiu (fieldPositionX/Y) e onde terminou
   (fieldPosition2X/Y), de 0 a 100, sempre com o time que chuta atacando para o 100.
   No desenho, o mandante ataca para a direita e o visitante para a esquerda (posições espelhadas).
   xG estimado: chance de um chute daquele lugar virar gol, por um modelo logístico simples de distância e ângulo
   para o gol (campo de 105 x 68 m); cabeceio vale 60%. É uma estimativa do CazéStats.TV, não um dado oficial.
   Roda no navegador e no Node (testes): exporta calcula(), xg() e svg().
   ========================================================================== */
(function (raiz) {
  "use strict";
  const TIPOS = { goal: "gol", "shot-on-target": "alvo", "shot-off-target": "fora", "shot-blocked": "bloqueado", "shot-hit-woodwork": "trave", "hit-woodwork": "trave" };
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  /* chance de gol pela posição (x, y de 0 a 100, atacando para x = 100) */
  function xg(x, y, cabeca = false) {
    const dx = (100 - x) * 1.05, dy = (y - 50) * 0.68; // metros
    const dist = Math.hypot(dx, dy);
    const a = Math.atan2(7.32 * dx, dx * dx + dy * dy - (7.32 / 2) ** 2); // ângulo que o gol "abre" visto da bola
    const ang = a < 0 ? a + Math.PI : a;
    const v = 1 / (1 + Math.exp(-(-1.0 + 1.6 * ang - 0.1 * dist)));
    return Math.min(0.95, Math.max(0.01, v * (cabeca ? 0.6 : 1)));
  }

  function calcula(commentary, casa, fora) {
    const H = norm(casa), A = norm(fora), chutes = [];
    for (const c of commentary || []) {
      const p = c.play || {}, tipo = TIPOS[String(p.type?.type || "").toLowerCase()] || (/^goal!/i.test(c.text || "") ? "gol" : null);
      if (!tipo || !Number.isFinite(p.fieldPositionX) || !Number.isFinite(p.fieldPositionY)) continue;
      const time = norm(p.team?.displayName), lado = time === H ? "casa" : time === A ? "fora" : null;
      if (!lado) continue;
      const texto = String(c.text || "");
      const cabeca = /header|cabe[cç]/i.test(texto), penalti = /penalty|p[eê]nalti/i.test(texto);
      const jogador = (/\.\s+([^.()]+?)\s+\(/.exec(texto) || [])[1] || "";
      chutes.push({ lado, tipo, min: p.clock?.displayValue || c.time?.displayValue || "", x: p.fieldPositionX, y: p.fieldPositionY,
        x2: Number.isFinite(p.fieldPosition2X) ? p.fieldPosition2X : null, y2: Number.isFinite(p.fieldPosition2Y) ? p.fieldPosition2Y : null,
        jogador: jogador.slice(0, 40), cabeca, xg: penalti ? 0.76 : xg(p.fieldPositionX, p.fieldPositionY, cabeca) });
    }
    const resumo = (l) => {
      const cs = chutes.filter((c) => c.lado === l);
      return { chutes: cs.length, alvo: cs.filter((c) => c.tipo === "alvo" || c.tipo === "gol").length, gols: cs.filter((c) => c.tipo === "gol").length, xg: cs.reduce((s, c) => s + c.xg, 0) };
    };
    return { chutes, casa: resumo("casa"), fora: resumo("fora") };
  }

  /* campo inteiro em SVG (105 x 68): mandante atacando para a direita, visitante para a esquerda */
  function svg(r, corCasa, corFora, nomeCasa, nomeFora) {
    const W = 105, H = 68, esc = (t) => String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    const pos = (c, x, y) => (c.lado === "casa" ? [x * 1.05, y * 0.68] : [(100 - x) * 1.05, (100 - y) * 0.68]);
    const linhas = `<g fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width=".35">
      <rect x=".3" y=".3" width="${W - 0.6}" height="${H - 0.6}"/><line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}"/><circle cx="${W / 2}" cy="${H / 2}" r="9.15"/>
      <rect x="0" y="${H / 2 - 20.16}" width="16.5" height="40.32"/><rect x="${W - 16.5}" y="${H / 2 - 20.16}" width="16.5" height="40.32"/>
      <rect x="0" y="${H / 2 - 9.16}" width="5.5" height="18.32"/><rect x="${W - 5.5}" y="${H / 2 - 9.16}" width="5.5" height="18.32"/></g>`;
    const marcas = r.chutes.map((c) => {
      const [x, y] = pos(c, c.x, c.y), cor = c.lado === "casa" ? corCasa : corFora, raio = 0.9 + c.xg * 2.6;
      const titulo = `<title>${esc(c.min)} ${esc(c.jogador || (c.lado === "casa" ? nomeCasa : nomeFora))}: ${({ gol: "gol", alvo: "no alvo", fora: "para fora", bloqueado: "bloqueado", trave: "na trave" })[c.tipo]} · xG ${c.xg.toFixed(2)}</title>`;
      const fim = (c.tipo === "gol" || c.tipo === "alvo") && c.x2 != null ? (() => { const [a, b] = pos(c, c.x2, c.y2); return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${a.toFixed(1)}" y2="${b.toFixed(1)}" stroke="${cor}" stroke-opacity=".5" stroke-width=".35"/>`; })() : "";
      const ponto = c.tipo === "gol" ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(raio + 0.6).toFixed(2)}" fill="${cor}" stroke="#fff" stroke-width=".6"/>`
        : c.tipo === "alvo" || c.tipo === "trave" ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${raio.toFixed(2)}" fill="${cor}" fill-opacity=".85"/>`
          : c.tipo === "fora" ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${raio.toFixed(2)}" fill="none" stroke="${cor}" stroke-width=".5"/>`
            : `<g stroke="${cor}" stroke-width=".55"><line x1="${(x - 0.9).toFixed(1)}" y1="${(y - 0.9).toFixed(1)}" x2="${(x + 0.9).toFixed(1)}" y2="${(y + 0.9).toFixed(1)}"/><line x1="${(x - 0.9).toFixed(1)}" y1="${(y + 0.9).toFixed(1)}" x2="${(x + 0.9).toFixed(1)}" y2="${(y - 0.9).toFixed(1)}"/></g>`;
      return `<g>${titulo}${fim}${ponto}</g>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de chutes: ${esc(nomeCasa)} ataca para a direita, ${esc(nomeFora)} para a esquerda">${linhas}${marcas}</svg>`;
  }
  const api = { calcula, xg, svg };
  raiz.CHUTES_CALC = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
