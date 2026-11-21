/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Autor: Alan Evangelista de Souza Martins. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — camada nativa do app Android (Capacitor). Faz parte do site e só liga dentro do app:
   o app abre o próprio site publicado (app/capacitor.config.json: server.url) e acrescenta "CazeStatsApp/<versão>" ao
   user agent. Assim toda atualização do site chega ao app na hora, sem novo APK (o APK só muda quando a parte nativa muda).
     · dados e placar: os mesmos do site, em tempo real (placar da ESPN a cada 5 s com o app aberto, parado em segundo
       plano); sem internet, a última cópia guardada (service worker e js/dados.js);
     · entrar com Google: o Google não deixa entrar dentro do app; abre o navegador, a pessoa entra no site e volta com um
       código de uso único que só vale com o verificador guardado aqui (PKCE; worker/conta.mjs: entrarApp e trocaCodigo);
     · botão voltar, links externos no navegador do sistema, compartilhar e salvar imagem, barra de status e splash.
   Carregado logo depois de js/config.js e antes de js/dados.js (que lê window.PLACAR_APP).
   ========================================================================== */
(() => {
  "use strict";
  // só dentro do app: no navegador comum este arquivo não faz nada
  const ua = /CazeStatsApp\/([\d.]+)/.exec(navigator.userAgent || "");
  if (!ua) return;
  window.PLACAR_APP = true;
  window.APP_VERSAO = ua[1];
  document.documentElement.classList.add("app-nativo");
  // o manual pede fundo escuro e denso: o app começa no tema escuro (a escolha de quem trocar continua valendo)
  try {
    if (!localStorage.getItem("placar:theme")) localStorage.setItem("placar:theme", JSON.stringify("dark"));
  } catch {
    /* armazenamento indisponível: segue o tema do sistema */
  }

  const cap = () => window.Capacitor?.Plugins || {};
  const nativo = () => !!window.Capacitor?.isNativePlatform?.();

  /* ---------- botão voltar: volta nas telas; na tela inicial, sai do app ---------- */
  const inicio = () => !location.hash || location.hash === "#" || location.hash === "#/";
  const esc = (alvo) => alvo.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  function voltar() {
    // primeiro fecha o que está aberto por cima da tela (os mesmos painéis que o Esc fecha no computador)
    const campo = document.activeElement;
    if (campo && campo.matches?.("input, textarea")) {
      esc(campo);
      campo.blur();
      return;
    }
    if (document.querySelector("[data-cal-det]:not([hidden]), .scorer-card.open")) return esc(document);
    if (inicio()) return cap().App?.exitApp();
    if (history.length > 1) history.back();
    else location.hash = "#/";
  }

  /* ---------- segundo plano: nenhuma consulta; na volta, atualiza na hora ---------- */
  function estado(ativo) {
    if (!window.PD) return;
    window.PD.pausado = !ativo;
    if (!ativo) window.dispatchEvent(new Event("placar:pausa")); // vídeos e cenas param
    if (ativo) {
      window.dispatchEvent(new Event("placar:volta"));
      window.DADOS?.confereIdade().catch(() => {});
    }
  }

  /* ---------- links para fora: navegador do sistema (o app nunca sai do próprio endereço) ---------- */
  function linkExterno(ev) {
    const a = ev.target.closest?.("a[href]");
    if (!a) return;
    let u;
    try {
      u = new URL(a.getAttribute("href"), location.href);
    } catch {
      return;
    }
    if (u.origin === location.origin) return;
    ev.preventDefault();
    if (u.protocol !== "https:" && u.protocol !== "http:") return;
    const B = cap().Browser;
    if (B) B.open({ url: u.href });
    else window.open(u.href, "_blank", "noopener");
  }

  /* ---------- salvar e compartilhar (cartaz em PNG/PDF, link do elenco) ---------- */
  const base64 = (blob) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  async function arquivo(blob, nome) {
    const F = cap().Filesystem;
    const limpo = String(nome).replace(/[^\w.-]+/g, "-");
    const r = await F.writeFile({ path: `compartilhar/${limpo}`, data: await base64(blob), directory: "CACHE", recursive: true });
    return r.uri;
  }
  // a pessoa fechou o seletor sem escolher: não é erro (nem mostra o link cru na tela)
  const compartilhar = (opcoes) =>
    cap()
      .Share.share(opcoes)
      .catch((e) => {
        if (!/cancel/i.test(String(e && (e.message || e)))) throw e;
      });
  const APP_NATIVO = {
    // o cartaz vai para o seletor do sistema (salvar em arquivos, WhatsApp, e-mail...)
    async baixa(blob, nome) {
      if (!nativo() || !cap().Filesystem || !cap().Share) return false;
      const uri = await arquivo(blob, nome);
      await compartilhar({ title: nome, files: [uri], dialogTitle: "Salvar ou enviar" });
      return true;
    },
    async compartilha({ title, text, url, blob, nome }) {
      if (!nativo() || !cap().Share) return false;
      const files = blob && cap().Filesystem ? [await arquivo(blob, nome || "imagem.png")] : undefined;
      await compartilhar({ title, text, url, files, dialogTitle: "Compartilhar" });
      return true;
    },
  };
  /* ---------- entrar com Google pelo navegador do sistema e voltar com um código (PKCE) ---------- */
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const VERIF = "cazestats:app-verificador";
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  APP_NATIVO.entrar = async () => {
    const verificador = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const desafio = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
    try { localStorage.setItem(VERIF, JSON.stringify({ verificador, quando: Date.now() })); } catch { /* sem armazenamento */ }
    const url = `${location.origin}/entrar-app?desafio=${desafio}`; // o Cloudflare Pages serve entrar-app.html sem a extensão
    if (cap().Browser) await cap().Browser.open({ url, presentationStyle: "popover" });
    else window.open(url, "_blank", "noopener");
  };
  async function voltouDoLogin(endereco) {
    let u;
    try { u = new URL(endereco); } catch { return; }
    if (u.protocol !== "cazestats:" || u.host !== "entrar") return;
    const codigo = u.searchParams.get("codigo") || "";
    cap().Browser?.close?.().catch(() => {});
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(VERIF) || "null"); localStorage.removeItem(VERIF); } catch { /* nada */ }
    if (!guardado || Date.now() - guardado.quando > 10 * 60e3 || !/^[\w-]{20,60}$/.test(codigo)) return window.CONTA?.avisa?.("O login expirou. Toque em Entrar de novo.");
    try {
      const r = await fetch(`${API}/conta/troca`, { method: "POST", body: JSON.stringify({ codigo, verificador: guardado.verificador }) });
      const d = await SEG.json(r);
      if (!r.ok) throw new Error(d.erro || `servidor respondeu ${r.status}`);
      await window.CONTA?.recebeSessao?.(d);
    } catch (e) {
      window.CONTA?.avisa?.(String(e.message || e));
    }
  }
  window.APP_NATIVO = APP_NATIVO;

  /* ---------- abertura do app (só ao abrir do zero; não toca ao voltar do segundo plano) ----------
     Começa no mesmo quadro da splash do Android (o símbolo no centro, sobre Noite). Os 11 módulos entram em campo de
     baixo para cima, como o manual lê a formação (goleiro, defesa, meio-campo, ataque), o centroavante acende em
     Refletor e o símbolo voa até o lugar dele no cabeçalho enquanto o fundo se abre e "CazéStats.TV" aparece.
     Só transform e opacity (Web Animations API: roda fora da linha principal). Cerca de 1,3 s; um toque pula.
     Movimento reduzido: sem abertura. Se os dados ainda não chegaram, a revelação espera (no máximo 2,5 s). */
  // a formação numa caixa de 100 (a mesma de scripts/marca-433.mjs): [x, y, linha], linha 0 = goleiro
  const FORMACAO = [
    [50, 78, 0],
    [23, 60, 1],
    [41, 60, 1],
    [59, 60, 1],
    [77, 60, 1],
    [30, 42, 2],
    [50, 42, 2],
    [70, 42, 2],
    [30, 24, 3],
    [50, 24, 3, "lima"],
    [70, 24, 3],
  ];
  const TAM_SPLASH = 127; // dp: o símbolo ocupa 44% do ícone de 288 dp da splash do Android 12+
  /* som da abertura (Web Audio, sintetizado aqui: nenhum arquivo de áudio, nada de terceiros). Um "vush" suave quando a
     formação sobe, uma nota de marimba por linha (goleiro, defesa, meio, ataque: Sol, Dó, Mi, Sol), um "plim" no
     centroavante e, com o nome, um acorde claro com a torcida crescendo baixinho. Volume moderado; o botão do canto
     desliga (fica guardado). Sem áudio liberado pelo aparelho, a abertura segue em silêncio. */
  const SOM = "cazestats:intro-som";
  const somLigado = () => { try { return localStorage.getItem(SOM) !== "0"; } catch { return true; } };
  function somAbertura(tempos) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !somLigado()) return null;
    let c;
    try { c = new AC(); } catch { return null; }
    if (c.state !== "running") c.resume().catch(() => {});
    const mestre = c.createGain(), comp = c.createDynamicsCompressor();
    mestre.gain.value = 0.42; comp.threshold.value = -16; comp.ratio.value = 3;
    mestre.connect(comp).connect(c.destination);
    const t0 = c.currentTime + 0.05, em = (ms) => t0 + ms / 1000;
    const ruido = (seg) => {
      const b = c.createBuffer(1, Math.ceil(c.sampleRate * seg), c.sampleRate), d = b.getChannelData(0);
      let ult = 0;
      for (let k = 0; k < d.length; k++) { ult = 0.97 * ult + 0.03 * (Math.random() * 2 - 1); d[k] = ult * 6; }
      const s = c.createBufferSource(); s.buffer = b; return s;
    };
    const env = (g, t, pico, ataque, queda) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pico, t + ataque); g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + queda); };
    // "vush": ruído passando por um filtro que abre
    {
      const n = ruido(0.7), f = c.createBiquadFilter(), g = c.createGain();
      f.type = "bandpass"; f.Q.value = 0.9;
      f.frequency.setValueAtTime(260, em(tempos.sobe)); f.frequency.exponentialRampToValueAtTime(2600, em(tempos.sobe + 520));
      env(g, em(tempos.sobe), 0.22, 0.18, 0.45);
      n.connect(f).connect(g).connect(mestre); n.start(em(tempos.sobe)); n.stop(em(tempos.sobe + 700));
    }
    // marimba: seno com um parcial 4x mais agudo que some rápido
    const marimba = (freq, ms, vol = 0.35) => {
      const t = em(ms);
      for (const [mult, v, queda] of [[1, vol, 0.42], [4, vol * 0.18, 0.09]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.frequency.value = freq * mult; env(g, t, v, 0.006, queda);
        o.connect(g).connect(mestre); o.start(t); o.stop(t + 0.6);
      }
    };
    [196, 261.6, 329.6, 392].forEach((f, linha) => marimba(f, tempos.linhas[linha]));
    marimba(784, tempos.lima, 0.22);
    // acorde do nome (Dó maior aberto) e a torcida crescendo baixinho
    {
      const t = em(tempos.nome);
      for (const [f, v] of [[130.8, 0.16], [523.3, 0.12], [659.3, 0.1], [784, 0.09], [1046.5, 0.05]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = "triangle"; o.frequency.value = f; env(g, t, v, 0.02, 1.25);
        o.connect(g).connect(mestre); o.start(t); o.stop(t + 1.5);
      }
      const n = ruido(1.6), f = c.createBiquadFilter(), g = c.createGain();
      f.type = "lowpass"; f.frequency.value = 950;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      n.connect(f).connect(g).connect(mestre); n.start(t); n.stop(t + 1.6);
    }
    console.info(`CazeStatsApp: som da abertura ${c.state === "running" ? "tocando" : `(${c.state})`}`);
    return { estado: () => c.state, para: () => { try { mestre.gain.cancelScheduledValues(c.currentTime); mestre.gain.setTargetAtTime(0, c.currentTime, 0.04); setTimeout(() => c.close().catch(() => {}), 400); } catch { /* já fechado */ } } };
  }

  function intro() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !document.body.animate) return null;
    const capa = document.createElement("div");
    capa.className = "intro433";
    capa.style.setProperty("--i433", `${TAM_SPLASH}px`);
    // só marcação fixa deste arquivo (nenhum dado de fora entra aqui)
    const NOME = ["C", "a", "z", "é", "S", "t", "a", "t", "s", ".", "T", "V"];
    const ligado = somLigado();
    // cada peça fica dentro de um "voo" (tela inteira, sem transformação própria até o fim): o voo final até o cabeçalho é
    // calculado nele, centrado na posição visível da peça, sem somar com as animações de antes (que desviavam o pouso)
    capa.innerHTML = `<div class="i433-fundo"></div><div class="i433-voo"><div class="i433-simbolo" aria-hidden="true"><div class="i433-quadro"></div>${FORMACAO.map(
      ([x, y, , l]) => `<i class="i433-mod${l ? " lima" : ""}" style="left:${x - 4.5}%;top:${y - 4.5}%"></i>`,
    ).join("")}</div></div><div class="i433-voo"><div class="i433-nome" aria-hidden="true">${NOME.map((l, i) => `<span class="${i >= 9 ? "tv" : ""}">${l}</span>`).join("")}</div></div>
      <button type="button" class="i433-som" aria-label="${ligado ? "Desligar o som da abertura" : "Ligar o som da abertura"}" aria-pressed="${!ligado}">${ligado ? "Som ligado" : "Som desligado"}</button>`;
    document.body.appendChild(capa);
    const simbolo = capa.querySelector(".i433-simbolo"), fundo = capa.querySelector(".i433-fundo"), nome = capa.querySelector(".i433-nome");
    const letras = [...nome.children], botaoSom = capa.querySelector(".i433-som");
    const marca = document.querySelector(".l433-mark"), palavra = document.querySelector(".l433-word");
    const animacoes = [];
    const anima = (el, quadros, op) => { const a = el.animate(quadros, { fill: "both", ...op }); animacoes.push(a); return a; };
    const SAI = "cubic-bezier(0.22, 1, 0.36, 1)", MOLA = "cubic-bezier(0.34, 1.32, 0.64, 1)";
    // tempos (ms): a formação sobe linha por linha, o centroavante acende, o símbolo sobe e o nome aparece
    const T = { sobe: 60, linhas: [100, 210, 320, 430], lima: 640, nome: 900 };
    const som = somAbertura(T);
    // 1) entrada em campo: cada linha "sobe" e assenta, de baixo para cima
    capa.querySelectorAll(".i433-mod").forEach((m, i) => {
      const linha = FORMACAO[i][2];
      anima(m, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-16%) scale(1.24)", offset: 0.45 }, { transform: "translateY(0) scale(1)" }],
        { duration: 460, delay: T.linhas[linha], easing: MOLA });
    });
    anima(capa.querySelector(".i433-mod.lima"), [{ transform: "scale(1)" }, { transform: "scale(1.6)", offset: 0.4 }, { transform: "scale(1)" }],
      { duration: 420, delay: T.lima, easing: SAI, composite: "add" });
    // 2) o símbolo sobe um pouco e o nome entra letra por letra, cada uma assentando com uma mola leve
    anima(simbolo, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-46px) scale(0.86)" }], { duration: 620, delay: T.nome - 120, easing: SAI });
    letras.forEach((l, i) => anima(l, [{ opacity: 0, transform: "translateY(70%)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 520, delay: T.nome + i * 42, easing: MOLA }));
    anima(botaoSom, [{ opacity: 0 }, { opacity: 0.75 }], { duration: 400, delay: 300, easing: SAI });
    let pulou = false;
    const fecha = () => {
      animacoes.forEach((a) => a.finish());
      capa.remove();
      if (marca) marca.style.opacity = "";
      if (palavra) palavra.style.opacity = "";
    };
    botaoSom.addEventListener("pointerdown", (e) => e.stopPropagation());
    botaoSom.addEventListener("click", (e) => {
      e.stopPropagation();
      const liga = !somLigado();
      try { localStorage.setItem(SOM, liga ? "1" : "0"); } catch { /* sem armazenamento */ }
      botaoSom.textContent = liga ? "Som ligado" : "Som desligado";
      botaoSom.setAttribute("aria-pressed", String(!liga));
      botaoSom.setAttribute("aria-label", liga ? "Desligar o som da abertura" : "Ligar o som da abertura");
      if (!liga) som?.para();
    });
    capa.addEventListener("pointerdown", () => { pulou = true; som?.para(); fecha(); }, { once: true });
    if (marca) marca.style.opacity = "0";
    if (palavra) palavra.style.opacity = "0";
    // 3) revelação: com o nome completo e a primeira tela pronta, símbolo e nome voam até o cabeçalho
    const prontos = Promise.race([Promise.resolve(window.PD_BOOT).catch(() => {}), new Promise((r) => setTimeout(r, 2600))]);
    const entrada = new Promise((r) => setTimeout(r, T.nome + letras.length * 42 + 620));
    return Promise.all([prontos, entrada]).then(async () => {
      if (pulou || !capa.isConnected) return;
      const DUR = 640;
      const voa = (el, alvo) => {
        const voo = el.parentElement, de = el.getBoundingClientRect(), para = alvo?.getBoundingClientRect();
        if (!para || !para.width) return anima(voo, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR * 0.6, easing: SAI });
        const cx = de.left + de.width / 2, cy = de.top + de.height / 2, k = para.height / de.height;
        voo.style.transformOrigin = `${cx}px ${cy}px`;
        const dx = para.left + para.width / 2 - cx, dy = para.top + para.height / 2 - cy;
        return anima(voo, [{ transform: "translate(0, 0) scale(1)" }, { transform: `translate(${dx}px, ${dy}px) scale(${k})` }], { duration: DUR, easing: SAI });
      };
      voa(simbolo, marca);
      voa(nome, palavra);
      anima(fundo, [{ opacity: 1 }, { opacity: 0 }], { duration: DUR * 0.85, delay: DUR * 0.15, easing: "ease-out" });
      anima(botaoSom, [{ opacity: 0.75 }, { opacity: 0 }], { duration: 200, easing: "ease-out" });
      await new Promise((r) => setTimeout(r, DUR + 60));
      if (!pulou) fecha();
    });
  }

  /* ---------- ao abrir: plugins, dados novos e splash ---------- */
  async function liga() {
    document.addEventListener("click", linkExterno, true);
    const { App, StatusBar, SplashScreen } = cap();
    if (App) {
      App.addListener("backButton", voltar);
      App.addListener("appStateChange", ({ isActive }) => estado(isActive));
      App.addListener("appUrlOpen", ({ url }) => voltouDoLogin(url)); // cazestats://entrar?codigo=... (login no navegador)
    }
    if (StatusBar) {
      // ícones da barra de status legíveis no tema da página: escuros no claro, claros no escuro (e quando o tema muda)
      const raiz = document.documentElement;
      const pinta = () => {
        // a página só desenha atrás da barra quando o Capacitor manda a margem de cima; senão a faixa é o fundo Noite
        // do Android (styles.xml) e os ícones ficam sempre claros
        const sob = parseFloat(getComputedStyle(raiz).getPropertyValue("--safe-area-inset-top")) > 0;
        const claro = sob && raiz.dataset.theme === "light";
        StatusBar.setStyle({ style: claro ? "LIGHT" : "DARK" }).catch(() => {});
        // atrás da barra: Cal no tema claro, Noite no escuro (vale nos WebViews em que o Android pinta essa faixa)
        StatusBar.setBackgroundColor?.({ color: claro ? "#F1EDE1" : "#0B0B0D" })?.catch?.(() => {});
      };
      pinta();
      new MutationObserver(pinta).observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
    }
    // abertura: o primeiro quadro é igual à splash do Android; só depois de pintado a splash nativa sai (sem corte)
    const abertura = intro();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    SplashScreen?.hide({ fadeOutDuration: abertura ? 0 : 200 }).catch(() => {});
    try {
      await window.PD_BOOT;
    } catch {
      /* segue com a cópia guardada */
    }
    // tempo até a primeira tela com dados (aparece no logcat do Android: medido no QA, tests/qa/apk.mjs)
    console.info(`CazeStatsApp: primeira tela em ${Math.round(performance.now())} ms`);
    // relê os arquivos que o index.html carrega de saída (pode ser a cópia guardada sem internet)
    const D = window.DADOS;
    if (D) {
      await Promise.all(["squads", "player-stats", "departamento-medico"].map((n) => D.carrega(n, { fresco: true })));
      window.dispatchEvent(new Event("placar:data"));
      window.PD?.vigiar?.("app abriu"); // relê a tabela e os jogos (live-data) e confere os jogos parados
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", liga);
  else liga();
})();
