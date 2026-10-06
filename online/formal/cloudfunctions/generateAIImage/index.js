// 云函数入口文件 - AI 生图（官方模板方式）
const tcb = require("@cloudbase/node-sdk")
const https = require('https')
const http = require('http')

/**
 * 下载图片到 Buffer
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败，状态码: ${res.statusCode}`))
        return
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

/**
 * 将生成的图片上传到应用自己的 COS，返回稳定访问链接
 */
async function uploadGeneratedImage(imageUrl, folder = 'ai-generated') {
  if (!imageUrl) return null

  try {
    console.log('[uploadGeneratedImage] 开始下载图片:', imageUrl.substring(0, 80))
    const buffer = await downloadImage(imageUrl)
    console.log('[uploadGeneratedImage] 下载完成，大小:', buffer.length, 'bytes')

    const cloud = require('wx-server-sdk')
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

    const cloudPath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 10)}.png`
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })
    console.log('[uploadGeneratedImage] 上传成功，fileID:', uploadRes.fileID)

    const tempRes = await cloud.getTempFileURL({
      fileList: [uploadRes.fileID]
    })
    const finalUrl = tempRes.fileList[0]?.tempFileURL || ''
    console.log('[uploadGeneratedImage] 获取临时链接:', finalUrl.substring(0, 80))

    return { url: finalUrl, fileID: uploadRes.fileID }
  } catch (err) {
    console.error('[uploadGeneratedImage] 上传失败:', err.message)
    // 回退：直接返回原始 URL
    return { url: imageUrl, fileID: '' }
  }
}

/**
 * 调用混元生图API（使用官方 SDK）
 * 官方文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/ai/create-img.html
 */
async function generateHunyuanImage(event) {
  try {
    console.log('========== 开始调用混元生图 ==========')

    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
    const ai = app.ai()
    const imageModel = ai.createImageModel(process.env.PROVIDER || "hunyuan-image");

    if (process.env.ENDPOINT_PATH) {
      imageModel.defaultGenerateImageSubUrl = process.env.ENDPOINT_PATH;
    }

    // 提取 model 参数，其他参数透传
    const { model = 'hunyuan-image', ...restEvent } = event

    console.log('Model:', model)
    console.log('参数:', JSON.stringify(restEvent).substring(0, 200))

    const res = await imageModel.generateImage({
      model,
      ...(/hunyuan-image-v3.0/.test(model) ? {
        revise: { "value": false },
        enable_thinking: { "value": false }
      } : {}),
      ...restEvent,
    });

    const { data, error } = res

    if (error) {
      console.error('混元生图返回错误:', JSON.stringify(error))
      return null
    }

    const img = data?.[0] || {}
    const { url } = img

    console.log('✅ 混元生图成功! URL:', url?.substring(0, 100))

    return url || null

  } catch (err) {
    console.error('❌ 混元生图调用失败:', err.message || err)
    console.error('错误详情:', err)
    return null
  }
}

/**
 * 生成球员头像
 */
async function generatePlayerAvatar(name, position, gender = 'male') {
  const genderText = gender === 'female' ? 'female' : 'male'
  const positionText = {
    'GK': 'goalkeeper',
    'DF': 'defender',
    'MF': 'midfielder',
    'FW': 'forward'
  }[position] || 'football player'

  const prompt = `Professional ${genderText} football player ID photo, ${positionText}, white plain background, 1:1 square ratio, flat minimalist style, half body portrait, team jersey, sharp focus, high quality`

  const imageUrl = await generateHunyuanImage({ prompt, aspect_ratio: '1:1' })
  const uploaded = await uploadGeneratedImage(imageUrl, 'player-avatars')
  return uploaded?.url || imageUrl
}

/**
 * 生成球队队徽
 */
async function generateTeamLogo(teamName, teamColor = 'blue') {
  const colorMap = {
    'red': 'crimson red and gold',
    'blue': 'royal blue and silver',
    'green': 'emerald green and white',
    'yellow': 'golden yellow and black',
    'purple': 'deep purple and gold',
    'orange': 'vibrant orange and white',
    'black': 'black and white',
    'white': 'white and navy blue'
  }

  const colorText = colorMap[teamColor] || 'blue and silver'
  const keywords = extractTeamKeywords(teamName)

  const styleTemplates = [
    `Football club "${keywords}" emblem, ${colorText} colors, flat minimalist shield badge, single star at top, crossed swords beneath, bold typography, white background, clean vector style`,
    `Sports team crest for "${keywords}", ${colorText} color scheme, circular badge design, diagonal stripes pattern, laurel wreath on sides, vintage sports logo style, white background, modern flat design`,
    `Modern football club logo "${keywords}", ${colorText} palette, abstract geometric hexagon shape, stylized letter initial, minimalist art deco style, white background, professional sports branding`,
    `Football club badge for "${keywords}", ${colorText} color theme, fierce wolf head mascot, protective shield shape, modern sports emblem, white background, clean vector illustration`,
    `Soccer team emblem "${keywords}", ${colorText} colors, football with crown on top, ribbon banner below, roundel border, classic sports badge style, white background, flat design`
  ]

  const prompt = styleTemplates[Math.floor(Math.random() * styleTemplates.length)]

  console.log('[队徽生成] 队名:', teamName, '颜色:', teamColor)
  console.log('[队徽生成] Prompt:', prompt.substring(0, 100))

  // 生成图片，指定1:1正方形比例
  const imageUrl = await generateHunyuanImage({
    prompt,
    aspect_ratio: '1:1'
  })

  // 下载并上传到应用自己的COS，获取稳定链接
  const uploaded = await uploadGeneratedImage(imageUrl, 'team-logos')
  return uploaded?.url || imageUrl
}

/**
 * 从队名提取关键词
 */
function extractTeamKeywords(teamName) {
  if (!teamName) return 'FC Team'

  let name = teamName
    .replace(/\s*(FC|Team|Club|体育|足球|俱乐部)$/gi, '')
    .trim()

  if (!name || name.length < 2) {
    name = teamName.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '').substring(0, 4) || 'FC'
  }

  return name
}

/**
 * 生成赛事 LOGO
 */
async function generateTournamentLogo(tournamentName) {
  const keywords = extractTournamentKeywords(tournamentName)

  const styleTemplates = [
    `Championship tournament logo for "${keywords}", elegant trophy cup with golden finish, laurel wreath decorations, royal blue and gold color theme, ornate banner ribbon, sophisticated sports event branding, white background, flat minimalist style`,
    `Football tournament emblem "${keywords}", stylized football centered, radiating starburst rays, bold geometric frame, championship trophy silhouette, energetic orange and navy theme, white background, modern badge design`,
    `Sports competition logo for "${keywords}", protective shield shape, football icon inside, checkered flag patterns, dynamic diagonal stripes, red and black power theme, white background, professional tournament branding`,
    `Championship event mark "${keywords}", circular medallion design, royal crown on top, crossed flags below, soccer ball centerpiece, prestigious gold and emerald theme, white background, classic trophy badge style`,
    `Modern tournament logo "${keywords}", abstract football shape, bold typography integrated, minimalist triangular frame, electric blue and silver palette, white background, contemporary sports identity design`
  ]

  const prompt = styleTemplates[Math.floor(Math.random() * styleTemplates.length)]

  console.log('[赛事LOGO生成] 赛事名:', tournamentName)
  console.log('[赛事LOGO生成] Prompt:', prompt.substring(0, 100))

  const imageUrl = await generateHunyuanImage({ prompt, aspect_ratio: '1:1' })
  const uploaded = await uploadGeneratedImage(imageUrl, 'tournament-logos')
  return uploaded?.url || imageUrl
}

/**
 * 生成赛事海报
 */
async function generateTournamentPoster(tournamentName, tournamentType, startDate, location, customDesc) {
  const keywords = extractTournamentKeywords(tournamentName)
  const dateStr = startDate ? new Date(startDate).toLocaleDateString('zh-CN') : ''
  const locationStr = location || '精彩赛场'

  let prompt

  if (customDesc && customDesc.trim()) {
    prompt = `${tournamentName}足球赛事海报，${dateStr} ${locationStr}，${customDesc.trim()}，竖版9比16格式，高清画质，专业设计`
  } else {
    const styleTemplates = [
      `Dynamic football tournament poster for "${keywords}", energetic soccer player silhouette kicking ball, stadium lights in background, bold typography "${tournamentName}", ${dateStr} ${locationStr}, vibrant orange and blue gradient, motion blur effects, professional sports advertising, high energy composition, 16:9 poster format`,
      `Championship football poster "${keywords}", golden trophy cup shining, confetti falling, stadium crowd cheering, dramatic lighting, ${dateStr} ${locationStr}, red and gold color theme, victory celebration atmosphere, cinematic sports poster design, 16:9 format`,
      `Epic football match poster "${keywords}", two teams facing off, soccer ball in center with flames, competitive atmosphere, ${dateStr} ${locationStr}, dark background with spotlight effects, green field elements, intense sports rivalry theme, 16:9 poster format`,
      `Modern minimalist football poster "${keywords}", geometric football pattern, clean typography layout, ${dateStr} ${locationStr}, navy blue and white color scheme, abstract player silhouettes, contemporary sports design, professional tournament branding, 16:9 format`,
      `Passionate football tournament poster "${keywords}", explosive action shot, cheering fans in background, ${dateStr} ${locationStr}, fiery red and black colors, dynamic diagonal composition, "Kick Off" energy, dramatic sports photography style, 16:9 poster format`
    ]
    prompt = styleTemplates[Math.floor(Math.random() * styleTemplates.length)]
  }

  console.log('[赛事海报生成] 赛事名:', tournamentName)
  console.log('[赛事海报生成] Prompt:', prompt.substring(0, 100))

  const imageUrl = await generateHunyuanImage({ prompt, aspect_ratio: '2:3' })
  const uploaded = await uploadGeneratedImage(imageUrl, 'tournament-posters')
  return uploaded?.url || imageUrl
}

/**
 * 从赛事名提取关键词
 */
function extractTournamentKeywords(name) {
  if (!name) return 'Football Tournament'

  let keywords = name
    .replace(/\s*(杯|赛|锦标赛|联赛|冠军赛|邀请赛)$/g, '')
    .trim()

  if (!keywords || keywords.length < 2) {
    keywords = name.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '').substring(0, 6) || 'Tournament'
  }

  return keywords
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, name, position, gender, teamName, teamColor, tournamentName, tournamentType, startDate, location } = event

  try {
    switch (action) {
      case 'generateAvatar':
        const avatarUrl = await generatePlayerAvatar(name || 'Player', position || 'MF', gender || 'male')
        return {
          success: true,
          data: { url: avatarUrl },
          message: avatarUrl ? '头像生成成功' : '头像生成失败（使用默认）'
        }

      case 'generateTeamLogo':
        const logoUrl = await generateTeamLogo(teamName || 'Team', teamColor || 'blue')
        return {
          success: true,
          data: { url: logoUrl },
          message: logoUrl ? '队徽生成成功' : '队徽生成失败（使用默认）'
        }

      case 'generateTournamentLogo':
        const tournamentLogo = await generateTournamentLogo(tournamentName || 'Football Tournament')
        return {
          success: true,
          data: { url: tournamentLogo },
          message: tournamentLogo ? '赛事LOGO生成成功' : '赛事LOGO生成失败（使用默认）'
        }

      case 'generateTournamentPoster':
        const posterUrl = await generateTournamentPoster(
          tournamentName || 'Football Tournament',
          tournamentType || 'tournament',
          startDate,
          location,
          event.customDesc
        )
        return {
          success: true,
          data: { url: posterUrl },
          message: posterUrl ? '赛事海报生成成功' : '赛事海报生成失败（使用默认）'
        }

      case 'generateBatchAvatars':
        if (!event.players || !Array.isArray(event.players)) {
          return { success: false, message: '缺少 players 参数' }
        }

        const avatarResults = []
        for (const player of event.players) {
          try {
            const url = await generatePlayerAvatar(
              player.name || 'Player',
              player.position || 'MF',
              player.gender || 'male'
            )
            avatarResults.push({ ...player, photoUrl: url || '', success: !!url })
          } catch (err) {
            avatarResults.push({ ...player, photoUrl: '', success: false, error: err.message })
          }
          await new Promise(resolve => setTimeout(resolve, 300))
        }

        return {
          success: true,
          data: { results: avatarResults },
          message: `成功生成 ${avatarResults.filter(r => r.success).length}/${avatarResults.length} 个头像`
        }

      case 'generateBatchTeamLogos':
        if (!event.teams || !Array.isArray(event.teams)) {
          return { success: false, message: '缺少 teams 参数' }
        }

        const logoResults = []
        const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black', 'white']

        for (let i = 0; i < event.teams.length; i++) {
          const team = event.teams[i]
          const color = colors[i % colors.length]
          try {
            const url = await generateTeamLogo(team.name || 'Team', color)
            logoResults.push({ ...team, logo: url || '', logoUrl: url || '', color: color, success: !!url })
          } catch (err) {
            logoResults.push({ ...team, logo: '', logoUrl: '', color: color, success: false, error: err.message })
          }
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        return {
          success: true,
          data: { results: logoResults },
          message: `成功生成 ${logoResults.filter(r => r.success).length}/${logoResults.length} 个队徽`
        }

      case 'test':
        // 测试接口
        const testUrl = await generateHunyuanImage({ prompt: 'A red football on white background', aspect_ratio: '1:1' })
        const testUploaded = await uploadGeneratedImage(testUrl, 'test')
        return {
          success: !!(testUploaded?.url || testUrl),
          message: (testUploaded?.url || testUrl) ? '混元生图连接成功' : '混元生图失败',
          data: { url: testUploaded?.url || testUrl }
        }

      case 'generateCustomImage':
        // 自定义生图（用于海报背景等）
        const customUrl = await generateHunyuanImage({
          prompt: event.prompt,
          aspect_ratio: event.aspect_ratio || '1:1',
          ...(event.model ? { model: event.model } : {})
        })
        const customUploaded = await uploadGeneratedImage(customUrl, 'ai-generated')
        return {
          success: !!(customUploaded?.url || customUrl),
          message: (customUploaded?.url || customUrl) ? '图片生成成功' : '图片生成失败',
          data: { url: customUploaded?.url || customUrl, image_url: customUploaded?.url || customUrl }
        }

      default:
        return {
          success: false,
          message: '未知操作: ' + action
        }
    }
  } catch (err) {
    console.error('AI生图失败:', err)
    return {
      success: false,
      message: 'AI生图失败: ' + (err.message || err.errMsg || '未知错误'),
      error: err.message
    }
  }
}
