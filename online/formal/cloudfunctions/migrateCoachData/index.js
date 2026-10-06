// 云函数入口 - 教练数据迁移（健壮版）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 迁移逻辑：
 * 1. 读取原有 coaches 集合的所有数据
 * 2. 将每条记录写入 coach_library（教练库，按 phone 去重）
 * 3. 将分配关系写入 coach_assignments
 *
 * 参数：{ "action": "migrate" }
 */
exports.main = async (event, context) => {
  const { action } = event

  if (action !== 'migrate') {
    return {
      success: false,
      message: '请输入正确的 action: "migrate"'
    }
  }

  console.log('开始教练数据迁移...')

  try {
    // 0. 尝试读取 teams 集合（用于映射 teamId → teamName）
    let teamNameMap = {}
    try {
      const teamsRes = await db.collection('teams').get()
      teamsRes.data.forEach(t => {
        teamNameMap[t._id] = t.name || ''
      })
      console.log(`已加载 ${teamsRes.data.length} 个球队名称映射`)
    } catch (err) {
      console.log('teams 集合不存在或读取失败，将继续执行', err.message)
    }

    // 1. 读取 coaches 集合
    const coachesRes = await db.collection('coaches').get()
    const coaches = coachesRes.data

    if (!coaches || coaches.length === 0) {
      return {
        success: true,
        message: 'coaches 集合为空，无需迁移',
        migrated: 0
      }
    }

    console.log(`共找到 ${coaches.length} 条教练记录`)

    let migratedCount = 0
    let skippedCount = 0
    const errors = []

    // 2. 逐条迁移
    for (const coach of coaches) {
      try {
        // 字段映射（根据实际 coaches 集合结构）
        const libraryRecord = {
          name: coach.name || '',
          phone: coach.phone || '',
          // 支持 photoFileID / photoUrl / avatarUrl 三种字段名
          avatarUrl: coach.photoFileID || coach.photoUrl || coach.avatarUrl || '',
          idNumber: coach.idNumber || '',
          specialty: coach.specialty || coach.description || '',
          certLevel: coach.certLevel || '',
          creator: coach.creator || '',
          createTime: coach.createTime || db.serverDate(),
          updateTime: db.serverDate(),
          _oldId: coach._id
        }

        // type 字段映射到 role
        let role = '教练'
        if (coach.type === 'doctor') role = '队医'
        else if (coach.type === 'assistant') role = '助理教练'
        else if (coach.type === 'leader') role = '领队'
        else if (coach.role) role = coach.role

        // 获取真实球队名称
        const teamId = coach.teamId || ''
        const teamName = teamNameMap[teamId] || coach.teamName || ''

        // 3. 写入教练库（先尝试新增，若 phone 重复则更新）
        let coachId

        if (libraryRecord.phone) {
          // 先尝试查询（若集合不存在会报错，进入 catch）
          let existRes = { data: [] }
          try {
            existRes = await db.collection('coach_library').where({
              phone: libraryRecord.phone
            }).get()
          } catch (queryErr) {
            // 集合不存在，视为空结果，走新增逻辑
            console.log('coach_library 集合不存在或查询失败，将直接新增记录')
          }

          if (existRes.data && existRes.data.length > 0) {
            // 已存在，更新
            coachId = existRes.data[0]._id
            await db.collection('coach_library').doc(coachId).update({
              data: {
                name: libraryRecord.name,
                avatarUrl: libraryRecord.avatarUrl,
                idNumber: libraryRecord.idNumber,
                specialty: libraryRecord.specialty,
                certLevel: libraryRecord.certLevel,
                updateTime: db.serverDate()
              }
            })
            console.log(`更新教练库记录: ${libraryRecord.name}`)
            skippedCount++
          } else {
            // 不存在，新增（会自动创建集合）
            const addRes = await db.collection('coach_library').add({
              data: libraryRecord
            })
            coachId = addRes._id
            console.log(`新增教练库记录: ${libraryRecord.name}, id: ${coachId}`)
          }
        } else {
          // 无手机号，直接新增
          const addRes = await db.collection('coach_library').add({
            data: libraryRecord
          })
          coachId = addRes._id
        }

        // 4. 写入分配关系（关联球队）
        if (teamId) {
          let assignExist = { data: [] }
          try {
            assignExist = await db.collection('coach_assignments').where({
              coachId: coachId,
              teamId: teamId
            }).get()
          } catch (queryErr) {
            console.log('coach_assignments 集合不存在，将直接新增记录')
          }

          if (!assignExist.data || assignExist.data.length === 0) {
            await db.collection('coach_assignments').add({
              data: {
                coachId: coachId,
                teamId: teamId,
                teamName: teamName,
                role: role,
                type: 'coach',
                status: 'active',
                createTime: db.serverDate()
              }
            })
            console.log(`写入分配关系: coachId=${coachId}, teamId=${teamId}, role=${role}`)
          } else {
            console.log(`分配关系已存在，跳过: coachId=${coachId}, teamId=${teamId}`)
            skippedCount++
          }
        }

        migratedCount++
      } catch (err) {
        console.error('迁移单条记录失败:', coach.name, err)
        errors.push({
          coachId: coach._id,
          name: coach.name,
          error: err.message
        })
      }
    }

    console.log(`迁移完成：成功 ${migratedCount} 条，跳过 ${skippedCount} 条，错误 ${errors.length} 条`)

    return {
      success: true,
      message: `迁移完成：成功 ${migratedCount} 条，跳过 ${skippedCount} 条`,
      migrated: migratedCount,
      skipped: skippedCount,
      errors: errors
    }

  } catch (err) {
    console.error('迁移失败:', err)
    return {
      success: false,
      message: '迁移失败: ' + (err.message || err),
      error: err
    }
  }
}
