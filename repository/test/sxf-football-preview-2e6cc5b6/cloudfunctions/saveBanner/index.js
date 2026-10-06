// saveBanner - 保存Banner（新增或更新）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { id, _id, image, title, link, sort, status } = event
    const docId = id || _id
    const data = {
      image: image || '',
      title: title || '',
      link: link || '',
      sort: sort || 0,
      status: status || 'active',
      updatedAt: db.serverDate()
    }
    if (docId) {
      await db.collection('banners').doc(docId).update({ data })
      console.log('[saveBanner] 更新成功:', docId)
    } else {
      data.createdAt = db.serverDate()
      const addResult = await db.collection('banners').add({ data })
      console.log('[saveBanner] 创建成功:', addResult._id)
    }
    return { success: true }
  } catch (err) {
    console.error('[saveBanner] 错误:', err)
    return { success: false, error: err.message }
  }
}
