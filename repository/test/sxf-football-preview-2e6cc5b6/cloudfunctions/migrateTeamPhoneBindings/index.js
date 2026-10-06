// migrateTeamPhoneBindings - 历史数据迁移
// 给已有 teams 记录补上 phone 绑定字段（ownerPhone/creatorPhone）
// 优先从 tournaments(creatorPhone) / coach_library(phone) / users(phone) 查找绑定关系
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { dryRun, limit } = event || {}
  const isDryRun = dryRun !== false  // 默认 dryRun=true，安全模式
  const batchLimit = limit || 50

  console.log('[migrate] 模式:', isDryRun ? 'DRY RUN (不实际写入)' : '正式执行')
  console.log('[migrate] 批次大小:', batchLimit)

  try {
    // 1. 查找所有缺少 ownerPhone 且未认领的 teams
    const teamsRes = await db.collection('teams').where({
      _: _.or([
        { ownerPhone: _.exists(false) },
        { ownerPhone: null },
        { ownerPhone: '' }
      ])
    }).limit(batchLimit).get()

    const teams = teamsRes.data || []
    console.log('[migrate] 找到', teams.length, '条记录缺少手机号绑定')

    if (teams.length === 0) {
      return { success: true, migrated: 0, message: '所有球队已有手机号绑定' }
    }

    let migrated = 0
    const skipped = []
    const results = []

    for (const team of teams) {
      let phone = null

      // 策略A：从 creatorId 反查 users 表
      if (!phone && team.creatorId) {
        try {
          const userRes = await db.collection('users').where({
            _: _.or([
              { _id: team.creatorId },
              { openId: team.creatorId },
              { wechatOpenId: team.creatorId }
            ])
          }).limit(1).get()
          if (userRes.data?.[0]) {
            phone = userRes.data[0].phone || userRes.data[0].phoneNumber || null
            if (phone) console.log('[migrate] 策略A命中:', team.name, '→', phone)
          }
        } catch (e) { console.warn('[migrate] 策略A失败:', team._id, e.message) }
      }

      // 策略B：从 tournaments 反查（该球队曾参与的赛事）
      if (!phone && team.name) {
        try {
          const tourRes = await db.collection('tournaments').where({
            teamName: team.name
          }).limit(1).get()
          if (tourRes.data?.[0]?.creatorPhone) {
            phone = tourRes.data[0].creatorPhone
            console.log('[migrate] 策略B命中:', team.name, '→', phone)
          }
        } catch (e) { console.warn('[migrate] 策略B失败:', team._id, e.message) }
      }

      // 策略C：从 coach_library 反查
      if (!phone) {
        try {
          const coachRes = await db.collection('coach_library').where({
            'teams': team._id
          }).limit(1).get()
          if (coachRes.data?.[0]) {
            phone = coachRes.data[0].phone || coachRes.data[0].phoneNumber || null
            if (phone) console.log('[migrate] 策略C命中:', team.name, '→', phone)
          }
        } catch (e) { console.warn('[migrate] 策略C失败:', team._id, e.message) }
      }

      if (phone) {
        if (!isDryRun) {
          await db.collection('teams').doc(team._id).update({
            data: {
              ownerPhone: phone,
              creatorPhone: phone,
              claimStatus: 'claimed',
              updateTime: db.serverDate()
            }
          })
        }
        migrated++
        results.push({ _id: team._id, name: team.name, phone, matchedBy: 'migrated' })
      } else {
        skipped.push({ _id: team._id, name: team.name, reason: '无匹配用户' })
      }
    }

    console.log('[migrate] 完成: 迁移', migrated, '条, 跳过', skipped.length, '条')

    return {
      success: true,
      migrated,
      skipped: skipped.length,
      results: results.slice(0, 20),
      skippedSamples: skipped.slice(0, 5),
      dryRun: isDryRun,
      message: isDryRun ? `DRY RUN: 模拟迁移 ${migrated} 条（未实际写入）` : `正式迁移 ${migrated} 条`
    }
  } catch (err) {
    console.error('[migrate] 错误:', err)
    return { success: false, error: err.message }
  }
}
