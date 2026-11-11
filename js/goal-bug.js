/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — "GOL!" de cada clube no placar de transmissão
   A aparição do topo do clube imita um pacote de TV: o placar neutro (0 · 0),
   a faixa do clube entra com a sigla, o escudo salta, e o "GOL!" se monta com
   o símbolo do clube no lugar do "O" (a raposa do Cruzeiro, o urubu do
   Flamengo, a estrela do Botafogo…). Uma varredura limpa a faixa, o placar
   vira 1 · 0 e a faixa do gol volta para ficar. A frase do clube fica embaixo.

   Ilustrações próprias, em SVG, nas cores de cada clube; o escudo é a imagem
   oficial. Os símbolos seguem os mascotes e emblemas que os clubes usam
   (conferidos no LANCE!, ge e nas páginas oficiais dos clubes).
   ========================================================================== */
(() => {
  const TAU = Math.PI * 2;
  const f = (n) => +n.toFixed(1);

  /* ---------- peças ---------- */
  function star(cx, cy, r, fill, extra = "") {
    const p = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r; p.push(`${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr)}`); }
    return `<polygon points="${p.join(" ")}" fill="${fill}" ${extra}/>`;
  }
  // listras que entram pela direita, uma de cada vez
  const vstripes = (colors, w = 14, x0 = 210, x1 = 372, skew = 0) => {
    let out = "", i = 0;
    for (let x = x0; x < x1; x += w, i++) out += `<rect class="dk" style="--k:${i % 6}" x="${x}" y="-4" width="${w + 0.6}" height="84" fill="${colors[i % colors.length]}" ${skew ? `transform="skewX(${skew})"` : ""}/>`;
    return out;
  };
  const hstripes = (colors, h = 12.7) => colors.map((c, i) => `<rect class="dk" style="--k:${i}" x="200" y="${f(i * h)}" width="170" height="${h + 0.4}" fill="${c}"/>`).join("");
  const diag = (colors, w = 22) => `<g transform="skewX(-28)">${colors.map((c, i) => `<rect class="dk" style="--k:${i}" x="${250 + i * w}" y="-4" width="${w + 0.5}" height="84" fill="${c}"/>`).join("")}</g>`;
  const waves = (color, y = 58, op = 1, k = 0) => `<path class="dk wv" style="--k:${k}" d="M190 ${y} q10 -7 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V80 H190 Z" fill="${color}" opacity="${op}"/>`;

  /* ---------- símbolos (no lugar do "O"), desenhados em volta de (0,0), ~48 px ---------- */
  const SYM = {
    // raposa: cabeça geométrica, orelhas em pé
    cruzeiro: `<path d="M-21 -20 L-7 -9 Q0 -11 7 -9 L21 -20 L19.5 -1 Q23 6 14 11 L4.5 17.5 Q0 21 -4.5 17.5 L-14 11 Q-23 6 -19.5 -1 Z" fill="#fff"/>
      <path d="M-17.5 -14.5 L-9 -7.5 L-16 -2.5 Z M17.5 -14.5 L9 -7.5 L16 -2.5 Z" fill="#5b8cff"/>
      <path d="M0 -9 L-5 1 L0 11 L5 1 Z" fill="#d6e2ff"/>
      <path d="M-14 -1 L-5 1.5 L-12 4 Z M14 -1 L5 1.5 L12 4 Z" fill="#0b1640"/>
      <path d="M-3.5 14 H3.5 L0 18.5 Z" fill="#0b1640"/>`,
    // urubu de asas abertas
    flamengo: `<g class="flap"><path d="M-5 -3 C-12 -13 -21 -15 -28 -11 L-24.5 -7.5 L-28 -5 L-23.5 -2 L-26 1 L-20.5 2.5 L-21.5 6 L-15 4.5 Q-9 6 -5 7 Z" fill="#111"/>
      <path d="M5 -3 C12 -13 21 -15 28 -11 L24.5 -7.5 L28 -5 L23.5 -2 L26 1 L20.5 2.5 L21.5 6 L15 4.5 Q9 6 5 7 Z" fill="#111"/></g>
      <ellipse cx="0" cy="5" rx="7" ry="11" fill="#111"/><path d="M-4 15 L0 22 L4 15 Z" fill="#111"/>
      <circle cx="0" cy="-8.5" r="5" fill="#3b3b3b"/><path d="M1 -7 L5.5 -4.5 L1.2 -3.5 Z" fill="#e8e8e8"/><circle cx="1.6" cy="-9.6" r="1.1" fill="#fff"/>`,
    // galo: cabeça de perfil com as penas do pescoço em camadas (preto e branco), crista serrilhada com volume,
    // barbela, bico dourado com narina e olho com brilho
    "atletico-mg": `<defs><linearGradient id="gbCr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a4f"/><stop offset="1" stop-color="#b3121b"/></linearGradient>
      <linearGradient id="gbBi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d27a"/><stop offset="1" stop-color="#b8892e"/></linearGradient></defs>
      <path d="M-16 23 C-19 10 -17 -2 -10 -9 C-4 -14 5 -15 11 -10 C14 -7 15 -4 14 0 C13 8 9 15 7 23 Z" fill="#111"/>
      ${[[-15, 21, -6, 6], [-13, 14, -4, -1], [-11, 7, -1, -6], [-8, 1, 3, -9]].map(([x1, y1, x2, y2], k) => `<path d="M${x1} ${y1} Q${(x1 + x2) / 2 - 4} ${(y1 + y2) / 2 + 3} ${x2} ${y2} Q${(x1 + x2) / 2 + 1} ${(y1 + y2) / 2 + 6} ${x1 + 3} ${y1 + 2} Z" fill="${k % 2 ? "#fff" : "#2a2a2a"}" opacity="${k % 2 ? 0.92 : 1}"/>`).join("")}
      <path d="M-14 23 L-12 16 L-9 23 L-6 15 L-3 23 L0 16 L3 23 Z" fill="#fff" opacity=".9"/>
      <path d="M-8 -9.5 C-11 -14 -9.5 -19 -6 -18.5 C-5.5 -23 -0.5 -24.5 1.5 -20 C3 -24.5 8 -24 8.5 -19 C11.5 -21 15 -18.5 13 -14 C14.5 -12.5 13.5 -10 11 -9.5 C5 -12.5 -2 -12.5 -8 -9.5 Z" fill="url(#gbCr)"/>
      <path d="M-5 -17 C-4 -19.5 -1 -20 0.5 -18 M3 -19.5 C4.5 -21 7 -20.5 7.5 -18.5" stroke="#ff9a9c" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M12 -2 C16.5 3 13.5 9.5 9.5 8 C7.5 6.5 8 1 9 -1 Z" fill="url(#gbCr)"/>
      <path d="M12 -8.5 L23 -5 L12.5 -1.8 C13 -4 13 -6.5 12 -8.5 Z" fill="url(#gbBi)"/><path d="M12.6 -5 L21 -4.6" stroke="#8a6420" stroke-width=".7"/>
      <circle cx="15.6" cy="-6.6" r=".7" fill="#6b4a14"/>
      <circle cx="5" cy="-6" r="3" fill="#f3b23a"/><circle cx="5.5" cy="-6" r="1.6" fill="#111"/><circle cx="6.1" cy="-6.7" r=".6" fill="#fff"/>
      <path d="M1.5 -9.5 C3.5 -11 7 -10.8 8.6 -8.8" stroke="#fff" stroke-width=".8" fill="none" opacity=".55"/>`,
    // furacão: três braços girando
    "athletico-pr": `<g class="spin">${[0, 120, 240].map((a) => `<path transform="rotate(${a})" d="M0 0 C2 -13 15 -19 26 -10 C15 -13 6 -7 4.5 3 Z" fill="#c8102e"/><path transform="rotate(${a + 60})" d="M0 0 C1.5 -9 10 -13 17 -8.5 C10 -9.5 4.5 -5 3.2 1.5 Z" fill="#fff" opacity=".9"/>`).join("")}<circle r="5.5" fill="#111" stroke="#c8102e" stroke-width="2"/></g>`,
    // onda da Baía de Todos os Santos, nas três cores
    bahia: `<path d="M-23 16 C-23 -3 -9 -19 7 -18 C18 -17 24 -8 19 1 C15 -6 5 -7 2.5 1 C0.5 8 6 13 13 13 L23 16 Z" fill="#fff"/>
      <path d="M-17 16 C-17 1 -6 -12 6 -12 C12 -12 15 -9 15.5 -6 C11 -9 3.5 -8 -0.5 -1 C-3.5 5 -1 12 5 16 Z" fill="#e30613"/>
      <path d="M-10.5 16 C-10.5 4 -4 -4 3 -5.5 C-2 0 -4 8 0 16 Z" fill="#fff"/>
      <circle cx="16" cy="-17" r="2.2" fill="#fff"/><circle cx="21.5" cy="-12" r="1.4" fill="#fff"/>`,
    // a Estrela Solitária
    botafogo: `<g class="spin-in">${star(0, 1, 24, "#fff")}${star(0, 1, 24, "none", 'stroke="#111" stroke-width="1.4" transform="scale(.72) translate(0 0.4)"')}</g>
      <path class="glint" d="M15 -17 L16.4 -13.6 L20 -12.2 L16.4 -10.8 L15 -7.4 L13.6 -10.8 L10 -12.2 L13.6 -13.6 Z" fill="#fff"/>`,
    // touro de frente (Massa Bruta)
    bragantino: `<path d="M-9 -10 C-19 -10 -26 -17 -25 -27 C-20 -19 -14 -17.5 -6 -16.5 Z M9 -10 C19 -10 26 -17 25 -27 C20 -19 14 -17.5 6 -16.5 Z" fill="#0b1f45"/>
      <path d="M-11 -15 Q0 -20 11 -15 L14 0 Q13 13 7 19 Q0 23 -7 19 Q-13 13 -14 0 Z" fill="#d7182a"/>
      <path d="M-14 -7 L-23 -10 L-18 -1 Z M14 -7 L23 -10 L18 -1 Z" fill="#d7182a"/><path d="M-15.5 -6.5 L-20 -8 L-17.4 -3.5 Z M15.5 -6.5 L20 -8 L17.4 -3.5 Z" fill="#0b1f45"/>
      <path d="M-10.5 -4 L-3.5 -1.5 L-9.5 1 Z M10.5 -4 L3.5 -1.5 L9.5 1 Z" fill="#fff"/>
      <path d="M-11 -9 L-3 -5.5 M11 -9 L3 -5.5" stroke="#0b1f45" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="0" cy="12.5" rx="9.5" ry="6.5" fill="#a50f20"/><ellipse cx="-3.8" cy="12" rx="1.7" ry="2.6" fill="#0b1f45"/><ellipse cx="3.8" cy="12" rx="1.7" ry="2.6" fill="#0b1f45"/>
      <path d="M-4.5 16 A4.5 4.5 0 1 0 4.5 16" stroke="#e7b53c" stroke-width="2.2" fill="none"/>`,
    // flecha no alvo (a "flechada" do Oeste)
    chapecoense: `<circle r="22" fill="#fff"/><circle r="16" fill="#00843d"/><circle r="10" fill="#fff"/><circle r="4.2" fill="#00843d"/>
      <g class="arrow"><path d="M0 0 L-40 -13" stroke="#0a3d22" stroke-width="2.6" stroke-linecap="round"/><path d="M1 0.4 L-6 -5.5 L-5 1.6 Z" fill="#0a3d22"/>
      <path d="M-34 -11 L-42 -19 L-37 -12.5 Z M-34 -11 L-41 -6 L-36 -10 Z M-38 -12.3 L-46 -20 L-41 -13.6 Z M-38 -12.3 L-45 -7.4 L-40 -11.4 Z" fill="#fff" stroke="#0a3d22" stroke-width=".8"/></g>`,
    // chapéu de mosqueteiro com pluma
    corinthians: `<path d="M5 -10 C10 -24 26 -25 25 -13 C21 -18 13 -17 9 -7 Z" fill="#d4d4d4" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M8.5 -8.5 C13 -17 19 -19 23 -15" stroke="#111" stroke-width=".9" fill="none"/>
      <path d="M-13 5 C-14 -8 -6 -12.5 1.5 -12.5 C10 -12.5 14 -6 13 5 Z" fill="#111"/>
      <rect x="-13.4" y="-1.5" width="26.6" height="4.4" fill="#fff"/>
      <path d="M-25 3 C-12 11 12 11 25 1 C23 9 11 14.5 0 14.5 C-12 14.5 -23 10 -25 3 Z" fill="#111"/>`,
    // araucária, a árvore do Paraná
    coritiba: `<rect x="-1.6" y="-8" width="3.2" height="30" fill="#4a3424"/>
      ${[[-16, 23], [-6.5, 21], [3, 16]].map(([y, w], i) => `<path class="tier" style="--k:${i}" d="M${-w} ${y - 5} C${-w * 0.8} ${y + 3} ${-w * 0.3} ${y + 3} 0 ${y + 1} C${w * 0.3} ${y + 3} ${w * 0.8} ${y + 3} ${w} ${y - 5} C${w * 0.6} ${y - 1.5} ${w * 0.25} ${y - 2.5} 0 ${y - 3} C${-w * 0.25} ${y - 2.5} ${-w * 0.6} ${y - 1.5} ${-w} ${y - 5} Z" fill="#00543c"/>`).join("")}
      <path d="M-11 -21 C-6 -24 6 -24 11 -21 C6 -19.5 -6 -19.5 -11 -21 Z" fill="#00543c"/>`,
    // elmo do Guerreiro tricolor
    fluminense: `<path d="M-15 -12 C-14 -31 14 -31 15 -12 C10 -21 -10 -21 -15 -12 Z" fill="#00a36c"/>
      <path d="M-9 -20 C-4 -24 4 -24 9 -20" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M-6 -26 C-2 -28 2 -28 6 -26" stroke="#7a1333" stroke-width="1.6" fill="none"/>
      <path d="M-17 19 L-17 -2 C-17 -12 -9 -17 0 -17 C9 -17 17 -12 17 -2 L17 19 L8 19 L8 7 L3 2.5 L-3 2.5 L-8 7 L-8 19 Z" fill="#fff"/>
      <path d="M-11.5 -5 H11.5 V0.5 H3 V15 H-3 V0.5 H-11.5 Z" fill="#7a1333"/>
      <path d="M-13 -6 C-13 -11 -9 -14 -4 -15" stroke="#7a1333" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".35"/>`,
    // duas espadas cruzadas (um por todos, todos por um)
    gremio: `${[1, -1].map((s) => `<g transform="scale(${s} 1)"><path d="M-17 17 L17 -17" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M17 -17 L20 -20" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M-17 17 L-21.5 21.5" stroke="#111" stroke-width="4.2" stroke-linecap="round"/><path d="M-19 9 C-14 9 -9 14 -9 19" stroke="#111" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="-23" cy="23" r="2.6" fill="#111"/></g>`).join("")}
      ${star(0, -19, 5, "#fff")}`,
    // o gorro vermelho do Saci
    internacional: `<g class="sway"><path d="M-17 16 C-17 1 -9 -11 4 -17 C12 -21 21 -17 23 -10 C17 -12.5 12.5 -10.5 10.5 -6 C14.5 0 16.5 8 16.5 16 Z" fill="#b00010" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M-18.5 14 H18 V20 H-18.5 Z" fill="#fff"/><path d="M-6 -6 C-3 -12 3 -15 8 -15" stroke="#fff" stroke-width="1.6" fill="none" opacity=".5" stroke-linecap="round"/></g>`,
    // Leão com juba de sol (Mira-sol), amarelo e verde
    mirassol: `<g class="rays">${Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * TAU; const x1 = Math.cos(a - 0.2) * 14, y1 = Math.sin(a - 0.2) * 14, x2 = Math.cos(a) * 24, y2 = Math.sin(a) * 24, x3 = Math.cos(a + 0.2) * 14, y3 = Math.sin(a + 0.2) * 14; return `<path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} L${f(x3)} ${f(y3)} Z" fill="#00843d"/>`; }).join("")}</g>
      <circle r="14" fill="#ffd400" stroke="#00843d" stroke-width="2.6"/>
      <ellipse cx="0" cy="6" rx="7" ry="5" fill="#fff3a8"/><path d="M-3 2.5 H3 L0 6 Z" fill="#00843d"/><path d="M0 6 V8 M-3.5 9.5 Q0 8 3.5 9.5" stroke="#00843d" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <circle cx="-5.5" cy="-3" r="1.8" fill="#00843d"/><circle cx="5.5" cy="-3" r="1.8" fill="#00843d"/>`,
    // focinho de porco (o mascote que a torcida adotou)
    palmeiras: `<path d="M-15 -11 L-9 -23 L-3 -13 Z M15 -11 L9 -23 L3 -13 Z" fill="#fff"/><path d="M-12.5 -12.5 L-9 -19 L-6 -13.5 Z M12.5 -12.5 L9 -19 L6 -13.5 Z" fill="#f4b6c2"/>
      <ellipse cx="0" cy="3" rx="20" ry="15" fill="#fff"/><ellipse cx="0" cy="3" rx="20" ry="15" fill="none" stroke="#0b3d24" stroke-width="1.4" opacity=".35"/>
      <ellipse cx="-6.5" cy="3" rx="3.6" ry="6" fill="#006437"/><ellipse cx="6.5" cy="3" rx="3.6" ry="6" fill="#006437"/>`,
    // remos cruzados e a boia (o clube nasceu no remo)
    remo: `<circle r="21" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="11 5.5" transform="rotate(-20)"/>
      ${[1, -1].map((s) => `<g transform="scale(${s} 1)"><path d="M-15 17 L12 -10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M10 -8 C11 -16 17 -22 22 -21 C23 -16 18 -10 12 -10 Z" fill="#3c6fd1" stroke="#fff" stroke-width="1.4"/></g>`).join("")}`,
    // a cauda da baleia saindo do mar
    santos: `<g class="tail"><path d="M0 15 C0 7 -1.5 1 -5 -4 C-11 -9 -20 -9 -25 -16 C-16 -17.5 -7 -15 0 -8.5 C7 -15 16 -17.5 25 -16 C20 -9 11 -9 5 -4 C1.5 1 0 7 0 15 Z" fill="#111"/>
      <path d="M-22 -15 C-15 -15.5 -8 -13 -2 -8" stroke="#fff" stroke-width="1" fill="none" opacity=".35"/></g>
      <path d="M-26 15 q6.5 -5 13 0 t13 0 t13 0 t13 0" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M-20 21 q5 -3.5 10 0 t10 0 t10 0 t10 0" stroke="#111" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>
      <circle cx="-13" cy="4" r="1.7" fill="#111"/><circle cx="14" cy="2" r="2.1" fill="#111"/><circle cx="10" cy="-3" r="1.3" fill="#111"/>`,
    // auréola do Santo Paulo sobre as três cores
    "sao-paulo": `<clipPath id="gbsp"><circle r="16" cy="4"/></clipPath>
      <g clip-path="url(#gbsp)"><rect x="-17" y="-12" width="34" height="34" fill="#fff"/><path d="M-30 30 L30 -30 L30 -10 L-10 30 Z" fill="#e30613"/><path d="M-30 30 L30 -30 L30 -22 L-22 30 Z" fill="#111"/></g>
      <circle r="16" cy="4" fill="none" stroke="#111" stroke-width="2"/>
      <g class="halo"><ellipse cx="0" cy="-17" rx="15" ry="4.6" fill="none" stroke="#e7b53c" stroke-width="3.4"/><ellipse cx="0" cy="-17" rx="15" ry="4.6" fill="none" stroke="#fff3c4" stroke-width="1" opacity=".7"/></g>`,
    // cruz de malta (cruz pátea) da vela da caravela
    vasco: `<g class="spin-in"><path d="M-4 -4 L-9 -22 L9 -22 L4 -4 L22 -9 L22 9 L4 4 L9 22 L-9 22 L-4 4 L-22 9 L-22 -9 Z" fill="#c8102e" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></g>`,
    // Leão da Barra rugindo, de perfil
    vitoria: `<polygon points="0.0,-25.0 3.1,-13.6 8.5,-17.6 8.7,-10.9 19.5,-15.6 12.6,-6.1 19.0,-4.3 14.0,0.0 24.4,5.6 12.6,6.1 15.2,12.2 8.7,10.9 10.8,22.5 3.1,13.6 0.0,19.5 -3.1,13.6 -10.8,22.5 -8.7,10.9 -15.2,12.2 -12.6,6.1 -24.4,5.6 -14.0,0.0 -19.0,-4.3 -12.6,-6.1 -19.5,-15.6 -8.7,-10.9 -8.5,-17.6 -3.1,-13.6" fill="#111"/><circle r="15" fill="#111"/>
      <path d="M-12 -4 C-12 -11 -6 -14 0 -14 C6 -14 12 -11 12 -4 C12 5 8 13 0 14 C-8 13 -12 5 -12 -4 Z" fill="#fff"/>
      <path d="M-9.5 -6.5 L-3 -4 M9.5 -6.5 L3 -4" stroke="#111" stroke-width="2.2" stroke-linecap="round"/><circle cx="-5.5" cy="-2.2" r="1.5" fill="#111"/><circle cx="5.5" cy="-2.2" r="1.5" fill="#111"/>
      <path d="M-3.2 1 H3.2 L0 4.2 Z" fill="#111"/>
      <path d="M-6.5 6 Q0 4.5 6.5 6 Q5 13.5 0 13.5 Q-5 13.5 -6.5 6 Z" fill="#7a0000"/><path d="M-5.5 6.2 L-4 9 L-2.8 6 M5.5 6.2 L4 9 L2.8 6" fill="#fff"/>`,
  };

  /* ---------- enfeites do lado direito da faixa ---------- */
  const DECO = {
    "athletico-pr": () => hstripes(["#c8102e", "#111", "#c8102e", "#111", "#c8102e", "#111"]),
    "atletico-mg": () => vstripes(["#111", "#fff"], 13) + star(334, 38, 13, "#c9a54a", 'class="dk pop" style="--k:6"'),
    bahia: () => diag(["#e30613", "#fff", "#0055a5", "#e30613", "#fff"], 18),
    botafogo: () => vstripes(["#fff", "#111"], 11),
    bragantino: () => diag(["#d7182a", "#fff", "#0b1f45", "#d7182a"], 24),
    chapecoense: () => diag(["#fff", "#00843d", "#0a3d22", "#fff"], 18) + `<path class="dk" style="--k:5" d="M232 20 L370 46" stroke="#fff" stroke-width="2" stroke-dasharray="5 6" opacity=".7"/>`,
    corinthians: () => vstripes(["#111", "#fff"], 12, 250) + `<g class="dk pop" style="--k:6"><g transform="translate(316 38)">
      <path d="M-15 -16 L15 16 M15 -16 L-15 16" stroke="#111" stroke-width="7" stroke-linecap="round"/><path d="M-15 -16 L15 16 M15 -16 L-15 16" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
      <circle cy="-12" r="4" fill="none" stroke="#c8102e" stroke-width="2.4"/><path d="M0 -8 V16 M-11 8 Q0 20 11 8 M-6 -1 H6" stroke="#c8102e" stroke-width="3.2" fill="none" stroke-linecap="round"/></g></g>`,
    coritiba: () => [[236, 0.78], [268, 1], [300, 0.86], [334, 1.08], [362, 0.8]].map(([x, s], i) => `<g class="dk grow" style="--k:${i}"><g transform="translate(${x} 80) scale(${s})"><rect x="-1.4" y="-56" width="2.8" height="56" fill="#0b2e22"/>${[[-50, 18], [-40, 20], [-30, 14]].map(([y, w]) => `<path d="M${-w} ${y - 4} C${-w * 0.7} ${y + 3} ${w * 0.7} ${y + 3} ${w} ${y - 4} C${w * 0.5} ${y - 1} ${-w * 0.5} ${y - 1} ${-w} ${y - 4} Z" fill="#0b2e22"/>`).join("")}</g></g>`).join(""),
    cruzeiro: () => [[300, 12, 8.5], [300, 64, 9.5], [272, 36, 8], [330, 32, 8], [316, 48, 4.5]].map(([x, y, r], i) => `<g class="dk pop" style="--k:${i}">${star(x, y, r, "#fff")}</g>`).join("") + `<circle class="dk" style="--k:0" cx="300" cy="38" r="44" fill="#5b8cff" opacity=".18"/>`,
    flamengo: () => hstripes(["#111", "#e4002b", "#111", "#e4002b", "#111", "#e4002b"]),
    fluminense: () => vstripes(["#00664b", "#fff", "#7a1333"], 13),
    gremio: () => vstripes(["#111", "#fff", "#0d80bf"], 12),
    internacional: () => vstripes(["#fff", "#e30613"], 16, 270) + `<path class="dk" style="--k:0" d="M226 64 C246 40 262 70 284 44 C300 26 316 50 340 30" stroke="#fff" stroke-width="3" fill="none" opacity=".55"/>`,
    mirassol: () => `<g class="dk" style="--k:0"><g transform="translate(318 38)">${Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * TAU; return `<path d="M0 0 L${f(Math.cos(a - 0.09) * 90)} ${f(Math.sin(a - 0.09) * 90)} L${f(Math.cos(a + 0.09) * 90)} ${f(Math.sin(a + 0.09) * 90)} Z" fill="#00843d" opacity=".9"/>`; }).join("")}<circle r="15" fill="#00843d"/><circle r="10" fill="#ffd400"/></g></g>`,
    palmeiras: () => `<g class="dk" style="--k:0"><g transform="translate(300 40)">${[1, -1].map((s) => `<g transform="scale(${s} 1)"><path d="M4 30 C28 22 38 0 30 -24" stroke="#fff" stroke-width="2" fill="none"/>${[0, 1, 2, 3, 4].map((i) => { const y = 24 - i * 11, x = 12 + i * 4.2 - (i > 2 ? (i - 2) * 4 : 0); return `<ellipse cx="${f(x + 8)}" cy="${y}" rx="7" ry="3" transform="rotate(${-30 - i * 12} ${f(x + 8)} ${y})" fill="#fff"/><ellipse cx="${f(x - 1)}" cy="${y - 5}" rx="6" ry="2.6" transform="rotate(${-70 - i * 8} ${f(x - 1)} ${y - 5})" fill="#fff" opacity=".85"/>`; }).join("")}</g>`).join("")}</g></g>`,
    remo: () => waves("#3c6fd1", 50, 0.55, 0) + waves("#fff", 60, 0.8, 1) + waves("#3c6fd1", 68, 1, 2),
    santos: () => vstripes(["#111", "#fff"], 12, 250) + waves("#111", 62, 1, 6),
    "sao-paulo": () => diag(["#e30613", "#fff", "#111", "#e30613", "#fff", "#111"], 15),
    vasco: () => `<path class="dk" style="--k:0" d="M196 84 L276 -4 L318 -4 L238 84 Z" fill="#fff"/>
      <g class="dk pop" style="--k:3"><g transform="translate(328 40)"><path d="M0 -34 V30" stroke="#d9c08a" stroke-width="2.4"/><path d="M-22 -26 Q-14 -6 -22 16 H22 Q14 -6 22 -26 Z" fill="#f4ecd8"/><path d="M-4 -9 L-6 -16 L6 -16 L4 -9 L11 -11 L11 -3 L4 -5 L6 2 L-6 2 L-4 -5 L-11 -3 L-11 -11 Z" fill="#c8102e"/><path d="M-30 30 H30 L22 38 H-22 Z" fill="#5a3b1e"/></g></g>`,
    vitoria: () => hstripes(["#e30613", "#111", "#e30613", "#111", "#e30613", "#111"]).replace(/x="200"/g, 'x="270"') + `<g class="dk pop" style="--k:2"><g transform="translate(240 78)">
      <path class="beam" d="M0 -58 L120 -84 L120 -40 Z" fill="#fff6c8" opacity=".55"/><path d="M-7 0 L-5 -50 H5 L7 0 Z" fill="#fff"/><rect x="-5.2" y="-38" width="10.4" height="6" fill="#111"/><rect x="-5.8" y="-20" width="11.6" height="6" fill="#111"/><rect x="-7" y="-58" width="14" height="9" rx="2" fill="#ffd54a"/><path d="M-8 -58 L0 -66 L8 -58 Z" fill="#111"/></g></g>`,
  };

  // faixa da sigla, base da arte, cor do texto do "GOL!"
  const PAL = {
    "athletico-pr": ["#c8102e", "#fff", "#111", "#fff"], "atletico-mg": ["#111", "#fff", "#fff", "#111"],
    bahia: ["#fff", "#0055a5", "#0055a5", "#fff"], botafogo: ["#fff", "#111", "#111", "#fff"],
    bragantino: ["#d7182a", "#fff", "#fff", "#d7182a"], chapecoense: ["#fff", "#00843d", "#00843d", "#fff"],
    corinthians: ["#111", "#fff", "#fff", "#111"], coritiba: ["#00543c", "#fff", "#fff", "#00543c"],
    cruzeiro: ["#fff", "#0033a0", "#0033a0", "#fff"], flamengo: ["#111", "#fff", "#e4002b", "#fff"],
    fluminense: ["#fff", "#7a1333", "#7a1333", "#fff"], gremio: ["#fff", "#0d80bf", "#0d80bf", "#fff"],
    internacional: ["#fff", "#e30613", "#e30613", "#fff"], mirassol: ["#00843d", "#ffd400", "#ffd400", "#00843d"],
    palmeiras: ["#fff", "#006437", "#006437", "#fff"], remo: ["#fff", "#0b2a5b", "#0b2a5b", "#fff"],
    santos: ["#111", "#fff", "#fff", "#111"], "sao-paulo": ["#e30613", "#fff", "#fff", "#111"],
    vasco: ["#fff", "#111", "#111", "#fff"], vitoria: ["#111", "#fff", "#e30613", "#fff"],
  };

  /* A goleada mais simbólica de cada torcida (de preferência sobre o maior rival): o relógio do placar para nela,
     com os gols do clube no lugar das horas e os do adversário no dos minutos (Cruzeiro 6 x 1 Atlético-MG = 06:01).
     Fontes: Wikipédia (páginas de cada clássico), sites oficiais dos clubes, ge, Lance!, Terra e Gazeta Esportiva. */
  const FEITO = {
    "athletico-pr": [6, 2, "Coritiba", 1938, "maior goleada do Athletico no Atletiba"],
    "atletico-mg": [9, 2, "Cruzeiro", 1927, "maior goleada do clássico mineiro (o rival ainda era o Palestra Itália)"],
    bahia: [10, 1, "Vitória", 1939, "maior goleada do Ba-Vi"],
    botafogo: [6, 0, "Flamengo", 1972, "o 6 a 0 eternizado pelo rádio, maior goleada do Botafogo no Brasileirão"],
    bragantino: [5, 1, "Flamengo", 1993, "maior goleada do confronto, no Brasileirão de 1993"],
    chapecoense: [5, 1, "Palmeiras", 2015, "show na Arena Condá pelo Brasileirão"],
    corinthians: [11, 0, "Santos", 1920, "maior goleada do Clássico Alvinegro e da história do Corinthians"],
    coritiba: [6, 0, "Athletico", 1959, "maior goleada do Atletiba"],
    cruzeiro: [6, 1, "Atlético-MG", 2011, "a última rodada do Brasileirão de 2011"],
    flamengo: [6, 1, "Vasco", 2024, "maior goleada do Flamengo no Clássico dos Milhões, em São Januário"],
    fluminense: [4, 0, "Flamengo", 2018, "a maior goleada tricolor no Fla-Flu (Carioca de 2018)"],
    gremio: [10, 0, "Internacional", 1909, "o primeiro Gre-Nal da história"],
    internacional: [7, 0, "Grêmio", 1948, "maior goleada colorada no Gre-Nal"],
    mirassol: [6, 2, "Palmeiras", 2013, "seis gols no primeiro tempo, pelo Paulistão"],
    palmeiras: [8, 0, "Corinthians", 1933, "maior goleada da história do Derby"],
    remo: [7, 2, "Paysandu", 1939, "maior goleada azulina no Re-Pa"],
    santos: [7, 4, "Corinthians", 1964, "quatro gols de Pelé no Pacaembu"],
    "sao-paulo": [6, 1, "Corinthians", 1933, "maior goleada tricolor no Majestoso"],
    vasco: [7, 0, "Flamengo", 1931, "maior goleada do Clássico dos Milhões"],
    vitoria: [7, 1, "Bahia", 1948, "maior goleada rubro-negra no Ba-Vi"],
  };
  const dois = (n) => String(n).padStart(2, "0");

  const BRAND_P = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="9" fill="#fff"/><path d="M14 10 H22.5 C28 10 31 13.2 31 17.8 C31 22.4 28 25.6 22.5 25.6 H19.6 V31 H14 Z M19.6 15 V20.6 H22.2 C24.2 20.6 25.3 19.5 25.3 17.8 C25.3 16.1 24.2 15 22.2 15 Z" fill="#2f47d6"/><circle cx="33" cy="33" r="3.6" fill="#ff3b4f"/></svg>`;

  // opts (gol ao vivo): { de, para, outro, relogio } = placar do clube antes e depois, do adversário e o minuto
  function html(club, motto, opts = {}) {
    const de = opts.de ?? 0, para = opts.para ?? 1, outro = opts.outro ?? 0;
    const id = club.id, [band, bink, base, ink] = PAL[id] || [club.colors[0], "#fff", club.colors[0], "#fff"];
    const sym = SYM[id] || star(0, 0, 22, ink);
    const deco = DECO[id] ? DECO[id]() : "";
    const src = club.logo ? club.logo : "";
    const f = !opts.relogio && FEITO[id];
    return `<div class="gb" data-goalbug="${id}"${opts.atraso > 0 ? ` data-atraso="${opts.atraso}"` : ""}${f ? ` data-feito="${f[0]}:${f[1]}"` : ""} role="img" aria-label="Animação de gol do ${club.name}: ${club.short}, escudo e GOL!${f ? ` O relógio para em ${dois(f[0])}:${dois(f[1])}, o ${f[0]} a ${f[1]} sobre o ${f[2]} em ${f[3]}.` : ""}" style="--band:${band};--bink:${bink};--base:${base};--ink:${ink}">
      <div class="gb-bar">
        <div class="gb-neutral"><b class="gb-d gb-h"><i>${de}</i><i class="one">${para}</i></b><span class="gb-p">${BRAND_P}</span><b class="gb-d">${outro}</b></div>
        <div class="gb-art"><svg viewBox="0 0 360 76" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <defs><linearGradient id="gbf-${id}" x1="0" x2="1"><stop offset=".6" stop-color="${base}"/><stop offset=".8" stop-color="${base}" stop-opacity="0"/></linearGradient></defs>
          <rect width="360" height="76" fill="${base}"/>
          <g>${deco}</g><rect width="360" height="76" fill="url(#gbf-${id})"/>
          <g class="gb-word" fill="${ink}"><text class="gb-g" x="73" y="61" text-anchor="end">G</text><g class="gb-sym" transform="translate(104 37) scale(1.2)"><g class="gb-sym-in">${sym}</g></g><text class="gb-l" x="135" y="61">L!</text></g>
        </svg></div>
        <div class="gb-team"><span>${club.short}</span></div>
        <div class="gb-crest">${src ? `<img src="${src}" alt="" decoding="async"/>` : (window.GFX?.svgCrest ? GFX.svgCrest(club, 96) : "")}</div>
        <div class="gb-wipe-box"><div class="gb-wipe"></div></div>
      </div>
      <div class="gb-clock" aria-hidden="true"${opts.relogio ? ` data-fixo="${opts.relogio}"` : ""}><span>${opts.relogio || "00:00"}</span></div>
      ${f ? `<div class="gb-feito" aria-hidden="true" title="${f[4]}"><b>${f[0]} × ${f[1]}</b><span>no ${f[2]} · ${f[3]}</span></div>` : ""}
    </div>
    ${motto ? `<p class="gb-motto"><b>${motto}</b><span>toque para ver o gol de novo</span></p>` : ""}`;
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // com cena no fundo, o placar espera a cena chegar no escudo ("?cena=8" adianta junto)
  const pulo = +new URLSearchParams(location.search).get("cena") || 0;
  function start(el, primeira) {
    const atraso = Math.max(0, (+el.dataset.atraso || 0) - (primeira ? pulo : 0));
    clearTimeout(el._w);
    if (atraso && !reduced) {
      el.classList.remove("play"); el.classList.add("wait");
      el._w = setTimeout(() => { el.classList.remove("wait"); run(el); }, atraso * 1000);
      return;
    }
    el.classList.remove("wait");
    run(el);
  }
  function run(el) {
    const clock = el.querySelector(".gb-clock span"), fixo = el.querySelector(".gb-clock").dataset.fixo;
    clearInterval(el._t);
    if (fixo) { if (reduced) el.classList.add("still"); else { el.classList.remove("play"); void el.offsetWidth; el.classList.add("play"); } return; }
    // sem goleada cadastrada, o relógio só conta os 6 segundos da jogada
    const [g, o] = (el.dataset.feito || "0:6").split(":").map(Number);
    const fim = `${dois(g)}:${dois(o)}`;
    el.classList.remove("feito");
    if (reduced) { el.classList.add("still", "feito"); clock.textContent = fim; return; }
    el.classList.remove("play"); void el.offsetWidth; el.classList.add("play");
    // o placar da goleada vai subindo como num relógio de jogo e para nele, junto com o fim da jogada (6 s)
    const t0 = performance.now(), dur = 6000;
    clock.textContent = "00:00";
    el._t = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - (1 - k) ** 2;
      clock.textContent = `${dois(Math.floor(g * e + (k >= 1 ? 0.5 : 0)))}:${dois(Math.floor(o * e + (k >= 1 ? 0.5 : 0)))}`;
      if (k >= 1 || !el.isConnected) { clearInterval(el._t); clock.textContent = fim; el.classList.add("feito"); }
    }, 120);
  }
  function mount(root) {
    root.querySelectorAll(".gb:not([data-on])").forEach((el) => {
      el.dataset.on = "1";
      start(el, true);
      el.closest(".hero")?.addEventListener("click", (e) => { if (!e.target.closest("a,button,input")) start(el); });
    });
  }

  // faixa da cortina (ao entrar num clube): sigla, escudo e nome, no mesmo estilo do placar do gol
  function bar(club) {
    const [band, bink, base, ink] = PAL[club.id] || [club.colors[0], "#fff", club.colors[0], "#fff"];
    return `<div class="cbar" style="--band:${band};--bink:${bink};--base:${base};--ink:${ink}">
      <div class="cbar-name"><b>${club.abbr}</b></div>
      <div class="gb-team cbar-team"><span>${club.short}</span></div>
      <div class="cbar-crest">${club.logo ? `<img src="${club.logo}" alt="" decoding="async"/>` : ""}</div>
    </div>`;
  }

  /* ---------- gol ao vivo: o placar do clube que marcou aparece por cima da página ---------- */
  const fila = [];
  let tocando = false;
  // gol = { club, de, para, outro, relogio, texto, link }
  /* Com a aba em segundo plano (ou a tela do celular apagada) a animação rodaria sem ninguém ver e sumiria em 7 s:
     o gol espera a pessoa voltar para a página. Gol de mais de 10 min atrás não toca mais (o placar já mostra). */
  function alerta(gol) {
    // som do gol: com a aba escondida toca na hora (o alerta aparece quando ela voltar); à vista, junto com o alerta
    const som = document.hidden ? (window.SONS?.gol(gol.club.id), true) : false;
    fila.push({ ...gol, em: Date.now(), som });
    if (!tocando) proximo();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !tocando) proximo(); });
  function proximo() {
    if (document.hidden) { tocando = false; return; }
    while (fila.length && Date.now() - fila[0].em > 10 * 60e3) fila.shift();
    const gol = fila.shift();
    if (!gol) { tocando = false; return; }
    tocando = true;
    const box = document.createElement("a");
    box.className = "goal-alert";
    box.href = gol.link || "#/";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "assertive");
    box.innerHTML = html(gol.club, "", gol) + `<p class="ga-txt"><b>GOL do ${gol.club.abbr}!</b><span>${gol.texto}</span></p>`;
    box.querySelector(".gb").setAttribute("aria-label", `Gol do ${gol.club.name}. ${gol.texto}`);
    document.body.appendChild(box);
    if (!gol.som) window.SONS?.gol(gol.club.id);
    start(box.querySelector(".gb"));
    const sai = () => { if (!box.isConnected) return; box.classList.add("bye"); setTimeout(() => { box.remove(); proximo(); }, 420); };
    box.addEventListener("click", () => setTimeout(sai, 50));
    setTimeout(sai, reduced ? 5000 : 7400);
  }

  window.GOALBUG = { html, mount, bar, alerta, has: (id) => !!SYM[id] };
})();
