const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { id, title, imageUrl, link, sort, isActive } = event

  try {
    const data = {
      title: title || '',
      imageUrl: imageUrl || '',
      link: link || '',
      sort: sort || 0,
      isActive: isActive !== false,
      updateTime: db.serverDate()
    }

    if (id) {
      // 更新
      await db.collection('banners').doc(id).update({
        data
      })
      return {
        success: true,
        message: '更新成功',
        id
      }
    } else {
      // 新增
      data.createTime = db.serverDate()
      const result = await db.collection('banners').add({
        data
      })
      return {
        success: true,
        message: '添加成功',
        id: result._id
      }
    }
  } catch (err) {
    console.error('保存轮播图失败:', err)
    return {
      success: false,
      message: err.message || '保存失败'
    }
  }
}
