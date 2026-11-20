/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — "Por que essa nota?": a nota de um jogador num jogo, parte por parte
   A mesma conta de server/jogadores.py (nota_jogo): parte de 6,0, de 3 a 10, pesando a posição. Aqui cada parte vira
   uma linha ("2 gols +2,0", "3 desarmes +0,4", "derrota −0,2"), para o torcedor ver o que pesou. O teste
   tests/nota.mjs confere que a soma bate com a nota gravada pelo robô em todos os jogos.
   Funciona no navegador (window.NOTA) e no Node (module.exports).
   ========================================================================== */
(function (raiz) {
  "use strict";
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  /* j: objeto do jogo (campos de dados/jogadores/<clube>.json: g, a, ch, alvo, dribles, ...); pos: G, D, M ou F */
  function explica(j, pos) {
    const v = (k) => Number(j?.[k]) || 0;
    const mins = v("min");
    if (mins < 10) return { nota: null, itens: [], motivo: "Menos de 10 minutos em campo: sem nota, como nos apps de placar." };
    const p = String(pos || "M").slice(0, 1);
    const itens = [];
    const soma = (rotulo, valor, grupo) => { if (Math.abs(valor) > 1e-9) itens.push({ rotulo, valor, grupo }); };
    // ataque
    soma(plural(v("g"), "gol", "gols"), v("g") * ("GD".includes(p) ? 1.2 : 1.0), "ataque");
    soma(plural(v("a"), "assistência", "assistências"), v("a") * 0.6, "ataque");
    const noAlvo = Math.max(0, v("alvo") - v("g")), fora = Math.max(0, v("ch") - v("alvo"));
    soma(plural(noAlvo, "finalização no gol sem marcar", "finalizações no gol sem marcar"), noAlvo * 0.15, "ataque");
    soma(plural(fora, "finalização para fora", "finalizações para fora"), fora * 0.03, "ataque");
    soma(plural(v("dribles"), "drible", "dribles"), v("dribles") * 0.08, "ataque");
    soma(plural(v("cruz"), "cruzamento", "cruzamentos"), v("cruz") * 0.03, "ataque");
    soma(`Participação com bola (${plural(v("toques"), "ação", "ações")})`, Math.min(0.4, v("toques") * 0.006), "ataque");
    // defesa
    soma(plural(v("desarmes"), "desarme", "desarmes"), v("desarmes") * 0.12, "defesa");
    soma(plural(v("intercept"), "interceptação", "interceptações"), v("intercept") * 0.1, "defesa");
    soma(plural(v("cortes"), "corte", "cortes"), v("cortes") * 0.06, "defesa");
    soma(plural(v("aereos"), "duelo aéreo ganho", "duelos aéreos ganhos"), v("aereos") * 0.05, "defesa");
    if (p === "G") soma(plural(v("defesas"), "defesa", "defesas"), v("defesas") * 0.25, "defesa");
    soma(plural(v("bloq"), "chute bloqueado", "chutes bloqueados"), v("bloq") * 0.08, "defesa");
    const ga = j?.ga;
    if (ga != null && "GD".includes(p)) {
      if (Number(ga) === 0 && mins >= 60) soma("Sem sofrer gol", p === "G" ? 0.6 : 0.4, "defesa");
      const sofridos = Number(ga) * Math.min(1, mins / 90);
      soma(`${plural(Number(ga), "gol sofrido", "gols sofridos")}${mins < 90 ? ` (${mins} min em campo)` : ""}`, -sofridos * (p === "G" ? 0.35 : 0.15), "defesa");
    }
    // erros e disciplina
    soma(plural(v("perdas"), "perda de bola", "perdas de bola"), -v("perdas") * 0.05, "erros");
    soma(plural(v("ca"), "cartão amarelo", "cartões amarelos"), -v("ca") * 0.3, "erros");
    soma(plural(v("cv"), "cartão vermelho", "cartões vermelhos"), -v("cv") * 1.5, "erros");
    // resultado
    const gf = j?.gf;
    if (gf != null && ga != null) soma(Number(gf) > Number(ga) ? "Vitória" : Number(gf) < Number(ga) ? "Derrota" : "Empate", Number(gf) > Number(ga) ? 0.2 : Number(gf) < Number(ga) ? -0.2 : 0, "resultado");
    const bruta = 6 + itens.reduce((t, x) => t + x.valor, 0);
    const nota = notaRobo(j, pos);
    itens.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    return { nota, bruta, itens, limite: bruta > 10 ? "teto" : bruta < 3 ? "piso" : null };
  }
  /* a nota em si, na MESMA ordem de somas e com o mesmo arredondamento de server/jogadores.py (round do Python:
     empate exato vai para o par). A explicação acima mostra as partes; a nota exibida vem daqui, igual à do robô. */
  function arredondaPy(x) {
    // empate exato (x,x5 guardado sem erro em binário) só acontece com quartos: 6,25, 6,75...; aí vai para o par.
    // Nos outros casos toFixed arredonda o valor binário exato, como o Python (7,55 é 7,5499... e vira 7,5)
    if (Number.isInteger(x * 4) && !Number.isInteger(x * 2)) { const baixo = Math.floor(x * 10); return (baixo % 2 === 0 ? baixo : baixo + 1) / 10; }
    return Number(x.toFixed(1));
  }
  function notaRobo(j, pos) {
    const v = (k) => Number(j?.[k]) || 0;
    const mins = v("min");
    if (mins < 10) return null;
    const p = String(pos || "M").slice(0, 1);
    let n = 6.0;
    n += v("g") * ("GD".includes(p) ? 1.2 : 1.0) + v("a") * 0.6;
    n += Math.max(0, v("alvo") - v("g")) * 0.15 + Math.max(0, v("ch") - v("alvo")) * 0.03;
    n += v("dribles") * 0.08 + v("cruz") * 0.03 + Math.min(0.4, v("toques") * 0.006);
    n += v("desarmes") * 0.12 + v("intercept") * 0.10 + v("cortes") * 0.06 + v("aereos") * 0.05;
    n += v("defesas") * (p === "G" ? 0.25 : 0) + v("bloq") * 0.08;
    const ga = j?.ga;
    if (ga != null && "GD".includes(p)) {
      const sofridos = Number(ga) * Math.min(1.0, mins / 90);
      if (Number(ga) === 0 && mins >= 60) n += p === "G" ? 0.6 : 0.4;
      n -= sofridos * (p === "G" ? 0.35 : 0.15);
    }
    n -= v("perdas") * 0.05 + v("ca") * 0.3 + v("cv") * 1.5;
    const gf = j?.gf;
    if (gf != null && ga != null) n += Number(gf) > Number(ga) ? 0.2 : Number(gf) < Number(ga) ? -0.2 : 0;
    return arredondaPy(Math.max(3.0, Math.min(10.0, n)));
  }
  const api = { explica, notaRobo };
  if (typeof module === "object" && module.exports) module.exports = api;
  raiz.NOTA = api;
})(typeof window !== "undefined" ? window : globalThis);
