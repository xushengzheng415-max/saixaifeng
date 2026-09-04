// updateTeam - 更新球队信息（赛事中心后台用）
// v2.0 精简：只更新 v2.0 规范中的字段
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { id, _id, name, shortName, teamCode, province, city, cityName, teamType, establishedDate, logo, description, claimStatus, ownerPhone, creatorId } = event
    const docId = id || _id
    if (!docId) return { success: false, error: '缺少球队ID' }

    const updateData = {}
    // 核心字段
    if (name !== undefined) updateData.name = name
    if (shortName !== undefined) updateData.shortName = shortName
    if (province !== undefined) updateData.provinceCode = province
    if (city !== undefined) updateData.cityCode = city
    if (cityName !== undefined) updateData.cityName = cityName
    if (teamCode !== undefined) updateData.teamCode = teamCode
    if (teamType !== undefined) updateData.teamType = teamType
    if (ownerPhone !== undefined) {
      updateData.ownerPhone = ownerPhone
      updateData.creatorPhone = ownerPhone
      updateData.contactPhone = ownerPhone
      updateData.phoneNumber = ownerPhone
      updateData.phone = ownerPhone
      updateData.mobile = ownerPhone
    }
    // 可选字段
    if (establishedDate !== undefined) updateData.establishedDate = establishedDate
    if (logo !== undefined) updateData.logo = logo
    if (description !== undefined) updateData.description = description
    // 管理字段
    if (claimStatus !== undefined) updateData.claimStatus = claimStatus
    if (creatorId !== undefined) updateData.creatorId = creatorId

    updateData.updateTime = db.serverDate()
    await db.collection('teams').doc(docId).update({ data: updateData })
    console.log('[updateTeam] 更新成功:', docId)
    return { success: true }
  } catch (err) {
    console.error('[updateTeam] 错误:', err)
    return { success: false, error: err.message }
  }
}
