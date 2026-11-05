/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — aparições temáticas dos escudos
   Cada clube ganha uma pequena cena inspirada no que o escudo representa
   (a constelação do Cruzeiro do Sul, o urubu sobre o Rio, a caravela do
   Vasco…). A cena termina formando o escudo oficial do clube.
   Ilustrações próprias; o escudo é a imagem oficial (Wikimedia).
   ========================================================================== */
(() => {
  let uid = 0;
  const T = 2.7; // segundo em que o escudo aparece

  /* ---------- peças reutilizáveis ---------- */
  // cada elemento animado: style="--an:nome; --d:atraso; --du:duração"
  const A = (an, d = 0, du = 1, extra = "") => `style="--an:${an};--d:${d}s;--du:${du}s;${extra}"`;
  const sky = (id, top, bottom) => `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="240" height="240" fill="url(#${id}s)"/>`;
  function stars(n, seed, color = "#fff", y1 = 0, y2 = 170) {
    let s = seed, out = "";
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      out += `<circle class="x tw" cx="${(r() * 240).toFixed(1)}" cy="${(y1 + r() * (y2 - y1)).toFixed(1)}" r="${(0.5 + r() * 1.3).toFixed(1)}" fill="${color}" ${A("appear", r() * 1.2, 0.6, `--tw:${(1.5 + r() * 2).toFixed(1)}s`)}/>`;
    }
    return out;
  }
  const star5 = (cx, cy, r, fill) => {
    const p = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; p.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`); }
    return `<polygon points="${p.join(" ")}" fill="${fill}"/>`;
  };
  const waves = (y, color, op = 1, d = 0) => `<g class="x" ${A("riseUp", d, 1)}><path class="wv" d="M-60 ${y} q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V240 H-60 Z" fill="${color}" opacity="${op}"/></g>`;
  const sun = (cx, cy, r, c, d = 0) => `<g class="x" ${A("sunrise", d, 1.4)}><circle cx="${cx}" cy="${cy}" r="${r * 1.7}" fill="${c}" opacity=".18"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/></g>`;
  const bird = (c) => `<path d="M0 0 C-10 -8 -22 -10 -34 -4 C-26 -4 -20 -1 -16 2 C-24 2 -30 6 -34 10 C-22 8 -12 6 -4 4 L0 7 L4 4 C12 6 22 8 34 10 C30 6 24 2 16 2 C20 -1 26 -4 34 -4 C22 -10 10 -8 0 0 Z" fill="${c}"/>`;
  const lion = (c, mane) => `<g><circle r="30" fill="${mane}"/>${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<circle cx="${(Math.cos(a) * 26).toFixed(1)}" cy="${(Math.sin(a) * 26).toFixed(1)}" r="10" fill="${mane}"/>`; }).join("")}<circle r="20" fill="${c}"/><ellipse cy="8" rx="10" ry="7" fill="#f8e2b0"/><path d="M-4 3 h8 l-4 5 z" fill="#3a1d0c"/><circle cx="-8" cy="-4" r="2.6" fill="#1a1a1a"/><circle cx="8" cy="-4" r="2.6" fill="#1a1a1a"/></g>`;
  const bull = (c) => `<g><ellipse cx="0" cy="0" rx="26" ry="14" fill="${c}"/><ellipse cx="-26" cy="-6" rx="11" ry="9" fill="${c}"/><path d="M-30 -14 q-10 -10 -4 -18 q2 8 10 10 z M-22 -14 q8 -10 2 -18 q-1 8 -8 10 z" fill="#f4ead6"/><rect x="-18" y="8" width="6" height="16" rx="2" fill="${c}"/><rect x="10" y="8" width="6" height="16" rx="2" fill="${c}"/><path d="M24 -4 q10 2 8 14" stroke="${c}" stroke-width="3" fill="none"/></g>`;
  const rooster = (c) => `<g><path d="M-20 10 C-24 -10 -8 -22 6 -16 C10 -24 18 -26 22 -20 C26 -16 22 -10 18 -10 L26 -6 L18 -4 C20 8 10 20 -6 20 Z" fill="${c}"/><path d="M8 -26 q2 -8 6 -2 q4 -8 6 0 q4 -4 4 2 z" fill="#e0262f"/><path d="M-20 10 C-36 0 -40 -18 -30 -26 C-30 -14 -26 -4 -16 2 Z" fill="${c}"/><path d="M-4 20 v10 m10 -10 v10" stroke="#f2b233" stroke-width="3"/></g>`;
  const araucaria = (x, base, h, d) => `<g class="x" ${A("growUp", d, 1.1, "transform-origin:center bottom")}><rect x="${x - 2}" y="${base - h}" width="4" height="${h}" fill="#3b2a1c"/>${[0.15, 0.32, 0.5].map((k, i) => `<path d="M${x - (30 - i * 7)} ${base - h + h * k} q${30 - i * 7} -${14 - i * 3} ${(30 - i * 7) * 2} 0 z" fill="#0b4d2c"/>`).join("")}</g>`;

  /* ---------- as cenas ---------- */
  const S = {
    cruzeiro: {
      cap: "Cruzeiro do Sul", sub: "as cinco estrelas da constelação viram o escudo",
      draw: (id) => {
        const cross = [[120, 52], [120, 150], [76, 102], [160, 96], [136, 124]];
        return `${sky(id, "#020a24", "#0b2c7a")}
          <g class="x" ${A("zoomIn", 0, 2.4)}>${stars(70, 7)}
            <g class="x out" ${A("fadeOut", T, 0.6)}>
              <path class="x" d="M120 52 L120 150 M76 102 L160 96" stroke="#9ec1ff" stroke-width="1.2" pathLength="1" stroke-dasharray="1" ${A("draw", 1.2, 1.1)} fill="none"/>
              ${cross.map(([x, y], i) => `<g class="x" ${A("pop", 0.9 + i * 0.15, 0.5)}>${star5(x, y, i === 4 ? 6 : 9, "#fff")}<circle cx="${x}" cy="${y}" r="14" fill="#fff" opacity=".12"/></g>`).join("")}
            </g></g>`;
      },
    },
    flamengo: {
      cap: "O urubu sobre o Rio", sub: "o urubu plana sobre o Pão de Açúcar e o Cristo e vira o escudo",
      draw: (id) => `${sky(id, "#2a0508", "#e4002b")}${sun(120, 150, 34, "#ffb199", 0.1)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          <path d="M0 240 V196 Q20 192 30 176 Q38 162 46 176 Q52 188 62 186 Q80 146 96 136 Q110 146 114 172 Q122 186 140 182 Q150 168 160 166 L172 122 L180 122 L190 166 Q212 172 240 176 V240 Z" fill="#120607"/>
          <path d="M176 104 v16 M170 109 h12" stroke="#120607" stroke-width="3"/>
        </g>
        <g class="x glide">${bird("#0d0d0f")}</g>`,
    },
    "atletico-mg": {
      cap: "O Galo canta em BH", sub: "o sol nasce atrás das montanhas e o galo canta",
      draw: (id) => `${sky(id, "#0d0d0d", "#5a5a5a")}${sun(120, 150, 28, "#f4f4f4", 0.2)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          <path d="M0 240 V190 L40 160 L70 180 L110 140 L150 175 L190 150 L240 185 V240 Z" fill="#111"/>
          <g transform="translate(112 118)"><g class="x" ${A("crow", 0.9, 1.4)}>${rooster("#f2f2f2")}</g></g>
          ${[0, 1, 2].map((i) => `<path class="x" d="M146 ${92 + i * 8} q10 -4 18 -${10 - i * 4}" stroke="#fff" stroke-width="2" fill="none" ${A("appear", 1.4 + i * 0.15, 0.4)}/>`).join("")}
        </g>`,
    },
    "athletico-pr": {
      cap: "O Furacão", sub: "um furacão rubro-negro gira até formar o escudo",
      draw: (id) => `${sky(id, "#160204", "#3a0a0e")}
        <g class="x out" ${A("fadeOut", T, 0.6)}><g class="x spinIn" style="transform-origin:120px 120px">
          ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M120 120 m0 -${20 + i * 14} a${20 + i * 14} ${20 + i * 14} 0 0 1 ${20 + i * 14} ${20 + i * 14}" stroke="${i % 2 ? "#111" : "#c8102e"}" stroke-width="${10 - i}" fill="none" stroke-linecap="round" transform="rotate(${i * 60} 120 120)"/>`).join("")}
        </g></g>`,
    },
    bahia: {
      cap: "Baía de Todos os Santos", sub: "o mar da Bahia e as três cores do Esquadrão",
      draw: (id) => `${sky(id, "#7fb6ff", "#ffffff")}${sun(170, 70, 18, "#ffd34d", 0.1)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${["#0055a5", "#e30613", "#ffffff"].map((c, i) => `<rect class="x" x="-40" y="${40 + i * 30}" width="320" height="22" fill="${c}" transform="rotate(-18 120 120)" ${A("sweep", 0.4 + i * 0.25, 0.9)}/>`).join("")}
          ${waves(196, "#0055a5", 1, 0.2)}${waves(208, "#0a3f7a", 1, 0.35)}
        </g>`,
    },
    botafogo: {
      cap: "A Estrela Solitária", sub: "a estrela d'alva que guiava os remadores na madrugada",
      draw: (id) => `${sky(id, "#000000", "#2b2b2b")}${stars(40, 3, "#bbb", 0, 140)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${waves(190, "#111", 1, 0)}
          <g transform="translate(70 186)"><path d="M-22 0 h44 l-6 6 h-32 z" fill="#ddd"/><path d="M-30 -6 l60 14 M30 -6 l-60 14" stroke="#ddd" stroke-width="1.5"/></g>
          <g transform="translate(120 70)"><g class="x" ${A("starRise", 0.5, 1.8)}>${star5(0, 0, 16, "#fff")}<circle r="30" fill="#fff" opacity=".12"/></g></g>
        </g>`,
    },
    bragantino: {
      cap: "Massa Bruta", sub: "dois touros avançam e se encontram no centro",
      draw: (id) => `${sky(id, "#d7182a", "#5a0a12")}${sun(120, 118, 26, "#ffcc00", 1.4)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          <rect y="176" width="240" height="64" fill="#3a0a10"/>
          <g transform="translate(76 160)"><g class="x" ${A("chargeL", 0.2, 1.3)}>${bull("#1b1b1b")}</g></g>
          <g transform="translate(164 160) scale(-1 1)"><g class="x" ${A("chargeL", 0.2, 1.3)}>${bull("#1b1b1b")}</g></g>
          <circle class="x" cx="120" cy="150" r="30" fill="none" stroke="#fff" stroke-width="3" ${A("burst", 1.45, 0.6)}/>
        </g>`,
    },
    chapecoense: {
      cap: "A flechada", sub: "a flecha atravessa o Oeste e acerta o alvo",
      draw: (id) => `${sky(id, "#bfe6c9", "#00843d")}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          <path d="M0 240 V178 Q60 150 120 172 Q180 192 240 160 V240 Z" fill="#0a5c2e"/>
          <path d="M0 240 V200 Q70 180 140 198 Q200 212 240 196 V240 Z" fill="#06401f"/>
          <g class="x" ${A("arrow", 0.3, 1.2)}><path d="M-60 0 H8" stroke="#fff" stroke-width="3"/><path d="M8 -6 L20 0 L8 6 Z" fill="#fff"/><path d="M-60 0 l-8 -6 M-60 0 l-8 6 M-54 0 l-8 -6 M-54 0 l-8 6" stroke="#fff" stroke-width="2"/></g>
          ${[0, 1].map((i) => `<circle class="x" cx="120" cy="118" r="${18 + i * 16}" fill="none" stroke="#fff" stroke-width="2" ${A("burst", 1.45 + i * 0.12, 0.7)}/>`).join("")}
        </g>`,
    },
    corinthians: {
      cap: "Âncora e remos", sub: "a âncora, os remos e a boia lembram o clube náutico",
      draw: (id) => `${sky(id, "#e9edf2", "#b9c2cc")}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${waves(196, "#111", 0.85, 0)}
          <g class="x" ${A("drop", 0.4, 1)}><path d="M120 66 V150 M104 78 H136 M96 132 Q120 168 144 132" stroke="#111" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="120" cy="62" r="7" fill="none" stroke="#111" stroke-width="5"/></g>
          <g class="x" ${A("oarL", 1, 0.8)}><path d="M60 60 L180 160" stroke="#c8102e" stroke-width="5"/><ellipse cx="176" cy="157" rx="12" ry="5" transform="rotate(40 176 157)" fill="#c8102e"/></g>
          <g class="x" ${A("oarR", 1, 0.8)}><path d="M180 60 L60 160" stroke="#c8102e" stroke-width="5"/><ellipse cx="64" cy="157" rx="12" ry="5" transform="rotate(-40 64 157)" fill="#c8102e"/></g>
          <circle class="x" cx="120" cy="110" r="46" fill="none" stroke="#111" stroke-width="7" stroke-dasharray="18 10" ${A("ring", 1.5, 1)}/>
        </g>`,
    },
    coritiba: {
      cap: "As araucárias", sub: "o pinheiro do Paraná cresce no Alto da Glória",
      draw: (id) => `${sky(id, "#dff3e6", "#00543c")}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          <rect y="196" width="240" height="44" fill="#063a29"/>
          ${araucaria(56, 200, 110, 0.2)}${araucaria(120, 200, 140, 0.5)}${araucaria(188, 200, 100, 0.8)}
        </g>`,
    },
    fluminense: {
      cap: "Flumen, o rio", sub: "“fluminense” vem de rio: as três cores correm até o escudo",
      draw: (id) => `${sky(id, "#eef3ef", "#cfdcd4")}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${["#7a1333", "#ffffff", "#00664b"].map((c, i) => `<path class="x" d="M-20 ${70 + i * 34} C40 ${40 + i * 34} 80 ${110 + i * 34} 130 ${80 + i * 34} S210 ${50 + i * 34} 260 ${90 + i * 34}" stroke="${c}" stroke-width="24" fill="none" pathLength="1" stroke-dasharray="1" ${A("draw", 0.2 + i * 0.3, 1.3)}/>`).join("")}
        </g>`,
    },
    gremio: {
      cap: "Imortal Tricolor", sub: "o azul, o preto e o branco se entrelaçam sob as estrelas",
      draw: (id) => `${sky(id, "#06263d", "#0d80bf")}${stars(24, 11, "#fff", 0, 90)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${["#0d80bf", "#111111", "#ffffff", "#0d80bf", "#111111"].map((c, i) => `<rect class="x" x="${40 + i * 32}" y="40" width="30" height="170" fill="${c}" ${A("growUp", 0.2 + i * 0.15, 0.8, "transform-origin:center bottom")}/>`).join("")}
        </g>`,
    },
    internacional: {
      cap: "À beira do Guaíba", sub: "o pôr do sol vermelho sobre o rio e o Beira-Rio",
      draw: (id) => `${sky(id, "#ffb347", "#e30613")}${sun(120, 150, 30, "#fff3c4", 0)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          <g class="x" ${A("riseUp", 0.6, 1)}><path d="M30 170 Q120 120 210 170 V180 H30 Z" fill="#7a0000"/>${Array.from({ length: 9 }, (_, i) => `<path d="M${42 + i * 20} 176 v-${12 + Math.sin((i / 8) * Math.PI) * 14}" stroke="#fff" stroke-width="2"/>`).join("")}</g>
          ${waves(186, "#a00010", 1, 0.3)}${waves(200, "#7a0000", 1, 0.45)}
        </g>`,
    },
    mirassol: {
      cap: "O Leão do interior", sub: "o sol amarelo e o rugido do Leão",
      draw: (id) => `${sky(id, "#fff3b0", "#ffd400")}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          <g class="x spinSlow" style="transform-origin:120px 120px">${Array.from({ length: 16 }, (_, i) => `<path d="M120 120 L${120 + Math.cos((i / 16) * Math.PI * 2) * 170} ${120 + Math.sin((i / 16) * Math.PI * 2) * 170} L${120 + Math.cos(((i + 0.5) / 16) * Math.PI * 2) * 170} ${120 + Math.sin(((i + 0.5) / 16) * Math.PI * 2) * 170} Z" fill="#00843d" opacity=".18"/>`).join("")}</g>
          <rect y="196" width="240" height="44" fill="#00843d"/>
          <g transform="translate(120 140)"><g class="x" ${A("roar", 0.5, 1.4)}>${lion("#e9b23a", "#8a4b12")}</g></g>
        </g>`,
    },
    palmeiras: {
      cap: "Palestra", sub: "os louros da Palestra Itália se fecham em volta do escudo",
      draw: (id) => `${sky(id, "#0b3d24", "#006437")}${stars(20, 5, "#e8f5ec", 0, 240)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2, x = 120 + Math.cos(a) * 76, y = 120 + Math.sin(a) * 76; return `<ellipse class="x" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="11" ry="5" fill="#9ee2b5" transform="rotate(${((a * 180) / Math.PI + 60).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" ${A("pop", 0.2 + i * 0.07, 0.4)}/>`; }).join("")}
          <circle class="x" cx="120" cy="120" r="64" fill="none" stroke="#fff" stroke-width="3" pathLength="1" stroke-dasharray="1" ${A("draw", 1.4, 0.9)}/>
        </g>`,
    },
    remo: {
      cap: "O remo do Leão Azul", sub: "um barco a remo atravessa o rio Guamá, em Belém",
      draw: (id) => `${sky(id, "#071a3a", "#3c6fd1")}${stars(25, 9, "#cfe0ff", 0, 110)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${waves(176, "#0b2a5b", 1, 0)}${waves(196, "#081d40", 1, 0.2)}
          <g class="x" ${A("rowAcross", 0.2, 2.2)}><path d="M-30 0 h60 l-10 8 h-40 z" fill="#fff"/><g class="x oars"><path d="M-6 -2 l-22 18 M6 -2 l22 18" stroke="#fff" stroke-width="2.5"/></g></g>
        </g>`,
    },
    santos: {
      cap: "Do porto para o mundo", sub: "as listras do Peixe sobem do mar do litoral paulista",
      draw: (id) => `${sky(id, "#f1f3f6", "#c7ccd4")}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${Array.from({ length: 7 }, (_, i) => `<rect class="x" x="${50 + i * 20}" y="50" width="10" height="130" fill="${i % 2 ? "#ffffff" : "#111111"}" ${A("growUp", 0.2 + i * 0.1, 0.7, "transform-origin:center bottom")}/>`).join("")}
          ${waves(180, "#111", 1, 0)}${waves(194, "#333", 1, 0.15)}
        </g>`,
    },
    "sao-paulo": {
      cap: "As cores de São Paulo", sub: "o branco, o vermelho e o preto da bandeira paulista desenham o escudo",
      draw: (id) => `${sky(id, "#ffffff", "#e9e9e9")}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${[["#111", 0], ["#e30613", 12], ["#111", 24]].map(([c, o], i) => `<path class="x" d="M${60 + o} ${60 + o} H${180 - o} L120 ${196 - o * 1.6} Z" stroke="${c}" stroke-width="6" fill="none" pathLength="1" stroke-dasharray="1" stroke-linejoin="round" ${A("draw", 0.2 + i * 0.35, 1.1)}/>`).join("")}
        </g>`,
    },
    vasco: {
      cap: "A caravela", sub: "a caravela das Grandes Navegações, com a cruz na vela",
      draw: (id) => `${sky(id, "#0d0d0d", "#3a3a3a")}${stars(30, 13, "#999", 0, 120)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${waves(178, "#1a1a1a", 1, 0)}
          <g class="x" ${A("sail", 0.1, 2.2)}><g transform="translate(0 0)">
            <path d="M-40 0 h80 l-12 16 h-56 z" fill="#2a1a10"/><path d="M0 0 V-74" stroke="#2a1a10" stroke-width="3"/>
            <path d="M-30 -66 Q0 -76 30 -66 Q34 -40 30 -10 Q0 -18 -30 -10 Q-34 -40 -30 -66 Z" fill="#f2f2f2"/>
            <path d="M0 -60 l5 10 l10 -4 l-4 10 l10 5 l-10 5 l4 10 l-10 -4 l-5 10 l-5 -10 l-10 4 l4 -10 l-10 -5 l10 -5 l-4 -10 l10 4 z" fill="#c8102e"/>
          </g></g>
          ${waves(192, "#111", 1, 0.1)}
        </g>`,
    },
    vitoria: {
      cap: "O Leão da Barra", sub: "o farol da Barra ilumina Salvador e o Leão aparece",
      draw: (id) => `${sky(id, "#120304", "#6a0a0a")}${stars(30, 17, "#f7c", 0, 120)}
        <g class="x out" ${A("fadeOut", T, 0.6)}>
          ${waves(196, "#1a0506", 1, 0)}
          <g class="x beam" style="transform-origin:196px 104px"><path d="M196 104 L-20 60 L-20 150 Z" fill="#fff6c4" opacity=".22"/></g>
          <path d="M188 196 L192 112 H200 L204 196 Z" fill="#fff"/><path d="M189 140 H203 M190 168 H202" stroke="#111" stroke-width="8"/><rect x="188" y="100" width="16" height="12" fill="#ffd34d"/>
          <g transform="translate(96 130)"><g class="x" ${A("roar", 1, 1.3)}>${lion("#e7a93a", "#a81414")}</g></g>
        </g>`,
    },
  };

  /* ---------- montagem ---------- */
  function scene(club, variant = "hero") {
    const sc = S[club.id];
    if (!sc) return "";
    const id = `sc${++uid}`;
    return `<figure class="scene scene-${variant}" data-scene="${club.id}" aria-label="${sc.cap}: ${sc.sub}">
      <svg viewBox="0 0 240 240" role="img">
        <defs><clipPath id="${id}c"><rect width="240" height="240" rx="${variant === "hero" ? 28 : 18}"/></clipPath>
          <radialGradient id="${id}g"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
        <g clip-path="url(#${id}c)">
          ${sc.draw(id)}
          <circle class="x" cx="120" cy="120" r="80" fill="url(#${id}g)" ${A("flash", T - 0.1, 0.9)}/>
          <g class="x crest-in" ${A("crestIn", T, 0.9)}><image href="${club.logo}" x="62" y="62" width="116" height="116" preserveAspectRatio="xMidYMid meet"/></g>
        </g>
      </svg>
      ${variant === "hero" ? `<figcaption><b>${sc.cap}</b><span>${sc.sub}</span></figcaption>` : ""}
    </figure>`;
  }

  /* cartões: a cena toca quando aparece na tela e de novo ao passar o mouse */
  function mount(root = document) {
    // entra quando aparece; fora da tela, tudo pausa; depois da entrada (~4 s) os enfeites em laço param
    // a entrada só toca quando o cartão fica parado na tela (rolando rápido, nenhuma cena começa),
    // uma de cada vez com um pequeno intervalo: a rolagem fica leve mesmo no celular
    const fila = [];
    let tocando = 0;
    const proxima = () => {
      if (tocando || !fila.length) return;
      const el = fila.shift();
      if (!el.isConnected || !el._vis || el.classList.contains("play")) return proxima();
      tocando = 1; el.classList.add("play"); settle(el);
      setTimeout(() => { tocando = 0; proxima(); }, 160);
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      const el = e.target;
      el._vis = e.isIntersecting;
      el.classList.toggle("idle", !e.isIntersecting);
      clearTimeout(el._d);
      if (e.isIntersecting && !el.classList.contains("play")) el._d = setTimeout(() => { if (el._vis) { fila.push(el); proxima(); } }, 380);
    }), { threshold: 0.45 });
    root.querySelectorAll(".scene-card").forEach((el) => {
      io.observe(el);
      el.closest(".club-card")?.addEventListener("mouseenter", () => replay(el));
    });
    root.querySelectorAll(".scene-hero").forEach((el) => {
      el.classList.add("play");
      el.addEventListener("click", () => replay(el));
    });
  }
  function settle(el) { clearTimeout(el._s); el.classList.remove("settled"); el._s = setTimeout(() => el.classList.add("settled"), 4200); }
  function replay(el) { el.classList.remove("play"); void el.offsetWidth; el.classList.add("play"); if (el.classList.contains("scene-card")) settle(el); }

  /* bordão de cada clube, mostrado no topo da página do clube */
  const MOTTO = {
    cruzeiro: "Tão combatido, jamais vencido", flamengo: "Raça, amor e paixão", "atletico-mg": "Eu acredito!",
    "athletico-pr": "É o Furacão!", bahia: "Esquadrão de Aço", botafogo: "O Glorioso da Estrela Solitária",
    bragantino: "Massa Bruta", chapecoense: "Vamos, vamos, Chape!", corinthians: "Aqui é Corinthians!",
    coritiba: "Vamos, Coxa!", fluminense: "Time de guerreiros", gremio: "Imortal Tricolor",
    internacional: "O Clube do Povo", mirassol: "Vai, Leão!", palmeiras: "Avanti, Palestra!",
    remo: "Fenômeno Azul", santos: "Alvinegro Praiano", "sao-paulo": "Soberano",
    vasco: "Gigante da Colina", vitoria: "Leão da Barra",
  };

  window.SCENES = { scene, mount, caption: (id) => S[id] && S[id].cap, motto: (id) => MOTTO[id] || (S[id] && S[id].cap) };
})();
