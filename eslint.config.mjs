/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* Lint do JavaScript (ponto 8 do relatório de pontos fracos). Regras que pegam erro de verdade, sem mexer no estilo:
   os módulos do site falam entre si por variáveis globais em window (PD, SEG, DADOS...), por isso no-undef fica
   desligado e a lista de globais é só documentação. Formatação: .editorconfig. Rodar: npm run lint */
import js from "@eslint/js";
import globals from "globals";

const ERROS = {
  "no-dupe-keys": "error",
  "no-dupe-else-if": "error",
  "no-duplicate-case": "error",
  "no-unreachable": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-self-assign": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-const-assign": "error",
  "no-class-assign": "error",
  "valid-typeof": "error",
  "use-isnan": "error",
  "no-sparse-arrays": "error",
  "no-invalid-regexp": "error",
  "no-compare-neg-zero": "error",
  "no-cond-assign": ["error", "except-parens"],
  "getter-return": "error",
  "no-setter-return": "error",
  "constructor-super": "error",
  "no-this-before-super": "error",
  "for-direction": "error",
  "no-debugger": "error",
};

export default [
  { ignores: ["node_modules/**", "js/jogadores/**", "js/mercado/**", "js/competicoes/**", "dados/**", "app/android/**", "app/www/**", "tests/mobile/out/**",
    "js/live-data.js", "js/player-stats.js", "js/departamento-medico.js", "js/squads.js", "js/club-form.js", "js/heatmaps.js", "js/raio-x.js", "js/fotos.js", "js/escalacoes.js"] },
  {
    files: ["js/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: { ...globals.browser } },
    rules: ERROS,
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: ERROS,
  },
];
// js é usado só para manter a referência às regras recomendadas, caso se queira ligar mais delas no futuro
void js;
