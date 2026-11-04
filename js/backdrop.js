/* ==========================================================================
   PLACAR — fundo vivo
   Fundo escuro com brilho nas bordas (canto de cima à direita e de baixo à esquerda) nas cores do site
   ou do clube aberto, e uma grade de pontinhos: discretos no meio da tela (onde fica o conteúdo) e
   acesos, na cor do clube, perto dos brilhos. No computador, os pontinhos também acendem em volta do mouse.

   Desempenho: o fundo é desenhado uma vez numa imagem (canvas) e só é redesenhado quando muda o
   tamanho da tela, o tema ou o clube. O brilho do mouse é uma peça pequena que só muda de lugar.
   ========================================================================== */
(() => {
  const root = document.documentElement;
  const bd = document.querySelector(".backdrop");
  if (!bd) return;
  const spot = document.createElement("div");
  spot.className = "backdrop-spot";
  bd.appendChild(spot);

  const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();
  // cor CSS qualquer (#hex, rgb(), var()) -> [r, g, b]
  const probe = document.createElement("i");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const rgb = (c) => { probe.style.color = c; const m = getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]; return m.slice(0, 3).map(Number); };
  const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
  // garante brilho visível no escuro mesmo com cor de clube muito escura (ex.: preto do Botafogo)
  const lift = (c, min) => { const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; if (l >= min) return c; const k = (min - l) / (255 - l || 1); return c.map((v) => Math.round(v + (255 - v) * k)); };

  let last = "", paints = 0;
  function paint() {
    const w = innerWidth, h = innerHeight, light = root.dataset.theme === "light";
    const c1 = lift(rgb(css("--c1") || "#4f6bff"), light ? 0 : 70), c3 = lift(rgb(css("--c3") || "#8a9bff"), light ? 0 : 70), tx = rgb(css("--text") || "#e8edf6");
    const key = [w, h, light, c1, c3, tx].join("|");
    if (key === last) return;
    last = key;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const R = Math.max(w, h);
    g.fillStyle = css("--bg") || "#0b0f17"; // fundo opaco: a imagem pode ir em JPEG (bem mais leve que PNG)
    g.fillRect(0, 0, w, h);
    // brilhos nas bordas
    const glow = (x, y, r, c, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.55, rgba(c, a * 0.35)); gr.addColorStop(1, rgba(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
    glow(w * 1.02, -h * 0.06, R * 0.62, c1, light ? 0.2 : 0.42);
    glow(-w * 0.04, h * 1.06, R * 0.55, c3, light ? 0.14 : 0.3);
    glow(w, h, R * 0.35, c1, light ? 0.05 : 0.1);
    // pontinhos: a força de cada um vem da distância até os brilhos
    const step = w < 720 ? 18 : 22, off = step / 2;
    const d1 = R * 0.55, d2 = R * 0.48;
    for (let y = off; y < h; y += step) {
      for (let x = off; x < w; x += step) {
        const a = Math.max(0, 1 - Math.hypot(w - x, y) / d1), b = Math.max(0, 1 - Math.hypot(x, h - y) / d2) * 0.85;
        const lit = Math.max(a, b) ** 1.6;
        // meio da tela mais calmo; bordas um pouco mais marcadas
        const edge = Math.min(1, Math.hypot((x - w / 2) / (w / 2), (y - h * 0.45) / (h / 2)) * 0.9 + 0.25);
        const base = (light ? 0.13 : 0.085) * edge;
        if (lit > 0.04) {
          const c = lit > 0.5 ? c1.map((v, i) => Math.round(v * 0.75 + tx[i] * 0.25)) : (a >= b ? c1 : c3);
          g.fillStyle = rgba(c, Math.min(0.95, base + lit * (light ? 0.7 : 0.85)));
          g.beginPath(); g.arc(x, y, 1.05 + lit * 0.55, 0, 6.2832); g.fill();
        } else {
          g.fillStyle = rgba(tx, base);
          g.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
        }
      }
    }
    // a imagem é gerada em segundo plano: só vale o desenho mais recente (um antigo, de outro tema, não pode chegar depois)
    const seq = ++paints;
    cv.toBlob((blob) => {
      if (!blob || seq !== paints) return;
      const url = URL.createObjectURL(blob), old = bd.dataset.url;
      bd.style.backgroundImage = `url(${url})`;
      bd.dataset.url = url;
      bd.classList.add("painted");
      if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
    }, "image/jpeg", 0.9);
    spot.style.setProperty("--step", step + "px");
  }

  let t = 0;
  const later = (ms = 120) => { clearTimeout(t); t = setTimeout(paint, ms); };
  paint();
  addEventListener("resize", () => later(200), { passive: true });
  // tema claro/escuro e cores do clube (aplicadas no :root pelo app)
  new MutationObserver(() => later(60)).observe(root, { attributes: true, attributeFilter: ["style", "data-theme"] });

  // mouse: pontinhos acesos em volta do ponteiro (só computador com mouse, sem "reduzir movimento")
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("estatico");
  if (still || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  let x = 0, y = 0, raf = 0;
  addEventListener("pointermove", (e) => {
    x = e.clientX; y = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const s = parseFloat(spot.style.getPropertyValue("--step")) || 22, half = 160;
      spot.style.transform = `translate(${x - half}px, ${y - half}px)`;
      // alinha os pontinhos da peça com a grade do fundo
      spot.style.backgroundPosition = `${(((s / 2 - (x - half)) % s) + s) % s}px ${(((s / 2 - (y - half)) % s) + s) % s}px`;
      spot.classList.add("on");
    });
  }, { passive: true });
  document.addEventListener("pointerleave", () => spot.classList.remove("on"));
})();
