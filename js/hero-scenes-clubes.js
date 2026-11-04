/* ==========================================================================
   PLACAR — aparições em tela cheia dos outros 19 clubes
   Mesma linguagem do Cruzeiro: céu em camadas, paralaxe, partículas e um
   personagem/elemento do escudo que viaja até formar o escudo à direita.
   Tudo desenhado em canvas; o escudo final é a imagem oficial.
   ========================================================================== */
(() => {
  const { clamp, lerp, span, ease, rand, bez } = HERO_SCENES.kit;
  const TAU = Math.PI * 2;

  /* ---------- peças comuns ---------- */
  const layout = (st) => ({ w: st.w, h: st.h, ...HERO_SCENES.kit.crestSpot(st.w, st.h) });
  function sky(ctx, w, h, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function glow(ctx, x, y, r, color, a = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace("A", a)); g.addColorStop(1, color.replace("A", 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const starfield = (seed, n, y2 = 0.7) => { const r = rand(seed); return Array.from({ length: n }, () => ({ x: r(), y: r() * y2, s: 0.4 + r() * 1.4, p: r() * TAU, v: 0.6 + r() * 2 })); };
  function stars(ctx, list, t, w, h, a = 1, dx = 0) {
    for (const s of list) {
      const al = a * (0.45 + 0.55 * Math.sin(t * s.v + s.p));
      ctx.fillStyle = `rgba(255,255,255,${al})`;
      ctx.fillRect(((s.x * w + dx) % w + w) % w, s.y * h, s.s, s.s);
    }
  }
  function ridge(seed, base, amp, n, sharp = 0.9) {
    const r = rand(seed), pts = [];
    for (let i = 0; i <= n; i++) pts.push([i / n, base - amp * (0.3 + 0.7 * Math.abs(Math.sin(i * sharp + r() * 2))) * (0.6 + r() * 0.4)]);
    return pts;
  }
  function drawRidge(ctx, pts, w, h, color, dx = 0) {
    ctx.beginPath(); ctx.moveTo(-30, h);
    pts.forEach(([x, y], i) => {
      const px = x * (w + 60) - 30 + dx, py = y * h;
      if (!i) ctx.lineTo(px, py);
      else { const [x0, y0] = pts[i - 1]; ctx.quadraticCurveTo(x0 * (w + 60) - 30 + dx, y0 * h, (px + x0 * (w + 60) - 30 + dx) / 2, (py + y0 * h) / 2); }
    });
    ctx.lineTo(w + 30, h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function waves(ctx, t, w, h, y, amp, color, speed = 1, freq = 0.012, phase = 0) {
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 10; x += 10) ctx.lineTo(x, y * h + Math.sin(x * freq + t * speed + phase) * amp + Math.sin(x * freq * 2.3 - t * speed * 0.7) * amp * 0.4);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function shimmer(ctx, t, w, h, y1, y2, color, n = 60, seed = 3) {
    const r = rand(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = lerp(y1, y2, r()) * h, ph = r() * TAU, len = 6 + r() * 18;
      const a = Math.max(0, Math.sin(t * 1.6 + ph)) * 0.6;
      ctx.fillStyle = color.replace("A", a); ctx.fillRect(x + Math.sin(t + ph) * 6, y, len, 1.4);
    }
  }
  function sun(ctx, x, y, r, core, halo) { glow(ctx, x, y, r * 4, halo, 0.55); ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  // ave planando: asas sobem e descem
  function bird(ctx, x, y, s, flap, color, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.fillStyle = color;
    const f = Math.sin(flap) * 10;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-10, -6 - f, -26, -10 - f * 1.3, -40, -4 - f * 1.6); ctx.lineTo(-34, -1 - f); ctx.lineTo(-38, 2 - f * 1.2); ctx.lineTo(-30, 2 - f * 0.7);
    ctx.bezierCurveTo(-18, 4, -8, 5, 0, 8);
    ctx.bezierCurveTo(8, 5, 18, 4, 30, 2 - f * 0.7); ctx.lineTo(38, 2 - f * 1.2); ctx.lineTo(34, -1 - f); ctx.lineTo(40, -4 - f * 1.6);
    ctx.bezierCurveTo(26, -10 - f * 1.3, 10, -6 - f, 0, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 3, 4, 7, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // partículas genéricas (folhas, poeira, faíscas, gotas)
  function particles(seed, n) { const r = rand(seed); return Array.from({ length: n }, () => ({ x: r(), y: r(), s: 0.5 + r() * 1.5, v: 0.2 + r() * 0.8, p: r() * TAU })); }

  /* escudo se formando: anel desenhado, brilho, escudo com "salto" e onda de luz */
  function crestReveal(ctx, img, t, T, L, ring = "255,255,255", halo = "rgba(255,255,255,A)") {
    const { cx, cy, cs } = L;
    const kr = ease.inOut(span(t, T - 0.8, T + 0.3)), kc = ease.outBack(span(t, T, T + 1.1)), bob = Math.sin(Math.max(0, t - T - 1.1) * 1.1) * cs * 0.012;
    glow(ctx, cx, cy, cs * 1.1, halo, 0.35 * clamp(span(t, T - 0.8, T + 0.4)));
    if (kr > 0 && kc < 1) {
      ctx.strokeStyle = `rgba(${ring},${0.9 * (1 - clamp(kc))})`; ctx.lineWidth = Math.max(2, cs * 0.02); ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(cx, cy, cs * 0.48, -Math.PI / 2, -Math.PI / 2 + TAU * kr); ctx.stroke();
    }
    if (kc > 0) { // o escudo em si salta no placar do GOL!; aqui fica só a onda de luz
      const wv = span(t, T + 0.1, T + 1.3);
      if (wv > 0 && wv < 1) { ctx.strokeStyle = `rgba(${ring},${0.6 * (1 - wv)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, cs * (0.5 + wv * 0.65), 0, TAU); ctx.stroke(); }
    }
  }
  function veil(ctx, w, h, color = "0,0,0", a = 0.6) {
    const g = ctx.createLinearGradient(0, 0, w * 0.6, 0);
    g.addColorStop(0, `rgba(${color},${a})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  /* caminho em curva do ponto a até o escudo */
  const toCrest = (k, ax, ay, L, lift = 0.25) => [bez(ax, (ax + L.cx) / 2, L.cx, k), bez(ay, Math.min(ay, L.cy) - L.cs * lift, L.cy, k)];

  /* fábrica: cada clube só descreve o que desenha */
  function scene(spec) {
    return (st) => {
      const img = new Image(); img.src = st.club.logo;
      const data = spec.init ? spec.init(st) : {};
      return {
        resize() { data.cache = null; },
        frame(t, ctx) {
          const L = layout(st), m = st.mouse;
          spec.draw({ t, ctx, L, w: L.w, h: L.h, m, d: data, img });
          crestReveal(ctx, img, t, spec.T || 4.6, L, spec.ring, spec.halo);
          if (spec.after) spec.after({ t, ctx, L, w: L.w, h: L.h, m, d: data });
          veil(ctx, L.w, L.h, spec.veil || "0,0,0", spec.veilA ?? 0.6);
        },
      };
    };
  }
  const reg = (id, spec) => HERO_SCENES.register(id, scene(spec), spec.T || 4.6);

  /* ======================================================================
     Flamengo — o urubu sobre o Rio
     ====================================================================== */
  reg("flamengo", {
    T: 4.8, ring: "255,220,220", halo: "rgba(255,80,80,A)",
    init: () => ({ stars: starfield(5, 120, 0.5), flock: Array.from({ length: 5 }, (_, i) => ({ r: 0.12 + i * 0.03, sp: 0.25 + i * 0.05, p: i * 1.3, y: 0.18 + i * 0.04 })) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#12020a"], [0.45, "#5a0612"], [0.75, "#c3102a"], [1, "#ff7a4a"]]);
      stars(ctx, d.stars, t, w, h, 0.6 * (1 - span(t, 0, 3)));
      sun(ctx, w * 0.52, h * (0.78 - 0.06 * ease.out(span(t, 0, 4))), Math.min(w, h) * 0.08, "#ffd2a8", "rgba(255,140,90,A)");
      // urubus distantes planando em círculo
      d.flock.forEach((b, i) => { const a = t * b.sp + b.p; bird(ctx, w * (0.25 + 0.5 * ((Math.cos(a) + 1) / 2)), h * (b.y + Math.sin(a) * 0.05), 0.35 + i * 0.04, t * 3 + i, "rgba(20,4,8,.75)", Math.cos(a) * 0.15); });
      // Rio: Pão de Açúcar, morros e o Cristo no Corcovado
      ctx.fillStyle = "#2a0710";
      ctx.beginPath(); ctx.moveTo(0, h);
      const px = m.x * -12;
      [[0, 0.78], [0.08, 0.74], [0.16, 0.62], [0.2, 0.55], [0.24, 0.6], [0.3, 0.7], [0.36, 0.52], [0.41, 0.4], [0.45, 0.5], [0.5, 0.72], [0.62, 0.7], [0.7, 0.45], [0.72, 0.36], [0.74, 0.45], [0.82, 0.68], [1, 0.74]].forEach(([x, y]) => ctx.lineTo(x * w + px, y * h));
      ctx.lineTo(w, h); ctx.fill();
      ctx.fillStyle = "#2a0710"; ctx.fillRect(0.72 * w + px - 2, 0.29 * h, 4, 0.07 * h); ctx.fillRect(0.72 * w + px - 12, 0.31 * h, 24, 3.5);
      waves(ctx, t, w, h, 0.8, 4, "rgba(20,2,6,.92)", 0.8); shimmer(ctx, t, w, h, 0.82, 0.98, "rgba(255,170,120,A)", 70);
      // o urubu principal: plana, faz a curva e vira o escudo
      const k = ease.inOut(span(t, 0.2, 4.8));
      const ox = w * (0.05 + 0.6 * span(t, 0.2, 3)) + Math.sin(t * 0.9) * w * 0.04, oy = h * (0.3 + Math.sin(t * 1.3) * 0.04);
      const [x, y] = toCrest(ease.inOut(span(t, 3, 4.9)), ox, oy, L, 0.1);
      const s = lerp(0.9, 2.4, ease.inOut(span(t, 3.6, 4.9))) * (L.cs / 260);
      ctx.globalAlpha = 1 - span(t, 4.6, 5.1); bird(ctx, x, y, s * 2, t * (k > 0.7 ? 1.5 : 4), "#0c0204", Math.sin(t * 1.3) * 0.12); ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Atlético-MG — o Galo canta ao amanhecer sobre as montanhas de BH
     ====================================================================== */
  function rooster(ctx, x, y, s, crowK) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.12 * crowK);
    // rabo: penas pretas e brancas em leque
    [["#111", -0.2, 62], ["#f4f4f4", 0.15, 56], ["#111", 0.5, 50], ["#f4f4f4", 0.85, 42]].forEach(([c, a, len]) => {
      ctx.save(); ctx.translate(-18, -4); ctx.rotate(-Math.PI / 2 - 0.5 + a); ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.45, -14, len, 4); ctx.quadraticCurveTo(len * 0.5, 2, 0, 8); ctx.fill(); ctx.restore();
    });
    // corpo e peito
    ctx.fillStyle = "#f4f4f4"; ctx.beginPath(); ctx.ellipse(0, 6, 30, 24, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.ellipse(-4, 10, 18, 12, -0.3, 0, Math.PI); ctx.fill(); // asa
    // pescoço e cabeça
    ctx.fillStyle = "#f4f4f4"; ctx.beginPath(); ctx.moveTo(12, -8); ctx.quadraticCurveTo(26, -30, 22, -46); ctx.lineTo(36, -44); ctx.quadraticCurveTo(38, -20, 26, 2); ctx.fill();
    ctx.beginPath(); ctx.arc(29, -46, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e0262f"; ctx.beginPath(); ctx.moveTo(20, -54); ctx.quadraticCurveTo(22, -66, 27, -56); ctx.quadraticCurveTo(31, -68, 34, -56); ctx.quadraticCurveTo(39, -64, 39, -51); ctx.fill();
    ctx.beginPath(); ctx.ellipse(37, -36, 3.5, 6, 0, 0, TAU); ctx.fill(); // barbela
    ctx.fillStyle = "#f2b233"; ctx.beginPath(); ctx.moveTo(39, -48); ctx.lineTo(50 + crowK * 4, -46 - crowK * 3); ctx.lineTo(39, -42 + crowK * 3); ctx.fill(); // bico
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(31, -48, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#f2b233"; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-6, 28); ctx.lineTo(-8, 44); ctx.lineTo(-16, 46); ctx.moveTo(8, 28); ctx.lineTo(8, 44); ctx.lineTo(16, 46); ctx.stroke();
    ctx.restore();
  }
  reg("atletico-mg", {
    T: 4.8, ring: "255,255,255", halo: "rgba(255,255,255,A)",
    init: () => ({ far: ridge(11, 0.82, 0.16, 12), near: ridge(19, 0.92, 0.1, 16), dust: particles(4, 50) }),
    draw({ t, ctx, w, h, L, m, d }) {
      const dawn = ease.out(span(t, 0, 3.5));
      sky(ctx, w, h, [[0, "#050505"], [0.5, `rgb(${lerp(20, 70, dawn)},${lerp(20, 70, dawn)},${lerp(24, 76, dawn)})`], [1, `rgb(${lerp(40, 210, dawn)},${lerp(40, 210, dawn)},${lerp(44, 214, dawn)})`]]);
      sun(ctx, w * 0.62, h * lerp(0.95, 0.6, dawn), Math.min(w, h) * 0.05, "#e9e9e9", "rgba(255,255,255,A)");
      drawRidge(ctx, d.far, w, h, "#2a2a2a", m.x * -8); drawRidge(ctx, d.near, w, h, "#0d0d0d", m.x * -16);
      for (const p of d.dust) { ctx.fillStyle = `rgba(255,255,255,${0.25 * dawn})`; ctx.fillRect(p.x * w, (p.y * h - t * 10 * p.v) % h, p.s, p.s); }
      // canto: ondas sonoras a partir do bico
      const crow = span(t, 1.6, 3.2), px = w * 0.44, py = h * 0.66; // de pé num pico da serra
      ctx.fillStyle = "#0d0d0d"; ctx.beginPath(); ctx.moveTo(px - 90, h); ctx.lineTo(px - 10, py + 40); ctx.lineTo(px + 14, py + 40); ctx.lineTo(px + 100, h); ctx.fill();
      const rs = L.cs / 260;
      if (crow > 0 && crow < 1) for (let i = 0; i < 3; i++) { const k = (crow * 1.6 - i * 0.2); if (k > 0 && k < 1) { ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px + 50 * rs * 1.3, py - 46 * rs * 1.3, 20 + k * 90, -0.7, 0.5); ctx.stroke(); } }
      const fly = ease.inOut(span(t, 3.4, 4.9)), [x, y] = toCrest(fly, px, py, L, 0.5);
      ctx.globalAlpha = 1 - span(t, 4.6, 5.0);
      rooster(ctx, x, y + Math.sin(t * 6) * 2 * (1 - fly), lerp(1.3, 2.2, fly) * rs, Math.sin(crow * Math.PI));
      ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Athletico-PR — o Furacão
     ====================================================================== */
  reg("athletico-pr", {
    T: 4.4, ring: "255,120,120", halo: "rgba(255,30,50,A)",
    init: () => ({ p: particles(9, 520), bolt: 2.2 }),
    draw({ t, ctx, w, h, L, d }) {
      sky(ctx, w, h, [[0, "#0a0102"], [0.6, "#2a0408"], [1, "#4a0a10"]]);
      // relâmpagos
      if (t > d.bolt) { d.flashT = t; d.bolt = t + 1.6 + Math.random() * 2.5; d.bx = Math.random() * w * 0.6; }
      const fl = d.flashT ? Math.max(0, 1 - (t - d.flashT) * 5) : 0;
      if (fl > 0) { ctx.fillStyle = `rgba(255,220,220,${0.18 * fl})`; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = `rgba(255,240,240,${fl})`; ctx.lineWidth = 2; ctx.beginPath(); let x = d.bx, y = 0; ctx.moveTo(x, y); while (y < h * 0.6) { x += (Math.random() - 0.5) * 40; y += 20 + Math.random() * 20; ctx.lineTo(x, y); } ctx.stroke(); }
      // espiral de partículas que se fecha no escudo
      const k = ease.inOut(span(t, 0, 4.6)), cx = lerp(w * 0.45, L.cx, k), cy = lerp(h * 0.5, L.cy, k);
      for (const p of d.p) {
        const r0 = (0.15 + p.y * 0.9) * Math.max(w, h) * 0.55, r = r0 * lerp(1, 0.18, k) * (1 + Math.sin(t + p.p) * 0.03);
        const a = p.p + t * (0.9 + (1 - p.y) * 2.2) * (1 + k);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.55;
        ctx.fillStyle = p.x < 0.55 ? `rgba(220,20,40,${0.4 + p.v * 0.5})` : `rgba(10,10,10,${0.5 + p.v * 0.4})`;
        ctx.fillRect(x, y, 1.5 + p.s * 2.5, 1.2 + p.s);
      }
      glow(ctx, cx, cy, L.cs * 0.6, "rgba(255,40,60,A)", 0.4 * k);
    },
  });

  /* ======================================================================
     Bahia — fitas tricolores sobre a Baía de Todos os Santos
     ====================================================================== */
  reg("bahia", {
    T: 4.6, ring: "255,255,255", halo: "rgba(120,180,255,A)", veil: "0,30,80", veilA: 0.55,
    init: () => ({ gulls: particles(14, 6) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#2f7fe0"], [0.6, "#9fd0ff"], [1, "#fff4d6"]]);
      sun(ctx, w * 0.62, h * 0.3, Math.min(w, h) * 0.06, "#fff3c4", "rgba(255,230,150,A)");
      d.gulls.forEach((g, i) => bird(ctx, ((g.x * w + t * 30 * g.v) % (w + 80)) - 40, h * (0.15 + g.y * 0.25), 0.25 + g.s * 0.08, t * 5 + i, "rgba(20,40,80,.6)"));
      waves(ctx, t, w, h, 0.76, 6, "#0055a5", 1); waves(ctx, t, w, h, 0.84, 5, "#003b78", 1.3, 0.015, 1); shimmer(ctx, t, w, h, 0.8, 0.98, "rgba(255,255,255,A)", 80);
      // três fitas (azul, vermelho, branco) ondulam e convergem no escudo
      ["#0055a5", "#e30613", "#ffffff"].forEach((c, i) => {
        const k = ease.inOut(span(t, 0.3 + i * 0.2, 4.6));
        ctx.strokeStyle = c; ctx.lineWidth = lerp(26, 6, k); ctx.lineCap = "round"; ctx.globalAlpha = 1 - span(t, 4.4, 5);
        ctx.beginPath();
        const end = lerp(0.15, 1, k); // a fita vai se estendendo até o escudo
        for (let s = 0; s <= end + 0.0001; s += 0.03) {
          const x = lerp(-0.1 * w, L.cx, s), y0 = h * (0.3 + i * 0.12) + Math.sin(s * 6 + t * 2 + i) * h * 0.06 * (1 - k * 0.6);
          const y = lerp(y0, L.cy + (i - 1) * L.cs * 0.08, Math.pow(s, 3));
          s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
      });
    },
  });

  /* ======================================================================
     Botafogo — a Estrela Solitária que guiava os remadores
     ====================================================================== */
  reg("botafogo", {
    T: 4.6, ring: "255,255,255", halo: "rgba(255,255,255,A)",
    init: () => ({ stars: starfield(21, 260, 0.75) }),
    draw({ t, ctx, w, h, L, m, d }) {
      const dawn = ease.out(span(t, 2, 6));
      sky(ctx, w, h, [[0, "#000"], [0.6, `rgb(${10 + dawn * 30},${10 + dawn * 30},${14 + dawn * 34})`], [1, `rgb(${30 + dawn * 70},${30 + dawn * 70},${34 + dawn * 76})`]]);
      stars(ctx, d.stars, t, w, h, 1 - dawn * 0.6, m.x * -6);
      waves(ctx, t, w, h, 0.78, 3, "#0a0a0a", 0.6); shimmer(ctx, t, w, h, 0.8, 0.98, "rgba(255,255,255,A)", 50);
      // barco a remo
      const bx = w * (0.1 + 0.25 * span(t, 0, 6)), by = h * 0.8 + Math.sin(t * 2) * 2;
      ctx.fillStyle = "#cfcfcf"; ctx.beginPath(); ctx.moveTo(bx - 40, by); ctx.lineTo(bx + 40, by); ctx.lineTo(bx + 30, by + 8); ctx.lineTo(bx - 30, by + 8); ctx.fill();
      const oar = Math.sin(t * 3) * 0.4; ctx.strokeStyle = "#cfcfcf"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx - 8, by); ctx.lineTo(bx - 8 - Math.cos(oar) * 34, by + 14 + Math.sin(oar) * 6); ctx.moveTo(bx + 8, by); ctx.lineTo(bx + 8 + Math.cos(oar) * 34, by + 14 - Math.sin(oar) * 6); ctx.stroke();
      // a estrela nasce no horizonte e sobe até o escudo
      const rise = ease.out(span(t, 0.4, 2.8)), fly = ease.inOut(span(t, 3, 4.7));
      const sx0 = w * 0.55, sy0 = lerp(h * 0.8, h * 0.28, rise), [x, y] = toCrest(fly, sx0, sy0, L, 0.1);
      const r = lerp(Math.min(w, h) * 0.02, L.cs * 0.12, fly) * (1 + 0.06 * Math.sin(t * 4));
      ctx.globalAlpha = 1 - span(t, 4.6, 5.1);
      glow(ctx, x, y, r * 6, "rgba(255,255,255,A)", 0.5);
      ctx.fillStyle = "#fff"; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill();
      ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Bragantino — Massa Bruta: dois touros avançam e se chocam
     ====================================================================== */
  function bull(ctx, x, y, s, run, flip, color = "#151515") {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip * s, s); ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, 44, 22, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(40, -10, 18, 14, -0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f2e6cc"; ctx.beginPath(); ctx.moveTo(46, -20); ctx.quadraticCurveTo(64, -30, 58, -46); ctx.quadraticCurveTo(56, -34, 44, -28); ctx.fill();
    ctx.fillStyle = color; const l = Math.sin(run) * 10;
    [[-28, l], [-14, -l], [16, l], [28, -l]].forEach(([lx, a]) => { ctx.save(); ctx.translate(lx, 14); ctx.rotate(a * 0.04); ctx.fillRect(-4, 0, 8, 26); ctx.restore(); });
    ctx.beginPath(); ctx.moveTo(-42, -6); ctx.quadraticCurveTo(-62, -2, -58, 18); ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
    ctx.restore();
  }
  reg("bragantino", {
    T: 3.6, ring: "255,230,120", halo: "rgba(255,200,0,A)",
    init: () => ({ dust: particles(33, 120) }),
    draw({ t, ctx, w, h, L, d }) {
      sky(ctx, w, h, [[0, "#3a040a"], [0.55, "#b3121f"], [1, "#e8453a"]]);
      const k = ease.inOut(span(t, 0.2, 3.3)), meet = L.cx, gy = h * 0.74;
      sun(ctx, meet, L.cy, L.cs * 0.25 * (0.6 + 0.4 * span(t, 2.8, 3.6)), "#ffcc00", "rgba(255,200,0,A)");
      ctx.fillStyle = "#2a0408"; ctx.fillRect(0, gy + 26, w, h);
      const s = L.cs / 220;
      bull(ctx, lerp(-0.1 * w, meet - 70 * s, k), gy, s, t * 14, 1);
      bull(ctx, lerp(1.1 * w, meet + 70 * s, k), gy, s, t * 14 + 1, -1);
      // poeira levantada
      for (const p of d.dust) { const side = p.x < 0.5 ? -1 : 1, bx = side < 0 ? lerp(-0.1 * w, meet - 70 * s, k) : lerp(1.1 * w, meet + 70 * s, k); const a = (1 - p.y) * 0.5 * (1 - span(t, 3.4, 4.4)); ctx.fillStyle = `rgba(255,200,170,${a})`; ctx.beginPath(); ctx.arc(bx - side * p.y * 140 * s, gy + 30 - p.v * 40 * p.y, p.s * 3, 0, TAU); ctx.fill(); }
      const boom = span(t, 3.25, 4.2);
      if (boom > 0 && boom < 1) for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, r = boom * L.cs * 0.9; ctx.strokeStyle = `rgba(255,240,180,${1 - boom})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(meet + Math.cos(a) * r * 0.5, gy - 20 + Math.sin(a) * r * 0.5); ctx.lineTo(meet + Math.cos(a) * r, gy - 20 + Math.sin(a) * r); ctx.stroke(); }
    },
  });

  /* ======================================================================
     Chapecoense — a flechada atravessa o verde do Oeste
     ====================================================================== */
  reg("chapecoense", {
    T: 4.2, ring: "255,255,255", halo: "rgba(120,255,160,A)", veil: "0,30,12",
    init: () => ({ h1: ridge(41, 0.74, 0.12, 10, 0.5), h2: ridge(43, 0.86, 0.1, 12, 0.6), leaves: particles(44, 70) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#06301a"], [0.6, "#2f9e5c"], [1, "#d8f5c8"]]);
      sun(ctx, w * 0.3, h * 0.35, Math.min(w, h) * 0.05, "#fff8d6", "rgba(255,250,200,A)");
      drawRidge(ctx, d.h1, w, h, "#0e6b36", m.x * -8);
      // pinheiros/árvores na encosta
      for (let i = 0; i < 26; i++) { const x = (i / 26) * w + m.x * -10, y = h * (0.78 + Math.sin(i * 1.7) * 0.03); ctx.fillStyle = "#08502a"; ctx.beginPath(); ctx.moveTo(x, y - 30 - (i % 3) * 8); ctx.lineTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.fill(); }
      drawRidge(ctx, d.h2, w, h, "#043a1e", m.x * -16);
      for (const p of d.leaves) { const x = ((p.x * w + t * 40 * p.v) % (w + 40)) - 20, y = (p.y * h + t * 18 * p.v) % h; ctx.save(); ctx.translate(x, y); ctx.rotate(t * p.v * 3 + p.p); ctx.fillStyle = `rgba(190,255,190,${0.35 + p.v * 0.3})`; ctx.beginPath(); ctx.ellipse(0, 0, 5 * p.s, 2 * p.s, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      // a flecha
      const k = ease.inOut(span(t, 0.8, 4.1)), ax = lerp(-0.15 * w, L.cx - L.cs * 0.05, k), ay = lerp(h * 0.6, L.cy, k) - Math.sin(k * Math.PI) * h * 0.18;
      const ang = Math.atan2(L.cy - h * 0.6 - Math.cos(k * Math.PI) * h * 0.18 * Math.PI, L.cx - (-0.15 * w)) * 0.6;
      ctx.globalAlpha = 1 - span(t, 4.1, 4.5);
      const tr = ctx.createLinearGradient(ax - 200, ay, ax, ay); tr.addColorStop(0, "rgba(255,255,255,0)"); tr.addColorStop(1, "rgba(255,255,255,.7)");
      ctx.strokeStyle = tr; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax - 200, ay + 20); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = "#fff"; ctx.fillRect(-60, -1.5, 60, 3); ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(16, 0); ctx.lineTo(0, 7); ctx.fill();
      ctx.fillStyle = "#00843d"; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-72, -8); ctx.lineTo(-54, 0); ctx.lineTo(-72, 8); ctx.fill(); ctx.restore();
      ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Corinthians — âncora, remos e boia: o clube nascido também no remo
     ====================================================================== */
  reg("corinthians", {
    T: 4.6, ring: "255,255,255", halo: "rgba(255,255,255,A)",
    init: () => ({ bubbles: particles(52, 50) }),
    draw({ t, ctx, w, h, L, d }) {
      sky(ctx, w, h, [[0, "#1b1b1f"], [0.55, "#3a3d44"], [1, "#6f747d"]]);
      waves(ctx, t, w, h, 0.66, 6, "rgba(10,10,12,.9)", 0.7); waves(ctx, t, w, h, 0.74, 5, "#050506", 1, 0.016, 2); shimmer(ctx, t, w, h, 0.7, 0.98, "rgba(255,255,255,A)", 60);
      for (const p of d.bubbles) { const y = h - ((t * 40 * p.v + p.y * h) % (h * 0.35)); ctx.strokeStyle = `rgba(255,255,255,${0.3 * p.v})`; ctx.beginPath(); ctx.arc(p.x * w, y, p.s * 2.5, 0, TAU); ctx.stroke(); }
      const { cx, cy, cs } = L, s = cs / 200;
      // âncora desce e se encaixa no centro
      const ka = ease.outBack(span(t, 0.4, 2)), ay = lerp(-cs, cy, ka);
      ctx.save(); ctx.translate(cx, ay); ctx.scale(s, s); ctx.globalAlpha = 1 - span(t, 4.5, 5);
      ctx.strokeStyle = "#f4f4f4"; ctx.lineWidth = 12; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(0, 60); ctx.moveTo(-30, -48); ctx.lineTo(30, -48); ctx.moveTo(-52, 30); ctx.quadraticCurveTo(0, 96, 52, 30); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -82, 12, 0, TAU); ctx.lineWidth = 8; ctx.stroke(); ctx.restore();
      // remos cruzam por trás
      [-1, 1].forEach((sd, i) => { const k = ease.outBack(span(t, 1.6 + i * 0.15, 2.8)); ctx.save(); ctx.translate(cx, cy); ctx.rotate(sd * lerp(1.6, 0.75, k)); ctx.globalAlpha = k * (1 - span(t, 4.5, 5)); ctx.fillStyle = "#e0262f"; ctx.fillRect(-4, -cs * 0.62, 8, cs * 1.1); ctx.beginPath(); ctx.ellipse(0, cs * 0.5, 14, 34, 0, 0, TAU); ctx.fill(); ctx.restore(); });
      // boia gira em volta
      const kb = ease.out(span(t, 2.6, 4)); if (kb > 0) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 1.5); ctx.globalAlpha = kb * (1 - span(t, 4.5, 5)); ctx.lineWidth = cs * 0.08; ctx.setLineDash([cs * 0.2, cs * 0.12]); ctx.strokeStyle = "#f4f4f4"; ctx.beginPath(); ctx.arc(0, 0, cs * 0.5 * kb, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
      ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Coritiba — araucárias e a gralha-azul que as planta
     ====================================================================== */
  function araucaria(ctx, x, base, hgt, k, color) {
    if (k <= 0) return;
    const hh = hgt * k; ctx.fillStyle = color;
    ctx.fillRect(x - 3, base - hh, 6, hh);
    for (let i = 0; i < 4; i++) { const yy = base - hh + hh * (0.05 + i * 0.12), ww = hgt * (0.32 - i * 0.05) * ease.out(clamp(k * 1.2 - i * 0.1)); ctx.beginPath(); ctx.moveTo(x - ww, yy + 8); ctx.quadraticCurveTo(x, yy - 14, x + ww, yy + 8); ctx.quadraticCurveTo(x, yy, x - ww, yy + 8); ctx.fill(); }
  }
  reg("coritiba", {
    T: 4.6, ring: "255,255,255", halo: "rgba(160,255,200,A)", veil: "0,20,14", veilA: 0.7,
    init: () => ({ trees: Array.from({ length: 14 }, (_, i) => ({ x: (i + 0.5) / 14 + (Math.sin(i * 3.1) * 0.02), hgt: 0.32 + ((i * 7) % 5) * 0.05, d: (i % 3) * 0.25, far: i % 2 })) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#0b2a1e"], [0.55, "#2f6e4e"], [1, "#a9d9b8"]]);
      glow(ctx, w * 0.55, h * 0.75, h * 0.8, "rgba(255,240,200,A)", 0.3);
      d.trees.filter((x) => x.far).forEach((tr) => araucaria(ctx, tr.x * w + m.x * -6, h * 0.86, tr.hgt * h * 0.8, ease.out(span(t, 0.2 + tr.d, 2.2 + tr.d)), "rgba(10,70,45,.55)"));
      ctx.fillStyle = "rgba(230,245,235,.35)"; ctx.fillRect(0, h * 0.7, w, h * 0.12); // névoa
      d.trees.filter((x) => !x.far).forEach((tr) => araucaria(ctx, tr.x * w + m.x * -14, h * 0.95, tr.hgt * h, ease.out(span(t, 0.5 + tr.d, 2.6 + tr.d)), "#063a29"));
      ctx.fillStyle = "#04281c"; ctx.fillRect(0, h * 0.94, w, h);
      // gralha-azul voa até o escudo
      const k = ease.inOut(span(t, 1.8, 4.6)), [x, y] = toCrest(k, -0.05 * w, h * 0.3, L, 0.3);
      ctx.globalAlpha = 1 - span(t, 4.4, 4.9); bird(ctx, x, y, lerp(0.6, 1.4, k) * (L.cs / 260), t * 7, "#1f5fbf"); ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Fluminense — "flumen", o rio: três correntes nas cores do clube
     ====================================================================== */
  reg("fluminense", {
    T: 4.4, ring: "255,255,255", halo: "rgba(255,255,255,A)", veil: "30,0,10", veilA: 0.55,
    draw({ t, ctx, w, h, L }) {
      sky(ctx, w, h, [[0, "#14060b"], [0.5, "#3a0c1c"], [1, "#0a2a1f"]]);
      const cols = ["#7a1333", "#ffffff", "#00664b"];
      for (let band = 0; band < 3; band++) {
        const k = ease.inOut(span(t, 0.2 + band * 0.25, 4.3));
        for (let lane = 0; lane < 6; lane++) {
          ctx.strokeStyle = cols[band]; ctx.globalAlpha = (0.25 + lane * 0.12) * (1 - span(t, 4.2, 4.8)); ctx.lineWidth = 10 - lane; ctx.lineCap = "round";
          ctx.beginPath();
          const end = lerp(0.12, 1, k);
          for (let s = 0; s <= end + 0.0001; s += 0.02) {
            const x = lerp(-0.05 * w, L.cx, s), base = h * (0.32 + band * 0.16 + lane * 0.012);
            const y = lerp(base + Math.sin(s * 7 + t * 2 + band + lane * 0.3) * h * 0.05, L.cy + (band - 1) * L.cs * 0.1, Math.pow(s, 4));
            s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Grêmio — Imortal Tricolor: faixas que sobem sob as estrelas
     ====================================================================== */
  reg("gremio", {
    T: 4.4, ring: "255,255,255", halo: "rgba(110,190,255,A)",
    init: () => ({ stars: starfield(77, 180, 0.7) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#020b14"], [0.6, "#062a46"], [1, "#0d80bf"]]);
      stars(ctx, d.stars, t, w, h, 0.9, m.x * -8);
      const cols = ["#0d80bf", "#111111", "#ffffff"], n = 12;
      for (let i = 0; i < n; i++) {
        const k = ease.out(span(t, 0.2 + i * 0.12, 1.6 + i * 0.12)), col = cols[i % 3];
        const x0 = (i / n) * w * 0.9 + w * 0.05, conv = ease.inOut(span(t, 2.6, 4.4));
        const x = lerp(x0, L.cx + (i - n / 2) * L.cs * 0.03, conv), bw = lerp(w / n * 0.7, L.cs * 0.03, conv);
        const top = lerp(h, h * 0.15, k);
        ctx.globalAlpha = 0.85 * (1 - span(t, 4.3, 4.8)); ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x - bw / 2, h); ctx.lineTo(x - bw / 2, top + Math.sin(t * 2 + i) * 8); ctx.lineTo(x + bw / 2, top + Math.sin(t * 2 + i + 0.5) * 8); ctx.lineTo(x + bw / 2, h); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Internacional — o pôr do sol no Guaíba e o Beira-Rio
     ====================================================================== */
  reg("internacional", {
    T: 4.6, ring: "255,240,220", halo: "rgba(255,120,80,A)", veil: "40,0,0", veilA: 0.55,
    draw({ t, ctx, w, h, L, m }) {
      const set = ease.inOut(span(t, 0, 5));
      sky(ctx, w, h, [[0, "#2a0306"], [0.45, "#a3101b"], [0.72, "#ff6a3a"], [1, "#ffc47a"]]);
      const sy = lerp(h * 0.48, h * 0.7, set);
      sun(ctx, w * 0.42, sy, Math.min(w, h) * 0.09, "#fff0c8", "rgba(255,160,90,A)");
      // Beira-Rio: anel de arcos à beira do rio
      const bx = w * 0.42 + m.x * -10, by = h * 0.72, sw = w * 0.36;
      ctx.fillStyle = "#3a0406"; ctx.beginPath(); ctx.ellipse(bx, by, sw / 2, h * 0.07, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = "#ffe9d6"; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
      for (let i = 0; i <= 18; i++) { const a = Math.PI + (i / 18) * Math.PI, x = bx + Math.cos(a) * sw / 2, y = by + Math.sin(a) * h * 0.07; ctx.beginPath(); ctx.moveTo(x, by); ctx.quadraticCurveTo(x + 4, y - 18 * Math.sin((i / 18) * Math.PI), x + 8, by); ctx.stroke(); }
      ctx.globalAlpha = 1;
      // Guaíba
      ctx.fillStyle = "#5a0a10"; ctx.fillRect(0, by, w, h - by);
      for (let i = 0; i < 28; i++) { const y = by + 6 + i * 6, len = (1 - i / 28) * w * 0.12; ctx.fillStyle = `rgba(255,190,130,${0.5 * (1 - i / 28)})`; ctx.fillRect(w * 0.42 - len / 2 + Math.sin(t * 2 + i) * 8, y, len, 2); }
      waves(ctx, t, w, h, 0.86, 3, "rgba(40,0,4,.7)", 0.8);
      // o sol vira o escudo
      const k = ease.inOut(span(t, 3.4, 4.7)); if (k > 0) { const [x, y] = toCrest(k, w * 0.42, sy, L, 0.2); glow(ctx, x, y, L.cs * 0.5 * (1 - k * 0.5), "rgba(255,230,180,A)", 0.8 * (1 - span(t, 4.5, 5))); }
    },
  });

  /* ======================================================================
     Mirassol — o sol amarelo e o rugido do Leão
     ====================================================================== */
  function lionHead(ctx, x, y, s, roar, mane, face) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s * (1 + roar * 0.08), s * (1 + roar * 0.08));
    ctx.fillStyle = mane; for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 34, Math.sin(a) * 34, 18, 12, a, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, 36, 0, TAU); ctx.fill();
    ctx.fillStyle = face; ctx.beginPath(); ctx.arc(0, 2, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fbe3b0"; ctx.beginPath(); ctx.ellipse(0, 12, 14, 10 + roar * 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#3a1d0c"; ctx.beginPath(); ctx.moveTo(-5, 5); ctx.lineTo(5, 5); ctx.lineTo(0, 11); ctx.fill();
    if (roar > 0.1) { ctx.fillStyle = "#5a1010"; ctx.beginPath(); ctx.ellipse(0, 17, 7, 6 * roar, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(-10, -4, 3, 0, TAU); ctx.arc(10, -4, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  reg("mirassol", {
    T: 4.6, ring: "0,90,40", halo: "rgba(255,230,80,A)", veil: "60,40,0", veilA: 0.5,
    draw({ t, ctx, w, h, L, m }) {
      sky(ctx, w, h, [[0, "#ffb800"], [0.6, "#ffe066"], [1, "#fff6c4"]]);
      const cx = w * 0.45, cy = h * 0.55;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.12);
      for (let i = 0; i < 18; i++) { ctx.rotate(TAU / 18); ctx.fillStyle = i % 2 ? "rgba(255,255,255,.18)" : "rgba(0,132,61,.12)"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.max(w, h), -40); ctx.lineTo(Math.max(w, h), 40); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = "#00843d"; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * 0.82); ctx.quadraticCurveTo(w * 0.5, h * 0.74, w, h * 0.84); ctx.lineTo(w, h); ctx.fill();
      const appear = ease.outBack(span(t, 0.4, 1.6)), roar = Math.max(0, Math.sin(span(t, 1.8, 3.2) * Math.PI));
      const k = ease.inOut(span(t, 3.4, 4.7)), [x, y] = toCrest(k, cx, cy, L, 0.1);
      for (let i = 0; i < 3; i++) { const q = span(t, 1.8 + i * 0.25, 3); if (q > 0 && q < 1) { ctx.strokeStyle = `rgba(0,100,45,${0.6 * (1 - q)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 60 + q * 200, 0, TAU); ctx.stroke(); } }
      ctx.globalAlpha = 1 - span(t, 4.5, 5); lionHead(ctx, x, y, appear * lerp(1.4, 2.2, k) * (L.cs / 280), roar, "#8a4b12", "#e9b23a"); ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Palmeiras — os louros da Palestra Itália se fecham no escudo
     ====================================================================== */
  reg("palmeiras", {
    T: 4.6, ring: "255,255,255", halo: "rgba(170,255,200,A)", veil: "0,25,12",
    init: () => ({ leaves: particles(61, 46), fall: particles(62, 60) }),
    draw({ t, ctx, w, h, L, d }) {
      sky(ctx, w, h, [[0, "#021a0e"], [0.6, "#05462a"], [1, "#0b6b40"]]);
      glow(ctx, L.cx, L.cy, L.cs * 1.4, "rgba(120,255,170,A)", 0.18);
      for (const p of d.fall) { const x = (p.x * w + Math.sin(t * p.v + p.p) * 30), y = (p.y * h + t * 25 * p.v) % h; ctx.save(); ctx.translate(x, y); ctx.rotate(t * p.v + p.p); ctx.fillStyle = `rgba(150,230,170,${0.25 + 0.25 * p.v})`; ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.5, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      // folhas de louro voam e formam a coroa em volta do escudo
      d.leaves.forEach((p, i) => {
        const k = ease.inOut(span(t, 0.3 + i * 0.04, 3 + i * 0.03)), a = (i / d.leaves.length) * TAU;
        const tx = L.cx + Math.cos(a) * L.cs * 0.58, ty = L.cy + Math.sin(a) * L.cs * 0.58;
        const sx = p.x * w * 0.6, sy = p.y * h;
        const x = bez(sx, (sx + tx) / 2, tx, k), y = bez(sy, sy - h * 0.2, ty, k);
        ctx.save(); ctx.translate(x, y); ctx.rotate(lerp(p.p * 4, a + Math.PI / 2 + 0.6, k)); ctx.globalAlpha = 1 - 0.85 * span(t, 4.6, 5.4);
        ctx.fillStyle = i % 3 ? "#9ee2b5" : "#d4f5df"; ctx.beginPath(); ctx.ellipse(0, 0, L.cs * 0.05, L.cs * 0.018, 0, 0, TAU); ctx.fill(); ctx.restore();
      });
      ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Remo — o remo do Leão Azul no rio Guamá, em Belém
     ====================================================================== */
  reg("remo", {
    T: 4.8, ring: "200,220,255", halo: "rgba(80,140,255,A)",
    init: () => ({ stars: starfield(91, 160, 0.6) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#020818"], [0.6, "#0b2a5b"], [1, "#2f5cb8"]]);
      stars(ctx, d.stars, t, w, h, 0.9, m.x * -6);
      const mx = w * 0.3, my = h * 0.22; glow(ctx, mx, my, 120, "rgba(220,235,255,A)", 0.4); ctx.fillStyle = "#eef4ff"; ctx.beginPath(); ctx.arc(mx, my, 22, 0, TAU); ctx.fill();
      // mata na margem
      ctx.fillStyle = "#03122e"; ctx.beginPath(); ctx.moveTo(0, h * 0.66); for (let x = 0; x <= w; x += 18) ctx.lineTo(x, h * (0.6 + Math.sin(x * 0.05) * 0.02 + Math.sin(x * 0.013) * 0.03)); ctx.lineTo(w, h * 0.7); ctx.lineTo(0, h * 0.7); ctx.fill();
      waves(ctx, t, w, h, 0.69, 3, "#061c42", 0.6); shimmer(ctx, t, w, h, 0.72, 0.98, "rgba(220,235,255,A)", 70);
      // barco a remo atravessa e sobe até o escudo
      const k = span(t, 0, 3.6), fly = ease.inOut(span(t, 3.4, 4.9));
      const bx0 = lerp(-0.1 * w, w * 0.55, ease.inOut(k)), by0 = h * 0.74 + Math.sin(t * 2) * 2, [bx, by] = toCrest(fly, bx0, by0, L, 0.2);
      const s = lerp(1, 2, fly) * (L.cs / 260);
      ctx.save(); ctx.translate(bx, by); ctx.scale(s, s); ctx.globalAlpha = 1 - span(t, 4.6, 5.1);
      ctx.fillStyle = "#e8eeff"; ctx.beginPath(); ctx.moveTo(-50, 0); ctx.lineTo(50, 0); ctx.lineTo(38, 10); ctx.lineTo(-38, 10); ctx.fill();
      const o = Math.sin(t * 3.2) * 0.5; ctx.strokeStyle = "#e8eeff"; ctx.lineWidth = 3;
      [-20, 0, 20].forEach((ox) => { ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox - 30 * Math.cos(o), 16 + 10 * Math.sin(o)); ctx.stroke(); });
      ctx.restore(); ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Santos — do porto para o mundo: mar, navio e as listras do Peixe
     ====================================================================== */
  reg("santos", {
    T: 4.6, ring: "255,255,255", halo: "rgba(255,255,255,A)",
    init: () => ({ gulls: particles(71, 7) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#1c1f26"], [0.55, "#5b6270"], [1, "#c9ced6"]]);
      // listras preto e branco sobem como velas ao fundo
      for (let i = 0; i < 9; i++) { const k = ease.out(span(t, 0.2 + i * 0.1, 1.6 + i * 0.1)); ctx.fillStyle = i % 2 ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.18)"; ctx.fillRect(w * (0.1 + i * 0.09) + m.x * -8, lerp(h, h * 0.1, k), w * 0.09, h); }
      d.gulls.forEach((g, i) => bird(ctx, ((g.x * w + t * 26 * g.v) % (w + 80)) - 40, h * (0.18 + g.y * 0.2), 0.28, t * 5 + i, "rgba(255,255,255,.8)"));
      // navio deixando o porto
      const nx = lerp(w * 0.1, w * 0.48, ease.inOut(span(t, 0, 4))), ny = h * 0.7;
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.moveTo(nx - 80, ny); ctx.lineTo(nx + 70, ny); ctx.lineTo(nx + 54, ny + 18); ctx.lineTo(nx - 70, ny + 18); ctx.fill();
      ctx.fillStyle = "#eee"; ctx.fillRect(nx - 40, ny - 22, 60, 22); ctx.fillStyle = "#111"; ctx.fillRect(nx - 10, ny - 40, 12, 20);
      for (let i = 0; i < 6; i++) { const q = (t * 0.6 + i / 6) % 1; ctx.fillStyle = `rgba(230,230,235,${0.5 * (1 - q)})`; ctx.beginPath(); ctx.arc(nx - 4 - q * 60, ny - 46 - q * 40, 6 + q * 14, 0, TAU); ctx.fill(); }
      waves(ctx, t, w, h, 0.76, 5, "#0d0f14", 1); waves(ctx, t, w, h, 0.86, 4, "#05060a", 1.4, 0.016, 2); shimmer(ctx, t, w, h, 0.8, 0.98, "rgba(255,255,255,A)", 70);
    },
  });

  /* ======================================================================
     São Paulo — o branco, o vermelho e o preto desenham o escudo
     ====================================================================== */
  reg("sao-paulo", {
    T: 4.4, ring: "227,6,19", halo: "rgba(255,255,255,A)", veil: "0,0,0", veilA: 0.65,
    init: () => ({ city: Array.from({ length: 46 }, (_, i) => ({ x: i / 46, h: 0.08 + ((i * 37) % 17) / 17 * 0.22, wdt: 0.012 + ((i * 13) % 5) * 0.004 })) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#0a0a0a"], [0.55, "#3a0a0d"], [1, "#e30613"]]);
      // prédios de São Paulo com janelas acendendo
      d.city.forEach((b, i) => { const x = b.x * w + m.x * -10, top = h * (0.95 - b.h); ctx.fillStyle = "#0b0b0b"; ctx.fillRect(x, top, b.wdt * w + 6, h); for (let r = 0; r < b.h * 30; r++) if ((i * 7 + r * 3) % 5 === 0) { ctx.fillStyle = `rgba(255,220,150,${0.5 * clamp(t - r * 0.05 - i * 0.02)})`; ctx.fillRect(x + 3, top + 6 + r * 9, 3, 3); } });
      // três traços (preto, vermelho, preto) desenham o contorno do escudo
      const { cx, cy, cs } = L;
      [["#111111", 0], ["#e30613", 0.07], ["#ffffff", 0.14]].forEach(([c, inset], i) => {
        const k = ease.inOut(span(t, 0.4 + i * 0.4, 3.2 + i * 0.3)), s = cs * (0.5 - inset);
        const pts = [[cx - s, cy - s * 0.8], [cx + s, cy - s * 0.8], [cx, cy + s * 1.05], [cx - s, cy - s * 0.8]];
        ctx.strokeStyle = c; ctx.lineWidth = cs * 0.035; ctx.lineJoin = "round"; ctx.globalAlpha = 1 - span(t, 4.3, 4.9);
        ctx.beginPath(); ctx.moveTo(...pts[0]);
        const total = 3 * k;
        for (let j = 0; j < 3; j++) { const q = clamp(total - j); if (q <= 0) break; ctx.lineTo(lerp(pts[j][0], pts[j + 1][0], q), lerp(pts[j][1], pts[j + 1][1], q)); }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    },
  });

  /* ======================================================================
     Vasco — a caravela das Grandes Navegações, com a cruz na vela
     ====================================================================== */
  function caravel(ctx, x, y, s, roll) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(roll); ctx.scale(s, s);
    ctx.fillStyle = "#7a5232"; ctx.beginPath(); ctx.moveTo(-70, 0); ctx.quadraticCurveTo(0, 14, 76, -6); ctx.lineTo(60, 22); ctx.lineTo(-56, 22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#6a4528"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-6, -110); ctx.moveTo(34, 0); ctx.lineTo(34, -80); ctx.stroke();
    const sail = (sx, top, ww, hh) => { ctx.fillStyle = "#f4f1ea"; ctx.beginPath(); ctx.moveTo(sx - ww, top); ctx.quadraticCurveTo(sx, top - 8, sx + ww, top); ctx.quadraticCurveTo(sx + ww + 8, top + hh / 2, sx + ww, top + hh); ctx.quadraticCurveTo(sx, top + hh - 10, sx - ww, top + hh); ctx.quadraticCurveTo(sx - ww + 8, top + hh / 2, sx - ww, top); ctx.fill(); };
    sail(-6, -100, 34, 70); sail(34, -74, 22, 48);
    // cruz pátea na vela
    ctx.fillStyle = "#c8102e"; ctx.save(); ctx.translate(-6, -66);
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(22, -12); ctx.lineTo(22, 12); ctx.lineTo(0, 4); ctx.fill(); }
    ctx.restore(); ctx.restore();
  }
  reg("vasco", {
    T: 4.8, ring: "255,255,255", halo: "rgba(255,255,255,A)",
    init: () => ({ stars: starfield(31, 200, 0.6) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#000"], [0.6, "#151515"], [1, "#3c3c3c"]]);
      stars(ctx, d.stars, t, w, h, 0.9, m.x * -6);
      waves(ctx, t, w, h, 0.72, 6, "#111", 0.7);
      const k = ease.inOut(span(t, 0, 3.6)), fly = ease.inOut(span(t, 3.4, 4.9));
      const x0 = lerp(-0.15 * w, w * 0.5, k), y0 = h * 0.74 + Math.sin(t * 1.6) * 3, [x, y] = toCrest(fly, x0, y0, L, 0.15);
      ctx.globalAlpha = 1 - span(t, 4.6, 5.1); caravel(ctx, x, y, lerp(1, 1.6, fly) * (L.cs / 300), Math.sin(t * 1.6) * 0.04); ctx.globalAlpha = 1;
      waves(ctx, t, w, h, 0.8, 5, "#050505", 1.2, 0.016, 1.5); shimmer(ctx, t, w, h, 0.8, 0.98, "rgba(255,255,255,A)", 60);
    },
  });

  /* ======================================================================
     Vitória — o Farol da Barra ilumina Salvador e o Leão aparece
     ====================================================================== */
  reg("vitoria", {
    T: 4.8, ring: "255,230,200", halo: "rgba(255,60,60,A)",
    init: () => ({ stars: starfield(17, 160, 0.55) }),
    draw({ t, ctx, w, h, L, m, d }) {
      sky(ctx, w, h, [[0, "#0a0102"], [0.55, "#4a0608"], [1, "#a8141a"]]);
      stars(ctx, d.stars, t, w, h, 0.8, m.x * -6);
      const fx = w * 0.56 + m.x * -10, fy = h * 0.46;
      // facho do farol varrendo o céu
      const ang = Math.sin(t * 0.8) * 0.9 + Math.PI;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "rgba(255,246,196,.5)"); g.addColorStop(1, "rgba(255,246,196,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, -w * 0.12); ctx.lineTo(w, w * 0.12); ctx.fill(); ctx.restore();
      // farol listrado sobre o forte
      ctx.fillStyle = "#1a0405"; ctx.fillRect(fx - 60, h * 0.72, 120, h);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(fx - 12, h * 0.72); ctx.lineTo(fx - 8, fy + 8); ctx.lineTo(fx + 8, fy + 8); ctx.lineTo(fx + 12, h * 0.72); ctx.fill();
      ctx.fillStyle = "#111"; ctx.fillRect(fx - 11, h * 0.56, 22, 10); ctx.fillRect(fx - 10, h * 0.64, 20, 10);
      glow(ctx, fx, fy, 30, "rgba(255,236,160,A)", 0.9); ctx.fillStyle = "#ffe27a"; ctx.fillRect(fx - 7, fy - 4, 14, 12);
      waves(ctx, t, w, h, 0.78, 5, "#1a0203", 1); shimmer(ctx, t, w, h, 0.8, 0.98, "rgba(255,200,160,A)", 60);
      // o leão surge e salta até o escudo
      const appear = ease.outBack(span(t, 1.2, 2.4)), roar = Math.max(0, Math.sin(span(t, 2.4, 3.4) * Math.PI));
      const k = ease.inOut(span(t, 3.5, 4.9)), [x, y] = toCrest(k, w * 0.7, h * 0.34, L, 0.2);
      ctx.globalAlpha = 1 - span(t, 4.6, 5.1); lionHead(ctx, x, y, appear * lerp(1.2, 2, k) * (L.cs / 280), roar, "#a81414", "#e7a93a"); ctx.globalAlpha = 1;
    },
  });
})();
