/* © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins. */
/* CazéStats.TV — service worker (registrado por js/offline.js ao abrir o site e por js/alertas.js, mesmo endereço)
   1) Modo offline e site instalável: guarda o site no aparelho e, sem internet, abre a última versão vista.
      · arquivos com versão (css/js ?v=<hash>), fontes e marca: do cache primeiro (o conteúdo nunca muda)
      · páginas e dados (dados/, js de dados): da rede primeiro; sem rede, a cópia guardada
      · endereços de outros sites (ESPN, Worker, Google): não passam por aqui
   2) Alertas: o Worker manda um aviso SEM conteúdo; aqui ele vira notificação (gols, início, intervalo, escalação, fim e
      avisos do bolão), com os clubes e tipos escolhidos guardados no Cache Storage por js/alertas.js. */
const API = new URL(self.location.href).searchParams.get("api") || "";
const ARMARIO = "cazestats-alertas"; // preferências dos alertas (não é apagado nas trocas de versão)
const SITE = "cazestats-site-v1";
const BASE = new URL("./", self.location.href).href;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SITE).then((c) => c.addAll([BASE, `${BASE}manifest.webmanifest`, `${BASE}assets/marca/icone-192.png`]).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== SITE && k !== ARMARIO) await caches.delete(k); // versões antigas do site
  await self.clients.claim();
})()));

async function daRede(req, chave = req) {
  const c = await caches.open(SITE);
  try {
    const r = await fetch(req);
    if (r.ok && r.type === "basic") c.put(chave, r.clone());
    return r;
  } catch (err) {
    const guardado = await c.match(chave, { ignoreSearch: false });
    if (guardado) return guardado;
    throw err;
  }
}
async function doCache(req) {
  const c = await caches.open(SITE), guardado = await c.match(req);
  if (guardado) return guardado;
  const r = await fetch(req);
  if (r.ok && r.type === "basic") c.put(req, r.clone());
  return r;
}
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.endsWith("/sw.js")) return;
  if (req.mode === "navigate") {
    // páginas: rede primeiro; sem internet, a mesma página guardada ou a página inicial (o app abre a rota pelo #)
    e.respondWith(daRede(req).catch(async () => (await caches.open(SITE)).match(BASE)));
    return;
  }
  const versionado = url.searchParams.has("v") && /\/(css|js)\//.test(url.pathname);
  const fixo = /\/assets\/(fontes|marca)\//.test(url.pathname);
  e.respondWith(versionado || fixo ? doCache(req) : daRede(req));
});

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
