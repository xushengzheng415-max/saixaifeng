const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { tournamentId } = event
  if (!tournamentId) {
    return { code: -1, message: '缺少 tournamentId' }
  }

  try {
    const db = cloud.database()
    const _ = db.command
    const countRes = await db.collection('tournament_teams')
      .where({ tournamentId: tournamentId })
      .count()
    const total = countRes.total

    if (total === 0) {
      return { code: 0, message: '无记录可删', deleted: 0 }
    }

    // 小程序端 limit 100，分批删除
    let deleted = 0
    while (deleted < total) {
      const res = await db.collection('tournament_teams')
        .where({ tournamentId: tournamentId })
        .limit(100)
        .get()
      const batch = res.data || []
      if (batch.length === 0) break
      for (const doc of batch) {
        await db.collection('tournament_teams').doc(doc._id).remove()
      }
      deleted += batch.length
    }

    return { code: 0, message: `成功删除 ${deleted} 条记录`, deleted }
  } catch (e) {
    return { code: -1, message: e.message, error: e }
  }
}
