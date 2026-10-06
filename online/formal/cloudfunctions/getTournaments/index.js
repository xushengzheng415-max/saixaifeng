const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { page = 1, pageSize = 500 } = event

  try {
    const result = await db.collection('tournaments')
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return {
      success: true,
      data: result.data.map(item => ({
        _id: item._id,
        name: item.name,
        category: item.category || '',
        formatType: item.formatType || item.matchFormat || 'tournament',
        status: item.status || 'draft',
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        location: item.location || '',
        maxTeams: item.maxTeams || 0,
        registeredTeams: item.registeredTeams || 0,
        coverImage: item.coverImage || '',
        organizerName: item.organizerName || '',
        createTime: item.createTime,
        updateTime: item.updateTime
      })),
      total: result.data.length
    }
  } catch (err) {
    console.error('获取赛事列表失败:', err)
    return {
      success: false,
      message: err.message || '获取失败'
    }
  }
}
