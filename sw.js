const CACHE_NAME = "mrovere-apps-cache-v1";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./styles/base.css",
  "./styles/auth.css",
  "./styles/layout.css",
  "./styles/dashboard.css",
  "./styles/partner.css",
  "./styles/iris.css",
  "./styles/tasks.css",
  "./src/app.js",
  "./src/firebase.js",
  "./src/auth.js",
  "./src/roles.js",
  "./src/router.js",
  "./src/storage.js",
  "./src/partner-dashboard.js",
  "./src/partner-excel.js",
  "./src/partner-templates.js",
  "./src/iris-dashboard.js",
  "./src/iris-storage.js",
  "./src/tasks-dashboard.js",
  "./src/admin.js",
  "./data/partner/accreditation-requirements.json",
  "./data/iris/latest.sample.json",
  "./data/iris/accounts_latest.sample.json",
  "./data/tasks/claude_tasks.sample.json",
  "./data/tasks/slack_tasks.sample.json"
];

const NETWORK_FIRST_DESTINATIONS = new Set(["document", "script", "style"]);

function isSensitiveRequest(requestUrl) {
  return (
    requestUrl.includes("/__/firebase/") ||
    requestUrl.includes("identitytoolkit.googleapis.com") ||
    requestUrl.includes("firestore.googleapis.com") ||
    requestUrl.includes("/data/iris/latest.json") ||
    requestUrl.includes("/data/iris/accounts_latest.json") ||
    requestUrl.includes("iris.tenablesecurity.com")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = request.url;

  if (request.method !== "GET" || isSensitiveRequest(requestUrl)) {
    return;
  }

  if (NETWORK_FIRST_DESTINATIONS.has(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
