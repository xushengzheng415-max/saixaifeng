// 云函数入口文件 - 生成小程序码
const cloud = require('wx-server-sdk')

// 调试：打印云函数环境信息
console.log('=== 云函数启动 ===')
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('WX_CONFIG_APPID:', process.env.WX_CONFIG_APPID)
console.log('TENCENTCLOUD_RUNENV:', process.env.TENCENTCLOUD_RUNENV)

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

console.log('cloud.init 完成')

const db = cloud.database()

function normalizeEnvVersion(value) {
  const requested = String(value || '').trim().toLowerCase()
  return ['develop', 'trial', 'release'].includes(requested) ? requested : 'release'
}

/**
 * 生成小程序码
 * 支持模式：
 * 1. tournament - 赛事详情页
 * 2. signup - 赛事报名页
 * 3. team - 球队详情页
 * 4. player - 球员详情页
 * 5. signature - 裁判签字页（scene 只传 matchId，≤32字符）
 */
exports.main = async (event, context) => {
  const {
    action = 'getQRCode',
    page,           // 页面路径
    scene,          // 透传参数（unlimited 模式最多32字符）
    width = 280,   // 二维码宽度
    autoColor = false,
    lineColor = { r: 0, g: 0, b: 0 },
    isHyaline = false,
    tournamentId,  // 赛事ID
    teamId,         // 球队ID
    playerId,       // 球员ID
    matchId,        // 比赛ID（签字用）
    envVersion,     // 开发环境: develop/trial/release
  } = event

  console.log('生成小程序码参数:', event)

  try {
    let targetPage = page
    let targetScene = scene

    // 根据 action 自动设置页面和参数
    if (action === 'tournament' && tournamentId) {
      targetPage = 'pages/tournament/detail/detail'
      targetScene = `id=${tournamentId}`
    } else if (action === 'signup' && tournamentId) {
      targetPage = 'pages/tournament/signup/signup'
      targetScene = `id=${tournamentId}`
    } else if (action === 'team' && teamId) {
      targetPage = 'pages/team/detail/detail'
      targetScene = `id=${teamId}`
    } else if (action === 'player' && playerId) {
      targetPage = 'pages/player/detail/detail'
      targetScene = `id=${playerId}`
    } else if (action === 'signature' && matchId) {
      // 裁判签字小程序码
      // scene 最多32字符，只传 matchId（云数据库 _id 通常 ≤32字符）
      // page 传首页路径，由首页根据 scene 跳转签字页
      targetPage = 'pages/home/home'
      targetScene = matchId
    }

    // 构建 API 参数
    const apiParams = {
      scene: targetScene || '',
      page: targetPage,
      width: width,
      autoColor: autoColor,
      lineColor: lineColor,
      isHyaline: isHyaline,
      envVersion: normalizeEnvVersion(envVersion)
    }

    // 调用微信云开发生成小程序码（unlimited 模式）
    const result = await cloud.openapi.wxacode.getUnlimited(apiParams)

    console.log('小程序码生成成功')

    // 将二进制数据转为 base64
    const base64 = result.buffer.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    return {
      success: true,
      message: '小程序码生成成功',
      data: {
        qrCodeUrl: dataUrl,
        base64: base64,
        scene: targetScene,
        page: targetPage,
        width: width
      }
    }

  } catch (err) {
    console.error('生成小程序码失败:', err)

    return {
      success: false,
      message: '生成小程序码失败: ' + err.message,
      error: err.message
    }
  }
}
