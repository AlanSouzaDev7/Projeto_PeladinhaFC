/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — site instalável e modo offline
     · registra o service worker (sw.js) ao abrir o site, no mesmo endereço que o alerta usa (um só registro)
     · aviso discreto quando a internet cai: o site continua com os últimos dados guardados
     · botão "Instalar o app" no rodapé quando o navegador oferece a instalação
   No app Android o service worker também roda (o app abre o site publicado e precisa dele sem internet); o botão
   de instalar não aparece lá.
   ========================================================================== */
(() => {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`sw.js?api=${encodeURIComponent(API)}`).catch(() => { /* sem service worker: o site funciona online normalmente */ });
  });

  function aviso() {
    let el = document.getElementById("offline-aviso");
    if (navigator.onLine) { el?.remove(); return; }
    if (el) return;
    el = document.createElement("div");
    el.id = "offline-aviso";
    el.className = "offline-aviso";
    el.setAttribute("role", "status");
    el.textContent = "Sem internet: mostrando os últimos dados guardados neste aparelho.";
    document.body.appendChild(el);
  }
  window.addEventListener("online", aviso);
  window.addEventListener("offline", aviso);
  document.addEventListener("DOMContentLoaded", aviso);

  let pedido = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pedido = e;
    document.querySelectorAll("[data-instalar]").forEach((b) => { b.hidden = false; });
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-instalar]");
    if (!b || !pedido) return;
    e.preventDefault();
    pedido.prompt();
    await pedido.userChoice.catch(() => null);
    pedido = null;
    document.querySelectorAll("[data-instalar]").forEach((x) => { x.hidden = true; });
  });
  window.addEventListener("appinstalled", () => document.querySelectorAll("[data-instalar]").forEach((x) => { x.hidden = true; }));
})();
