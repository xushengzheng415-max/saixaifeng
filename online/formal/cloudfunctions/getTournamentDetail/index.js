const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { id, includeLegacyCategory = false } = event

  if (!id) {
    return { success: false, message: '缺少赛事ID' }
  }

  try {
    const res = await db.collection('tournaments').doc(id).get()

    if (!res.data || res.data.length === 0) {
      return { success: false, message: '赛事不存在' }
    }

    const t = res.data[0] || res.data
    const category = t.category || t.type || 'youth'
    if (!includeLegacyCategory && category !== 'youth') {
      return { success: false, message: '该赛事不属于青少年赛事' }
    }

    return {
      success: true,
      data: {
        _id: t._id,
        name: t.name,
        type: t.type || category,
        category,
        categoryLabel: '青少年赛事',
        matchFormat: t.matchFormat || 'tournament', // 赛制：tournament/cup/league/combined
        status: t.status,
        startDate: t.startDate,
        endDate: t.endDate,
        location: t.location,
        maxTeams: t.maxTeams,
        registeredTeams: t.registeredTeams || 0,
        maxPlayers: t.maxPlayers,
        coverImage: t.coverImage,
        featured: t.featured,
        organizerName: t.organizerName,
        description: t.description || '',
        rules: t.rules || '',
        // 联赛制专用
        leagueGrouped: t.leagueGrouped || false,
        leagueGroups: t.leagueGroups || [],
        // 赛会制专用
        groupCount: t.groupCount || 0,
        advanceCount: t.advanceCount || 0,
        // 杯赛制专用
        cupRounds: t.cupRounds || []
      }
    }
  } catch (err) {
    console.error('获取赛事详情失败:', err)
    return {
      success: false,
      message: err.message || '获取失败'
    }
  }
}
