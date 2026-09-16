/**
 * 平台运营中心会话边界
 *
 * 平台管理员（platform_settings/platform-owner + auth_sessions.principalType='platform_owner'）
 * 与主办方自然人账号是两套身份体系：
 *   - 主办方：账号密码/微信 → 手机号主账号 → users._id + orgId
 *   - 平台管理员：账号密码 → auth_sessions 上 principalType='platform_owner'、userId=''，不指向任何 users 文档
 *
 * 二者共用 webLoginApi、authToken 通道和同一份浏览器 localStorage，但**不能共用会话形态**。
 * 历史实现把平台会话写成了主办方会话（role/currentRole='organizer'），
 * 导致平台管理员被 needsOrganizerOnboarding 当成“尚未开户的主办方”而进入机构引导。
 * 这里为平台会话提供独立键位，路由守卫据此把它限制在平台路径集合内。
 */

export const PLATFORM_LOGIN_TYPE = 'platform-password'
export const PLATFORM_SESSION_KEY = 'platformSession'

// 平台运营中心入口路径
export const PLATFORM_CONSOLE_PATH = '/tournament-center-admin'
// 平台侧工具页：协助码生成、平台档案查看
export const PLATFORM_TOOLS_PATH = '/system'

// 平台会话明确禁止进入的主办方工作区入口。
// 采用黑名单而不是白名单，避免公开页（赛事中心/门户/登录页）被误伤，
// 同时确保 /organization-onboarding 这条“选择要开展的业务”不会再被平台身份走到。
export const ORGANIZER_WORKSPACE_PREFIXES = [
  '/organization-onboarding',
  '/tournament-space',
  '/assistance'
]

export function isPlatformLoginType(value) {
  return value === PLATFORM_LOGIN_TYPE
}

/** 是否处于平台管理员会话 */
export function isPlatformSession() {
  return isPlatformLoginType(localStorage.getItem('loginType'))
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
}

/**
 * 建立平台管理员会话。
 * 先按“登录切换必须先清理上一账号本地认证信息，再原子写入新会话”的规则清空主办方键位，
 * 然后只写平台自己的令牌与身份：不再写 role/currentRole='organizer'，
 * 也不再写 authSessionVersion（那是主办方会话的版本标记）。
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

  ;[
    'isLoggedIn', 'userInfo', 'role', 'currentRole', 'userId', 'loginType',
    'phone', 'phoneNumber', 'openid', 'unionid', 'authSessionVersion',
    'authToken', 'assistanceContext', 'userRole',
    'organizationInfo', 'currentOrganization', 'currentOrg'
  ].forEach(key => localStorage.removeItem(key))

  localStorage.setItem('isLoggedIn', 'true')
  localStorage.setItem('authToken', authToken)
  localStorage.setItem('loginType', PLATFORM_LOGIN_TYPE)
  localStorage.setItem('userId', platformUser._id)
  localStorage.setItem('userInfo', JSON.stringify(platformUser))
  localStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify({
    userId: platformUser._id,
    userName: platformUser.userName,
    loginAt: Date.now()
  }))
  return true
}
