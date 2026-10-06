// 云函数：批量更新记录（支持权限）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action, collection, id, data, ids, updateData } = event

  if (!collection) {
    return { success: false, message: '缺少 collection 参数' }
  }

  try {
    // 根据 action 执行不同操作
    switch (action) {
      case 'add':
        return await handleAdd(collection, data)
      case 'update':
        return await handleUpdate(collection, id, data)
      case 'delete':
        return await handleDelete(collection, id)
      case 'batchUpdate':
        return await handleBatchUpdate(collection, ids, updateData)
      default:
        // 兼容旧版本调用（直接更新）
        if (id) {
          return await handleUpdate(collection, id, data)
        }
        return { success: false, message: '未知的 action 类型' }
    }
  } catch (err) {
    console.error('操作失败:', err)
    return {
      success: false,
      message: err.message || '操作失败'
    }
  }
}

/**
 * 新增记录
 */
async function handleAdd(collection, data) {
  if (!data) {
    return { success: false, message: '缺少 data 参数' }
  }

  try {
    const result = await db.collection(collection).add({
      data: {
        ...data,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    return {
      success: true,
      _id: result._id,
      message: '新增成功'
    }
  } catch (err) {
    // 捕获集合不存在的错误，返回友好提示
    if (err.message && err.message.includes('DATABASE_COLLECTION_NOT_EXIST')) {
      return {
        success: false,
        message: `数据库集合「${collection}」不存在，请前往微信云开发控制台 → 数据库 → 创建集合「${collection}」`,
        needCreateCollection: true,
        collectionName: collection
      }
    }
    throw err
  }
}

/**
 * 更新单条记录
 */
async function handleUpdate(collection, id, data) {
  if (!id) {
    return { success: false, message: '缺少 id 参数' }
  }
  if (!data) {
    return { success: false, message: '缺少 data 参数' }
  }

  try {
    const result = await db.collection(collection).doc(id).update({
      data: {
        ...data,
        updateTime: db.serverDate()
      }
    })

    return {
      success: true,
      updated: result.stats.updated,
      message: result.stats.updated > 0 ? '更新成功' : '无更新'
    }
  } catch (err) {
    // 捕获集合不存在的错误，返回友好提示
    if (err.message && err.message.includes('DATABASE_COLLECTION_NOT_EXIST')) {
      return {
        success: false,
        message: `数据库集合「${collection}」不存在，请前往微信云开发控制台 → 数据库 → 创建集合「${collection}」`,
        needCreateCollection: true,
        collectionName: collection
      }
    }
    throw err
  }
}

/**
 * 删除单条记录
 */
async function handleDelete(collection, id) {
  if (!id) {
    return { success: false, message: '缺少 id 参数' }
  }

  try {
    // 先查询确认记录存在
    let docExists = false
    let docData = null
    try {
      const docRes = await db.collection(collection).doc(id).get()
      docExists = !!(docRes.data && docRes.data.length > 0)
      docData = docRes.data && docRes.data[0]
    } catch (e) {
      console.log('查询记录失败:', e.message)
    }

    // 删除主记录
    const result = await db.collection(collection).doc(id).remove()
    const deleted = result.stats?.deleted || 0

    // 如果是删除球员，同步删除球员库中的记录
    if (deleted === 1 && collection === 'players' && docData && docData.idCard) {
      try {
        const libRes = await db.collection('player_library').where({
          idCard: docData.idCard
        }).get()
        
        if (libRes.data && libRes.data.length > 0) {
          const libDeleteTasks = libRes.data.map(item => 
            db.collection('player_library').doc(item._id).remove()
          )
          await Promise.all(libDeleteTasks)
          console.log(`同步删除球员库记录 ${libRes.data.length} 条`)
        }
      } catch (libErr) {
        console.error('同步删除球员库失败:', libErr.message)
        // 不阻塞主流程
      }
    }

    if (deleted === 1) {
      return { success: true, deleted: 1, message: '删除成功' }
    } else if (!docExists) {
      // 记录已经不存在，说明删除目标已达成（可能是之前已删除或并发删除）
      return { success: true, deleted: 0, message: '删除成功' }
    } else {
      return {
        success: false,
        deleted: 0,
        docExists: docExists,
        message: `删除失败，记录存在=${docExists}, deleted=${deleted}`
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('DATABASE_COLLECTION_NOT_EXIST')) {
      return {
        success: false,
        message: `数据库集合「${collection}」不存在`,
        needCreateCollection: true,
        collectionName: collection
      }
    }
    throw err
  }
}

/**
 * 批量更新记录
 */
async function handleBatchUpdate(collection, ids, updateData) {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return { success: false, message: '缺少 ids 参数' }
  }
  if (!updateData) {
    return { success: false, message: '缺少 updateData 参数' }
  }

  const tasks = ids.map(id => {
    return db.collection(collection).doc(id).update({
      data: {
        ...updateData,
        updateTime: db.serverDate()
      }
    })
  })

  const results = await Promise.all(tasks)
  const updatedCount = results.reduce((sum, r) => sum + (r.stats?.updated || 0), 0)

  return {
    success: true,
    updated: updatedCount,
    message: `批量更新完成，成功更新 ${updatedCount} 条记录`
  }
}
