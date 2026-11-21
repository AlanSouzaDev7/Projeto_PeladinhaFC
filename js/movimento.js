/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* ==========================================================================
   CazéStats.TV — movimento adaptado ao aparelho (carregado no <head>, antes de tudo que anima)
   html.motion-leve: aparelho fraco ou economia de dados. As animações continuam, só mais simples (sem transição de
   página com foto da tela, cenas do topo em resolução 1x, sem o brilho que segue o mouse). Três jeitos de ligar:
     1) antes de abrir: pouca memória (≤ 2 GB), Android com 4 núcleos ou menos, ou "economizar dados" ligado;
     2) depois de abrir: nos primeiros 6 s, se mais de 1 em cada 5 quadros passar de 50 ms (o olho vê como tranco);
     3) quem tem "reduzir movimento" no sistema já fica sem animação (regras prefers-reduced-motion nos CSS).
   A escolha vale para a visita; "?movimento=cheio" na URL desliga o modo leve (para comparar).
   ========================================================================== */
(() => {
  "use strict";
  const html = document.documentElement, nav = navigator;
  if (/[?&]movimento=cheio/.test(location.search)) return;
  const fraco = (nav.deviceMemory && nav.deviceMemory <= 2)
    || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4 && /Android/i.test(nav.userAgent))
    || (nav.connection && nav.connection.saveData);
  if (fraco) { html.classList.add("motion-leve"); return; }
  // medição real: quadros lentos logo depois de abrir
  if (!window.requestAnimationFrame) return;
  let n = 0, lentos = 0, ult = 0;
  const inicio = performance.now();
  const passo = (t) => {
    if (ult) { n++; if (t - ult > 50) lentos++; }
    ult = t;
    if (t - inicio < 6000) { requestAnimationFrame(passo); return; }
    if (n > 30 && lentos / n > 0.2) { html.classList.add("motion-leve"); window.dispatchEvent(new Event("motion:leve")); }
  };
  // começa depois do carregamento: o primeiro desenho é pesado em qualquer aparelho e não diz nada
  addEventListener("load", () => setTimeout(() => requestAnimationFrame(passo), 1500), { once: true });
})();
