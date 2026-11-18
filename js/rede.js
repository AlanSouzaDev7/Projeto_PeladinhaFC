/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — rede: escala e observabilidade pelo Worker da Cloudflare (worker/ao-vivo.mjs)
   Liga só quando PLACAR_CONFIG.api (ou aoVivo) tem o endereço do Worker (vazio: o site funciona como antes).
     1) Escala (E1 do relatório): toda consulta do site à ESPN vai para <Worker>/espn/<host>/<caminho>, que guarda a
        resposta na borda por 1 a 2 s. Mil visitantes num jogo = uma consulta por segundo à ESPN. Se o Worker falhar,
        a mesma consulta vai direto à ESPN (o placar nunca para por causa do Worker).
     2) Observabilidade (E5): erros de JavaScript vão para <Worker>/erro (banco D1), no máximo 5 por visita, só a
        mensagem e o arquivo:linha (nada que identifique quem visita).
   ========================================================================== */
(() => {
  "use strict";
  const base = ((window.PLACAR_CONFIG && (window.PLACAR_CONFIG.api || window.PLACAR_CONFIG.aoVivo)) || "").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base)) return;
  const ESPN = /^https:\/\/(site\.api\.espn\.com|site\.web\.api\.espn\.com)(\/apis\/[^?#]*)(\?[^#]*)?$/;
  const original = window.fetch.bind(window);
  let falhasSeguidas = 0;
  window.fetch = function (entrada, opcoes) {
    const url = typeof entrada === "string" ? entrada : entrada && entrada.url;
    const m = typeof url === "string" && falhasSeguidas < 3 ? ESPN.exec(url) : null;
    if (!m) return original(entrada, opcoes);
    return original(`${base}/espn/${m[1]}${m[2]}${m[3] || ""}`, opcoes)
      .then((r) => {
        if (!r.ok) throw new Error(`Worker ${r.status}`);
        falhasSeguidas = 0;
        return r;
      })
      .catch(() => {
        falhasSeguidas++; // depois de 3 falhas seguidas, vai direto à ESPN nesta visita
        return original(entrada, opcoes);
      });
  };
  let enviados = 0;
  const envia = (msg, onde) => {
    if (enviados >= 5 || !msg) return;
    enviados++;
    const corpo = JSON.stringify({ m: String(msg).slice(0, 300), o: String(onde || "").slice(0, 120) });
    try {
      navigator.sendBeacon ? navigator.sendBeacon(`${base}/erro`, corpo) : original(`${base}/erro`, { method: "POST", body: corpo, keepalive: true });
    } catch {
      /* sem rede: o erro só não é registrado */
    }
  };
  window.addEventListener("error", (e) => envia(e.message, e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : ""));
  window.addEventListener("unhandledrejection", (e) => envia(e.reason && (e.reason.message || e.reason), "promessa"));
})();
