// getPlayers - 获取球员列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { pageIndex = 0, pageSize = 1000 } = event
    const result = await db.collection('players')
      .orderBy('createdAt', 'desc')
      .skip(pageIndex * pageSize)
      .limit(pageSize)
      .get()
    return { success: true, data: result.data }
  } catch (err) {
    console.error('[getPlayers] 错误:', err)
    return { success: false, error: err.message }
  }
}
