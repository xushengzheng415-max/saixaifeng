// 云函数入口文件 - AI 生图（官方模板方式）
const tcb = require("@cloudbase/node-sdk")
const https = require('https')
const http = require('http')

// 队徽 AI 生成：去底统一复用既有 removeLogoBg 云函数（百度通用物体分割 object_segment）。
// 本函数不读取、不配置、不搬运任何百度凭据，密钥只保留在 removeLogoBg 的线上配置内。
const LOGO_CUTOUT_FUNCTION = 'removeLogoBg'

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
 * 上传 Buffer 到应用自己的 COS，返回稳定访问链接
 */
async function uploadGeneratedBuffer(buffer, folder = 'ai-generated', extension = 'png') {
  if (!buffer || !buffer.length) return null
  try {
    const cloud = require('wx-server-sdk')
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
    const cloudPath = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${extension}`
    const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    const tempRes = await cloud.getTempFileURL({ fileList: [uploadRes.fileID] })
    return { url: tempRes.fileList[0]?.tempFileURL || '', fileID: uploadRes.fileID }
  } catch (err) {
    console.error('[uploadGeneratedBuffer] 上传失败:', err.message)
    return null
  }
}

/**
 * 判断是否为限流/并发类错误，用于退避重试
 */
function isRateLimitError(message) {
  return /rate.?limit|throttl|too many|request.?limit|concurren|qps|429|频繁|限流|超出并发/i.test(String(message || ''))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带退避重试的生成调用。
 * 限流错误先退避；其他错误最多重试一次，避免把长耗时无限放大。
 */
async function withBackoffRetry(label, task, options = {}) {
  const maxAttempts = options.maxAttempts || 3
  const baseDelay = options.baseDelayMs || 3000
  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task(attempt)
    } catch (err) {
      lastError = err
      const message = err && (err.message || err.errMsg) || ''
      const rateLimited = isRateLimitError(message)
      console.warn(`[${label}] 第 ${attempt}/${maxAttempts} 次失败${rateLimited ? '（限流）' : ''}:`, message)
      if (attempt >= maxAttempts) break
      if (!rateLimited && attempt >= 2) break
      await sleep(rateLimited ? baseDelay * attempt : Math.min(baseDelay, 1500))
    }
  }
  throw lastError || new Error(`${label}失败`)
}

/**
 * 调用混元生图并抛出明确错误（供重试逻辑使用）
 */
async function requestHunyuanImage(event) {
  const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
  const ai = app.ai()
  const imageModel = ai.createImageModel(process.env.PROVIDER || "hunyuan-image")
  if (process.env.ENDPOINT_PATH) {
    imageModel.defaultGenerateImageSubUrl = process.env.ENDPOINT_PATH
  }
  const { model = 'hunyuan-image', ...restEvent } = event
  const res = await imageModel.generateImage({
    model,
    ...(/hunyuan-image-v3.0/.test(model) ? {
      revise: { "value": false },
      enable_thinking: { "value": false }
    } : {}),
    ...restEvent,
  });
  const { data, error } = res || {}
  if (error) throw new Error(error.Message || error.message || error.Code || JSON.stringify(error))
  const url = data && data[0] && data[0].url
  if (!url) throw new Error('混元生图未返回图片地址')
  return url
}

/**
 * 调用混元生图API（使用官方 SDK）
 * 官方文档：https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/ai/create-img.html
 */
async function generateHunyuanImage(event) {
  try {
    console.log('========== 开始调用混元生图 ==========')
    console.log('参数:', JSON.stringify({ ...event, prompt: String(event.prompt || '').substring(0, 200) }))
    const url = await requestHunyuanImage(event)
    console.log('✅ 混元生图成功! URL:', url.substring(0, 100))
    return url
  } catch (err) {
    console.error('❌ 混元生图调用失败:', err.message || err)
    return null
  }
}

/**
 * 队徽去底：复用既有、已配置百度密钥的 removeLogoBg 云函数（object_segment 通用物体分割）。
 * 本函数不持有百度凭据；removeLogoBg 的密钥/接口权限归其自身配置维护。
 * 失败时抛出带原因的错误，由调用方显式标记「已生成但未抠图」，不静默回退白底。
 */
async function removeLogoBackgroundViaFunction(buffer, tokenRetried = false) {
  if (!buffer || !buffer.length) throw new Error('待去底图片为空')
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  const res = await cloud.callFunction({
    name: LOGO_CUTOUT_FUNCTION,
    data: { action: 'removeBackground', imageBase64: buffer.toString('base64') }
  })
  const result = (res && res.result) || {}
  if (!result.success || !result.data) {
    const reason = String(result.message || 'removeLogoBg 未返回透明图')
    // 百度 Token 失效类错误重试一次；其余错误（如接口未开通）直接带原因返回
    if (!tokenRetried && /110|111|token/i.test(reason)) {
      return await removeLogoBackgroundViaFunction(buffer, true)
    }
    throw new Error(reason)
  }
  const transparent = Buffer.from(String(result.data).replace(/^data:image\/\w+;base64,/, ''), 'base64')
  if (!transparent.length) throw new Error('removeLogoBg 返回空图片')
  return transparent
}

/**
 * 按文件头判断真实图片格式。
 * 混元生图返回的链接实际是 JPEG，若按 .png 落库会造成扩展名与内容不符，
 * 前端与下游按扩展名判断格式时容易出错。
 */
function detectImageExtension(buffer) {
  if (!buffer || !buffer.length) return 'png'
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  return 'png'
}

const LOGO_STYLES = {
  shield: 'a classic football club shield badge, strong outline, symmetrical layout',
  circle: 'a modern circular roundel badge, ring border, clean geometric inner shapes',
  minimal: 'a flat minimalist geometric emblem, simple bold silhouette, few colors',
  mascot: 'a friendly football club mascot emblem inside a badge shape, stylized animal head'
}

const LOGO_COLORS = {
  red: 'crimson red, deep navy and gold',
  blue: 'royal blue, sky blue and silver',
  green: 'emerald green, lime and white',
  yellow: 'golden yellow, amber and black',
  purple: 'deep purple, violet and gold',
  orange: 'vibrant orange, warm amber and white',
  black: 'charcoal black, graphite and white',
  teal: 'teal, cyan and navy'
}

function normalizeLogoStyle(style) {
  const key = String(style || '').toLowerCase()
  return LOGO_STYLES[key] ? key : 'shield'
}

function normalizeLogoColor(color) {
  const key = String(color || '').toLowerCase()
  return LOGO_COLORS[key] ? key : 'blue'
}

function buildTeamLogoPrompt(teamName, style, color, variantIndex) {
  const keywords = extractTeamKeywords(teamName || 'FC Team')
  const colorText = LOGO_COLORS[normalizeLogoColor(color)]
  const styleText = LOGO_STYLES[normalizeLogoStyle(style)]
  const variantHints = [
    'centered emblem, compact silhouette',
    'emblem with a small football element integrated',
    'emblem with star accents',
    'emblem with banner ribbon base'
  ]
  const variantHint = variantHints[variantIndex % variantHints.length]
  return [
    `Original fictional football club emblem for "${keywords}"`,
    styleText,
    `${colorText} color palette`,
    variantHint,
    'centered composition with generous transparent-friendly margins',
    'pure white background (#FFFFFF), fully isolated emblem, no shadow, no scenery',
    'flat vector illustration style, crisp clean edges, high contrast',
    'no text, no letters, no numbers, no watermark',
    'original design, must not reference or imitate any real football club crest, brand, trademark or copyrighted character, no real person'
  ].join(', ')
}

/**
 * 生成球队队徽候选（轻量模式 AI 队徽入口，PC 与小程序共用同一动作）
 */
async function generateTeamLogoCandidates(options = {}) {
  const teamName = String(options.teamName || '').trim() || 'FC Team'
  const style = normalizeLogoStyle(options.style)
  const color = normalizeLogoColor(options.color)
  const count = Math.max(1, Math.min(4, Number(options.count) || 1))
  const candidates = []
  const failures = []
  const notices = []
  const cutoutErrors = []

  for (let index = 0; index < count; index += 1) {
    const prompt = buildTeamLogoPrompt(teamName, style, color, index)
    try {
      const imageUrl = await withBackoffRetry('队徽生成', () => requestHunyuanImage({ prompt, aspect_ratio: '1:1' }), { maxAttempts: 3, baseDelayMs: 3000 })
      const sourceBuffer = await downloadImage(imageUrl)
      if (!sourceBuffer || !sourceBuffer.length) throw new Error('生成图下载失败')
      let finalBuffer = sourceBuffer
      let backgroundRemoved = false
      let backgroundMethod = 'none'
      let backgroundRemovalError = ''
      try {
        finalBuffer = await withBackoffRetry('队徽去底', () => removeLogoBackgroundViaFunction(sourceBuffer), { maxAttempts: 2, baseDelayMs: 2000 })
        backgroundRemoved = true
        backgroundMethod = 'removeLogoBg-object_segment'
      } catch (err) {
        backgroundRemovalError = String((err && err.message) || '服务端抠图失败')
        cutoutErrors.push(backgroundRemovalError)
        console.warn('[队徽去底] 失败，已生成但未抠图:', backgroundRemovalError)
      }
      const ext = detectImageExtension(finalBuffer)
      const uploaded = await uploadGeneratedBuffer(finalBuffer, 'team-logos/ai', ext)
      if (!uploaded || !uploaded.url) throw new Error('候选图上传失败')
      candidates.push({
        id: `candidate-${Date.now()}-${index + 1}`,
        index: index + 1,
        teamName,
        style,
        color,
        prompt,
        url: uploaded.url,
        fileID: uploaded.fileID,
        sourceUrl: imageUrl,
        aspectRatio: '1:1',
        mimeType: ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png',
        backgroundRemoved,
        backgroundMethod,
        backgroundRemovalProvider: LOGO_CUTOUT_FUNCTION,
        backgroundRemovalError,
        backgroundRemovalStatus: backgroundRemoved ? 'removed' : 'generated_not_cutout',
        aiGenerated: true
      })
    } catch (err) {
      failures.push({ index: index + 1, message: err.message || '生成失败', rateLimited: isRateLimitError(err.message) })
    }
    if (index < count - 1) await sleep(800)
  }

  const allFailed = candidates.length === 0
  const anyRateLimited = failures.some(item => item.rateLimited)
  const removedCount = candidates.filter(item => item.backgroundRemoved).length
  const notRemovedCount = candidates.length - removedCount
  if (notRemovedCount > 0) {
    notices.push(`已生成 ${notRemovedCount} 张候选队徽但服务端未能抠图（${[...new Set(cutoutErrors)].join('；') || '未返回原因'}），当前为白底原图，需人工补透明 PNG 或等抠图接口开通后重试`)
  }
  const message = allFailed
    ? (anyRateLimited ? 'AI 生图接口当前较繁忙（限流），请稍后重试' : 'AI 队徽生成失败，请重试')
    : (notRemovedCount > 0
      ? `已生成 ${candidates.length}/${count} 张候选队徽，其中 ${notRemovedCount} 张未完成抠图（白底）`
      : `已生成 ${candidates.length}/${count} 张候选队徽，已完成透明化`)

  return {
    success: !allFailed,
    data: {
      teamName,
      style,
      color,
      candidates,
      failures,
      notices: [...new Set(notices)],
      backgroundRemovalProvider: LOGO_CUTOUT_FUNCTION,
      backgroundRemovalAvailable: removedCount > 0,
      backgroundRemovalRequested: candidates.length,
      backgroundRemovalSucceeded: removedCount,
      backgroundRemovalFailed: notRemovedCount,
      backgroundRemovalError: cutoutErrors[0] || '',
      aiGenerated: true,
      aiProvider: 'hunyuan-image',
      aiModel: 'hunyuan-image',
      aiGeneratedAt: new Date().toISOString(),
      compliance: 'AI 生成图像，仅用于本赛事球队展示；不含真实俱乐部、品牌或人物元素'
    },
    message,
    code: allFailed ? (anyRateLimited ? 'AI_RATE_LIMITED' : 'AI_GENERATE_FAILED') : ''
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

      case 'generateTeamLogoCandidates':
        return await generateTeamLogoCandidates({
          teamName: event.teamName || event.name,
          style: event.style,
          color: event.color || event.teamColor,
          count: event.count
        })

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
