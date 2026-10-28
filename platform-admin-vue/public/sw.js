/*
 * 赛小蜂足球 · 平台运营中心 Service Worker
 *
 * 目标：让平台后台在电脑（Edge/Chrome 安装）和平板（iPad 添加到主屏幕）中
 * 以独立窗口运行，并在断网时仍能打开应用外壳。
 *
 * 边界：
 * 1. 只缓存本站静态资源（构建产物 /assets/、图标、清单）与首页外壳；
 * 2. 跨域请求（webLoginApi 等云函数入口）一律直连网络，不读取、不写入缓存；
 * 3. 登录态、账号、机构与赛事数据全部由服务端接口返回，缓存中不保存任何业务数据。
 */
const CACHE_NAME = 'sxf-platform-shell-v1';
const SHELL_URL = '/index.html';
const STATIC_FILES = new Set([
  '/manifest.webmanifest',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable-512.png',
  '/apple-touch-icon.png',
  '/logo.png',
  '/logo-saixiaofeng.png'
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([SHELL_URL, '/manifest.webmanifest']).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('sxf-platform-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function isCacheableAsset(url) {
  return url.pathname.startsWith('/assets/') || STATIC_FILES.has(url.pathname);
}

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(SHELL_URL, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match(SHELL_URL));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
