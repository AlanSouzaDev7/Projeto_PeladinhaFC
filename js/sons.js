/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — som do gol (Web Audio, sem arquivos de áudio)
   O único som do site: quando um clube marca, 5 s de
     - o grito de "GOOOOOL" de um narrador (voz sintetizada como numa transmissão: pulso das pregas vocais com as
       pequenas irregularidades de uma voz de verdade, rouquidão do esforço, cinco ressonâncias da boca na vogal "ô",
       timbre de microfone de narrador e o eco do estádio);
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
    return { tom: 235 + Math.floor(r() * 9) * 7, grito: +(3.5 + r() * 0.4).toFixed(2), torcida: +(0.85 + r() * 0.3).toFixed(2) };
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
  /* ---------- o narrador ---------- */
  // pulso das pregas vocais: harmônicos caindo devagar (voz gritada é brilhante), não a "serra" zumbida
  const ondas = new WeakMap();
  function glote(c) {
    if (ondas.has(c)) return ondas.get(c);
    const N = 90, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) { const a = Math.pow(n, -1.35) * (1 + 0.25 * Math.cos(n * 0.9)); re[n] = a * 0.35; im[n] = a; }
    const w = c.createPeriodicWave(re, im);
    ondas.set(c, w); return w;
  }
  // oscilação irregular (jitter e shimmer de uma voz de verdade): ruído bem lento
  function tremor(c, t0, fim, hz, amp) {
    const s = fonteRuido(c), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = "lowpass"; lp.frequency.value = hz; lp.Q.value = 0.4; g.gain.value = amp;
    s.connect(lp).connect(g); s.start(t0, Math.random()); s.stop(fim);
    return g;
  }
  // eco do estádio: resposta ao impulso de ~1,6 s (ruído que decai), um pouco diferente em cada lado
  const salas = new WeakMap();
  function sala(c) {
    if (salas.has(c)) return salas.get(c);
    const sr = c.sampleRate, n = Math.floor(sr * 1.6), b = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.2) * (t < 0.02 ? t / 0.02 : 1) * (t < 0.008 ? 0 : 1); }
    }
    salas.set(c, b); return b;
  }
  const curva = (k) => { const a = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; a[i] = Math.tanh(k * x) / Math.tanh(k); } return a; };
  const rampa = (param, t0, pontos, f = 1) => pontos.forEach(([t, v], i) => (i ? param.linearRampToValueAtTime(v * f, t0 + t) : param.setValueAtTime(v * f, t0 + t)));
  /* o grito: "G" (velar: estalo com o tom subindo), "ôôôôô" que sobe, segura com vibrato e ondas de fôlego, "L" no fim */
  function narrador(c, out, t0, E) {
    const dur = E.grito, fim = t0 + dur + 0.12, f0 = E.tom;
    // transmissão: microfone de narrador (corta o grave, realça a presença), compressor de rádio, saturação leve, eco
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 150; hp.Q.value = 0.7;
    const pres = c.createBiquadFilter(); pres.type = "peaking"; pres.frequency.value = 3100; pres.Q.value = 0.9; pres.gain.value = 6;
    const corpo = c.createBiquadFilter(); corpo.type = "peaking"; corpo.frequency.value = 350; corpo.Q.value = 1; corpo.gain.value = 2.5;
    const topo = c.createBiquadFilter(); topo.type = "lowpass"; topo.frequency.value = 7800;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -26; comp.ratio.value = 8; comp.knee.value = 6; comp.attack.value = 0.002; comp.release.value = 0.09;
    const sat = c.createWaveShaper(); sat.curve = curva(1.6); sat.oversample = "2x";
    const seco = c.createGain(), conv = c.createConvolver(), molhado = c.createGain();
    seco.gain.value = 1; conv.buffer = sala(c); molhado.gain.value = 0.2;
    hp.connect(corpo).connect(pres).connect(topo).connect(comp).connect(sat);
    sat.connect(seco).connect(out); sat.connect(conv).connect(molhado).connect(out);
    // boca: 5 ressonâncias (formantes) da vogal "ô" gritada, que se mexem no "G" e no "L"
    const boca = c.createGain(); boca.gain.value = 0.0001;
    const L = dur - 0.22; // começo do "L"
    [
      { f: [[0, 300], [0.07, 640], [L, 600], [dur, 380]], bw: 95, g: 1 },
      { f: [[0, 1850], [0.08, 1060], [L, 990], [dur, 1250]], bw: 115, g: 0.6 },
      { f: [[0, 2100], [0.08, 2550], [L, 2600], [dur, 2850]], bw: 170, g: 0.24 },
      { f: [[0, 3350]], bw: 230, g: 0.17 },
      { f: [[0, 4300]], bw: 320, g: 0.08 },
    ].forEach((x) => {
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = "bandpass"; rampa(bp.frequency, t0, x.f); bp.Q.value = (x.f[1] || x.f[0])[1] / x.bw; g.gain.value = x.g;
      boca.connect(bp).connect(g).connect(hp);
    });
    // pregas vocais: tom que começa mais baixo, sobe com a emoção, segura lá em cima e cai no "L"
    const o = c.createOscillator(); o.setPeriodicWave(glote(c));
    rampa(o.frequency, t0, [[0, 0.74], [0.1, 0.98], [0.42, 1.17], [1.1, 1.21], [dur * 0.78, 1.25], [L, 1.22], [dur, 0.97]], f0);
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.setValueAtTime(5.0, t0); vib.frequency.linearRampToValueAtTime(6.1, t0 + dur);
    rampa(vg.gain, t0, [[0, 0], [0.55, 0], [dur * 0.7, 0.032], [L, 0.036], [dur, 0.01]], f0);
    vib.connect(vg).connect(o.frequency);
    tremor(c, t0, fim, 8, f0 * 0.05).connect(o.frequency);           // jitter: o tom nunca fica parado
    const prega = c.createGain(); prega.gain.value = 1;
    tremor(c, t0, fim, 12, 0.35).connect(prega.gain);                 // shimmer: o volume treme um pouco
    const esforco = c.createWaveShaper(); esforco.curve = curva(2.6);  // a voz "rasga" no grito
    o.connect(prega).connect(esforco).connect(boca);
    // ar: sopro que pulsa junto com cada ciclo da voz (rouquidão)
    const ar = fonteRuido(c), arF = c.createBiquadFilter(), arG = c.createGain(), mod = c.createGain();
    arF.type = "highpass"; arF.frequency.value = 1200; arG.gain.value = 0.05; mod.gain.value = 0.07;
    o.connect(mod).connect(arG.gain); ar.connect(arF).connect(arG).connect(boca);
    // "G": estalo curto na região da garganta, logo antes da voz
    const gs = fonteRuido(c), gbp = c.createBiquadFilter(), gg = c.createGain();
    gbp.type = "bandpass"; gbp.frequency.value = 1700; gbp.Q.value = 2;
    gg.gain.setValueAtTime(0.0001, t0); gg.gain.exponentialRampToValueAtTime(0.9, t0 + 0.006); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    gs.connect(gbp).connect(gg).connect(hp); gs.start(t0, Math.random()); gs.stop(t0 + 0.06);
    // volume: entra forte, ondas de fôlego no "ô" longo, "L" mais baixo e o fim
    const vb = boca.gain;
    vb.setValueAtTime(0.0001, t0 + 0.012); vb.exponentialRampToValueAtTime(1, t0 + 0.09);
    for (let t = 0.6; t < L - 0.3; t += 0.55 + Math.random() * 0.3) { vb.linearRampToValueAtTime(0.86 + Math.random() * 0.08, t0 + t); vb.linearRampToValueAtTime(1, t0 + t + 0.25); }
    vb.linearRampToValueAtTime(0.92, t0 + L); vb.linearRampToValueAtTime(0.5, t0 + dur - 0.03); vb.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.1);
    [o, vib].forEach((n) => { n.start(t0); n.stop(fim); }); ar.start(t0, Math.random()); ar.stop(fim);
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
    const frente = c.createGain(); frente.gain.value = 0.85; frente.connect(mix);
    narrador(c, frente, t0 + 0.05, E);
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
