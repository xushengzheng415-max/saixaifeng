// 云函数：更新比赛首发阵容
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  console.log('updateMatchLineup 参数:', JSON.stringify(event))

  const { matchId, lineupField, lineupData } = event

  if (!matchId || !lineupField || !lineupData) {
    return { code: -1, message: '参数不完整' }
  }

  try {
    // 用 db.command.set 兼容 Node 16（避免 ES6 计算属性名）
    var updateData = {}
    updateData[lineupField] = lineupData

    const result = await db.collection('matches').doc(matchId).update(updateData)

    console.log('更新首发阵容成功:', result)
    return { code: 0, message: '提交成功' }
  } catch (e) {
    console.error('更新首发阵容失败:', e)
    return { code: -1, message: '提交失败：' + (e.message || e) }
  }
}
