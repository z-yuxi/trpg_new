// Service Worker for TRPG Platform PWA
const CACHE_NAME = 'trpg-v1';
const STATIC_ASSETS = ['/', '/manifest.json'];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求拦截：API/Socket → 不缓存；导航 → Network First；静态资源 → Cache First
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 跳过 API 和 socket.io
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  // 导航请求（HTML） → Network First，失败时返回 /index.html 缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/').then((cached) => cached ?? new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // 静态资源 → Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
