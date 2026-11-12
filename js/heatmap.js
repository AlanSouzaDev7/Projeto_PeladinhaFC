/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — mapa de calor estimado de cada jogador
   Nenhum site oficial publica o mapa de calor dos jogadores do Brasileirão (os das transmissões
   vêm de empresas de rastreamento contratadas pelas emissoras). Aqui o mapa é ESTIMADO com dados
   reais: as posições em que o jogador atuou em cada jogo do campeonato (formação, nº da posição e
   sigla das escalações da ESPN, gravadas em js/heatmaps.js), pesadas pelos minutos em campo.
   Cada posição tem uma área típica de movimentação; quem finaliza muito ganha mais calor na área.

   Coordenadas do ponto de vista do time: x = profundidade (0 = o próprio gol, 100 = o gol adversário),
   y = lado (0 = esquerda, 100 = direita).
   ========================================================================== */
(() => {
  /* ---------- áreas de cada função: manchas [x, y, espalhamento em x, em y, peso] ---------- */
  const T = {
    GOL: [[5, 50, 4, 11, 1], [12, 50, 4, 14, 0.25]],
    ZAG: [[20, 50, 8, 10, 1], [33, 50, 8, 11, 0.35]],
    LE: [[22, 12, 8, 6, 0.75], [42, 10, 11, 6, 1], [63, 9, 10, 6, 0.55], [30, 22, 7, 7, 0.25]],
    ALE: [[34, 9, 9, 6, 0.6], [55, 8, 11, 6, 1], [75, 10, 9, 7, 0.65]],
    VOL: [[34, 50, 9, 13, 1], [24, 50, 7, 10, 0.3], [46, 46, 8, 11, 0.35]],
    MC: [[45, 50, 12, 14, 1], [30, 48, 8, 11, 0.35], [63, 52, 10, 12, 0.5]],
    ME: [[46, 11, 11, 7, 0.75], [63, 10, 10, 7, 1], [31, 13, 8, 7, 0.4], [76, 18, 7, 8, 0.3]],
    MEI: [[64, 50, 11, 13, 1], [77, 50, 8, 10, 0.5], [52, 50, 9, 12, 0.35]],
    PE: [[64, 16, 10, 9, 1], [78, 24, 8, 10, 0.6], [49, 14, 9, 8, 0.35], [86, 40, 5, 8, 0.25]],
    CA: [[82, 50, 7, 12, 1], [70, 50, 8, 11, 0.4], [91, 50, 4, 9, 0.45]],
  };
  const mirror = (t) => t.map(([x, y, sx, sy, w]) => [x, 100 - y, sx, sy, w]);
  const shift = (t, dy) => t.map(([x, y, sx, sy, w]) => [x, Math.max(4, Math.min(96, y + dy)), sx, sy, w]);
  Object.assign(T, { LD: mirror(T.LE), ALD: mirror(T.ALE), MD: mirror(T.ME), PD: mirror(T.PE) });

  // sigla da ESPN -> função no campo: [função, deslocamento para o lado, deslocamento para a frente]
  const ABBR = {
    G: ["GOL"], CD: ["ZAG"], "CD-L": ["ZAG", -13], "CD-R": ["ZAG", 13], D: ["ZAG"],
    LB: ["LE"], RB: ["LD"], LWB: ["ALE"], RWB: ["ALD"],
    DM: ["VOL"], "DM-L": ["VOL", -11], "DM-R": ["VOL", 11], SW: ["VOL"],
    CM: ["MC"], "CM-L": ["MC", -12], "CM-R": ["MC", 12], M: ["MC"],
    LM: ["ME"], RM: ["MD"], AM: ["MEI"], "AM-L": ["PE"], "AM-R": ["PD"],
    LW: ["PE"], RW: ["PD"], LF: ["PE"], RF: ["PD"],
    F: ["CA"], CF: ["CA"], ST: ["CA"], "CF-L": ["CA", -11], "CF-R": ["CA", 11], LCF: ["CA", -11], RCF: ["CA", 11], SS: ["MEI", 0, 10],
  };
  /* A ESPN nomeia as posições pelo desenho da formação; o que cada sigla quer dizer muda com ela.
     Conferido nas escalações da temporada (formação + nº da posição + sigla), por exemplo:
     4-2-3-1: "LM/RM" (nº 4 e 8) são a dupla de volantes · 4-3-3: "LM/RM" (nº 8 e 7) são os meias por dentro
     e "CM" (nº 4) é o volante · 3-4-2-1: "CF-L/CF-R" (nº 11 e 10) são os dois meias atrás do centroavante. */
  const BY_FORM = {
    "4-2-3-1": { LM: ["VOL", -11], RM: ["VOL", 11] },
    "4-2-2-2": { LM: ["VOL", -11], RM: ["VOL", 11], "CM-L": ["VOL", -11], "CM-R": ["VOL", 11] },
    "4-3-3": { LM: ["MC", -15], RM: ["MC", 15], CM: ["VOL"] },
    "4-3-2-1": { CM: ["VOL"], "CF-L": ["MEI", -17, 3], "CF-R": ["MEI", 17, 3] },
    "3-4-2-1": { "CF-L": ["MEI", -17, 3], "CF-R": ["MEI", 17, 3] },
    "3-4-3": { "CF-L": ["PE"], "CF-R": ["PD"] },
    "4-3-1-2": { CM: ["VOL"], LM: ["MC", -17], RM: ["MC", 17] },
    "4-1-2-1-2": { LM: ["MC", -17], RM: ["MC", 17] },
    "4-4-1-1": { RCF: ["MEI", 0, 10], LCF: ["MEI", 0, 10] },
  };
  function roleOf(form, place, abbr) {
    const f = form || "", back3 = /^[35]-/.test(f), o = BY_FORM[f];
    if (o && o[abbr]) return o[abbr];
    // com três zagueiros, "LM/RM" e "LB/RB" são os alas
    if (back3 && (abbr === "LM" || abbr === "LB")) return ["ALE"];
    if (back3 && (abbr === "RM" || abbr === "RB")) return ["ALD"];
    return ABBR[abbr] || (place === 1 ? ["GOL"] : null);
  }
  const PT = { GOL: "Goleiro", ZAG: "Zagueiro", LE: "Lateral-esquerdo", LD: "Lateral-direito", ALE: "Ala esquerdo", ALD: "Ala direito", VOL: "Volante", MC: "Meio-campista",
    ME: "Meia pela esquerda", MD: "Meia pela direita", MEI: "Meia", PE: "Ponta esquerda", PD: "Ponta direita", CA: "Centroavante" };
  const SIDE = (dy) => (dy < 0 ? " (esq.)" : dy > 0 ? " (dir.)" : "");

  /* ---------- dados ---------- */
  let loading = null;
  function load() {
    if (window.HEATMAPS) return Promise.resolve(window.HEATMAPS);
    if (loading) return loading;
    loading = new Promise((res) => {
      const sc = document.createElement("script");
      sc.src = "js/heatmaps.js";
      sc.onload = sc.onerror = () => res(window.HEATMAPS || null);
      document.head.appendChild(sc);
    });
    return loading;
  }

  /* ---------- mapa de calor com os LANCES REAIS (js/jogadores/<clube>.js) ----------
     Cada ação do jogador com coordenada (passe, desarme, cruzamento, finalização...) vem do feed de lances da ESPN,
     somada numa grade de 24 x 16 e gravada em 62 níveis. Aqui cada célula vira uma mancha pequena no ponto exato. */
  const NIV = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function deGrade(txt, gx = 24, gy = 16) {
    const blobs = [];
    if (!txt) return blobs;
    for (let k = 0; k < txt.length && k < gx * gy; k++) {
      const v = NIV.indexOf(txt[k]);
      if (v <= 0) continue;
      const w = (v / 61) ** 2; // a gravação usa raiz quadrada: volta para a contagem
      blobs.push([((k % gx) + 0.5) / gx * 100, (Math.floor(k / gx) + 0.5) / gy * 100, 100 / gx * 0.85, 100 / gy * 0.85, w]);
    }
    return blobs;
  }
  // zonas do campo (% das ações): terço defensivo / meio / ataque e esquerda / centro / direita
  function zonas(txt, gx = 24, gy = 16) {
    const t = [0, 0, 0], l = [0, 0, 0];
    let s = 0;
    for (let k = 0; k < (txt || "").length; k++) {
      const v = NIV.indexOf(txt[k]);
      if (v <= 0) continue;
      const w = (v / 61) ** 2, x = k % gx, y = Math.floor(k / gx);
      t[Math.min(2, Math.floor((x / gx) * 3))] += w; l[Math.min(2, Math.floor((y / gy) * 3))] += w; s += w;
    }
    const pc = (a) => a.map((v) => (s ? Math.round((v / s) * 100) : 0));
    return { tercos: pc(t), lados: pc(l) };
  }
  // jogador com lances reais já carregados (de qualquer clube)
  const real = (pid) => { const C = window.JOGADORES_CLUBE || {}; for (const k in C) { const j = C[k].jogadores?.[pid]; if (j && j.calor) return { j, grade: C[k].grade || [24, 16] }; } return null; };
  function carregaClube(cid) {
    if (!cid || !/^[a-z-]{2,20}$/.test(cid)) return Promise.resolve(null);
    if (window.JOGADORES_CLUBE?.[cid]) return Promise.resolve(window.JOGADORES_CLUBE[cid]);
    carregaClube.p = carregaClube.p || {};
    if (carregaClube.p[cid]) return carregaClube.p[cid];
    return (carregaClube.p[cid] = (async () => {
      if (window.PD?.LIVE) {
        try { const r = await fetch(`/api/elenco-temporada?club=${cid}`, { cache: "no-store" }); if (r.ok) { const d = await r.json(); window.SEG?.limpa(d); (window.JOGADORES_CLUBE = window.JOGADORES_CLUBE || {})[cid] = d; return d; } } catch { /* cai no arquivo */ }
      }
      await new Promise((res) => { const sc = document.createElement("script"); sc.src = `js/jogadores/${cid}.js`; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
      const d = window.JOGADORES_CLUBE?.[cid] || null;
      if (d) window.SEG?.limpa(d);
      return d;
    })());
  }

  // perfil do jogador: manchas somadas, posições em %, minutos; sem jogos, usa a função da escalação
  function profile(pid, fallbackRole) {
    const R = real(pid);
    if (R) {
      const { j, grade } = R, z = zonas(j.calor, grade[0], grade[1]);
      const roles = [["no terço de ataque", z.tercos[2] / 100], ["no meio-campo", z.tercos[1] / 100], ["no terço defensivo", z.tercos[0] / 100]].sort((a, b) => b[1] - a[1]);
      const jogos = Object.values(j.comps || {}).reduce((t, c) => t + c.j, 0), min = Object.values(j.comps || {}).reduce((t, c) => t + c.min, 0), g = Object.values(j.comps || {}).reduce((t, c) => t + c.g, 0);
      return { blobs: deGrade(j.calor, grade[0], grade[1]), roles, estimado: "lances", d: { j: jogos, m: min, g, lances: j.lances } };
    }
    const d = window.HEATMAPS?.players?.[pid];
    const blobs = [], roles = {};
    let mins = 0;
    if (d && d.p && d.p.length) {
      for (const [key, m] of d.p) {
        const [form, place, abbr] = key.split("|");
        const r = roleOf(form, +place, abbr);
        if (!r) continue;
        const [role, dy = 0, dx = 0] = r;
        mins += m;
        const name = PT[role] + (role === "ZAG" || role === "VOL" || role === "MC" || role === "CA" ? SIDE(dy) : "");
        roles[name] = (roles[name] || 0) + m;
        for (const [x, y, sx, sy, w] of shift(T[role], dy)) blobs.push([x + dx, y, sx, sy, w * m]);
      }
      // quem finaliza muito vive mais na área
      const per90 = d.m ? (d.c * 90) / d.m : 0;
      if (per90 > 1.2 && mins) blobs.push([87, 50, 5, 10, Math.min(0.5, (per90 - 1.2) * 0.25) * mins]);
    }
    if (!blobs.length && fallbackRole && T[fallbackRole]) {
      T[fallbackRole].forEach((b) => blobs.push(b));
      roles[PT[fallbackRole]] = 1;
      return { blobs, roles: Object.entries(roles), estimado: "escalação", d };
    }
    const tot = Object.values(roles).reduce((a, b) => a + b, 0) || 1;
    return { blobs, roles: Object.entries(roles).map(([k, v]) => [k, v / tot]).sort((a, b) => b[1] - a[1]), estimado: "jogos", d };
  }

  /* ---------- desenho: densidade numa grade pequena, ampliada com suavização e colorida ---------- */
  const GW = 84, GH = 54;
  // paleta das transmissões: azul -> verde -> amarelo -> laranja -> vermelho, com transparência no frio
  const STOPS = [[0, [20, 80, 255, 0]], [0.18, [20, 120, 255, 0.35]], [0.38, [20, 210, 150, 0.55]], [0.58, [200, 235, 40, 0.7]], [0.78, [255, 160, 20, 0.82]], [1, [240, 30, 30, 0.9]]];
  const LUT = (() => {
    const out = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let k = 0;
      while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
      const [t0, c0] = STOPS[k], [t1, c1] = STOPS[k + 1], u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
      for (let j = 0; j < 4; j++) out[i * 4 + j] = (c0[j] + (c1[j] - c0[j]) * u) * (j === 3 ? 255 : 1);
    }
    return out;
  })();
  const grid = document.createElement("canvas");
  grid.width = GW; grid.height = GH;
  /* blobs no ponto de vista do time; flip = o time ataca para a esquerda (visitante na prancheta) */
  function paint(canvas, blobs, { flip = false, alpha = 1 } = {}) {
    const g = grid.getContext("2d"), img = g.createImageData(GW, GH), D = new Float32Array(GW * GH);
    const B = flip ? blobs.map(([x, y, sx, sy, w]) => [100 - x, 100 - y, sx, sy, w]) : blobs;
    let max = 0;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const x = ((i + 0.5) / GW) * 100, y = ((j + 0.5) / GH) * 100;
      let v = 0;
      for (const [bx, by, sx, sy, w] of B) { const dx = (x - bx) / sx, dy = (y - by) / sy; v += w * Math.exp(-0.5 * (dx * dx + dy * dy)); }
      D[j * GW + i] = v;
      if (v > max) max = v;
    }
    for (let k = 0; k < D.length; k++) {
      const t = max ? Math.pow(D[k] / max, 0.85) : 0, c = Math.round(t * 255) * 4;
      img.data[k * 4] = LUT[c]; img.data[k * 4 + 1] = LUT[c + 1]; img.data[k * 4 + 2] = LUT[c + 2]; img.data[k * 4 + 3] = LUT[c + 3] * alpha;
    }
    g.putImageData(img, 0, 0);
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = "blur(" + Math.round(canvas.width / 90) + "px)";
    ctx.drawImage(grid, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";
  }

  // texto do cartão: "Lateral-esquerdo 78% · Ala esquerdo 22%"
  function summary(pr) {
    const top = pr.roles.slice(0, 3).map(([k, v]) => `<span><b>${Math.round(v * 100)}%</b> ${k}</span>`).join("");
    const d = pr.d;
    const base = pr.estimado === "lances"
      ? `${d.lances.toLocaleString("pt-BR")} ações com posição no campo em ${d.j} jogo${d.j === 1 ? "" : "s"} · ${d.m.toLocaleString("pt-BR")} min${d.g ? ` · ${d.g} gol${d.g === 1 ? "" : "s"}` : ""}`
      : pr.estimado === "escalação"
      ? "Sem jogos no Brasileirão: mapa pela posição na escalação"
      : `${d.j} jogo${d.j === 1 ? "" : "s"} · ${d.m.toLocaleString("pt-BR")} min no Brasileirão${d.g ? ` · ${d.g} gol${d.g === 1 ? "" : "s"}` : ""}`;
    return { top, base };
  }

  window.HEATMAP = { load, profile, paint, summary, roleOf, T, deGrade, zonas, real, carregaClube };
})();
