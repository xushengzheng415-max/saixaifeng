const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 90000 })
const db = cloud.database()
const command = db.command
const text = value => String(value == null ? '' : value).trim()
const hash = value => crypto.createHash('sha256').update(text(value)).digest('hex')

function response(statusCode, data, origin) {
  return { statusCode, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  }, body: JSON.stringify(data) }
}

function parseInput(event) {
  if (event && event.body && typeof event.body === 'object') return event.body
  const raw = text(event && event.body)
  if (!raw) return event || {}
  const decoded = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw
  try { return JSON.parse(decoded) } catch (_) { throw new Error('请求内容格式不正确') }
}

async function getDoc(collection, id) {
  if (!id) return null
  try { const result = await db.collection(collection).doc(id).get(); return Array.isArray(result.data) ? result.data[0] || null : result.data || null }
  catch (_) { return null }
}

async function authenticate(token, orgId) {
  if (!token || !orgId) throw new Error('请先登录主办方 PC 后台')
  const sessions = (await db.collection('auth_sessions').where({ tokenHash: hash(token), active: true, expiresAt: command.gt(new Date()) }).limit(2).get()).data || []
  if (sessions.length !== 1) throw new Error('登录会话已失效，请重新登录')
  const user = await getDoc('users', text(sessions[0].userId))
  if (!user) throw new Error('登录账号不存在')
  const organization = await getDoc('organizations', orgId)
  if (!organization) throw new Error('机构不存在')
  const memberships = (await db.collection('organization_memberships').where(command.or([{ userId: user._id }, { memberUserId: user._id }])).limit(100).get()).data || []
  const member = memberships.find(row => text(row.orgId || row.organizationId) === orgId && ['active', 'accepted', 'claimed'].includes(text(row.status || 'active').toLowerCase()))
  const owner = !member && [organization.ownerId, organization.creatorId, organization.createdBy].map(text).includes(text(user._id))
  const permissions = member && Array.isArray(member.permissions) ? member.permissions.map(text) : member && member.permissions && typeof member.permissions === 'object' ? Object.keys(member.permissions).filter(key => member.permissions[key]) : []
  const roles = member ? [member.role, member.position].concat(member.roles || [], member.positions || []).map(text).join(',').toLowerCase() : ''
  if (!owner && !(permissions.length ? permissions.includes('event.manage') : /赛事|负责人|机构管理员|event|organizer|owner/.test(roles))) throw new Error('当前身份没有赛事管理权限')
  return user
}

function official(match) {
  if (!match || match.homeScore == null || match.awayScore == null) return false
  const values = [match.resultReviewStatus, match.reviewStatus, match.refereeReviewStatus, match.refereeRecord && match.refereeRecord.reviewStatus, match.status].map(value => text(value).toLowerCase())
  if (values.some(value => ['returned', 'rejected', 'warning', 'conflict', 'abandoned'].includes(value))) return false
  if (values.some(value => ['approved', 'archived', 'official'].includes(value))) return true
  return !match.refereeRecord && !match.refereeSubmittedAt && ['finished', 'completed', 'ended'].includes(text(match.status).toLowerCase())
}

function parseGenerated(value) {
  const raw = text(value).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed
  try { parsed = JSON.parse(raw) } catch (_) { throw new Error('生成内容格式异常，请重试') }
  const title = text(parsed.title).slice(0, 80)
  const body = text(parsed.body).slice(0, 1500)
  if (!title || !body) throw new Error('生成内容不完整，请重试')
  return { title, body }
}

function verifiedGoalEvents(match, homeName, awayName) {
  return (Array.isArray(match.events) ? match.events : [])
    .filter(event => ['goal', 'penalty_goal'].includes(text(event.type || event.eventType).toLowerCase()))
    .slice(0, 12)
    .map(event => {
      const side = text(event.teamSide || event.side).toLowerCase()
      const team = side === 'home' ? homeName : side === 'away' ? awayName : ''
      return { minute: event.minute, team, player: text(event.playerName || event.player), type: text(event.type || event.eventType) }
    })
}

async function generate(input) {
  if (process.env.NEWS_FREE_GENERATION_ENABLED === 'false') throw new Error('生成新闻暂不可用')
  const tournamentId = text(input.tournamentId)
  const matchId = text(input.matchId)
  const kind = ['flash', 'match'].includes(text(input.kind)) ? text(input.kind) : ''
  if (!tournamentId || !matchId || !kind) throw new Error('请选择比赛和新闻类型')
  const tournament = await getDoc('tournaments', tournamentId)
  if (!tournament) throw new Error('赛事不存在')
  const orgId = text(tournament.orgId || tournament.organizationId)
  const user = await authenticate(text(input.authToken), orgId)
  const match = await getDoc('matches', matchId)
  if (!match || text(match.tournamentId) !== tournamentId) throw new Error('比赛不存在')
  if (kind === 'match' && !official(match)) throw new Error('单场新闻只能根据正式赛果生成')
  if (!(match.schedulePublished === true || match.published === true || ['ongoing', 'live', 'finished', 'completed', 'ended', 'archived'].includes(text(match.status).toLowerCase()))) throw new Error('比赛尚未公开')
  const facts = { tournament: text(tournament.name), date: text(match.matchDate || match.date), time: text(match.matchTime), division: text(match.divisionName), round: text(match.roundName || match.roundLabel || match.round), home: text(match.homeTeamName || match.homeName), away: text(match.awayTeamName || match.awayName) }
  if (kind === 'match') {
    facts.score = `${Number(match.homeScore)}:${Number(match.awayScore)}`
    facts.events = verifiedGoalEvents(match, facts.home, facts.away)
  }
  const note = text(input.note).slice(0, 500)
  const prompt = `为足球赛事新闻中心撰写一篇${kind === 'flash' ? '现场快讯' : '单场赛后新闻'}，同时给出标题和正文。仅使用提供的事实与现场看点，不虚构照片内容、比赛过程、进球者、采访或比分。语气自然，避免宣传口号和空泛套话。正文约 150–250 字。只返回 JSON 对象：{"title":"...","body":"..."}。\n比赛事实：${JSON.stringify(facts)}\n主办方核实的现场看点：${note || '未提供'}\n${kind === 'flash' ? '现场快讯禁止写比分、胜负和比赛结论。' : '比分只能按提供的正式赛果书写。'}`
  const output = await cloud.ai().createModel('hunyuan-v3').generateText({ model: 'hy3', messages: [{ role: 'user', content: prompt }] })
  const article = parseGenerated(output.text)
  if (kind === 'flash' && (/\d+\s*[:：]\s*\d+/.test(article.title + article.body) || /战胜|击败|获胜|失利|比分/.test(article.title + article.body))) throw new Error('生成内容含未确认赛果，请重新生成')
  const usage = output.usage || null
  await db.collection('registration_audit_logs').add({ data: { sport: 'football', action: 'news_preview_generated', tournamentId, matchId, actorUserId: text(user._id), actorOrgId: orgId, result: 'success', detail: { kind, model: 'hy3', provider: 'hunyuan-v3', usage }, createTime: db.serverDate() } }).catch(error => console.warn('新闻预览用量记录失败', error.message))
  return { success: true, title: article.title, body: article.body, usage, source: 'hy3' }
}

exports.main = async event => {
  const origin = text(event && event.headers && (event.headers.origin || event.headers.Origin))
  const allowed = ['https://www.sxffootball.cn', 'https://sxffootball.cn', 'https://cloud1-7g8ckb3c7815a011-1419431905.tcloudbaseapp.com']
  const cors = allowed.includes(origin) ? origin : 'https://www.sxffootball.cn'
  if (text(event && event.httpMethod).toUpperCase() === 'OPTIONS') return response(204, {}, cors)
  try { return response(200, await generate(parseInput(event)), cors) }
  catch (error) { console.error('newsPreviewGenerate failed', error); return response(200, { success: false, message: error.message || '生成新闻失败' }, cors) }
}

exports.__test = { official, parseGenerated, verifiedGoalEvents }
