// rosterHelper.js — 每队人数上限 / 比赛制式 工具函数
// 供 web-admin-vue 端 TournamentCreate.vue / TournamentEdit.vue / RosterChangeReview.vue 共用

/**
 * 比赛制式选项（卡片选择器数据源）
 * - value: 制式标识，存入 tournaments.matchFormat
 * - label: 展示名称
 * - defaultPlayers: 选择该制式时自动填充的大名单上限默认值
 * - maxPlayers: 该制式允许设置的最大上限（el-input-number :max）
 */
export const MATCH_FORMAT_OPTIONS = [
  { value: '11side', label: '11人制', icon: '⚽', defaultPlayers: 35, maxPlayers: 50 },
  { value: '8side', label: '8人制', icon: '⚽', defaultPlayers: 25, maxPlayers: 40 },
  { value: '7side', label: '7人制', icon: '⚽', defaultPlayers: 20, maxPlayers: 35 },
  { value: '5side', label: '5人制', icon: '⚽', defaultPlayers: 12, maxPlayers: 25 },
]

/**
 * 各制式的默认大名单上限
 */
export const MATCH_FORMAT_DEFAULTS = {
  '11side': 35,
  '8side': 25,
  '7side': 20,
  '5side': 12,
}

/**
 * 根据制式值获取选项对象（用于读取 maxPlayers 等）
 * @param {string} format
 * @returns {object|null}
 */
export function getFormatOption(format) {
  if (!format) return null
  return MATCH_FORMAT_OPTIONS.find(o => o.value === format) || null
}

/**
 * 根据制式值获取允许设置的最大上限
 * @param {string} format
 * @returns {number}
 */
export function getMaxByFormat(format) {
  const opt = getFormatOption(format)
  return opt ? opt.maxPlayers : 50
}

/**
 * 读取每队大名单上限（回退链）
 * 回退顺序：maxPlayersPerTeam → maxPlayers → MATCH_FORMAT_DEFAULTS[matchFormat] → 20
 * @param {object} tournament - 赛事对象
 * @returns {number}
 */
export function resolveMaxPlayers(tournament) {
  if (!tournament) return 20
  if (tournament.maxPlayersPerTeam) return tournament.maxPlayersPerTeam
  if (tournament.maxPlayers) return tournament.maxPlayers
  if (tournament.matchFormat && MATCH_FORMAT_DEFAULTS[tournament.matchFormat]) {
    return MATCH_FORMAT_DEFAULTS[tournament.matchFormat]
  }
  return 20
}

/**
 * 根据历史 maxPlayers 反推最接近的比赛制式（编辑历史赛事时回填用）
 * 规则：≤15→5side, ≤22→7side, ≤30→8side, >30→11side
 * @param {number} maxPlayers
 * @returns {string}
 */
export function inferMatchFormat(maxPlayers) {
  if (!maxPlayers || maxPlayers <= 0) return '11side'
  if (maxPlayers <= 15) return '5side'
  if (maxPlayers <= 22) return '7side'
  if (maxPlayers <= 30) return '8side'
  return '11side'
}

/**
 * 判断用户是否手动修改过大名单上限（与当前制式默认值不同）
 * @param {number} current - 当前大名单上限
 * @param {string} format - 当前制式
 * @returns {boolean}
 */
export function isMaxPlayersModified(current, format) {
  if (!current || !format) return false
  const def = MATCH_FORMAT_DEFAULTS[format]
  return current !== def
}
