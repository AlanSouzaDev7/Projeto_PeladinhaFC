/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — entrar com Google para o app Android (entrar-app.html, aberta no navegador do sistema pelo app)
   O app manda o desafio (SHA-256 de um verificador que fica guardado nele). Aqui a pessoa entra com Google; o Worker
   cria a sessão e devolve só um código de uso único (POST /conta/entrar-app), que volta para o app por
   cazestats://entrar?codigo=... O app troca código + verificador pela sessão (POST /conta/troca).
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const CLIENTE = (window.PLACAR_CONFIG && window.PLACAR_CONFIG.googleClientId) || "";
  const PACOTE = "io.github.alansouzadev7.futebol"; // appId do app (app/capacitor.config.json)
  const $ = (id) => document.getElementById(id);
  const msg = (t, erro = false) => { $("msg").textContent = t; $("msg").className = erro ? "erro" : ""; };
  const desafio = new URLSearchParams(location.search).get("desafio") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(desafio)) { msg("Abra esta página pelo botão Entrar do app.", true); return; }
  if (!API || !CLIENTE) { msg("O login está desligado no momento.", true); return; }

  // Android: o link intent:// abre o app certo (e só ele); cazestats:// fica como reserva
  const linkDoApp = (codigo) => (/Android/i.test(navigator.userAgent)
    ? `intent://entrar?codigo=${encodeURIComponent(codigo)}#Intent;scheme=cazestats;package=${PACOTE};end`
    : `cazestats://entrar?codigo=${encodeURIComponent(codigo)}`);

  async function entrou(credential) {
    msg("Entrando…");
    try {
      const r = await fetch(`${API}/conta/entrar-app`, { method: "POST", body: JSON.stringify({ credential, desafio }) });
      const d = await SEG.json(r);
      if (!r.ok || !d.codigo) throw new Error(d.erro || `servidor respondeu ${r.status}`);
      const link = linkDoApp(d.codigo);
      $("google").hidden = true;
      $("voltar").href = link;
      $("voltar").hidden = false;
      msg("Pronto! Voltando para o app…");
      location.href = link; // alguns navegadores só abrem o app depois de um toque: o botão acima fica para isso
      setTimeout(() => msg("Se o app não abriu, toque em “Voltar para o app”. O código vale 5 minutos."), 1500);
    } catch (e) {
      msg(`Não deu para entrar: ${String(e.message || e)}`, true);
    }
  }

  const sc = document.createElement("script");
  sc.src = "https://accounts.google.com/gsi/client";
  sc.async = true;
  sc.onload = () => {
    window.google.accounts.id.initialize({ client_id: CLIENTE, callback: (r) => entrou(r.credential), ux_mode: "popup", auto_select: false });
    window.google.accounts.id.renderButton($("google"), { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "pt-BR", width: 260 });
  };
  sc.onerror = () => msg("Não deu para carregar o Google. Confira a internet e tente de novo.", true);
  document.head.appendChild(sc);
})();
