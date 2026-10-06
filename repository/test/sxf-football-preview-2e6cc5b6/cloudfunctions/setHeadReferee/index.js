// 云函数：设置赛事裁判长
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { tournamentId, refereeId, refereeName, action } = event
  // action: 'set' | 'unset' | 'get'

  if (!tournamentId) {
    return { success: false, message: '缺少 tournamentId' }
  }

  try {
    if (action === 'get') {
      // 查询当前赛事的裁判长
      const res = await db.collection('tournament_referees')
        .where({ tournamentId, isHeadReferee: true })
        .get()
      if (res.data.length > 0) {
        return { success: true, headRefereeId: res.data[0].refereeId }
      }
      return { success: true, headRefereeId: null }
    }

    if (action === 'unset') {
      // 取消当前赛事所有裁判的裁判长身份
      const res = await db.collection('tournament_referees')
        .where({ tournamentId, isHeadReferee: true })
        .get()
      for (const doc of res.data) {
        await db.collection('tournament_referees').doc(doc._id).update({
          data: { isHeadReferee: false, updateTime: db.serverDate() }
        })
      }
      return { success: true, message: '已取消裁判长' }
    }

    if (action === 'set') {
      if (!refereeId) {
        return { success: false, message: '缺少 refereeId' }
      }

      // 1. 先取消当前赛事所有裁判的裁判长身份
      const oldRes = await db.collection('tournament_referees')
        .where({ tournamentId, isHeadReferee: true })
        .get()
      for (const doc of oldRes.data) {
        await db.collection('tournament_referees').doc(doc._id).update({
          data: { isHeadReferee: false, updateTime: db.serverDate() }
        })
      }

      // 2. 查询该裁判是否已在 tournament_referees 中
      let targetRes = await db.collection('tournament_referees')
        .where({ tournamentId, refereeId })
        .get()

      // 3. 如果不存在，自动创建记录
      if (targetRes.data.length === 0) {
        let name = refereeName || ''
        // 尝试从 referees 集合查询名字
        if (!name) {
          const refRes = await db.collection('referees').doc(refereeId).get()
          if (refRes.data) {
            name = refRes.data.name || ''
          }
        }
        const addRes = await db.collection('tournament_referees').add({
          data: {
            tournamentId,
            refereeId,
            refereeName: name,
            roleLabel: '裁判',
            isHeadReferee: true,
            assignedAt: db.serverDate(),
            updateTime: db.serverDate()
          }
        })
        return { success: true, message: '裁判长设置成功', created: true }
      }

      // 4. 已存在，直接更新
      await db.collection('tournament_referees').doc(targetRes.data[0]._id).update({
        data: { isHeadReferee: true, updateTime: db.serverDate() }
      })

      return { success: true, message: '裁判长设置成功' }
    }

    return { success: false, message: '无效的 action，支持：set / unset / get' }
  } catch (err) {
    console.error('setHeadReferee 失败:', err)
    return { success: false, message: '操作失败: ' + err.message }
  }
}
