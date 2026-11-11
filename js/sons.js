/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — som do gol (Web Audio, sem arquivos de áudio)
   O único som do site: quando um clube marca, 5 s de
     - um grito de "GOOOOOL" (voz sintetizada: o "G", o "ô" segurado com vibrato e o "L" no fim);
     - a torcida vibrando ao fundo: o ronco da arquibancada, gente gritando e aplausos.
   Cada clube muda um pouco o tom da voz e a mistura da torcida (sorteados pelo nome do clube).
   Os hinos dos clubes têm autor e gravação protegidos (Lei 9.610/98) e não estão no site. Quem tiver a licença do
   instrumental pode pôr o arquivo em media/hinos/<id do clube>.mp3 e o id em PLACAR_CONFIG.hinos (js/config.js).
   O navegador só deixa tocar som depois do primeiro toque ou clique na página: até lá, nada toca (e nada quebra).
   ========================================================================== */
(() => {
  let ctx = null, saida = null;
  const historico = [];
  const AC = window.AudioContext || window.webkitAudioContext;

  function contexto() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      saida = ctx.createGain(); saida.gain.value = 0.9;
      saida.connect(comp).connect(ctx.destination);
    }
    return ctx;
  }
  // primeiro toque/clique/tecla: cria e destrava o áudio (Safari só destrava dentro do próprio gesto)
  const destrava = () => {
    const c = contexto();
    if (!c) return;
    if (c.state !== "running") c.resume().catch(() => {});
    try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch { /* ok */ }
  };
  ["pointerdown", "keydown", "touchend"].forEach((ev) => addEventListener(ev, destrava, { capture: true, passive: true }));

  /* ---------- peças ---------- */
  const ruidos = new WeakMap();
  function ruido(c) {
    if (ruidos.has(c)) return ruidos.get(c);
    const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; // ruído rosa: soa como multidão, não como chiado
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    ruidos.set(c, b);
    return b;
  }
  const fonteRuido = (c) => { const s = c.createBufferSource(); s.buffer = ruido(c); s.loop = true; return s; };
  const semente = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  function sorteio(seed) { let x = seed || 1; return () => ((x = Math.imul(x ^ (x >>> 15), 2246822519) ^ Math.imul(x ^ (x >>> 13), 3266489917)), (x >>> 0) / 4294967296); }

  // estilo de cada clube: tom da voz do grito e força da torcida
  function estilo(id) {
    const r = sorteio(semente(id || "placar"));
    return { tom: 150 + Math.floor(r() * 9) * 6, grito: +(2.9 + r() * 0.5).toFixed(2), torcida: +(0.85 + r() * 0.3).toFixed(2) };
  }

  /* arquibancada: ronco grave + chiado agudo, sobe com a bola na rede e vai baixando */
  function ronco(c, out, t0, fim) {
    const s = fonteRuido(c), lp = c.createBiquadFilter(), bp = c.createBiquadFilter(), g = c.createGain(), g2 = c.createGain();
    lp.type = "lowpass"; lp.frequency.value = 700; bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.35); g.gain.setTargetAtTime(0.35, t0 + 1.4, 1.2);
    g2.gain.setValueAtTime(0.0001, t0); g2.gain.exponentialRampToValueAtTime(0.22, t0 + 0.3); g2.gain.setTargetAtTime(0.1, t0 + 1.2, 1);
    s.connect(lp).connect(g).connect(out); s.connect(bp).connect(g2).connect(out);
    s.start(t0, Math.random()); s.stop(fim);
  }
  /* voz: dente de serra (as pregas vocais) passando pelos formantes da boca; frequências de cada formante mudam
     com o tempo para formar as vogais/consoantes. f = [[t, F1, F2, F3], ...] */
  function voz(c, out, t0, dur, { f0, vol, formas, alturas, vib = 0.02, sopro = 0.08 }) {
    const bocca = c.createGain(); bocca.gain.value = 0;
    const filtros = [[7, 1], [9, 0.55], [12, 0.25]].map(([q, v], i) => {
      const bp = c.createBiquadFilter(), g = c.createGain(); bp.type = "bandpass"; bp.Q.value = q; g.gain.value = v;
      formas.forEach(([t, ...F], k) => (k ? bp.frequency.linearRampToValueAtTime(F[i], t0 + t) : bp.frequency.setValueAtTime(F[i], t0 + t)));
      bocca.connect(bp).connect(g).connect(out); return bp;
    });
    void filtros;
    // pregas vocais: duas serras quase iguais (voz cheia) + um pouco de ar
    const pregas = c.createGain(); pregas.gain.value = 1; pregas.connect(bocca);
    const vib0 = c.createOscillator(), vg = c.createGain(); vib0.frequency.value = 5.6; vg.gain.value = 0;
    vg.gain.setValueAtTime(0, t0); vg.gain.linearRampToValueAtTime(f0 * vib, t0 + dur * 0.6); vib0.connect(vg);
    [-7, 7].forEach((cents) => {
      const o = c.createOscillator(); o.type = "sawtooth"; o.detune.value = cents;
      alturas.forEach(([t, k], i) => (i ? o.frequency.linearRampToValueAtTime(f0 * k, t0 + t) : o.frequency.setValueAtTime(f0 * k, t0 + t)));
      vg.connect(o.frequency);
      const og = c.createGain(); og.gain.value = 0.5; o.connect(og).connect(pregas); o.start(t0); o.stop(t0 + dur + 0.05);
    });
    const ar = fonteRuido(c), ag = c.createGain(); ag.gain.value = sopro; ar.connect(ag).connect(bocca); ar.start(t0, Math.random()); ar.stop(t0 + dur + 0.05);
    vib0.start(t0); vib0.stop(t0 + dur + 0.05);
    return bocca.gain; // volume ao longo do tempo: quem chama desenha
  }
  /* o grito de gol: "G" (estalo abafado), "ôôôôô" subindo e segurado com vibrato, "L" no fim */
  function gritoGol(c, out, t0, E) {
    const dur = E.grito;
    // "G": estalo curto e grave antes da vogal
    const st = fonteRuido(c), lp = c.createBiquadFilter(), sg = c.createGain();
    lp.type = "lowpass"; lp.frequency.value = 900; sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    st.connect(lp).connect(sg).connect(out); st.start(t0, Math.random()); st.stop(t0 + 0.08);
    const g = voz(c, out, t0 + 0.04, dur, {
      f0: E.tom, vol: 1, vib: 0.025, sopro: 0.06,
      // "ô" aberto (F1 ~ 520, F2 ~ 900), fecha um pouco e vira "L" (F1 baixo, F2 ~ 1150) no fim
      formas: [[0, 400, 1100, 2500], [0.08, 540, 900, 2550], [dur * 0.8, 500, 860, 2500], [dur - 0.18, 380, 1150, 2700], [dur, 330, 1200, 2800]],
      // começa mais grave, sobe com a emoção e segura; no fim cai um pouco
      alturas: [[0, 0.82], [0.25, 1.12], [0.6, 1.2], [dur * 0.85, 1.22], [dur, 1.05]],
    });
    g.setValueAtTime(0.0001, t0 + 0.04); g.exponentialRampToValueAtTime(1.15, t0 + 0.14);
    g.setValueAtTime(1.15, t0 + dur * 0.82); g.linearRampToValueAtTime(0.7, t0 + dur - 0.15); g.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.04);
    return dur;
  }
  /* torcida vibrando: muitas vozes soltas gritando ("êêê", "uhuu"), cada uma num tom, entrando e saindo */
  function vozesTorcida(c, out, t0, fim, vol) {
    const VOGAIS = [[700, 1800, 2600], [480, 900, 2500], [330, 900, 2300], [600, 1400, 2600]];
    for (let i = 0; i < 34; i++) {
      const ini = t0 + Math.random() * 1.8, dur = 0.8 + Math.random() * (fim - ini - 0.6);
      if (dur < 0.3) continue;
      const F = VOGAIS[Math.floor(Math.random() * VOGAIS.length)], f0 = 170 + Math.random() * 230;
      const g = voz(c, out, ini, dur, { f0, vol: 1, vib: 0.03, sopro: 0.25, formas: [[0, ...F], [dur, ...F.map((x) => x * (0.92 + Math.random() * 0.16))]], alturas: [[0, 0.9], [0.3, 1.05 + Math.random() * 0.1], [dur, 0.95]] });
      const v = vol * (0.025 + Math.random() * 0.025);
      g.setValueAtTime(0.0001, ini); g.exponentialRampToValueAtTime(v, ini + 0.12 + Math.random() * 0.2);
      g.setValueAtTime(v, ini + dur * 0.7); g.exponentialRampToValueAtTime(0.0001, ini + dur);
    }
  }
  /* aplausos: milhares de palmas = estalos curtos e brilhantes em ritmo aleatório */
  let palmasBuf = null;
  function aplausos(c, out, t0, fim, vol) {
    if (!palmasBuf || palmasBuf.sampleRate !== c.sampleRate) {
      const sr = c.sampleRate, n = sr * 3, b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let k = 0; k < 2600; k++) { // uma palma: ruído com queda rápida (~12 ms)
        const at = Math.floor(Math.random() * (n - sr * 0.02)), amp = 0.3 + Math.random() * 0.7, len = Math.floor(sr * (0.006 + Math.random() * 0.01));
        for (let j = 0; j < len; j++) d[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (len / 4));
      }
      palmasBuf = b;
    }
    const s = c.createBufferSource(), hp = c.createBiquadFilter(), pk = c.createBiquadFilter(), g = c.createGain();
    s.buffer = palmasBuf; s.loop = true; hp.type = "highpass"; hp.frequency.value = 700; pk.type = "peaking"; pk.frequency.value = 2200; pk.gain.value = 4;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol * 0.22, t0 + 0.6); g.gain.setTargetAtTime(vol * 0.15, t0 + 2, 1.2);
    s.connect(hp).connect(pk).connect(g).connect(out); s.start(t0, Math.random() * 2); s.stop(fim);
  }

  const DUR_GOL = 5;
  function gol(c, out, t0, id) {
    const E = estilo(id), fim = t0 + DUR_GOL;
    const mix = c.createGain(); mix.connect(out);
    mix.gain.setValueAtTime(0.5, t0); mix.gain.setValueAtTime(0.5, fim - 0.8); mix.gain.linearRampToValueAtTime(0, fim);
    // a torcida ao fundo: um pouco mais baixa enquanto o grito está no ar
    const fundo = c.createGain(); fundo.connect(mix);
    fundo.gain.setValueAtTime(E.torcida * 0.4, t0); fundo.gain.setValueAtTime(E.torcida * 0.4, t0 + E.grito); fundo.gain.linearRampToValueAtTime(E.torcida, t0 + E.grito + 0.4);
    ronco(c, fundo, t0, fim);
    vozesTorcida(c, fundo, t0 + 0.1, fim, 1);
    aplausos(c, fundo, t0 + 0.15, fim, 1);
    const frente = c.createGain(); frente.gain.value = 3.2; frente.connect(mix);
    gritoGol(c, frente, t0 + 0.05, E);
    return DUR_GOL;
  }

  /* instrumental licenciado (opcional): media/hinos/<id>.mp3, 5 s com final suave */
  const HINOS = new Set(((window.PLACAR_CONFIG || {}).hinos || []).filter((x) => /^[a-z-]{2,20}$/.test(x)));
  const bufHino = {};
  async function hino(c, out, t0, id) {
    bufHino[id] = bufHino[id] || fetch(`media/hinos/${id}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((a) => c.decodeAudioData(a));
    const b = await bufHino[id];
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = b;
    g.gain.setValueAtTime(1, t0); g.gain.setValueAtTime(1, t0 + DUR_GOL - 0.8); g.gain.linearRampToValueAtTime(0, t0 + DUR_GOL);
    s.connect(g).connect(out); s.start(t0); s.stop(t0 + DUR_GOL);
  }

  /* fila: dois gols juntos tocam um depois do outro */
  let livreEm = 0;
  function tocarGol(clube) {
    const reg = { tipo: "gol", clube: clube || null, em: Date.now(), tocou: false, motivo: "" };
    historico.push(reg); if (historico.length > 50) historico.shift();
    const c = contexto();
    if (!c) { reg.motivo = "sem Web Audio"; return reg; }
    if (c.state !== "running") { c.resume().catch(() => {}); if (c.state !== "running") { reg.motivo = "aguardando o primeiro toque na página"; return reg; } }
    const t0 = Math.max(c.currentTime + 0.03, livreEm);
    if (HINOS.has(clube)) hino(c, saida, t0, clube).catch(() => gol(c, saida, t0, clube)); else gol(c, saida, t0, clube);
    livreEm = t0 + DUR_GOL + 0.15;
    reg.tocou = true; reg.inicio = t0; reg.dur = DUR_GOL;
    return reg;
  }

  /* gravação (vídeo de demonstração e testes): o mesmo som num arquivo WAV */
  async function wav(clube) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = 44100, c = new OAC(2, Math.ceil(sr * (DUR_GOL + 0.2)), sr);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    const o = c.createGain(); o.gain.value = 0.9; o.connect(comp).connect(c.destination);
    gol(c, o, 0.02, clube);
    const buf = await c.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const ab = new ArrayBuffer(44 + n * 4), v = new DataView(ab), str = (o2, s) => [...s].forEach((ch, i) => v.setUint8(o2 + i, ch.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    let s = ""; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return btoa(s);
  }

  window.SONS = { gol: tocarGol, pronto: () => !!ctx && ctx.state === "running", estilo, wav, historico, DUR_GOL };
})();
