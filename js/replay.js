/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — replay animado do gol (desenho próprio, sem vídeo de terceiros)
   Fonte: o lance do gol no resumo da ESPN: onde saiu o chute (fieldPositionX/Y), onde cruzou a linha
   (fieldPosition2Y), autor, assistência e a narração ("with a cross", "headed pass", "through ball", "following a
   fast break", canto do gol, pé ou cabeça).
   O QUE É REAL: o local do chute, o lado do gol, o autor, quem deu o passe e o tipo de passe.
   O QUE É APROXIMADO: o caminho do passe (a ESPN não dá onde ele começou); sai de um lugar típico para aquele tipo
   de jogada (cruzamento da ponta, enfiada pelo meio, escanteio da bandeira...). A tela avisa isso.
   Coordenadas de 0 a 100, com o time que fez o gol atacando para x = 100.
   Funções puras (Node e navegador): le(), plano(), quadro(t); o navegador ganha mount() e card().
   ========================================================================== */
(function (raiz) {
  "use strict";
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));

  /* lê um item do commentary da ESPN; null se não for gol */
  function le(c, casa, fora) {
    const txt = String(c?.text || ""), p = c?.play || {}, tipo = String(p.type?.type || "");
    const contra = tipo === "own-goal" || /^own goal/i.test(txt);
    if (!contra && !/^goal!/i.test(txt) && !/^goal/.test(tipo)) return null;
    const x = Number(p.fieldPositionX), y = Number(p.fieldPositionY), y2 = Number(p.fieldPosition2Y);
    const timeLance = norm(p.team?.displayName);
    let autor = "", time = "";
    if (contra) {
      const m = /own goal by ([^,]+),\s*([^.]+)\./i.exec(txt);
      autor = (m?.[1] || p.participants?.[0]?.athlete?.displayName || "").trim();
      const doJogador = norm(m?.[2] || p.team?.displayName);
      time = doJogador === norm(casa) ? "fora" : "casa"; // gol contra conta para o outro time
    } else {
      const m = /^goal![^.]*\.\s*([^(]+?)\s*\(([^)]+)\)/i.exec(txt);
      autor = (m?.[1] || p.participants?.[0]?.athlete?.displayName || "").trim();
      const t = norm(m?.[2] || p.team?.displayName);
      time = t === norm(casa) ? "casa" : t === norm(fora) ? "fora" : timeLance === norm(fora) ? "fora" : "casa";
    }
    const assist = (/assisted by (.+?)(?= with a | following |\.|$)/i.exec(txt)?.[1] || "").trim();
    const penalti = /penalty/.test(tipo) || /converts the penalty/i.test(txt);
    const falta = tipo === "goal---free-kick" || /from a free kick/i.test(txt);
    const cabeca = tipo === "goal---header" || /\bheader\b/i.test(txt);
    const passe = contra ? "contra" : penalti ? "penalti" : falta ? "falta"
      : /following a corner/i.test(txt) ? "escanteio" : /with a cross/i.test(txt) ? "cruzamento" : /headed pass/i.test(txt) ? "cabeca"
      : /through ball/i.test(txt) ? "enfiada" : /following a set piece/i.test(txt) ? "bola-parada" : assist ? "passe" : "individual";
    const contraAtaque = /fast break/i.test(txt);
    const pe = cabeca ? "cabeça" : /left foot/i.test(txt) ? "pé esquerdo" : /right foot/i.test(txt) ? "pé direito" : "";
    const canto = (/to the (bottom|top|high|low)?\s*(left|right)?\s*(corner|centre of the goal|centre)/i.exec(txt) || []);
    const altura = /top|high/i.test(canto[1] || "") || /high centre/i.test(txt) ? 0.82 : /bottom|low/i.test(canto[1] || "") ? 0.14 : 0.45;
    const placar = /(\d+),\s*[^,]*?\s(\d+)\./.exec(txt.replace(/^(goal!|own goal by [^,]+,[^.]+\.)\s*/i, ""));
    return {
      min: String(c?.time?.displayValue || "").trim(), seq: Number(c?.sequence) || 0, time, autor, assist, passe, contraAtaque, pe, cabeca,
      de: { x: Number.isFinite(x) ? lim(x, 0, 100) : (penalti ? 88.5 : 85), y: Number.isFinite(y) ? lim(y, 0, 100) : 50 },
      gol: { y: Number.isFinite(y2) ? lim(y2, 40, 60) : 50, altura },
      placar: placar ? [Number(placar[1]), Number(placar[2])] : null,
    };
  }

  /* de onde o passe sai, conforme o tipo (aproximado; a ESPN não dá esse ponto) */
  function origem(g) {
    const { x, y } = g.de, ladoLonge = y < 50 ? 92 : 8;
    switch (g.passe) {
      case "penalti": return null;
      case "falta": return null;
      case "escanteio": return { x: 100, y: y < 50 ? 100 : 0, curva: 0.35 };
      case "cruzamento": return { x: lim(x + 2, 80, 96), y: ladoLonge, curva: 0.28 };
      case "cabeca": return { x: lim(x - 8, 50, 96), y: lim(y + (y < 50 ? 16 : -16), 5, 95), curva: 0.18 };
      case "enfiada": return { x: lim(x - 24, 30, 90), y: lim(50 + (y - 50) * 0.3, 20, 80), curva: 0 };
      case "bola-parada": return { x: lim(x - 22, 40, 90), y: y < 50 ? 85 : 15, curva: 0.3 };
      case "contra": return { x: lim(x - 6, 70, 96), y: ladoLonge, curva: 0.2 };
      case "passe": return { x: lim(x - 15, 30, 95), y: lim(y + (y < 50 ? 18 : -18), 5, 95), curva: 0.05 };
      default: return { x: lim(x - 12, 20, 95), y: lim(y + (y < 50 ? 8 : -8), 5, 95), curva: 0, conducao: true }; // jogada individual
    }
  }

  /* plano da animação: pontos e tempos (ms) */
  function plano(g) {
    const o = origem(g);
    const corrida = g.contraAtaque ? { x: lim(g.de.x - 40, 15, 80), y: lim(g.de.y + (50 - g.de.y) * 0.4, 10, 90) } : null;
    const fases = [];
    let t = 0;
    if (corrida && o) { fases.push({ tipo: "conducao", de: corrida, para: { x: o.x, y: o.y }, t0: t, t1: t + 1200 }); t += 1200; }
    if (o) {
      const dur = o.conducao ? 900 : o.curva ? 1100 : 800;
      fases.push({ tipo: o.conducao ? "conducao" : "passe", de: { x: o.x, y: o.y }, para: { ...g.de }, curva: o.curva || 0, t0: t, t1: t + dur });
      t += dur;
    } else t += 500; // pênalti e falta: um tempo parado antes da cobrança
    fases.push({ tipo: "chute", de: { ...g.de }, para: { x: 100, y: g.gol.y }, t0: t, t1: t + 520 });
    t += 520;
    return { gol: g, origem: o, fases, total: t + 900, aproximado: !!o && !o.conducao };
  }

  // ponto numa curva quadrática (controle afastado da linha reta, para cruzamento e escanteio)
  function ponto(f, u) {
    const e = f.tipo === "chute" ? u : u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const { de: a, para: b } = f;
    if (!f.curva) return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
    const c = { x: mx - dy * f.curva, y: my + dx * f.curva * (a.y > 50 ? -1 : 1) };
    return { x: (1 - e) ** 2 * a.x + 2 * (1 - e) * e * c.x + e * e * b.x, y: (1 - e) ** 2 * a.y + 2 * (1 - e) * e * c.y + e * e * b.y };
  }

  /* o quadro no instante t (ms): bola, autor, quem passou e a fase */
  function quadro(P, t) {
    const fs = P.fases, ult = fs[fs.length - 1];
    const f = fs.find((x) => t < x.t1) || ult;
    const u = lim((t - f.t0) / (f.t1 - f.t0), 0, 1);
    const bola = ponto(f, u);
    const passe = fs.find((x) => x.tipo === "passe");
    // o autor corre até o ponto do chute enquanto a bola viaja no passe
    const inicioAutor = passe ? { x: lim(P.gol.de.x - 9, 0, 100), y: lim(P.gol.de.y + (P.gol.de.y < 50 ? 6 : -6), 0, 100) } : P.gol.de;
    let autor = P.gol.de;
    if (passe && t < passe.t1) { const k = lim((t - passe.t0) / (passe.t1 - passe.t0), 0, 1); autor = { x: inicioAutor.x + (P.gol.de.x - inicioAutor.x) * k, y: inicioAutor.y + (P.gol.de.y - inicioAutor.y) * k }; }
    if (fs[0].tipo === "conducao" && t < fs[0].t1 && passe) autor = inicioAutor;
    const quemPassa = passe ? (t < passe.t0 ? bola : passe.de) : null;
    return { bola, autor, quemPassa, fase: t >= ult.t1 ? "gol" : f.tipo, u };
  }

  const api = { le, plano, quadro, origem };
  if (typeof module === "object" && module.exports) module.exports = api;

  /* ---------- navegador: cartão "Replay dos gols" na página da partida ---------- */
  if (typeof document === "undefined") { raiz.REPLAY = api; return; }
  const esc = (t) => (window.SEG ? SEG.esc(t) : String(t));
  const LIGA = "bra.1";
  const NOME_PASSE = { cruzamento: "cruzamento", cabeca: "passe de cabeça", enfiada: "enfiada", escanteio: "escanteio", "bola-parada": "bola parada", passe: "passe", individual: "jogada individual", penalti: "pênalti", falta: "falta direta", contra: "gol contra" };
  const reduzido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function card(m) {
    if (!m.espn || (m.status !== "ft" && m.status !== "progress") || !((m.hs || 0) + (m.as || 0))) return "";
    return `<div class="card replay" data-replay="${esc(String(m.espn))}" data-h="${esc(m.home)}" data-a="${esc(m.away)}">
      <div class="card-h">Replay dos gols <small>desenho do CazéStats.TV a partir dos lances</small></div><div class="card-b"><p class="tc-txt">Carregando os gols…</p></div></div>`;
  }
  // campo 105 x 68; o mandante ataca para a direita, o visitante para a esquerda (como no mapa de chutes)
  const X = (x, lado) => (lado === "fora" ? 100 - x : x) * 1.05, Y = (y, lado) => (lado === "fora" ? 100 - y : y) * 0.68;
  const cor = (id) => (typeof byId !== "undefined" && byId[id] && window.GFX ? GFX.display(byId[id]) : "#3b4eea");
  const sigla = (id) => (typeof byId !== "undefined" && byId[id]?.abbr) || id;
  // nome no campinho: inteiro quando cabe ("Kaio César"), senão o último sobrenome ("Depay")
  const curto = (n) => { const s = String(n || "").trim(), p = s.split(" "); return s.length <= 12 || p.length < 2 ? s : p[p.length - 1]; };

  function campo() {
    return `<rect x="0" y="0" width="105" height="68" rx="1.5" class="rp-gramado"/>
      <g class="rp-linhas" fill="none"><rect x="0.5" y="0.5" width="104" height="67"/><line x1="52.5" y1="0.5" x2="52.5" y2="67.5"/><circle cx="52.5" cy="34" r="9.15"/>
      <rect x="0.5" y="13.85" width="16.5" height="40.3"/><rect x="88" y="13.85" width="16.5" height="40.3"/><rect x="0.5" y="24.85" width="5.5" height="18.3"/><rect x="99" y="24.85" width="5.5" height="18.3"/>
      <rect x="-1.6" y="30.34" width="2" height="7.32" class="rp-meta"/><rect x="104.6" y="30.34" width="2" height="7.32" class="rp-meta"/></g>`;
  }
  function desenhaQuadro(svg, P, t, lado, c) {
    const q = quadro(P, t);
    const $ = (s) => svg.querySelector(s);
    $(".rp-bola").setAttribute("cx", X(q.bola.x, lado)); $(".rp-bola").setAttribute("cy", Y(q.bola.y, lado));
    $(".rp-autor").setAttribute("transform", `translate(${X(q.autor.x, lado)} ${Y(q.autor.y, lado)})`);
    const qp = $(".rp-assist");
    if (qp && q.quemPassa) qp.setAttribute("transform", `translate(${X(q.quemPassa.x, lado)} ${Y(q.quemPassa.y, lado)})`);
    // rastro: a parte do caminho já percorrida
    const pts = [];
    for (let k = 0; k <= 60; k++) { const tt = (t * k) / 60; const b = quadro(P, tt).bola; pts.push(`${X(b.x, lado).toFixed(2)},${Y(b.y, lado).toFixed(2)}`); }
    $(".rp-rastro").setAttribute("points", pts.join(" "));
    svg.classList.toggle("gol", q.fase === "gol");
    const boca = svg.closest(".rp-palco").querySelector(".rp-boca-bola");
    if (boca) boca.style.opacity = q.fase === "gol" ? "1" : "0";
    void c;
  }
  function palco(g, lado, cid) {
    const P = plano(g), c = cor(cid);
    // boca do gol vista de frente: 7,32 m de largura (y de 44,6 a 55,4) e 2,44 m de altura
    const bx = ((lado === "fora" ? 100 - g.gol.y : g.gol.y) - 44.6) / 10.8 * 100;
    return { P, html: `<div class="rp-palco"><svg class="rp-campo" viewBox="-2 -2 109 72" role="img" aria-label="Replay do gol de ${esc(g.autor)} aos ${esc(g.min)}">
        ${campo()}<polyline class="rp-rastro" fill="none" points=""/>
        ${P.origem && !P.origem.conducao && g.assist ? `<g class="rp-assist"><circle r="1.9" style="fill:${c}"/><text y="-3" text-anchor="middle">${esc(curto(g.assist))}</text></g>` : ""}
        <g class="rp-autor"><circle r="2.1" style="fill:${c}"/><text y="-3.2" text-anchor="middle">${esc(curto(g.autor))}</text></g>
        <circle class="rp-bola" r="1.1"/><text class="rp-gol-txt" x="52.5" y="36" text-anchor="middle">GOL</text></svg>
      <div class="rp-boca" aria-hidden="true"><i class="rp-boca-bola" style="left:${Math.round(lim(bx, 4, 96))}%;bottom:${Math.round(g.gol.altura * 100)}%"></i></div></div>` };
  }
  function anima(el, g, lado, cid) {
    const alvo = el.querySelector(".rp-tela");
    const { P, html } = palco(g, lado, cid);
    alvo.innerHTML = html;
    const svg = alvo.querySelector("svg");
    cancelAnimationFrame(el._raf || 0);
    if (reduzido()) { desenhaQuadro(svg, P, P.total, lado); return; }
    const t0 = performance.now();
    const passo = (agora) => { const t = agora - t0; desenhaQuadro(svg, P, Math.min(t, P.total), lado); if (t < P.total && svg.isConnected) el._raf = requestAnimationFrame(passo); };
    el._raf = requestAnimationFrame(passo);
  }
  function legenda(g, h, a) {
    const time = g.time === "casa" ? h : a;
    const como = [NOME_PASSE[g.passe], g.contraAtaque && "contra-ataque"].filter(Boolean).join(" em ");
    return `<b>${esc(g.min)} ${esc(g.autor)}</b> <small>${esc(sigla(time))}${g.assist && g.passe !== "contra" ? ` · passe de ${esc(g.assist)}` : ""}${como ? ` · ${esc(como)}` : ""}${g.pe ? ` · ${esc(g.pe)}` : ""}</small>`;
  }
  async function preenche(el) {
    const box = el.querySelector(".card-b"), h = el.dataset.h, a = el.dataset.a;
    let d;
    try { const r = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/${LIGA}/summary?event=${encodeURIComponent(el.dataset.replay)}`, { cache: "no-store" }); d = window.SEG ? await SEG.json(r) : await r.json(); } catch { d = null; }
    if (!el.isConnected) return;
    const cs = d?.header?.competitions?.[0]?.competitors || [];
    const casa = cs.find((c) => c.homeAway === "home")?.team?.displayName, fora = cs.find((c) => c.homeAway === "away")?.team?.displayName;
    const gols = (d?.commentary || []).map((c) => le(c, casa, fora)).filter(Boolean).sort((x, y) => x.seq - y.seq);
    if (!gols.length) { box.innerHTML = `<p class="tc-txt">Os lances dos gols ainda não chegaram da fonte.</p>`; return; }
    box.innerHTML = `<div class="rp-tela"></div>
      <ol class="rp-lista">${gols.map((g, i) => `<li><button type="button" data-rp="${i}" aria-pressed="${i === 0}"><span class="rp-play" aria-hidden="true"></span>${legenda(g, h, a)}</button></li>`).join("")}</ol>
      ${window.COMPARTILHAR ? `<div class="cp-wrap">${COMPARTILHAR.botao("replay", el.dataset.replay)}</div>` : ""}
      <p class="rp-nota">Real: o local do chute, o lado do gol, o autor e o tipo de passe. Aproximado: o caminho do passe, que a fonte não informa.</p>`;
    const toca = (i) => { box.querySelectorAll("[data-rp]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.rp) === i))); const g = gols[i]; atuais[el.dataset.replay] = { g, h, a }; anima(el, g, g.time, g.time === "casa" ? h : a); };
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-rp]"); if (b) toca(Number(b.dataset.rp)); });
    toca(0);
  }
  const atuais = {}; // o gol escolhido em cada jogo (o card de compartilhar desenha esse)
  function mount(view) {
    (view || document).querySelectorAll("[data-replay]:not([data-rp-ok])").forEach((el) => { el.dataset.rpOk = "1"; preenche(el); });
  }
  raiz.REPLAY = { ...api, card, mount, atual: (espn) => atuais[String(espn)] || null, NOME_PASSE };
})(typeof window !== "undefined" ? window : globalThis);
