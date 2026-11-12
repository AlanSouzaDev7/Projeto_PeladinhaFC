/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — gráficos gerados: escudos, camisas e padrões de fundo.
   Tudo é desenhado a partir das cores do clube; nenhum escudo oficial é usado.
   ========================================================================== */
(() => {
  let uid = 0;

  /* ---------- cor ---------- */
  const hex = (h) => h.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255);
  const lum = (h) => {
    const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const onColor = (h) => (lum(h) > 0.45 ? "#111111" : "#ffffff");
  const shade = (h, k) => {
    const [r, g, b] = hex(h).map((c) => Math.round(Math.max(0, Math.min(1, c * k)) * 255));
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };
  /* cor que aparece bem sobre o fundo atual (evita preto no escuro / branco no claro) */
  const display = (club) => {
    const light = document.documentElement.dataset.theme === "light";
    const [c1, c2, c3] = club.colors;
    const l = lum(c1);
    if (!light && l < 0.03) return lum(c3) > 0.03 && c3 !== "#ffffff" ? c3 : c2;
    if (light && l > 0.8) return lum(c2) < 0.8 ? c2 : c3;
    return c1;
  };

  /* ---------- padrão da camisa como CSS ---------- */
  function kitBg(club) {
    const [a, b, c] = club.colors;
    switch (club.kit) {
      case "vstripes":
        return `repeating-linear-gradient(90deg, ${a} 0 38px, ${b} 38px 76px)`;
      case "vstripes3":
        return `repeating-linear-gradient(90deg, ${a} 0 34px, ${c} 34px 40px, ${b} 40px 74px, ${c} 74px 80px)`;
      case "hoops":
        return `repeating-linear-gradient(180deg, ${a} 0 34px, ${b} 34px 68px)`;
      case "sash":
        return `linear-gradient(125deg, ${a} 0 38%, ${b} 38% 52%, ${a} 52%)`;
      case "band":
        return `linear-gradient(180deg, ${a} 0 40%, ${b} 40% 48%, ${a} 48% 50%, ${c} 50% 58%, ${a} 58%)`;
      case "tri":
        return `linear-gradient(115deg, ${c} 0 40%, ${a} 40% 60%, ${b} 60%)`;
      default:
        return `repeating-linear-gradient(135deg, ${a} 0 22px, ${shade(a, a === "#ffffff" ? 0.94 : 0.86)} 22px 44px)`;
    }
  }

  /* ---------- padrão da camisa como SVG (dentro de um clip) ---------- */
  function kitRects(club, w, h) {
    const [a, b, c] = club.colors;
    let s = `<rect width="${w}" height="${h}" fill="${a}"/>`;
    if (club.kit === "vstripes") for (let x = w / 14; x < w; x += w / 7) s += `<rect x="${x}" width="${w / 14}" height="${h}" fill="${b}"/>`;
    if (club.kit === "vstripes3") for (let x = w / 14; x < w; x += w / 7) s += `<rect x="${x - 2}" width="${w / 14 + 4}" height="${h}" fill="${c}"/><rect x="${x}" width="${w / 14}" height="${h}" fill="${b}"/>`;
    if (club.kit === "hoops") for (let y = h / 16; y < h; y += h / 8) s += `<rect y="${y}" width="${w}" height="${h / 16}" fill="${b}"/>`;
    if (club.kit === "sash") s += `<path d="M${w * 0.18} 0 L${w * 0.42} 0 L${w * 0.9} ${h} L${w * 0.66} ${h} Z" fill="${b}"/>`;
    if (club.kit === "band") s += `<rect y="${h * 0.38}" width="${w}" height="${h * 0.07}" fill="${b}"/><rect y="${h * 0.46}" width="${w}" height="${h * 0.07}" fill="${c}"/>`;
    if (club.kit === "tri") s += `<rect width="${w}" height="${h}" fill="${c}"/><path d="M${w * 0.35} 0 L${w * 0.6} 0 L${w * 0.45} ${h} L${w * 0.2} ${h} Z" fill="${a}"/><path d="M${w * 0.6} 0 L${w} 0 L${w} ${h} L${w * 0.45} ${h} Z" fill="${b}"/>`;
    return s;
  }

  /* ---------- escudo oficial (imagem) com o desenho próprio como reserva ---------- */
  function crest(club, size = 28, vt = false) {
    if (!club.logo) return svgCrest(club, size, vt);
    const style = vt ? ` style="view-transition-name: crest-${club.id}"` : "";
    // escudos pequenos (listas) usam a miniatura de 120 px da Wikimedia: ~5 KB em vez de ~50 KB
    const src = size <= 56 ? club.logo.replace("/330px-", "/120px-") : club.logo;
    return `<img class="crest" src="${src}" alt="Escudo do ${club.name}" width="${size}" height="${size}" loading="lazy" decoding="async" data-club="${club.id}" data-size="${size}"${vt ? " data-vt" : ""}${style}/>`;
  }
  /* ---------- escudo de outro time (adversário fora da Série A: estaduais, copas, Libertadores) ----------
     Com o escudo da ESPN, a imagem; sem ele (a ESPN não tem o de muitos times pequenos: Pouso Alegre, Betim,
     Noroeste, Maricá...) ou se a imagem falhar, um escudo desenhado com as iniciais do time e uma cor própria. */
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const PEQ = new Set(["ec", "fc", "sc", "ac", "cr", "ca", "aa", "ad", "ce", "cs", "de", "do", "da", "dos", "das", "e", "clube", "esporte", "esportivo", "futebol", "club", "sport", "atletico"]);
  function iniciais(nome) {
    const w = String(nome || "?").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 -]/g, " ").split(/[\s-]+/).filter(Boolean);
    const fortes = w.filter((x) => !PEQ.has(x.toLowerCase()));
    const base = fortes.length ? fortes : w;
    if (!base.length) return "?";
    return (base.length === 1 ? base[0].slice(0, 3) : base[0][0] + base[1][0] + (base[2] ? base[2][0] : "")).toUpperCase().slice(0, 3);
  }
  // escudo desenhado: escudo clássico em duas cores (as do clube, se o Wikidata tiver; senão, um par tirado do nome),
  // faixa diagonal e as iniciais em letra de camisa
  function iniCrest(nome, size = 28, cores = null) {
    let h = 0; for (const ch of String(nome || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const ok = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
    const cs = Array.isArray(cores) ? cores.filter(ok) : [];
    const cor = cs[0] && lum(cs[0]) < 0.85 ? cs[0] : cs[1] && lum(cs[1]) < 0.85 ? cs[1] : `hsl(${h % 360} 52% 34%)`;
    const cor2 = cs.find((c) => c !== cor) || `hsl(${(h >> 9) % 360} 60% 60%)`;
    const txt = lum(cor.startsWith("#") ? cor : "#333333") > 0.55 ? "#111" : "#fff", ini = iniciais(nome);
    const id = `ic${++uid}`, shape = "M20 1.5 L38 6 V21 C38 33.5 30.5 41 20 45 C9.5 41 2 33.5 2 21 V6 Z";
    return `<svg class="crest crest-ini" width="${size}" height="${size}" viewBox="0 -1 40 48" role="img" aria-label="${esc(nome)} (escudo desenhado pelo site)">
      <defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>
      <g clip-path="url(#${id})"><rect width="40" height="48" fill="${cor}"/><path d="M-4 34 L44 14 V22 L-4 42 Z" fill="${cor2}"/><rect width="40" height="22" fill="#fff" opacity=".08"/></g>
      <path d="${shape}" fill="none" stroke="${cor2}" stroke-width="2.2"/>
      <text x="20" y="${ini.length > 2 ? 22.5 : 23.5}" text-anchor="middle" font-family="var(--font-label), sans-serif" font-weight="800" font-size="${ini.length > 2 ? 11 : 13.5}" fill="${txt}" paint-order="stroke" stroke="${cor}" stroke-width="1.2">${esc(ini)}</text></svg>`;
  }
  // imagens aceitas: ESPN, Wikimedia Commons (só livres) e API-Football
  const LOGO_OK = /^https:\/\/(a\.espncdn\.com|upload\.wikimedia\.org\/wikipedia\/commons|media\.api-sports\.io)\//;
  function crestOutro(nome, logo, size = 28, cores = null) {
    if (logo && LOGO_OK.test(logo)) return `<img class="crest" src="${esc(logo)}" alt="Escudo do ${esc(nome)}" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-nome="${esc(nome)}" data-size="${size}"/>`;
    return iniCrest(nome, size, cores);
  }
  // se a imagem não carregar (sem internet, link quebrado), troca pelo escudo desenhado
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.nome != null && img.classList.contains("crest")) { img.outerHTML = iniCrest(img.dataset.nome, +img.dataset.size || 28); return; }
    if (!(img instanceof HTMLImageElement) || !img.dataset.club) return;
    const club = window.PD.byId[img.dataset.club];
    img.outerHTML = svgCrest(club, +img.dataset.size, img.hasAttribute("data-vt"));
  }, true);

  /* ---------- escudo desenhado ---------- */
  function svgCrest(club, size = 28, vt = false) {
    const id = `cr${++uid}`;
    const [a, b] = club.colors;
    const edge = lum(a) > 0.8 ? "#111111" : b;
    const shape = "M20 1.5 L38 6 V21 C38 33.5 30.5 41 20 45 C9.5 41 2 33.5 2 21 V6 Z";
    const style = vt ? ` style="view-transition-name: crest-${club.id}"` : "";
    return `<svg class="crest" width="${size}" height="${size * 1.15}" viewBox="0 0 40 46" aria-hidden="true"${style}>
      <defs><clipPath id="${id}"><path d="${shape}"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <g clip-path="url(#${id})">${kitRects(club, 40, 46)}
        <rect x="0" y="13" width="40" height="13" fill="${lum(a) > 0.8 ? "#111" : "rgba(0,0,0,.55)"}"/>
        <rect width="40" height="46" fill="url(#${id}g)"/></g>
      <path d="${shape}" fill="none" stroke="${edge}" stroke-width="2.4"/>
      <text x="20" y="23.4" text-anchor="middle" font-family="Saira, sans-serif" font-weight="900" font-size="10" font-stretch="75%" fill="#fff" letter-spacing=".4">${club.short}</text>
    </svg>`;
  }

  /* ---------- camisa ---------- */
  function jersey(club, cls = "jersey") {
    const id = `js${++uid}`;
    const [a, b] = club.colors;
    const trim = lum(a) > 0.8 ? club.colors[1] : b;
    const body = "M62 12 L84 4 Q100 20 116 4 L138 12 L192 44 L172 92 L148 80 L148 206 Q100 214 52 206 L52 80 L28 92 L8 44 Z";
    return `<svg class="${cls}" viewBox="0 0 200 216" aria-hidden="true">
      <defs><clipPath id="${id}"><path d="${body}"/></clipPath>
        <linearGradient id="${id}s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".3" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>
      <g clip-path="url(#${id})">${kitRects(club, 200, 216)}
        <path d="M8 44 L28 92 L52 80 L52 70 Z M192 44 L172 92 L148 80 L148 70 Z" fill="${trim}" opacity=".9"/>
        <rect width="200" height="216" fill="url(#${id}s)"/></g>
      <path d="M84 4 Q100 26 116 4" fill="none" stroke="${trim}" stroke-width="6" stroke-linecap="round"/>
      <path d="${body}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>
      ${club.logo ? `<image href="${club.logo}" x="116" y="48" width="22" height="22" preserveAspectRatio="xMidYMid meet"/>` : `<g transform="translate(118 50)">${svgCrest(club, 20).replace('class="crest"', "")}</g>`}
    </svg>`;
  }

  /* ---------- bandeira do Brasil (simplificada) ---------- */
  const flagBR = `<svg class="flag" viewBox="0 0 20 14"><rect width="20" height="14" fill="#009c3b"/><path d="M10 1.5 18.5 7 10 12.5 1.5 7z" fill="#ffdf00"/><circle cx="10" cy="7" r="3.1" fill="#002776"/></svg>`;

  /* ---------- foto de jogador num círculo, com o rosto no centro ----------
     foto.rosto = [x, y, lado_x, lado_y]: o quadrado em volta do rosto (frações da imagem, achado pelo robô com a OpenCV).
     A imagem é ampliada e deslocada para esse quadrado encher o círculo. Sem o rosto, recorte padrão (um pouco acima do centro). */
  function fotoImg(foto, alt = "") {
    const r = Array.isArray(foto?.rosto) && foto.rosto.length === 4 && foto.rosto.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) && foto.rosto[2] > 0.05 && foto.rosto[3] > 0.05 ? foto.rosto : null;
    // carregamento imediato: são poucas fotos por página, e o adiado (lazy) não dispara nos círculos pequenos das listas
    const base = `src="${esc(foto.url)}" alt="${esc(alt)}" decoding="async" referrerpolicy="no-referrer"`;
    if (!r) return `<img class="foto-p${foto.privada ? " priv" : ""}" ${base} />`;
    const [x, y, sx, sy] = r, pc = (v) => `${(v * 100).toFixed(2)}%`;
    return `<img class="foto-r" ${base} style="width:${pc(1 / sx)};height:${pc(1 / sy)};left:${pc(-x / sx)};top:${pc(-y / sy)}" />`;
  }

  window.GFX = { crest, crestOutro, iniCrest, fotoImg, svgCrest, jersey, kitBg, kitRects, onColor, lum, shade, display, flagBR };
})();
