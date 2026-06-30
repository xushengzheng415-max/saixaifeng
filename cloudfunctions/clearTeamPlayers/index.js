/**
 * 批量删除指定球队下所有球员 - 一次性工具
 * 用法：调用后直接删除，无需前端
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { teamId } = event
  if (!teamId) return { success: false, error: '缺少 teamId' }

  try {
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
