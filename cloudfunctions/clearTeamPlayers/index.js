/**
 * 批量删除指定球队下所有球员 - 一次性工具
 * 用法：调用后直接删除，无需前端
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function authenticateActor(event) {
  const userId = String(event && event.__actorUserId || '').trim()
  const orgId = String(event && event.__actorOrgId || '').trim()
  if (!userId || !orgId) return { ok: false, result: { success: false, error: '登录会话或机构信息已失效，请重新登录', code: 'AUTH_REQUIRED' } }
  const userResult = await db.collection('users').doc(userId).get()
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!user) return { ok: false, result: { success: false, error: '登录账号不存在', code: 'AUTH_REQUIRED' } }
  const userOrgId = String(user.orgId || user.organizationId || '').trim()
  if (!userOrgId || userOrgId !== orgId) return { ok: false, result: { success: false, error: '当前账号尚未关联有效机构', code: 'ORG_REQUIRED' } }
  const organizationResult = await db.collection('organizations').doc(orgId).get()
  const organization = Array.isArray(organizationResult.data) ? organizationResult.data[0] : organizationResult.data
  if (!organization) return { ok: false, result: { success: false, error: '当前机构不存在或已失效', code: 'ORG_REQUIRED' } }
  return { ok: true, actor: { userId, orgId } }
}

exports.main = async (event) => {
  event = event || {}
  const { teamId } = event
  if (!teamId) return { success: false, error: '缺少 teamId' }

  try {
    const actorResult = await authenticateActor(event)
    if (!actorResult.ok) return actorResult.result
    const teamResult = await db.collection('teams').doc(String(teamId)).get()
    const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
    if (!team) return { success: false, error: '球队不存在', code: 'TEAM_NOT_FOUND' }
    const teamOrgId = String(team.orgId || team.organizationId || team.organization_id || '').trim()
    if (!teamOrgId || teamOrgId !== actorResult.actor.orgId) {
      return { success: false, error: '无权清理当前机构之外的球队球员', code: 'ORG_ACCESS_DENIED' }
    }
    console.log(`[clearTeamPlayers] 开始删除 teamId=${teamId} 的所有球员`)
    
    // 分批查询（每次最多 100 条）
    let totalDeleted = 0
    let hasMore = true
    
    while (hasMore) {
      const res = await db.collection('players')
        .where({ teamId })
        .limit(100)
        .get()
      
      const records = res.data
      if (records.length === 0) {
        hasMore = false
        break
      }
      
      // 逐条删除
      for (const record of records) {
        try {
          await db.collection('players').doc(record._id).remove()
          totalDeleted++
        } catch (err) {
          console.error(`删除记录 ${record._id} 失败:`, err)
        }
      }
      
      console.log(`[clearTeamPlayers] 已删除 ${totalDeleted} 条`)
      
      // 如果不足 100 条，说明没有更多了
      if (records.length < 100) hasMore = false
    }
    
    return {
      success: true,
      message: `成功删除球队 ${teamId} 下全部 ${totalDeleted} 条球员记录`,
      deleted: totalDeleted
    }
  } catch (err) {
    console.error('[clearTeamPlayers] 失败:', err)
    return { success: false, error: err.message }
  }
}
