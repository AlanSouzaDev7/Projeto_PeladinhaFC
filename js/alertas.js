/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — botão "Avisar gols" do clube (alerta de gol do favorito, Web Push)
   Ao ligar: pede permissão de notificação, registra o service worker (sw.js), cria a inscrição de push com a chave
   pública VAPID do Worker e manda para o Worker a lista de clubes seguidos (POST <api>/alerta). Dá para seguir vários.
   A lista também fica no aparelho (localStorage e Cache Storage, para o service worker saber o que mostrar).
   No iPhone, o push da web só funciona com o site adicionado à tela de início (iOS 16.4 ou mais novo).
   No app 433Fut o botão não aparece (a WebView do Android não recebe push da web).
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const CHAVE = "placar:alertas";
  const esc = (t) => SEG.esc(t);
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalado = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  const suporta = () => !!API && !window.PLACAR_APP && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  const seguidos = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(CHAVE) || "[]"));
    } catch {
      return new Set();
    }
  };
  const guardaLista = async (lista) => {
    try { localStorage.setItem(CHAVE, JSON.stringify([...lista])); } catch { /* sem armazenamento: vale só nesta visita */ }
    try {
      const c = await caches.open("cazestats-alertas");
      await c.put("/alertas/clubes.json", new Response(JSON.stringify([...lista]), { headers: { "content-type": "application/json" } }));
    } catch { /* sem Cache Storage: o service worker mostra o aviso genérico */ }
  };
  const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

  async function inscricao() {
    const reg = await navigator.serviceWorker.register(`sw.js?api=${encodeURIComponent(API)}`);
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const r = await fetch(`${API}/alerta/chave`);
      const { chave } = r.ok ? await r.json() : {};
      if (!chave) throw new Error("alerta ainda não configurado no servidor");
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(chave) });
    }
    return sub;
  }
  async function envia(lista) {
    const sub = await inscricao();
    const r = await fetch(`${API}/alerta`, { method: "POST", body: JSON.stringify({ sub: sub.toJSON(), clubes: [...lista] }) });
    if (!r.ok) throw new Error(`servidor respondeu ${r.status}`);
    await guardaLista(lista);
  }

  function rotulo(on) {
    return on ? "Avisando gols" : "Avisar gols";
  }
  function botao(cid) {
    if (!API || window.PLACAR_APP) return "";
    const on = seguidos().has(cid);
    return `<button type="button" class="alerta-btn${on ? " on" : ""}" data-alerta="${esc(cid)}" aria-pressed="${on}">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
      <span>${rotulo(on)}</span></button><span class="alerta-msg" role="status" aria-live="polite"></span>`;
  }
  function mensagem(btn, txt) {
    const m = btn.nextElementSibling;
    if (m?.classList.contains("alerta-msg")) m.textContent = txt;
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-alerta]");
    if (!btn) return;
    e.preventDefault();
    const cid = btn.dataset.alerta, lista = seguidos(), ligar = !lista.has(cid);
    if (!suporta()) {
      return mensagem(btn, iOS && !instalado ? "No iPhone, adicione o site à tela de início (Compartilhar → Adicionar à Tela de Início) e ative por lá." : "Este navegador não recebe alertas de gol.");
    }
    if (ligar && Notification.permission === "denied") return mensagem(btn, "As notificações deste site estão bloqueadas nas configurações do navegador.");
    btn.disabled = true;
    try {
      if (ligar && Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") {
        mensagem(btn, "Sem permissão para notificar: o alerta não foi ligado.");
        return;
      }
      ligar ? lista.add(cid) : lista.delete(cid);
      await envia(lista);
      btn.classList.toggle("on", ligar);
      btn.setAttribute("aria-pressed", String(ligar));
      btn.querySelector("span").textContent = rotulo(ligar);
      mensagem(btn, ligar ? "Pronto: você recebe um aviso a cada gol." : "Alerta desligado.");
    } catch (err) {
      mensagem(btn, `Não deu para ${ligar ? "ligar" : "desligar"} agora (${String(err?.message || err).slice(0, 60)}).`);
    } finally {
      btn.disabled = false;
    }
  });

  window.ALERTAS = { botao, seguidos, suporta };
})();
