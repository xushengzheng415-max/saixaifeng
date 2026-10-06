// deleteTeam - 删除球队
// ★ 安全检查：球队下有球员则禁止删除，避免孤儿数据
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { id, _id, force } = event
    const docId = id || _id
    if (!docId) return { success: false, error: '缺少球队ID' }

    // ★ 1. 检查该球队下是否有球员
    const playerCountRes = await db.collection('players')
      .where({ teamId: docId })
      .count()
    const playerCount = playerCountRes.total || 0

    console.log('[deleteTeam] 球队', docId, '有', playerCount, '名球员')

    // ★ 2. 有球员时禁止删除（除非 force=true）
    if (playerCount > 0 && !force) {
      return {
        success: false,
        error: `该球队下有 ${playerCount} 名球员，请先删除所有球员后再删除球队`,
        playerCount: playerCount
      }
    }

    // ★ 3. 如果 force=true，先级联删除球员
    if (playerCount > 0 && force) {
      console.log('[deleteTeam] 级联删除', playerCount, '名球员...')
      const deleteResult = await db.collection('players')
        .where({ teamId: docId })
        .remove()
      console.log('[deleteTeam] 已删除球员:', deleteResult)
    }

    // ★ 4. 删除球队
    await db.collection('teams').doc(docId).remove()
    console.log('[deleteTeam] 删除成功:', docId)

    return {
      success: true,
      message: playerCount > 0 ? `已删除球队及 ${playerCount} 名球员` : '球队已删除',
      deletedPlayers: playerCount > 0 ? playerCount : 0
    }
  } catch (err) {
    console.error('[deleteTeam] 错误:', err)
    return { success: false, error: err.message }
  }
}
