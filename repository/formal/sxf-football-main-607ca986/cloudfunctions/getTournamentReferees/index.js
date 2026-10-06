// 云函数：获取赛事关联的裁判列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { tournamentId } = event

  try {
    // 优先按 tournamentId 过滤（如果 referees 集合有该字段）
    let query = db.collection('referees')
    if (tournamentId) {
      query = query.where({
        tournamentId: tournamentId
      })
    }

    const res = await query.orderBy('createTime', 'desc').get()

    return {
      success: true,
      data: res.data,
      total: res.data.length
    }
  } catch (err) {
    console.error('获取裁判列表失败:', err)
    return {
      success: false,
      message: '获取裁判列表失败: ' + err.message,
      data: []
    }
  }
}
