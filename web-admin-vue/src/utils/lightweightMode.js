// 轻量模式的唯一判定口径（工作流开关，与赛事类别、参赛模式解耦）。
// 赛事级字段 tournaments.lightweightMode 为权威来源；分赛场级别用 match.lightweightMode。
// 设计预留：未来若改为「按组别区分模式」，只需在此处优先读取 division.lightweightMode，
// 各页面不需要改动判断逻辑。
export const LIGHTWEIGHT_FIELD = 'lightweightMode'
export const LIGHTWEIGHT_LABEL = '轻量模式'
export const LIGHTWEIGHT_HINT = '轻量模式：只记比分、做排名。批量加队、一键赛程、直接录比分，不启用报名表、参赛名单、球员采集与裁判流程。'

function truthy(value) {
  return value === true || value === 'true' || value === 1
}

export function isLightweightRecord(record) {
  if (!record || typeof record !== 'object') return false
  return truthy(record[LIGHTWEIGHT_FIELD])
}

// 赛事级判定。division 为可选参数，用于预留组别级覆盖位。
export function isLightweightTournament(tournament, division) {
  if (isLightweightRecord(division)) return true
  return isLightweightRecord(tournament)
}

// 比赛级判定：比赛自身标记优先，其次跟随赛事标记。
export function isLightweightMatch(match, tournament, division) {
  if (!match) return isLightweightTournament(tournament, division)
  if (match[LIGHTWEIGHT_FIELD] === false) return false
  if (truthy(match[LIGHTWEIGHT_FIELD])) return true
  return isLightweightTournament(tournament, division)
}

export function lightweightPayload(tournament) {
  return { [LIGHTWEIGHT_FIELD]: isLightweightTournament(tournament) }
}
