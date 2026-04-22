// Service Worker for TRPG Platform PWA
const CACHE_NAME = 'trpg-v2';
const STATIC_ASSETS = ['/', '/manifest.json', '/icons/icon-192.svg', '/icons/icon-512.svg'];

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (request.method === 'GET' && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (request.method === 'GET' && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

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

  // 开发环境（localhost / 127.0.0.1）：完全不拦截，交由浏览器直接处理
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // 跳过 Vite HMR / 模块请求（防御纵深：防止旧 SW 缓存影响 dev server）
  if (
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@fs/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('t') // Vite 热更新时间戳参数
  ) return;

  if (url.pathname.startsWith('/socket.io/')) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 导航请求（HTML） → Network First，失败时返回 /index.html 缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put('/', response.clone()));
        }
        return response;
      }).catch(() =>
        caches.match('/').then((cached) => cached ?? new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // 静态资源 → Cache First
  event.respondWith(cacheFirst(event.request));
});
