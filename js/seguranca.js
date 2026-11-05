/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — camada de segurança do navegador
   Carregado no <head>, antes de qualquer outro script. Vale para tudo o que
   existe hoje e para o que for criado depois:
     - todo dado que chega de fora (fetch, JSON, arquivos de dados, armazenamento
       local) passa por uma limpeza antes de ser usado;
     - links só abrem endereços web; páginas novas abrem isoladas desta;
     - o site não funciona dentro de moldura (iframe) de outro endereço.
   ========================================================================== */
(() => {
  "use strict";

  /* ---------- tema antes de desenhar a página (antes era um script embutido no HTML) ---------- */
  try {
    const t = JSON.parse(localStorage.getItem("placar:theme"));
    document.documentElement.dataset.theme = t === "light" || t === "dark" ? t : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch (e) { /* armazenamento indisponível */ }

  /* ---------- não abrir dentro de moldura de outro site ---------- */
  if (window.top !== window.self) {
    let mesmo = false;
    try { mesmo = window.top.location.origin === window.location.origin; } catch (e) { mesmo = false; }
    if (!mesmo) {
      document.documentElement.style.display = "none";
      try { window.top.location.replace(window.location.href); } catch (e) { /* o navegador bloqueou: a página continua escondida */ }
    }
  }

  /* ---------- limpeza de texto e de endereços ---------- */
  // caracteres de controle e de inversão de direção do texto (usados para disfarçar conteúdo)
  const CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
  const PERIGOSO = /^[\s\u0000-\u001F]*(javascript|vbscript|data|file|blob|filesystem)\s*:/i;
  const CHAVES_URL = /^(link|url|href|src|foto|photo|image|imagem|logo|idolPhoto|headshot)$/i;
  const PROIBIDAS = new Set(["__proto__", "constructor", "prototype"]);
  const LIMITE = 20000; // texto maior que isso não é dado de futebol

  const texto = (s) => {
    let v = String(s);
    if (v.length > LIMITE) v = v.slice(0, LIMITE);
    return v.replace(CONTROLE, "").replace(/</g, "‹").replace(/>/g, "›").replace(/"/g, "”").replace(/`/g, "´");
  };
  // só endereços web (https/http) ou caminhos do próprio site
  function url(u) {
    if (u == null) return "#";
    // o navegador ignora tabulação e quebra de linha no meio do endereço ("java	script:"): saem antes da conferência
    const v = String(u).replace(CONTROLE, "").replace(/[\t\n\r]/g, "").trim();
    if (!v || PERIGOSO.test(v) || /^[\\/]{2}/.test(v)) return "#";
    // caminho do próprio site (sem esquema)
    if (!/^[a-z][\w+.-]*:/i.test(v)) return v.replace(/["<>`\\]/g, "");
    try {
      const x = new URL(v, location.href);
      if (x.protocol !== "https:" && x.protocol !== "http:") return "#";
      if (x.username || x.password) return "#";
      return x.href.replace(/["<>`]/g, (c) => encodeURIComponent(c));
    } catch (e) { return "#"; }
  }
  // HTML: para quem montar marcação com dado de fora
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[c]);

  // percorre o dado inteiro (objetos e listas), limpando cada texto no lugar
  function limpa(d, prof = 0) {
    if (typeof d === "string") return texto(d);
    if (!d || typeof d !== "object" || prof > 40) return d;
    if (Array.isArray(d)) {
      for (let i = 0; i < d.length; i++) d[i] = limpa(d[i], prof + 1);
      return d;
    }
    for (const k of Object.keys(d)) {
      if (PROIBIDAS.has(k)) { delete d[k]; continue; }
      const v = d[k];
      const limpo = typeof v === "string" && CHAVES_URL.test(k) ? url(v) : limpa(v, prof + 1);
      // a chave também pode virar texto na tela (ex.: nome do adversário)
      const k2 = texto(k);
      if (k2 !== k) { delete d[k]; if (!PROIBIDAS.has(k2)) d[k2] = limpo; } else d[k] = limpo;
    }
    return d;
  }

  /* ---------- todo JSON que entrar no site já chega limpo ---------- */
  const parseOriginal = JSON.parse;
  const parse = function (txt, reviver) { return limpa(parseOriginal.call(JSON, txt, reviver)); };
  Object.defineProperty(JSON, "parse", { value: parse, writable: false, configurable: false });
  if (window.Response && Response.prototype.json) {
    const jsonOriginal = Response.prototype.json;
    Object.defineProperty(Response.prototype, "json", {
      value: function () { return jsonOriginal.call(this).then((d) => limpa(d)); },
      writable: false, configurable: false,
    });
  }

  /* ---------- links: só endereços web; as páginas de fora abrem isoladas ---------- */
  const guarda = (e) => {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const h = a.getAttribute("href");
    if (PERIGOSO.test((h || "").replace(/[\t\n\r]/g, ""))) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (a.target === "_blank" || /^https?:/i.test(h)) {
      const rel = new Set((a.rel || "").split(/\s+/).filter(Boolean));
      rel.add("noopener"); rel.add("noreferrer");
      a.rel = [...rel].join(" ");
    }
  };
  ["click", "auxclick", "keydown"].forEach((t) => document.addEventListener(t, guarda, true));

  // avisos de política de segurança (CSP): ficam no console para quem estiver testando
  document.addEventListener("securitypolicyviolation", (e) => {
    try { console.warn("[PLACAR] bloqueado pela política de segurança:", e.violatedDirective, e.blockedURI || ""); } catch (x) { /* sem console */ }
  });

  window.SEG = Object.freeze({ esc, url, texto, limpa });
})();
