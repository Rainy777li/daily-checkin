/* ============================================
   Service Worker — 离线缓存支持
   ============================================ */

const CACHE_NAME = 'daily-checkin-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/app.html',
  '/admin.html',
  '/css/style.css',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/app.js',
  '/js/admin.js',
  '/manifest.json',
];

// 安装：预缓存核心文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE).catch(() => {
        // 部分文件加载失败不影响安装
        console.log('部分文件缓存失败，继续安装');
      });
    })
  );
});

// 请求拦截：缓存优先
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});
