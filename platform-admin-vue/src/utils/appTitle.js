// 平台运营中心窗口标题的唯一来源。
// Chrome/Edge 的安装版窗口会把「应用名称（manifest name） + ' - ' + 页面标题（document.title）」
// 拼成窗口标题；页面标题里再写一次品牌，就会出现
// “赛小蜂足球 · 平台运营中心 - 赛小蜂足球 - 平台运营中心” 这种重复。
// 因此：安装版只写页面名，浏览器标签页才补品牌；所有路由统一在 main.js 的 afterEach 里取标题，
// 页面组件不再各自设置，发布新版本后也不会出现两处规则不一致。
export const APP_NAME = '赛小蜂足球 · 平台运营中心'
export const BRAND_NAME = '赛小蜂足球'
const DEFAULT_PAGE_TITLE = '运营控制台'
const PAGE_TITLES = {
  '/platform-login': '管理员登录',
  '/tournament-center-admin': '运营控制台',
  '/system': '系统管理'
}
const APP_WINDOW_MODES = ['window-controls-overlay', 'standalone', 'minimal-ui', 'fullscreen']

export function isAppWindow() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return APP_WINDOW_MODES.some(mode => window.matchMedia(`(display-mode: ${mode})`).matches)
}

export function pageTitleFor(path) {
  return PAGE_TITLES[path] || DEFAULT_PAGE_TITLE
}

// appWindow 为 true（安装版独立窗口）时返回纯页面名，窗口标题由浏览器补应用名；
// 浏览器标签页没有应用名前缀，这里补上品牌，保证两种场景都能看出是赛小蜂足球。
export function composePageTitle(pageTitle, appWindow) {
  const name = String(pageTitle || '').trim() || DEFAULT_PAGE_TITLE
  return appWindow ? name : `${name} · ${BRAND_NAME}`
}

export function setPageTitle(pageTitle) {
  document.title = composePageTitle(pageTitle, isAppWindow())
}

export function applyRouteTitle(path) {
  setPageTitle(pageTitleFor(path))
}
