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
  // versão nova publicada com o site aberto: o service worker novo assume e aparece o convite para recarregar (o código
  // carregado na aba continua o antigo até lá). Na primeira visita não há aviso: não existia versão anterior.
  const tinhaControle = !!navigator.serviceWorker.controller;
  let avisado = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!tinhaControle || avisado) return;
    avisado = true;
    const el = document.createElement("div");
    el.className = "offline-aviso versao-nova";
    el.setAttribute("role", "status");
    el.innerHTML = 'Versão nova do CazéStats.TV publicada. <button type="button">Atualizar</button>';
    el.querySelector("button").addEventListener("click", () => location.reload());
    document.body.appendChild(el);
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`sw.js?api=${encodeURIComponent(API)}`).then((reg) => {
      // aba aberta por muito tempo (ou o app em segundo plano): procura versão nova a cada 30 min e ao voltar para a aba
      setInterval(() => reg.update().catch(() => {}), 30 * 60e3);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => { /* sem service worker: o site funciona online normalmente */ });
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
