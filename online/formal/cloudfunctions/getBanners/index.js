// getBanners - 获取Banner列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  try {
    const result = await db.collection('banners').orderBy('sort', 'asc').get()
    const banners = (result.data || [])
      .filter(item => item.isActive !== false && item.status !== 'inactive')
      .map(item => ({
        ...item,
        imageUrl: item.imageUrl || item.image || ''
      }))
    return { success: true, data: banners }
  } catch (err) {
    console.error('[getBanners] 错误:', err)
    return { success: false, error: err.message }
  }
}
