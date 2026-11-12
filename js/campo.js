/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   Placar.TV — campinho: onde cada ponto do campo fica (GOL, ZAG, LD, VOL, MEI, PD, CA...), a posição de origem
   de cada jogador e o que ele já fez em cada posição (súmulas do Brasileirão, js/heatmaps.js), e a projeção 3D
   (campo inclinado, como na transmissão) com a conta inversa para arrastar no campo inclinado.
   Usado pela janela de transferências (js/mercado.js) e pela escalação do clube (js/lineup.js).
   Convenção: x 0–100 da esquerda para a direita; y 0–100 do gol adversário (em cima) para o próprio gol (embaixo).
   ========================================================================== */
(() => {
  const NOME = {
    GOL: "Goleiro", ZAG: "Zagueiro", LD: "Lateral-direito", LE: "Lateral-esquerdo", ALD: "Ala pela direita", ALE: "Ala pela esquerda",
    VOL: "Volante", MC: "Meio-campista", MD: "Meia pela direita", ME: "Meia pela esquerda", MEI: "Meia central", PD: "Ponta direita",
    PE: "Ponta esquerda", CA: "Centroavante",
  };
  // posições parecidas: trocar entre elas não é "fora de posição", só um ajuste
  const PARECIDAS = [["LD", "ALD"], ["LE", "ALE"], ["VOL", "MC"], ["MC", "MEI"], ["MD", "PD"], ["ME", "PE"], ["MEI", "CA"]];
  const parecida = (a, b) => a === b || PARECIDAS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const SETOR = { GOL: "G", ZAG: "D", LD: "D", LE: "D", ALD: "D", ALE: "D", VOL: "M", MC: "M", MD: "M", ME: "M", MEI: "M", PD: "A", PE: "A", CA: "A" };
  const PADRAO = { G: "GOL", D: "ZAG", M: "MC", A: "CA", F: "CA" };

  /* zona do campo -> posição (as formações da janela caem exatamente nas posições esperadas) */
  function zona(x, y) {
    if (y > 86) return x > 25 && x < 75 ? "GOL" : "ZAG";
    if (y >= 44 && y <= 72 && (x < 14 || x > 86)) return x < 50 ? "ALE" : "ALD";
    if (y > 66) return x < 22 ? "LE" : x > 78 ? "LD" : "ZAG";
    if (y >= 57) return "VOL";
    if (y >= 44) return x < 20 ? "ME" : x > 80 ? "MD" : "MC";
    if (y >= 30) return x < 25 ? "PE" : x > 75 ? "PD" : "MEI";
    return x < 30 ? "PE" : x > 70 ? "PD" : "CA";
  }

  const hm = (id) => (window.HEATMAPS && window.HEATMAPS.players && window.HEATMAPS.players[String(id)]) || null;
  /* posição de origem: a de mais minutos nas súmulas; sem histórico, a que o cadastro diz */
  const origem = (j) => (j && (j.funcao || hm(j.id)?.f)) || PADRAO[j?.pos] || "MC";
  const historico = (j) => (j && (j.hist && Object.keys(j.hist).length ? j.hist : hm(j.id)?.s)) || {};

  /* o que muda ao pôr o jogador numa posição: nada, ajuste (posição parecida), já jogou ali, ou nunca jogou */
  function avalia(j, para) {
    const de = origem(j), h = historico(j), s = h[para] || null;
    if (!para || de === para) return { de, para, tipo: "igual", s };
    if (s && s[1] >= 45) return { de, para, tipo: "jogou", s };
    if (parecida(de, para)) return { de, para, tipo: "parecida", s };
    return { de, para, tipo: "nova", s: null };
  }
  const esc = (t) => (window.SEG ? window.SEG.esc(t) : String(t));
  const n = (v) => Number(v || 0).toLocaleString("pt-BR");
  /* selo em cima do jogador: "MEI → PD" */
  function selo(a) {
    if (!a || a.tipo === "igual") return "";
    const t = a.tipo === "jogou" ? `Já jogou de ${NOME[a.para].toLowerCase()}` : a.tipo === "parecida" ? `Posição parecida com a de origem (${NOME[a.de].toLowerCase()})` : `Não está acostumado a jogar de ${NOME[a.para].toLowerCase()}`;
    return `<span class="cp-selo s-${a.tipo}" title="${esc(t)}"><b>${a.de}</b><i aria-hidden="true">→</i><b>${a.para}</b></span>`;
  }
  /* prévia: como ele jogou nessa posição (e nas outras) */
  function previa(j, para) {
    const a = avalia(j, para), h = historico(j), linhas = Object.entries(h).sort((x, y) => y[1][1] - x[1][1]);
    const nome = esc(j.nome || j.name || "");
    const cab = a.tipo === "igual" ? `${nome} na posição de origem: ${NOME[a.de].toLowerCase()}.`
      : a.tipo === "jogou" ? `${nome} mudou de ${a.de} para ${a.para}. Já jogou ali: ${n(a.s[0])} ${a.s[0] === 1 ? "jogo" : "jogos"}, ${n(a.s[1])} min, ${a.s[2]} ${a.s[2] === 1 ? "gol" : "gols"} e ${a.s[3]} ${a.s[3] === 1 ? "assistência" : "assistências"}.`
      : a.tipo === "parecida" ? `${nome} mudou de ${a.de} para ${a.para}, uma posição parecida com a dele.${a.s ? ` Já fez ${n(a.s[1])} min ali.` : ""}`
      : `${nome} não está acostumado a jogar de ${NOME[a.para].toLowerCase()}: ${h[a.para] ? `nas súmulas, só ${n(h[a.para][1])} min ali.` : "nas súmulas, nunca atuou ali."}`;
    const tab = linhas.length ? `<table class="cp-hist"><thead><tr><th>Posição</th><th>Jogos</th><th>Min</th><th>Gols</th><th>Assist.</th></tr></thead><tbody>${linhas.map(([p, s]) => `<tr class="${p === a.para ? "on" : ""}"><td><b>${p}</b> ${NOME[p] ? `<small>${NOME[p]}</small>` : ""}</td><td>${s[0]}</td><td>${n(s[1])}</td><td>${s[2]}</td><td>${s[3]}</td></tr>`).join("")}</tbody></table>`
      : `<p class="cp-sem">Sem súmulas do Brasileirão com este jogador ainda.</p>`;
    return { a, html: `<p class="cp-cab s-${a.tipo}">${cab}</p>${tab}<p class="cp-fonte">Súmulas do Brasileirão (posição em cada jogo, ESPN), contadas pelo Placar.TV.</p>` };
  }

  /* ---------- projeção 3D: campo inclinado com perspectiva ----------
     O plano (largura W, altura H) gira rotateX(T) em torno do centro do "palco" e é visto com perspectiva P a
     partir desse centro. Um ponto do plano (u, v em 0–1) vai para (x, y) no palco; a inversa é fechada (arrastar).
     topo/base: onde o campo começa e termina no palco (o palco é deslocado para o campo ficar centrado). */
  const T = (30 * Math.PI) / 180;
  function geometria(W, H) {
    const P = H * 1.7, c = Math.cos(T), sn = Math.sin(T);
    const tela = (u, v) => { const x = (u - 0.5) * W, y = (v - 0.5) * H, s = P / (P - y * sn); return { x: W / 2 + x * s, y: H / 2 + y * c * s, s }; };
    const plano = (x, y) => { const X = x - W / 2, Y = y - H / 2, yy = (P * Y) / (P * c + Y * sn), s = P / (P - yy * sn); return { u: X / s / W + 0.5, v: yy / H + 0.5 }; };
    return { P, tela, plano, topo: tela(0.5, 0).y, base: tela(0.5, 1).y, rot: (T * 180) / Math.PI };
  }

  window.CAMPO = { NOME, SETOR, PADRAO, zona, origem, historico, avalia, selo, previa, parecida, geometria };
})();
