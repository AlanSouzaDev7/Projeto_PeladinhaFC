/* © 2026 Alan Souza (AlanSouzaDev7). Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização do autor (veja LICENSE). */
/* PLACAR — relógio do placar ao vivo. Roda num Worker porque, com a aba em segundo plano, o navegador espaça os
   timers da página para 1 vez por minuto; os de um Worker continuam no ritmo pedido. Só devolve o número recebido. */
onmessage = (e) => { const { id, ms } = e.data || {}; setTimeout(() => postMessage(id), Math.max(0, Math.min(+ms || 0, 120000))); };
