// Service worker do painel (gerado no build por scripts/build-sw.mjs — não edite public/sw.js).
//
// O que ele faz, e só isso:
//  - guarda o código e os estilos do próprio aplicativo (arquivos de nome único em
//    /_next/static/…), para o painel abrir mais rápido;
//  - se o aparelho estiver sem internet ao abrir o painel, mostra a página "Sem internet".
//
// O que ele NUNCA faz: tocar nos dados. Tudo que vai para o Supabase (login e dados) e
// qualquer outro site passa direto, sem ser guardado. As páginas vêm sempre da rede: uma
// versão nova do painel chega na hora.
const BUILD = "__BUILD__";
const CACHE = `cda-app-${BUILD}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // cada publicação tem o seu armário: os das versões antigas são esvaziados
      for (const key of await caches.keys()) {
        if (key.startsWith("cda-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Supabase e qualquer outro site: não é com o service worker
  if (url.origin !== self.location.origin) return;

  // abrir (ou recarregar) uma página: sempre da rede; sem internet, a página de aviso
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match(OFFLINE_URL);
        return offline ?? Response.error();
      }),
    );
    return;
  }

  // Código e estilos do aplicativo têm nome único (o conteúdo de um nome nunca muda): pode guardar.
  // (Fontes e imagens ficam com o cache normal do navegador: respondê-las daqui faz o navegador
  // baixar a fonte duas vezes, porque ele não reconhece a que já tinha pedido antes.)
  const kind = request.destination;
  if (url.pathname.startsWith("/_next/static/") && (kind === "script" || kind === "style")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok && response.type === "basic") cache.put(request, response.clone()).catch(() => {});
        return response;
      })(),
    );
  }
});
