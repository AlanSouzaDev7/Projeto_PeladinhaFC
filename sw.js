/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* CazéStats.TV — service worker do alerta de gol (registrado por js/alertas.js, só quando a pessoa liga um alerta).
   O Worker manda um aviso SEM conteúdo; aqui ele vira notificação: lê os gols recentes (GET <api>/gols/recentes) e mostra
   os dos clubes que a pessoa segue (lista guardada no Cache Storage por js/alertas.js). Não guarda páginas em cache. */
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
  let gols = [];
  try {
    const r = await fetch(`${API}/gols/recentes`, { cache: "no-store" });
    gols = r.ok ? (await r.json()).gols || [] : [];
  } catch {
    /* sem rede: cai no aviso genérico abaixo */
  }
  const vistos = new Set(await le("/alertas/vistos.json", []));
  const novos = gols.filter((g) => seguidos.has(g.clube) && Date.now() - g.quando < 10 * 60e3 && !vistos.has(g.id)).reverse();
  if (!novos.length) {
    // o navegador exige uma notificação por aviso recebido; sem gol novo na lista (atraso do cache), um aviso genérico
    return self.registration.showNotification("CazéStats.TV", { body: "Saiu gol do seu time! Toque para ver o placar.", tag: "gol", icon: "assets/marca/icone-192.png", data: { url: "./#/" } });
  }
  for (const g of novos) {
    vistos.add(g.id);
    await self.registration.showNotification(String(g.titulo).slice(0, 80), {
      body: String(g.corpo).slice(0, 160), tag: String(g.id), icon: "assets/marca/icone-192.png", badge: "assets/marca/icone-192.png",
      vibrate: [120, 60, 120], data: { url: `./#/clube/${encodeURIComponent(g.clube)}` },
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
