const CACHE = "proftech-financeiro-v5";

const ARQUIVOS = [
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./manifest.json",
  "./assets/emblema.png",
  "./assets/fonts/sora-latin.woff2",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((chave) => chave !== CACHE).map((chave) => caches.delete(chave)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requisicao = event.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) {
    event.respondWith(fetch(requisicao));
    return;
  }

  event.respondWith(
    fetch(requisicao)
      .then((resposta) => {
        if (resposta && resposta.ok && resposta.type === "basic") {
          const copia = resposta.clone();
          caches.open(CACHE).then((cache) => cache.put(requisicao, copia));
        }
        return resposta;
      })
      .catch(async () => {
        const emCache = await caches.match(requisicao);
        if (emCache) return emCache;
        if (requisicao.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 504, statusText: "Offline" });
      })
  );
});
