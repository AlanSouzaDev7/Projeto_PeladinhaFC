/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — botão "Ativar avisos" do clube (alertas do favorito, Web Push)
   O torcedor escolhe o que quer receber: gols, início, intervalo, escalação confirmada e fim de jogo (a mesma escolha
   vale para todos os clubes que segue).
   Ao ligar: pede permissão de notificação, registra o service worker (sw.js), cria a inscrição de push com a chave
   pública VAPID do Worker e manda para o Worker a lista de clubes seguidos (POST <api>/alerta). Dá para seguir vários.
   A lista também fica no aparelho (localStorage e Cache Storage, para o service worker saber o que mostrar).
   No iPhone, o push da web só funciona com o site adicionado à tela de início (iOS 16.4 ou mais novo).
   No app 433Fut o botão não aparece (a WebView do Android não recebe push da web).
   ========================================================================== */
(() => {
  "use strict";
  const API = ((window.PLACAR_CONFIG && window.PLACAR_CONFIG.api) || "").replace(/\/+$/, "");
  const CHAVE = "placar:alertas", CHAVE_TIPOS = "placar:alertas-tipos";
  const TIPOS = [["gol", "Gols"], ["inicio", "Início"], ["intervalo", "Intervalo"], ["escalacao", "Escalação"], ["fim", "Fim de jogo"]];
  const PADRAO = ["gol", "inicio", "escalacao", "fim"];
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
  const tiposEscolhidos = () => {
    try {
      const t = JSON.parse(localStorage.getItem(CHAVE_TIPOS) || "null");
      const ok = Array.isArray(t) ? TIPOS.map(([k]) => k).filter((k) => t.includes(k)) : [];
      return ok.length ? ok : PADRAO;
    } catch {
      return PADRAO;
    }
  };
  const guardaLista = async (lista, tipos) => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify([...lista]));
      localStorage.setItem(CHAVE_TIPOS, JSON.stringify(tipos));
    } catch { /* sem armazenamento: vale só nesta visita */ }
    try {
      const c = await caches.open("cazestats-alertas");
      const poe = (url, v) => c.put(url, new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } }));
      await Promise.all([poe("/alertas/clubes.json", [...lista]), poe("/alertas/tipos.json", tipos)]);
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
  async function envia(lista, tipos = tiposEscolhidos()) {
    const sub = await inscricao();
    const r = await fetch(`${API}/alerta`, { method: "POST", body: JSON.stringify({ sub: sub.toJSON(), clubes: [...lista], tipos }) });
    if (!r.ok) throw new Error(`servidor respondeu ${r.status}`);
    await guardaLista(lista, tipos);
  }

  function rotulo(on) {
    return on ? "Avisos ligados" : "Ativar avisos";
  }
  // o que avisar: botões liga/desliga, aparecem quando o alerta do clube está ligado
  function tiposHTML(on) {
    const marcados = tiposEscolhidos();
    return `<div class="alerta-tipos" role="group" aria-label="O que avisar"${on ? "" : " hidden"}>${TIPOS.map(([k, nome]) =>
      `<button type="button" class="alerta-tipo" data-alerta-tipo="${k}" aria-pressed="${marcados.includes(k)}">${nome}</button>`).join("")}</div>`;
  }
  function botao(cid) {
    if (!API || window.PLACAR_APP) return "";
    const on = seguidos().has(cid);
    return `<button type="button" class="alerta-btn${on ? " on" : ""}" data-alerta="${esc(cid)}" aria-pressed="${on}">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
      <span>${rotulo(on)}</span></button><span class="alerta-msg" role="status" aria-live="polite"></span>${tiposHTML(on)}`;
  }
  function mensagem(btn, txt) {
    const m = btn.closest(".alerta-wrap")?.querySelector(".alerta-msg") || btn.nextElementSibling;
    if (m?.classList.contains("alerta-msg")) m.textContent = txt;
  }

  // trocar o que avisar: vale para todos os clubes seguidos (manda a inscrição de novo)
  document.addEventListener("click", async (e) => {
    const chip = e.target.closest("[data-alerta-tipo]");
    if (!chip) return;
    e.preventDefault();
    const atuais = tiposEscolhidos(), k = chip.dataset.alertaTipo, ligar = !atuais.includes(k);
    const novos = TIPOS.map(([t]) => t).filter((t) => (t === k ? ligar : atuais.includes(t)));
    if (!novos.length) return mensagem(chip, "Deixe pelo menos um aviso marcado (ou desligue os avisos do clube).");
    const grupo = chip.closest(".alerta-tipos");
    grupo.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
      await envia(seguidos(), novos);
      document.querySelectorAll(`[data-alerta-tipo="${k}"]`).forEach((b) => b.setAttribute("aria-pressed", String(ligar)));
      mensagem(chip, `${TIPOS.find(([t]) => t === k)[1]}: ${ligar ? "vai avisar" : "não vai mais avisar"}.`);
    } catch (err) {
      mensagem(chip, `Não deu para salvar agora (${String(err?.message || err).slice(0, 60)}).`);
    } finally {
      grupo.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    }
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-alerta]");
    if (!btn) return;
    e.preventDefault();
    const cid = btn.dataset.alerta, lista = seguidos(), ligar = !lista.has(cid);
    if (!suporta()) {
      return mensagem(btn, iOS && !instalado ? "No iPhone, adicione o site à tela de início (Compartilhar → Adicionar à Tela de Início) e ative por lá." : "Este navegador não recebe avisos.");
    }
    if (ligar && Notification.permission === "denied") return mensagem(btn, "As notificações deste site estão bloqueadas nas configurações do navegador.");
    btn.disabled = true;
    try {
      if (ligar && Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") {
        mensagem(btn, "Sem permissão para notificar: os avisos não foram ligados.");
        return;
      }
      ligar ? lista.add(cid) : lista.delete(cid);
      await envia(lista);
      btn.classList.toggle("on", ligar);
      btn.setAttribute("aria-pressed", String(ligar));
      btn.querySelector("span").textContent = rotulo(ligar);
      const grupo = btn.closest(".alerta-wrap")?.querySelector(".alerta-tipos");
      if (grupo) grupo.hidden = !ligar;
      mensagem(btn, ligar ? "Pronto. Escolha abaixo o que quer receber." : "Avisos desligados.");
    } catch (err) {
      mensagem(btn, `Não deu para ${ligar ? "ligar" : "desligar"} agora (${String(err?.message || err).slice(0, 60)}).`);
    } finally {
      btn.disabled = false;
    }
  });

  // o bolão liga os avisos dele com a mesma inscrição de push (js/bolao.js); o service worker precisa saber
  const marcaBolao = async (ligado) => {
    try {
      const c = await caches.open("cazestats-alertas");
      await c.put("/alertas/bolao.json", new Response(JSON.stringify(!!ligado), { headers: { "content-type": "application/json" } }));
    } catch { /* sem Cache Storage: o aparelho mostra o aviso genérico */ }
  };
  window.ALERTAS = { botao, seguidos, suporta, tipos: tiposEscolhidos, inscricao, marcaBolao, iOS, instalado };
})();
