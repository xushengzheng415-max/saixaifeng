// 云函数入口文件 - 测试数据生成（简化版，快速稳定）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// ============================================
// 配置
// ============================================
const USE_AI_IMAGE = false  // 是否使用AI生图（队徽和赛事LOGO）- 暂时关闭，超时问题
const USE_AI_FOR_AVATARS = false  // 球员头像是否使用AI生成
const TEAM_COUNT = 8       // 每个赛事生成球队数
const PLAYER_PER_TEAM = 10 // 每个球队生成球员数

// 球队配色方案
const teamColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black', 'white']

// 球队名称
const teamNames = [
  '雄鹰队', '猛虎队', '飞龙队', '烈火队',
  '疾风队', '巨浪队', '雷霆队', '闪电队',
  '雄狮队', '战狼队', '神鹰队', '猛龙队',
  '烈焰队', '风暴队', '巨石队', '钢铁队'
]

// 赛事名称
const tournamentNames = [
  '2026年春季青少年锦标赛',
  '2026年夏季淘汰杯',
  '2026年秋季积分联赛',
  '2026年冬春季复合赛',
  '青少年足球邀请赛',
  '城市足球淘汰杯',
  '校园足球联赛',
  '青训精英复合赛',
  '社区足球杯',
  '五人制足球赛'
]

const locations = [
  '郑州市足球训练基地',
  '洛阳体育中心',
  '开封足球公园',
  '新乡体育馆',
  '焦作体育场'
]

// ============================================
// 工具函数
// ============================================

// 生成随机中文名
function generateChineseName() {
  const surnames = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗']
  const names = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀兰', '霞']
  return surnames[Math.floor(Math.random() * surnames.length)] + names[Math.floor(Math.random() * names.length)]
}

// 生成随机位置
function generatePosition() {
  const positions = ['GK', 'DF', 'MF', 'FW']
  const weights = [0.1, 0.3, 0.4, 0.2]
  const rand = Math.random()
  let sum = 0
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i]
    if (rand < sum) return positions[i]
  }
  return 'MF'
}

// 获取位置中文名
function getPositionName(pos) {
  return { 'GK': '守门员', 'DF': '后卫', 'MF': '中场', 'FW': '前锋' }[pos] || '球员'
}

// AI生图（调用腾讯云混元）
async function generateAIImage(action, params) {
  if (!USE_AI_IMAGE) return null

  try {
    const result = await cloud.callFunction({
      name: 'generateAIImage',
      data: { action, ...params }
    })

    if (result.result && result.result.success && result.result.data && result.result.data.url) {
      return result.result.data.url
    }
    console.warn(`AI生图失败: ${result.result?.message}`)
    return null
  } catch (err) {
    console.warn(`AI生图异常: ${err.message}`)
    return null
  }
}

// ============================================
// 数据生成
// ============================================

// 生成球员数据
async function generatePlayers(teamId, teamName, count) {
  const players = []
  console.log(`  生成 ${count} 个球员...`)

  for (let i = 0; i < count; i++) {
    const position = generatePosition()
    const name = generateChineseName()
    const gender = Math.random() > 0.3 ? 'male' : 'female'

    // 球员头像：优先使用图标头像，关闭AI生头像
    let photoUrl = ''
    if (USE_AI_IMAGE && USE_AI_FOR_AVATARS) {
      // 尝试AI生成头像
      photoUrl = await generateAIImage('generateAvatar', { name, position, gender })
      await new Promise(r => setTimeout(r, 300))
    } else {
      // 使用免费图标头像（根据位置生成不同的emoji标识）
      const positionEmoji = { 'GK': '🧤', 'DF': '🛡️', 'MF': '⚽', 'FW': '🎯' }[position] || '⚽'
      const colorMap = { 'male': '3B82F6', 'female': 'EC4899' }
      const color = colorMap[gender] || '3B82F6'
      // 使用 DiceBear 免费图标头像
      photoUrl = `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(name)}&backgroundColor=${color}`
    }

    const player = {
      teamId,
      name,
      position,
      positionName: getPositionName(position),
      jerseyNumber: position === 'GK' ? (i + 1) : Math.floor(Math.random() * 30) + 1,
      age: Math.floor(Math.random() * 12) + 10,
      height: Math.floor(Math.random() * 25) + 155,
      weight: Math.floor(Math.random() * 20) + 45,
      gender,
      foot: Math.random() > 0.7 ? 'right' : 'left',
      nationality: '中国',
      hometown: ['北京', '上海', '广州', '深圳', '郑州', '洛阳'][Math.floor(Math.random() * 6)],
      matches: Math.floor(Math.random() * 20),
      goals: position === 'GK' ? 0 : Math.floor(Math.random() * 8),
      yellowCards: Math.floor(Math.random() * 3),
      redCards: Math.floor(Math.random() * 2),
      photoUrl: photoUrl,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    players.push(player)
  }

  // 批量插入数据库
  const promises = players.map(p => db.collection('players').add({ data: p }))
  await Promise.all(promises)
  console.log(`  球员生成完成: ${count} 个`)

  return count
}

// 生成球队数据
async function generateTeams(count) {
  const teams = []
  console.log(`生成 ${count} 个球队...`)

  // 球队配色对应的颜色值
  const colorBgMap = {
    'red': 'DC2626',
    'blue': '2563EB',
    'green': '16A34A',
    'yellow': 'EAB308',
    'purple': '9333EA',
    'orange': 'EA580C',
    'black': '1F2937',
    'white': 'F3F4F6'
  }

  for (let i = 0; i < count; i++) {
    const name = teamNames[i % teamNames.length] + (Math.floor(i / teamNames.length) > 0 ? (Math.floor(i / teamNames.length) + 1) : '')
    const color = teamColors[i % teamColors.length]

    // 生成队徽：优先使用AI，如果关闭则用默认图标
    let logoUrl = ''
    if (USE_AI_IMAGE) {
      try {
        logoUrl = await generateAIImage('generateTeamLogo', { teamName: name, teamColor: color })
        await new Promise(r => setTimeout(r, 500))
      } catch (err) {
        console.warn('AI生图失败，使用默认图标')
      }
    }
    
    // 如果没有AI logo，使用 DiceBear 图标
    if (!logoUrl) {
      const bgColor = colorBgMap[color] || '3B82F6'
      logoUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(name)}&backgroundColor=${bgColor}`
    }

    const team = {
      name,
      logo: logoUrl,
      logoUrl: logoUrl,
      color,
      home: ['郑州', '洛阳', '开封', '新乡'][i % 4] + '市体育中心',
      code: 'TM' + String(Date.now()).slice(-6) + String(i).padStart(2, '0'),
      description: '测试球队',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    const res = await db.collection('teams').add({ data: team })
    teams.push({ id: res._id, name, color })
  }

  console.log(`球队生成完成: ${count} 个`)
  return teams
}

// 生成赛事数据
async function generateTournaments(count, teamCount, playerPerTeam) {
  const results = []

  for (let i = 0; i < count; i++) {
    console.log(`\n========== 生成赛事 ${i + 1}/${count} ==========`)

    // 赛事LOGO：优先使用AI，如果关闭则用默认图标
    let logoUrl = ''
    if (USE_AI_IMAGE) {
      try {
        logoUrl = await generateAIImage('generateTournamentLogo', { tournamentName: tournamentNames[i % tournamentNames.length] })
        await new Promise(r => setTimeout(r, 500))
      } catch (err) {
        console.warn('AI生图失败，使用默认图标')
      }
    }
    
    // 如果没有AI logo，使用默认图标
    if (!logoUrl) {
      logoUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(tournamentNames[i % tournamentNames.length])}&backgroundColor=FBBF24`
    }

    // 创建赛事
    const year = 2026
    const month = ((5 + i) % 12) + 1
    const tournament = {
      name: tournamentNames[i % tournamentNames.length],
      type: ['tournament', 'cup', 'league', 'combined'][i % 4],
      typeName: ['赛会制', '杯赛制', '联赛制', '复合制'][i % 4],
      location: locations[i % locations.length],
      logo: logoUrl,
      logoUrl: logoUrl,
      sponsors: [
        { type: 'text', value: '耐克体育' },
        { type: 'text', value: '阿迪达斯' }
      ],
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate: `${year}-${String(((month) % 12) + 1).padStart(2, '0')}-28`,
      deadline: `${year}-${String(month).padStart(2, '0')}-20`,
      maxTeams: teamCount,
      maxPlayers: 15,
      description: `第${i + 1}场测试赛事\n\n竞赛规程：\n1. 采用循环赛制\n2. 每场比赛90分钟\n3. 胜3分，平1分，负0分`,
      status: 'registering',
      registeredTeams: 0,
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }

    const res = await db.collection('tournaments').add({ data: tournament })
    const tournamentId = res._id
    console.log(`赛事创建成功: ${tournament.name}`)

    // 生成球队
    const teams = await generateTeams(teamCount)

    // 为每个球队生成球员
    let totalPlayers = 0
    for (const team of teams) {
      const playerCount = await generatePlayers(team.id, team.name, playerPerTeam)
      totalPlayers += playerCount
    }

    // 创建赛事-球队关联
    for (const team of teams) {
      await db.collection('tournament_teams').add({
        data: {
          tournamentId,
          teamId: team.id,
          teamName: team.name,
          teamLogo: team.color,
          playerCount: playerPerTeam,
          status: 'approved',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    }

    // 更新赛事参赛球队数
    await db.collection('tournaments').doc(tournamentId).update({
      data: { registeredTeams: teams.length }
    })

    results.push({
      tournamentId,
      tournamentName: tournament.name,
      teamCount: teams.length,
      playerCount: totalPlayers
    })

    console.log(`赛事 ${tournament.name} 完成: ${teams.length} 队, ${totalPlayers} 球员`)
  }

  return results
}

// ============================================
// 云函数入口
// ============================================
exports.main = async (event, context) => {
  const startTime = Date.now()
  const action = event.action || 'generateAll'

  console.log('='.repeat(50))
  console.log('开始执行云函数')
  console.log(`Action: ${action}`)
  console.log(`AI生图: ${USE_AI_IMAGE ? '开启' : '关闭'}`)
  console.log(`每队球员数: ${PLAYER_PER_TEAM}`)
  console.log('='.repeat(50))

  try {
    // 处理不同的 action
    if (action === 'generatePlayers') {
      // 仅生成球员（指定球队）
      const teamId = event.teamId || 'new'
      const count = event.count || PLAYER_PER_TEAM
      const teamName = event.teamName || '测试球队'
      const playerCount = await generatePlayers(teamId, teamName, count)
      return {
        success: true,
        message: `成功生成 ${playerCount} 名球员`,
        data: { playerCount }
      }
    } else if (action === 'generateAll') {
      // 生成赛事+球队+球员（不含海报）
      const tournamentCount = event.tournamentCount || 1
      const teamCount = event.teamCount || TEAM_COUNT
      const playerPerTeam = event.playerCount || PLAYER_PER_TEAM
      const results = await generateTournaments(tournamentCount, teamCount, playerPerTeam)
      const totalTime = Math.round((Date.now() - startTime) / 1000)
      const totalTeams = results.reduce((sum, r) => sum + r.teamCount, 0)
      const totalPlayers = results.reduce((sum, r) => sum + r.playerCount, 0)
      return {
        success: true,
        message: `成功生成 ${results.length} 个赛事，${totalTeams} 个球队，${totalPlayers} 个球员（耗时${totalTime}秒）`,
        data: {
          results,
          totalTeams,
          totalPlayers,
          totalTime
        }
      }
    } else if (action === 'generateAllWithPoster') {
      // 生成全部（含海报）- 暂时禁用海报功能
      console.log('提示: 海报功能暂时禁用，将仅生成基础数据')
      const tournamentCount = event.tournamentCount || 1
      const teamCount = event.teamCount || TEAM_COUNT
      const playerPerTeam = event.playerCount || PLAYER_PER_TEAM
      const results = await generateTournaments(tournamentCount, teamCount, playerPerTeam)
      const totalTime = Math.round((Date.now() - startTime) / 1000)
      const totalTeams = results.reduce((sum, r) => sum + r.teamCount, 0)
      const totalPlayers = results.reduce((sum, r) => sum + r.playerCount, 0)
      return {
        success: true,
        message: `成功生成 ${results.length} 个赛事，${totalTeams} 个球队，${totalPlayers} 个球员（耗时${totalTime}秒）`,
        data: {
          results,
          totalTeams,
          totalPlayers,
          totalTime
        }
      }
    } else {
      // 默认行为：生成赛事+球队+球员
      const tournamentCount = event.tournamentCount || 1
      const teamCount = event.teamCount || TEAM_COUNT
      const playerPerTeam = event.playerCount || PLAYER_PER_TEAM
      const results = await generateTournaments(tournamentCount, teamCount, playerPerTeam)
      const totalTime = Math.round((Date.now() - startTime) / 1000)
      const totalTeams = results.reduce((sum, r) => sum + r.teamCount, 0)
      const totalPlayers = results.reduce((sum, r) => sum + r.playerCount, 0)
      console.log('\n' + '='.repeat(50))
      console.log('生成完成!')
      console.log(`赛事: ${results.length} 个`)
      console.log(`球队: ${totalTeams} 个`)
      console.log(`球员: ${totalPlayers} 个`)
      console.log(`耗时: ${totalTime} 秒`)
      console.log('='.repeat(50))
      return {
        success: true,
        message: `成功生成 ${results.length} 个赛事，${totalTeams} 个球队，${totalPlayers} 个球员`,
        data: {
          results,
          totalTeams,
          totalPlayers,
          totalTime
        }
      }
    }
  } catch (err) {
    console.error('生成失败:', err)
    return {
      success: false,
      message: '生成失败: ' + err.message,
      error: err.message
    }
  }
}
