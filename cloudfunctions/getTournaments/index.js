// getTournaments - 获取赛事列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { pageIndex = 0, pageSize = 100, includeLegacyCategory = false } = event
    const where = includeLegacyCategory ? {} : _.or([{ category: 'youth' }, { type: 'youth' }])
    const query = db.collection('tournaments').where(where)
    const [result, countResult] = await Promise.all([
      query
        .orderBy('createdAt', 'desc')
        .skip(pageIndex * pageSize)
        .limit(pageSize)
        .get(),
      query.count()
    ])
    return { success: true, data: result.data, total: countResult.total || 0 }
  } catch (err) {
    console.error('[getTournaments] 错误:', err)
    return { success: false, error: err.message }
  }
}
