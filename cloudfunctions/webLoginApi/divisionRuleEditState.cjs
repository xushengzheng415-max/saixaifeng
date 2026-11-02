'use strict'

// Match records, including unassigned/cancelled fixtures, are schedule evidence.
// Calendar dates, imported tournament status and rule-finalization flags are not.
async function readEditState(db, division) {
  const tournamentId = String(division?.tournamentId || '').trim()
  const divisionId = String(division?._id || division?.id || '').trim()
  if (!tournamentId || !divisionId) throw new Error('组别归属不完整，请先核对赛事资料')
  for (let skip = 0; skip < 50000; skip += 100) {
    const response = await db.collection('matches').where({ tournamentId }).skip(skip).limit(100).get()
    if (!Array.isArray(response?.data)) throw new Error('赛程状态读取不完整，请刷新后重试')
    const rows = response.data
    for (const row of rows) {
      const scope = String(row.divisionId ?? row.division ?? row.divisionKey ?? '').trim()
      if (!scope || scope === divisionId) return {
        canEdit: false, hasSchedule: true,
        reason: scope ? '本组已生成赛程，规则已锁定' : '存在未归属组别的比赛，请先核对赛程'
      }
    }
    if (rows.length < 100) return { canEdit: true, hasSchedule: false, reason: '' }
  }
  throw new Error('比赛记录过多，暂无法确认规则修改状态，请联系平台核对')
}

async function assertEditable(db, division) {
  const state = await readEditState(db, division)
  if (!state.canEdit) throw Object.assign(new Error(state.reason), { code: 'DIVISION_SCHEDULE_EXISTS' })
  return state
}

module.exports = { readEditState, assertEditable }
