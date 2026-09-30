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

function parseGenerated(value, fixtures = [], kind = 'match') {
  const raw = text(value).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed
  try { parsed = JSON.parse(raw) } catch (_) { throw new Error('生成内容格式异常，请重试') }
  const title = text(parsed.title).slice(0, 80)
  const summary = text(parsed.summary)
  const analysis = text(parsed.analysis)
  const outlook = text(parsed.outlook)
  if (!title || !summary || !analysis || kind === 'match' && fixtures.length && !outlook) throw new Error('生成内容不完整，请重试')
  if (kind === 'flash') return { title, body: `${summary}\n\n${analysis}`.slice(0, 1000) }
  const fixtureText = fixtures.length ? fixtures.map(item => `${item.team}下一场：${item.date} ${item.time} 对 ${item.opponent}${item.venue ? `，${item.venue}` : ''}。`).join('\n') : '目前没有已公布的下一场赛程。'
  const body = `本场比赛综述\n${summary}\n\n比赛形势分析\n${analysis}\n\n下场比赛预告与观点预测\n预告：${fixtureText}\n观点及预测：${fixtures.length ? outlook : '赛程未公布，暂不预测。'}`.slice(0, 1500)
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

function startKey(match) {
  const date = text(match.matchDate || match.date).slice(0, 10)
  const time = text(match.matchTime || match.startTime || '00:00').slice(0, 5)
  return date ? `${date}T${time}` : ''
}

function nextFixturesFromRows(match, rows) {
  const homeId = text(match.homeTeamId), awayId = text(match.awayTeamId)
  if (!homeId && !awayId) return []
  const divisionId = text(match.divisionId || match.division)
  const currentStart = startKey(match)
  const future = rows.filter(item => {
    if (text(item._id) === text(match._id)) return false
    if (divisionId && text(item.divisionId || item.division) !== divisionId) return false
    if (!(item.schedulePublished === true || item.published === true)) return false
    if (['cancelled', 'abandoned', 'finished', 'completed', 'ended', 'archived'].includes(text(item.status).toLowerCase())) return false
    if (!startKey(item) || startKey(item) <= currentStart) return false
    return [homeId, awayId].some(id => id && [item.homeTeamId, item.awayTeamId].map(text).includes(id))
  }).sort((left, right) => startKey(left).localeCompare(startKey(right)))
  const selected = []
  for (const [teamId, team] of [[homeId, text(match.homeTeamName || match.homeName)], [awayId, text(match.awayTeamName || match.awayName)]]) {
    if (!teamId) continue
    const next = future.find(item => [item.homeTeamId, item.awayTeamId].map(text).includes(teamId))
    if (!next || selected.some(item => item.matchId === text(next._id))) continue
    const isHome = text(next.homeTeamId) === teamId
    selected.push({ matchId: text(next._id), team, opponent: text(isHome ? next.awayTeamName || next.awayName : next.homeTeamName || next.homeName) || '对手待定', date: text(next.matchDate || next.date).slice(0, 10), time: text(next.matchTime || next.startTime).slice(0, 5), venue: text(next.venue || next.location), round: text(next.roundName || next.roundLabel || next.round) })
  }
  return selected
}

async function nextFixturesForMatch(match, tournamentId) {
  const rows = []
  let lastId = ''
  while (true) {
    const where = lastId ? command.and({ tournamentId }, { _id: command.gt(lastId) }) : { tournamentId }
    const page = (await db.collection('matches').where(where).orderBy('_id', 'asc').limit(100).get()).data || []
    rows.push(...page)
    if (rows.length > 20000) throw new Error('赛事比赛超出当前读取范围')
    if (!page.length) return nextFixturesFromRows(match, rows)
    lastId = text(page[page.length - 1]._id)
  }
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
    facts.nextFixtures = await nextFixturesForMatch(match, tournamentId)
  }
  const note = text(input.note).slice(0, 500)
  const prompt = kind === 'flash'
    ? `为足球赛事新闻中心写一篇现场快讯。只使用下列事实，不虚构照片内容、进球者、过程、比分或胜负。请给出简洁标题、现场概况和基于现有信息的观察，不写下一场预测。只返回 JSON：{"title":"...","summary":"...","analysis":"..."}。\n比赛事实：${JSON.stringify(facts)}\n主办方核实的现场看点：${note || '未提供'}`
    : `为足球赛事官方写一篇赛后新闻。正文按三个部分完成：1. 本场比赛综述，交代对阵、正式比分、已记录的关键进球顺序；2. 比赛形势分析，仅分析这些进球与比分呈现的走势，不编造控球率、射门、战术布置或采访；3. 下场比赛预告与观点预测，预告仅按已公布的两队各自下一场赛程，预测只写基于本场表现的条件性看法，不写具体预测比分、赔率、胜率或必胜判断。用自然中文，具体、克制，不要口号、模板结尾或逐条照抄事件。只返回 JSON：{"title":"...","summary":"约120字","analysis":"约110字","outlook":"约80字"}。如果 nextFixtures 为空，outlook 设为空字符串。\n已核实比赛及后续赛程：${JSON.stringify(facts)}\n主办方核实的现场看点：${note || '未提供'}`
  const output = await cloud.ai().createModel('hunyuan-v3').generateText({ model: 'hy3', messages: [{ role: 'user', content: prompt }] })
  const article = parseGenerated(output.text, kind === 'match' ? facts.nextFixtures : [], kind)
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

exports.__test = { official, parseGenerated, verifiedGoalEvents, nextFixturesFromRows, startKey }
