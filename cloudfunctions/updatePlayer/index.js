// updatePlayer - 更新球员信息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { id, _id, name, jerseyNumber, position, teamId, teamName, photo, height, weight, birthday, contactName, contactPhone } = event
    const docId = id || _id
    if (!docId) return { success: false, error: '缺少球员ID' }
    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (jerseyNumber !== undefined) updateData.jerseyNumber = jerseyNumber
    if (position !== undefined) updateData.position = position
    if (teamId !== undefined) updateData.teamId = teamId
    if (teamName !== undefined) updateData.teamName = teamName
    if (photo !== undefined) updateData.photo = photo
    if (height !== undefined) updateData.height = height
    if (weight !== undefined) updateData.weight = weight
    if (birthday !== undefined) updateData.birthday = birthday
    if (contactName !== undefined) updateData.contactName = contactName
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone
    updateData.updatedAt = db.serverDate()
    await db.collection('players').doc(docId).update({ data: updateData })
    console.log('[updatePlayer] 更新成功:', docId)
    return { success: true }
  } catch (err) {
    console.error('[updatePlayer] 错误:', err)
    return { success: false, error: err.message }
  }
}
