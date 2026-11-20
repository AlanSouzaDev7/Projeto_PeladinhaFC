/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* "Por que essa nota?" (js/nota.js): a explicação soma exatamente a nota gravada pelo robô (server/jogadores.py),
   em todos os jogos de todos os clubes de dados/jogadores/. Uso: node tests/nota.mjs */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const { explica } = createRequire(import.meta.url)("../js/nota.js");
let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log("✓", nome); };
t("casos conhecidos: gol de zagueiro, goleiro sem sofrer gol, expulsão e menos de 10 minutos", () => {
  const z = explica({ min: 90, g: 1, gf: 1, ga: 0, desarmes: 3 }, "D");
  assert.equal(z.nota, 8.2); // 6 + 1,2 (gol de defensor) + 0,36 + 0,4 (sem sofrer) + 0,2 (vitória)
  assert.equal(z.itens[0].rotulo, "1 gol");
  const gk = explica({ min: 90, defesas: 4, gf: 0, ga: 0 }, "G");
  assert.equal(gk.nota, 7.6);
  const exp = explica({ min: 40, cv: 1, gf: 0, ga: 2 }, "M");
  assert.equal(exp.nota, 4.3);
  assert.equal(explica({ min: 8, g: 1 }, "F").nota, null);
  assert.equal(explica({ min: 90, g: 5, a: 3, gf: 6, ga: 0 }, "F").limite, "teto");
});
t("a explicação bate com a nota gravada pelo robô em todos os jogos", () => {
  const pasta = new URL("../dados/jogadores/", import.meta.url);
  let conferidos = 0;
  const erros = [];
  for (const arq of readdirSync(pasta).filter((f) => f.endsWith(".json"))) {
    const D = JSON.parse(readFileSync(new URL(arq, pasta), "utf8"));
    if (!D.campos?.includes("nota")) continue;
    for (const [aid, j] of Object.entries(D.jogadores || {})) {
      for (const row of j.jogos || []) {
        const x = Object.fromEntries(D.campos.map((c, i) => [c, row[i]]));
        if (x.nota == null) continue;
        conferidos++;
        const r = explica(x, j.pos);
        if (r.nota !== x.nota) erros.push(`${arq} ${aid} ${x.eid}: ${r.nota} ≠ ${x.nota}`);
      }
    }
  }
  assert.ok(conferidos > 1000, `poucos jogos conferidos (${conferidos})`);
  assert.deepEqual(erros.slice(0, 5), [], `${erros.length} de ${conferidos} notas diferentes`);
  console.log(`   ${conferidos} notas conferidas`);
});
console.log(`\n${ok} testes da explicação da nota passaram`);
