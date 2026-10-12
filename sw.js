const CACHE = "proftech-financeiro-v8";

const ARQUIVOS = [
  "./index.html",
  "./login.html",
  "./css/app.css",
  "./js/app.js",
  "./js/login.js",
  "./js/atualizar.js",
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

self.addEventListener("message", (event) => {
  if (event.data === "pular-espera") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(chaves.filter((chave) => chave !== CACHE).map((chave) => caches.delete(chave)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((janelas) =>
        Promise.all(janelas.map((janela) => {
          if (typeof janela.navigate !== "function") return null;
          const destino = new URL(janela.url);
          if (destino.searchParams.get("sw") === CACHE) return null;
          destino.searchParams.set("sw", CACHE);
          return janela.navigate(destino.href);
        }))
      )
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
    fetch(requisicao, { cache: "no-store" })
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
