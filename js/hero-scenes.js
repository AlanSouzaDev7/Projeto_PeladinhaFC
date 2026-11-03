/* ==========================================================================
   PLACAR — aparições dos escudos em tela cheia (canvas)
   Motor de cena: cuida do tamanho, da nitidez em telas retina, do laço de
   animação, de pausar fora da tela e da paralaxe com o mouse. Cada clube
   registra a sua cena em HERO_SCENES.register(id, fábrica).
   ========================================================================== */
(() => {
  const registry = {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- utilidades de animação ---------- */
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const span = (t, a, b) => clamp((t - a) / (b - a)); // progresso 0→1 entre a e b
  const ease = {
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
    out: (t) => 1 - (1 - t) ** 3,
    outBack: (t) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const bez = (p0, p1, p2, t) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2;

  /* ---------- palco ---------- */
  class Stage {
    constructor(canvas, factory, club) {
      this.c = canvas; this.ctx = canvas.getContext("2d"); this.club = club;
      this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      // "?cena=8" abre a animação já no segundo 8 (útil para conferir e fotografar)
      const skip = +new URLSearchParams(location.search).get("cena") || 0;
      this.t0 = performance.now() - skip * 1000; this.visible = true; this.alive = true;
      this.resize();
      this.scene = factory(this);
      this.ro = new ResizeObserver(() => { this.resize(); this.scene.resize && this.scene.resize(); });
      this.ro.observe(canvas);
      this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.loop(); });
      this.io.observe(canvas);
      const host = canvas.closest(".hero") || canvas;
      this.onMove = (e) => { const b = host.getBoundingClientRect(); this.mouse.tx = (e.clientX - b.left) / b.width - 0.5; this.mouse.ty = (e.clientY - b.top) / b.height - 0.5; };
      host.addEventListener("pointermove", this.onMove);
      host.addEventListener("click", (e) => { if (!e.target.closest("a,button")) this.replay(); });
      if (reduced) { this.draw(99); } else this.loop();
    }
    resize() {
      const r = this.c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.dpr = dpr;
      this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
      // mudar o tamanho apaga o canvas: redesenha na hora para não piscar
      if (this.scene) this.draw(reduced ? 99 : (performance.now() - this.t0) / 1000);
    }
    replay() { this.t0 = performance.now(); this.scene.replay && this.scene.replay(); }
    draw(t) {
      const { ctx } = this;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.mouse.x = lerp(this.mouse.x, this.mouse.tx, 0.05);
      this.mouse.y = lerp(this.mouse.y, this.mouse.ty, 0.05);
      this.scene.frame(t, ctx);
    }
    loop() {
      clearTimeout(this.idle);
      if (this.raf || !this.alive) return;
      const tick = (now) => {
        this.raf = null;
        if (!this.alive || !this.c.isConnected) return this.destroy();
        // fora da tela: confere de novo daqui a pouco em vez de depender só do observador
        if (!this.visible || document.hidden) { this.idle = setTimeout(() => this.loop(), 400); return; }
        this.draw((now - this.t0) / 1000);
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
    destroy() { this.alive = false; this.ro.disconnect(); this.io.disconnect(); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) stages.forEach((s) => s.loop()); });
  const stages = new Set();

  function mount(root = document) {
    stages.forEach((s) => { if (!s.c.isConnected) { s.destroy(); stages.delete(s); } });
    root.querySelectorAll("canvas[data-hero-scene]").forEach((c) => {
      if (c.__stage) return;
      const id = c.dataset.heroScene, f = registry[id];
      if (!f) return;
      c.__stage = new Stage(c, f, window.PD.byId[id]);
      stages.add(c.__stage);
    });
  }

  window.HERO_SCENES = {
    register: (id, f) => (registry[id] = f),
    has: (id) => !!registry[id],
    mount,
    kit: { clamp, lerp, span, ease, rand, bez },
  };
})();

/* ==========================================================================
   Cruzeiro — "Cruzeiro do Sul"
   Noite sobre Belo Horizonte. A câmera atravessa a Via Láctea até a
   constelação do Cruzeiro do Sul; as linhas da cruz são traçadas, as cinco
   estrelas voam até as posições das estrelas do escudo e o escudo se forma.
   ========================================================================== */
HERO_SCENES.register("cruzeiro", (st) => {
  const { clamp, lerp, span, ease, rand, bez } = HERO_SCENES.kit;
  const R = rand(1921);
  const crest = new Image();
  crest.src = st.club.logo;

  // estrelas do céu em 3 profundidades (coordenadas de "mundo" 0–1, maiores que a tela)
  const layers = [
    { n: 900, depth: 0.25, size: [0.3, 0.9], alpha: 0.55 },
    { n: 260, depth: 0.55, size: [0.6, 1.4], alpha: 0.8 },
    { n: 70, depth: 1, size: [1, 2.2], alpha: 1 },
  ].map((L) => ({ ...L, stars: Array.from({ length: L.n }, () => ({
    x: R() * 1.6 - 0.3, y: R() * 1.3 - 0.25, r: lerp(L.size[0], L.size[1], R() ** 2),
    ph: R() * Math.PI * 2, sp: 0.6 + R() * 2.2, hue: R() < 0.15 ? "255,214,170" : R() < 0.3 ? "190,210,255" : "255,255,255",
  })) }));

  // Cruzeiro do Sul (posições relativas, parecidas com o céu real)
  const SC = { x: 0.62, y: 0.38 }; // centro da constelação no "mundo"
  const cross = [
    { name: "Gacrux", dx: 0.0, dy: -1.0, r: 4.2, col: "255,196,150", to: [0.49, 0.27] },
    { name: "Mimosa", dx: -0.78, dy: 0.06, r: 4.4, col: "200,220,255", to: [0.31, 0.445] },
    { name: "Delta", dx: 0.62, dy: -0.2, r: 3.3, col: "215,228,255", to: [0.69, 0.445] },
    { name: "Épsilon", dx: 0.3, dy: 0.42, r: 2.3, col: "255,236,210", to: [0.56, 0.515] },
    { name: "Acrux", dx: 0.08, dy: 1.0, r: 5, col: "205,225,255", to: [0.51, 0.73] },
  ];

  // Via Láctea pré-desenhada numa tela fora da vista (desenha uma vez, usa sempre)
  let milky = null;
  function buildMilky() {
    const W = Math.round(st.w * 1.6), H = Math.round(st.h * 1.4);
    milky = document.createElement("canvas"); milky.width = W; milky.height = H;
    const m = milky.getContext("2d"), r = rand(7);
    m.translate(W * 0.5, H * 0.52); m.rotate(-0.42); m.translate(-W * 0.5, -H * 0.52);
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = H * 0.52 + (r() - 0.5) * H * 0.34 * (0.6 + r());
      const rad = 30 + r() * 140, g = m.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.5 ? "120,150,255" : r() < 0.7 ? "190,140,255" : "160,200,255";
      g.addColorStop(0, `rgba(${c},${0.05 + r() * 0.06})`); g.addColorStop(1, `rgba(${c},0)`);
      m.fillStyle = g; m.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 40; i++) { // poeira escura que recorta a faixa
      const x = r() * W, y = H * 0.52 + (r() - 0.5) * H * 0.14, rad = 20 + r() * 60;
      const g = m.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(2,6,24,.35)"); g.addColorStop(1, "rgba(2,6,24,0)");
      m.fillStyle = g; m.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 2600; i++) {
      const x = r() * W, y = H * 0.52 + (r() - 0.5) * H * 0.3 * r() * 1.6;
      m.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`; m.fillRect(x, y, r() < 0.9 ? 0.8 : 1.4, r() < 0.9 ? 0.8 : 1.4);
    }
  }
  buildMilky();

  // montanhas de BH (Serra do Curral) em duas camadas + luzes da cidade
  function ridge(seed, base, amp, n) {
    const r = rand(seed), pts = [];
    for (let i = 0; i <= n; i++) pts.push([i / n, base - amp * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + r() * 2))) * (0.6 + r() * 0.4)]);
    return pts;
  }
  const far = ridge(31, 0.86, 0.12, 14), near = ridge(57, 0.93, 0.08, 18);
  const lights = Array.from({ length: 140 }, () => ({ x: R(), y: 0.9 + R() * 0.1, ph: R() * 6, c: R() < 0.7 ? "255,214,140" : "170,200,255" }));
  const shooting = [];
  let nextShoot = 6;

  function drawRidge(ctx, pts, color, dx) {
    const { w, h } = st;
    ctx.beginPath(); ctx.moveTo(-20, h);
    pts.forEach(([x, y], i) => {
      const px = x * (w + 40) - 20 + dx, py = y * h;
      if (!i) ctx.lineTo(px, py);
      else { const [x0, y0] = pts[i - 1]; const mx = ((x0 + x) / 2) * (w + 40) - 20 + dx; ctx.quadraticCurveTo(x0 * (w + 40) - 20 + dx, y0 * h, mx, (y0 * h + py) / 2); }
    });
    ctx.lineTo(w + 20, h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  // estrela "desenhada": brilho suave + cruz de luz de quatro pontas
  function sparkle(ctx, x, y, r, col, a, rot = 0) {
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
    g.addColorStop(0, `rgba(${col},${0.55 * a})`); g.addColorStop(0.25, `rgba(${col},${0.18 * a})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 7, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = `rgba(255,255,255,${a})`;
    for (let k = 0; k < 2; k++) { ctx.rotate(Math.PI / 2 * k); ctx.beginPath(); ctx.moveTo(-r * 4, 0); ctx.quadraticCurveTo(0, -r * 0.35, r * 4, 0); ctx.quadraticCurveTo(0, r * 0.35, -r * 4, 0); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 7); ctx.fill(); ctx.restore();
  }

  const scene = {
    resize: buildMilky,
    replay() { shooting.length = 0; nextShoot = 6; },
    frame(t, ctx) {
      const { w, h, mouse } = st;
      // linha do tempo (segundos)
      const tCam = ease.inOut(span(t, 0, 4.2));       // câmera viaja até a constelação
      const tGlow = ease.out(span(t, 1.2, 2.6));      // estrelas da cruz acendem
      const tLine = ease.inOutSine(span(t, 2.4, 3.6)); // linhas da cruz são traçadas
      const tFly = ease.inOut(span(t, 3.9, 5.2));     // estrelas voam para o escudo
      const tCrest = ease.outBack(span(t, 4.9, 6.0)); // escudo aparece
      const tIdle = Math.max(0, t - 6);

      // onde o escudo fica na tela (lado direito do topo)
      const cs = Math.min(h * 0.56, w * 0.28), cx = w - Math.max(cs * 0.8, w * 0.17), cy = h * 0.46;
      // câmera: começa aberta e vai fechando no Cruzeiro do Sul, que termina sobre o escudo
      const zoom = lerp(0.85, 1.45, tCam);
      const scale = Math.min(w, h * 1.6) * 0.16 * lerp(1, 1.15, tCam); // tamanho da cruz em px
      const scWorld = { x: SC.x * w, y: SC.y * h };
      const camEnd = { x: scWorld.x - (cx - w / 2) / 1.45, y: scWorld.y - (cy - h / 2) / 1.45 };
      const cam = { x: lerp(w * 0.38, camEnd.x, tCam) + mouse.x * 30 + Math.sin(tIdle * 0.15) * 6, y: lerp(h * 0.62, camEnd.y, tCam) + mouse.y * 18 };
      const toScreen = (wx, wy, depth) => [(wx - cam.x) * zoom * (0.6 + 0.4 * depth) + w / 2, (wy - cam.y) * zoom * (0.6 + 0.4 * depth) + h / 2];

      // céu
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#01030d"); sky.addColorStop(0.55, "#041243"); sky.addColorStop(1, "#0b2f86");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, cs * 1.6);
      halo.addColorStop(0, `rgba(80,130,255,${0.18 + 0.2 * tGlow})`); halo.addColorStop(1, "rgba(80,130,255,0)");
      ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);

      // Via Láctea (paralaxe lenta)
      const [mx, my] = toScreen(-0.3 * w, -0.2 * h, 0.35);
      ctx.globalAlpha = 0.9; ctx.drawImage(milky, mx, my, milky.width * zoom * 0.74, milky.height * zoom * 0.74); ctx.globalAlpha = 1;

      // estrelas de fundo, cintilando
      for (const L of layers) {
        for (const s of L.stars) {
          const [x, y] = toScreen(s.x * w, s.y * h, L.depth);
          if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
          const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
          const a = L.alpha * tw * clamp(t * 1.5 - s.ph * 0.05);
          const r = s.r * (0.8 + zoom * 0.25);
          ctx.fillStyle = `rgba(${s.hue},${a})`;
          if (r < 1.3) ctx.fillRect(x, y, r, r); else { ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, 7); ctx.fill(); }
          if (L.depth === 1 && r > 1.8) sparkle(ctx, x, y, r * 0.45, s.hue, a * 0.5);
        }
      }

      // estrelas cadentes de vez em quando
      if (t > nextShoot) { shooting.push({ x: Math.random() * w * 0.7, y: Math.random() * h * 0.35, t: t, ang: 0.45 + Math.random() * 0.3, len: 120 + Math.random() * 120 }); nextShoot = t + 5 + Math.random() * 6; }
      for (let i = shooting.length - 1; i >= 0; i--) {
        const s = shooting[i], k = (t - s.t) / 1.1;
        if (k > 1) { shooting.splice(i, 1); continue; }
        const x = s.x + Math.cos(s.ang) * s.len * 2 * k, y = s.y + Math.sin(s.ang) * s.len * 2 * k;
        const g = ctx.createLinearGradient(x, y, x - Math.cos(s.ang) * s.len, y - Math.sin(s.ang) * s.len);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(s.ang) * s.len, y - Math.sin(s.ang) * s.len); ctx.stroke();
      }

      // montanhas e luzes da cidade
      drawRidge(ctx, far, "rgba(6,22,70,.95)", mouse.x * -10);
      for (const L of lights) {
        const a = 0.35 + 0.35 * Math.sin(t * 2 + L.ph);
        ctx.fillStyle = `rgba(${L.c},${a})`; ctx.fillRect(L.x * w + mouse.x * -14, L.y * h, 1.6, 1.6);
      }
      drawRidge(ctx, near, "#020a24", mouse.x * -18);

      // posições das 5 estrelas: no céu → nas estrelas do escudo
      const pts = cross.map((s, i) => {
        const [sx, sy] = toScreen(scWorld.x + s.dx * scale, scWorld.y + s.dy * scale, 1);
        const tx = cx + (s.to[0] - 0.5) * cs, ty = cy + (s.to[1] - 0.5) * cs;
        const k = clamp(tFly * 1.15 - i * 0.04);
        const midx = (sx + tx) / 2 + (i % 2 ? -1 : 1) * cs * 0.18, midy = (sy + ty) / 2 - cs * 0.12;
        return { x: bez(sx, midx, tx, k), y: bez(sy, midy, ty, k), k, s };
      });

      // linhas da cruz, com traço levemente "à mão"
      const lineA = clamp(tLine) * (1 - tFly);
      if (lineA > 0.01) {
        ctx.strokeStyle = `rgba(170,200,255,${0.75 * lineA})`; ctx.lineWidth = 1.6; ctx.lineCap = "round"; ctx.setLineDash([6, 5]);
        [[0, 4], [1, 2]].forEach(([a, b]) => {
          const A = pts[a], B = pts[b], ex = lerp(A.x, B.x, tLine), ey = lerp(A.y, B.y, tLine);
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo((A.x + ex) / 2 + 3, (A.y + ey) / 2 - 3, ex, ey); ctx.stroke();
        });
        ctx.setLineDash([]);
        if (tLine > 0.6) { // nome da constelação escrito no céu
          ctx.fillStyle = `rgba(200,220,255,${(tLine - 0.6) * 2 * (1 - tFly)})`;
          ctx.font = `700 ${Math.max(11, cs * 0.06)}px Archivo, sans-serif`; ctx.textAlign = "center";
          ctx.fillText("CRUZEIRO DO SUL", pts[4].x, pts[4].y + cs * 0.18);
        }
      }

      // anel do escudo é desenhado enquanto as estrelas chegam
      const ring = ease.inOut(span(t, 4.3, 5.4));
      if (ring > 0 && crest.complete) {
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - tCrest)})`; ctx.lineWidth = Math.max(2, cs * 0.02);
        ctx.beginPath(); ctx.arc(cx, cy, cs * 0.47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring); ctx.stroke();
      }

      // escudo oficial
      if (tCrest > 0 && crest.complete && crest.naturalWidth) {
        const k = clamp(tCrest, 0, 1.2), bob = Math.sin(tIdle * 1.1) * cs * 0.012;
        ctx.save(); ctx.globalAlpha = clamp(span(t, 4.9, 5.5));
        const glow = ctx.createRadialGradient(cx, cy, cs * 0.3, cx, cy, cs * 0.9);
        glow.addColorStop(0, "rgba(120,170,255,.35)"); glow.addColorStop(1, "rgba(120,170,255,0)");
        ctx.fillStyle = glow; ctx.fillRect(cx - cs, cy - cs, cs * 2, cs * 2);
        ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = cs * 0.08; ctx.shadowOffsetY = cs * 0.03;
        const sz = cs * k; ctx.drawImage(crest, cx - sz / 2, cy - sz / 2 + bob, sz, sz);
        ctx.restore();
        // onda de luz ao formar
        const wave = span(t, 5.0, 6.2);
        if (wave > 0 && wave < 1) {
          ctx.strokeStyle = `rgba(200,220,255,${0.6 * (1 - wave)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, cs * (0.5 + wave * 0.6), 0, 7); ctx.stroke();
        }
      }

      // as cinco estrelas (por cima de tudo até o escudo assumir)
      pts.forEach(({ x, y, k, s }, i) => {
        const a = tGlow * (1 - clamp(span(t, 5.2, 5.9)));
        const r = lerp(s.r, cs * 0.012, k) * (1 + 0.08 * Math.sin(t * 3 + i));
        sparkle(ctx, x, y, r, s.col, a, t * 0.3 + i);
      });

      // véu à esquerda para o texto continuar legível
      const veil = ctx.createLinearGradient(0, 0, w * 0.6, 0);
      veil.addColorStop(0, "rgba(1,6,30,.75)"); veil.addColorStop(1, "rgba(1,6,30,0)");
      ctx.fillStyle = veil; ctx.fillRect(0, 0, w, h);
    },
  };
  return scene;
});
