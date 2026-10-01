const crypto = require('crypto')
const https = require('https')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const CLAIM_TTL_MS = 48 * 60 * 60 * 1000
const ACTIVE_CLAIM_STATUS = 'claimed'
const ROSTER_READY_STATUS = ['approved', 'confirmed', 'locked']
const REFEREE_EVENT_TYPES = ['goal', 'penalty_scored', 'penalty_missed', 'own_goal', 'yellow_card', 'red_card', 'second_yellow_red', 'substitution', 'stoppage_time', 'other']

const OCR_HOST = 'ocr.tencentcloudapi.com'
const OCR_SERVICE = 'ocr'
const OCR_VERSION = '2018-11-19'

function hmacSha256(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest()
}

function tc3Authorization(secretId, secretKey, timestamp, payload) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const canonicalHeaders = 'content-type:application/json; charset=utf-8\nhost:' + OCR_HOST + '\n'
  const signedHeaders = 'content-type;host'
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n')
  const credentialScope = date + '/' + OCR_SERVICE + '/tc3_request'
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n')
  const dateKey = hmacSha256('TC3' + secretKey, date)
  const serviceKey = hmacSha256(dateKey, OCR_SERVICE)
  const signingKey = hmacSha256(serviceKey, 'tc3_request')
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  return 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature
}

function callTencentOcr(action, requestData) {
  return new Promise(function(resolve, reject) {
    const explicitSecretId=process.env.OCR_SECRET_ID||''
    const explicitSecretKey=process.env.OCR_SECRET_KEY||''
    const secretId = explicitSecretId || process.env.TENCENTCLOUD_SECRETID || process.env.TENCENT_SECRET_ID || ''
    const secretKey = explicitSecretKey || process.env.TENCENTCLOUD_SECRETKEY || process.env.TENCENT_SECRET_KEY || ''
    const sessionToken = explicitSecretId&&explicitSecretKey?'':(process.env.TENCENTCLOUD_SESSIONTOKEN || '')
    if (!secretId || !secretKey) return reject(Object.assign(new Error('OCR云函数临时凭据不可用'), { code: 'OCR_CREDENTIAL_MISSING' }))
    const payload = JSON.stringify(requestData || {})
    const timestamp = Math.floor(Date.now() / 1000)
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      Host: OCR_HOST,
      'X-TC-Action': action,
      'X-TC-Version': OCR_VERSION,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': process.env.TENCENTCLOUD_REGION || 'ap-shanghai',
      Authorization: tc3Authorization(secretId, secretKey, timestamp, payload)
    }
    if (sessionToken) headers['X-TC-Token'] = sessionToken
    const request = https.request({ hostname: OCR_HOST, port: 443, path: '/', method: 'POST', headers }, function(response) {
      let body = ''
      response.on('data', function(chunk) { body += chunk })
      response.on('end', function() {
        try {
          const parsed = JSON.parse(body)
          const result = parsed.Response || {}
          if (result.Error) {
            const error = new Error(result.Error.Message || '腾讯云OCR识别失败')
            error.code = result.Error.Code || 'OCR_API_ERROR'
            return reject(error)
          }
          resolve(result)
        } catch (error) {
          reject(Object.assign(new Error('OCR返回结果解析失败'), { code: 'OCR_RESPONSE_INVALID' }))
        }
      })
    })
    request.setTimeout(18000, function() { request.destroy(Object.assign(new Error('OCR识别超时，请重试'), { code: 'OCR_TIMEOUT' })) })
    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

function callAccurateOcr(imageBase64) {
  return callTencentOcr('GeneralAccurateOCR',{ImageBase64:imageBase64})
}

function callHandwritingOcr(imageBase64) {
  return callTencentOcr('GeneralHandwritingOCR',{ImageBase64:imageBase64,EnableWordPolygon:false,EnableDetectText:true})
}

function callCardRiskDetection(imageBase64) {
  return callTencentOcr('RecognizeGeneralCardWarn',{ImageBase64:imageBase64,CardType:'General'})
}

function callSealOcr(imageBase64) {
  return callTencentOcr('SealOCR',{ImageBase64:imageBase64,EnablePdf:false})
}

function fullWidthToHalf(text) {
  return String(text || '').replace(/[０-９]/g, function(char) { return String(char.charCodeAt(0) - 65248) })
}

function detectionBox(item) {
  const polygon = Array.isArray(item.Polygon) ? item.Polygon : []
  const box = item.ItemPolygon || {}
  const xs = polygon.map(function(point) { return Number(point.X || 0) })
  const ys = polygon.map(function(point) { return Number(point.Y || 0) })
  const x = xs.length ? Math.min.apply(null, xs) : Number(box.X || 0)
  const y = ys.length ? Math.min.apply(null, ys) : Number(box.Y || 0)
  const height = ys.length ? Math.max(8, Math.max.apply(null, ys) - y) : Math.max(8, Number(box.Height || 18))
  return { x, y, height }
}

function ocrRows(detections) {
  const items = (Array.isArray(detections) ? detections : []).map(function(item) {
    const box = detectionBox(item || {})
    return { text: fullWidthToHalf(item && item.DetectedText).trim(), confidence: Number(item && item.Confidence || 0), x: box.x, y: box.y, height: box.height }
  }).filter(function(item) { return item.text })
  items.sort(function(a, b) { return a.y === b.y ? a.x - b.x : a.y - b.y })
  const rows = []
  items.forEach(function(item) {
    let row = rows.find(function(candidate) { return Math.abs(candidate.y - item.y) <= Math.max(candidate.height, item.height) * 0.65 })
    if (!row) { row = { y: item.y, height: item.height, items: [] }; rows.push(row) }
    row.items.push(item)
    row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length
    row.height = Math.max(row.height, item.height)
  })
  return rows.sort(function(a, b) { return a.y - b.y }).map(function(row) {
    row.items.sort(function(a, b) { return a.x - b.x })
    return { text: row.items.map(function(item) { return item.text }).join(' ').replace(/\s+/g, ' ').trim(), confidence: Math.round(row.items.reduce(function(sum, item) { return sum + item.confidence }, 0) / row.items.length) }
  })
}

function parseRosterRows(rows, side) {
  let role = 'starter'
  const players = []
  const seen = {}
  ;(rows || []).forEach(function(row) {
    let text = fullWidthToHalf(row.text).replace(/[|｜]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return
    if (/替补|后备/.test(text)) { role = 'substitute'; return }
    if (/首发|先发|上场名单/.test(text)) { role = 'starter'; return }
    if (/教练|领队|队医|工作人员|比赛时间|球队名称|号码.*姓名|姓名.*号码/.test(text)) return
    let number = ''
    let name = ''
    let match = text.match(/(?:^|\s)(\d{1,3})\s*(?:号|#|[-—:：、,.，])?\s*([\u3400-\u9fff·]{2,12})(?:\s|$)/)
    if (match) { number = match[1]; name = match[2] }
    if (!match) {
      match = text.match(/(?:^|\s)([\u3400-\u9fff·]{2,12})\s*(?:[-—:：、,.，])?\s*(\d{1,3})(?:号)?(?:\s|$)/)
      if (match) { name = match[1]; number = match[2] }
    }
    if (!name) return
    number = String(Math.min(999, Math.max(0, Number(number)))).replace(/^NaN$/, '')
    const key = number + '|' + name
    if (seen[key]) return
    seen[key] = true
    players.push({ id: 'ocr-' + side + '-' + (players.length + 1), jerseyNumber: number, name: name, role: role, confidence: Number(row.confidence || 0) })
  })
  return players
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function matchPassSecret() { return String(process.env.SXF_MATCH_PASS_SECRET || '').trim() }
function matchPassSignature(passId) { return crypto.createHmac('sha256', matchPassSecret()).update('football:adult-match-pass:' + String(passId)).digest('base64url').slice(0,32) }

async function validateAdultMatchPass(rawToken, match, side, expectedPlayerId) {
  const token = String(rawToken || '').trim()
  const parts = token.split('.')
  if (!matchPassSecret() || parts.length !== 3 || parts[0] !== 'SXFMP1') return { success:false, error:fail('电子参赛证无效或签名服务未配置', 'ADULT_MATCH_PASS_INVALID') }
  const expected = matchPassSignature(parts[1])
  const actualBuffer = Buffer.from(parts[2]), expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return { success:false, error:fail('电子参赛证签名无效', 'ADULT_MATCH_PASS_TAMPERED') }
  const result = await db.collection('adult_match_passes').doc(parts[1]).get()
  const pass = docData(result)
  if (!pass || pass.status !== 'active' || (valueToTime(pass.expiresAt || pass.expireAt) > 0 && valueToTime(pass.expiresAt || pass.expireAt) < Date.now())) return { success:false, error:fail('电子参赛证已过期或已撤销', 'ADULT_MATCH_PASS_EXPIRED') }
  if (String(pass.matchId || '') !== String(match._id || '') || String(pass.side || '') !== side) return { success:false, error:fail('该电子参赛证不属于本场或本队', 'ADULT_MATCH_PASS_SCOPE_INVALID') }
  if (expectedPlayerId && String(pass.playerId || '') !== String(expectedPlayerId)) return { success:false, error:fail('电子参赛证与当前球员不一致', 'ADULT_MATCH_PASS_PLAYER_MISMATCH') }
  return { success:true, pass }
}

async function authenticateRefereeH5Session(token) {
  const rawToken = String(token || '').trim()
  if (!rawToken) return null
  const result = await db.collection('referee_h5_sessions').where({
    tokenHash: hashSessionToken(rawToken),
    active: true,
    expiresAt: _.gt(new Date())
  }).limit(2).get()
  const sessions = listData(result)
  if (sessions.length !== 1 || !sessions[0].workflowOpenId) return null
  db.collection('referee_h5_sessions').doc(sessions[0]._id).update({
    data: { lastUsedAt: db.serverDate() }
  }).catch(function() {})
  return sessions[0]
}

function ok(data, message) {
  return { success: true, message: message || '操作成功', data: data || {} }
}

function fail(message, code) {
  return { success: false, message: message || '操作失败', code: code || 'WORKFLOW_ERROR' }
}

function publicWorkflowError(error) {
  const code=String(error&&error.code||'')
  const message=String(error&&error.message||'')
  if(/UnauthorizedOperation|AuthFailure/i.test(code)||/not authorized|no permission|CAM policies/i.test(message))return fail('裁判证已上传，但自动识别服务尚未获得腾讯云 OCR 权限。请先手动核对填写姓名、等级和证书编号。','OCR_PERMISSION_REQUIRED')
  if(/LimitExceeded|RequestLimitExceeded|FailedOperation\.ServiceIsolate/i.test(code))return fail('自动识别服务暂时繁忙，裁判证已保留，请稍后重试或手动填写。','OCR_SERVICE_BUSY')
  if(/database request fail|document\.(?:add|update):fail|DATABASE_REQUEST_FAILED|-5020\d+/i.test(message))return fail('裁判资料保存失败，请保留当前页面并稍后重试。','REFEREE_PROFILE_SAVE_FAILED')
  return fail(message||'服务异常，请稍后重试',code||'UNEXPECTED_ERROR')
}

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

function docData(result) {
  if (!result) return null
  if (Array.isArray(result.data)) return result.data[0] || null
  return result.data || null
}

function listData(result) {
  return result && Array.isArray(result.data) ? result.data : []
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-11)
}

function maskPhone(phone) {
  const value = normalizePhone(phone)
  if (value.length !== 11) return ''
  return value.slice(0, 3) + '****' + value.slice(7)
}

function valueToTime(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function isExpired(token) {
  const expireAt = valueToTime(token && token.expireAt)
  return expireAt > 0 && expireAt < Date.now()
}

function matchTeamId(match, side) {
  const direct = side === 'home' ? match.homeTeamId : match.awayTeamId
  const fallback = side === 'home' ? match.homeTeam : match.awayTeam
  if (direct) return direct
  if (fallback && typeof fallback === 'object') return fallback._id || fallback.teamId || ''
  return ''
}

function matchTeamName(match, side) {
  const direct = side === 'home' ? match.homeTeamName : match.awayTeamName
  const fallback = side === 'home' ? match.homeTeam : match.awayTeam
  if (direct) return direct
  if (fallback && typeof fallback === 'object') return fallback.name || fallback.teamName || ''
  if (typeof fallback === 'string' && fallback !== matchTeamId(match, side)) return fallback
  return ''
}

function matchTimeText(match) {
  const dateText = firstNonEmpty(match.matchDate, match.date, '')
  const timeValue = firstNonEmpty(match.matchTime, match.startTime, '')
  if (typeof timeValue === 'string') {
    if (dateText && timeValue.indexOf(dateText) !== 0) return (dateText + ' ' + timeValue).trim()
    return timeValue
  }
  const time = valueToTime(timeValue)
  if (!time) return dateText || '时间待定'
  const date = new Date(time + 8 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

function lineupField(side) {
  return side === 'home' ? 'homeLineup' : 'awayLineup'
}

function lineupStatusField(side) {
  return side === 'home' ? 'homeLineupStatus' : 'awayLineupStatus'
}

function lineupStatus(match, side) {
  const field = lineupStatusField(side)
  const lineup = match[lineupField(side)] || {}
  return firstNonEmpty(match[field], lineup.status, lineup.submitted ? 'submitted' : '', 'unclaimed')
}

function lineupStatusText(status) {
  const map = {
    unclaimed: '待认领',
    claimed: '已认领，待提交',
    pending: '待提交',
    returned: '已退回修改',
    submitted: '已提交，待核验',
    fourth_approved:'第四官员已初审',
    identity_check:'待助理裁判逐人核验',
    identity_verified:'身份核验完成',
    verified: '裁判已确认',
    locked: '名单已锁定'
  }
  return map[status] || '待处理'
}

function matchStatusText(status) {
  const map = {
    scheduled: '未开始',
    pending: '未开始',
    checked_in: '已签到',
    ongoing: '进行中',
    live: '进行中',
    finished: '已结束',
    completed: '已结束',
    postponed: '已延期',
    cancelled: '已取消'
  }
  return map[status] || '待处理'
}

async function buildExecutionSnapshot(match) {
  let tournament = null
  if (match && match.tournamentId) tournament = await getDoc('tournaments', match.tournamentId)
  return {
    matchId: String(match && match._id || ''),
    tournamentId: String(match && match.tournamentId || ''),
    divisionId: String(match && (match.divisionId || match.division || '') || 'default'),
    organizationId: String(match && (match.orgId || match.organizationId || '') || ''),
    planVersion: String(match && (match.competitionPlanVersion || match.planVersion) || tournament && (tournament.competitionPlanVersion || tournament.planVersion) || ''),
    homeTeamId: String(match && (match.homeTeamId || match.homeTeam && (match.homeTeam._id || match.homeTeam.id) || '') || ''),
    awayTeamId: String(match && (match.awayTeamId || match.awayTeam && (match.awayTeam._id || match.awayTeam.id) || '') || ''),
    homeTeamName: String(match && (match.homeTeamName || match.homeTeam && (match.homeTeam.name || match.homeTeam.teamName) || '') || ''),
    awayTeamName: String(match && (match.awayTeamName || match.awayTeam && (match.awayTeam.name || match.awayTeam.teamName) || '') || ''),
    venue: String(match && (match.venue || match.field || '') || ''),
    matchDate: String(match && (match.matchDate || '') || ''),
    matchTime: String(match && (match.matchTime || match.startTime || '') || ''),
    capturedAt: new Date()
  }
}

function refereeActionText(status) {
  if (['scheduled', 'pending', 'checked_in'].indexOf(status) >= 0) return '开始执裁'
  if (['ongoing', 'live'].indexOf(status) >= 0) return '继续执裁'
  if (status === 'finished') return '完善并提交裁判报告'
  if (status === 'completed') return '查看已提交报告'
  return '查看比赛'
}

function eventTypeText(type) {
  const map = {
    goal: '进球',
    penalty: '点球打进（P）',
    penalty_scored: '点球打进（P）',
    penalty_missed: '点球未进',
    own_goal: '乌龙球（OG）',
    yellow_card: '黄牌',
    red_card: '红牌',
    second_yellow_red: '2黄变1红',
    substitution: '换人',
    stoppage_time: '补时',
    other: '其他事件'
  }
  return map[type] || '比赛事件'
}

function eventTypeIcon(type) {
  const map = {
    goal: '⚽',
    penalty_scored: '⚽',
    penalty_missed: '⚽',
    own_goal: '⚽',
    second_yellow_red: '🟨🔴',
    yellow_card: '🟨',
    red_card: '🟥',
    substitution: '🔄',
    stoppage_time: '⏱',
    other: '📝'
  }
  return map[type] || '•'
}

function eventScoredGoal(type) {
  return ['goal', 'penalty', 'penalty_scored', 'own_goal'].indexOf(String(type || '')) >= 0
}

function eventScoreSide(type, teamSide) {
  return String(type || '') === 'own_goal' ? (teamSide === 'away' ? 'home' : 'away') : teamSide
}

function eventScoreFromEvents(events) {
  const score = { home: 0, away: 0 }
  ;(Array.isArray(events) ? events : []).forEach(function (event) {
    const type = String(event && (event.type || event.eventType) || '').trim().toLowerCase()
    if (!['goal', 'penalty', 'penalty_scored', 'penalty_goal', 'own_goal', 'own-goal', 'og'].includes(type)) return
    let side = event && event.teamSide === 'away' ? 'away' : 'home'
    if (['own_goal', 'own-goal', 'og'].includes(type)) side = side === 'home' ? 'away' : 'home'
    score[side] = Math.min(99, score[side] + 1)
  })
  return score
}

function refereeEventView(item, index, homeTeamName, awayTeamName) {
  const event = item || {}
  const teamSide = event.teamSide === 'away' ? 'away' : 'home'
  return {
    eventId: event.eventId || ('legacy-' + index),
    type: event.type || '',
    typeText: eventTypeText(event.type),
    typeIcon: eventTypeIcon(event.type),
    minute: Number(event.minute || 0),
    teamSide,
    teamName: teamSide === 'home' ? homeTeamName : awayTeamName,
    playerName: event.playerName || '',
    playerNumber: String(event.playerNumber || ''),
    description: event.description || '',
    assistName: event.assistName || '',
    assistNumber: String(event.assistNumber || ''),
    assistText: event.type === 'substitution'
      ? (event.assistName ? '换下：' + (event.assistNumber ? event.assistNumber + '号 ' : '') + event.assistName : '')
      : (event.assistName ? '助攻：' + (event.assistNumber ? event.assistNumber + '号 ' : '') + event.assistName : '')
  }
}

function workflowLogs(match, action, identity, detail) {
  const logs = Array.isArray(match.refereeWorkflowLogs) ? match.refereeWorkflowLogs.slice(-99) : []
  logs.push({
    action,
    detail: detail || {},
    actorOpenId: identity.openId,
    actorPhoneMasked: maskPhone(identity.phone),
    at: new Date()
  })
  return logs
}

function scoreNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const score = Number(value)
  if (!Number.isInteger(score) || score < 0 || score > 99) return null
  return score
}

const PRE_MATCH_CHECKLIST = [
  { key: 'match_ball', label: '比赛用球' },
  { key: 'goal_and_net', label: '球门与球网' },
  { key: 'field_markings', label: '场地与标线' },
  { key: 'medical_contact', label: '医疗保障联系人' }
]
const REFEREE_REPORT_SECTIONS = ['sportsmanship', 'discipline', 'injury', 'venue', 'interruption', 'other']

function refereeReportDraftView(match) {
  const raw = match && match.refereeReportDraft && typeof match.refereeReportDraft === 'object' ? match.refereeReportDraft : {}
  const sections = raw.sections && typeof raw.sections === 'object' ? raw.sections : {}
  return {
    conclusion: raw.conclusion === 'abnormal' ? 'abnormal' : 'normal',
    sections: REFEREE_REPORT_SECTIONS.reduce(function(result, key) {
      const item = sections[key] && typeof sections[key] === 'object' ? sections[key] : {}
      result[key] = { status: item.status === 'abnormal' ? 'abnormal' : 'normal', note: String(item.note || '') }
      return result
    }, {}),
    savedAt: raw.savedAt || null,
    savedByPhoneMasked: raw.savedByPhoneMasked || ''
  }
}

function signatureStrokesView(rawSignature) {
  const raw = rawSignature && typeof rawSignature === 'object' ? rawSignature : {}
  const rawStrokes = Array.isArray(raw.strokes) ? raw.strokes : []
  const strokes = rawStrokes.slice(0, 20).map(function(stroke) {
    return Array.isArray(stroke) ? stroke.slice(0, 400).map(function(point) {
      const value = point && typeof point === 'object' ? point : {}
      return {
        x: Math.round(Math.max(0, Math.min(1000, Number(value.x) || 0))),
        y: Math.round(Math.max(0, Math.min(1000, Number(value.y) || 0)))
      }
    }).filter(function(point) { return Number.isFinite(point.x) && Number.isFinite(point.y) }) : []
  }).filter(function(stroke) { return stroke.length >= 2 })
  const pointCount = strokes.reduce(function(total, stroke) { return total + stroke.length }, 0)
  return { strokes, pointCount }
}

function refereeRecordView(match) {
  const raw = match && match.refereeRecord && typeof match.refereeRecord === 'object' ? match.refereeRecord : null
  if (!raw) return null
  const request = (match && match.returnRequest && typeof match.returnRequest === 'object' ? match.returnRequest : raw.returnRequest) || null
  return {
    recordNumber: String(raw.recordNumber || ''),
    submittedAt: raw.submittedAt || null,
    submittedByPhoneMasked: String(raw.submittedByPhoneMasked || ''),
    signatureStatus: raw.signatureStatus === 'signed' ? 'signed' : 'pending',
    signatureHash: String(raw.signatureHash || ''),
    eventCount: Number(raw.eventCount || 0),
    lineupSnapshotCount: Number(raw.lineupSnapshotCount || 0),
    reviewStatus: raw.reviewStatus === 'returned' ? 'returned' : (raw.reviewStatus === 'archived' ? 'archived' : 'under_review'),
    returnRequest: request ? {
      reason: String(request.reason || ''),
      fields: Array.isArray(request.fields) ? request.fields.slice(0, 12) : [],
      returnedAt: request.returnedAt || null,
      returnedBy: String(request.returnedBy || '')
    } : null
  }
}

function preMatchStateView(match) {
  const raw = match && match.preMatchState && typeof match.preMatchState === 'object' ? match.preMatchState : {}
  const rawItems = raw.checklist && typeof raw.checklist === 'object' ? raw.checklist : {}
  const checklist = PRE_MATCH_CHECKLIST.map(function(item) {
    const saved = rawItems[item.key] && typeof rawItems[item.key] === 'object' ? rawItems[item.key] : {}
    return {
      key: item.key,
      label: item.label,
      checked: !!saved.checked,
      checkedAt: saved.checkedAt || null,
      checkedByPhoneMasked: saved.checkedByPhoneMasked || ''
    }
  })
  const refereeArrived = !!(raw.refereeArrival && raw.refereeArrival.confirmedAt)
  const teamArrivals = raw.teamArrivals && typeof raw.teamArrivals === 'object' ? raw.teamArrivals : {}
  const homeTeamArrived = !!(teamArrivals.home && teamArrivals.home.confirmedAt)
  const awayTeamArrived = !!(teamArrivals.away && teamArrivals.away.confirmedAt)
  const teamsArrived = homeTeamArrived && awayTeamArrived
  return {
    refereeArrived,
    refereeArrivalAt: raw.refereeArrival && raw.refereeArrival.confirmedAt || null,
    teamsArrived,
    homeTeamArrived,
    awayTeamArrived,
    homeTeamArrivalAt:teamArrivals.home && teamArrivals.home.confirmedAt || null,
    awayTeamArrivalAt:teamArrivals.away && teamArrivals.away.confirmedAt || null,
    teamsArrivalAt: raw.teamsArrival && raw.teamsArrival.confirmedAt || null,
    completed: !!raw.completedAt,
    completedAt: raw.completedAt || null,
    checklist,
    checklistComplete: checklist.every(function(item) { return item.checked })
  }
}

function refereeClockSnapshot(match, nowValue) {
  const now = Number(nowValue || Date.now())
  const base = Math.max(0, Number(match.refereeClockElapsedSeconds || 0))
  const startedAt = valueToTime(match.refereeClockStartedAt)
  const running = !!match.refereeClockRunning && startedAt > 0
  const elapsedSeconds = Math.max(0, Math.floor(base + (running ? (now - startedAt) / 1000 : 0)))
  let phase = match.refereeMatchPhase || ''
  if (!phase) {
    if (['finished', 'completed'].indexOf(match.status) >= 0) phase = 'finished'
    else if (['ongoing', 'live'].indexOf(match.status) >= 0) phase = 'first_half'
    else phase = 'not_started'
  }
  const phaseText = {
    not_started: '赛前',
    first_half: '上半场',
    halftime: '中场休息',
    second_half: '下半场',
    finished: '比赛结束'
  }[phase] || '比赛中'
  return { elapsedSeconds, running, phase, phaseText, snapshotAt: new Date(now).toISOString() }
}

async function getDoc(collection, id) {
  if (!id) return null
  try {
    return docData(await db.collection(collection).doc(id).get())
  } catch (error) {
    return null
  }
}

async function getIdentity(openId) {
  if (!openId) return null
  const result = await db.collection('service_identities').where(_.or([
    { openId },
    { miniProgramOpenId: openId },
    { serviceWorkflowOpenId: openId }
  ])).limit(2).get()
  const identities = listData(result)
  if (identities.length !== 1) return null
  return Object.assign({}, identities[0], { openId })
}

async function requireIdentity(openId) {
  const identity = await getIdentity(openId)
  if (!identity || !normalizePhone(identity.phone)) {
    const error = new Error('请先授权微信手机号')
    error.code = 'PHONE_REQUIRED'
    throw error
  }
  return identity
}

async function bindPhone(openId, phoneCode) {
  if (!openId) return fail('无法获取微信身份，请重新打开小程序', 'OPENID_REQUIRED')
  if (!phoneCode) return fail('请点击微信手机号授权按钮', 'PHONE_CODE_REQUIRED')

  let phoneResult
  try {
    const decodeResult = await cloud.callFunction({
      name: 'decodePhoneNumber',
      data: { code: phoneCode }
    })
    phoneResult = decodeResult && decodeResult.result
  } catch (error) {
    console.error('[serviceMatchWorkflow] phone decode failed:', error)
    return fail('手机号授权失败，请重试', 'PHONE_DECODE_FAILED')
  }

  if (!phoneResult || !phoneResult.success) {
    console.error('[serviceMatchWorkflow] phone decode rejected:', phoneResult)
    return fail((phoneResult && phoneResult.message) || '手机号授权失败，请重试', 'PHONE_DECODE_FAILED')
  }

  const phone = normalizePhone(phoneResult.phoneNumber || phoneResult.purePhoneNumber)
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail('未获取到有效手机号', 'PHONE_INVALID')

  const samePhone = listData(await db.collection('service_identities').where({ phone }).limit(5).get())
  const occupied = samePhone.find(function(item) { return item.openId && item.openId !== openId })
  if (occupied) return fail('该手机号已绑定其他微信，请联系主办方处理', 'PHONE_OCCUPIED')

  const existing = await getIdentity(openId)
  if (existing) {
    await db.collection('service_identities').doc(existing._id).update({
      data: { phone, phoneVerified: true, updateTime: db.serverDate() }
    })
  } else {
    await db.collection('service_identities').add({
      data: {
        openId,
        phone,
        phoneVerified: true,
        source: 'service_miniprogram',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }

  return ok({ phoneMasked: maskPhone(phone) }, '手机号绑定成功')
}

async function getOperatorAssignmentsByPhone(phone) {
  const refs = (await queryByPhone('referees', phone)).filter(function(item) {
    return item && item.status === 'approved'
  })
  const assignments = []
  for (const referee of refs) {
    const result = await db.collection('match_referees').where({
      refereeId: referee._id,
      canOperate: true
    }).limit(50).get()
    listData(result).forEach(function(item) { assignments.push(item) })
  }
  return assignments
}

async function sendBindSms(openId, phoneValue) {
  if (!openId) return fail('无法获取微信身份，请从赛事工作台重新进入', 'OPENID_REQUIRED')
  const phone = normalizePhone(phoneValue)
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail('请输入正确的手机号', 'PHONE_INVALID')
  if ((await getOperatorAssignmentsByPhone(phone)).length === 0) {
    return fail('该手机号没有待执行的裁判任务，请联系主办方核对', 'OPERATOR_TASK_NOT_FOUND')
  }
  const result = await cloud.callFunction({ name: 'sendSms', data: { phoneNumber: phone } })
  const response = result && result.result
  if (!response || !response.success) return fail((response && response.error) || '验证码发送失败', 'SMS_SEND_FAILED')
  return ok({ phoneMasked: maskPhone(phone) }, '验证码已发送')
}

async function verifyBindSms(openId, phoneValue, codeValue) {
  if (!openId) return fail('无法获取微信身份，请从赛事工作台重新进入', 'OPENID_REQUIRED')
  const phone = normalizePhone(phoneValue)
  const code = String(codeValue || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone)) return fail('请输入正确的手机号', 'PHONE_INVALID')
  if (!/^\d{6}$/.test(code)) return fail('请输入6位验证码', 'SMS_CODE_INVALID')
  if ((await getOperatorAssignmentsByPhone(phone)).length === 0) {
    return fail('该手机号没有待执行的裁判任务，请联系主办方核对', 'OPERATOR_TASK_NOT_FOUND')
  }
  const codeResult = await db.collection('sms_codes').where({
    phoneNumber: phone,
    code,
    used: false,
    expireAt: _.gt(new Date())
  }).orderBy('createdAt', 'desc').limit(1).get()
  const smsCode = listData(codeResult)[0]
  if (!smsCode) return fail('验证码错误或已过期', 'SMS_CODE_REJECTED')

  const existing = await getIdentity(openId)
  const occupied = listData(await db.collection('service_identities').where({ phone }).limit(5).get())
    .find(function(item) { return !existing || item._id !== existing._id })
  const isServiceAccount = openId.indexOf('service:') === 0
  if (occupied) {
    const sameChannelOccupied = isServiceAccount
      ? (occupied.serviceWorkflowOpenId && occupied.serviceWorkflowOpenId !== openId)
      : ((occupied.miniProgramOpenId && occupied.miniProgramOpenId !== openId) ||
        (occupied.openId && occupied.openId !== openId && !occupied.serviceAccountOpenId))
    if (sameChannelOccupied) return fail('该手机号已绑定其他微信，请联系主办方处理', 'PHONE_OCCUPIED')
  }
  await db.collection('sms_codes').doc(smsCode._id).update({ data: { used: true, usedAt: db.serverDate() } })
  if (occupied) {
    const mergedData = {
      phone,
      phoneVerified: true,
      source: 'referee_sms',
      updateTime: db.serverDate()
    }
    if (isServiceAccount) {
      mergedData.serviceWorkflowOpenId = openId
      mergedData.serviceAccountOpenId = existing && existing.serviceAccountOpenId ? existing.serviceAccountOpenId : ''
      mergedData.unionId = existing && existing.unionId ? existing.unionId : (occupied.unionId || '')
    } else {
      mergedData.openId = openId
      mergedData.miniProgramOpenId = openId
    }
    await db.collection('service_identities').doc(occupied._id).update({ data: mergedData })
    if (existing && existing._id !== occupied._id) await db.collection('service_identities').doc(existing._id).remove()
  } else if (existing) {
    await db.collection('service_identities').doc(existing._id).update({
      data: { phone, phoneVerified: true, source: 'referee_sms', updateTime: db.serverDate() }
    })
  } else {
    await db.collection('service_identities').add({
      data: {
        openId,
        miniProgramOpenId: isServiceAccount ? '' : openId,
        serviceWorkflowOpenId: isServiceAccount ? openId : '',
        phone,
        phoneVerified: true,
        source: 'referee_sms',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }
  return ok({ phoneMasked: maskPhone(phone) }, '裁判身份绑定成功')
}

async function queryByPhone(collection, phone) {
  if (!phone) return []
  try {
    const result = await db.collection(collection).where(_.or([
      { phone },
      { phoneNumber: phone },
      { mobile: phone },
      { contactPhone: phone }
    ])).limit(20).get()
    return listData(result)
  } catch (error) {
    console.warn('[serviceMatchWorkflow] phone query failed:', collection, error.message)
    return []
  }
}

function refereeOfficialOpenId(workflowOpenId){return String(workflowOpenId||'').replace(/^service:/,'')}

function refereeFollowAllowed(invitation,workflowOpenId){
  if(!invitation||invitation.followRequired!==true)return true
  return invitation.followStatus==='subscribed'&&refereeOfficialOpenId(workflowOpenId)&&invitation.officialOpenId===refereeOfficialOpenId(workflowOpenId)
}

async function getRefereeInvitation(openId,event) {
  const token=String(event.inviteToken || '')
  const result=await db.collection('referee_invitations').where({ token,status:'active' }).limit(1).get()
  const invitation=listData(result)[0]
  if(!invitation)return fail('裁判邀请不存在或已失效','REFEREE_INVITE_INVALID')
  if(!refereeFollowAllowed(invitation,openId))return fail('请先使用当前微信扫码关注赛小蜂足球助手，再从服务号消息进入裁判登记。','REFEREE_FOLLOW_REQUIRED')
  const tournamentResult=await db.collection('tournaments').doc(invitation.tournamentId).get()
  const tournament=Array.isArray(tournamentResult.data)?tournamentResult.data[0]:tournamentResult.data
  return ok({ tournamentName:tournament && tournament.name || '足球赛事',targetRefereeName:invitation.targetRefereeName || '',targetPhoneMasked:maskPhone(invitation.targetRefereePhone),claimMode:invitation.claimMode || '',claimReason:invitation.claimReason || '' })
}

function refereeCertificateFields(rows) {
  const lines=(rows||[]).map(function(row){return fullWidthToHalf(row.text).replace(/\s+/g,' ').trim()}).filter(Boolean)
  const text=lines.join('\n')
  const levelOptions=['五人制足球国际级裁判员','沙滩足球国际级裁判员','国际级视频比赛官员','国际级助理裁判员','国际级裁判员','国家级','一级','二级','三级']
  let name='',certificateNumber='',level=''
  const nameMatch=text.match(/(?:姓名|姓\s*名|现授予|兹授予|授予)\s*[:：]?\s*([\u3400-\u9fff·]{2,12})/)
  if(nameMatch)name=nameMatch[1]
  const numberPatterns=[/(?:证书编号|证件编号|编号|证号)\s*[:：]?\s*([A-Za-z0-9-]{5,32})/i,/(?:No\.?|NO\.?)\s*[:：]?\s*([A-Za-z0-9-]{5,32})/i,/(?:第\s*)?([A-Za-z]{0,5}\d[A-Za-z0-9-]{4,28})\s*号/i]
  for(let i=0;i<numberPatterns.length&&!certificateNumber;i+=1){const matched=text.match(numberPatterns[i]);if(matched)certificateNumber=matched[1]}
  level=levelOptions.find(function(item){return text.indexOf(item)>=0})||''
  if(!level&&/一[级圾].{0,6}足球裁判员|一级.{0,8}裁判/.test(text))level='一级'
  if(!level&&/二[级圾].{0,6}足球裁判员|二级.{0,8}裁判/.test(text))level='二级'
  if(!level&&/三[级圾].{0,6}足球裁判员|三级.{0,8}裁判/.test(text))level='三级'
  if(!level&&/国家.{0,3}级.{0,8}裁判/.test(text))level='国家级'
  if(!name){
    const labelIndex=lines.findIndex(function(line){return /^姓名[:：]?$/.test(line)})
    if(labelIndex>=0&&lines[labelIndex+1]&&/^[\u3400-\u9fff·]{2,12}$/.test(lines[labelIndex+1]))name=lines[labelIndex+1]
  }
  let issueDate=''
  const labelledDate=text.match(/(?:发\s*证\s*日\s*期|颁\s*发\s*日\s*期|签\s*发\s*日\s*期)\s*[:：]?\s*(20\d{2})\s*[.年\-/]?\s*(\d{1,2})(?:\s*[.月\-/]?\s*(\d{1,2})\s*日?)?/)
  const generalDate=text.match(/(?:^|\s)(20\d{2})\s*[.年\-/]\s*(\d{1,2})(?:\s*[.月\-/]\s*(\d{1,2})\s*日?)?(?:\s|$)/)
  const dateMatch=labelledDate||generalDate
  if(dateMatch)issueDate=[dateMatch[1],String(Number(dateMatch[2])).padStart(2,'0'),dateMatch[3]?String(Number(dateMatch[3])).padStart(2,'0'):''].filter(Boolean).join('.')
  return {name,certificateNumber,level,issueDate,rawLines:lines.slice(0,40)}
}

function normalizeIssuingAuthority(value,fullText) {
  const source=String(value||'').replace(/\s+/g,'').trim()
  const combined=source+' '+String(fullText||'')
  if(/江苏省.{0,6}足球.{0,4}协会|JIANGSU.{0,8}FOOTBALL.{0,8}ASSOCIATION|JSFA/i.test(combined))return '江苏省足球协会'
  return source.replace('足球运动协会','足球协会')
}

async function processRefereeAvatar(openId,event) {
  if(!openId)return fail('请先完成微信授权','OPENID_REQUIRED')
  const inviteToken=String(event.inviteToken||'')
  const inviteResult=await db.collection('referee_invitations').where({token:inviteToken,status:'active'}).limit(1).get()
  const invitation=listData(inviteResult)[0]
  if(!invitation)return fail('裁判邀请不存在或已失效','REFEREE_INVITE_INVALID')
  if(!refereeFollowAllowed(invitation,openId))return fail('请先关注服务号并从服务号消息进入裁判登记。','REFEREE_FOLLOW_REQUIRED')
  const imageBase64=String(event.imageBase64||'').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/,'').replace(/\s/g,'')
  if(!imageBase64||imageBase64.length<200)return fail('请选择清晰的本人头像','AVATAR_IMAGE_REQUIRED')
  if(imageBase64.length>4*1024*1024)return fail('头像照片过大，请重新裁剪','AVATAR_IMAGE_TOO_LARGE')
  if(!/^[A-Za-z0-9+/=]+$/.test(imageBase64))return fail('头像照片格式不正确','AVATAR_IMAGE_INVALID')
  const called=await cloud.callFunction({name:'baiduRemoveBg',data:{action:'removeBackground',imageBase64}})
  const result=called&&called.result||{}
  if(!result.success||!result.data||result.type){const error=new Error(result.message||'人像分割未返回透明前景，请重新选择清晰的单人照片');error.code='AVATAR_SEGMENT_FAILED';throw error}
  const transparentBase64=String(result.data).replace(/^data:image\/png;base64,/i,'')
  const avatarPath='referee-avatars/'+invitation.tournamentId+'/staged-'+Date.now()+'-'+crypto.randomBytes(5).toString('hex')+'.png'
  const avatarUpload=await cloud.uploadFile({cloudPath:avatarPath,fileContent:Buffer.from(transparentBase64,'base64')})
  await db.collection('referee_invitations').doc(invitation._id).update({data:{stagedAvatarFileId:avatarUpload.fileID,stagedAvatarAt:db.serverDate(),updateTime:db.serverDate()}})
  return ok({transparentImageDataUrl:'data:image/png;base64,'+transparentBase64,avatarFileId:avatarUpload.fileID,personNum:Number(result.personNum||1),method:'baidu_body_seg'},'头像裁剪和人像分割完成')
}

async function recognizeRefereeCertificate(openId,event) {
  if(!openId)return fail('请先完成微信授权','OPENID_REQUIRED')
  const inviteToken=String(event.inviteToken||'')
  const inviteResult=await db.collection('referee_invitations').where({token:inviteToken,status:'active'}).limit(1).get()
  const invitation=listData(inviteResult)[0]
  if(!invitation)return fail('裁判邀请不存在或已失效','REFEREE_INVITE_INVALID')
  if(!refereeFollowAllowed(invitation,openId))return fail('请先关注服务号并从服务号消息进入裁判登记。','REFEREE_FOLLOW_REQUIRED')
  if(invitation.claimMode==='temporary_no_certificate')return fail('临时裁判认领不需要上传裁判证','REFEREE_CERTIFICATE_NOT_REQUIRED')
  const imageBase64=String(event.imageBase64||'').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/,'').replace(/\s/g,'')
  if(!imageBase64||imageBase64.length<200)return fail('请上传清晰的裁判证照片','OCR_IMAGE_REQUIRED')
  if(imageBase64.length>8*1024*1024)return fail('裁判证照片过大，请压缩后重新上传','OCR_IMAGE_TOO_LARGE')
  if(!/^[A-Za-z0-9+/=]+$/.test(imageBase64))return fail('裁判证照片格式不正确','OCR_IMAGE_INVALID')
  const certificatePath='referee-certificates/'+invitation.tournamentId+'/staged-'+Date.now()+'-'+crypto.randomBytes(5).toString('hex')+'.jpg'
  const certificateUpload=await cloud.uploadFile({cloudPath:certificatePath,fileContent:Buffer.from(imageBase64,'base64')})
  await db.collection('referee_invitations').doc(invitation._id).update({data:{stagedCertificateFileId:certificateUpload.fileID,stagedCertificateAt:db.serverDate(),updateTime:db.serverDate()}})
  const results=await Promise.all([callAccurateOcr(imageBase64),callCardRiskDetection(imageBase64).catch(function(error){console.warn('[serviceMatchWorkflow] card risk detection skipped:',error.code||error.message);return null}),callSealOcr(imageBase64).catch(function(error){console.warn('[serviceMatchWorkflow] seal recognition skipped:',error.code||error.message);return null})])
  const result=results[0]
  const fields=refereeCertificateFields(ocrRows(result.TextDetections))
  const riskResult=results[1]
  const sealResult=results[2]
  const riskLabels={Blur:'图片模糊',BorderIncomplete:'边框不完整',Copy:'疑似复印件',Ps:'疑似修改',Reflection:'存在反光',Reprint:'疑似翻拍',Screenshot:'疑似截图',Cover:'存在遮挡',Overlap:'图像重叠',Watermark:'存在水印'}
  const risks=Object.keys(riskLabels).filter(function(key){return riskResult&&riskResult[key]&&riskResult[key].IsWarn===true}).map(function(key){return {type:key,label:riskLabels[key],confidence:Number(riskResult[key].RiskConfidence||0)}})
  fields.risks=risks
  fields.riskChecked=!!riskResult
  fields.issuingAuthorityRaw=String(sealResult&&sealResult.SealBody||sealResult&&sealResult.SealInfos&&sealResult.SealInfos[0]&&sealResult.SealInfos[0].SealBody||'').trim()
  fields.issuingAuthority=normalizeIssuingAuthority(fields.issuingAuthorityRaw,fields.rawLines.join(' '))
  fields.sealRecognized=!!fields.issuingAuthority
  fields.ocrEngine='GeneralAccurateOCR'
  fields.certificateFileId=certificateUpload.fileID
  return ok(fields,fields.name||fields.certificateNumber||fields.level?'证书识别完成，请核对信息':'已读取证书，请手动补充未识别信息')
}

function refereeImagePayload(value,label,maxBytes) {
  const matched=String(value||'').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=\s]+)$/i)
  if(!matched){const error=new Error('请上传'+label);error.code='REFEREE_IMAGE_REQUIRED';throw error}
  const buffer=Buffer.from(matched[2].replace(/\s/g,''),'base64')
  if(!buffer.length||buffer.length>maxBytes){const error=new Error(label+'文件过大，请重新选择');error.code='REFEREE_IMAGE_TOO_LARGE';throw error}
  return {buffer,extension:matched[1].toLowerCase()==='jpeg'?'jpg':'png',dataUrl:'data:image/'+matched[1].toLowerCase()+';base64,'+matched[2].replace(/\s/g,'')}
}

async function acceptRefereeInvitation(openId,event) {
  const token=String(event.inviteToken || ''),name=String(event.name || '').trim(),phone=normalizePhone(event.phone),level=String(event.level || '').trim(),qualification=String(event.qualification || '').trim(),issuingAuthority=String(event.issuingAuthority||'').trim().slice(0,100),certificateIssueDate=String(event.certificateIssueDate||'').trim().slice(0,30)
  if(!openId)return fail('请先完成微信授权','OPENID_REQUIRED')
  const avatarPreviewImage=refereeImagePayload(event.avatarPreviewDataUrl||event.avatarImageDataUrl,'头像预览',512*1024)
  const result=await db.collection('referee_invitations').where({ token,status:'active' }).limit(1).get();const invitation=listData(result)[0]
  if(!invitation)return fail('裁判邀请不存在或已失效','REFEREE_INVITE_INVALID')
  if(!refereeFollowAllowed(invitation,openId))return fail('请从服务号发送的裁判登记入口重新进入。','REFEREE_FOLLOW_REQUIRED')
  const temporaryClaim=invitation.claimMode==='temporary_no_certificate'
  if(temporaryClaim){
    const expectedPhone=normalizePhone(invitation.targetRefereePhone)
    const identity=await getIdentity(openId)
    if(!name||!/^1[3-9]\d{9}$/.test(phone))return fail('请核对姓名和手机号','PROFILE_REQUIRED')
    if(!expectedPhone||phone!==expectedPhone)return fail('手机号与组委会登记信息不一致','REFEREE_CLAIM_PHONE_MISMATCH')
    if(!identity||identity.phoneVerified!==true||normalizePhone(identity.phone)!==expectedPhone)return fail('请先完成登记手机号验证','REFEREE_CLAIM_PHONE_NOT_VERIFIED')
    if(!invitation.stagedAvatarFileId)return fail('请上传并完成头像裁剪抠图','REFEREE_ASSET_NOT_READY')
    if(!invitation.targetRefereeId)return fail('临时裁判档案不存在','REFEREE_TARGET_INVALID')
    const targetResult=await db.collection('referees').doc(invitation.targetRefereeId).get();const temporaryTarget=docData(targetResult)
    if(!temporaryTarget||temporaryTarget.temporaryReferee!==true||String(temporaryTarget.tournamentId||'')!==String(invitation.tournamentId||''))return fail('临时裁判档案不存在或已失效','REFEREE_TARGET_INVALID')
    if(normalizePhone(temporaryTarget.phone||temporaryTarget.phoneNumber)!==expectedPhone)return fail('临时裁判手机号已变更，请联系组委会','REFEREE_CLAIM_PHONE_MISMATCH')
    await db.collection('referees').doc(invitation.targetRefereeId).update({data:{name:temporaryTarget.name||name,realName:temporaryTarget.realName||name,phone:expectedPhone,status:'pending',auditStatus:'pending',availabilityStatus:'pending',temporaryClaimStatus:'claimed_pending_review',organizerTemporaryApproval:false,credentialStatus:'not_submitted',certificateRequired:false,eventScoped:true,wechatWorkflowOpenId:openId,wechatBound:true,avatarFileId:invitation.stagedAvatarFileId,avatarUrl:avatarPreviewImage.dataUrl,avatarBackgroundRemoved:true,avatarProcessingMethod:'baidu_body_seg',canLogin:true,canOperate:false,claimedAt:db.serverDate(),updateTime:db.serverDate()}})
    await db.collection('referee_invitations').doc(invitation._id).update({data:{status:'accepted',refereeId:invitation.targetRefereeId,acceptedAt:db.serverDate(),updateTime:db.serverDate()}})
    await db.collection('registration_audit_logs').add({data:{sport:'football',action:'temporary_referee_claimed',tournamentId:String(invitation.tournamentId||''),inviteId:String(invitation._id||''),result:'success',detail:{refereeId:String(invitation.targetRefereeId),phoneMasked:maskPhone(expectedPhone)},createTime:db.serverDate()}})
    return ok({refereeId:invitation.targetRefereeId,temporaryReferee:true},'认领已提交，等待组委会确认')
  }
  if(!name || !/^1[3-9]\d{9}$/.test(phone)||!level||!qualification||!issuingAuthority)return fail('请核对姓名、手机号、裁判等级、证书编号和发证单位','PROFILE_REQUIRED')
  if(!invitation.stagedCertificateFileId||!invitation.stagedAvatarFileId)return fail('请重新上传裁判证并完成头像裁剪抠图','REFEREE_ASSET_NOT_READY')
  const duplicate=listData(await db.collection('referees').where({ tournamentId:invitation.tournamentId,phone }).limit(2).get()).filter(function(item) { return item._id !== invitation.targetRefereeId })
  if(duplicate.length)return fail('该手机号已提交裁判资料，请勿重复提交','REFEREE_DUPLICATED')
  const tournamentResult=await db.collection('tournaments').doc(invitation.tournamentId).get();const tournament=Array.isArray(tournamentResult.data)?tournamentResult.data[0]:tournamentResult.data
  let target=null
  if(invitation.targetRefereeId){const targetResult=await db.collection('referees').doc(invitation.targetRefereeId).get();target=Array.isArray(targetResult.data)?targetResult.data[0]:targetResult.data;if(!target||target.tournamentId!==invitation.tournamentId||target.synthetic!==true)return fail('待认领的模拟裁判资料不存在或已绑定','REFEREE_TARGET_INVALID')}
  const certificateRisks=(Array.isArray(event.certificateRisks)?event.certificateRisks:[]).slice(0,10).map(function(item){return {type:String(item&&item.type||'').slice(0,40),label:String(item&&item.label||'').slice(0,40),confidence:Math.max(0,Math.min(1,Number(item&&item.confidence||0)))}}).filter(function(item){return item.type&&item.label})
  const profileAssets={certificateNumber:qualification,certificateIssueDate,issuingAuthority,certificateFileId:invitation.stagedCertificateFileId,avatarFileId:invitation.stagedAvatarFileId,avatarUrl:avatarPreviewImage.dataUrl,avatarBackgroundRemoved:true,avatarProcessingMethod:'baidu_body_seg',certificateRecognized:true,certificateOcrEngine:'GeneralAccurateOCR+SealOCR',certificateRisks,certificateRiskReviewRequired:certificateRisks.length>0}
  let refereeId=''
  if(invitation.targetRefereeId) {
    await db.collection('referees').doc(invitation.targetRefereeId).update({ data:Object.assign({ name,realName:name,phone,level,qualification,status:'pending',auditStatus:'pending',availabilityStatus:'pending',wechatWorkflowOpenId:openId,wechatBound:true,synthetic:false,wasSyntheticCandidate:true,canLogin:true,canOperate:false,notificationDisabled:false,source:'synthetic_profile_claim',inviteId:invitation._id,updateTime:db.serverDate() },profileAssets) })
    refereeId=invitation.targetRefereeId
  } else {
    const added=await db.collection('referees').add({ data:Object.assign({ tournamentId:invitation.tournamentId,orgId:invitation.orgId || tournament && (tournament.orgId || tournament.organizationId) || '',name,realName:name,phone,level,qualification,status:'pending',auditStatus:'pending',availabilityStatus:'pending',wechatWorkflowOpenId:openId,wechatBound:true,source:'referee_invite_qr',inviteId:invitation._id,canLogin:true,canOperate:false,createTime:db.serverDate(),updateTime:db.serverDate() },profileAssets) })
    refereeId=added._id
  }
  await db.collection('referee_invitations').doc(invitation._id).update({ data:{ status:'accepted',refereeId,acceptedAt:db.serverDate(),updateTime:db.serverDate() } })
  return ok({ refereeId },'裁判资料已提交，等待主办方审核')
}

async function getRefereeRecords(identity) {
  const phone = normalizePhone(identity.phone)
  const primary = await queryByPhone('referees', phone)
  const legacy = await queryByPhone('referee_library', phone)
  const map = {}
  primary.concat(legacy).filter(function(item) { return !item.status || item.status === 'approved' }).forEach(function(item) {
    if (item && item._id) map[item._id] = item
  })
  return Object.keys(map).map(function(id) { return map[id] })
}

function refereeCrewContains(match, refereeIds, phone) {
  if (!match) return false
  if (refereeIds.indexOf(match.refereeId) >= 0) return true
  const directPhone = normalizePhone(firstNonEmpty(match.refereePhone, match.mainRefereePhone, ''))
  if (directPhone && directPhone === phone) return true

  const crew = match.refereeCrew || {}
  const roles = ['mainReferee', 'secondReferee', 'thirdReferee', 'timekeeper', 'assistant1', 'assistant2', 'fourthOfficial']
  return roles.some(function(role) {
    const person = crew[role]
    if (!person) return false
    if (typeof person === 'string') return refereeIds.indexOf(person) >= 0
    const personId = person._id || person.refereeId || ''
    const personPhone = normalizePhone(firstNonEmpty(person.phone, person.phoneNumber, person.mobile, ''))
    return refereeIds.indexOf(personId) >= 0 || (personPhone && personPhone === phone)
  })
}

async function isAssignedReferee(identity, match) {
  if (!identity || !match) return false
  const refs = await getRefereeRecords(identity)
  const refereeIds = refs.map(function(item) { return item._id }).filter(Boolean)
  const phone = normalizePhone(identity.phone)
  if (!match._id || refereeIds.length === 0) return false

  const result = await db.collection('match_referees').where({ matchId: match._id }).limit(20).get()
  return listData(result).some(function(item) {
    return item.canOperate === true && refereeIds.indexOf(item.refereeId) >= 0
  })
}

async function getAssignedMatches(identity) {
  const refs = await getRefereeRecords(identity)
  const refereeIds = refs.map(function(item) { return item._id }).filter(Boolean)
  const matchIds = {}

  for (let i = 0; i < refereeIds.length; i += 1) {
    const result = await db.collection('match_referees').where({ refereeId: refereeIds[i] }).limit(50).get()
    listData(result).forEach(function(item) {
      if (item.matchId) matchIds[item.matchId] = true
    })
  }

  const matches = []
  const ids = Object.keys(matchIds).slice(0, 50)
  for (let i = 0; i < ids.length; i += 1) {
    const match = await getDoc('matches', ids[i])
    if (match) matches.push(match)
  }
  return matches
}

async function assignedRefereeRole(identity, match, allowedRoles) {
  const refs = await getRefereeRecords(identity)
  const refereeIds = refs.map(function(item) { return String(item._id || '') }).filter(Boolean)
  if (!refereeIds.length || !match || !match._id) return null
  const rows = listData(await db.collection('match_referees').where({ matchId:String(match._id) }).limit(20).get())
  const assignment = rows.find(function(item) { return refereeIds.indexOf(String(item.refereeId || '')) >= 0 && (!allowedRoles || allowedRoles.indexOf(String(item.role || '')) >= 0) })
  if (assignment) return assignment
  const crew = match.refereeCrew || {}
  const fallbackRoles = allowedRoles || ['mainReferee','assistant1','assistant2','fourthOfficial','secondReferee','thirdReferee','timekeeper']
  for (const role of fallbackRoles) {
    const person = crew[role]
    const personId = String(person && typeof person === 'object' ? (person._id || person.refereeId || '') : (person || ''))
    if (refereeIds.indexOf(personId) >= 0) return { role, roleLabel:{ mainReferee:'主裁判', assistant1:'第一助理裁判', assistant2:'第二助理裁判', fourthOfficial:'第四官员' }[role] || '本场裁判', refereeId:personId, canOperate:false }
  }
  return null
}

async function requireAssignedRole(openId, matchId, allowedRoles) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return { error:fail('比赛不存在', 'MATCH_NOT_FOUND') }
  match._id = match._id || matchId
  const assignment = await assignedRefereeRole(identity, match, allowedRoles)
  if (!assignment) return { error:fail('当前裁判岗位无权执行此操作', 'REFEREE_ROLE_FORBIDDEN') }
  return { identity, match, assignment }
}

async function getTeamName(teamId, fallback) {
  if (fallback) return fallback
  const team = await getDoc('teams', teamId)
  return team ? firstNonEmpty(team.name, team.teamName, '球队') : '球队'
}

async function getTournamentName(tournamentId, fallback) {
  if (fallback) return fallback
  const tournament = await getDoc('tournaments', tournamentId)
  return tournament ? firstNonEmpty(tournament.name, tournament.tournamentName, '赛事') : '赛事'
}

function rosterPlayerView(player, index, role) {
  const item = player || {}
  return {
    id: String(firstNonEmpty(item.id, item._id, item.playerId, 'match-player-' + index)),
    jerseyNumber: String(firstNonEmpty(item.jerseyNumber, item.number, '')).trim(),
    name: String(firstNonEmpty(item.name, item.playerName, '')).trim(),
    role: item.role === 'substitute' || role === 'substitute' ? 'substitute' : 'starter',
    portraitUrl: String(firstNonEmpty(item.portraitUrl, item.avatarUrl, item.photoUrl, '')).trim(),
    identityStatus: String(firstNonEmpty(item.identityStatus, item.verificationStatus, '')).trim()
  }
}

function refereeRosterView(match, side) {
  const refereeRosters = match.refereeRosters || {}
  const direct = refereeRosters[side]
  const sharedLineups = match.lineups || {}
  const legacy = match[lineupField(side)] || {}
  const source = (legacy && (legacy.submitted || Array.isArray(legacy.starters))) ? legacy : (direct || sharedLineups[side] || legacy)
  const starters = Array.isArray(source.players) ? source.players : (Array.isArray(source.starters) ? source.starters : [])
  const substitutes = Array.isArray(source.substitutes) ? source.substitutes : []
  const players = starters.map(function(item, index) { return rosterPlayerView(item, index, 'starter') })
    .concat(substitutes.map(function(item, index) { return rosterPlayerView(item, starters.length + index, 'substitute') }))
    .filter(function(item) { return item.name })
  const confirmations = source.confirmations && typeof source.confirmations === 'object' ? source.confirmations : {}
  const progress = lineupIdentityProgress(source)
  return {
    side,
    source: source.source || (direct ? 'referee_ocr' : (players.length ? 'existing_lineup' : '')),
    status: lineupStatus(match, side),
    players,
    starterCount: players.filter(function(item) { return item.role === 'starter' }).length,
    substituteCount: players.filter(function(item) { return item.role === 'substitute' }).length,
    fourthConfirmed:Boolean(confirmations.fourthOfficial && confirmations.fourthOfficial.status === 'approved'),
    mainConfirmed:Boolean(confirmations.mainReferee && confirmations.mainReferee.status === 'approved'),
    identityProgress:progress,
    updatedAt: source.updatedAt || null
  }
}
async function decorateMatch(match, identity) {
  const homeTeamId = matchTeamId(match, 'home')
  const awayTeamId = matchTeamId(match, 'away')
  const homeTeamName = await getTeamName(homeTeamId, matchTeamName(match, 'home'))
  const awayTeamName = await getTeamName(awayTeamId, matchTeamName(match, 'away'))
  const tournamentName = await getTournamentName(match.tournamentId, match.tournamentName)
  const division = match.divisionId ? await getDoc('divisions', match.divisionId) : null
  const drawResolution = ['penalties', 'penalty_shootout', 'shootout'].indexOf(String(division && division.drawResolution || match.drawResolution || '').toLowerCase()) >= 0 ? 'penalties' : 'draw'
  const status = match.status || 'scheduled'
  let operatorAssignment = null
  if (match._id) operatorAssignment = identity ? await assignedRefereeRole(identity, match) : listData(await db.collection('match_referees').where({ matchId: match._id, canOperate: true }).limit(2).get())[0] || null
  const events = (Array.isArray(match.events) ? match.events : []).map(function(item, index) {
    return refereeEventView(item, index, homeTeamName, awayTeamName)
  }).sort(function(a, b) {
    return a.minute - b.minute
  })
  const eventScore = Array.isArray(match.events) ? eventScoreFromEvents(match.events) : null
  const clock = refereeClockSnapshot(match)
  const preMatch = preMatchStateView(match)
  return {
    matchId: match._id,
    tournamentId: match.tournamentId || '',
    tournamentName,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    teamsText: homeTeamName + ' vs ' + awayTeamName,
    matchTimeText: matchTimeText(match),
    venue: firstNonEmpty(match.venue, match.field, match.location, '场地待定'),
    matchStatus: status,
    matchStatusText: matchStatusText(status),
    refereeActionText: refereeActionText(status),
    refereeRoleLabel: operatorAssignment ? operatorAssignment.roleLabel || '' : '',
    isRecordKeeper: !!(operatorAssignment && operatorAssignment.isRecordKeeper),
    refereeRole:String(operatorAssignment && operatorAssignment.role || ''),
    isIdentityTask:['assistant1','assistant2','fourthOfficial'].indexOf(String(operatorAssignment && operatorAssignment.role || '')) >= 0,
    canOpenMatch:Boolean(operatorAssignment && operatorAssignment.canOperate) || String(operatorAssignment && operatorAssignment.role || '') === 'mainReferee',
    identityTaskSide:String(operatorAssignment && operatorAssignment.role || '') === 'assistant2' ? 'away' : (String(operatorAssignment && operatorAssignment.role || '') === 'assistant1' ? 'home' : ''),
    canStart: String(operatorAssignment && operatorAssignment.role || '') === 'mainReferee' && !match.refereeRecordLocked && ['scheduled', 'pending', 'checked_in'].indexOf(status) >= 0,
    canFinish: String(operatorAssignment && operatorAssignment.role || '') === 'mainReferee' && !match.refereeRecordLocked && ['ongoing', 'live'].indexOf(status) >= 0,
    canControlClock:!!(operatorAssignment && operatorAssignment.canOperate) && !match.refereeRecordLocked && ['ongoing', 'live'].indexOf(status) >= 0,
    canRecordEvents: !!(operatorAssignment && operatorAssignment.canOperate) && !match.refereeRecordLocked && ['ongoing', 'live', 'finished'].indexOf(status) >= 0,
    canSubmitReport: String(operatorAssignment && operatorAssignment.role || '') === 'mainReferee' && !match.refereeRecordLocked && status === 'finished',
    showFinalScore: ['finished', 'completed'].indexOf(status) >= 0,
    refereeRecordLocked: !!match.refereeRecordLocked,
    refereeReportStatus: match.refereeReportStatus || 'not_submitted',
    refereeReportDraft: refereeReportDraftView(match),
    refereeRecord: refereeRecordView(match),
    returnedCorrectionDraft: match.returnedCorrectionDraft && typeof match.returnedCorrectionDraft === 'object' ? match.returnedCorrectionDraft : null,
    clockElapsedSeconds: clock.elapsedSeconds,
    clockRunning: clock.running,
    clockPhase: clock.phase,
    clockPhaseText: clock.phaseText,
    clockSnapshotAt: clock.snapshotAt,
    homeScore: eventScore ? eventScore.home : (scoreNumber(match.homeScore) === null ? 0 : scoreNumber(match.homeScore)),
    awayScore: eventScore ? eventScore.away : (scoreNumber(match.awayScore) === null ? 0 : scoreNumber(match.awayScore)),
    drawResolution,
    penaltyWinPoints: Number(division && division.penaltyWinPoints || 2),
    penaltyLossPoints: Number(division && division.penaltyLossPoints || 0),
    homePenaltyScore: scoreNumber(match.homePenaltyScore) === null ? 0 : scoreNumber(match.homePenaltyScore),
    awayPenaltyScore: scoreNumber(match.awayPenaltyScore) === null ? 0 : scoreNumber(match.awayPenaltyScore),
    winnerTeamId: String(match.winnerTeamId || ''),
    events,
    hasEvents: events.length > 0,
    lineupRequestStatus: match.lineupRequestStatus || 'not_requested',
    homeLineupStatus: lineupStatus(match, 'home'),
    awayLineupStatus: lineupStatus(match, 'away'),
    lineupsLocked: !!match.lineupsLocked,
    canReviewLineups: ['mainReferee','fourthOfficial'].indexOf(String(operatorAssignment && operatorAssignment.role || '')) >= 0 && !!preMatch.completed && !match.refereeRecordLocked && ['scheduled', 'pending', 'checked_in'].indexOf(status) >= 0,
    canEditRoster: !!(operatorAssignment && operatorAssignment.canOperate) && !match.refereeRecordLocked && status !== 'completed',
    preMatch,
    canManagePreMatch: !match.refereeRecordLocked && ['scheduled', 'pending', 'checked_in'].indexOf(status) >= 0,
    rosters: {
      home: refereeRosterView(match, 'home'),
      away: refereeRosterView(match, 'away')
    }
  }
}

async function getIdentityClaims(identity) {
  const conditions = [{ openId: identity.openId }]
  if (identity.phone) conditions.push({ phone: normalizePhone(identity.phone) })
  const result = await db.collection('tournament_team_claims').where(_.or(conditions)).limit(50).get()
  return listData(result).filter(function(item) { return item.status === ACTIVE_CLAIM_STATUS })
}

function refereeAssignmentTemplate(format) {
  return /^(5|6)/.test(String(format||''))
    ? [{key:'mainReferee',label:'主裁判'},{key:'secondReferee',label:'第二裁判'},{key:'thirdReferee',label:'第三裁判'},{key:'timekeeper',label:'计时员'}]
    : [{key:'mainReferee',label:'主裁判'},{key:'assistant1',label:'第一助理裁判'},{key:'assistant2',label:'第二助理裁判'},{key:'fourthOfficial',label:'第四官员'}]
}

async function headRefereeTournamentScopes(identity) {
  const refereeIds=(await getRefereeRecords(identity)).map(function(item){return String(item._id||'')}).filter(Boolean)
  const scopes=[]
  for(const refereeId of refereeIds){
    const rows=listData(await db.collection('tournament_referees').where({refereeId,isHeadReferee:true}).limit(50).get())
    rows.forEach(function(item){if(item&&item.tournamentId&&!scopes.some(function(scope){return String(scope.tournamentId)===String(item.tournamentId)}))scopes.push(item)})
  }
  return scopes
}

function schedulableReferee(item,tournamentId,orgId) {
  if(!item||item.synthetic===true||item.status!=='approved'||item.canOperate===false)return false
  if(item.temporaryReferee===true)return String(item.tournamentId||'')===String(tournamentId||'')&&item.eventScoped===true&&item.organizerTemporaryApproval===true&&item.temporaryClaimStatus==='approved'&&item.wechatBound===true
  const itemOrgId=String(item.orgId||item.organizationId||'')
  return !!itemOrgId&&itemOrgId===String(orgId||'')
}

async function getHeadRefereeSchedule(openId,event) {
  const identity=await requireIdentity(openId)
  const scopes=await headRefereeTournamentScopes(identity)
  const tournaments=[]
  for(const scope of scopes){
    const tournament=await getDoc('tournaments',scope.tournamentId)
    const tournamentOrgId=String(tournament&&(tournament.orgId||tournament.organizationId)||'')
    if(tournament&&tournamentOrgId&&(!scope.orgId||String(scope.orgId)===tournamentOrgId))tournaments.push({id:String(scope.tournamentId),name:String(tournament.name||tournament.tournamentName||'足球赛事')})
  }
  const requestedId=String(event.tournamentId||'')
  const tournamentId=requestedId||String(tournaments[0]&&tournaments[0].id||'')
  if(!tournamentId)return ok({tournaments:[],tournamentId:'',matches:[],referees:[]})
  if(!tournaments.some(function(item){return item.id===tournamentId}))return fail('您不是该赛事的裁判长','HEAD_REFEREE_FORBIDDEN')
  const tournament=await getDoc('tournaments',tournamentId)
  if(!tournament)return fail('赛事不存在','TOURNAMENT_NOT_FOUND')
  const orgId=String(tournament.orgId||tournament.organizationId||'')
  if(!orgId)return fail('赛事机构信息不完整，暂不能安排裁判','TOURNAMENT_ORG_REQUIRED')
  const refereeRows=listData(await db.collection('referees').where(_.or([{orgId},{organizationId:orgId},{tournamentId}])).limit(500).get())
  const referees=refereeRows.filter(function(item){return schedulableReferee(item,tournamentId,orgId)}).map(function(item){return {id:String(item._id),name:String(item.name||item.realName||'裁判'),level:String(item.level||item.refereeLevel||''),temporaryReferee:item.temporaryReferee===true}})
  const matchRows=listData(await db.collection('matches').where({tournamentId}).limit(500).get())
  const matches=matchRows.filter(function(match){return ['scheduled','pending','checked_in'].indexOf(String(match.status||'scheduled'))>=0&&!match.refereeRecordLocked}).map(function(match){
    const roles=refereeAssignmentTemplate(match.matchFormat||tournament.matchFormat||'11side')
    const crew=match.refereeCrew&&typeof match.refereeCrew==='object'?match.refereeCrew:{}
    const crewIds={}
    roles.forEach(function(role){const person=crew[role.key];crewIds[role.key]=String(person&&typeof person==='object'?(person._id||person.refereeId||''):(person||''))})
    return {id:String(match._id),sequence:String(match.matchSequence||match.sequence||''),homeTeamName:String(match.homeTeamName||match.homeTeam&&match.homeTeam.name||'主队'),awayTeamName:String(match.awayTeamName||match.awayTeam&&match.awayTeam.name||'客队'),matchDate:String(match.matchDate||''),matchTime:String(match.matchTime||match.startTime||''),venue:String(match.venue||match.field||''),roles,crew:crewIds}
  }).sort(function(a,b){return (a.matchDate+' '+a.matchTime).localeCompare(b.matchDate+' '+b.matchTime)})
  return ok({tournaments,tournamentId,matches,referees})
}

async function assignHeadRefereeCrew(openId,event,sessionToken) {
  const identity=await requireIdentity(openId)
  const match=await getDoc('matches',String(event.matchId||''))
  if(!match)return fail('比赛不存在','MATCH_NOT_FOUND')
  const scopes=await headRefereeTournamentScopes(identity)
  if(!scopes.some(function(scope){return String(scope.tournamentId||'')===String(match.tournamentId||'')}))return fail('您不是该赛事的裁判长','HEAD_REFEREE_FORBIDDEN')
  const called=await cloud.callFunction({name:'updateMatch',data:{action:'assignByHeadReferee',__refereeSessionToken:String(sessionToken||''),matchId:String(event.matchId||''),data:{refereeCrew:event.refereeCrew||{}}}})
  const result=called&&called.result||{}
  if(!result.success)return fail(result.message||result.error||'裁判排班保存失败',result.code||'HEAD_REFEREE_ASSIGNMENT_FAILED')
  const response=ok({matchId:String(event.matchId||'')},'裁判排班已保存')
  if(result.__notificationRelay)response.__notificationRelay=result.__notificationRelay
  return response
}

async function getWorkbench(openId) {
  const identity = await getIdentity(openId)
  if (!identity || !identity.phone) {
    return ok({ needsPhone: true, refereeTasks: [] })
  }

  const refereeMatches = await getAssignedMatches(identity)
  const refereeTasks = []
  for (let i = 0; i < refereeMatches.length; i += 1) {
    refereeTasks.push(await decorateMatch(refereeMatches[i], identity))
  }

  refereeTasks.sort(function(a, b) { return String(a.matchTimeText).localeCompare(String(b.matchTimeText)) })

  const headScopes=await headRefereeTournamentScopes(identity)
  return ok({
    needsPhone: false,
    phoneMasked: maskPhone(identity.phone),
    refereeTasks,
    headRefereeTournamentCount:headScopes.length
  })
}

async function getActiveClaim(tournamentId, teamId) {
  const result = await db.collection('tournament_team_claims').where({
    tournamentId,
    teamId,
    status: ACTIVE_CLAIM_STATUS
  }).limit(5).get()
  return listData(result)[0] || null
}

function newTokenId() {
  return crypto.randomBytes(6).toString('hex')
}

async function createClaimToken(match, side, openId) {
  const teamId = matchTeamId(match, side)
  if (!teamId) throw new Error((side === 'home' ? '主队' : '客队') + '缺少球队ID')

  const existingResult = await db.collection('service_claim_tokens').where({
    matchId: match._id,
    side,
    status: 'active'
  }).limit(5).get()
  const existing = listData(existingResult).find(function(item) { return !isExpired(item) })
  if (existing) return existing

  const tokenId = newTokenId()
  const token = {
    tokenId,
    matchId: match._id,
    tournamentId: match.tournamentId || '',
    teamId,
    side,
    status: 'active',
    createdByOpenId: openId,
    expireAt: new Date(Date.now() + CLAIM_TTL_MS),
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }
  await db.collection('service_claim_tokens').doc(tokenId).set({ data: token })
  return Object.assign({ _id: tokenId }, token)
}

async function writeAudit(action, data, identity) {
  try {
    await db.collection('match_lineup_audit_logs').add({
      data: Object.assign({}, data || {}, {
        action,
        operatorOpenId: identity ? identity.openId : '',
        operatorPhoneMasked: identity ? maskPhone(identity.phone) : '',
        createTime: db.serverDate()
      })
    })
  } catch (error) {
    console.warn('[serviceMatchWorkflow] audit log failed:', error.message)
  }
}

async function publishLineupRequest(openId, matchId) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')

  const sides = ['home', 'away']
  const response = {}
  const updateData = {
    lineupRequestStatus: 'requested',
    lineupRequestedAt: db.serverDate(),
    lineupRequestedByPhoneMasked: maskPhone(identity.phone),
    updateTime: db.serverDate()
  }

  for (let i = 0; i < sides.length; i += 1) {
    const side = sides[i]
    const teamId = matchTeamId(match, side)
    const claim = await getActiveClaim(match.tournamentId || '', teamId)
    const currentStatus = lineupStatus(match, side)
    let token = null
    if (!claim) token = await createClaimToken(match, side, openId)
    const nextStatus = ['submitted', 'verified', 'locked'].indexOf(currentStatus) >= 0
      ? currentStatus
      : (claim ? 'claimed' : 'unclaimed')
    updateData[lineupStatusField(side)] = nextStatus
    response[side] = {
      teamId,
      claimed: !!claim,
      claimCode: token ? token._id : '',
      lineupStatus: nextStatus
    }
  }

  await db.collection('matches').doc(matchId).update({ data: updateData })
  await writeAudit('publish_lineup_request', { matchId, tournamentId: match.tournamentId || '' }, identity)
  return ok(response, '已通知双方提交首发')
}

async function getClaimToken(tokenId) {
  if (!tokenId) return null
  return getDoc('service_claim_tokens', tokenId)
}

async function getClaimPreview(tokenId) {
  const token = await getClaimToken(tokenId)
  if (!token) return fail('认领码不存在', 'TOKEN_NOT_FOUND')
  if (isExpired(token) && token.status === 'active') return fail('认领码已过期，请让裁判重新发布', 'TOKEN_EXPIRED')

  const match = await getDoc('matches', token.matchId)
  if (!match) return fail('对应比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || token.matchId
  const display = await decorateMatch(match)
  const side = token.side === 'away' ? 'away' : 'home'
  const claim = await getActiveClaim(token.tournamentId, token.teamId)
  return ok({
    tokenId,
    matchId: token.matchId,
    tournamentId: token.tournamentId,
    tournamentName: display.tournamentName,
    teamId: token.teamId,
    teamName: side === 'home' ? display.homeTeamName : display.awayTeamName,
    opponentName: side === 'home' ? display.awayTeamName : display.homeTeamName,
    matchTimeText: display.matchTimeText,
    venue: display.venue,
    tokenStatus: token.status,
    alreadyClaimed: !!claim
  })
}

async function claimTeam(openId, tokenId) {
  const identity = await requireIdentity(openId)
  const token = await getClaimToken(tokenId)
  if (!token) return fail('认领码不存在', 'TOKEN_NOT_FOUND')
  if (isExpired(token) && token.status === 'active') return fail('认领码已过期，请让裁判重新发布', 'TOKEN_EXPIRED')

  const existing = await getActiveClaim(token.tournamentId, token.teamId)
  if (existing) {
    const samePerson = existing.openId === openId || normalizePhone(existing.phone) === normalizePhone(identity.phone)
    if (!samePerson) return fail('该球队已被其他负责人认领，请联系裁判重置', 'TEAM_ALREADY_CLAIMED')
    return ok({ matchId: token.matchId, teamId: token.teamId }, '您已认领该球队')
  }
  if (token.status !== 'active') return fail('认领码已经使用，请联系裁判重置', 'TOKEN_USED')

  await db.collection('tournament_team_claims').add({
    data: {
      tournamentId: token.tournamentId,
      teamId: token.teamId,
      matchId: token.matchId,
      side: token.side,
      openId,
      phone: normalizePhone(identity.phone),
      role: 'team_representative',
      status: ACTIVE_CLAIM_STATUS,
      tokenId,
      claimedAt: db.serverDate(),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  await db.collection('service_claim_tokens').doc(tokenId).update({
    data: {
      status: 'used',
      usedByOpenId: openId,
      usedByPhoneMasked: maskPhone(identity.phone),
      usedAt: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  const match = await getDoc('matches', token.matchId)
  if (match) {
    const current = lineupStatus(match, token.side)
    if (['submitted', 'verified', 'locked'].indexOf(current) < 0) {
      const updateData = { updateTime: db.serverDate() }
      updateData[lineupStatusField(token.side)] = 'claimed'
      await db.collection('matches').doc(token.matchId).update({ data: updateData })
    }
  }

  await writeAudit('claim_team', {
    matchId: token.matchId,
    tournamentId: token.tournamentId,
    teamId: token.teamId,
    side: token.side
  }, identity)
  return ok({ matchId: token.matchId, teamId: token.teamId }, '认领成功')
}

function rosterPlayerId(player) {
  return String(firstNonEmpty(player && player._id, player && player.id, player && player.playerId, ''))
}

function sanitizePlayer(player) {
  return {
    _id: rosterPlayerId(player),
    name: firstNonEmpty(player && player.name, player && player.playerName, '未命名球员'),
    jerseyNumber: String(firstNonEmpty(player && player.jerseyNumber, player && player.number, '')),
    position: firstNonEmpty(player && player.position, player && player.positionName, ''),
    photoUrl:String(firstNonEmpty(player && player.recentPortraitUrl, player && player.photoUrl, player && player.photo, player && player.avatarFileId, '')),
    identityStatus:String(firstNonEmpty(player && player.identityStatus, player && player.verificationStatus, player && player.realNameStatus, 'not_verified')),
    identityVerificationLabel:String(firstNonEmpty(player && player.identityVerificationLabel, player && player.verificationLabel, '待人证核验')),
    identityVerificationMethod:String(firstNonEmpty(player && player.identityVerificationMethod, player && player.verificationMethod, '')),
    registrantType:String(firstNonEmpty(player && player.registrantType, 'guardian'))
  }
}

async function getApprovedRoster(tournamentId, teamId, match) {
  const snapshotResult = await db.collection('roster_snapshots').where({ tournamentId, teamId }).limit(20).get()
  const matchDivisionId = String(match && (match.divisionId || match.division) || '')
  const snapshots = listData(snapshotResult).filter(function(item) {
    if (ROSTER_READY_STATUS.indexOf(String(item.status || '')) < 0) return false
    const snapshotDivisionId = String(item.divisionId || item.division || '')
    return !matchDivisionId || !snapshotDivisionId || snapshotDivisionId === matchDivisionId
  }).sort(function(a, b) {
    return new Date(b.updateTime || b.createTime || 0).getTime() - new Date(a.updateTime || a.createTime || 0).getTime()
  })
  if (snapshots.length) {
    const snapshot = snapshots[0]
    const ids = Array.isArray(snapshot.playerIds) ? snapshot.playerIds.map(String).filter(Boolean) : []
    const playerResult = ids.length ? await db.collection('players').where({ _id:_.in(ids) }).limit(500).get() : { data:[] }
    const playerMap = new Map(listData(playerResult).map(function(player) { return [String(player._id), player] }))
    return Object.assign({}, snapshot, { players:ids.map(function(id) { return playerMap.get(id) }).filter(Boolean) })
  }

  const result = await db.collection('rosters').where({ tournamentId, teamId }).limit(20).get()
  const rosters = listData(result).filter(function(item) {
    return ROSTER_READY_STATUS.indexOf(item.status) >= 0
  })
  if (rosters.length === 0) return null

  const wantsKnockout = match && (match.phase === 'knockout' || match.stage === 'knockout')
  const exactStage = rosters.find(function(item) {
    return wantsKnockout ? item.stage === 'knockout' : item.stage !== 'knockout'
  })
  return exactStage || rosters[0]
}

async function resolveStartingCount(match) {
  const direct = Number(firstNonEmpty(
    match.startingPlayersPerTeam,
    match.startingPlayerCount,
    match.playersPerTeam,
    match.teamSize,
    0
  ))
  if (direct >= 3 && direct <= 11) return direct

  let format = firstNonEmpty(match.matchFormat, match.gameFormat, '')
  if (!format && match.tournamentId) {
    const tournament = await getDoc('tournaments', match.tournamentId)
    if (tournament) {
      format = firstNonEmpty(tournament.matchFormat, '')
      const divisions = Array.isArray(tournament.divisions) ? tournament.divisions : []
      const division = divisions.find(function(item) {
        return item && match.divisionId && (item.id === match.divisionId || item._id === match.divisionId)
      })
      if (division && division.matchFormat) format = division.matchFormat
    }
  }
  const matched = String(format || '').match(/(\d+)/)
  const count = matched ? Number(matched[1]) : 11
  return count >= 3 && count <= 11 ? count : 11
}

async function requireTeamClaim(identity, tournamentId, teamId) {
  const claim = await getActiveClaim(tournamentId, teamId)
  const samePerson = claim && (claim.openId === identity.openId || normalizePhone(claim.phone) === normalizePhone(identity.phone))
  if (!samePerson) {
    const error = new Error('您尚未认领该球队名单')
    error.code = 'TEAM_CLAIM_REQUIRED'
    throw error
  }
  return claim
}

async function getLineupTask(openId, matchId, teamId) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (match.lineupRequestStatus !== 'requested') return fail('裁判尚未发布首发上报', 'LINEUP_NOT_REQUESTED')

  const homeTeamId = matchTeamId(match, 'home')
  const awayTeamId = matchTeamId(match, 'away')
  const side = teamId === homeTeamId ? 'home' : (teamId === awayTeamId ? 'away' : '')
  if (!side) return fail('该球队不属于本场比赛', 'TEAM_NOT_IN_MATCH')
  await requireTeamClaim(identity, match.tournamentId || '', teamId)

  const roster = await getApprovedRoster(match.tournamentId || '', teamId, match)
  if (!roster) return fail('主办方尚未确认本队参赛名单', 'ROSTER_NOT_APPROVED')
  const startingCount = await resolveStartingCount(match)
  const display = await decorateMatch(match)
  const lineup = match[lineupField(side)] || {}
  const selectedPlayers = Array.isArray(lineup.starters) ? lineup.starters : (Array.isArray(lineup.players) ? lineup.players : [])
  const selectedIds = selectedPlayers.map(rosterPlayerId).filter(Boolean)
  const players = []
  const seen = {}
  ;(Array.isArray(roster.players) ? roster.players : []).forEach(function(item) {
    const player = sanitizePlayer(item)
    if (!player._id || seen[player._id]) return
    seen[player._id] = true
    players.push(player)
  })

  const status = lineupStatus(match, side)
  return ok({
    matchId,
    teamId,
    side,
    tournamentName: display.tournamentName,
    teamName: side === 'home' ? display.homeTeamName : display.awayTeamName,
    opponentName: side === 'home' ? display.awayTeamName : display.homeTeamName,
    matchTimeText: display.matchTimeText,
    venue: display.venue,
    startingCount,
    players,
    selectedIds,
    lineupStatus: status,
    lineupStatusText: lineupStatusText(status),
    readOnly: ['submitted', 'verified', 'locked'].indexOf(status) >= 0
  })
}

async function submitLineup(openId, event) {
  const identity = await requireIdentity(openId)
  const matchId = event.matchId || ''
  const teamId = event.teamId || ''
  const selectedPlayerIds = Array.isArray(event.selectedPlayerIds) ? event.selectedPlayerIds.map(String) : []
  const requestedSubstituteIds = Array.isArray(event.substitutePlayerIds) ? event.substitutePlayerIds.map(String) : []
  const uniqueIds = Array.from(new Set(selectedPlayerIds))
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (match.lineupRequestStatus !== 'requested') return fail('裁判尚未发布首发上报', 'LINEUP_NOT_REQUESTED')

  const homeTeamId = matchTeamId(match, 'home')
  const awayTeamId = matchTeamId(match, 'away')
  const side = teamId === homeTeamId ? 'home' : (teamId === awayTeamId ? 'away' : '')
  if (!side) return fail('该球队不属于本场比赛', 'TEAM_NOT_IN_MATCH')
  await requireTeamClaim(identity, match.tournamentId || '', teamId)

  const currentStatus = lineupStatus(match, side)
  if (['verified', 'locked'].indexOf(currentStatus) >= 0) return fail('名单已经裁判确认，不能再次提交', 'LINEUP_LOCKED')
  if (currentStatus === 'submitted') return fail('名单已经提交，请等待裁判核验', 'LINEUP_ALREADY_SUBMITTED')

  const roster = await getApprovedRoster(match.tournamentId || '', teamId, match)
  if (!roster) return fail('主办方尚未确认本队参赛名单', 'ROSTER_NOT_APPROVED')
  const startingCount = await resolveStartingCount(match)
  if (uniqueIds.length !== startingCount) {
    return fail('请准确选择' + startingCount + '名首发球员', 'STARTER_COUNT_INVALID')
  }

  const rosterMap = {}
  ;(Array.isArray(roster.players) ? roster.players : []).forEach(function(item) {
    const player = sanitizePlayer(item)
    if (player._id) rosterMap[player._id] = player
  })
  const invalid = uniqueIds.find(function(id) { return !rosterMap[id] })
  if (invalid) return fail('选中的球员不在主办方确认名单中', 'PLAYER_NOT_IN_ROSTER')
  const starters = uniqueIds.map(function(id) { return rosterMap[id] })
  const substituteIds = requestedSubstituteIds.length ? Array.from(new Set(requestedSubstituteIds)) : Object.keys(rosterMap).filter(function(id) { return uniqueIds.indexOf(id) < 0 })
  if (substituteIds.some(function(id) { return !rosterMap[id] || uniqueIds.indexOf(id) >= 0 })) return fail('替补名单包含无效或重复球员', 'SUBSTITUTE_PLAYER_INVALID')
  const substitutes = substituteIds.map(function(id) { return rosterMap[id] })
  const identityPending = starters.concat(substitutes).filter(function(player) { return !identityReady(player) })
  if (identityPending.length) return fail('阵容中有球员尚未完成人证核验', 'PLAYER_IDENTITY_NOT_READY')

  const previousLineup = match[lineupField(side)] || {}
  const version = Number(previousLineup.version || 0) + 1
  const lineup = {
    teamId,
    starters,
    players: starters,
    substitutes,
    submitted: true,
    status: 'submitted',
    version,
    submittedAt: db.serverDate(),
    submittedByOpenId: openId,
    submittedByPhoneMasked: maskPhone(identity.phone)
  }
  lineup.confirmations = {}
  lineup.identityChecks = {}
  const updateData = { updateTime: db.serverDate() }
  updateData[lineupField(side)] = lineup
  updateData[lineupStatusField(side)] = 'submitted'
  await db.collection('matches').doc(matchId).update({ data: updateData })
  await writeAudit('submit_lineup', {
    matchId,
    tournamentId: match.tournamentId || '',
    teamId,
    side,
    version,
    selectedPlayerIds: uniqueIds
  }, identity)
  return ok({ lineupStatus: 'submitted', version }, '首发名单提交成功')
}

async function submitLegacyLineup(openId, event) {
  await requireIdentity(openId)
  const matchId = String(event.matchId || '')
  const lineupField = String(event.lineupField || '')
  if (lineupField !== 'homeLineup' && lineupField !== 'awayLineup') {
    return fail('不支持的阵容字段', 'INVALID_LINEUP_FIELD')
  }
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  const side = lineupField === 'homeLineup' ? 'home' : 'away'
  const teamId = matchTeamId(match, side)
  if (!teamId) return fail('比赛缺少参赛球队', 'TEAM_NOT_FOUND')
  return submitLineup(openId, Object.assign({}, event, {
    matchId,
    teamId,
    selectedPlayerIds: Array.isArray(event.selectedPlayerIds) ? event.selectedPlayerIds : []
  }))
}

async function getTokenForSide(matchId, side) {
  const result = await db.collection('service_claim_tokens').where({ matchId, side }).limit(20).get()
  const tokens = listData(result)
  return tokens.find(function(item) { return item.status === 'active' && !isExpired(item) }) || null
}

async function sideSummary(match, display, side) {
  const teamId = matchTeamId(match, side)
  const claim = await getActiveClaim(match.tournamentId || '', teamId)
  const status = lineupStatus(match, side)
  const token = claim ? null : await getTokenForSide(match._id, side)
  return {
    side,
    teamId,
    teamName: side === 'home' ? display.homeTeamName : display.awayTeamName,
    claimStatus: claim ? 'claimed' : 'unclaimed',
    claimStatusText: claim ? '已认领' : '待认领',
    claimPhoneMasked: claim ? maskPhone(claim.phone) : '',
    claimCode: token ? token._id : '',
    lineupStatus: status,
    lineupStatusText: lineupStatusText(status),
    canViewLineup: ['submitted', 'verified', 'locked', 'returned'].indexOf(status) >= 0,
    canReviewLineup: status === 'submitted',
    canResetClaim: !!claim && ['submitted', 'verified', 'locked'].indexOf(status) < 0
  }
}

async function getRefereeMatch(openId, matchId) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  const operatorAllowed = await isAssignedReferee(identity, match)
  const mainAssignment = await assignedRefereeRole(identity, match, ['mainReferee'])
  if (!operatorAllowed && !mainAssignment) return fail('当前岗位请进入专属裁判任务页', 'REFEREE_ROLE_FORBIDDEN')
  const display = await decorateMatch(match, identity)
  return ok({ match: display })
}

async function updatePreMatchState(openId, event) {
  const matchId = String(event.matchId || '')
  const operation = String(event.operation || '')
  const roleContext = await requireAssignedRole(openId, matchId, ['mainReferee'])
  if (roleContext.error) return roleContext.error
  const context = { identity:roleContext.identity, match:roleContext.match }
  const match = context.match
  const status = match.status || 'scheduled'
  if (match.refereeRecordLocked || ['ongoing', 'live', 'finished', 'completed', 'cancelled', 'postponed'].indexOf(status) >= 0) {
    return fail('当前比赛状态不能进行赛前确认', 'PRE_MATCH_NOT_AVAILABLE')
  }
  const current = match.preMatchState && typeof match.preMatchState === 'object' ? match.preMatchState : {}
  const next = Object.assign({}, current, { checklist: Object.assign({}, current.checklist || {}) })
  const now = new Date()
  const actor = maskPhone(context.identity.phone)
  if (operation === 'confirm_referee_arrival') {
    next.refereeArrival = { confirmedAt: now, confirmedByPhoneMasked: actor }
  } else if (operation === 'confirm_teams_arrival') {
    return fail('主客队须由各自球队负责人独立确认到场', 'TEAM_SELF_CHECKIN_REQUIRED')
  } else if (operation === 'toggle_checklist') {
    const itemKey = String(event.itemKey || '')
    if (!PRE_MATCH_CHECKLIST.some(function(item) { return item.key === itemKey })) return fail('无效的赛前检查项', 'PRE_MATCH_ITEM_INVALID')
    const previous = next.checklist[itemKey] && typeof next.checklist[itemKey] === 'object' ? next.checklist[itemKey] : {}
    next.checklist[itemKey] = { checked: !previous.checked, checkedAt: !previous.checked ? now : null, checkedByPhoneMasked: !previous.checked ? actor : '' }
  } else if (operation === 'complete_pre_match') {
    const view = preMatchStateView(Object.assign({}, match, { preMatchState: next }))
    if (!view.refereeArrived || !view.teamsArrived || !view.checklistComplete) return fail('请完成裁判、双方球队到场及全部赛前检查', 'PRE_MATCH_INCOMPLETE')
    next.completedAt = now
    next.completedByPhoneMasked = actor
    next.issue = null
  } else if (operation === 'report_pre_match_issue') {
    const reason = String(event.reason || '').trim().slice(0, 200)
    if (!reason) return fail('请填写无法开赛原因', 'PRE_MATCH_ISSUE_REASON_REQUIRED')
    next.issue = { reason, reportedAt: now, reportedByPhoneMasked: actor }
    next.completedAt = null
    next.completedByPhoneMasked = ''
  } else {
    return fail('无效的赛前确认操作', 'PRE_MATCH_OPERATION_INVALID')
  }
  const updateData = {
    preMatchState: next,
    refereeWorkflowLogs: workflowLogs(match, 'pre_match_' + operation, context.identity, { itemKey: String(event.itemKey || '') }),
    updateTime: db.serverDate()
  }
  if (operation === 'complete_pre_match' && status !== 'checked_in') updateData.status = 'checked_in'
  await db.collection('matches').doc(matchId).update({ data: updateData })
  return ok({ preMatch: preMatchStateView(Object.assign({}, match, { preMatchState: next })) }, operation === 'complete_pre_match' ? '赛前检查已确认，可进入阵容核验' : (operation === 'report_pre_match_issue' ? '无法开赛原因已上报' : '赛前状态已更新'))
}

async function getAssignedRefereeMatch(openId, matchId) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) {
    const error = new Error('比赛不存在')
    error.code = 'MATCH_NOT_FOUND'
    throw error
  }
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) {
    const error = new Error('您不是本场已指派裁判')
    error.code = 'REFEREE_FORBIDDEN'
    throw error
  }
  return { identity, match }
}

async function recognizeRefereeRoster(openId, event) {
  const matchId = String(event.matchId || '')
  const side = event.side === 'away' ? 'away' : 'home'
  const context = await getAssignedRefereeMatch(openId, matchId)
  if (context.match.refereeRecordLocked || context.match.status === 'completed') return fail('裁判报告已锁定，不能再识别名单', 'REFEREE_RECORD_LOCKED')
  const imageBase64 = String(event.imageBase64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').replace(/\s/g, '')
  if (!imageBase64 || imageBase64.length < 200) return fail('请选择清晰的名单照片', 'OCR_IMAGE_REQUIRED')
  if (imageBase64.length > 8 * 1024 * 1024) return fail('照片过大，请重新拍摄或压缩后上传', 'OCR_IMAGE_TOO_LARGE')
  if (!/^[A-Za-z0-9+/=]+$/.test(imageBase64)) return fail('照片数据格式不正确', 'OCR_IMAGE_INVALID')
  const result = await callHandwritingOcr(imageBase64)
  const rows = ocrRows(result.TextDetections)
  const players = parseRosterRows(rows, side)
  return ok({
    side,
    players,
    rawLines: rows.map(function(row) { return row.text }).slice(0, 120),
    requestId: result.RequestId || '',
    warnings: players.length ? [] : ['未自动提取到号码和姓名，请在核对页手动添加']
  }, players.length ? '识别完成，请核对名单' : '文字已识别，请手动整理名单')
}

function sanitizeRefereeRosterPlayers(players, side) {
  const list = Array.isArray(players) ? players.slice(0, 60) : []
  const seenNumbers = {}
  return list.map(function(item, index) {
    const name = String(item && item.name || '').trim().slice(0, 30)
    const rawNumber = String(item && firstNonEmpty(item.jerseyNumber, item.number, '') || '').replace(/\D/g, '').slice(0, 3)
    if (!name) {
      const error = new Error('第' + (index + 1) + '名球员缺少姓名')
      error.code = 'ROSTER_PLAYER_NAME_REQUIRED'
      throw error
    }
    if (rawNumber && seenNumbers[rawNumber]) {
      const error = new Error('球衣号码' + rawNumber + '重复，请核对名单')
      error.code = 'ROSTER_NUMBER_DUPLICATED'
      throw error
    }
    if (rawNumber) seenNumbers[rawNumber] = true
    return {
      id: 'match-' + side + '-' + crypto.randomBytes(5).toString('hex'),
      jerseyNumber: rawNumber,
      number: rawNumber,
      name,
      role: item && item.role === 'substitute' ? 'substitute' : 'starter',
      source: 'referee_ocr'
    }
  })
}

async function saveRefereeRoster(openId, event) {
  const matchId = String(event.matchId || '')
  const side = event.side === 'away' ? 'away' : 'home'
  const context = await getAssignedRefereeMatch(openId, matchId)
  const match = context.match
  const status = match.status || 'scheduled'
  if (match.lineupsLocked) return fail('lineups locked', 'LINEUP_LOCKED')
  if (['scheduled', 'pending', 'checked_in'].indexOf(status) < 0) return fail('roster editing is not available for this match status', 'ROSTER_EDIT_NOT_AVAILABLE')
  if (match.refereeRecordLocked || match.status === 'completed') return fail('裁判报告已锁定，不能再修改名单', 'REFEREE_RECORD_LOCKED')
  const players = sanitizeRefereeRosterPlayers(event.players, side)
  if (!players.length) return fail('请至少录入1名球员', 'ROSTER_EMPTY')
  const starters = players.filter(function(item) { return item.role === 'starter' })
  const substitutes = players.filter(function(item) { return item.role === 'substitute' })
  const roster = {
    source: 'referee_ocr',
    status: 'referee_entered',
    players: starters,
    starters,
    substitutes,
    updatedAt: new Date(),
    updatedByPhoneMasked: maskPhone(context.identity.phone)
  }
  const refereeRosters = Object.assign({}, match.refereeRosters || {})
  refereeRosters[side] = roster
  const lineups = Object.assign({}, match.lineups || {})
  lineups[side] = roster
  const updateData = {
    refereeRosters,
    lineups,
    refereeWorkflowLogs: workflowLogs(match, 'save_ocr_roster', context.identity, { side, playerCount: players.length, starterCount: starters.length, substituteCount: substitutes.length }),
    updateTime: db.serverDate()
  }
  updateData[lineupField(side)] = roster
  await db.collection('matches').doc(matchId).update({ data: updateData })
  return ok({ roster: refereeRosterView(Object.assign({}, match, { refereeRosters }), side) }, (side === 'home' ? '主队' : '客队') + '名单已保存')
}
async function startRefereeMatch(openId, matchId) {
  const roleContext = await requireAssignedRole(openId, matchId, ['mainReferee'])
  if (roleContext.error) return roleContext.error
  const context = { identity:roleContext.identity, match:roleContext.match }
  const status = context.match.status || 'scheduled'
  if (['ongoing', 'live'].indexOf(status) >= 0) return ok({}, '比赛已经开始')
  if (context.match.refereeRecordLocked || ['finished', 'completed'].indexOf(status) >= 0) return fail('比赛已经结束，不能再次开始', 'MATCH_ALREADY_FINISHED')
  if (['postponed', 'cancelled'].indexOf(status) >= 0) return fail('当前比赛状态不能开始执裁', 'MATCH_STATUS_INVALID')
  if (!preMatchStateView(context.match).completed) return fail('请先完成赛前报到、到场和检查确认', 'PRE_MATCH_INCOMPLETE')
  if (!context.match.lineupsLocked) return fail('请先完成双方阵容与身份核验', 'LINEUP_NOT_VERIFIED')

  const { freezePreMatchDuration } = await import('./data-center/playing-time.mjs')
  const division = context.match.divisionId && context.match.divisionId !== 'default' ? await getDoc('divisions',context.match.divisionId) : null
  const tournament = context.match.tournamentId ? await getDoc('tournaments',context.match.tournamentId) : null
  const durationRulesSnapshot = freezePreMatchDuration(context.match,division || {},tournament || {})

  const updateData = {
      status: 'ongoing',
      refereeStartedAt: db.serverDate(),
      refereeMatchPhase: 'first_half',
      refereeClockRunning: true,
      refereeClockElapsedSeconds: 0,
      refereeClockStartedAt: db.serverDate(),
      refereeStartedByOpenId: context.identity.openId,
      refereeStartedByPhoneMasked: maskPhone(context.identity.phone),
      refereeWorkflowLogs: workflowLogs(context.match, 'start_match', context.identity),
      updateTime: db.serverDate()
  }
  if (!context.match.durationRulesSnapshot && durationRulesSnapshot) updateData.durationRulesSnapshot = durationRulesSnapshot
  if (!context.match.executionSnapshot) {
    updateData.executionSnapshot = await buildExecutionSnapshot(context.match)
    updateData.executionSnapshotAt = db.serverDate()
  }
  await db.runTransaction(async transaction => {
    const response = await transaction.collection('matches').doc(matchId).get()
    const fresh = Array.isArray(response.data) ? response.data[0] : response.data
    if (['ongoing','live'].includes(String(fresh?.status || ''))) return
    if (!fresh || fresh.refereeRecordLocked || ['finished','completed','archived','cancelled','postponed'].includes(String(fresh.status || '')) ||
        !fresh.lineupsLocked || !preMatchStateView(fresh).completed) {
      throw Object.assign(new Error('比赛状态已变化，请刷新后重试'),{code:'MATCH_STATE_CHANGED'})
    }
    if (fresh.durationRulesSnapshot) delete updateData.durationRulesSnapshot
    updateData.refereeWorkflowLogs = workflowLogs(fresh,'start_match',context.identity)
    await transaction.collection('matches').doc(matchId).update({data:updateData})
  })
  return ok({}, '已开始执裁')
}

async function controlRefereeClock(openId, event) {
  const matchId = event.matchId || ''
  const command = String(event.command || '')
  const context = await getAssignedRefereeMatch(openId, matchId)
  const match = context.match
  const status = match.status || 'scheduled'
  if (match.refereeRecordLocked) return fail('裁判报告已提交，计时已锁定', 'REFEREE_RECORD_LOCKED')
  if (['ongoing', 'live'].indexOf(status) < 0) return fail('比赛尚未开始或已经结束', 'MATCH_NOT_ONGOING')

  const clock = refereeClockSnapshot(match)
  const updateData = {
    refereeClockElapsedSeconds: clock.elapsedSeconds,
    refereeWorkflowLogs: workflowLogs(match, 'control_clock', context.identity, { command, elapsedSeconds: clock.elapsedSeconds }),
    updateTime: db.serverDate()
  }
  let message = ''

  if (command === 'pause') {
    updateData.refereeClockRunning = false
    updateData.refereeClockStartedAt = null
    message = '计时已暂停'
  } else if (command === 'resume') {
    if (clock.phase === 'halftime') return fail('请点击开始下半场', 'CLOCK_PHASE_INVALID')
    updateData.refereeClockRunning = true
    updateData.refereeClockStartedAt = db.serverDate()
    message = '计时已继续'
  } else if (command === 'halftime') {
    if (clock.phase !== 'first_half') return fail('当前不是上半场', 'CLOCK_PHASE_INVALID')
    updateData.refereeMatchPhase = 'halftime'
    updateData.refereeClockRunning = false
    updateData.refereeClockStartedAt = null
    message = '已进入中场休息'
  } else if (command === 'second_half') {
    if (clock.phase !== 'halftime') return fail('请先结束上半场', 'CLOCK_PHASE_INVALID')
    updateData.refereeMatchPhase = 'second_half'
    updateData.refereeClockRunning = true
    updateData.refereeClockStartedAt = db.serverDate()
    message = '下半场已开始'
  } else {
    return fail('无效的计时操作', 'CLOCK_COMMAND_INVALID')
  }

  await db.collection('matches').doc(matchId).update({ data: updateData })
  return ok({}, message)
}

async function finishRefereeMatch(openId, event) {
  const matchId = event.matchId || ''
  const roleContext = await requireAssignedRole(openId, matchId, ['mainReferee'])
  if (roleContext.error) return roleContext.error
  const context = { identity:roleContext.identity, match:roleContext.match }
  const status = context.match.status || 'scheduled'
  if (['finished', 'completed'].indexOf(status) >= 0) return fail('比赛已经结束', 'MATCH_ALREADY_FINISHED')
  if (['ongoing', 'live'].indexOf(status) < 0) return fail('请先点击开始执裁', 'MATCH_NOT_STARTED')

  const eventScore = Array.isArray(context.match.events) ? eventScoreFromEvents(context.match.events) : null
  const homeScore = eventScore ? eventScore.home : scoreNumber(event.homeScore)
  const awayScore = eventScore ? eventScore.away : scoreNumber(event.awayScore)
  if (homeScore === null || awayScore === null) return fail('请输入0至99之间的有效比分', 'SCORE_INVALID')

  const division = context.match.divisionId ? await getDoc('divisions', context.match.divisionId) : null
  const drawResolution = ['penalties', 'penalty_shootout', 'shootout'].indexOf(String(division && division.drawResolution || context.match.drawResolution || '').toLowerCase()) >= 0 ? 'penalties' : 'draw'
  let homePenaltyScore = 0
  let awayPenaltyScore = 0
  let winnerTeamId = homeScore > awayScore ? matchTeamId(context.match, 'home') : homeScore < awayScore ? matchTeamId(context.match, 'away') : ''
  let resolution = homeScore === awayScore ? 'draw' : 'regular_time'
  if (homeScore === awayScore && drawResolution === 'penalties') {
    homePenaltyScore = scoreNumber(event.homePenaltyScore)
    awayPenaltyScore = scoreNumber(event.awayPenaltyScore)
    if (homePenaltyScore === null || awayPenaltyScore === null || homePenaltyScore === awayPenaltyScore) {
      return fail('请填写能够分出胜负的点球比分', 'PENALTY_SCORE_REQUIRED')
    }
    winnerTeamId = homePenaltyScore > awayPenaltyScore ? matchTeamId(context.match, 'home') : matchTeamId(context.match, 'away')
    resolution = 'penalties'
  }

  await db.collection('matches').doc(matchId).update({
    data: {
      status: 'finished',
      homeScore,
      awayScore,
      homePenaltyScore,
      awayPenaltyScore,
      winnerTeamId,
      resolution,
      decisionMethod: resolution,
      refereeReportStatus: 'draft',
      refereeMatchPhase: 'finished',
      refereeClockRunning: false,
      refereeClockElapsedSeconds: refereeClockSnapshot(context.match).elapsedSeconds,
      refereeClockStartedAt: null,
      refereeFinishedAt: db.serverDate(),
      refereeFinishedByOpenId: context.identity.openId,
      refereeFinishedByPhoneMasked: maskPhone(context.identity.phone),
      refereeWorkflowLogs: workflowLogs(context.match, 'finish_match', context.identity, { homeScore, awayScore, homePenaltyScore, awayPenaltyScore, winnerTeamId, resolution }),
      updateTime: db.serverDate()
    }
  })
  return ok({ homeScore, awayScore, homePenaltyScore, awayPenaltyScore, winnerTeamId, resolution }, '比分已确认，请核对事件并提交裁判报告')
}

async function addRefereeEvent(openId, event) {
  const matchId = event.matchId || ''
  const context = await getAssignedRefereeMatch(openId, matchId)
  const status = context.match.status || 'scheduled'
  if (context.match.refereeRecordLocked) return fail('裁判报告已提交，记录已锁定', 'REFEREE_RECORD_LOCKED')
  if (['ongoing', 'live', 'finished'].indexOf(status) < 0) return fail('请先开始比赛', 'MATCH_NOT_STARTED')

  const type = String(event.type || '')
  if (REFEREE_EVENT_TYPES.indexOf(type) < 0) return fail('请选择有效的事件类型', 'EVENT_TYPE_INVALID')
  const minute = Number(event.minute)
  if (!Number.isInteger(minute) || minute < 0 || minute > 130) return fail('比赛分钟须为0至130的整数', 'EVENT_MINUTE_INVALID')
  const playerName = String(event.playerName || '').trim().slice(0, 30)
  const assistName = String(event.assistName || '').trim().slice(0, 30)
  const description = String(event.description || '').trim().slice(0, 100)
  if (['stoppage_time', 'other'].indexOf(type) < 0 && !playerName) {
    return fail(type === 'substitution' ? '请输入换上球员姓名' : '请输入球员姓名', 'PLAYER_NAME_REQUIRED')
  }
  if (type === 'other' && !description) return fail('请输入事件说明', 'EVENT_DESCRIPTION_REQUIRED')
  const teamSide = event.teamSide === 'away' ? 'away' : 'home'
  const rosterPlayers = refereeRosterView(context.match, teamSide).players || []
  function selectedRosterPlayer(name,number,id) {
    const matches=rosterPlayers.filter(item=>id ? String(item.id || '')===String(id) : item.name===name && (!number || String(item.jerseyNumber || '')===String(number)))
    return matches.length===1?matches[0]:null
  }
  const rosterPlayer = type==='substitution' ? selectedRosterPlayer(playerName,event.playerNumber,event.playerId) : rosterPlayers.find(function(item) { return item.name === playerName })
  const rosterAssist = type==='substitution' ? selectedRosterPlayer(assistName,event.assistNumber,event.assistPlayerId) : rosterPlayers.find(function(item) { return item.name === assistName })
  const playerNumber = String(event.playerNumber || (rosterPlayer && rosterPlayer.jerseyNumber) || '').replace(/\D/g, '').slice(0, 3)
  const assistNumber = String(event.assistNumber || (rosterAssist && rosterAssist.jerseyNumber) || '').replace(/\D/g, '').slice(0, 3)
  if (type === 'substitution') {
    if (!assistName || !rosterAssist) return fail('请选择换下球员', 'SUBSTITUTION_OUT_REQUIRED')
    if (!rosterPlayer) return fail('请从本场名单中准确选择换上球员', 'SUB_PLAYER_UNKNOWN')
    if (rosterPlayerId(rosterPlayer) === rosterPlayerId(rosterAssist)) return fail('同一球员不能同时换上和换下', 'SUB_SAME_PLAYER')
    if ((rosterPlayers.filter(item=>item.name===playerName).length>1&&!event.playerNumber&&!event.playerId) || (rosterPlayers.filter(item=>item.name===assistName).length>1&&!event.assistNumber&&!event.assistPlayerId)) return fail('本场存在同名球员，请同时核对号码', 'SUB_PLAYER_AMBIGUOUS')
    const division = context.match.divisionId ? await getDoc('divisions',context.match.divisionId) : null
    const { substitutionRules, assertSubstitutionChange } = await import('./data-center/substitution.mjs')
    try {
      assertSubstitutionChange(context.match,substitutionRules(context.match,division || {}),[...(context.match.events || []),{
        eventId:'__pending_substitution__',type,minute,teamSide,teamId:teamSide==='away'?String(context.match.awayTeamId||''):String(context.match.homeTeamId||''),
        playerId:rosterPlayerId(rosterPlayer),inPlayerId:rosterPlayerId(rosterPlayer),playerName,playerNumber,
        assistPlayerId:rosterPlayerId(rosterAssist),outPlayerId:rosterPlayerId(rosterAssist),assistName,assistNumber
      }])
    } catch(error) { return fail(error.message || '换人记录异常，请重新核对',error.code || 'SUBSTITUTION_INVALID') }
    const sourceLineup = context.match[lineupField(teamSide)] || {}
    const substituteIds = lineupPlayers(sourceLineup, 'substitute').map(rosterPlayerId)
    if (substituteIds.includes(rosterPlayerId(rosterPlayer))) {
      const substituteCheck = sourceLineup.substituteIdentityChecks && sourceLineup.substituteIdentityChecks[rosterPlayerId(rosterPlayer)]
      if (!substituteCheck || substituteCheck.status !== 'passed') return fail('请先由第四官员完成该替补的身份核验', 'SUBSTITUTE_IDENTITY_CHECK_REQUIRED')
    }
  }
  const refereeEvent = {
    eventId: crypto.randomBytes(8).toString('hex'),
    type,
    minute,
    teamSide,
    teamId: teamSide === 'away' ? String(context.match.awayTeamId || '') : String(context.match.homeTeamId || ''),
    playerName,
    playerId: rosterPlayer ? rosterPlayerId(rosterPlayer) : '',
    inPlayerId: type==='substitution'&&rosterPlayer ? rosterPlayerId(rosterPlayer) : '',
    playerNumber,
    assistName,
    assistPlayerId: rosterAssist ? rosterPlayerId(rosterAssist) : '',
    outPlayerId: type==='substitution'&&rosterAssist ? rosterPlayerId(rosterAssist) : '',
    assistNumber,
    description,
    source: 'referee_service',
    createdAt: new Date(),
    createdByPhoneMasked: maskPhone(context.identity.phone)
  }
  const events = Array.isArray(context.match.events) ? context.match.events.slice() : []
  events.push(refereeEvent)

  const eventScore = eventScoreFromEvents(events)
  const updateData = {
    events,
    matchEventRevision: Number(context.match.matchEventRevision || 0) + 1,
    homeScore: eventScore.home,
    awayScore: eventScore.away,
    scoreHome: eventScore.home,
    scoreAway: eventScore.away,
    refereeWorkflowLogs: workflowLogs(context.match, 'add_event', context.identity, {
      eventId: refereeEvent.eventId,
      type,
      minute,
      teamSide,
      playerName
    }),
    updateTime: db.serverDate()
  }
  try {
    await db.runTransaction(async transaction=>{
      const result=await transaction.collection('matches').doc(matchId).get(),current=Array.isArray(result.data)?result.data[0]:result.data
      if(!current||current.refereeRecordLocked||Number(current.matchEventRevision||0)!==Number(context.match.matchEventRevision||0)||JSON.stringify(current.events||[])!==JSON.stringify(context.match.events||[])||JSON.stringify(current.lineups||{})!==JSON.stringify(context.match.lineups||{})||JSON.stringify(current.homeLineup||{})!==JSON.stringify(context.match.homeLineup||{})||JSON.stringify(current.awayLineup||{})!==JSON.stringify(context.match.awayLineup||{}))throw Object.assign(new Error('比赛事件或阵容已更新，请刷新后重新录入'),{code:'MATCH_EVENTS_CHANGED'})
      await transaction.collection('matches').doc(matchId).update({data:updateData})
    })
  } catch(error) { return fail(error.message||'比赛事件保存失败，请刷新后重试',error.code||'MATCH_EVENT_SAVE_FAILED') }
  return ok({ eventId: refereeEvent.eventId, homeScore: eventScore.home, awayScore: eventScore.away,matchEventRevision:updateData.matchEventRevision }, '比赛事件已保存')
}

async function deleteRefereeEvent(openId, event) {
  const matchId = event.matchId || ''
  const eventId = String(event.eventId || '')
  const context = await getAssignedRefereeMatch(openId, matchId)
  const status = context.match.status || 'scheduled'
  if (context.match.refereeRecordLocked) return fail('裁判报告已提交，记录已锁定', 'REFEREE_RECORD_LOCKED')
  if (['ongoing', 'live', 'finished'].indexOf(status) < 0) return fail('比赛尚未开始', 'MATCH_NOT_STARTED')
  const events = Array.isArray(context.match.events) ? context.match.events.slice() : []
  let index = events.findIndex(function(item) { return item && item.eventId === eventId })
  if (index < 0 && eventId.indexOf('legacy-') === 0) index = Number(eventId.slice(7))
  if (!Number.isInteger(index) || index < 0 || index >= events.length) return fail('事件不存在或已被删除', 'EVENT_NOT_FOUND')
  const removed = events.splice(index, 1)[0] || {}

  const eventScore = eventScoreFromEvents(events)
  const updateData = {
    events,
    matchEventRevision: Number(context.match.matchEventRevision || 0) + 1,
    homeScore: eventScore.home,
    awayScore: eventScore.away,
    scoreHome: eventScore.home,
    scoreAway: eventScore.away,
    refereeWorkflowLogs: workflowLogs(context.match, 'delete_event', context.identity, {
      eventId,
      type: removed.type || '',
      minute: Number(removed.minute || 0),
      teamSide: removed.teamSide || '',
      playerName: removed.playerName || ''
    }),
    updateTime: db.serverDate()
  }
  try {
    await db.runTransaction(async transaction=>{
      const result=await transaction.collection('matches').doc(matchId).get(),current=Array.isArray(result.data)?result.data[0]:result.data
      if(!current||current.refereeRecordLocked||Number(current.matchEventRevision||0)!==Number(context.match.matchEventRevision||0)||JSON.stringify(current.events||[])!==JSON.stringify(context.match.events||[])||JSON.stringify(current.lineups||{})!==JSON.stringify(context.match.lineups||{})||JSON.stringify(current.homeLineup||{})!==JSON.stringify(context.match.homeLineup||{})||JSON.stringify(current.awayLineup||{})!==JSON.stringify(context.match.awayLineup||{}))throw Object.assign(new Error('比赛事件或阵容已更新，请刷新后重试'),{code:'MATCH_EVENTS_CHANGED'})
      await transaction.collection('matches').doc(matchId).update({data:updateData})
    })
  } catch(error) { return fail(error.message||'比赛事件删除失败，请刷新后重试',error.code||'MATCH_EVENT_DELETE_FAILED') }
  return ok({ homeScore: eventScore.home, awayScore: eventScore.away,matchEventRevision:updateData.matchEventRevision }, '事件已删除')
}

async function submitRefereeReport(openId, matchId) {
  return fail('请先完成电子记录确认和签字，再提交裁判报告', 'ELECTRONIC_SIGNATURE_REQUIRED')
}

async function submitSignedRefereeRecord(openId, event) {
  const matchId = String(event.matchId || '')
  const roleContext = await requireAssignedRole(openId, matchId, ['mainReferee'])
  if (roleContext.error) return roleContext.error
  const context = { identity:roleContext.identity, match:roleContext.match }
  const match = context.match
  if (match.refereeRecordLocked || match.status === 'completed') return fail('电子比赛记录已经提交', 'REPORT_ALREADY_SUBMITTED')
  if (match.status !== 'finished') return fail('请先结束比赛并确认比分', 'MATCH_NOT_FINISHED')
  if (!match.lineupsLocked) return fail('请先完成双方阵容核验', 'LINEUPS_NOT_LOCKED')
  if (match.refereeReportStatus !== 'draft') return fail('请先保存裁判报告，再进入电子记录确认', 'REFEREE_REPORT_DRAFT_REQUIRED')
  const eventScore = Array.isArray(match.events) ? eventScoreFromEvents(match.events) : null
  const homeScore = eventScore ? eventScore.home : scoreNumber(match.homeScore)
  const awayScore = eventScore ? eventScore.away : scoreNumber(match.awayScore)
  if (homeScore === null || awayScore === null) return fail('比赛比分不完整', 'SCORE_INVALID')
  const signature = signatureStrokesView(event.signature)
  if (signature.pointCount < 8) return fail('请在签字区完成本人签字', 'SIGNATURE_REQUIRED')

  const now = new Date()
  const events = Array.isArray(match.events) ? match.events.map(function(item) { return Object.assign({}, item) }) : []
  const homeLineup = match[lineupField('home')] || {}
  const awayLineup = match[lineupField('away')] || {}
  const recordPayload = {
    matchId,
    tournamentId: match.tournamentId || '',
    division: match.division || match.groupName || '',
    homeTeamId: matchTeamId(match, 'home'),
    awayTeamId: matchTeamId(match, 'away'),
    homeScore,
    awayScore,
    events,
    homeLineup: homeLineup,
    awayLineup: awayLineup,
    refereeReportDraft: match.refereeReportDraft || {},
    preMatchState: match.preMatchState || {},
    signedByOpenId: context.identity.openId,
    signedByPhoneMasked: maskPhone(context.identity.phone),
    signedAt: now.toISOString(),
    signature: signature.strokes
  }
  const signatureHash = crypto.createHash('sha256').update(JSON.stringify(recordPayload)).digest('hex')
  const recordNumber = 'PRO-' + String(match.division || match.groupName || 'MATCH').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) + '-' + matchId.slice(-6).toUpperCase()
  const record = {
    recordNumber,
    matchId,
    tournamentId: match.tournamentId || '',
    homeTeamId: matchTeamId(match, 'home'),
    awayTeamId: matchTeamId(match, 'away'),
    homeScore,
    awayScore,
    eventCount: events.length,
    lineupSnapshotCount: (Array.isArray(homeLineup.players) ? 1 : 0) + (Array.isArray(awayLineup.players) ? 1 : 0),
    reportSnapshot: match.refereeReportDraft || {},
    submittedByOpenId: context.identity.openId,
    submittedByPhoneMasked: maskPhone(context.identity.phone),
    submittedAt: now,
    signatureStatus: 'signed',
    signatureHash,
    signaturePointCount: signature.pointCount,
    reviewStatus: 'under_review',
    version: Number(match.refereeRecordVersion || 0) + 1
  }
  await db.collection('matches').doc(matchId).update({
    data: {
      status: 'completed',
      refereeReport: record,
      refereeRecord: record,
      refereeSignature: { strokes: signature.strokes, pointCount: signature.pointCount, hash: signatureHash, signedAt: now, signedByOpenId: context.identity.openId },
      refereeRecordPayload: recordPayload,
      refereeReviewStatus: 'under_review',
      refereeReportStatus: 'submitted',
      refereeRecordLocked: true,
      refereeReportSubmittedAt: db.serverDate(),
      refereeWorkflowLogs: workflowLogs(match, 'submit_signed_record', context.identity, { recordNumber, homeScore, awayScore, eventCount: events.length, signatureHash }),
      updateTime: db.serverDate()
    }
  })
  await writeAudit('submit_signed_referee_record', { matchId, tournamentId: match.tournamentId || '', recordNumber, homeScore, awayScore, eventCount: events.length, signatureHash }, context.identity)
  return ok({ record: refereeRecordView({ refereeRecord: record }) }, '电子比赛记录已提交，等待主办方赛果复核')
}

function returnedEventFieldAllowed(request, eventId) {
  const fields = request && Array.isArray(request.fields) ? request.fields.map(String) : []
  return fields.indexOf('event_player') >= 0 || fields.indexOf('event_player:' + eventId) >= 0
}

async function saveReturnedRecordCorrection(openId, event) {
  const matchId = String(event.matchId || '')
  const context = await getAssignedRefereeMatch(openId, matchId)
  const match = context.match
  const record = match.refereeRecord && typeof match.refereeRecord === 'object' ? match.refereeRecord : null
  const request = match.returnRequest && typeof match.returnRequest === 'object' ? match.returnRequest : null
  if (!record || match.refereeReviewStatus !== 'returned' || !request) return fail('当前记录不在退回修正状态', 'RETURN_CORRECTION_NOT_AVAILABLE')
  const eventId = String(event.eventId || '')
  if (!returnedEventFieldAllowed(request, eventId)) return fail('主办方未授权修改该比赛事件', 'RETURN_FIELD_FORBIDDEN')
  const events = Array.isArray(match.events) ? match.events : []
  const sourceEvent = events.find(function(item) { return item && String(item.eventId || '') === eventId })
  if (!sourceEvent) return fail('指定的比赛事件不存在', 'RETURN_EVENT_NOT_FOUND')
  const playerName = String(event.playerName || '').trim().slice(0, 30)
  const playerNumber = String(event.playerNumber || '').replace(/\D/g, '').slice(0, 3)
  const reason = String(event.reason || '').trim().slice(0, 300)
  if (!playerName || !reason) return fail('请填写修正后的球员和修改原因', 'RETURN_CORRECTION_REQUIRED')
  const correction = {
    eventId,
    field: 'event_player',
    before: { playerName: String(sourceEvent.playerName || ''), playerNumber: String(sourceEvent.playerNumber || '') },
    after: { playerName, playerNumber },
    reason,
    savedAt: new Date(),
    savedByPhoneMasked: maskPhone(context.identity.phone)
  }
  await db.collection('matches').doc(matchId).update({ data: {
    returnedCorrectionDraft: correction,
    refereeWorkflowLogs: workflowLogs(match, 'save_returned_correction', context.identity, { eventId, field: 'event_player' }),
    updateTime: db.serverDate()
  } })
  await writeAudit('save_returned_referee_correction', { matchId, tournamentId: match.tournamentId || '', eventId, field: 'event_player', before: correction.before, after: correction.after, reason }, context.identity)
  return ok({ correction }, '限定范围修正已暂存，请重新签字提交')
}

async function resubmitReturnedRecord(openId, event) {
  const matchId = String(event.matchId || '')
  const roleContext = await requireAssignedRole(openId, matchId, ['mainReferee'])
  if (roleContext.error) return roleContext.error
  const context = { identity:roleContext.identity, match:roleContext.match }
  const match = context.match
  const oldRecord = match.refereeRecord && typeof match.refereeRecord === 'object' ? match.refereeRecord : null
  const request = match.returnRequest && typeof match.returnRequest === 'object' ? match.returnRequest : null
  const correction = match.returnedCorrectionDraft && typeof match.returnedCorrectionDraft === 'object' ? match.returnedCorrectionDraft : null
  if (!oldRecord || match.refereeReviewStatus !== 'returned' || !request || !correction) return fail('请先完成主办方指定范围内的修正', 'RETURN_CORRECTION_REQUIRED')
  if (!returnedEventFieldAllowed(request, String(correction.eventId || ''))) return fail('修正范围已失效，请重新查看退回要求', 'RETURN_FIELD_FORBIDDEN')
  const signature = signatureStrokesView(event.signature)
  if (signature.pointCount < 8) return fail('请在签字区完成本人签字', 'SIGNATURE_REQUIRED')
  const events = (Array.isArray(match.events) ? match.events : []).map(function(item) {
    if (!item || String(item.eventId || '') !== String(correction.eventId || '')) return Object.assign({}, item)
    return Object.assign({}, item, correction.after || {})
  })
  const now = new Date()
  const payload = Object.assign({}, match.refereeRecordPayload || {}, { events, correction, signedAt: now.toISOString(), signature: signature.strokes })
  const signatureHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  const record = Object.assign({}, oldRecord, {
    submittedAt: now,
    submittedByOpenId: context.identity.openId,
    submittedByPhoneMasked: maskPhone(context.identity.phone),
    signatureStatus: 'signed',
    signatureHash,
    signaturePointCount: signature.pointCount,
    reviewStatus: 'under_review',
    version: Number(oldRecord.version || match.refereeRecordVersion || 1) + 1,
    correction: correction,
    returnRequest: null
  })
  const history = Array.isArray(match.refereeRecordHistory) ? match.refereeRecordHistory.slice(-19) : []
  history.push({ record: oldRecord, signature: match.refereeSignature || null, returnedAt: request.returnedAt || null, returnRequest: request })
  await db.collection('matches').doc(matchId).update({ data: {
    events,
    refereeRecord: record,
    refereeReport: record,
    refereeRecordPayload: payload,
    refereeSignature: { strokes: signature.strokes, pointCount: signature.pointCount, hash: signatureHash, signedAt: now, signedByOpenId: context.identity.openId },
    refereeRecordHistory: history,
    refereeRecordVersion: record.version,
    refereeReviewStatus: 'under_review',
    refereeRecordLocked: true,
    returnRequest: null,
    returnedCorrectionDraft: null,
    refereeReportStatus: 'submitted',
    refereeWorkflowLogs: workflowLogs(match, 'resubmit_signed_record', context.identity, { recordNumber: record.recordNumber, version: record.version, eventId: correction.eventId, signatureHash }),
    updateTime: db.serverDate()
  } })
  await writeAudit('resubmit_signed_referee_record', { matchId, tournamentId: match.tournamentId || '', recordNumber: record.recordNumber, version: record.version, correction, signatureHash }, context.identity)
  return ok({ record: refereeRecordView({ refereeRecord: record }) }, '修正后的电子比赛记录已重新提交，等待主办方复核')
}

async function saveRefereeReportDraft(openId, event) {
  const matchId = String(event.matchId || '')
  const roleContext = await requireAssignedRole(openId, matchId, ['mainReferee'])
  if (roleContext.error) return roleContext.error
  const context = { identity:roleContext.identity, match:roleContext.match }
  const match = context.match
  if (match.refereeRecordLocked || match.status === 'completed') return fail('裁判报告已锁定，不能再修改', 'REPORT_ALREADY_SUBMITTED')
  if (match.status !== 'finished') return fail('请先结束比赛并确认比分', 'MATCH_NOT_FINISHED')
  const rawSections = event.sections && typeof event.sections === 'object' ? event.sections : {}
  const sections = {}
  let hasAbnormal = false
  REFEREE_REPORT_SECTIONS.forEach(function(key) {
    const raw = rawSections[key] && typeof rawSections[key] === 'object' ? rawSections[key] : {}
    const status = raw.status === 'abnormal' ? 'abnormal' : 'normal'
    const note = String(raw.note || '').trim().slice(0, 500)
    if (status === 'abnormal' && !note) {
      const error = new Error('异常报告项必须填写说明')
      error.code = 'REPORT_ABNORMAL_NOTE_REQUIRED'
      throw error
    }
    if (status === 'abnormal') hasAbnormal = true
    sections[key] = { status, note }
  })
  const conclusion = event.conclusion === 'abnormal' || hasAbnormal ? 'abnormal' : 'normal'
  const draft = { conclusion, sections, savedAt: new Date(), savedByPhoneMasked: maskPhone(context.identity.phone) }
  await db.collection('matches').doc(matchId).update({ data: {
    refereeReportDraft: draft,
    refereeReportStatus: 'draft',
    refereeWorkflowLogs: workflowLogs(match, 'save_report_draft', context.identity, { conclusion, hasAbnormal }),
    updateTime: db.serverDate()
  } })
  return ok({ draft }, '裁判报告已暂存')
}

async function getRefereeLineup(openId, matchId, side) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')
  const safeSide = side === 'away' ? 'away' : 'home'
  const lineup = match[lineupField(safeSide)] || {}
  const players = (Array.isArray(lineup.starters) ? lineup.starters : (Array.isArray(lineup.players) ? lineup.players : [])).map(sanitizePlayer)
  return ok({
    side: safeSide,
    teamId: matchTeamId(match, safeSide),
    teamName: await getTeamName(matchTeamId(match, safeSide), matchTeamName(match, safeSide)),
    lineupStatus: lineupStatus(match, safeSide),
    lineupStatusText: lineupStatusText(lineupStatus(match, safeSide)),
    players
  })
}

async function ensureMatchIdentityCollections() {
  for (const name of ['match_identity_checks', 'match_lineup_confirmation_audits', 'adult_match_passes']) {
    try { await db.createCollection(name) } catch (error) {
      if (!/exist|already|duplicate/i.test(String(error && error.message || ''))) console.warn('[matchIdentity] collection prepare skipped:', name, error.message || error)
    }
  }
}

function lineupPlayers(lineup, role) {
  if (role === 'substitute') return Array.isArray(lineup && lineup.substitutes) ? lineup.substitutes : []
  return Array.isArray(lineup && lineup.starters) ? lineup.starters : (Array.isArray(lineup && lineup.players) ? lineup.players : [])
}

function identityReady(player) {
  return ['verified','approved','complete','manual_required'].indexOf(String(player && player.identityStatus || '').toLowerCase()) >= 0
}

function lineupIdentityProgress(lineup) {
  const starters = lineupPlayers(lineup, 'starter')
  const checks = lineup && lineup.identityChecks && typeof lineup.identityChecks === 'object' ? lineup.identityChecks : {}
  const passed = starters.filter(function(player) { return checks[rosterPlayerId(player)] && checks[rosterPlayerId(player)].status === 'passed' }).length
  const exception = starters.filter(function(player) { return checks[rosterPlayerId(player)] && checks[rosterPlayerId(player)].status === 'exception' }).length
  return { total:starters.length, passed, exception, pending:Math.max(0, starters.length - passed - exception), complete:starters.length > 0 && passed === starters.length }
}

async function matchParticipantType(match) {
  const division = match.divisionId ? await getDoc('divisions', match.divisionId) : null
  const explicit = String(firstNonEmpty(division && division.participantType, division && division.audienceType, match.participantType, '')).toLowerCase()
  if (['adult','youth'].indexOf(explicit) >= 0) return explicit
  const label = String(firstNonEmpty(division && division.name, match.divisionName, '')).toLowerCase()
  return /成人|adult|公开组/.test(label) ? 'adult' : 'youth'
}

function identityTaskPlayerView(player, lineup, role) {
  const id = rosterPlayerId(player)
  const checks = role === 'substitute' ? (lineup.substituteIdentityChecks || {}) : (lineup.identityChecks || {})
  const check = checks[id] || {}
  const safe = sanitizePlayer(player)
  return Object.assign({}, safe, {
    id,
    role,
    checkStatus:String(check.status || 'pending'),
    checkStatusText:check.status === 'passed' ? '已通过' : (check.status === 'exception' ? '异常' : '待核验'),
    checkMethod:String(check.method || ''),
    exceptionReason:String(check.reason || '')
  })
}

async function getIdentityVerificationTask(openId, event) {
  const matchId = String(event.matchId || '')
  const context = await requireAssignedRole(openId, matchId, ['mainReferee','fourthOfficial','assistant1','assistant2'])
  if (context.error) return context.error
  const match = context.match
  const role = String(context.assignment.role || '')
  const side = role === 'assistant1' ? 'home' : (role === 'assistant2' ? 'away' : (event.side === 'away' ? 'away' : 'home'))
  const lineup = match[lineupField(side)] || {}
  const confirmations = lineup.confirmations && typeof lineup.confirmations === 'object' ? lineup.confirmations : {}
  const participantType = await matchParticipantType(match)
  return ok({
    matchId,
    role,
    roleLabel:String(context.assignment.roleLabel || ''),
    canOpenMatch:Boolean(context.assignment.canOperate),
    side,
    participantType,
    teamId:matchTeamId(match, side),
    teamName:await getTeamName(matchTeamId(match, side), matchTeamName(match, side)),
    opponentName:await getTeamName(matchTeamId(match, side === 'home' ? 'away' : 'home'), matchTeamName(match, side === 'home' ? 'away' : 'home')),
    matchTimeText:matchTimeText(match),
    venue:String(firstNonEmpty(match.venue, match.field, match.location, '场地待定')),
    matchStatus:String(match.status || 'scheduled'),
    lineupStatus:lineupStatus(match, side),
    fourthConfirmed:Boolean(confirmations.fourthOfficial && confirmations.fourthOfficial.status === 'approved'),
    mainConfirmed:Boolean(confirmations.mainReferee && confirmations.mainReferee.status === 'approved'),
    canFourthConfirm:role === 'fourthOfficial' && lineupStatus(match, side) === 'submitted',
    canMainConfirm:role === 'mainReferee' && Boolean(confirmations.fourthOfficial && confirmations.fourthOfficial.status === 'approved') && !Boolean(confirmations.mainReferee && confirmations.mainReferee.status === 'approved'),
    canVerifyStarters:(role === 'assistant1' && side === 'home') || (role === 'assistant2' && side === 'away'),
    canVerifySubstitutes:role === 'fourthOfficial' && ['ongoing','live'].indexOf(String(match.status || '')) >= 0,
    progress:lineupIdentityProgress(lineup),
    starters:lineupPlayers(lineup, 'starter').map(function(player) { return identityTaskPlayerView(player, lineup, 'starter') }),
    substitutes:lineupPlayers(lineup, 'substitute').map(function(player) { return identityTaskPlayerView(player, lineup, 'substitute') })
  })
}

async function previewAdultMatchPass(openId, event) {
  const matchId = String(event.matchId || '')
  const context = await requireAssignedRole(openId, matchId, ['assistant1','assistant2'])
  if (context.error) return context.error
  const side = String(context.assignment.role || '') === 'assistant2' ? 'away' : 'home'
  if (await matchParticipantType(context.match) !== 'adult') return fail('青少年赛事直接按本方名单核验，不使用二维码', 'ADULT_PASS_NOT_APPLICABLE')
  const validated = await validateAdultMatchPass(event.passToken, context.match, side, '')
  if (!validated.success) return validated.error
  const lineup = context.match[lineupField(side)] || {}
  const player = lineupPlayers(lineup, 'starter').concat(lineupPlayers(lineup, 'substitute')).find(item => rosterPlayerId(item) === String(validated.pass.playerId || ''))
  if (!player) return fail('持证球员不在本场锁定阵容中', 'PLAYER_NOT_IN_MATCH_LINEUP')
  return ok({ matchId, side, passId:String(validated.pass._id || ''), player:Object.assign({}, sanitizePlayer(player), { id:rosterPlayerId(player), role:lineupPlayers(lineup, 'starter').some(item => rosterPlayerId(item) === rosterPlayerId(player)) ? 'starter' : 'substitute' }) }, '请当面核对照片与本人')
}

async function confirmLineupStage(openId, event) {
  const matchId = String(event.matchId || '')
  const side = event.side === 'away' ? 'away' : 'home'
  const stage = event.stage === 'main' ? 'main' : 'fourth'
  const requiredRole = stage === 'main' ? 'mainReferee' : 'fourthOfficial'
  const context = await requireAssignedRole(openId, matchId, [requiredRole])
  if (context.error) return context.error
  if (!preMatchStateView(context.match).completed) return fail('请先完成三方报到和赛前检查', 'PRE_MATCH_INCOMPLETE')
  if (['scheduled','pending','checked_in'].indexOf(String(context.match.status || 'scheduled')) < 0) return fail('当前比赛状态不能确认阵容', 'LINEUP_CONFIRMATION_NOT_AVAILABLE')
  const lineup = Object.assign({}, context.match[lineupField(side)] || {})
  if (!lineupPlayers(lineup, 'starter').length) return fail('球队尚未提交首发阵容', 'LINEUP_NOT_SUBMITTED')
  lineup.confirmations = Object.assign({}, lineup.confirmations || {})
  const decision = event.decision === 'returned' ? 'returned' : 'approved'
  const reason = String(event.reason || '').trim().slice(0,200)
  if (decision === 'returned' && !reason) return fail('退回阵容时必须填写原因', 'LINEUP_RETURN_REASON_REQUIRED')
  if (stage === 'main' && !(lineup.confirmations.fourthOfficial && lineup.confirmations.fourthOfficial.status === 'approved')) return fail('请等待第四官员完成初审', 'FOURTH_CONFIRMATION_REQUIRED')
  const confirmation = { status:decision, reason:decision === 'returned' ? reason : '', confirmedAt:new Date(), confirmedByRefereeId:String(context.assignment.refereeId || ''), confirmedByPhoneMasked:maskPhone(context.identity.phone), lineupVersion:Number(lineup.version || 1) }
  lineup.confirmations[requiredRole] = confirmation
  const updateData = { lineupsLocked:false, identityVerificationStatus:'pending', updateTime:db.serverDate() }
  if (decision === 'returned') {
    lineup.status = 'returned'; lineup.submitted = false; lineup.returnReason = reason; lineup.identityChecks = {}
    updateData[lineupStatusField(side)] = 'returned'
  } else if (stage === 'fourth') {
    lineup.status = 'fourth_approved'; updateData[lineupStatusField(side)] = 'fourth_approved'
  } else {
    lineup.status = 'identity_check'; updateData[lineupStatusField(side)] = 'identity_check'; updateData.identityVerificationStatus = 'in_progress'
  }
  updateData[lineupField(side)] = lineup
  await ensureMatchIdentityCollections()
  await db.collection('matches').doc(matchId).update({ data:updateData })
  await db.collection('match_lineup_confirmation_audits').add({ data:{ matchId, tournamentId:String(context.match.tournamentId || ''), side, stage, role:requiredRole, decision, reason, lineupVersion:Number(lineup.version || 1), refereeId:String(context.assignment.refereeId || ''), createTime:db.serverDate() } })
  await writeAudit('confirm_lineup_' + stage, { matchId, tournamentId:context.match.tournamentId || '', side, stage, decision, reason, lineupVersion:Number(lineup.version || 1) }, context.identity)
  return ok({ side, stage, decision, lineupStatus:updateData[lineupStatusField(side)] }, decision === 'returned' ? '阵容已退回球队修改' : (stage === 'fourth' ? '第四官员初审完成' : '主裁判已确认，已发送助理裁判核验'))
}

async function verifyLineupPlayer(openId, event) {
  const matchId = String(event.matchId || '')
  const side = event.side === 'away' ? 'away' : 'home'
  const requiredRole = side === 'home' ? 'assistant1' : 'assistant2'
  const context = await requireAssignedRole(openId, matchId, [requiredRole])
  if (context.error) return context.error
  const lineup = Object.assign({}, context.match[lineupField(side)] || {})
  const confirmations = lineup.confirmations || {}
  if (!(confirmations.mainReferee && confirmations.mainReferee.status === 'approved')) return fail('请等待主裁判确认阵容', 'MAIN_CONFIRMATION_REQUIRED')
  const playerId = String(event.playerId || '')
  const player = lineupPlayers(lineup, 'starter').find(function(item) { return rosterPlayerId(item) === playerId })
  if (!player) return fail('该球员不在本场首发名单中', 'STARTER_NOT_FOUND')
  const decision = event.decision === 'exception' ? 'exception' : 'passed'
  const method = ['visual','adult_qr','face_exception','manual_document'].indexOf(String(event.method || '')) >= 0 ? String(event.method) : 'visual'
  const reason = String(event.reason || '').trim().slice(0,200)
  if (decision === 'passed' && !identityReady(player)) return fail('该球员尚未完成人证核验，不能现场通过', 'PLAYER_IDENTITY_NOT_READY')
  if (decision === 'passed' && await matchParticipantType(context.match) === 'adult') {
    if (method !== 'manual_document') {
      if (method !== 'adult_qr') return fail('成人赛事请先扫描本场电子参赛证', 'ADULT_MATCH_PASS_REQUIRED')
      const validated = await validateAdultMatchPass(event.passToken, context.match, side, playerId)
      if (!validated.success) return validated.error
    }
  }
  if (decision === 'exception' && !reason) return fail('请填写身份异常原因', 'IDENTITY_EXCEPTION_REASON_REQUIRED')
  lineup.identityChecks = Object.assign({}, lineup.identityChecks || {})
  lineup.identityChecks[playerId] = { status:decision, method, reason:decision === 'exception' ? reason : '', checkedAt:new Date(), checkedByRole:requiredRole, checkedByRefereeId:String(context.assignment.refereeId || ''), checkedByPhoneMasked:maskPhone(context.identity.phone), lineupVersion:Number(lineup.version || 1) }
  const currentProgress = lineupIdentityProgress(lineup)
  lineup.status = currentProgress.complete ? 'identity_verified' : 'identity_check'
  const otherSide = side === 'home' ? 'away' : 'home'
  const otherLineup = context.match[lineupField(otherSide)] || {}
  const otherProgress = lineupIdentityProgress(otherLineup)
  const allPassed = currentProgress.complete && otherProgress.complete
  const updateData = { updateTime:db.serverDate(), identityVerificationStatus:allPassed ? 'completed' : 'in_progress', lineupsLocked:allPassed }
  updateData[lineupField(side)] = lineup
  updateData[lineupStatusField(side)] = allPassed || currentProgress.complete ? 'locked' : 'identity_check'
  if (allPassed) {
    const lockedOther = Object.assign({}, otherLineup, { status:'locked' })
    lineup.status = 'locked'; updateData[lineupField(side)] = lineup; updateData[lineupField(otherSide)] = lockedOther; updateData[lineupStatusField(otherSide)] = 'locked'; updateData.lineupsLockedAt = db.serverDate()
  }
  await ensureMatchIdentityCollections()
  await db.collection('matches').doc(matchId).update({ data:updateData })
  await db.collection('match_identity_checks').add({ data:{ matchId, tournamentId:String(context.match.tournamentId || ''), teamId:matchTeamId(context.match, side), side, playerId, playerName:String(player.name || ''), playerRole:'starter', decision, method, reason, refereeRole:requiredRole, refereeId:String(context.assignment.refereeId || ''), lineupVersion:Number(lineup.version || 1), createTime:db.serverDate() } })
  await writeAudit('verify_lineup_player', { matchId, tournamentId:context.match.tournamentId || '', side, playerId, decision, method, reason }, context.identity)
  return ok({ side, playerId, decision, progress:currentProgress, lineupsLocked:allPassed }, decision === 'passed' ? '球员身份核验通过' : '已标记身份异常')
}

async function replaceFailedStarter(openId, event) {
  const matchId = String(event.matchId || '')
  const side = event.side === 'away' ? 'away' : 'home'
  const context = await requireAssignedRole(openId, matchId, ['fourthOfficial'])
  if (context.error) return context.error
  const lineup = Object.assign({}, context.match[lineupField(side)] || {})
  const failedPlayerId = String(event.failedPlayerId || ''), substitutePlayerId = String(event.substitutePlayerId || '')
  const starters = lineupPlayers(lineup, 'starter').slice(), substitutes = lineupPlayers(lineup, 'substitute').slice()
  const starterIndex = starters.findIndex(item => rosterPlayerId(item) === failedPlayerId)
  const substituteIndex = substitutes.findIndex(item => rosterPlayerId(item) === substitutePlayerId)
  if (starterIndex < 0 || substituteIndex < 0) return fail('请选择异常首发和本场合格替补', 'LINEUP_REPLACEMENT_INVALID')
  const failedCheck = lineup.identityChecks && lineup.identityChecks[failedPlayerId]
  if (!failedCheck || failedCheck.status !== 'exception') return fail('只有已标记身份异常的首发可以替换', 'STARTER_NOT_EXCEPTION')
  const incoming = substitutes[substituteIndex]
  if (!identityReady(incoming)) return fail('替补尚未完成人证核验，不能替换首发', 'SUBSTITUTE_IDENTITY_NOT_READY')
  const outgoing = starters[starterIndex]
  starters[starterIndex] = incoming
  substitutes[substituteIndex] = outgoing
  const history = Array.isArray(lineup.preMatchRevisionHistory) ? lineup.preMatchRevisionHistory.slice(-19) : []
  history.push({ type:'identity_exception_replacement', outgoingPlayerId:failedPlayerId, incomingPlayerId:substitutePlayerId, reason:String(event.reason || failedCheck.reason || '身份核验异常').slice(0,200), noSubstitutionQuota:true, revisedAt:new Date(), revisedByRole:'fourthOfficial' })
  lineup.starters = starters; lineup.players = starters; lineup.substitutes = substitutes; lineup.preMatchRevisionHistory = history; lineup.version = Number(lineup.version || 1) + 1; lineup.identityChecks = {}; lineup.confirmations = { fourthOfficial:{ status:'approved', confirmedAt:new Date(), confirmedByRefereeId:String(context.assignment.refereeId || ''), lineupVersion:lineup.version, reason:'身份异常首发替换' } }; lineup.status = 'fourth_approved'
  const updateData = { lineupsLocked:false, identityVerificationStatus:'pending_main_reconfirmation', updateTime:db.serverDate() }
  updateData[lineupField(side)] = lineup; updateData[lineupStatusField(side)] = 'fourth_approved'
  await db.collection('matches').doc(matchId).update({ data:updateData })
  await writeAudit('replace_failed_starter', { matchId, tournamentId:context.match.tournamentId || '', side, failedPlayerId, substitutePlayerId, noSubstitutionQuota:true, lineupVersion:lineup.version }, context.identity)
  return ok({ side, lineupVersion:lineup.version, noSubstitutionQuota:true }, '异常首发已替换，等待主裁判重新确认')
}

async function verifySubstituteIdentity(openId, event) {
  const matchId = String(event.matchId || '')
  const side = event.side === 'away' ? 'away' : 'home'
  const context = await requireAssignedRole(openId, matchId, ['fourthOfficial'])
  if (context.error) return context.error
  if (['ongoing','live'].indexOf(String(context.match.status || '')) < 0) return fail('替补身份在比赛进行中、上场前核验', 'SUBSTITUTE_CHECK_NOT_AVAILABLE')
  const lineup = Object.assign({}, context.match[lineupField(side)] || {})
  const playerId = String(event.playerId || '')
  const player = lineupPlayers(lineup, 'substitute').find(item => rosterPlayerId(item) === playerId)
  if (!player) return fail('该球员不在本场替补名单中', 'SUBSTITUTE_NOT_FOUND')
  const decision = event.decision === 'exception' ? 'exception' : 'passed'
  const reason = String(event.reason || '').trim().slice(0,200)
  if (decision === 'passed' && !identityReady(player)) return fail('该替补尚未完成人证核验', 'SUBSTITUTE_IDENTITY_NOT_READY')
  if (decision === 'exception' && !reason) return fail('请填写替补身份异常原因', 'IDENTITY_EXCEPTION_REASON_REQUIRED')
  lineup.substituteIdentityChecks = Object.assign({}, lineup.substituteIdentityChecks || {})
  lineup.substituteIdentityChecks[playerId] = { status:decision, method:String(event.method || 'visual'), reason, checkedAt:new Date(), checkedByRole:'fourthOfficial', checkedByRefereeId:String(context.assignment.refereeId || '') }
  const updateData = { updateTime:db.serverDate() }; updateData[lineupField(side)] = lineup
  await db.collection('matches').doc(matchId).update({ data:updateData })
  await ensureMatchIdentityCollections()
  await db.collection('match_identity_checks').add({ data:{ matchId, tournamentId:String(context.match.tournamentId || ''), teamId:matchTeamId(context.match, side), side, playerId, playerName:String(player.name || ''), playerRole:'substitute', decision, method:String(event.method || 'visual'), reason, refereeRole:'fourthOfficial', refereeId:String(context.assignment.refereeId || ''), createTime:db.serverDate() } })
  return ok({ side, playerId, decision }, decision === 'passed' ? '替补身份核验通过，可以办理换人' : '替补身份异常，禁止上场')
}

async function reviewLineup(openId, event) {
  const identity = await requireIdentity(openId)
  const matchId = event.matchId || ''
  const side = event.side === 'away' ? 'away' : 'home'
  const decision = event.decision === 'returned' ? 'returned' : 'verified'
  const returnReason = String(event.reason || '').trim().slice(0, 200)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')

  const currentStatus = lineupStatus(match, side)
  if (currentStatus !== 'submitted') return fail('当前名单不是待核验状态', 'LINEUP_NOT_REVIEWABLE')
  const status = match.status || 'scheduled'
  if (match.refereeRecordLocked || match.lineupsLocked) return fail('lineups locked', 'LINEUP_LOCKED')
  if (['scheduled', 'pending', 'checked_in'].indexOf(status) < 0) return fail('lineup review is not available for this match status', 'LINEUP_REVIEW_NOT_AVAILABLE')
  if (!preMatchStateView(match).completed) return fail('pre-match checklist is incomplete', 'PRE_MATCH_INCOMPLETE')

  const lineup = Object.assign({}, match[lineupField(side)] || {})
  const updateData = { updateTime: db.serverDate() }

  if (decision === 'returned') {
    if (!returnReason) return fail('请填写阵容异常原因', 'LINEUP_RETURN_REASON_REQUIRED')
    lineup.status = 'returned'
    lineup.submitted = false
    lineup.returnedAt = db.serverDate()
    lineup.returnedByPhoneMasked = maskPhone(identity.phone)
    lineup.returnReason = returnReason
    updateData[lineupField(side)] = lineup
    updateData[lineupStatusField(side)] = 'returned'
  } else {
    lineup.status = 'verified'
    lineup.verifiedAt = db.serverDate()
    lineup.verifiedByPhoneMasked = maskPhone(identity.phone)
    updateData[lineupField(side)] = lineup
    updateData[lineupStatusField(side)] = 'verified'

    const otherSide = side === 'home' ? 'away' : 'home'
    if (lineupStatus(match, otherSide) === 'verified') {
      const otherLineup = Object.assign({}, match[lineupField(otherSide)] || {})
      lineup.status = 'locked'
      otherLineup.status = 'locked'
      updateData[lineupField(side)] = lineup
      updateData[lineupField(otherSide)] = otherLineup
      updateData[lineupStatusField(side)] = 'locked'
      updateData[lineupStatusField(otherSide)] = 'locked'
      updateData.lineupsLocked = true
      updateData.lineupsLockedAt = db.serverDate()
    }
  }

  await db.collection('matches').doc(matchId).update({ data: updateData })
  await writeAudit(decision === 'returned' ? 'return_lineup' : 'verify_lineup', {
    matchId,
    tournamentId: match.tournamentId || '',
    teamId: matchTeamId(match, side),
    side,
    reason: decision === 'returned' ? returnReason : ''
  }, identity)
  return ok({ decision, lineupsLocked: !!updateData.lineupsLocked }, decision === 'returned' ? '已退回球队修改' : '名单核验通过')
}

async function resetClaim(openId, matchId, side) {
  const identity = await requireIdentity(openId)
  const match = await getDoc('matches', matchId)
  if (!match) return fail('比赛不存在', 'MATCH_NOT_FOUND')
  match._id = match._id || matchId
  if (!(await isAssignedReferee(identity, match))) return fail('您不是本场已指派裁判', 'REFEREE_FORBIDDEN')
  const safeSide = side === 'away' ? 'away' : 'home'
  const currentStatus = lineupStatus(match, safeSide)
  if (['submitted', 'verified', 'locked'].indexOf(currentStatus) >= 0) {
    return fail('球队已提交首发，不能直接重置认领', 'CLAIM_RESET_FORBIDDEN')
  }

  const teamId = matchTeamId(match, safeSide)
  const claim = await getActiveClaim(match.tournamentId || '', teamId)
  if (claim) {
    await db.collection('tournament_team_claims').doc(claim._id).update({
      data: {
        status: 'revoked',
        revokedAt: db.serverDate(),
        revokedByPhoneMasked: maskPhone(identity.phone),
        updateTime: db.serverDate()
      }
    })
  }
  const token = await createClaimToken(match, safeSide, openId)
  const updateData = { updateTime: db.serverDate() }
  updateData[lineupStatusField(safeSide)] = 'unclaimed'
  await db.collection('matches').doc(matchId).update({ data: updateData })
  await writeAudit('reset_team_claim', {
    matchId,
    tournamentId: match.tournamentId || '',
    teamId,
    side: safeSide
  }, identity)
  return ok({ claimCode: token._id }, '认领已重置')
}

exports.main = async function(event) {
  event = event || {}
  const action = event.action || 'getWorkbench'
  const wxContext = cloud.getWXContext()
  let openId = wxContext.OPENID || ''

  if (event.__refereeSessionToken) {
    const h5Session = await authenticateRefereeH5Session(event.__refereeSessionToken)
    if (!h5Session) return fail('服务号登录状态已失效，请重新进入赛事工作台', 'H5_AUTH_REQUIRED')
    openId = h5Session.workflowOpenId
  }

  try {
    if (action === 'sendBindSms') return await sendBindSms(openId, event.phone)
    if (action === 'getRefereeInvitation') return await getRefereeInvitation(openId,event)
    if (action === 'acceptRefereeInvitation') return await acceptRefereeInvitation(openId,event)
    if (action === 'recognizeRefereeCertificate') return await recognizeRefereeCertificate(openId,event)
    if (action === 'processRefereeAvatar') return await processRefereeAvatar(openId,event)
    if (action === 'verifyBindSms') return await verifyBindSms(openId, event.phone, event.code)
    if (action === 'getWorkbench') return await getWorkbench(openId)
    if (action === 'getHeadRefereeSchedule') return await getHeadRefereeSchedule(openId,event)
    if (action === 'assignHeadRefereeCrew') return await assignHeadRefereeCrew(openId,event,event.__refereeSessionToken)
    if (action === 'getRefereeMatch') return await getRefereeMatch(openId, event.matchId)
    if (action === 'getLineupTask') return await getLineupTask(openId, event.matchId, event.teamId)
    if (action === 'submitLineup') return await submitLineup(openId, event)
    if (action === 'submitLineupLegacy') return await submitLegacyLineup(openId, event)
    if (action === 'updatePreMatchState') return await updatePreMatchState(openId, event)
    if (action === 'reviewLineup') return await reviewLineup(openId, event)
    if (action === 'getIdentityVerificationTask') return await getIdentityVerificationTask(openId, event)
    if (action === 'previewAdultMatchPass') return await previewAdultMatchPass(openId, event)
    if (action === 'confirmLineupStage') return await confirmLineupStage(openId, event)
    if (action === 'verifyLineupPlayer') return await verifyLineupPlayer(openId, event)
    if (action === 'replaceFailedStarter') return await replaceFailedStarter(openId, event)
    if (action === 'verifySubstituteIdentity') return await verifySubstituteIdentity(openId, event)
    if (action === 'saveRefereeReportDraft') return await saveRefereeReportDraft(openId, event)
    if (action === 'submitSignedRefereeRecord') return await submitSignedRefereeRecord(openId, event)
    if (action === 'saveReturnedRecordCorrection') return await saveReturnedRecordCorrection(openId, event)
    if (action === 'resubmitReturnedRecord') return await resubmitReturnedRecord(openId, event)
    if (action === 'recognizeRefereeRoster') return await recognizeRefereeRoster(openId, event)
    if (action === 'saveRefereeRoster') return await saveRefereeRoster(openId, event)
    if (action === 'startRefereeMatch') return await startRefereeMatch(openId, event.matchId)
    if (action === 'controlRefereeClock') return await controlRefereeClock(openId, event)
    if (action === 'finishRefereeMatch') return await finishRefereeMatch(openId, event)
    if (action === 'addRefereeEvent') return await addRefereeEvent(openId, event)
    if (action === 'deleteRefereeEvent') return await deleteRefereeEvent(openId, event)
    if (action === 'submitRefereeReport') return await submitRefereeReport(openId, event.matchId)
    return fail('不支持的操作', 'ACTION_NOT_SUPPORTED')
  } catch (error) {
    console.error('[serviceMatchWorkflow] action failed:', action, error)
    return publicWorkflowError(error)
  }
}
