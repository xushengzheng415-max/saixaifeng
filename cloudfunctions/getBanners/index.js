// getBanners - 获取Banner列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  try {
    const result = await db.collection('banners').orderBy('sort', 'asc').get()
    return { success: true, data: result.data }
  } catch (err) {
    console.error('[getBanners] 错误:', err)
    return { success: false, error: err.message }
  }
}
