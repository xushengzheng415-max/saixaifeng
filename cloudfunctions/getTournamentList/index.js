const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { featured = false, status, page = 1, pageSize = 20 } = event

  try {
    let query = db.collection('tournaments')

    // 构建查询条件
    let where = {}

    // 只查询已发布的赛事（非草稿状态）
    where.status = _.neq('draft')

    // 如果指定了状态
    if (status) {
      where.status = status
    }

    // 推荐赛事 - 查询 featured 为 true 的
    if (featured) {
      where.featured = true
    }

    query = query.where(where)

    // 排序：推荐的排前面，然后按创建时间倒序
    const result = await query
      .orderBy('featured', 'desc')
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return {
      success: true,
      data: result.data.map(item => ({
        _id: item._id,
        name: item.name,
        type: item.type,               // 赛事分类：youth/amateur/local
        matchFormat: item.matchFormat || 'tournament', // 赛制：tournament/cup/league/combined
        status: item.status,
        startDate: item.startDate,
        endDate: item.endDate,
        location: item.location,
        maxTeams: item.maxTeams,
        registeredTeams: item.registeredTeams || 0,
        maxPlayers: item.maxPlayers,
        coverImage: item.coverImage,
        featured: item.featured,
        organizerName: item.organizerName
      }))
    }
  } catch (err) {
    console.error('获取赛事列表失败:', err)
    return {
      success: false,
      message: err.message || '获取失败'
    }
  }
}
