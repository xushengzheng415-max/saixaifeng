// createPlayer - 创建球员
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { name, jerseyNumber, position, teamId, teamName, photo, height, weight, birthday, contactName, contactPhone, creatorPhone } = event
    if (!name) return { success: false, error: '球员姓名必填' }
    const data = {
      name: name.trim(),
      jerseyNumber: jerseyNumber || '',
      position: position || '',
      teamId: teamId || '',
      teamName: teamName || '',
      photo: photo || '',
      height: height || '',
      weight: weight || '',
      birthday: birthday || '',
      contactName: contactName || '',
      contactPhone: contactPhone || '',
      creatorPhone: creatorPhone || '',
      source: 'tournament_center',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
    const addResult = await db.collection('players').add({ data })
    console.log('[createPlayer] 创建成功:', addResult._id)
    return { success: true, data: { id: addResult._id } }
  } catch (err) {
    console.error('[createPlayer] 错误:', err)
    return { success: false, error: err.message }
  }
}
