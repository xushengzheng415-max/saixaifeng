// Web端批量删除云函数 - 绕过权限限制
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { collection, ids } = event

  if (!collection || !ids || !Array.isArray(ids)) {
    return {
      success: false,
      message: '缺少集合名称或记录ID列表'
    }
  }

  try {
    console.log(`批量删除 ${collection}: ${ids.length} 条记录`)

    const results = []
    
    // 逐条删除（wx-server-sdk 云函数有管理员权限）
    for (const id of ids) {
      try {
        const result = await db.collection(collection).doc(id).remove()
        results.push({ id, deleted: result.deleted, success: result.deleted === 1 })
      } catch (err) {
        console.error(`删除 ${id} 失败:`, err)
        results.push({ id, success: false, error: err.message })
      }
    }

    const successCount = results.filter(r => r.success).length
    
    return {
      success: true,
      message: `成功删除 ${successCount}/${ids.length} 条记录`,
      deleted: successCount,
      total: ids.length,
      results
    }
  } catch (err) {
    console.error('批量删除失败:', err)
    return {
      success: false,
      message: '批量删除失败: ' + err.message,
      error: err.message
    }
  }
}
