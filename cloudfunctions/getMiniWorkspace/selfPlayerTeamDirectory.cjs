'use strict'
// 登记后的只读球队目录；只输出队名/地区，搜索结果不授予球队权限。
const text = value => String(value == null ? '' : value).trim()
const project = team => ({ id: text(team._id), name: text(team.name || team.teamName), city: text(team.city), division: text(team.division) })
module.exports = async function directory({ db, identity, event, loadManagedTeams }) {
  if (!identity || !text(identity.user && identity.user._id)) return { success: false, code: 'PHONE_AUTH_REQUIRED', message: '请先验证手机号' }
  const { synthetic } = await import('./data-center/statistics.mjs')
  const live = team => team && team.isDeleted !== true && !['deleted', 'archived', 'disabled'].includes(text(team.status).toLowerCase()) && !synthetic(team)
  if (event.subAction === 'requestTeamJoin') {
    const playerId = text(event.playerId), teamId = text(event.teamId), userId = text(identity.user._id)
    if (!playerId || !teamId || event.agreed !== true) return { success: false, code: 'TEAM_JOIN_INVALID', message: '请确认要加入的球队' }
    // 沿现有球队负责人审核；不凭搜索建立归属，不改正式名单、核验和积分。
    return await db.runTransaction(async tx => {
      const read = async (name, id) => {
        try { const data = (await tx.collection(name).doc(id).get()).data; return Array.isArray(data) ? data[0] : data }
        catch (error) { if (/not exist|not found|DOCUMENT_NOT_EXIST/i.test(String(error.message))) return null; throw error }
      }
      const player = await read('players', playerId), team = await read('teams', teamId)
      if (!live(player) || ![text(player.linkedUserId), text(player.guardianUserId)].includes(userId)) return { success: false, code: 'SELF_PLAYER_FORBIDDEN', message: '只能申请本人或本人监护的球员入队' }
      if (!live(team)) return { success: false, code: 'TEAM_UNAVAILABLE', message: '该球队已不可加入，请重新搜索' }
      if (text(player.teamId)) return { success: false, code: 'PLAYER_TEAM_CONFLICT', message: '已有球队归属，请先通过原球队处理转队' }
      if (text(player.pendingJoinStatus) === 'pending') return text(player.pendingJoinTeamId) === teamId ? { success: true, status: 'pending', teamName: text(team.name || team.teamName) } : { success: false, code: 'PLAYER_JOIN_PENDING', message: '已有待处理入队申请，请等待原球队处理' }
      const now = db.serverDate()
      await tx.collection('players').doc(playerId).update({ data: { pendingJoinTeamId: teamId, pendingJoinStatus: 'pending', pendingJoinRequestId: require('node:crypto').randomUUID(), joinRequestedAt: now, updateTime: now } })
      return { success: true, status: 'pending', teamName: text(team.name || team.teamName) }
    })
  }
  const managed = (await loadManagedTeams(identity.user, identity.openId)).filter(live)
  if (event.subAction === 'teams') return { success: true, teams: managed.map(project) }
  const keyword = text(event.keyword)
  if (keyword.length < 2 || keyword.length > 30) return { success: false, code: 'TEAM_SEARCH_INVALID', message: '请输入2—30字的球队名称' }
  const offset = Number(event.offset || 0)
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000) return { success: false, code: 'TEAM_SEARCH_INVALID', message: '请缩小搜索范围后重试' }
  const expression = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' })
  // 固定顺序按原始候选分页；不把过滤测试/归档后的空页误作已查无此队。
  const rows = (await db.collection('teams').where(db.command.or([{ name: expression }, { teamName: expression }])).orderBy('_id', 'asc').skip(offset).limit(21).get()).data || []
  const ids = new Set(managed.map(team => text(team._id)))
  return { success: true, teams: rows.slice(0, 20).filter(live).map(team => ({ ...project(team), canManage: ids.has(text(team._id)) })), hasMore: rows.length > 20, nextOffset: offset + Math.min(rows.length, 20) }
}
