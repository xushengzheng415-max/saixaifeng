// deletePlayer - 删除球员
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { id, _id } = event
    const docId = id || _id
    if (!docId) return { success: false, error: '缺少球员ID' }
    await db.collection('players').doc(docId).remove()
    console.log('[deletePlayer] 删除成功:', docId)
    return { success: true }
  } catch (err) {
    console.error('[deletePlayer] 错误:', err)
    return { success: false, error: err.message }
  }
}
