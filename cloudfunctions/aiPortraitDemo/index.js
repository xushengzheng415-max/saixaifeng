'use strict'
// AI 形象照演示云函数（演示用，非正式计费入口）
// 只调用混元文生图，按固定姿势预设生成定妆照示意图；
// 不接受任意 prompt，避免被当成通用生图代理。
const tcb = require('@cloudbase/node-sdk')
const referenceUpload = require('./referenceUpload.cjs')
const adminSession = require('./adminSession.cjs')
const registrationPortrait = require('./registrationPortrait.cjs')
const PIPELINE_VERSION = '20261028-transparent-png-v2'
const transparentPortrait = require('./transparentPortrait.cjs')

const POSES = {
  front: {
    label: '正面抱膀',
    text: '身体与肩膀完全正对镜头，挺拔自然站立，双臂在胸前自然交叉，手掌自然收于对侧上臂，肩膀放松，平静自信的表情'
  },
  side: {
    label: '半侧抱膀',
    text: '身体和肩膀转向画面一侧约三十五度，脸转向镜头直视相机，双臂在胸前自然交叉，明显展示三分之二侧身而非正面'
  },
  low: {
    label: '低位抱膀',
    text: '身体正对镜头，双臂自然交叠在肚脐上方的下腹位置，手分别轻搭对侧前臂，肘部低于腰线，双肩下沉放松'
  }
}

// 三套姿势的文案取自 2026-10-27 用户提供的定妆照姿势示例（output/pose-presets-20261027/prompts.md），
// 页面 03 步的缩略图也用同一组实拍示例（service-account-h5/assets/pose-presets）。
// 统一构图约束：平视、半身、头顶留白、手肘不裁切，且不出现任何道具/文字/边框。
// 2026-10-27 用户反馈“图片靠边、构图紧”：明确要求左右各留出约 20% 的纯白空白、人物占画面宽度约 60%，
// 头发顶端留约 8% 画面高度的空白，肩膀/上臂/手肘不得与边缘相切，否则成片会显得顶边、裁袖，后期也不好排版。
const COMPOSE = '平视机位，半身构图，从头顶到髋部；人物整体必须水平居中，人物中轴线与画面中轴线重合、左右两侧留白基本相等（差值不要超过画面宽度的 3%），左右两侧各留出约等于画面宽度 20% 的纯白空白，人物宽度约占画面 60%，肩膀、上臂和手肘都不得接触或裁切画面边缘，头发顶端到画面上边缘留出约等于画面高度 8% 的纯白空间、不切头发；双臂在胸前自然交叉，手部解剖正确、只有两只手；不要足球、奖杯、道具、边框、标签或任何文字。'
// 2026-10-27 用户反馈 Seedream 4.5 成片「人物偏右、右侧手臂几乎贴边」：参考图模式下模型会照抄参考照片的
// 站位和裁切，所以除了构图要求，还要明确「参考图只负责脸和球衣，不许照搬构图」。
// 阴影同理：白底影棚如果不说清楚，模型会画一圈落地投影/背景灰渐变，抠图后变成脏边。
const REFERENCE_FRAME = '参考图只用来确定这张脸、发型和球衣，不要照搬参考图的构图、人物站位和裁切（参考图里人物可能偏左偏右或拍得很满），成片必须按下面的构图要求重新排布。参考图里的背景、底色、影棚灰、灰渐变、暗角、地面投影和环境光一律不要沿用，也不要把这些灰色渗进成片背景。'
// 2026-10-28 用户反馈「生成出来的照片还是有阴影」：实测成片背景里 17% 的近白像素没到纯白，
// 右侧和左下还有整块亮度约 220 的灰影。除了参考图带灰底（前端已改纯白 + 白底净化），
// 提示词也要把「灰雾」写死成禁止项，否则模型会顺手画影棚渐变和地面投影。
const PURE_WHITE_BG = '纯白色（#ffffff）无缝影棚背景，全画面背景保持纯白，不要人物落地投影、不要背景阴影、不要灰色渐变、暗角或地面反光，人物轮廓外侧与画面四周不得出现任何灰色、雾状过渡或渐深底色，'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
}

// 单实例内的轻量限流：避免误点或探测把生图额度刷掉
let windowStart = 0
let windowCount = 0
const WINDOW_MS = 60 * 1000
const WINDOW_LIMIT = 6

function rateLimited() {
  const now = Date.now()
  if (!windowStart || now - windowStart > WINDOW_MS) {
    windowStart = now
    windowCount = 0
  }
  windowCount += 1
  return windowCount > WINDOW_LIMIT
}

function parseJson(raw) {
  try { return JSON.parse(raw) } catch (error) { return null }
}

function readBody(event) {
  if (!event) return {}
  const body = event.body
  // HTTP 触发器直接调用时 body 可能是 Buffer（不是纯字符串），先按 Buffer 解
  if (body && Buffer.isBuffer(body)) return parseJson(body.toString('utf8')) || {}
  if (typeof body === 'string' && body.trim()) {
    const direct = parseJson(body)
    if (direct) return direct
    // 网关在部分场景会把请求体做 base64，这里兜底解一次
    try {
      const decoded = Buffer.from(body, 'base64').toString('utf8')
      const parsed = parseJson(decoded)
      if (parsed) return parsed
    } catch (error) {}
    return {}
  }
  if (body && typeof body === 'object' && typeof body.length === 'number') {
    // 兼容类 Buffer 的字节数组
    return parseJson(Buffer.from(body).toString('utf8')) || {}
  }
  if (body && typeof body === 'object') {
    if (!('pose' in body) && !('photo' in body) && !('jerseyColor' in body)) return event
    return body
  }
  return event
}

// 把 #rrggbb 归一成提示词里的中文颜色描述。
// explicit = 用户在前端主动选的纯色样板：颜色是确定的，
// 不能因为“接近白色/灰度”就当成取色失败丢掉（纯白球衣是常见款）。
function normalizeColor(raw, explicit) {
  const value = String(raw || '').trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(value)) return null
  const r = parseInt(value.slice(1, 3), 16)
  const g = parseInt(value.slice(3, 5), 16)
  const b = parseInt(value.slice(5, 7), 16)
  if (!explicit && r > 232 && g > 232 && b > 232) return null // 上传照片取不到主色时视为无色
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min < 18) {
    if (!explicit) return '黑白相间'
    const light = (r + g + b) / 3
    const grayName = light >= 225 ? '纯白色' : (light <= 55 ? '黑色' : '灰色')
    return grayName + '（' + value + '）'
  }
  let name = '彩色'
  if (r === max) name = g >= b + 40 ? '橙黄色' : (b > 120 ? '洋红色' : '红色')
  else if (g === max) name = r >= b + 40 ? '黄绿色' : '绿色'
  else name = r >= g + 40 ? '紫红色' : '蓝色'
  return name + '（' + value + '）'
}

// 纯色球衣样板：不给球衣参考图、只用文字描述款式，
// 出图稳定且一定不带文字/队徽乱码，适合“只要一张干净定妆照”的场景。
const JERSEY_STYLES = {
  plain: { label: '纯色圆领', text: '纯色圆领，领口和袖口是同色系的简洁细节' },
  raglan: { label: '白色插肩', text: '肩部和袖子是白色插肩拼接，白色圆领' },
  striped: { label: '白色侧条', text: '白色V领，身体两侧有白色竖条，袖口白色滚边' }
}

// ---------- 多模型目录 ----------
// 后端白名单：前端只能从这里返回的 key 里选，禁止前端传模型名或请求地址。
// 哪个模型上架、哪个是默认，由平台后台写 platform_settings/aiPortraitModels 决定。
// 上下架由平台后台配置；缺省只开启 Seedream 4.5，不自动开启其他模型。
const DEFAULT_MODEL = 'seedream45'
const MODEL_SETTING_ID = 'aiPortraitModels'
const MODEL_CATALOG = {
  hunyuan35: {
    label: '混元影像 3.5',
    vendor: '腾讯混元（TokenHub）',
    model: 'hy-image-v3.5-preview',
    tag: '单图参考 · 付费',
    desc: '3.5 预览版：人脸、球衣花纹与胸前中文队名还原更好，TokenHub 按量计费',
    order: 5,
    hidden: false
  },
  seedream5flash: {
    label: 'Seedream 5.0 Flash',
    vendor: '火山方舟',
    model: 'doubao-seedream-5-0-flash-260915',
    tag: '多图参考 · 无水印',
    desc: '最多 10 张参考图，出图快，可源头关掉「AI生成」水印',
    order: 20,
    hidden: false
  },
  // 2026-10-27 用户指定接入：按「BS模型」（百度云 VOD 广州网关，透传火山方舟生图协议）文档，
  // 模型名必须写 doubao-seedream-4-5，不能带官方日期后缀；请求路径 /v1/images/generations。
  seedream45: {
    label: 'Seedream 4.5',
    vendor: '百度云 VOD · 广州（BS 模型网关）',
    model: 'doubao-seedream-4-5',
    tag: '2K · 透传方舟协议',
    desc: 'Seedream 4.5：参考生图与多图编辑，2K 出图，广州机房按量计费',
    order: 15
  }
}

// ready = 服务端是否具备调用条件（凭据/开通状态），与后台的启用开关是两件事
function modelReady(key) {
  if (key === 'seedream5flash') return Boolean(arkKey())
  // Seedream 4.5 走百度云 VOD 广州网关（BS 模型），需要单独的 VOD API Key
  if (key === 'seedream45') return Boolean(vodKey())
  // 3.5 是 TokenHub 的付费模型，云开发内置通道只有免费 3.0、调 3.5 一律 403，
  // 所以 3.0 已按用户要求下线，这里只剩 TokenHub 这一条链路。
  // 只要配置了 TokenHub 的 API Key 就视为可用；没配时不放进可选项，避免客户点到必然失败的模型。
  if (key === 'hunyuan35') return Boolean(String(process.env.TOKENHUB_API_KEY || '').trim())
  return true
}

function referenceSigningKey() {
  return String(process.env.AI_PORTRAIT_REFERENCE_SECRET || '').trim() || vodKey() || arkKey() || String(process.env.TOKENHUB_API_KEY || '').trim()
}

function defaultModelSetting() {
  const models = {}
  Object.keys(MODEL_CATALOG).forEach(function (key) {
    // hidden 的模型固定不上架（后台也开不回来，避免误开）；其余模型默认上架，
    // 未具备凭据的由 ready=false 标成「未开通」，前面页面会禁止选择
    models[key] = { enabled: key === DEFAULT_MODEL }
  })
  return { models: models, defaultModel: DEFAULT_MODEL, allowUserChoice: true }
}

// 后台配置缺失或读取失败时回退到默认值，不能因为配置集合异常就挡住出图
async function readModelSetting() {
  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 6000 })
    const res = await app.database().collection('platform_settings').doc(MODEL_SETTING_ID).get()
    const raw = res && res.data
    const doc = Array.isArray(raw) ? raw[0] : raw
    if (!doc || typeof doc !== 'object') return defaultModelSetting()
    const setting = defaultModelSetting()
    const stored = doc.models && typeof doc.models === 'object' ? doc.models : {}
    Object.keys(MODEL_CATALOG).forEach(function (key) {
      // hidden 的模型不接受后台旧配置覆盖，保持停用
      if (MODEL_CATALOG[key].hidden) return
      if (stored[key] && typeof stored[key].enabled === 'boolean') setting.models[key].enabled = stored[key].enabled
    })
    // 旧配置若把默认值指向已隐藏的模型，保持 DEFAULT_MODEL，不让隐藏模型被默认跑起来
    const storedDefault = String(doc.defaultModel || '')
    if (storedDefault && MODEL_CATALOG[storedDefault] && !MODEL_CATALOG[storedDefault].hidden) setting.defaultModel = storedDefault
    if (typeof doc.allowUserChoice === 'boolean') setting.allowUserChoice = doc.allowUserChoice
    return setting
  } catch (error) {
    const unavailable = defaultModelSetting()
    Object.keys(unavailable.models).forEach(function (key) { unavailable.models[key].enabled = false })
    return unavailable
  }
}

// 按目录顺序输出给前端的模型清单（只含后台启用的模型，未具备凭据的标 ready:false）
// default 取「本次不指定模型时真正会跑的模型」：后台默认若未开通，会自动落到保底模型，
// 页面按这个标记预选，避免预选到一个点了就失败的模型。
function listModels(setting) {
  const effective = resolveModel(setting, '')
  return Object.keys(MODEL_CATALOG)
    .sort(function (a, b) { return MODEL_CATALOG[a].order - MODEL_CATALOG[b].order })
    .filter(function (key) { return !MODEL_CATALOG[key].hidden && setting.models[key] && setting.models[key].enabled })
    .map(function (key) {
      const item = MODEL_CATALOG[key]
      return {
        key: key,
        label: item.label,
        vendor: item.vendor,
        tag: item.tag,
        desc: item.desc,
        ready: modelReady(key),
        default: key === effective.key
      }
    })
}

// 本次请求实际用的模型：未提交 → 用后台默认；被后台停用、未开通或已下架 → 直接拒绝。
// 「已下架」必须硬拒绝：旧页面缓存可能还在传 viduq2 这类已删除的 key，
// 若静默回落到默认模型，客户会以为用的是 Vidu、实际却按 3.5 扣费。
function resolveModel(setting, requested) {
  const asked = String(requested || '').trim()
  // hidden 与不存在的 key 一样硬拒绝：不能静默回落到默认模型，否则客户以为用的是自己选的模型
  if (asked && (!MODEL_CATALOG[asked] || MODEL_CATALOG[asked].hidden)) return { key: '', error: '该模型已下架，请刷新页面后重新选择' }
  const wanted = setting.allowUserChoice === false ? setting.defaultModel : (asked || setting.defaultModel)
  if (wanted) {
    if (!MODEL_CATALOG[wanted] || !setting.models[wanted] || !setting.models[wanted].enabled) return { key: '', error: '该模型已在后台停用，请刷新页面' }
    if (!modelReady(wanted)) return { key: '', error: '该模型尚未开通，请换一个模型' }
    return { key: wanted }
  }
  return { key: '', error: '当前没有可用的默认模型，请联系平台管理员' }
}

function usable(setting, key) {
  const item = MODEL_CATALOG[key]
  if (!item || item.hidden) return false
  return Boolean(setting.models[key] && setting.models[key].enabled && modelReady(key))
}

// ---------- 平台后台读取接口（云函数内部调用，不走 HTTP） ----------
// 目录和默认值的唯一来源在 aiPortraitDemo：平台后台只读这里的结果，
// 不在 platformOwner 里再写一份模型清单，避免两处长期分叉。
function isHttpTrigger(event) {
  return Boolean(event && (
    event.httpMethod || event.headers || event.requestContext ||
    event.path || event.queryString || event.isBase64Encoded !== undefined
  ))
}

function adminModelList(setting) {
  return Object.keys(MODEL_CATALOG)
    .sort(function (a, b) { return MODEL_CATALOG[a].order - MODEL_CATALOG[b].order })
    .map(function (key) {
      const item = MODEL_CATALOG[key]
      return {
        key: key,
        label: item.label,
        vendor: item.vendor,
        model: item.model,
        tag: item.tag,
        desc: item.desc,
        order: item.order,
        // hidden 的模型即使后台旧配置写着启用也按停用展示，并单独标 hidden
        enabled: Boolean(!item.hidden && setting.models[key] && setting.models[key].enabled),
        hidden: Boolean(item.hidden),
        ready: modelReady(key),
        default: key === setting.defaultModel
      }
    })
}

// ---------- 用量记录（只记模型/模式/耗时/成败，不存照片、人脸或手机号） ----------
const USAGE_COLLECTION = 'ai_portrait_usage'

// 统计口径统一按北京时间切天，避免跨零点把今天的量算到昨天
function dayKey(time) {
  const at = Number(time) || Date.now()
  return new Date(at + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function logUsage(record) {
  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 5000 })
    await app.database().collection(USAGE_COLLECTION).add({
      model: String(record.model || ''),
      modelLabel: String(record.modelLabel || ''),
      mode: String(record.mode || ''),
      pose: String(record.pose || ''),
      poseLabel: String(record.poseLabel || ''),
      jerseyMode: String(record.jerseyMode || ''),
      images: Number(record.images || 0),
      success: record.success === true,
      durationMs: Number(record.durationMs || 0),
      error: String(record.error || '').slice(0, 160),
      source: 'h5-demo',
      day: dayKey(record.at),
      createdAt: new Date(Number(record.at) || Date.now())
    })
  } catch (error) {
    // 统计写入失败不能挡住出图，也不能把存储错误抛给用户
    console.warn('[aiPortraitDemo] 用量记录失败:', error && (error.message || error))
  }
}

// ---------- 体型属性（身高/体重/胖瘦） ----------
// 用户反馈：不加体型，出来的每个人身材都一样。这里把身高体重折算成“比例描述”写进提示词。
// 只用于生成，不进用量记录、不回显数值到成品；数值不合理 (比如 40cm / 300kg) 就当没填，
// 绝不按缺省值把偏胖或偏瘦的人改成“标准身材”。
// 六档体型文案必须“看得见”：半身照里只写“偏胖/偏瘦”模型几乎不改，
// 所以要具体到肩宽、脖子与下颌的肉感、上臂粗细、腰腹轮廓、球衣松紧这些可画出来的点。
const BODY_TYPES = {
  lean: {
    label: '偏瘦',
    text: '明显偏瘦：肩膀窄、锁骨与肩胛轮廓清晰，上臂纤细，胸背薄，腰腹平坦内收，脖子细，脸颊清瘦、下颌线利落，球衣在身上明显宽松'
  },
  slim: {
    label: '匀称偏瘦',
    text: '偏瘦：肩背偏窄，上臂偏细，腰腹平坦，面颊较清瘦，球衣略宽松'
  },
  normal: {
    label: '匀称',
    text: '匀称：肩背自然，手臂粗细适中，腰腹平实，球衣合身'
  },
  strong: {
    label: '结实',
    text: '结实：肩背明显宽厚，脖子较粗，上臂与胸背有肌肉量，腰腹平实不发福，球衣在肩臂处被撑起'
  },
  heavy: {
    label: '微胖',
    text: '微胖：肩背厚实，胸腹略圆润，颈侧与下颌开始有肉感，上臂偏粗，球衣在腰腹处撑起轻微褶皱'
  },
  large: {
    label: '偏胖',
    text: '明显偏胖：脖子粗、有双下巴，面颊饱满，胸腹圆鼓外突，上臂粗壮、手指偏短粗，球衣被撑紧、腰腹处出现横向褶皱'
  }
}

function readBodyProfile(body) {
  const raw = body || {}
  const height = Number(raw.height)
  const weight = Number(raw.weight)
  const hasHeight = isFinite(height) && height >= 120 && height <= 230
  const hasWeight = isFinite(weight) && weight >= 20 && weight <= 200
  // 用户手动选的体型优先（前端可覆盖自动判断）；只认白名单 key，不认任意文案
  let type = BODY_TYPES[String(raw.bodyType || '')] ? String(raw.bodyType) : ''
  if (!type && hasHeight && hasWeight) {
    const bmi = weight / Math.pow(height / 100, 2)
    type = bmi < 16.5 ? 'lean'
      : bmi < 18.5 ? 'slim'
        : bmi < 24 ? 'normal'
          : bmi < 27 ? 'strong'
            : bmi < 30 ? 'heavy'
              : 'large'
  }
  const item = BODY_TYPES[type] || null
  return {
    height: hasHeight ? height : 0,
    weight: hasWeight ? weight : 0,
    type: type,
    label: item ? item.label : '',
    text: item ? item.text : ''
  }
}

function bodyPrompt(profile) {
  if (!profile || !profile.text) {
    // 没填体型：让模型跟着参考照片的真实身材走，避免一套“标准身材”套所有人
    return '身材按参考照片中人物的真实体型还原，不要统一收窄腰身、拉长腿部或套用标准健硕身材。'
  }
  const size = profile.height && profile.weight
    ? '身高约 ' + profile.height + ' 厘米、体重约 ' + profile.weight + ' 公斤，'
    : ''
  // 参考图里本来就带着拍照者自己的身材，模型很容易直接照搬，所以这里要明确“脸取自参考图、身体按体型重画”。
  return '人物实际身材：' + size + profile.text +
    '；以上特征必须在画面上清晰可辨（肩宽、脖子与下颌的肉感、上臂粗细、腰腹轮廓、球衣松紧）。' +
    '参考照片只用来确定这张脸，身体轮廓按上面的体型重新绘制，不要照搬参考照片里人物现有的胖瘦。' +
    '五官与身份特征（眼睛、鼻子、嘴型、发际线、痣）必须与参考照片一致，但面颊饱满度、下颌线与脖子粗细可以随体型自然变化。' +
    '不要画腹肌线条或夸张肌肉。'
}

function buildPrompt(poseKey, colorText, hasJersey, hasReference, jerseyRef, jerseyText, jerseyStyle, lightJersey, bodyText) {
  const pose = POSES[poseKey] || POSES.front
  // 球衣参考模式：前端把“人脸 + 球衣图”拼成一张参考板，
  // 模型只能吃 1 张参考图，靠左右布局同时拿到脸和球衣款式。
  // 实测：把球衣结构逐项写清、保留左胸队徽，还原度明显高于“只取主色 + 禁止队徽”；
  // 但球衣上的文字/号码 AI 拼字不稳定（拉丁字母常出现乱码），
  // 因此默认留空交给后期模板叠字，用户明确勾选时才让 AI 尝试还原。
  if (jerseyRef) {
    const textLine = jerseyText
      ? '球衣胸前的文字、字母和号码按参考图的位置排布尝试还原，字形尽量接近参考图。'
      : '球衣上不要出现任何文字、字母、数字、队名或赞助标识。'
    return [
      '写实体育摄影，影棚半身定妆照。',
      '参考图左侧是同一个人（中国人，东亚面孔），' + pose.text + '。',
      '必须保持左侧人物的同一张脸：五官、脸型、肤色、发型和年龄感都要一致。',
      '身上穿的是参考图右侧这件足球比赛球衣，款式与图案必须与参考图一致。',
      '球衣主体颜色、领口款式、袖口和侧身细节按参考图还原；',
      '球衣上如果有同色系印花、暗纹、渐变或大面积图案，按参考图的构图和配色迁移，可以简化但层次和位置要对；',
      '左胸位置保留参考图里的球队徽章，圆形或盾形都照参考图，保留配色、轮廓和位置；',
      textLine,
      bodyText,
      REFERENCE_FRAME,
      // 用户要求背景尽量纯白：统一用干净的白底影棚，便于后期换底/抠图
      PURE_WHITE_BG + '柔和主光与侧后方轮廓光，',
      '面部清晰、肤色自然、与球衣边缘干净，',
      COMPOSE,
      '竖构图，高清细节，专业俱乐部宣传照质感。'
    ].join('')
  }
  const styleText = (JERSEY_STYLES[jerseyStyle] || JERSEY_STYLES.plain).text
  const jersey = hasJersey
    ? '身穿主色为' + colorText + '的短袖足球球衣，' + styleText
    : '身穿深绿色短袖足球球衣，' + styleText
  return [
    '写实体育摄影，影棚半身定妆照。',
    '参考照片中的人物（中国人，东亚面孔），' + pose.text + '。',
    hasReference ? '必须保持参考照片中同一张脸：五官、脸型、肤色、发型和年龄感都要一致。' : '',
    jersey + '。',
    bodyText,
    '球衣是纯色的，不要任何文字、字母、号码、徽章、队徽、赞助标识或印花图案。',
    // 用户要求背景尽量纯白（方便后期换底/抠图）；白色球衣再补一句投影，
    // 否则白衣服和白背景会糊在一起，看不出肩线和手臂边缘。
    lightJersey
      ? PURE_WHITE_BG + '白色球衣与背景之间只保留极轻微的接触阴影和清晰边缘（不要大面积落地投影），柔和主光与侧后方轮廓光，'
      : PURE_WHITE_BG + '柔和主光与侧后方轮廓光，',
    '面部清晰、肤色自然、与球衣边缘干净，',
    COMPOSE,
    '竖构图，高清细节，专业俱乐部宣传照质感。'
  ].join('')
}

// ---------- 混元 3.5 预览版（腾讯云 TokenHub，付费模型） ----------
// 调用指南：https://cloud.tencent.com/document/product/1823/135745
// 与云开发内置通道的 3.0 不是同一条链路：3.5 只能走 TokenHub，用 Bearer API Key，
// 走 OpenAI Chat 风格的 messages 协议，同步返回，图片在 choices[0].delta.image.url。
const TOKENHUB_BASE = 'https://tokenhub.tencentmaas.com'
const TOKENHUB_35_PATH = '/v1/wand/hunyuan-image/v35-generation'
const TOKENHUB_35_DEFAULT_MODEL = 'hy-image-v3.5-preview'
// 3.5 默认出 4:5 竖版（1024x1280）：定妆照是半身竖构图，方图会把两侧手肘顶到边缘；
// 文档允许任意 256–8192 尺寸，可用 HUNYUAN35_SIZE 覆盖。
const TOKENHUB_35_DEFAULT_SIZE = '1024x1280'

// TokenHub 正常是单个 JSON 帧；若网关改回 SSE 形态，则逐行取最后一条带 choices 的 data。
function parseTokenhubImageUrl(text) {
  const raw = String(text || '')
  let json = null
  try { json = JSON.parse(raw) } catch (error) {}
  if (!json) {
    const lines = raw.split(/\r?\n/)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (line.indexOf('data:') !== 0) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const parsed = JSON.parse(payload)
        if (parsed && parsed.choices) { json = parsed; break }
      } catch (error) {}
    }
  }
  if (!json) return { url: '', error: 'TokenHub 返回非 JSON：' + raw.slice(0, 120) }
  const failed = json.error && typeof json.error === 'object' ? json.error : null
  if (failed) {
    return {
      url: '',
      error: 'TokenHub 生图失败：' + String(failed.code || '') + ' ' + String(failed.message || '')
    }
  }
  const choice = Array.isArray(json.choices) ? json.choices[0] : null
  const image = choice && choice.delta && choice.delta.image ? choice.delta.image : null
  const url = String((image && image.url) || '')
  if (!url) {
    const reason = choice && choice.finish_reason ? String(choice.finish_reason) : '未返回图片'
    return { url: '', error: 'TokenHub 未返回图片（' + reason + '）：' + raw.slice(0, 120) }
  }
  return { url: url, error: '' }
}

async function requestHunyuan35Image(prompt, photoDataUrl) {
  const key = String(process.env.TOKENHUB_API_KEY || '').trim()
  if (!key) throw new Error('混元 3.5 未开通（服务端缺少 TOKENHUB_API_KEY）')
  const modelId = String(process.env.HUNYUAN35_MODEL || '').trim() || TOKENHUB_35_DEFAULT_MODEL
  const size = String(process.env.HUNYUAN35_SIZE || '').trim() || TOKENHUB_35_DEFAULT_SIZE
  const content = [{ type: 'text', text: prompt }]
  // 参考图可以直接用前端传上来的 data URL（文档允许 data:image/...;base64，单图 ≤20MB）
  if (photoDataUrl) content.push({ type: 'image_url', image_url: { url: photoDataUrl } })
  const payload = {
    model: modelId,
    size: size,
    messages: [{ role: 'user', content: content }]
  }
  // 不传 footnote：不烧业务水印，也不需要前端裁角标
  const controller = new AbortController()
  const timer = setTimeout(function () { controller.abort() }, 100000)
  try {
    const response = await fetch(TOKENHUB_BASE + TOKENHUB_35_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error('TokenHub 接口 HTTP ' + response.status + '：' + text.slice(0, 160))
    }
    const parsed = parseTokenhubImageUrl(text)
    if (!parsed.url) throw new Error(parsed.error)
    return parsed.url
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 豆包 Seedream 5.0 Flash（火山方舟）参考生图 ----------
// 协议：POST https://ark.cn-beijing.volces.com/api/v3/images/generations
// Bearer ARK_API_KEY；image 支持 URL 或 data URL（最多 10 张），同步返回；
// watermark:false 可直接关掉「AI生成」角标，url 24 小时有效（这里立刻下载转内联）。
const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3'
const ARK_DEFAULT_MODEL = 'doubao-seedream-5-0-flash-260915'

// 火山方舟的凭据与模型名读取口径（用户实际把 Key 放在了 ARK_SEEDREAM_MODEL 这个变量名里，这里兼容两种叫法）：
// 1) 首选 ARK_API_KEY，其次 ARK_SEEDREAM_KEY；
// 2) 兜底 ARK_SEEDREAM_MODEL —— 这个名字原本是「模型 ID 槽位」，而模型 ID 一定以 doubao- / ep- 开头，
//    只有不像模型名的值（火山 Key 是 UUID 形态）才当凭据，避免把模型名误当 Key 去鉴权。
const ARK_MODEL_PATTERN = /^(doubao-|ep-)/i

function arkKey() {
  const explicit = String(process.env.ARK_API_KEY || process.env.ARK_SEEDREAM_KEY || '').trim()
  if (explicit) return explicit
  const fallback = String(process.env.ARK_SEEDREAM_MODEL || '').trim()
  if (!fallback || ARK_MODEL_PATTERN.test(fallback)) return ''
  return fallback
}

function arkModelId() {
  const raw = String(process.env.ARK_SEEDREAM_MODEL || '').trim()
  if (raw && ARK_MODEL_PATTERN.test(raw)) return raw
  return String(process.env.ARK_MODEL || '').trim() || ARK_DEFAULT_MODEL
}

// 定妆照统一竖版 3:4；Seedream 5.0 的像素方式比档位方式更能锁住比例
function seedreamSize(aspectRatio) {
  const map = { '3:4': '1344x1792', '1:1': '1536x1536', '4:3': '1792x1344', '16:9': '2048x1152', '9:16': '1152x2048' }
  return map[String(aspectRatio || '')] || '1344x1792'
}

async function requestSeedreamImage(prompt, photoDataUrl, aspectRatio) {
  const key = arkKey()
  if (!key) throw new Error('Seedream 模型未开通（服务端缺少 ARK_API_KEY）')
  const modelId = arkModelId()
  const payload = {
    model: modelId,
    prompt: prompt,
    size: seedreamSize(aspectRatio),
    // 2K PNG 内联成 base64 会超过云开发 HTTP 触发器 6MB 响应上限（实测 1344x1792 PNG 直接 400），
    // 统一要 jpeg：同尺寸体积小一个量级，白底人像没有透明需求，画质无感知差别
    output_format: 'jpeg',
    watermark: false,
    response_format: 'url'
    // 注意：5.0 flash 不支持配置 sequential_image_generation（传了会报错），单图一次一张
  }
  if (photoDataUrl) payload.image = photoDataUrl
  const controller = new AbortController()
  const timer = setTimeout(function () { controller.abort() }, 100000)
  try {
    const response = await fetch(ARK_BASE + '/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch (error) {}
    if (!response.ok) {
      const detail = json && json.error ? (json.error.code || '') + ' ' + (json.error.message || '') : text.slice(0, 160)
      throw new Error('Seedream 接口 HTTP ' + response.status + '：' + String(detail).slice(0, 140))
    }
    const first = json && Array.isArray(json.data) ? json.data[0] : null
    const url = String((first && first.url) || '')
    if (!url) throw new Error('Seedream 未返回图片地址：' + text.slice(0, 120))
    return url
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 豆包 Seedream 4.5（百度云 VOD · 广州「BS 模型」网关） ----------
// 文档（用户 2026-10-27 提供）：base_url https://vod.gz.baidubce.com，请求路径 /v1/images/generations，
// OpenAI Image Generations 规范、参数完全透传火山方舟；模型名必须写 doubao-seedream-4-5（不带日期后缀）。
// 鉴权同样是 Bearer API Key，Key 在百度云广州控制台「API Keys」创建。
const BV_BASE = 'https://vod.gz.baidubce.com'
const SEEDREAM45_MODEL = 'doubao-seedream-4-5'

function vodBase() { return String(process.env.BV_BASE_URL || '').trim() || BV_BASE }
// 百度云 IAM 形态的 Key 是 bce-v3/ALTAK-xxx/yyy，控制台有时不允许环境变量值里出现 "/"，
// 约定用 "~" 代替 "/" 填写，这里还原回来，避免因为一个字符填不进去。
function normalizeVodKey(raw) {
  const value = String(raw || '').trim()
  return /^bce-v3~/i.test(value) ? value.replace(/~/g, '/') : value
}
// Key 的变量名不强行统一：按常见写法依次找，找不到再兜底扫一遍包含 VOD/BAIDU/BV 的名字，
// 这样用户用控制台能接受的任意名字都能生效，不会因为改了变量名就“未开通”。
const VOD_KEY_NAMES = [
  'BV_API_KEY', 'BAIDU_VOD_API_KEY', 'BAIDU_VOD_KEY', 'BAIDU_VOD_APIKEY',
  'VOD_API_KEY', 'VOD_APIKEY', 'VOD_KEY', 'BV_KEY', 'BAIDU_KEY'
]
function vodKey() {
  for (let i = 0; i < VOD_KEY_NAMES.length; i++) {
    const value = normalizeVodKey(process.env[VOD_KEY_NAMES[i]])
    if (value) return value
  }
  const names = Object.keys(process.env)
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    if (!/(VOD|BAIDU|BV)/i.test(name)) continue
    // 只认“像 Key”的值：长度够、且不含 URL 里的 / : 等字符，避免把 BV_BASE_URL 当 Key
    const value = normalizeVodKey(process.env[name])
    if (/^[A-Za-z0-9._~+\-]{16,}$/.test(value)) return value
  }
  return ''
}

// Seedream 4.x 的 2K 档位尺寸；3:4 竖版用于定妆照。
// 若网关对该尺寸报参数错误，可用环境变量 SEEDREAM45_SIZE 直接改成 "2K" 等档位值，无需改代码。
function seedream45Size(aspectRatio) {
  const override = String(process.env.SEEDREAM45_SIZE || '').trim()
  if (override) return override
  const map = { '3:4': '1728x2304', '1:1': '2048x2048', '4:3': '2304x1728' }
  return map[String(aspectRatio || '')] || map['3:4']
}

async function seedream45Call(key, payload) {
  const controller = new AbortController()
  const timer = setTimeout(function () { controller.abort() }, 100000)
  try {
    const response = await fetch(vodBase() + '/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch (error) {}
    if (!response.ok) {
      const detail = json && json.error ? (json.error.code || '') + ' ' + (json.error.message || '') : text.slice(0, 160)
      throw new Error('Seedream 4.5 接口 HTTP ' + response.status + '：' + String(detail).slice(0, 140))
    }
    const first = json && Array.isArray(json.data) ? json.data[0] : null
    if (first && first.b64_json) return 'data:image/jpeg;base64,' + String(first.b64_json)
    const url = String((first && first.url) || '')
    if (!url) throw new Error('Seedream 4.5 未返回图片地址：' + text.slice(0, 120))
    return url
  } finally {
    clearTimeout(timer)
  }
}

async function requestSeedream45Image(prompt, photoDataUrl, aspectRatio) {
  const key = vodKey()
  if (!key) throw new Error('Seedream 4.5 未开通（服务端缺少 BV_API_KEY）')
  const base = {
    model: SEEDREAM45_MODEL,
    prompt: prompt,
    // 源头关掉「AI生成」角标；网关透传该参数
    watermark: false,
    response_format: 'url'
  }
  // 2026-10-27 真机实测：广州网关对 doubao-seedream-4-5 直接返回
  // 400 InvalidParameter「the parameter `output_format` is not supported」，
  // 该参数只有 5.0 系列支持。默认不发送；确需强制输出格式时用 SEEDREAM45_OUTPUT_FORMAT 显式打开。
  const outputFormat = String(process.env.SEEDREAM45_OUTPUT_FORMAT || '').trim()
  if (outputFormat) base.output_format = outputFormat
  if (photoDataUrl) base.image = photoDataUrl
  const size = seedream45Size(aspectRatio)
  try {
    return await seedream45Call(key, Object.assign({}, base, { size: size }))
  } catch (error) {
    // 像素值被网关判为不合法时退回官方档位写法（2K），避免“配了 Key 却出不了图”
    const message = String(error.message || '')
    if (size === '2K' || !/HTTP (400|422)/.test(message) || !/size|分辨率|像素|宽高|width|height/i.test(message)) throw error
    console.warn('[aiPortraitDemo] Seedream 4.5 尺寸被拒，回退 2K:', message.slice(0, 120))
    return await seedream45Call(key, Object.assign({}, base, { size: '2K' }))
  }
}

function downloadImage(targetUrl, depth) {
  const level = Number(depth) || 0
  return new Promise(function (resolve, reject) {
    if (level > 3) return reject(new Error('图片下载重定向过多'))
    const client = targetUrl.indexOf('https:') === 0 ? require('https') : require('http')
    const request = client.get(targetUrl, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(downloadImage(res.headers.location, level + 1))
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error('图片下载失败，状态码 ' + res.statusCode))
        return
      }
      const chunks = []
      res.on('data', function (chunk) { chunks.push(chunk) })
      res.on('end', function () {
        resolve({ buffer: Buffer.concat(chunks), mime: String(res.headers['content-type'] || 'image/png') })
      })
    })
    request.on('error', reject)
    request.setTimeout(15000, function () { request.destroy(new Error('图片下载超时')) })
  })
}

// ---------- 构图归一（2026-10-27 用户要求「服务端构图归一」）----------
// 模型对「人物居中、左右各留画面宽 20%、头顶留画面高 8%」只是软约束：实测 Seedream 4.5 出图
// 人物占画面宽 80.8%、头顶留白仅 1.2%、右侧手臂几乎贴边，提示词拉不动。
// 所以出图后在服务端量出人物外框，等比缩小并水平居中贴到纯白画布上，留白由代码保证，
// 模型怎么画都不会偏。可用环境变量关闭或调整比例：
//   COMPOSE_NORMALIZE=0             关闭归一（默认开启）
//   COMPOSE_SUBJECT_WIDTH_RATIO=0.76 人物最大宽度占画面比例（0.2~0.95），只在人物过宽时起作用
//   COMPOSE_TOP_MARGIN_RATIO=0.08    头顶留白占画面高度比例
const COMPOSE_NORMALIZE = process.env.COMPOSE_NORMALIZE !== '0'
const COMPOSE_JPEG_QUALITY = 92
function composeRatio(raw, fallback) {
  const value = Number(raw)
  return Number.isFinite(value) && value > 0.2 && value < 0.95 ? value : fallback
}
const COMPOSE_SUBJECT_RATIO = composeRatio(process.env.COMPOSE_SUBJECT_WIDTH_RATIO, 0.76)
const COMPOSE_TOP_RATIO = composeRatio(process.env.COMPOSE_TOP_MARGIN_RATIO, 0.08)

// 背景白判定：三通道几乎相等且足够亮。提示词已要求纯白无投影，这个口径足够稳；
// 白色球衣因为有色差和褶皱阴影，不会被误判成背景。
function isWhiteBackground(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min <= 10 && min >= 238
}

function decodeImage(buffer, mime) {
  if (/png/i.test(String(mime))) {
    const png = require('pngjs').PNG.sync.read(buffer)
    return { width: png.width, height: png.height, data: png.data }
  }
  const raw = require('jpeg-js').decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 })
  return { width: raw.width, height: raw.height, data: raw.data }
}

// 量人物外框（采样步长 2px，对整幅构图无影响）
function subjectBox(decoded) {
  const width = decoded.width
  const height = decoded.height
  const data = decoded.data
  let left = width, right = -1, top = height, bottom = -1
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      if (isWhiteBackground(data[i], data[i + 1], data[i + 2])) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0 || bottom < 0) return null
  return { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1 }
}

function sampleBilinear(src, sw, sh, fx, fy, out, oi) {
  const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)))
  const x1 = Math.min(sw - 1, x0 + 1)
  const y1 = Math.min(sh - 1, y0 + 1)
  const dx = Math.max(0, Math.min(1, fx - x0))
  const dy = Math.max(0, Math.min(1, fy - y0))
  for (let c = 0; c < 3; c++) {
    const p00 = src[(y0 * sw + x0) * 4 + c]
    const p10 = src[(y0 * sw + x1) * 4 + c]
    const p01 = src[(y1 * sw + x0) * 4 + c]
    const p11 = src[(y1 * sw + x1) * 4 + c]
    const value = (p00 * (1 - dx) + p10 * dx) * (1 - dy) + (p01 * (1 - dx) + p11 * dx) * dy
    out[oi + c] = value < 0 ? 0 : value > 255 ? 255 : Math.round(value)
  }
  out[oi + 3] = 255
}

// 白底净化（2026-10-28 用户反馈「生成出来还是有阴影」）：
// 模型会照抄参考图里的影棚灰背景、暗角和落地投影，而构图归一只是把整张图重绘到白画布，
// 不会清灰——灰影比人物外框判定阈值浅时还会整块留在成片里。
// 这里从画面四边向内做一次连通生长，把「与边缘连通的低饱和浅色像素」统一压成纯白：
// 只吃连到边框的背景，被皮肤、头发、球衣围住的内部像素（白色球衣高光、白领）不会被动到；
// 相邻亮度过差超过 WHITEN_MAX_STEP 视为人物轮廓，停止生长（纯白像素例外，允许跨过阴影硬边）。
const WHITEN_MAX_SAT = 18
const WHITEN_MIN_VALUE = 190
const WHITEN_MAX_STEP = 26
function whitenBackground(decoded) {
  const W = decoded.width
  const H = decoded.height
  const data = decoded.data
  const total = W * H
  const visited = new Uint8Array(total)
  const stack = new Int32Array(total)
  let top = 0
  const valueAt = function (index) {
    const i = index * 4
    return (data[i] + data[i + 1] + data[i + 2]) / 3
  }
  const push = function (index, base) {
    if (index < 0 || index >= total || visited[index]) return
    const i = index * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (Math.max(r, g, b) - Math.min(r, g, b) > WHITEN_MAX_SAT) return
    const value = (r + g + b) / 3
    if (value < WHITEN_MIN_VALUE) return
    if (Math.abs(value - base) > WHITEN_MAX_STEP && value < 238) return
    visited[index] = 1
    stack[top++] = index
  }
  for (let x = 0; x < W; x++) {
    push(x, valueAt(x))
    push((H - 1) * W + x, valueAt((H - 1) * W + x))
  }
  for (let y = 0; y < H; y++) {
    push(y * W, valueAt(y * W))
    push(y * W + W - 1, valueAt(y * W + W - 1))
  }
  let cleared = 0
  while (top > 0) {
    const index = stack[--top]
    const i = index * 4
    // 基准亮度必须取「涂白之前」的值，否则邻居全都拿 255 去比，灰影会被判成边缘而漏掉
    const base = valueAt(index)
    data[i] = 255
    data[i + 1] = 255
    data[i + 2] = 255
    cleared += 1
    const x = index % W
    const y = (index - x) / W
    if (x > 0) push(index - 1, base)
    if (x < W - 1) push(index + 1, base)
    if (y > 0) push(index - W, base)
    if (y < H - 1) push(index + W, base)
  }
  return cleared / total
}

// 按「顶部留 8%、底部贴边、左右留白相等」重排到同尺寸纯白画布。
// 半身照本来就裁到胯部：如果按宽度缩到 60% 再上下居中，人物会浮在画面中间、胯部下方留出一条白带，
// 所以这里让「高度」优先——顶部留白固定，底部贴齐画布，宽度只做最大占比保护（默认 76%）。
function normalizeComposition(decoded) {
  const W = decoded.width
  const H = decoded.height
  const box = subjectBox(decoded)
  if (!box || box.width < W * 0.1 || box.height < H * 0.1) return null
  const scale = Math.min((COMPOSE_SUBJECT_RATIO * W) / box.width, ((1 - COMPOSE_TOP_RATIO) * H) / box.height)
  const offsetX = (W - box.width * scale) / 2 - box.left * scale
  const offsetY = H - (box.bottom + 1) * scale
  const out = Buffer.alloc(W * H * 4, 255)
  const drawW = W * scale
  const drawH = H * scale
  const x0 = Math.max(0, Math.floor(offsetX))
  const x1 = Math.min(W - 1, Math.ceil(offsetX + drawW))
  const y0 = Math.max(0, Math.floor(offsetY))
  const y1 = Math.min(H - 1, Math.ceil(offsetY + drawH))
  for (let y = y0; y <= y1; y++) {
    const fy = (y + 0.5 - offsetY) / scale - 0.5
    if (fy < 0 || fy > H - 1) continue
    for (let x = x0; x <= x1; x++) {
      const fx = (x + 0.5 - offsetX) / scale - 0.5
      if (fx < 0 || fx > W - 1) continue
      sampleBilinear(decoded.data, W, H, fx, fy, out, (y * W + x) * 4)
    }
  }
  return { width: W, height: H, data: out, scale, box }
}

// 统一转 JPEG：2K PNG 内联会撞 6MB 响应上限，JPEG 体积稳定在几百 KB。
function normalizeImageBuffer(buffer, mime) {
  if (!COMPOSE_NORMALIZE) return null
  try {
    const decoded = decodeImage(buffer, mime)
    // 先净化白底再量外框：这样灰影、暗角不会参与人物外框判定，也不会被一起搬到成片里
    const cleared = whitenBackground(decoded)
    const normalized = normalizeComposition(decoded)
    if (!normalized) {
      console.warn('[aiPortraitDemo] 构图归一跳过：没量到人物外框')
      return null
    }
    const encoded = require('jpeg-js').encode(
      { data: normalized.data, width: normalized.width, height: normalized.height },
      COMPOSE_JPEG_QUALITY
    )
    return {
      buffer: Buffer.from(encoded.data),
      mime: 'image/jpeg',
      scale: normalized.scale,
      clearedRatio: Math.round(cleared * 1000) / 1000
    }
  } catch (error) {
    // 归一失败不能影响出图：退回模型原图，只在日志里留痕
    console.warn('[aiPortraitDemo] 构图归一失败，返回原图:', String((error && error.message) || error).slice(0, 160))
    return null
  }
}

// 混元返回的是带签名的临时地址，签名里包含账号标识，
// 不能直接交给浏览器；这里转成内联图片返回。
// 但云开发 HTTP 触发器响应体上限 6MB，2K 图内联就会超（实测 Seedream PNG 直接 400 FUNCTIONS_INVOCATION_FAILED），
// 所以设一个上限：超了就退回原始临时地址（Seedream 是 jpeg + 24 小时有效，可接受）。
const INLINE_LIMIT = 3000000
async function toInlineImage(url, preserveOriginal, transparentOutput) {
  if (transparentOutput) {
    let file
    if (/^data:image\//.test(String(url))) {
      const raw = String(url), comma = raw.indexOf(',')
      file = { buffer: Buffer.from(raw.slice(comma + 1), 'base64'), mime: raw.slice(5, comma).split(';')[0] }
    } else file = await downloadImage(url)
    return transparentPortrait.render(file.buffer, file.mime,
      tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 45000 }), decodeImage, sampleBilinear)
  }
  // 有的网关按 response_format 直接回 b64_json，这里已经是内联图，不需要再下载
  if (/^data:image\//.test(String(url))) {
    const raw = String(url)
    const head = raw.slice(0, raw.indexOf(','))
    const mime = head.slice(5).split(';')[0] || 'image/jpeg'
    const buffer = Buffer.from(raw.slice(raw.indexOf(',') + 1), 'base64')
    const normalized = preserveOriginal ? null : normalizeImageBuffer(buffer, mime)
    if (!normalized) return { inline: raw, composed: false }
    const inline = 'data:image/jpeg;base64,' + normalized.buffer.toString('base64')
    return { inline: inline.length > INLINE_LIMIT ? raw : inline, composed: true }
  }
  const file = await downloadImage(url)
  const normalized = preserveOriginal ? null : normalizeImageBuffer(file.buffer, file.mime)
  const buffer = normalized ? normalized.buffer : file.buffer
  const mime = normalized ? normalized.mime : file.mime
  const inline = 'data:' + mime.split(';')[0] + ';base64,' + buffer.toString('base64')
  if (inline.length > INLINE_LIMIT) return { inline: String(url), composed: false }
  return { inline, composed: Boolean(normalized) }
}

function reply(statusCode, payload) {
  return { statusCode: statusCode, headers: CORS, body: JSON.stringify(payload) }
}

exports.main = async function (event) {
  const method = String((event && (event.httpMethod || event.method)) || 'POST').toUpperCase()
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }

  const body = readBody(event)
  let registrationContext = null
  if (['registrationGenerate', 'registrationPrepare', 'registrationCancel'].includes(body.action)) {
    if (!/^[a-f0-9]{64}$/.test(String(body.registrationTicket || ''))) return reply(403, { success: false, error: '登记生图会话已失效，请重新打开登记页' })
    registrationContext = await registrationPortrait.verify(tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 6000 }).database(), body.registrationTicket)
    if (!registrationContext) return reply(403, { success: false, error: '登记生图会话已失效，请重新打开登记页' })
    body.action = { registrationGenerate: 'generate', registrationPrepare: 'prepareReference', registrationCancel: 'cancelReference' }[body.action]
    body.transparentOutput = true
    body.preserveOriginal = true
  }
  if (body.action === 'adminCreateSession') {
    return reply(403, { success: false, error: '请通过平台管理员登录创建生图会话' })
  }
  let adminTool = false
  if (/^adminTool/.test(String(body.action || ''))) {
    if (!/^[a-f0-9]{64}$/.test(String(body.adminTicket || '')) || !await adminSession.verify(tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 6000 }).database(), body.adminTicket)) return reply(403, { success: false, error: '后台生图会话已过期，请重新打开标签' })
    adminTool = true
    const actions = { adminToolModels: 'models', adminToolPrepare: 'prepareReference', adminToolCancel: 'cancelReference', adminToolGenerate: 'generate' }
    if (!actions[body.action]) return reply(400, { success: false, error: '不支持的后台生图操作' })
    body.action = actions[body.action]
    body.transparentOutput = true
    body.preserveOriginal = true
  }
  // 平台后台只读接口：只允许云函数内部调用（平台后台 → platformOwner → 这里），
  // HTTP 触发一律拒绝，避免后台配置接口暴露成公网可探测的入口。
  if (body.action === 'adminGetModels') {
    if (isHttpTrigger(event)) return reply(403, { success: false, error: '该操作只允许平台后台内部调用' })
    const setting = await readModelSetting()
    return {
      success: true,
      setting: setting,
      models: adminModelList(setting)
    }
  }
  // GET 只做目录/健康检查：前端靠它拿到后台启用的模型清单
  if (method === 'GET' || (adminTool && body.action === 'models')) {
    const setting = await readModelSetting()
    return reply(200, {
      success: true,
      message: 'AI 形象照演示接口，请用 POST 调用',
      pipelineVersion: PIPELINE_VERSION,
      referenceUpload: { enabled: Boolean(referenceSigningKey()), maxBytes: referenceUpload.MAX_BYTES },
      outputFormats: ['transparent-png'],
      poses: Object.keys(POSES).map(function (key) { return { key: key, label: POSES[key].label } }),
      models: listModels(setting),
      defaultModel: setting.defaultModel,
      allowUserChoice: setting.allowUserChoice
    })
  }

  if (body.action === 'prepareReference' || body.action === 'cancelReference') {
    if (!adminTool && !registrationContext) return reply(403, { success: false, error: '高清生图工具需要已验证会话' })
    if (body.action === 'prepareReference' && rateLimited()) return reply(429, { success: false, error: '上传过于频繁，请稍后再试' })
    const secret = referenceSigningKey()
    if (!secret) return reply(503, { success: false, error: '高清上传暂不可用，请稍后重试' })
    try {
      const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 15000 })
      if (body.action === 'cancelReference') {
        await referenceUpload.cancel(app, secret, body.ticket, registrationContext ? registrationContext.sessionId : '')
        return reply(200, { success: true })
      }
      return reply(200, { success: true, data: await referenceUpload.initiate(app, secret, body.bytes, registrationContext ? registrationContext.sessionId : '') })
    } catch (error) {
      return reply(400, { success: false, error: '参考图上传未完成，请重新选择照片后重试' })
    }
  }

  if (!adminTool && !registrationContext && (body.transparentOutput || body.referenceTicket || body.preserveOriginal)) {
    return reply(403, { success: false, error: '透明球衣照工具仅限平台后台使用' })
  }

  if ((body.action && body.action !== 'generate') || (!body.action && !body.pose && !body.photo && !body.jerseyPreset)) {
    return reply(400, { success: false, error: '生图请求无效，请重新提交' })
  }

  // 模型先解析：前端只能传后端目录里的 key，停用/未开通的直接拒绝
  const setting = await readModelSetting()
  const picked = resolveModel(setting, body.model)
  if (!picked.key) {
    // 客户点了后台停用/未开通的模型也记一条，后台才能看出“有人想用但没开通”
    await logUsage({
      model: String(body.model || ''),
      modelLabel: (MODEL_CATALOG[String(body.model || '')] || {}).label || String(body.model || ''),
      success: false,
      error: picked.error,
      at: Date.now()
    })
    return reply(400, { success: false, error: picked.error, models: listModels(setting) })
  }
  const modelKey = picked.key
  const modelMeta = MODEL_CATALOG[modelKey]

  const poseKey = String(body.pose || 'front')
  if (!POSES[poseKey]) return reply(400, { success: false, error: '不支持的姿势预设' })

  if (rateLimited()) {
    return reply(429, { success: false, error: '这一分钟生成次数过多，请稍后再试' })
  }

  // jerseyPreset：前端选的是纯色样板（颜色由用户明确指定，不做“取色失败”兜底）
  const jerseyPreset = body.jerseyPreset === true
  const jerseyColor = normalizeColor(body.jerseyColor, jerseyPreset)
  let photo = (typeof body.photo === 'string' &&
    /^data:image\/(png|jpeg|webp);base64,/.test(body.photo) &&
    body.photo.length < 1200000) ? body.photo : ''
  if (body.referenceTicket) {
    try {
      photo = await referenceUpload.consume(tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 20000 }), referenceSigningKey(), body.referenceTicket, registrationContext ? registrationContext.sessionId : '')
    } catch (error) {
      return reply(400, { success: false, error: '参考图读取失败或已过期，请重新上传后生成' })
    }
  }
  if (body.photo && !photo) return reply(400, { success: false, error: '参考图无效，请重新上传后生成' })
  // jerseyRef：前端已把“人脸 + 球衣图”拼成一张参考板，提示词改走球衣款式迁移；
  // jerseyText：用户明确要求 AI 尝试还原球衣上的文字/号码（默认留空，交给后期模板叠字）
  const jerseyRef = Boolean(photo) && body.jerseyRef === true
  const jerseyText = jerseyRef && body.jerseyText === true
  // jerseyStyle：纯色样板款式（plain/raglan/striped），只在没有球衣参考图时生效
  const jerseyStyle = JERSEY_STYLES[String(body.jerseyStyle || '')] ? String(body.jerseyStyle) : 'plain'
  // 纯白球衣在纯白背景上容易糊成一片，提示词补一句“保留轻微投影和清晰边缘”
  const lightJersey = Boolean(jerseyColor) && jerseyColor.indexOf('纯白色') === 0
  // 体型：身高体重折算成比例描述写进提示词（数值不合法就当没填，跟参考照片真实身材走）
  const bodyProfile = readBodyProfile(body)
  const bodyText = bodyPrompt(bodyProfile)
  // 提示词按是否真的有参考图分支：只有走图生图时才要求“保持同一张脸”
  const prompt = buildPrompt(poseKey, jerseyColor, Boolean(jerseyColor), Boolean(photo), jerseyRef, jerseyText, jerseyStyle, lightJersey, bodyText)
  const aspectRatio = ['3:4', '1:1', '4:3'].indexOf(String(body.aspectRatio || '')) >= 0
    ? String(body.aspectRatio)
    : '3:4'
  // jerseyMode 也进用量记录：便于后台区分“纯色样板 / 取色 / 球衣参考图”各占多少
  const jerseyMode = jerseyRef ? 'reference' : (jerseyPreset && jerseyColor ? 'preset' : (jerseyColor ? 'color' : 'none'))
  const startedAt = Date.now()
  // 目录里只剩付费的 3.5 与 Seedream；两个都是同步接口、一次只出 1 张
  const isHunyuan35 = modelKey === 'hunyuan35'
  let mode = 'text2image'

  try {
    let urls = []
    if (modelKey === 'seedream5flash') {
      urls = [await requestSeedreamImage(prompt, photo, aspectRatio)]
      mode = photo ? 'reference' : 'text2image'
    } else if (modelKey === 'seedream45') {
      urls = [await requestSeedream45Image(prompt, photo, aspectRatio)]
      mode = photo ? 'reference' : 'text2image'
    } else if (isHunyuan35) {
      urls = [await requestHunyuan35Image(prompt, photo)]
      mode = photo ? 'reference' : 'text2image'
    }
    const images = []
    let outputInfo = null
    let composed = false
    for (let i = 0; i < urls.length; i++) {
      // The quality-comparison page requests the untouched model output.
      // Existing callers retain composition normalization for compatibility.
      const inline = await toInlineImage(urls[i], body.preserveOriginal === true, body.transparentOutput === true)
      outputInfo = inline
      images.push(inline.inline)
      if (inline.composed) composed = true
    }
    const durationMs = Date.now() - startedAt
    const generatedPortraitId = registrationContext
      ? await registrationPortrait.save(tcb.init({ env: tcb.SYMBOL_CURRENT_ENV, timeout: 15000 }), registrationContext, images[0], modelKey)
      : undefined
    await logUsage({
      model: modelKey,
      modelLabel: modelMeta.label,
      mode: mode,
      pose: poseKey,
      poseLabel: POSES[poseKey].label,
      jerseyMode: jerseyMode,
      images: images.length,
      success: true,
      durationMs: durationMs,
      error: '',
      at: startedAt
    })
    return reply(200, {
      success: true,
      data: {
        image: images[0],
        generatedPortraitId,
        images: body.transparentOutput === true ? undefined : images,
        mode: mode,
        jerseyMode: jerseyMode,
        jerseyStyle: jerseyStyle,
        jerseyStyleLabel: JERSEY_STYLES[jerseyStyle].label,
        jerseyTextMode: jerseyText ? 'ai' : 'blank',
        pose: poseKey,
        poseLabel: POSES[poseKey].label,
        model: modelKey,
        modelLabel: modelMeta.label,
        modelMode: 'sync',
        pipelineVersion: PIPELINE_VERSION,
        originalPreserved: body.preserveOriginal === true && body.transparentOutput !== true,
        transparent: body.transparentOutput === true,
        mimeType: body.transparentOutput === true ? 'image/png' : undefined,
        outputWidth: outputInfo && outputInfo.width,
        outputHeight: outputInfo && outputInfo.height,
        // 目录里已全是不烧角标的模型：3.5 不传 footnote 就没有水印，Seedream 源头已关。
        // 保留这个字段（恒为 none），前端按 watermark !== 'none' 决定是否裁角标的逻辑不用改。
        watermark: 'none',
        // 是否做过服务端构图归一（白底补边 + 居中），便于页面排查「人物偏了」到底是不是归一没生效
        compositionNormalized: composed,
        // 体型只回标签（偏瘦/匀称/偏胖…）供页面回显，不回身高体重数值
        bodyType: bodyProfile.type,
        bodyLabel: bodyProfile.label,
        durationMs: durationMs,
        prompt: prompt
      }
    })
  } catch (error) {
    const detail = String((error && (error.message || error)) || '').slice(0, 200)
    console.error('[aiPortraitDemo] 生成失败:', detail)
    await logUsage({
      model: modelKey,
      modelLabel: modelMeta.label,
      mode: mode,
      pose: poseKey,
      poseLabel: POSES[poseKey].label,
      jerseyMode: jerseyMode,
      success: false,
      durationMs: Date.now() - startedAt,
      error: detail,
      at: startedAt
    })
    return reply(502, {
      success: false,
      error: '本次生成失败，请稍后重试',
      detail: detail
    })
  }
}

// 仅用于本地单测构图归一，不供外部调用（HTTP 分支不会走到这里）。
exports.__composeInternals = { decodeImage, subjectBox, normalizeComposition, normalizeImageBuffer, whitenBackground }
exports.__modelInternals = { defaultModelSetting, resolveModel, listModels, adminModelList }
