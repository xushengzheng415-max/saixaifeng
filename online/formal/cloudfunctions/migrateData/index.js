// migrateData - 数据迁移：把匿名数据归属到指定手机号
// 使用方式：
//   1. 先 dryRun 预览：{ action: 'migrate', dryRun: true }
//   2. 确认后执行：{ action: 'migrate', dryRun: false }
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

exports.main = async (event) => {
  const { action = 'migrate', dryRun = true } = event

  if (action !== 'migrate') {
    return { success: false, error: '未知操作，只支持 migrate' }
  }

  const db = cloud.database()
  const _ = db.command

  // 目标手机号
  const TEAM_PHONE = '17319716663'      // 球队/球员 归属手机号（小程序端）
  const TOURNAMENT_PHONE = '15038292130' // 赛事 归属手机号（网页端主办方）

  const result = {
    success: true,
    dryRun: dryRun,
    teams: { updated: 0, skipped: 0, list: [] },
    tournaments: { updated: 0, skipped: 0, list: [] },
    errors: []
  }

  try {
    // ========== 1. 迁移 teams（球队）==========
    // 目标：确保每支球队有 ownerPhone = 17319716663
    // 策略：如果 contactPhone 已有值，保留；否则设为 TEAM_PHONE
    //       同时把 creatorId = 'dev-user-id' 标记为已迁移
    const teamsRes = await db.collection('teams').get()
    for (const team of teamsRes.data) {
      const updateData = {}

      // 添加 ownerPhone（以 contactPhone 为准，没有则用默认）
      if (!team.ownerPhone) {
        updateData.ownerPhone = team.contactPhone || TEAM_PHONE
      }

      // 标记匿名 creatorId 为已迁移
      if (team.creatorId === 'dev-user-id' || !team.creatorId) {
        updateData.creatorId = 'migrated_' + TEAM_PHONE
      }

      if (Object.keys(updateData).length > 0) {
        if (!dryRun) {
          try {
            await db.collection('teams').doc(team._id).update({
              data: {
                ...updateData,
                updateTime: db.serverDate()
              }
            })
            result.teams.updated++
          } catch (err) {
            result.errors.push({ collection: 'teams', _id: team._id, error: err.message })
            result.teams.skipped++
          }
        } else {
          result.teams.updated++  // dryRun 模式下计数
        }
      } else {
        result.teams.skipped++
      }

      result.teams.list.push({
        _id: team._id,
        name: team.name,
        contactPhone: team.contactPhone || null,
        ownerPhone: team.ownerPhone || updateData.ownerPhone || null,
        wouldUpdate: Object.keys(updateData)
      })
    }

    // ========== 2. 迁移 tournaments（赛事）==========
    // 目标：给所有赛事添加 creatorPhone = 15038292130
    const tourRes = await db.collection('tournaments').get()
    for (const tour of tourRes.data) {
      const updateData = {}

      if (!tour.creatorPhone && !tour.contactPhone) {
        updateData.creatorPhone = TOURNAMENT_PHONE
      }

      // 同样标记匿名 creator
      if (tour.creatorId === 'dev-user-id' || !tour.creatorId) {
        updateData.creatorId = 'migrated_' + TOURNAMENT_PHONE
      }

      if (Object.keys(updateData).length > 0) {
        if (!dryRun) {
          try {
            await db.collection('tournaments').doc(tour._id).update({
              data: {
                ...updateData,
                updateTime: db.serverDate()
              }
            })
            result.tournaments.updated++
          } catch (err) {
            result.errors.push({ collection: 'tournaments', _id: tour._id, error: err.message })
            result.tournaments.skipped++
          }
        } else {
          result.tournaments.updated++
        }
      } else {
        result.tournaments.skipped++
      }

      result.tournaments.list.push({
        _id: tour._id,
        name: tour.name,
        creatorPhone: tour.creatorPhone || updateData.creatorPhone || null,
        wouldUpdate: Object.keys(updateData)
      })
    }

    console.log('[migrateData] 完成', result)
    return result

  } catch (err) {
    console.error('[migrateData] 失败:', err)
    return { success: false, error: err.message, details: result }
  }
}
