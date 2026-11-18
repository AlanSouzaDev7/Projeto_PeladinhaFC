/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Autor: Alan Evangelista de Souza Martins. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   PLACAR — carregador único dos arquivos de dados gravados pelo robô
   Todo módulo que precisa de um arquivo de dados pede aqui: DADOS.carrega("jogadores/cruzeiro").
     1) lê dados/<nome>.json (fetch) e limpa com SEG.json: nenhum código baixado é executado;
     2) se o JSON ainda não existir (transição: o robô passou a gravá-lo agora), carrega o js/<nome>.js antigo,
        que é sempre um arquivo do próprio site, e limpa o resultado do mesmo jeito;
     3) publica no mesmo global de hoje (window.RAIO_X, window.JOGADORES_CLUBE[cid]...), então quem já lia
        o global continua funcionando sem mudar nada.
   No app, DADOS.base aponta para o endereço remoto dos dados; o .js antigo nunca é buscado fora do aparelho.
   ========================================================================== */
(() => {
  "use strict";
  // nome do arquivo -> onde o dado fica no site. "*" = um item de uma coleção (o id vem do nome).
  const DESTINO = {
    "live-data": "LIVE_DATA",
    "player-stats": "PLAYER_STATS",
    "departamento-medico": "DM",
    "club-form": "CLUB_FORM",
    heatmaps: "HEATMAPS",
    "raio-x": "RAIO_X",
    escalacoes: "ESCALACOES",
    fotos: "FOTOS",
    squads: ["SQUADS", "SQUADS_LAST", "SQUADS_META"],
    "mercado/global": "MERCADO_GLOBAL",
    "jogadores/*": "JOGADORES_CLUBE",
    "competicoes/*": "COMPETICOES",
    "mercado/*": "MERCADO",
  };
  const NOME_OK = /^[a-z][a-z-]{1,30}(\/[a-z0-9][a-z0-9-]{0,30})?$/;
  const promessas = new Map();
  const APP = !!window.PLACAR_APP;
  let ultimoErro = null;

  const destino = (nome) => {
    if (DESTINO[nome]) return { tipo: "global", alvo: DESTINO[nome] };
    const [pasta, id] = nome.split("/");
    if (id && DESTINO[`${pasta}/*`]) return { tipo: "colecao", alvo: DESTINO[`${pasta}/*`], id };
    return null;
  };
  const le = (d) => {
    if (d.tipo === "colecao") return window[d.alvo]?.[d.id];
    if (Array.isArray(d.alvo))
      return d.alvo.some((g) => window[g] !== undefined) ? Object.fromEntries(d.alvo.map((g) => [g, window[g]])) : undefined;
    return window[d.alvo];
  };
  const publica = (d, valor) => {
    if (d.tipo === "colecao") (window[d.alvo] = window[d.alvo] || {})[d.id] = valor;
    else if (Array.isArray(d.alvo))
      d.alvo.forEach((g) => {
        if (valor && g in valor) window[g] = valor[g];
      });
    else window[d.alvo] = valor;
    return valor;
  };
  // arquivo antigo (js/<nome>.js): só do próprio site, nunca de outro endereço
  const scriptLocal = (nome, fresco) =>
    new Promise((res) => {
      const s = document.createElement("script");
      s.src = `js/${nome}.js${fresco ? `?v=${Date.now()}` : ""}`;
      s.onload = s.onerror = () => {
        s.remove();
        res();
      };
      document.head.appendChild(s);
    });

  /* app: a última resposta boa de cada arquivo fica gravada no aparelho (Filesystem do Capacitor, pasta de dados do app) */
  const fs = () => (DADOS.guardar && window.Capacitor?.Plugins?.Filesystem) || null;
  // lista do que já foi guardado: sem cópia, nem procura (o plugin registraria um erro no console a cada arquivo ausente)
  const LISTA = "433:dados-guardados";
  const lista = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(LISTA) || "[]"));
    } catch {
      return new Set();
    }
  };
  function guarda(nome, txt) {
    const F = fs();
    if (!F) return;
    F.writeFile({ path: `dados/${nome}.json`, data: txt, directory: "DATA", encoding: "utf8", recursive: true })
      .then(() => {
        const l = lista();
        if (l.has(nome)) return;
        l.add(nome);
        try {
          localStorage.setItem(LISTA, JSON.stringify([...l]));
        } catch {
          /* sem armazenamento: só não marca (a cópia em arquivo continua lá) */
        }
      })
      .catch(() => {});
  }
  async function guardado(nome) {
    const F = fs();
    if (!F || !lista().has(nome)) return null;
    try {
      return SEG.le((await F.readFile({ path: `dados/${nome}.json`, directory: "DATA", encoding: "utf8" })).data);
    } catch {
      return null; // primeira vez sem rede, ou cópia estragada
    }
  }
  async function embutido(nome) {
    if (!DADOS.reserva) return null;
    try {
      const r = await fetch(`${DADOS.reserva}${nome}.json`);
      return r.ok ? await SEG.json(r) : null;
    } catch {
      return null;
    }
  }

  async function busca(nome, fresco) {
    const d = destino(nome);
    if (!d || !NOME_OK.test(nome)) throw new Error(`arquivo de dados desconhecido: ${nome}`);
    try {
      const r = await fetch(`${DADOS.base}${nome}.json${fresco ? `?v=${Date.now()}` : ""}`, { cache: fresco ? "no-store" : "default" });
      if (r.ok) {
        const txt = await r.text();
        const v = SEG.le(txt); // JSON pela metade ou corrompido: cai no catch e fica o último dado bom
        guarda(nome, txt);
        return publica(d, v);
      }
      ultimoErro = `${nome}.json: HTTP ${r.status}`;
    } catch (e) {
      ultimoErro = `${nome}.json: ${e && e.message}`;
    }
    if (DADOS.semScriptAntigo) {
      // app sem rede (ou JSON ruim): a última cópia boa guardada no aparelho; senão, o retrato que veio no APK
      const v = (await guardado(nome)) ?? (await embutido(nome));
      return v != null ? publica(d, v) : (le(d) ?? null);
    }
    const antes = le(d);
    await scriptLocal(nome, fresco);
    const v = le(d);
    if (v === undefined || v === antes) return v ?? null;
    return publica(d, SEG.limpa(v));
  }

  /* carrega(nome): o dado (do cache desta visita, se já veio); carrega(nome, { fresco: true }): relê do servidor */
  function carrega(nome, { fresco = false } = {}) {
    if (!fresco && promessas.has(nome)) return promessas.get(nome);
    const p = busca(nome, fresco).catch((e) => {
      ultimoErro = String(e && e.message);
      promessas.delete(nome);
      return null;
    });
    if (!fresco) promessas.set(nome, p);
    return p;
  }

  /* ---------- dados velhos (E5): quando o robô gravou pela última vez ----------
     dados/meta.json traz "quando" (segundos desde 1970). Sem ele (transição), vale o "updated" do live-data
     ("14/11/2026 às 17:57", horário de Brasília). Passou de 1 hora: aparece a faixa de aviso. No app (sempreHora),
     a hora do último dado aparece sempre, discreta, e vira aviso depois de 1 hora. */
  const LIMITE_MIN = 60;
  const doTexto = (t) => {
    const m = /(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}):(\d{2})/.exec(t || "");
    return m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`) : NaN;
  };
  async function gravadoEm() {
    try {
      const r = await fetch(`${DADOS.base}meta.json?v=${Date.now()}`, { cache: "no-store" });
      if (r.ok) {
        const m = await SEG.json(r);
        if (Number.isFinite(m.quando)) return m.quando * 1000;
      }
    } catch {
      /* sem rede: usa o que já está no aparelho */
    }
    return doTexto(window.LIVE_DATA?.updated);
  }
  const hhmm = (ms) =>
    new Date(ms)
      .toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })
      .replace(", ", " às ");
  async function confereIdade() {
    const ms = await gravadoEm();
    let el = document.getElementById("dados-idade");
    if (!Number.isFinite(ms)) {
      if (el) el.hidden = true;
      return;
    }
    const min = Math.round((Date.now() - ms) / 60000),
      velho = min > LIMITE_MIN;
    if (!velho && !DADOS.sempreHora) {
      if (el) el.hidden = true;
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "dados-idade";
      el.setAttribute("role", "status");
      (document.getElementById("ticker") || document.querySelector("header"))?.insertAdjacentElement("afterend", el);
    }
    el.className = velho ? "dados-idade velho" : "dados-idade";
    el.textContent = velho ? `Dados de ${hhmm(ms)}: podem estar desatualizados.` : `Dados de ${hhmm(ms)}`;
    el.hidden = false;
  }
  const DADOS = {
    base: (window.PLACAR_CONFIG && window.PLACAR_CONFIG.dados) || "dados/", // no app: endereço remoto dos dados
    // no app (window.PLACAR_APP, ligado por js/app-nativo.js antes deste arquivo):
    semScriptAntigo: APP, // nunca recorre ao .js
    sempreHora: APP, // mostra sempre a hora do último dado
    guardar: APP, // guarda a última resposta boa no aparelho
    reserva: APP ? "dados/" : "", // o retrato dos dados que veio dentro do APK
    carrega,
    gravadoEm,
    confereIdade,
    ultimoErro: () => ultimoErro,
  };
  window.DADOS = DADOS;
  // confere ao abrir, a cada 5 minutos e quando a pessoa volta para a aba ou para o app
  const agenda = () => setTimeout(() => confereIdade().catch(() => {}), 0);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", agenda);
  else agenda();
  setInterval(() => {
    if (!document.hidden) confereIdade().catch(() => {});
  }, 5 * 60e3);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) confereIdade().catch(() => {});
  });
})();
