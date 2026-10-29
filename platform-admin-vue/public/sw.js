/*
 * 赛小蜂足球 · 平台运营中心 Service Worker
 *
 * 目标：让平台后台在电脑（Edge/Chrome 安装）和平板（iPad 添加到主屏幕）中
 * 以独立窗口运行，并在断网时仍能打开应用外壳。
 *
 * 边界：
 * 1. 只缓存本站静态资源（构建产物 /assets/、图标）与首页外壳；manifest 走网络优先，
 *    保证安装后的窗口模式与主题色能随发布更新；
 * 2. 跨域请求（webLoginApi 等云函数入口）一律直连网络，不读取、不写入缓存；
 * 3. 登录态、账号、机构与赛事数据全部由服务端接口返回，缓存中不保存任何业务数据。
 */
const CACHE_NAME = 'sxf-platform-shell-v2';
const SHELL_URL = '/index.html';
const MANIFEST_URL = '/manifest.webmanifest';
const STATIC_FILES = new Set([
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
    await cache.addAll([SHELL_URL]).catch(() => {});
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
  // 带查询参数的请求来自更新检测（release.json / manifest 指纹），只走网络，不进缓存，
  // 否则每轮探测都会在缓存里堆积一条带新时间戳的记录。
  if (url.search) return false;
  return url.pathname.startsWith('/assets/') || STATIC_FILES.has(url.pathname);
}

/*
 * manifest 走网络优先：安装成应用后浏览器每次启动都会读它来决定窗口模式（display_override）
 * 与主题色。曾经把清单放进调试用缓存优先列表，装过一次旧清单后自绘标题条永远不生效，
 * 窗口标题一直是浏览器画的浅底白字。
 */
async function networkFirstManifest(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) return response;
    throw new Error(`manifest ${response.status}`);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(MANIFEST_URL);
    if (cached) return cached;
    throw error;
  }
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
  if (url.pathname === MANIFEST_URL) {
    event.respondWith(networkFirstManifest(request));
    return;
  }
  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
