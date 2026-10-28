// 平台运营中心的离线外壳注册入口。
// 只在正式构建中注册，避免开发态热更新被 Service Worker 缓存干扰。
export function registerPlatformServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
