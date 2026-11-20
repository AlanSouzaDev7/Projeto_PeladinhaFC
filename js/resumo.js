/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* ==========================================================================
   CazéStats.TV — resumo automático da partida, escrito por regras (sem IA paga, texto próprio do CazéStats.TV)
     · antes do jogo: prévia com data, estádio, posição, pontos e a sequência recente de cada um
     · ao vivo: placar, minuto e gols até agora
     · depois: quem venceu, os gols e a situação na tabela
   O mesmo módulo roda no navegador (cartão "Resumo" da partida) e na montagem do site (scripts/montar-site.mjs),
   que põe o texto nas páginas que o Google lê.
   ========================================================================== */
(function (raiz) {
  "use strict";
  const FEMININO = new Set(["chapecoense", "portuguesa", "ponte-preta", "ferroviaria", "tombense"]);
  const art = (id) => (FEMININO.has(id) ? "a" : "o");
  const Art = (id) => (FEMININO.has(id) ? "A" : "O");
  const de = (id) => (FEMININO.has(id) ? "da" : "do");
  const com = (id) => (FEMININO.has(id) ? "com a" : "com o");
  const para = (id) => (FEMININO.has(id) ? "para a" : "para o");
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const ord = (id, n) => `${n}${FEMININO.has(id) ? "ª" : "º"}`; // a Chapecoense é 19ª
  const hora = (h) => h.replace(/^(\d{2}):00$/, "$1h").replace(":", "h");
  const numeral = (n) => ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"][n] ?? String(n);

  function estadio(v) {
    const t = String(v || "").replace(/^Estadio\b/, "Estádio").replace(/\s+/g, " ").trim();
    if (!t) return "";
    return `${/^(Arena|Vila|Neo|Ligga|Casa)\b/i.test(t) || /^[A-Z][\w]* Arena/.test(t) ? "na" : "no"} ${t}`;
  }
  function quando(data, h) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || "")) return "";
    const d = new Date(`${data}T12:00:00-03:00`);
    return `${SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${/^\d{2}:\d{2}$/.test(h || "") ? `, às ${hora(h)}` : ""}`;
  }
  const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs.at(-1)}`);
  function golsTexto(m, ctx) {
    const por = {};
    for (const g of m.gols || []) {
      const k = g.contra ? (g.clube === m.home ? m.away : m.home) : g.clube; // gol contra conta para o adversário
      (por[k] = por[k] || []).push(`${g.nome}${g.pen ? " (pênalti)" : ""}${g.contra ? " (contra)" : ""}`);
    }
    const partes = [m.home, m.away].filter((c) => por[c]?.length).map((c) => `${lista(por[c])} para ${art(c)} ${ctx.nome(c)}`);
    return partes.length ? `Gols: ${partes.join("; ")}.` : "";
  }
  function tabelaTexto(m, ctx) {
    const t = (c) => ctx.tabela?.(c);
    const a = t(m.home), b = t(m.away);
    if (!a || !b) return "";
    return `Na tabela, ${art(m.home)} ${ctx.nome(m.home)} é ${ord(m.home, a.pos)}, com ${a.p} pontos; ${art(m.away)} ${ctx.nome(m.away)}, ${ord(m.away, b.pos)}, com ${b.p}.`;
  }

  /* m: { home, away, hs, as, status ("ns"|"progress"|"ft"), clock, round, date, time, venue, gols: [{nome, clube, pen, contra}] }
     ctx: { nome(id) -> nome curto, tabela(id) -> {pos, p}, forma(id) -> "VVEDV" } */
  function partida(m, ctx) {
    const H = ctx.nome(m.home), A = ctx.nome(m.away), rodada = m.round ? `, pela ${m.round}ª rodada do Brasileirão` : "";
    const local = estadio(m.venue);
    if (m.status === "ft" && m.hs != null && m.as != null) {
      const placar = `${Math.max(m.hs, m.as)} a ${Math.min(m.hs, m.as)}`;
      const frase = m.hs === m.as
        ? `${Art(m.home)} ${H} empatou ${com(m.away)} ${A} por ${m.hs} a ${m.as}${local ? ` ${local}` : ""}${rodada}.`
        : m.hs > m.as
          ? `${Art(m.home)} ${H} venceu ${art(m.away)} ${A} por ${placar}${local ? ` ${local}` : ""}${rodada}.`
          : `${Art(m.away)} ${A} venceu ${art(m.home)} ${H} fora de casa, por ${placar}${local ? `, ${local}` : ""}${rodada}.`;
      const goleada = Math.abs(m.hs - m.as) >= 3 ? ` Foi uma goleada: ${numeral(Math.abs(m.hs - m.as))} gols de diferença.` : "";
      return { titulo: `${H} ${m.hs} x ${m.as} ${A}`, texto: [frase + goleada, golsTexto(m, ctx), tabelaTexto(m, ctx)].filter(Boolean).join(" ") };
    }
    if (m.status === "progress" && m.hs != null) {
      return { titulo: `${H} ${m.hs} x ${m.as} ${A}, ao vivo`, texto: [`${H} e ${A} se enfrentam agora${local ? ` ${local}` : ""}${rodada}. Placar: ${H} ${m.hs} x ${m.as} ${A}${m.clock ? `, aos ${m.clock}` : ""}.`, golsTexto(m, ctx)].filter(Boolean).join(" ") };
    }
    const f = (c) => ctx.forma?.(c);
    const t = (c) => ctx.tabela?.(c);
    const desc = (c) => {
      const x = t(c), s = f(c);
      return x ? `${art(c)} ${ctx.nome(c)} é ${ord(c, x.pos)}, com ${x.p} pontos${s ? `, e vem de ${s.split("").join("-")} nos últimos jogos` : ""}` : "";
    };
    const dia = quando(m.date, m.time);
    const abertura = `${Art(m.home)} ${H} recebe ${art(m.away)} ${A}${dia ? ` ${dia.startsWith("sábado") || dia.startsWith("domingo") ? "no" : "na"} ${dia}` : ""}${local ? `, ${local}` : ""}${rodada}.`;
    const tab = [desc(m.home), desc(m.away)].filter(Boolean);
    return {
      titulo: `${H} x ${A}: prévia`,
      texto: [abertura, tab.length === 2 ? `Na tabela, ${tab[0]}; ${tab[1]}.` : "", tab.some((x) => x.includes("vem de")) ? "(V vitória, E empate, D derrota.)" : ""].filter(Boolean).join(" "),
    };
  }
  const api = { partida, estadio, quando, _art: art, _de: de, _para: para };
  raiz.RESUMO = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
