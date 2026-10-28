/*
 * 平台运营中心更新检测。
 *
 * 只读两样公开文件：
 * 1. `/release.json`：每次正式发布由 scripts/deploy.mjs 写入的构建清单（含 release 标识）；
 * 2. `/manifest.webmanifest`：应用外观清单，图标、窗口模式等变化需要重新打开或重装才生效。
 *
 * 不读取、不写入任何业务数据，也不改动登录态。仅在正式构建启用，避免开发热更新误报。
 * 发现新版本时只回调一次，由页面提示用户刷新；刷新本身仍走原有加载链路。
 */
const POLL_INTERVAL = 5 * 60 * 1000
const RELEASE_URL = '/release.json'
const MANIFEST_URL = '/manifest.webmanifest'
const CHECK_EVENT = 'sxf-platform-check-update'

async function readRelease() {
  const response = await fetch(`${RELEASE_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) return null
  const payload = await response.json().catch(() => null)
  return payload && typeof payload.release === 'string' && payload.release ? payload.release : null
}

async function readManifest() {
  const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) return null
  return response.text()
}

export function startPlatformUpdateWatch(onUpdate) {
  const idle = { stop() {}, check: () => Promise.resolve(null) }
  if (!import.meta.env.PROD || typeof window === 'undefined' || typeof fetch !== 'function') return idle

  let baselineRelease = null
  let baselineManifest = null
  let stopped = false
  let reported = false

  const check = async () => {
    if (stopped || reported) return null
    const [release, manifest] = await Promise.all([
      readRelease().catch(() => null),
      readManifest().catch(() => null)
    ])
    if (stopped) return null
    if (!baselineRelease) baselineRelease = release
    if (!baselineManifest) baselineManifest = manifest
    if (release && baselineRelease && release !== baselineRelease) {
      reported = true
      onUpdate({ type: 'release', release })
      return 'release'
    }
    if (manifest && baselineManifest && manifest !== baselineManifest) {
      reported = true
      onUpdate({ type: 'shell' })
      return 'shell'
    }
    return null
  }

  const visibleCheck = () => {
    if (!document.hidden) check()
  }
  const timer = window.setInterval(visibleCheck, POLL_INTERVAL)
  window.addEventListener('focus', visibleCheck)
  window.addEventListener('online', visibleCheck)
  document.addEventListener('visibilitychange', visibleCheck)
  window.addEventListener(CHECK_EVENT, visibleCheck)
  check()

  return {
    check,
    stop() {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('focus', visibleCheck)
      window.removeEventListener('online', visibleCheck)
      document.removeEventListener('visibilitychange', visibleCheck)
      window.removeEventListener(CHECK_EVENT, visibleCheck)
    }
  }
}

/** 刷新前先让 Service Worker 拉一次新外壳，避免刷新回旧缓存。 */
export async function refreshPlatformShell() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.()
    await registration?.update?.()
  } catch {
    // 更新失败也照常刷新，刷新链路本身是网络优先。
  }
  window.location.reload()
}
