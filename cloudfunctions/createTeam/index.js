// createTeam - 创建球队（赛事中心后台用）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { name, shortName, teamCode, province, city, cityName, teamType, establishedDate, logo, description, ownerPhone } = event
    if (!name || !shortName) {
      return { success: false, error: '球队名称必填' }
    }

    const claimStatus = ownerPhone ? 'claimed' : 'unclaimed'

    // ★ v2.0 精简字段 — 只写 17 个核心字段
    const data = {
      // 核心
      name: name.trim(),
      shortName: shortName.trim(),
      provinceCode: province || '',
      cityCode: city || '',
      cityName: cityName || '',
      teamType: teamType || '',
      teamCode: teamCode || '',
      ownerPhone: ownerPhone || '',
      source: 'tournament_center',
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      // 可选
      establishedDate: establishedDate || '',
      logo: logo || '',
      description: description || '',
      home: '',
      // 管理
      creatorId: '',
      claimStatus: claimStatus
    }
    const addResult = await db.collection('teams').add({ data })
    console.log('[createTeam] 创建成功:', addResult._id, teamCode, '状态:', claimStatus)
    return { success: true, data: { id: addResult._id, teamCode: teamCode, claimStatus: claimStatus } }
  } catch (err) {
    console.error('[createTeam] 错误:', err)
    return { success: false, error: err.message }
  }
}
