// getTournaments - 获取赛事列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { pageIndex = 0, pageSize = 100, includeLegacyCategory = false } = event
    const where = includeLegacyCategory ? {} : _.or([{ category: 'youth' }, { type: 'youth' }])
    const result = await db.collection('tournaments')
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip(pageIndex * pageSize)
      .limit(pageSize)
      .get()
    return { success: true, data: result.data }
  } catch (err) {
    console.error('[getTournaments] 错误:', err)
    return { success: false, error: err.message }
  }
}
