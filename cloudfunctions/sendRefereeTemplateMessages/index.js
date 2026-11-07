const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const CONFIG = {
  // ---- 小程序订阅消息（执裁安排，唯一在用通道）----
  // 选用模板：「赛程任务提醒」，类目「体育场馆服务」，用途即赛程任务提醒，与裁判排班场景一致，
  // 合规风险低。不要再改用「比赛报名成功通知」等报名类模板（用途不一致，会被判超范围使用）。
  miniTemplateId: process.env.SXF_FOOTBALL_MINI_TEMPLATE_REFEREE_ASSIGN || '',
  miniPage: process.env.SXF_FOOTBALL_MINI_REFEREE_PAGE || 'pages/referee/match/match?matchId=',
  miniState: process.env.SXF_FOOTBALL_MINI_MESSAGE_STATE || 'formal',
  miniAppId: process.env.MINI_PROGRAM_APP_ID || '',
  miniAppSecret: process.env.MINI_PROGRAM_APP_SECRET || '',
  // 中转调用验签密钥：沿用既有服务号 AppSecret 契约（调用方按此签名），不要改成小程序 AppSecret。
  relaySecret: process.env.SERVICE_ACCOUNT_APP_SECRET || process.env.MINI_PROGRAM_APP_SECRET || '',
  // ---- 认领催办并入同一条模板，不另开模板 ----
  // 场景差异不体现在卡片上，统一由点击跳转的执裁页承载。
  // ---- 以下为回滚保留，正常流程不再读取、不再调用 ----
  // 服务号模板消息「比赛执裁安排通知」已被微信驳回（不属于服务结果凭证），template/send 路径已停用。
  legacyTemplateId: process.env.SERVICE_ACCOUNT_REFEREE_TEMPLATE_ID || '',
  legacyTournamentKey: process.env.SERVICE_TEMPLATE_TOURNAMENT_KEY || 'thing1',
  legacyMatchKey: process.env.SERVICE_TEMPLATE_MATCH_KEY || 'thing2',
  legacyTimeKey: process.env.SERVICE_TEMPLATE_TIME_KEY || 'time3',
  legacyRoleKey: process.env.SERVICE_TEMPLATE_ROLE_KEY || 'thing4',
  h5Url: process.env.SERVICE_ACCOUNT_H5_URL || 'https://www.sxffootball.cn/service-account-h5/'
}

// 模板只有 5 个关键词位（提交后不可改），不做场景文案矩阵：
// 卡片统一显示「赛事名称 / 对阵名称 / 比赛时间 / 台号 / 任务类型」，
// 改派、改时间、催办等差异一律靠点开跳转到执裁页查看，任务类型只填执裁角色，不拼任何变更说明。
// 线上真实模板「赛程任务提醒」（ID UZuVWG1y4IWuDaxiDpj-REcDAjA35EeG3B-ZLqbqo9A）的 5 个关键词位。
// 默认值已写成真实 key，不配环境变量也能发对；环境变量仅作覆盖手段。
// 硬限制：thing≤20 字、short_thing≤5 字、time 严格 yyyy-MM-dd HH:mm、number 只能整数。
const MINI_FIELD_MAP = [
  { field: '赛事名称', env: 'SXF_FOOTBALL_MINI_REF_TOURNAMENT_KEY', defaultKey: 'thing5', kind: 'thing', required: true,
    resolve: notification => text(notification.tournamentName, 20) },
  { field: '对阵名称', env: 'SXF_FOOTBALL_MINI_REF_TEAMS_KEY', defaultKey: 'thing6', kind: 'thing', required: true,
    resolve: notification => text(notification.teamsText, 20) },
  { field: '比赛时间', env: 'SXF_FOOTBALL_MINI_REF_TIME_KEY', defaultKey: 'time2', kind: 'time', required: true,
    resolve: notification => text(notification.matchTimeText, 32) },
  { field: '台号', env: 'SXF_FOOTBALL_MINI_REF_VENUE_KEY', defaultKey: 'number7', kind: 'number', required: true,
    // 保留原始场地名（不预先截断），保证 lastError 里记的是「原值」，也避免截断把数字切丢。
    resolve: notification => String((notification && notification.venue) == null ? '' : notification.venue).trim() },
  { field: '任务类型', env: 'SXF_FOOTBALL_MINI_REF_ROLE_KEY', defaultKey: 'short_thing3', kind: 'short', required: true,
    resolve: notification => text(notification.roleLabel, 20) }
]

// number7 只能整数：从「3号场地」「1号场」「场地2」里取数字；
// 取不到或越界一律填 0 并留痕，绝不因为台号解析失败丢掉整条通知。
const VENUE_NUMBER_MIN = 0
const VENUE_NUMBER_MAX = 999999

function parseVenueNumber(raw) {
  const match = String(raw || '').match(/\d+/)
  if (!match) return null
  const parsed = parseInt(match[0], 10)
  if (!Number.isFinite(parsed) || parsed < VENUE_NUMBER_MIN || parsed > VENUE_NUMBER_MAX) return null
  return parsed
}

// short_thing3 只能 5 个字：角色先映射成短标签，仍超长就截断，不让接口报错。
// 覆盖 refereeMode 里的全部岗位 label（主裁判/第一助理裁判/第二助理裁判/第四官员/第二裁判/第三裁判/计时员/记录员）
// 以及认领、催办、本场负责人等特殊场景；映射是正常行为，只有真的截断才留痕。
const ROLE_SHORT = {
  主裁判: '主裁',
  裁判员: '裁判',
  第一助理裁判: '边裁',
  第二助理裁判: '边裁',
  助理裁判: '边裁',
  边裁: '边裁',
  第四官员: '第四官员',
  第二裁判: '第二裁判',
  第三裁判: '第三裁判',
  计时员: '计时员',
  记录员: '记录员',
  本场操作负责人: '负责人',
  赛事临时裁判认领: '认领',
  临时裁判认领: '认领',
  裁判登记催办: '催办',
  催办: '催办'
}

function shortenRole(raw) {
  const source = String(raw == null ? '' : raw).trim()
  if (!source) return { value: '', truncated: false }
  const mapped = ROLE_SHORT[source] || source
  const value = text(mapped, 5).trim()
  return { value, truncated: value !== mapped }
}

function getConfigurationStatus() {
  const missing = []
  if (!CONFIG.miniTemplateId) missing.push('SXF_FOOTBALL_MINI_TEMPLATE_REFEREE_ASSIGN')
  return { configured: missing.length === 0, missing }
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(-11)
}

function text(value, maxLength) {
  return String(value == null ? '' : value).slice(0, maxLength || 20)
}

function value(content, maxLength) {
  // 截断后去掉尾部空白，避免「…足球队 」这种以空格结尾的卡片文案。
  return { value: text(content, maxLength).trim() }
}

// 订阅消息 time 类型只接受日期时间字符串，统一成 yyyy-MM-dd HH:mm。
function timeValue(content) {
  const raw = String(content || '').trim()
  const match = raw.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日\sT]*(\d{1,2})?:?(\d{2})?/)
  if (match) {
    const pad = number => String(number).padStart(2, '0')
    return value(match[1] + '-' + pad(match[2]) + '-' + pad(match[3]) + ' ' + pad(match[4] || '0') + ':' + pad(match[5] || '0'))
  }
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    const pad = number => String(number).padStart(2, '0')
    return value(parsed.getFullYear() + '-' + pad(parsed.getMonth() + 1) + '-' + pad(parsed.getDate()) + ' ' + pad(parsed.getHours()) + ':' + pad(parsed.getMinutes()))
  }
  // 解析不出日期时间时返回空值，由 buildMiniData 判为缺字段放弃发送，绝不编造时间发给裁判。
  return value('')
}

function notificationPage(notification, basePath) {
  const matchId = text(notification && notification.matchId, 64)
  if (!basePath) return 'pages/todo/index'
  if (basePath.indexOf('?') >= 0) return matchId ? basePath + encodeURIComponent(matchId) : 'pages/todo/index'
  return basePath
}

function hasValidRelayProof(event) {
  const phone = normalizePhone(event && event.phone)
  const timestamp = Number(event && event.__relayTimestamp)
  const signature = String(event && event.__relaySignature || '').trim().toLowerCase()
  if (!CONFIG.relaySecret || !phone || !Number.isFinite(timestamp) || !signature) return false
  if (Math.abs(Date.now() - timestamp) > 60 * 1000) return false
  const expected = crypto.createHmac('sha256', CONFIG.relaySecret)
    .update(phone + '.' + String(timestamp))
    .digest('hex')
  const providedBuffer = Buffer.from(signature, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (error) { reject(new Error('微信接口返回异常')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('微信接口超时')))
  })
}

function httpsPost(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const target = new URL(url)
    const req = https.request({
      hostname: target.hostname,
      port: 443,
      path: target.pathname + target.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }
    }, response => {
      let result = ''
      response.on('data', chunk => { result += chunk })
      response.on('end', () => {
        try { resolve(JSON.parse(result)) } catch (error) { reject(new Error('微信接口返回异常')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('微信接口超时')))
    req.write(body); req.end()
  })
}

let miniTokenCache = { token: '', expiresAt: 0 }
async function getMiniAccessToken() {
  if (miniTokenCache.token && miniTokenCache.expiresAt > Date.now() + 60 * 1000) return miniTokenCache.token
  if (!CONFIG.miniAppId || !CONFIG.miniAppSecret) throw new Error('未配置小程序 AppID/AppSecret，无法走官方直连兜底')
  const result = await httpsGet('https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
    encodeURIComponent(CONFIG.miniAppId) + '&secret=' + encodeURIComponent(CONFIG.miniAppSecret))
  if (!result.access_token) throw new Error('获取小程序 access_token 失败：' + (result.errmsg || result.errcode || '未知错误'))
  miniTokenCache = { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 7200) * 1000 }
  return result.access_token
}

async function pendingNotifications(event) {
  if (event.notificationId) {
    try {
      const result = await db.collection('referee_notifications').doc(String(event.notificationId)).get()
      const record = Array.isArray(result.data) ? result.data[0] : result.data
      return record ? [record] : []
    } catch (error) { return [] }
  }
  const phone = normalizePhone(event.phone)
  if (!phone) return []
  const result = await db.collection('referee_notifications').where({
    phone,
    status: _.in(['pending', 'awaiting_binding', 'quota_exhausted', 'data_missing', 'configuration_required', 'failed'])
  }).limit(20).get()
  return result.data || []
}

// 订阅消息的 touser 必须是小程序 openid。
// referees.wechatWorkflowOpenId 来源是 cloud.getWXContext().OPENID（小程序 openid），
// 历史数据里可能带 "service:" 前缀，这里统一剥掉；miniOpenId 优先。
function miniOpenIdOf(referee) {
  if (!referee) return ''
  const direct = text(referee.miniOpenId, 64).trim()
  if (direct) return direct
  return text(referee.wechatWorkflowOpenId, 64).trim().replace(/^service:/, '')
}

async function loadReferee(notification) {
  const refereeId = text(notification && notification.refereeId, 64)
  if (refereeId) {
    try {
      const result = await db.collection('referees').doc(refereeId).get()
      const record = Array.isArray(result.data) ? result.data[0] : result.data
      if (record) return record
    } catch (error) {}
  }
  const phone = normalizePhone(notification && notification.phone)
  if (!phone) return null
  const result = await db.collection('referees').where(_.or([{ phone }, { phoneNumber: phone }])).limit(5).get()
  const list = result.data || []
  return list.find(item => miniOpenIdOf(item)) || list[0] || null
}

function notificationPatch(notificationId, data) {
  return db.collection('referee_notifications').doc(notificationId).update({
    data: Object.assign({ updateTime: db.serverDate() }, data)
  })
}

// 微信订阅消息发送：优先云调用，access_token 失效时按官方接口兜底（与报名通知同一写法）。
async function sendSubscribeMessage(payload) {
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: payload.touser,
      templateId: payload.templateId,
      page: payload.page,
      data: payload.data
    })
    const code = Number((result && (result.errCode != null ? result.errCode : result.errcode)) || 0)
    if (code) return { code, errmsg: text(result.errMsg || result.errmsg || '小程序订阅消息发送失败', 120) }
    return { code: 0, errmsg: 'ok', via: 'cloud' }
  } catch (error) {
    const firstCode = text(error.errCode || error.code || 'MINI_SEND_FAILED', 40)
    const firstMessage = text(error.message || error.errMsg || '小程序订阅消息发送失败', 120)
    const tokenInvalid = firstCode === '-501001' || /invalid wx openapi access_token|INVALID_WX_ACCESS_TOKEN/i.test(firstMessage)
    if (!tokenInvalid) return { code: firstCode, errmsg: firstMessage }
    const accessToken = await getMiniAccessToken()
    const result = await httpsPost('https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + encodeURIComponent(accessToken), {
      touser: payload.touser,
      template_id: payload.templateId,
      page: payload.page,
      miniprogram_state: CONFIG.miniState,
      lang: 'zh_CN',
      data: payload.data
    })
    return { code: Number(result.errcode || 0), errmsg: text(result.errmsg || 'ok', 120), via: 'direct' }
  }
}

// 43101：用户未订阅/已拒收；40003：openid 无效；47003：模板参数不合法。
function quotaStateOf(code, errmsg) {
  if (String(code) === '43101') return { status: 'quota_exhausted', reason: '裁判未订阅或已取消执裁提醒' }
  if (String(code) === '40003') return { status: 'awaiting_binding', reason: '裁判小程序身份无效，需重新进入工作台' }
  if (String(code) === '47003') return { status: 'configuration_required', reason: '模板字段与代码映射不一致：' + errmsg }
  return null
}

// 按集中映射表生成订阅消息 data；必填字段取不到值时返回 missing，由调用方记 data_missing 并放弃发送，
// 避免把空值发给微信导致 47003 整条失败（time 类型尤其不接受空字符串）。
function buildMiniData(notification) {
  const data = {}
  const missing = []
  const warnings = []
  MINI_FIELD_MAP.forEach(item => {
    const key = text(process.env[item.env] || item.defaultKey, 32)
    const raw = item.resolve(notification)
    if (item.kind === 'number') {
      // 台号永不阻塞发送：解析失败或越界一律填 0，只留痕。
      const parsed = parseVenueNumber(raw)
      if (parsed === null) warnings.push('venue_unparsed:' + (raw || '(空)'))
      data[key] = { value: parsed === null ? 0 : parsed }
      return
    }
    if (!raw) {
      if (item.required) missing.push(item.field)
      return
    }
    if (item.kind === 'time') {
      const converted = timeValue(raw)
      if (!converted.value) {
        if (item.required) missing.push(item.field)
        return
      }
      data[key] = converted
      return
    }
    if (item.kind === 'short') {
      // short_thing 只能 5 个字：短标签映射 + 截断双保险。
      const shortened = shortenRole(raw)
      if (!shortened.value) {
        if (item.required) missing.push(item.field)
        return
      }
      if (shortened.truncated) warnings.push('role_truncated:' + raw + '->' + shortened.value)
      data[key] = value(shortened.value, 5)
      return
    }
    data[key] = value(raw, 20)
  })
  return { data, missing, warnings }
}

async function sendOne(notification) {
  if (!notification || notification.status === 'sent' || notification.status === 'cancelled') return { skipped: true }
  const configuration = getConfigurationStatus()
  if (!configuration.configured) {
    await notificationPatch(notification._id, {
      status: 'configuration_required',
      notifyChannel: 'mini_subscribe',
      lastError: '未配置执裁安排订阅消息模板 ID（' + configuration.missing.join('、') + '）'
    })
    return { configured: false }
  }
  const referee = await loadReferee(notification)
  const touser = miniOpenIdOf(referee)
  if (!touser) {
    await notificationPatch(notification._id, {
      status: 'awaiting_binding',
      notifyChannel: 'mini_subscribe',
      lastError: '裁判尚未在小程序登录过，无法取得订阅消息 openid'
    })
    return { bound: false }
  }
  if (referee && referee.notificationDisabled === true) {
    await notificationPatch(notification._id, { status: 'cancelled', notifyChannel: 'mini_subscribe', lastError: '裁判已关闭通知' })
    return { disabled: true }
  }
  // 额度按模板维度记账：refereeNotifyQuota 只对 refereeNotifyTemplateId 标示的那条模板有效，
  // 换模板后旧额度自动失效，避免不同模板互相串用（小程序订阅消息模板配额只有 5 条）。
  const quotaTemplateId = text(referee && referee.refereeNotifyTemplateId, 64)
  const quotaUsable = !quotaTemplateId || quotaTemplateId === CONFIG.miniTemplateId
  const quotaBefore = quotaUsable ? Math.max(0, Number(referee && referee.refereeNotifyQuota) || 0) : 0
  if (quotaBefore <= 0) {
    await notificationPatch(notification._id, {
      status: 'quota_exhausted',
      notifyChannel: 'mini_subscribe',
      quotaBefore,
      quotaAfter: 0,
      lastError: '裁判提醒额度为 0，需其在小程序待办页再次开启执裁提醒'
    })
    return { quotaExhausted: true }
  }
  const built = buildMiniData(notification)
  if (built.missing.length) {
    await notificationPatch(notification._id, {
      status: 'data_missing',
      notifyChannel: 'mini_subscribe',
      quotaBefore,
      quotaAfter: quotaBefore,
      lastError: '模板字段取不到值：' + built.missing.join('、')
    })
    return { sent: false, status: 'data_missing', missing: built.missing }
  }
  const data = built.data
  const result = await sendSubscribeMessage({
    touser,
    templateId: CONFIG.miniTemplateId,
    page: notificationPage(notification, CONFIG.miniPage),
    data
  })
  if (result.code) {
    const state = quotaStateOf(result.code, result.errmsg)
    if (state) {
      await notificationPatch(notification._id, {
        status: state.status,
        notifyChannel: 'mini_subscribe',
        notifyChannelVia: result.via || 'cloud',
        quotaBefore,
        quotaAfter: quotaBefore,
        lastError: state.reason
      })
      return { sent: false, status: state.status, errorCode: String(result.code), message: state.reason }
    }
    throw new Error('订阅消息发送失败：' + (result.errmsg || result.code))
  }
  const quotaAfter = quotaBefore > 0 ? quotaBefore - 1 : 0
  await notificationPatch(notification._id, {
    status: 'sent',
    notifyChannel: 'mini_subscribe',
    notifyChannelVia: result.via || 'cloud',
    msgId: text(result.msgid || result.msg_id || '', 64),
    quotaBefore,
    quotaAfter,
    sentAt: db.serverDate(),
    // 台号解析失败等降级痕迹写进 lastError 供审计，状态仍是 sent：通知必须送达。
    lastError: built.warnings.length ? built.warnings.join(';') : ''
  })
  if (referee && referee._id && quotaBefore > 0) {
    await db.collection('referees').doc(referee._id).update({
      data: { refereeNotifyQuota: quotaAfter, refereeNotifyTemplateId: CONFIG.miniTemplateId, refereeNotifyLastSentAt: db.serverDate(), updateTime: db.serverDate() }
    }).catch(() => {})
  }
  return { sent: true, quotaAfter }
}

// 认领催办并入同一条「赛程任务提醒」模板：不另开模板，把催办数据映射成 5 个字段后复用 sendOne。
// 催办对象往往还没有比赛信息，缺字段时由 sendOne 记 data_missing，不会发出空值。
function reminderAsNotification(notification) {
  const refereeName = text(notification.refereeName, 20)
  return Object.assign({}, notification, {
    teamsText: refereeName ? text(refereeName + ' 裁判登记', 20) : '裁判登记',
    matchTimeText: text(notification.submittedTimeText || notification.matchTimeText, 32),
    venue: text(notification.venue || '线上办理', 20),
    roleLabel: '催办'
  })
}

exports.main = async event => {
  const configuration = getConfigurationStatus()
  if (event && event.action === 'configurationStatus') {
    return { success: true, configured: configuration.configured, missingConfig: configuration.missing, results: [] }
  }
  if (!hasValidRelayProof(event)) {
    return { success: false, configured: configuration.configured, missingConfig: configuration.missing, results: [], error: '通知发送仅允许服务端中转调用', code: 'INTERNAL_RELAY_REQUIRED' }
  }
  const notifications = await pendingNotifications(event || {})
  const results = []
  for (const notification of notifications) {
    try {
      // 全部场景共用同一条模板，催办只做字段映射，不再走独立模板。
      const target = notification.templateType === 'referee_claim_reminder'
        ? reminderAsNotification(notification)
        : notification
      const sendResult = await sendOne(target)
      results.push({ notificationId: notification._id, ...sendResult })
    } catch (error) {
      console.error('[sendRefereeTemplateMessages] send failed:', notification._id, error)
      await notificationPatch(notification._id, { status: 'failed', lastError: error.message }).catch(() => {})
      results.push({ notificationId: notification._id, sent: false, error: error.message })
    }
  }
  return { success: true, configured: configuration.configured, missingConfig: configuration.missing, results }
}
