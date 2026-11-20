/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* Gera a tabela da matriz de compatibilidade (Markdown) a partir de tests/qa/out/matriz.json.
   Status por perfil: APROVADO (nenhum problema), APROVADO COM RESSALVAS (só texto < 11 px decorativo ou alvos
   pequenos), REPROVADO (rola para os lados, erro de JavaScript, falha de carga ou controle sem nome).
   Uso: node tests/qa/tabela-matriz.mjs > saida.md */
import { readFileSync } from "node:fs";

const { resultado, quando } = JSON.parse(readFileSync(new URL("./out/matriz.json", import.meta.url), "utf8"));
const perfis = [...new Set(resultado.map((r) => r.perfil))];
const linhas = perfis.map((perfil) => {
  const rs = resultado.filter((r) => r.perfil === perfil), r0 = rs[0];
  const grave = rs.filter((r) => r.falha || r.overflow || r.erros?.length || r.semNome?.length || r.camposSemRotulo?.length);
  const ressalva = rs.filter((r) => r.alvosPequenos || r.textoMini > 3);
  const status = grave.length ? "REPROVADO" : ressalva.length ? "APROVADO COM RESSALVAS" : "APROVADO";
  const notas = [
    grave.length && `${grave.length} página(s) com problema grave: ${grave.map((r) => r.rota).join(", ")}`,
    ressalva.some((r) => r.alvosPequenos) && `alvos de toque < 24 px em ${ressalva.filter((r) => r.alvosPequenos).length} página(s)`,
    ressalva.some((r) => r.textoMini > 3) && `texto < 11 px (números da camisa, posições no campinho) em ${ressalva.filter((r) => r.textoMini > 3).map((r) => r.rota).join(", ")}`,
  ].filter(Boolean).join("; ");
  const motor = { chrome: "Chrome", edge: "Edge", webkit: "WebKit" }[r0.motor];
  return `| ${r0.categoria} | ${perfil.replace(/ \((Chrome|Edge|WebKit)[^)]*\)/, "")} | ${r0.vw}×${r0.vh} | ${r0.vw > r0.vh ? "Paisagem" : "Retrato"} | ${motor} | ${rs.length} | ${status} | ${notas || "–"} |`;
});
console.log(`Matriz gerada em ${quando} · ${resultado.length} carregamentos de página · ${perfis.length} perfis (emulação, não aparelho físico)\n`);
console.log("| Categoria | Dispositivo/perfil | Tela CSS | Orientação | Motor | Páginas | Resultado | Observações |");
console.log("|---|---|---|---|---|---|---|---|");
console.log(linhas.join("\n"));
