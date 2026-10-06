const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
  throwOnNotFound: false
})

// 调用微信云开发 AI 能力
async function callCloudAI(prompt, type = 'general') {
  const systemPrompts = {
    matchReport: '你是一位专业的足球赛事报道员，擅长撰写精彩的赛事战报。请用生动、专业的语言描述比赛情况。',
    playerAnalysis: '你是一位资深的足球数据分析师，擅长分析球员表现并给出专业评价。',
    tournamentIntro: '你是一位足球赛事推广专家，擅长撰写吸引人的赛事介绍和宣传文案。',
    general: '你是一位专业的体育内容创作者，擅长撰写各类足球相关内容。'
  }

  try {
    // 使用微信云开发的 AI 扩展能力
    const result = await cloud.callAI({
      model: 'hunyuan-turbos-latest', // 使用混元体验模型
      messages: [
        {
          role: 'system',
          content: systemPrompts[type] || systemPrompts.general
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    return result.content
  } catch (err) {
    console.error('AI 调用失败:', err)
    throw err
  }
}

exports.main = async (event, context) => {
  const { type, data } = event

  try {
    let prompt = ''
    let contentType = 'general'

    switch (type) {
      case 'matchReport':
        // 生成赛事战报
        contentType = 'matchReport'
        prompt = `请为以下足球比赛生成一份精彩的战报：
赛事：${data.tournamentName}
对阵双方：${data.teamA} vs ${data.teamB}
比分：${data.scoreA} : ${data.scoreB}
比赛时间：${data.matchTime}
关键事件：${data.keyEvents?.map(e => `${e.time}' ${e.type} ${e.player}`).join('、') || '无'}

请生成一份约300字的赛事战报，包含比赛概况、关键时刻描述和总结。`
        break

      case 'playerAnalysis':
        // 生成球员分析
        contentType = 'playerAnalysis'
        prompt = `请分析以下球员的表现：
球员姓名：${data.playerName}
所属球队：${data.teamName}
位置：${data.position}
数据：出场${data.appearances}次，进球${data.goals}个，助攻${data.assists}次

请生成一份约200字的球员表现分析。`
        break

      case 'tournamentIntro':
        // 生成赛事介绍
        contentType = 'tournamentIntro'
        prompt = `请为以下足球赛事生成一段吸引人的介绍文案：
赛事名称：${data.tournamentName}
赛事类型：${data.tournamentType}
参赛球队：${data.teamCount}支
比赛时间：${data.startDate} 至 ${data.endDate}
赛事特色：${data.features || '青少年足球赛事'}

请生成一段约150字的赛事介绍，用于宣传和推广。`
        break

      case 'custom':
        // 自定义提示词
        prompt = data.prompt
        contentType = data.contentType || 'general'
        break

      default:
        return {
          success: false,
          message: '未知的内容类型'
        }
    }

    // 调用 AI 生成内容
    const content = await callCloudAI(prompt, contentType)

    return {
      success: true,
      data: {
        content,
        type,
        generatedAt: new Date().toISOString()
      }
    }

  } catch (err) {
    console.error('AI 生成失败:', err)
    return {
      success: false,
      message: 'AI 生成失败：' + err.message
    }
  }
}
