const cloud = require('wx-server-sdk')
const staffPolicy = require('./staffPolicy.cjs')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 90000 })
const db = cloud.database()
const command = db.command
const text = value => String(value == null ? '' : value).trim()
const hash = value => crypto.createHash('sha256').update(text(value)).digest('hex')
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function with429Retry(operation) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation() }
    catch (error) {
      const statusValue = error && (error.statusCode || error.status || error.response && error.response.status)
      const status = Number(statusValue || (/status code 429/i.test(text(error && error.message)) ? 429 : 0))
      if (status !== 429 || attempt >= 2) {
        if (status === 429) throw new Error('服务繁忙，请稍后再生成')
        throw error
      }
      const retryAfter = Number(error && error.response && error.response.headers && error.response.headers['retry-after'])
      await delay(retryAfter > 0 ? Math.min(retryAfter * 1000, 3000) : 700 * (attempt + 1))
    }
  }
}

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

async function authenticate(token, orgId, tournamentId) {
  if (!token || !orgId) throw new Error('请先登录主办方 PC 后台')
  const sessions = (await db.collection('auth_sessions').where({ tokenHash: hash(token), active: true, expiresAt: command.gt(new Date()) }).limit(2).get()).data || []
  if (sessions.length !== 1) throw new Error('登录会话已失效，请重新登录')
  const user = await getDoc('users', text(sessions[0].userId))
  if (!user) throw new Error('登录账号不存在')
  const organization = await getDoc('organizations', orgId)
  if (!organization) throw new Error('机构不存在')
  const memberships = (await db.collection('organization_memberships').where(command.or([{ userId: user._id }, { memberUserId: user._id }])).limit(100).get()).data || []
  const member = memberships.find(row => text(row.orgId || row.organizationId) === orgId && ['active', 'accepted', 'claimed'].includes(text(row.status || 'active').toLowerCase()))
  const owner = [organization.ownerId, organization.creatorId, organization.createdBy].map(text).includes(text(user._id))
  if (await staffPolicy.isStaff(db, user._id, orgId) && !owner) {
    if (!await staffPolicy.hasRight(db, user._id, orgId, tournamentId, 'news.edit')) throw new Error('当前赛事没有新闻编辑权限')
    return user
  }
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
  const fixtureText = fixtures.length
    ? `根据已公布赛程，${fixtures.map(item => `${item.team}将于${item.date.slice(0, 4)}年${item.date.slice(5, 7).replace(/^0/, '')}月${item.date.slice(8, 10).replace(/^0/, '')}日${item.time}${item.venue ? `在${item.venue}` : ''}对阵${item.opponent}`).join('；')}。`
    : '两队下一场赛程尚未公布。'
  const body = `本场比赛综述\n${summary}\n\n比赛形势分析\n${analysis}\n\n下场比赛预告与观点预测\n${fixtureText}${fixtures.length ? `\n${outlook}` : ''}`.slice(0, 1800)
  return { title, body }
}

function verifiedGoalEvents(match, homeName, awayName) {
  return (Array.isArray(match.events) ? match.events : [])
    .filter(event => ['goal', 'penalty_goal'].includes(text(event.type || event.eventType).toLowerCase()))
    .map(event => {
      const side = text(event.teamSide || event.side).toLowerCase()
      const team = side === 'home' ? homeName : side === 'away' ? awayName : ''
      return { minute: Number(event.minute), team, player: text(event.playerName || event.player), type: text(event.type || event.eventType), side }
    })
    .filter(event => Number.isFinite(event.minute) && event.minute >= 0 && event.team)
    .sort((left, right) => left.minute - right.minute)
    .slice(0, 12)
}

function goalTimeline(events) {
  let home = 0; let away = 0
  return events.map(event => {
    if (event.side === 'home') home += 1
    else away += 1
    return { minute: event.minute, team: event.team, player: event.player, scoreAfter: `${home}:${away}` }
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

async function tournamentMatches(tournamentId) {
  const rows = []
  let lastId = ''
  while (true) {
    const where = lastId ? command.and({ tournamentId }, { _id: command.gt(lastId) }) : { tournamentId }
    const page = (await db.collection('matches').where(where).orderBy('_id', 'asc').limit(100).get()).data || []
    rows.push(...page)
    if (rows.length > 20000) throw new Error('赛事比赛超出当前读取范围')
    if (!page.length) return rows
    lastId = text(page[page.length - 1]._id)
  }
}

async function nextFixturesForMatch(match, tournamentId) {
  return nextFixturesFromRows(match, await tournamentMatches(tournamentId))
}

function officialDayRows(rows, date) {
  return rows.filter(item => text(item.matchDate || item.date).slice(0, 10) === date && official(item))
    .sort((a, b) => startKey(a).localeCompare(startKey(b)) || text(a._id).localeCompare(text(b._id)))
    .map(item => {
      const home = text(item.homeTeamName || item.homeName)
      const away = text(item.awayTeamName || item.awayName)
      return { matchId: text(item._id), time: text(item.matchTime || item.startTime), division: text(item.divisionName), home, away, score: `${Number(item.homeScore)}:${Number(item.awayScore)}` }
    })
}

function nextRoundFixtures(rows, date) {
  const scheduled = rows.filter(item => {
    const day = text(item.matchDate || item.date).slice(0, 10)
    return day > date && (item.schedulePublished === true || item.published === true) && !['cancelled', 'abandoned', 'finished', 'completed', 'ended', 'archived'].includes(text(item.status).toLowerCase())
  }).sort((a, b) => startKey(a).localeCompare(startKey(b)))
  const firstDateByDivision = new Map()
  for (const row of scheduled) {
    const key = text(row.divisionId || row.division || row.divisionName)
    if (!firstDateByDivision.has(key)) firstDateByDivision.set(key, text(row.matchDate || row.date).slice(0, 10))
  }
  return scheduled.filter(row => text(row.matchDate || row.date).slice(0, 10) === firstDateByDivision.get(text(row.divisionId || row.division || row.divisionName)))
    .map(row => ({ date: text(row.matchDate || row.date).slice(0, 10), time: text(row.matchTime || row.startTime).slice(0, 5), division: text(row.divisionName), round: text(row.roundName || row.roundLabel || row.round), home: text(row.homeTeamName || row.homeName), away: text(row.awayTeamName || row.awayName), venue: text(row.venue || row.location) }))
}

function buildDailyArticle(tournamentName, date, dayRows, fixtures, includeStandings, suspensionNote) {
  if (!dayRows.length) throw new Error('这一天没有已归档比赛')
  const [, month, day] = /^\d{4}-(\d{2})-(\d{2})$/.exec(date) || []
  const title = `${tournamentName}${Number(month)}月${Number(day)}日比赛日战报`.slice(0, 80)
  const results = dayRows.map(item => `${item.division ? `${item.division} · ` : ''}${item.home} ${item.score} ${item.away}`).join('\n')
  const upcoming = fixtures.length ? fixtures.map(item => `${item.division ? `${item.division} · ` : ''}${item.date} ${item.time} ${item.home} 对 ${item.away}${item.venue ? ` · ${item.venue}` : ''}`).join('\n') : '下一轮赛程尚未公布。'
  const suspension = suspensionNote ? `主办方提供：${suspensionNote}` : '下轮停赛名单尚未录入，待主办方确认。'
  const body = `本轮赛果\n${results}\n\n积分榜\n${includeStandings ? '见随文正式积分榜快照。' : '本期未附积分榜快照。'}\n\n下轮对阵\n${upcoming}\n\n停赛信息\n${suspension}`
  if (body.length > 6000) throw new Error('当日比赛或下轮赛程过多，请按组别分批生成')
  return { title, body }
}

async function currentStandingsForDay(tournamentId, rows, date, authToken) {
  if (rows.some(item => text(item.matchDate || item.date).slice(0, 10) > date && official(item))) throw new Error('该比赛日之后已有正式赛果，不能使用当前积分榜作历史快照')
  const dashboard = await with429Retry(async () => {
    const called = await cloud.callFunction({ name: 'resultCenter', data: { action: 'dashboard', tournamentId, __authToken: authToken } })
    const value = called && (called.result || called)
    if (value && !value.success && /429|请求频繁|繁忙/.test(text(value.message))) {
      const error = new Error(text(value.message) || 'Request failed with status code 429')
      error.statusCode = 429
      throw error
    }
    return value
  })
  if (!dashboard || !dashboard.success) throw new Error(dashboard && dashboard.message || '正式积分榜读取失败，请重试')
  const tables = (Array.isArray(dashboard.standings) ? dashboard.standings : []).filter(group => Number(group.officialMatchCount) > 0 && Array.isArray(group.officialTeams) && group.officialTeams.length)
    .map(group => ({ divisionName: text(group.divisionName), groupName: text(group.groupName), officialMatchCount: Number(group.officialMatchCount), officialTeams: group.officialTeams.map(team => ({ rank: Number(team.rank || 0), teamName: text(team.teamName), played: Number(team.played || 0), win: Number(team.win || 0), draw: Number(team.draw || 0), loss: Number(team.loss || 0), goalDifference: Number(team.goalDifference || 0), points: Number(team.points || 0) })) }))
  if (!tables.length) throw new Error('当前没有可附的正式积分榜，请到赛果管理核对')
  return { tables, generatedAt: text(dashboard.generatedAt) }
}

async function generate(input) {
  if (process.env.NEWS_FREE_GENERATION_ENABLED === 'false') throw new Error('生成新闻暂不可用')
  const tournamentId = text(input.tournamentId)
  const matchId = text(input.matchId)
  const date = text(input.date)
  const kind = ['match', 'daily'].includes(text(input.kind)) ? text(input.kind) : ''
  if (!tournamentId || !kind || (kind === 'match' && !matchId) || (kind === 'daily' && !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('请选择比赛或比赛日')
  const tournament = await getDoc('tournaments', tournamentId)
  if (!tournament) throw new Error('赛事不存在')
  const orgId = text(tournament.orgId || tournament.organizationId)
  const user = await authenticate(text(input.authToken), orgId, tournamentId)
  const note = text(input.note).slice(0, 500)
  if (kind === 'daily') {
    const rows = await tournamentMatches(tournamentId)
    const dayRows = officialDayRows(rows, date)
    const fixtures = nextRoundFixtures(rows, date)
    const standingsSnapshot = input.includeStandings === true ? await currentStandingsForDay(tournamentId, rows, date, text(input.authToken)) : null
    const article = buildDailyArticle(text(tournament.name), date, dayRows, fixtures, Boolean(standingsSnapshot), text(input.suspensionNote).slice(0, 300))
    await db.collection('registration_audit_logs').add({ data: { sport: 'football', action: 'news_preview_generated', tournamentId, actorUserId: text(user._id), actorOrgId: orgId, result: 'success', detail: { kind, date, matchIds: dayRows.map(item => item.matchId), fixtureCount: fixtures.length, source: 'official-results' }, createTime: db.serverDate() } }).catch(error => console.warn('新闻预览日志失败', error.message))
    return { success: true, title: article.title, body: article.body, matchIds: dayRows.map(item => item.matchId), dayResults: dayRows, nextFixtures: fixtures, standingsSnapshot, source: 'official-results' }
  }
  const match = await getDoc('matches', matchId)
  if (!match || text(match.tournamentId) !== tournamentId) throw new Error('比赛不存在')
  if (!official(match)) throw new Error('单场新闻只能根据正式赛果生成')
  if (!(match.schedulePublished === true || match.published === true || ['ongoing', 'live', 'finished', 'completed', 'ended', 'archived'].includes(text(match.status).toLowerCase()))) throw new Error('比赛尚未公开')
  const facts = { tournament: text(tournament.name), date: text(match.matchDate || match.date), time: text(match.matchTime), division: text(match.divisionName), round: text(match.roundName || match.roundLabel || match.round), home: text(match.homeTeamName || match.homeName), away: text(match.awayTeamName || match.awayName) }
  facts.score = `${Number(match.homeScore)}:${Number(match.awayScore)}`
  const goals = verifiedGoalEvents(match, facts.home, facts.away)
  facts.goalTimeline = goalTimeline(goals)
  facts.goalTimelineComplete = goals.length === Number(match.homeScore) + Number(match.awayScore)
  facts.nextFixtures = await nextFixturesForMatch(match, tournamentId)
  const prompt = `你是长期报道地方足球联赛的体育编辑。请把已核实的比赛资料写成一篇像赛后记者稿的新闻：有清楚的比赛脉络、具体的人和时间、自然的节奏，读者能看出比分怎样一步步形成。只返回 JSON：{"title":"...","summary":"...","analysis":"...","outlook":"..."}。三个字段分别对应“本场比赛综述”“比赛形势分析”“下场比赛预告与观点预测”，不要在正文重复小标题。\n标题：像体育新闻标题一样抓住这场球的独特看点，优先用关键球员、关键阶段或比分转折；控制在约18至32字。不要把赛事全称、日期、两队和比分按固定顺序拼接。\n本场综述：约140至220字。第一句交代赛果和比赛背景，后文按时间顺序讲清一至三个关键节点，写清进球者和比分变化之间的关系。不要把每个进球改写成一行清单，也不要为了篇幅重复标题。可以用“打破僵局”“扳回一球”“重新拉开比分”“锁定胜局”等准确动词；只有事实支持时才用。\n比赛形势分析：约70至130字。抓住真正改变走势的阶段或球员表现，补充一层解释，不重述整段进球流水。比分只能证明结果和进球变化，不能单独证明控球、压制、攻势、防线漏洞、体能或战术安排。\n下场观点：约50至90字。结合本场已有表现和已公布赛程，提出一项具体、克制的观察点；不复述日期和对手，因为系统会插入赛程。不要写预测比分、胜率、赔率或必胜判断。\n写作要求：用简洁有力的动词，句长有变化，少用总结腔和抽象评语。不要出现“本场比赛充分展现”“整体来看”“值得期待”“取得一场重要胜利”“进攻端输出有限”等套话。不要把中途比分下的进球称为安慰球。goalTimeline 已按分钟排序，scoreAfter 是每球后的比分；goalTimelineComplete=false 时进球记录不全，不得推断遗漏过程。没有现场看点就不描写射门方式、传球、战术、观众、采访或天气。信息不足时缩短分析和观点，不编内容补足字数。\n已核实比赛事实：${JSON.stringify(facts)}\n主办方核实的现场看点：${note || '未提供'}`
  const output = await with429Retry(() => cloud.ai().createModel('hunyuan-v3').generateText({ model: 'hy3', messages: [{ role: 'user', content: prompt }] }))
  const article = parseGenerated(output.text, facts.nextFixtures, kind)
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

exports.__test = { official, parseGenerated, verifiedGoalEvents, goalTimeline, officialDayRows, nextRoundFixtures, buildDailyArticle, currentStandingsForDay, with429Retry, nextFixturesFromRows, startKey }
