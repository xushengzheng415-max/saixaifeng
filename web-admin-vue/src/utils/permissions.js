/**
 * 权限控制工具
 * 定义不同角色的操作权限
 */

// 角色定义
export const ROLES = {
  ORGANIZER: 'organizer',  // 主办方
  COACH: 'coach',          // 教练
  REFEREE: 'referee',      // 裁判
  ADMIN: 'admin'           // 平台管理员
}

// 角色名称映射
export const ROLE_NAMES = {
  [ROLES.ORGANIZER]: '赛事主办方',
  [ROLES.COACH]: '球队',
  [ROLES.REFEREE]: '裁判',
  [ROLES.ADMIN]: '平台管理员'
}

// 角色图标映射
export const ROLE_ICONS = {
  [ROLES.ORGANIZER]: 'OfficeBuilding',
  [ROLES.COACH]: 'Football',
  [ROLES.REFEREE]: 'VideoPlay',
  [ROLES.ADMIN]: 'Setting'
}

/**
 * 获取当前用户角色
 * @returns {string} 当前角色
 */
export function getCurrentRole() {
  return localStorage.getItem('role') || ROLES.ORGANIZER
}

/**
 * 检查是否有指定角色
 * @param {string|string[]} roles - 单个角色或角色数组
 * @returns {boolean}
 */
export function hasRole(roles) {
  const currentRole = getCurrentRole()
  if (Array.isArray(roles)) {
    return roles.includes(currentRole)
  }
  return currentRole === roles
}

function getCurrentUserPhone() {
  try {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}')
    return userInfo.phone || localStorage.getItem('phone') || ''
  } catch {
    return localStorage.getItem('phone') || ''
  }
}

function ownsTeam(team) {
  if (!team) return false
  const userId = localStorage.getItem('userId')
  if (userId && (team.creatorId === userId || team.coachId === userId)) return true

  const phone = getCurrentUserPhone()
  if (!phone) return false
  return [
    team.ownerPhone,
    team.creatorPhone,
    team.contactPhone,
    team.coachPhone,
    team.phone,
    team.phoneNumber
  ].filter(Boolean).includes(phone)
}

/**
 * 权限检查对象
 */
export const permissions = {
  // ========== 球队相关权限 ==========
  team: {
    // 创建球队
    create: () => hasRole([ROLES.COACH, ROLES.ORGANIZER, ROLES.ADMIN]),
    // 编辑球队
    edit: (team) => {
      const role = getCurrentRole()
      // 管理员和主办方可以编辑所有球队
      if (hasRole([ROLES.ADMIN, ROLES.ORGANIZER])) return true
      // 教练只能编辑自己创建的球队
      if (role === ROLES.COACH) {
        return ownsTeam(team)
      }
      return false
    },
    // 删除球队
    delete: (team) => {
      const role = getCurrentRole()
      if (hasRole([ROLES.ADMIN, ROLES.ORGANIZER])) return true
      if (role === ROLES.COACH) {
        return ownsTeam(team)
      }
      return false
    },
    // 查看所有球队
    viewAll: () => hasRole([ROLES.ORGANIZER, ROLES.ADMIN]),
    // 查看自己的球队
    viewOwn: () => hasRole([ROLES.COACH])
  },

  // ========== 球员相关权限 ==========
  player: {
    // 创建球员
    create: (team) => {
      if (hasRole([ROLES.ADMIN, ROLES.ORGANIZER])) return true
      if (hasRole(ROLES.COACH)) {
        return ownsTeam(team)
      }
      return false
    },
    // 编辑球员
    edit: (player, team) => {
      if (hasRole([ROLES.ADMIN, ROLES.ORGANIZER])) return true
      if (hasRole(ROLES.COACH)) {
        const userId = localStorage.getItem('userId')
        // 检查是否是该球员所属球队的教练
        if (ownsTeam(team)) return true
        // 或者球员直接关联了教练ID
        return player && (player.creatorId === userId || player.coachId === userId)
      }
      return false
    },
    // 删除球员
    delete: (player, team) => {
      if (hasRole([ROLES.ADMIN, ROLES.ORGANIZER])) return true
      if (hasRole(ROLES.COACH)) {
        const userId = localStorage.getItem('userId')
        if (ownsTeam(team)) return true
        return player && (player.creatorId === userId || player.coachId === userId)
      }
      return false
    },
    // 查看所有球员
    viewAll: () => hasRole([ROLES.ORGANIZER, ROLES.ADMIN]),
    // 查看自己球队的球员
    viewByTeam: () => hasRole([ROLES.COACH, ROLES.ORGANIZER, ROLES.ADMIN])
  },

  // ========== 赛事相关权限 ==========
  tournament: {
    // 创建赛事
    create: () => hasRole([ROLES.ORGANIZER, ROLES.ADMIN]),
    // 编辑赛事
    edit: (tournament) => {
      if (hasRole([ROLES.ADMIN])) return true
      if (hasRole(ROLES.ORGANIZER)) {
        const userId = localStorage.getItem('userId')
        return tournament && (tournament.creatorId === userId || tournament.organizerId === userId)
      }
      return false
    },
    // 删除赛事
    delete: (tournament) => {
      if (hasRole([ROLES.ADMIN])) return true
      if (hasRole(ROLES.ORGANIZER)) {
        const userId = localStorage.getItem('userId')
        return tournament && (tournament.creatorId === userId || tournament.organizerId === userId)
      }
      return false
    },
    // 管理赛事（抽签、赛程等）
    manage: (tournament) => {
      if (hasRole([ROLES.ADMIN])) return true
      if (hasRole(ROLES.ORGANIZER)) {
        const userId = localStorage.getItem('userId')
        return tournament && (tournament.creatorId === userId || tournament.organizerId === userId)
      }
      return false
    },
    // 报名赛事
    signup: () => hasRole([ROLES.COACH, ROLES.ORGANIZER, ROLES.ADMIN]),
    // 查看赛事列表
    view: () => true // 所有角色都可以查看
  },

  // ========== 裁判相关权限 ==========
  referee: {
    // 添加裁判（主办方添加）
    add: () => hasRole([ROLES.ORGANIZER, ROLES.ADMIN]),
    // 审核裁判申请
    approve: () => hasRole([ROLES.ADMIN]),
    // 邀请裁判执法
    invite: () => hasRole([ROLES.ORGANIZER, ROLES.ADMIN]),
    // 查看裁判列表
    view: () => hasRole([ROLES.ORGANIZER, ROLES.ADMIN]),
    // 申请成为裁判
    apply: () => hasRole([ROLES.REFEREE]) || true, // 任何人都可以申请
    // 查看自己的执法记录
    viewOwn: () => hasRole([ROLES.REFEREE])
  },

  // ========== 数据概览权限 ==========
  dashboard: {
    view: () => hasRole([ROLES.ORGANIZER, ROLES.ADMIN])
  }
}

/**
 * 获取当前角色的导航菜单
 * @returns {Array} 菜单项列表
 */
export function getNavItemsByRole() {
  const role = getCurrentRole()
  const baseItems = []

  switch (role) {
    case ROLES.ORGANIZER:
      // 主办方视角 - 可以管理所有内容
      baseItems.push(
        { path: '/dashboard', label: '数据概览', icon: 'DataBoard' },
        { path: '/tournaments', label: '赛事管理', icon: 'Trophy' },
        { path: '/teams', label: '球队管理', icon: 'Football' },
        { path: '/referees', label: '裁判管理', icon: 'SetUp' }
      )
      break

    case ROLES.COACH:
      // 教练视角 - 只能管理自己的球队和球员，可以报名赛事
      baseItems.push(
        { path: '/teams', label: '我的球队', icon: 'Football' },
        { path: '/tournaments', label: '赛事报名', icon: 'Trophy' }
      )
      break

    case ROLES.REFEREE:
      // 裁判视角 - 查看执法记录和可报名的赛事
      baseItems.push(
        { path: '/referees', label: '我的执法', icon: 'SetUp' },
        { path: '/tournaments', label: '赛事列表', icon: 'Trophy' }
      )
      break

    case ROLES.ADMIN:
      // 管理员视角 - 拥有所有权限
      baseItems.push(
        { path: '/dashboard', label: '数据概览', icon: 'DataBoard' },
        { path: '/tournaments', label: '赛事管理', icon: 'Trophy' },
        { path: '/teams', label: '球队管理', icon: 'Football' },
        { path: '/referees', label: '裁判管理', icon: 'SetUp' }
      )
      break

    default:
      // 默认显示赛事列表
      baseItems.push(
        { path: '/tournaments', label: '赛事列表', icon: 'Trophy' }
      )
  }

  return baseItems
}

/**
 * 获取角色切换选项
 * @returns {Array} 可切换的角色列表
 */
export function getAvailableRoles() {
  return [
    { value: ROLES.ORGANIZER, label: '主办方', icon: 'OfficeBuilding' },
    { value: ROLES.COACH, label: '球队', icon: 'Football' },
    { value: ROLES.REFEREE, label: '裁判', icon: 'VideoPlay' }
  ]
}

export default {
  ROLES,
  ROLE_NAMES,
  ROLE_ICONS,
  getCurrentRole,
  hasRole,
  permissions,
  getNavItemsByRole,
  getAvailableRoles
}
