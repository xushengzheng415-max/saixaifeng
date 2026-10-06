// 通用删除记录云函数 - 有管理员权限
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { collection, id, cascade = false } = event

  if (!collection || !id) {
    return {
      success: false,
      message: '缺少集合名称或记录ID'
    }
  }

  try {
    console.log(`删除 ${collection}/${id}, cascade=${cascade}`)

    if (!id || typeof id !== 'string') {
      return { success: false, message: `ID 无效: ${id}` }
    }

    // 先查询记录是否存在（尝试多种方式）
    let docExists = false
    let docData = null
    let matchedId = id

    // 方式1: doc(id).get()
    try {
      const docRes = await db.collection(collection).doc(id).get()
      if (docRes.data && docRes.data.length > 0) {
        docExists = true
        docData = docRes.data[0]
        console.log(`[doc查询] 找到记录, _id=${docData._id}`)
      }
    } catch (queryErr) {
      console.log(`[doc查询] 失败:`, queryErr.message)
    }

    // 方式2: where({_id: id}).get()
    if (!docExists) {
      try {
        const whereRes = await db.collection(collection).where({ _id: id }).get()
        if (whereRes.data && whereRes.data.length > 0) {
          docExists = true
          docData = whereRes.data[0]
          matchedId = docData._id // 使用数据库中的真实 _id
          console.log(`[where查询] 找到记录, _id=${docData._id}`)
        }
      } catch (queryErr) {
        console.log(`[where查询] 失败:`, queryErr.message)
      }
    }

    // 方式3: 尝试 ObjectId 格式
    if (!docExists) {
      try {
        const oidRes = await db.collection(collection).where({ _id: _.eq(id) }).get()
        if (oidRes.data && oidRes.data.length > 0) {
          docExists = true
          docData = oidRes.data[0]
          matchedId = docData._id
          console.log(`[ObjectId查询] 找到记录, _id=${docData._id}`)
        }
      } catch (queryErr) {
        console.log(`[ObjectId查询] 失败:`, queryErr.message)
      }
    }

    console.log(`记录存在: ${docExists}, 匹配ID: ${matchedId}`)

    // 如果是赛事，先清理关联数据
    if (collection === 'tournaments' && cascade) {
      await cleanupTournamentRelations(id)
    }

    // 删除记录（使用匹配到的 _id）
    let result
    try {
      result = await db.collection(collection).doc(matchedId).remove()
    } catch (docRemoveErr) {
      console.log(`[doc删除] 失败:`, docRemoveErr.message)
      // 如果 doc 删除失败，尝试 where 删除
      try {
        result = await db.collection(collection).where({ _id: matchedId }).remove()
      } catch (whereRemoveErr) {
        console.log(`[where删除] 失败:`, whereRemoveErr.message)
        throw whereRemoveErr
      }
    }

    console.log('删除结果:', result)

    // 云开发返回格式：result.stats.removed 或 result.stats.deleted
    const removed = result.stats?.removed || result.stats?.deleted || 0

    if (removed >= 1) {
      return {
        success: true,
        message: '删除成功',
        deleted: removed
      }
    } else {
      return {
        success: false,
        message: `删除失败，记录存在=${docExists}, removed=${removed}`,
        deleted: removed,
        docExists: docExists,
        matchedId: matchedId,
        docOpenId: docData?._openid || null
      }
    }
  } catch (err) {
    console.error('删除失败:', err)
    return {
      success: false,
      message: '删除失败: ' + err.message,
      error: err.message
    }
  }
}

/**
 * 清理赛事关联数据
 * @param {string} tournamentId 赛事ID
 */
async function cleanupTournamentRelations(tournamentId) {
  console.log(`[级联删除] 清理赛事 ${tournamentId} 的关联数据`)

  const cleanupResults = {
    tournamentTeams: 0,
    tournamentGroups: 0,
    matches: 0
  }

  try {
    // 1. 删除 tournament_teams 关联
    const tournamentTeamsRes = await db.collection('tournament_teams')
      .where({ tournamentId: tournamentId })
      .remove()
    cleanupResults.tournamentTeams = tournamentTeamsRes.stats?.removed || 0
    console.log(`[级联删除] tournament_teams: ${cleanupResults.tournamentTeams}`)

    // 2. 删除 tournament_groups 分组
    const tournamentGroupsRes = await db.collection('tournament_groups')
      .where({ tournamentId: tournamentId })
      .remove()
    cleanupResults.tournamentGroups = tournamentGroupsRes.stats?.removed || 0
    console.log(`[级联删除] tournament_groups: ${cleanupResults.tournamentGroups}`)

    // 3. 删除 matches 比赛
    const matchesRes = await db.collection('matches')
      .where({
        $or: [
          { tournamentId: tournamentId },
          { 'tournament.id': tournamentId }
        ]
      })
      .remove()
    cleanupResults.matches = matchesRes.stats?.removed || 0
    console.log(`[级联删除] matches: ${cleanupResults.matches}`)

    console.log('[级联删除] 清理完成:', cleanupResults)
    return cleanupResults

  } catch (err) {
    console.error('[级联删除] 清理关联数据失败:', err)
    // 不影响主删除操作，记录错误即可
    return { error: err.message }
  }
}
