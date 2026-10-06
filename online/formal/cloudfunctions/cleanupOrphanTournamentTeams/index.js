// 云函数：清理孤立的 tournament_teams 记录（关联的赛事已不存在）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { dryRun = true, teamFilter = null } = event

  try {
    console.log('开始扫描孤立的 tournament_teams 记录，dryRun:', dryRun, 'teamFilter:', teamFilter)

    // 1. 获取所有存在的赛事ID
    const tournamentsRes = await db.collection('tournaments').get()
    const tournamentIds = tournamentsRes.data.map(t => t._id)

    console.log(`找到 ${tournamentIds.length} 个有效赛事`)

    // 2. 获取 tournament_teams 记录（如果指定了 teamFilter，只查这些球队的）
    let query = {}
    if (teamFilter && Array.isArray(teamFilter) && teamFilter.length > 0) {
      query = { teamId: _.in(teamFilter) }
      console.log('按球队过滤:', teamFilter)
    }

    const ttRes = await db.collection('tournament_teams').where(query).get()
    const allRecords = ttRes.data

    console.log(`找到 ${allRecords.length} 条 tournament_teams 记录`)

    // 3. 找出孤立记录（tournamentId 不在 tournaments 中的）
    const orphanRecords = []

    for (const record of allRecords) {
      const tid = record.tournamentId

      // tournamentId 为空 或 不在有效赛事列表中
      if (!tid || !tournamentIds.includes(tid)) {
        orphanRecords.push({
          _id: record._id,
          tournamentId: tid || null,
          teamId: record.teamId || null,
          teamName: record.teamName || '未知球队',
          status: record.status || 'unknown',
          createTime: record.createTime || null
        })
      }
    }

    console.log(`找到 ${orphanRecords.length} 条孤立的 tournament_teams 记录`)

    // 4. 实际删除（非 dryRun 模式）
    let deletedCount = 0

    if (!dryRun && orphanRecords.length > 0) {
      const orphanIds = orphanRecords.map(r => r._id)

      // 批量删除（每次最多 20 条）
      const batchSize = 20
      for (let i = 0; i < orphanIds.length; i += batchSize) {
        const batch = orphanIds.slice(i, i + batchSize)
        const result = await db.collection('tournament_teams').where({
          _id: _.in(batch)
        }).remove()

        deletedCount += result.stats.removed
        console.log(`已删除 ${Math.min(i + batch.length, orphanIds.length)} / ${orphanIds.length} 条记录`)
      }

      console.log(`总共删除了 ${deletedCount} 条孤立记录`)
    }

    return {
      success: true,
      dryRun: dryRun,
      totalRecords: allRecords.length,
      validTournaments: tournamentIds.length,
      orphanCount: orphanRecords.length,
      deletedCount: deletedCount,
      orphanRecords: orphanRecords.slice(0, 50), // 最多返回50条详情
      message: dryRun
        ? `预览模式：找到 ${orphanRecords.length} 条孤立记录（未删除）。传入 dryRun: false 执行实际删除。`
        : `已删除 ${deletedCount} 条孤立记录`
    }

  } catch (err) {
    console.error('清理孤立记录失败:', err)
    return {
      success: false,
      message: err.message || '清理失败'
    }
  }
}
