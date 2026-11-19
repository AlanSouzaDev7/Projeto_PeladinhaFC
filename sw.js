/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* CazéStats.TV — service worker dos alertas do favorito (registrado por js/alertas.js, só quando a pessoa liga um alerta).
   O Worker manda um aviso SEM conteúdo; aqui ele vira notificação: lê os avisos recentes (GET <api>/gols/recentes: gol,
   início, intervalo, escalação, fim) e mostra os dos clubes e tipos que a pessoa escolheu (guardados no Cache Storage por
   js/alertas.js). Não guarda páginas em cache. */
const API = new URL(self.location.href).searchParams.get("api") || "";
const ARMARIO = "cazestats-alertas";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function le(chave, padrao) {
  try {
    const r = await (await caches.open(ARMARIO)).match(chave);
    return r ? await r.json() : padrao;
  } catch {
    return padrao;
  }
}
async function grava(chave, valor) {
  await (await caches.open(ARMARIO)).put(chave, new Response(JSON.stringify(valor), { headers: { "content-type": "application/json" } }));
}

async function avisa() {
  const seguidos = new Set(await le("/alertas/clubes.json", []));
  const tipos = new Set(await le("/alertas/tipos.json", ["gol"]));
  let gols = [], bolao = [];
  // avisos do bolão (lembrete e pontos) são da conta dona deste aparelho: o endereço de push identifica o aparelho
  const avisosDoBolao = async () => {
    if (!(await le("/alertas/bolao.json", false))) return [];
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return [];
    const r = await fetch(`${API}/bolao/avisos/recentes`, { method: "POST", cache: "no-store", body: JSON.stringify({ endpoint: sub.endpoint }) });
    return r.ok ? (await r.json()).avisos || [] : [];
  };
  try {
    const [r, b] = await Promise.all([fetch(`${API}/gols/recentes`, { cache: "no-store" }), avisosDoBolao().catch(() => [])]);
    gols = r.ok ? (await r.json()).gols || [] : [];
    bolao = b;
  } catch {
    /* sem rede: cai no aviso genérico abaixo */
  }
  const vistos = new Set(await le("/alertas/vistos.json", []));
  const novos = gols.filter((g) => seguidos.has(g.clube) && tipos.has(g.tipo || "gol") && Date.now() - g.quando < 10 * 60e3 && !vistos.has(g.id)).reverse();
  const doBolao = bolao.filter((a) => Date.now() - a.quando < 15 * 60e3 && !vistos.has(a.id) && /^#\/[\w/-]*$/.test(String(a.url || ""))).reverse();
  for (const a of doBolao) {
    vistos.add(a.id);
    await self.registration.showNotification(String(a.titulo).slice(0, 80), {
      body: String(a.corpo).slice(0, 160), tag: String(a.id), icon: "assets/marca/icone-192.png", badge: "assets/marca/icone-192.png", vibrate: [80], data: { url: `./${a.url}` },
    });
  }
  if (!novos.length && doBolao.length) return grava("/alertas/vistos.json", [...vistos].slice(-60));
  if (!novos.length) {
    // o navegador exige uma notificação por aviso recebido; sem gol novo na lista (atraso do cache), um aviso genérico
    return self.registration.showNotification("CazéStats.TV", { body: "Novidade no CazéStats.TV. Toque para ver.", tag: "aviso", icon: "assets/marca/icone-192.png", data: { url: "./#/" } });
  }
  for (const g of novos) {
    vistos.add(g.id);
    await self.registration.showNotification(String(g.titulo).slice(0, 80), {
      body: String(g.corpo).slice(0, 160), tag: String(g.id), icon: "assets/marca/icone-192.png", badge: "assets/marca/icone-192.png",
      vibrate: g.tipo === "gol" || !g.tipo ? [120, 60, 120] : [80], data: { url: `./#/clube/${encodeURIComponent(g.clube)}` },
    });
  }
  await grava("/alertas/vistos.json", [...vistos].slice(-60));
}

self.addEventListener("push", (e) => e.waitUntil(avisa()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const aba = abertas.find((c) => c.url.startsWith(self.registration.scope));
    if (aba) {
      await aba.focus();
      return aba.navigate(url).catch(() => {});
    }
    return self.clients.openWindow(url);
  })());
});
