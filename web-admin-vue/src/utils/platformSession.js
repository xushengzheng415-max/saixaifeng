/**
 * 平台运营中心会话边界
 *
 * 平台管理员（platform_settings/platform-owner + auth_sessions.principalType='platform_owner'）
 * 与主办方自然人账号是两套身份体系：
 *   - 主办方：账号密码/微信 → 手机号主账号 → users._id + orgId
 *   - 平台管理员：账号密码 → auth_sessions 上 principalType='platform_owner'、userId=''，不指向任何 users 文档
 *
 * 二者共用 webLoginApi 和域名，但令牌与身份分别存储。
 * 当前浏览器标签页的身份通道由 sessionStorage 选择，另一标签页登录不覆盖本页身份。
 */

export const PLATFORM_LOGIN_TYPE = 'platform-password'
export const PLATFORM_SESSION_KEY = 'platformSession'
export const PLATFORM_AUTH_TOKEN_KEY = 'platformAuthToken'
const PLATFORM_CONTEXT_KEY = 'sxfPlatformAuthContext'

// 平台运营中心入口路径
export const PLATFORM_CONSOLE_PATH = '/tournament-center-admin'
// 平台侧工具页：协助码生成、平台档案查看
export const PLATFORM_TOOLS_PATH = '/system'
const PLATFORM_WORKSPACE_PREFIXES = [
  '/platform-login', PLATFORM_CONSOLE_PATH, PLATFORM_TOOLS_PATH, '/data-center',
  '/admin', '/shop-admin', '/insurance-admin'
]

// 平台会话明确禁止进入的主办方工作区入口。
// 采用黑名单而不是白名单，避免公开页（赛事中心/门户/登录页）被误伤，
// 同时确保 /organization-onboarding 这条“选择要开展的业务”不会再被平台身份走到。
export const ORGANIZER_WORKSPACE_PREFIXES = [
  '/organization-onboarding',
  '/tournament-space',
  '/messages',
  '/assistance'
]

export function isPlatformLoginType(value) {
  return value === PLATFORM_LOGIN_TYPE
}

export function isPlatformWorkspacePath(path) {
  const value = String(path || '')
  return PLATFORM_WORKSPACE_PREFIXES.some(prefix => value === prefix || value.startsWith(prefix + '/'))
}

export function activatePlatformContext() {
  sessionStorage.setItem(PLATFORM_CONTEXT_KEY, 'platform')
}

export function activateOrganizerContext() {
  sessionStorage.removeItem(PLATFORM_CONTEXT_KEY)
}

export function isPlatformContext() {
  return sessionStorage.getItem(PLATFORM_CONTEXT_KEY) === 'platform'
}

export function getPlatformAuthToken() {
  return localStorage.getItem(PLATFORM_AUTH_TOKEN_KEY) || ''
}

export function setPlatformAuthToken(token) {
  if (token) localStorage.setItem(PLATFORM_AUTH_TOKEN_KEY, token)
}

/** 当前标签页是否持有平台管理员会话 */
export function isPlatformSession() {
  return isPlatformContext() && Boolean(getPlatformAuthToken())
}

/** 读取平台会话快照（不含令牌） */
export function getPlatformSession() {
  try { return JSON.parse(localStorage.getItem(PLATFORM_SESSION_KEY) || 'null') || null } catch { return null }
}

/** 判断平台会话是否要进入主办方工作区入口 */
export function isOrganizerWorkspacePath(path) {
  const value = String(path || '')
  return ORGANIZER_WORKSPACE_PREFIXES.some(prefix => value === prefix || value.startsWith(prefix + '/'))
}

/** 退出平台会话时清理平台键位 */
export function clearPlatformSession() {
  localStorage.removeItem(PLATFORM_SESSION_KEY)
  localStorage.removeItem(PLATFORM_AUTH_TOKEN_KEY)
  activateOrganizerContext()
}

/**
 * 建立平台管理员会话。
 * 只替换平台管理员自己的令牌与身份，不清理其他标签页的机构会话。
 */
export function storePlatformSession(result = {}) {
  const user = result.user || {}
  const authToken = result.authToken || ''
  if (!authToken) return false

  const platformUser = {
    _id: user._id || 'platform-owner',
    uid: user._id || 'platform-owner',
    userName: user.nickname || user.userName || '平台负责人',
    phone: user.phone || user.phoneNumber || '',
    email: user.email || '',
    isPlatformOwner: true
  }

  clearPlatformSession()
  // 兼容旧版只占用全局键位的单一平台会话，避免升级后留下旧令牌。
  if (isPlatformLoginType(localStorage.getItem('loginType'))) {
    ;['isLoggedIn', 'authToken', 'loginType', 'userId', 'userInfo'].forEach(key => localStorage.removeItem(key))
  }
  setPlatformAuthToken(authToken)
  localStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify({
    userId: platformUser._id,
    userName: platformUser.userName,
    user: platformUser,
    loginAt: Date.now()
  }))
  activatePlatformContext()
  return true
}
