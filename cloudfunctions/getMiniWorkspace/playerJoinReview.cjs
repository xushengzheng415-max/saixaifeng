'use strict'
// 球员入队审核（2026-10-19）：球员扫码登记的新档案在球队确认前只进入球员库「待球队确认」，
// 不写 teamId、不写归属流转日志；球队负责人在小程序确认后才正式建立球队关系，
// 驳回则保留档案等待球员重新登记。认领已有档案与递卡确认入队不经过本审核。
const text = value => (value === undefined || value === null ? '' : String(value).trim())

module.exports = function createPlayerJoinReview(deps) {
  const { db, safeGet, safeGetTeamPlayers, loadTeams, findWorkspaceForAction, workspaceError, toTime, registrantTypeForPlayer } = deps

  function readDocument(client, collection, id) {
    return Promise.resolve(client.collection(collection).doc(String(id)).get()).then(result => {
      const data = result && result.data
      return Array.isArray(data) ? (data[0] || null) : (data || null)
    }).catch(error => {
      if (/not exist|does not exist|DOCUMENT_NOT_EXIST/i.test(String(error && error.message || ''))) return null
      throw error
    })
  }

  function formatPendingJoin(item) {
    const at = toTime(item.joinRequestedAt || item.createTime)
    const registrantType = registrantTypeForPlayer(item)
    return {
      id: text(item._id),
      name: text(item.name) || '待补姓名',
      avatarText: (text(item.name) || '球').slice(0, 1),
      jerseyNumber: item.jerseyNumber === undefined || item.jerseyNumber === null ? '' : text(item.jerseyNumber),
      jerseyName: text(item.jerseyName),
      position: text(item.position),
      birthDate: text(item.birthDate || item.birthday),
      photoUrl: text(item.photoUrl || item.photoFileId || item.photo),
      registrantType,
      registrantTypeText: registrantType === 'self' ? '本人登记' : '监护人登记',
      requestedAtText: at ? new Date(at + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : ''
    }
  }

  // 本队「待球队确认」入队申请，按申请时间倒序。
  async function pendingFor(teamId) {
    const rows = await safeGet('players', { pendingJoinTeamId: text(teamId) }, 200)
    return rows
      .filter(item => text(item.pendingJoinStatus) === 'pending')
      .sort((a, b) => toTime(b.joinRequestedAt || b.createTime) - toTime(a.joinRequestedAt || a.createTime))
      .map(formatPendingJoin)
  }

  // 确认或驳回入队申请。确认时以球队登记版本号串行化，号码冲突先于入库拦截。
  async function review(event, identity) {
    const result = await findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
    const workspace = result.workspace
    if ((workspace.permissions || []).indexOf('team.manage') < 0) throw workspaceError('TEAM_MANAGE_REQUIRED', '当前身份没有确认球员入队的权限')
    const teamId = text(event.teamId), playerId = text(event.playerId)
    if (!teamId || !playerId) throw workspaceError('PLAYER_JOIN_PAYLOAD_REQUIRED', '球队和球员识别信息不完整')
    const teams = await loadTeams(workspace, identity.user, identity.openId)
    if (!teams.some(item => text(item._id) === teamId)) throw workspaceError('TEAM_SCOPE_DENIED', '球队不存在或不属于当前工作空间')
    const operatorId = text(identity.user._id)
    if (event.action !== 'confirmTeamPlayerJoin') {
      const rejected = await db.collection('players').where({ _id: playerId, pendingJoinTeamId: teamId, pendingJoinStatus: 'pending' }).update({
        data: {
          pendingJoinStatus: 'rejected',
          pendingJoinRejectedAt: db.serverDate(),
          pendingJoinRejectedBy: operatorId,
          pendingJoinRejectReason: text(event.reason).slice(0, 100) || '球队未通过',
          updateTime: db.serverDate()
        }
      })
      const changed = Number(rejected && rejected.stats && rejected.stats.updated || 0)
      if (changed !== 1) throw workspaceError('PLAYER_JOIN_STATE_CHANGED', '该入队申请已被处理，请刷新后重试')
      return { success: true, playerId, status: 'rejected' }
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = (await safeGet('players', { _id: playerId }, 1))[0]
      if (!before) throw workspaceError('PLAYER_JOIN_NOT_FOUND', '入队申请不存在或已失效')
      if (text(before.pendingJoinTeamId) !== teamId || text(before.pendingJoinStatus) !== 'pending') throw workspaceError('PLAYER_JOIN_STATE_CHANGED', '该入队申请已被处理，请刷新后重试')
      const beforeTeam = await readDocument(db, 'teams', teamId)
      if (!beforeTeam) throw workspaceError('TEAM_SCOPE_DENIED', '球队不存在或不属于当前工作空间')
      const jerseyNumber = text(before.jerseyNumber)
      const pool = (await safeGetTeamPlayers(teamId, 500)).filter(item => ['archived', 'deleted'].indexOf(text(item.status).toLowerCase()) < 0 && text(item._id) !== playerId)
      if (/^\d+$/.test(jerseyNumber) && pool.some(item => /^\d+$/.test(text(item.jerseyNumber)) && Number(item.jerseyNumber) === Number(jerseyNumber))) {
        throw workspaceError('PLAYER_JERSEY_CONFLICT', jerseyNumber + '号已被本队使用，请先释放该号码，或联系球员更换号码后重新登记')
      }
      try {
        await db.runTransaction(async tx => {
          const current = await readDocument(tx, 'players', playerId)
          if (!current || text(current.pendingJoinTeamId) !== teamId || text(current.pendingJoinStatus) !== 'pending') throw workspaceError('PLAYER_JOIN_STATE_CHANGED', '该入队申请已被处理，请刷新后重试')
          const currentTeam = await readDocument(tx, 'teams', teamId)
          if (!currentTeam) throw workspaceError('TEAM_SCOPE_DENIED', '球队不存在或不属于当前工作空间')
          if (Number(currentTeam.playerRegistrationRevision || 0) !== Number(beforeTeam.playerRegistrationRevision || 0)) throw workspaceError('PLAYER_POOL_CHANGED', '球队球员库已更新，请重试')
          const now = db.serverDate(), orgId = text(current.orgId || currentTeam.orgId)
          const historyId = 'ph_' + playerId + '_' + (text(current.pendingJoinRequestId) || 'approved')
          await tx.collection('player_team_history').doc(historyId).set({ data: { playerId, teamId, orgId, teamName: text(currentTeam.name || currentTeam.teamName), joinedAt: now, leftAt: null, joinSource: 'register', actorUserId: operatorId, approvedByUserId: operatorId, createTime: now, updateTime: now } })
          await tx.collection('players').doc(playerId).update({ data: { teamId, teamCode: '', orgId, currentHistoryId: historyId, pendingJoinStatus: 'approved', pendingJoinApprovedAt: now, pendingJoinApprovedBy: operatorId, pendingJoinRejectedAt: '', pendingJoinRejectedBy: '', pendingJoinRejectReason: '', status: '', archivedAt: '', archivedBy: '', archivedReason: '', archivedTeamId: '', registeredAt: now, updateTime: now } })
          await tx.collection('teams').doc(teamId).update({ data: { playerRegistrationRevision: Number(currentTeam.playerRegistrationRevision || 0) + 1, rosterCountStatus: 'needs_refresh', updateTime: now } })
        })
        return { success: true, playerId, status: 'approved', playerName: text(before.name) }
      } catch (error) {
        if (text(error && error.code) !== 'PLAYER_POOL_CHANGED' || attempt === 2) throw error
      }
    }
  }

  return { pendingFor, review }
}
