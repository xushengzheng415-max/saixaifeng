import { eventType } from '../../../cloudfunctions/dataCenter/shared/match-events.mjs'

export function normalizeRepairEvent(event) {
  return { ...event, type: eventType(event) }
}

// Form feedback only. Authoritative roster, score, substitution and permission
// checks remain in auditRepairSave; never infer missing facts from display names.
export function repairEventError(events, info, supportedTypes) {
  if (!Number.isFinite(Number(info.durationMinutes)) || Number(info.durationMinutes) <= 0) return null
  const teamIds = Object.values(info.sides).map(side => side.teamId)
  for (const [index, row] of events.entries()) {
    let message = ''
    const type = eventType(row)
    if (!teamIds.includes(row.teamId)) message = '请重新选择本场球队'
    else if (!supportedTypes.includes(type)) message = '请重新选择事件类型'
    else if (row.minute == null || row.minute === '' || !Number.isFinite(Number(row.minute)) || Number(row.minute) < 0 || Number(row.minute) > info.durationMinutes) message = `请填写0–${info.durationMinutes}分钟内的累计分钟`
    else if (!row.playerId) message = type === 'substitution' ? '请选择换上球员' : '请选择事件球员'
    else if (type === 'substitution' && !row.outPlayerId) message = '请选择换下球员'
    else if (type === 'substitution' && row.playerId === row.outPlayerId) message = '换上和换下球员不能相同'
    if (message) return { index, message: `第${index + 1}条事件：${message}` }
  }
  return null
}
