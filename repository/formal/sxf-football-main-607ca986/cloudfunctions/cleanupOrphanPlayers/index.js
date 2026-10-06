// 云函数：清理孤儿球员记录（不再被任何球队引用的球员）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async (event, context) => {
  const { dryRun = true } = event
  
  try {
    console.log('开始扫描孤儿球员记录，dryRun:', dryRun)
    
    // 1. 获取所有球队的ID列表
    const teamsRes = await db.collection('teams').get()
    const teamIds = teamsRes.data.map(t => t._id)
    const teamCodes = teamsRes.data.map(t => t.code).filter(Boolean)
    
    console.log(`找到 ${teamIds.length} 个球队`)
    
    // 2. 查找所有球员记录
    const playersRes = await db.collection('players').get()
    const allPlayers = playersRes.data
    
    console.log(`找到 ${allPlayers.length} 个球员记录`)
    
    // 3. 找出孤儿球员（不再被任何球队引用）
    const orphanPlayers = []
    
    for (const player of allPlayers) {
      const teamId = player.teamId
      const teamCode = player.teamCode
      
      // 检查该球员是否还关联到其他存在的球队
      let isOrphan = true
      
      if (teamId && teamIds.includes(teamId)) {
        isOrphan = false
      }
      if (teamCode && teamCodes.includes(teamCode)) {
        isOrphan = false
      }
      
      // 额外检查：如果teamId或teamCode为空，也是孤儿
      if (!teamId && !teamCode) {
        isOrphan = true
      }
      
      if (isOrphan) {
        orphanPlayers.push({
          _id: player._id,
          name: player.name,
          idCard: player.idCard,
          teamId: teamId || null,
          teamCode: teamCode || null
        })
      }
    }
    
    console.log(`找到 ${orphanPlayers.length} 个孤儿球员记录`)
    
    // 4. 如果要实际删除（非dryRun模式）
    let deletedCount = 0
    
    if (!dryRun && orphanPlayers.length > 0) {
      const orphanIds = orphanPlayers.map(p => p._id)
      
      // 批量删除（每次最多删除20条）
      const batchSize = 20
      for (let i = 0; i < orphanIds.length; i += batchSize) {
        const batch = orphanIds.slice(i, i + batchSize)
        const result = await db.collection('players').where({
          _id: _.in(batch)
        }).remove()
        
        deletedCount += result.stats.removed
        console.log(`已删除 ${i + batch.length} / ${orphanIds.length} 条记录`)
      }
      
      console.log(`总共删除了 ${deletedCount} 条孤儿记录`)
    }
    
    return {
      success: true,
      dryRun: dryRun,
      totalPlayers: allPlayers.length,
      orphanCount: orphanPlayers.length,
      deletedCount: deletedCount,
      orphanPlayers: orphanPlayers,
      message: dryRun 
        ? `预览模式：找到 ${orphanPlayers.length} 个孤儿球员记录（未删除）` 
        : `已删除 ${deletedCount} 个孤儿球员记录`
    }
    
  } catch (err) {
    console.error('清理孤儿球员失败:', err)
    return {
      success: false,
      message: err.message || '清理失败'
    }
  }
}
