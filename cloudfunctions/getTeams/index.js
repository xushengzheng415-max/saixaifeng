// getTeams - 获取球队列表（赛事中心后台用）
// 自动补全所属手机号：
//   - 赛事中心球队：ownerPhone 为空或已填写
//   - 赛小蜂球队：从 creatorId 反查 users 表补全 ownerPhone
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  try {
    const { pageIndex = 0, pageSize = 1000 } = event
    const result = await db.collection('teams')
      .orderBy('createTime', 'desc')
      .skip(pageIndex * pageSize)
      .limit(pageSize)
      .get()
    
    const teams = result.data || []
    
    // 收集需要补全手机号的 creatorId
    const userIdsNeedingPhone = []
    teams.forEach(t => {
      // 赛小蜂创建的球队，有 creatorId 但没有 ownerPhone
      if (!t.ownerPhone && t.creatorId) {
        userIdsNeedingPhone.push(t.creatorId)
      }
    })
    
    // 批量查询 users 表
    if (userIdsNeedingPhone.length > 0) {
      const uniqueIds = [...new Set(userIdsNeedingPhone)]
      const phoneMap = {}
      
      // 分批查询
      for (let i = 0; i < uniqueIds.length; i += 100) {
        const batch = uniqueIds.slice(i, i + 100)
        const userResult = await db.collection('users')
          .where({ _id: _.in(batch) })
          .get()
        ;(userResult.data || []).forEach(u => {
          phoneMap[u._id] = u.phoneNumber || u.phone || ''
        })
      }
      
      // 补全 ownerPhone
      teams.forEach(t => {
        if (!t.ownerPhone && t.creatorId && phoneMap[t.creatorId]) {
          t.ownerPhone = phoneMap[t.creatorId]
        }
      })
    }
    
    return { success: true, data: teams }
  } catch (err) {
    console.error('[getTeams] 错误:', err)
    return { success: false, error: err.message }
  }
}
