// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { tournamentId } = event

  if (!tournamentId) {
    return {
      success: false,
      message: '缺少赛事ID'
    }
  }

  try {
    console.log('开始删除赛事:', tournamentId)

    // 1. 删除参赛球队记录
    console.log('删除参赛球队记录...')
    const teamRecords = await db.collection('tournament_teams')
      .where({ tournamentId })
      .get()

    const deleteTeamPromises = teamRecords.data.map(team => 
      db.collection('tournament_teams').doc(team._id).remove()
    )
    await Promise.all(deleteTeamPromises)
    console.log('删除参赛球队记录:', teamRecords.data.length, '条')

    // 2. 删除比赛记录
    console.log('删除比赛记录...')
    const matches = await db.collection('matches')
      .where({ tournamentId })
      .get()

    const deleteMatchPromises = matches.data.map(match =>
      db.collection('matches').doc(match._id).remove()
    )
    await Promise.all(deleteMatchPromises)
    console.log('删除比赛记录:', matches.data.length, '条')

    // 3. 删除赛事
    console.log('删除赛事记录...')
    await db.collection('tournaments').doc(tournamentId).remove()
    console.log('赛事删除成功')

    return {
      success: true,
      message: '删除成功',
      data: {
        deletedTeams: teamRecords.data.length,
        deletedMatches: matches.data.length
      }
    }
  } catch (err) {
    console.error('删除赛事失败:', err)
    return {
      success: false,
      message: '删除失败: ' + err.message,
      error: err
    }
  }
}
