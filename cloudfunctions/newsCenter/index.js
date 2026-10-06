const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const staffPolicy = require('./staffPolicy.cjs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const command = db.command
const text = value => String(value == null ? '' : value).trim()
const digest = value => crypto.createHash('sha256').update(String(value || '')).digest('hex')
const orgIds = record => [...new Set(['orgId', 'organizationId', 'organization_id'].map(key => text(record && record[key])).filter(Boolean))]

async function getDoc(collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get()
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null
  } catch (_) { return null }
}

function official(match) {
  if (!match || match.homeScore == null || match.awayScore == null) return false
  const statuses = [match.resultReviewStatus, match.reviewStatus, match.refereeReviewStatus, match.refereeRecord && match.refereeRecord.reviewStatus, match.status].map(value => text(value).toLowerCase())
  if (statuses.some(value => ['returned', 'rejected', 'warning', 'conflict', 'abandoned'].includes(value))) return false
  if (statuses.some(value => ['approved', 'archived', 'official'].includes(value))) return true
  return !match.refereeRecord && !match.refereeSubmittedAt && ['finished', 'completed', 'ended'].includes(text(match.status).toLowerCase())
}

async function resultVersion(match) {
  let events = Array.isArray(match.events) ? [...match.events] : []
  const rows = (await db.collection('match_events').where({ matchId: text(match._id) }).limit(301).get()).data || []
  if (rows.length > 300) throw new Error('比赛事件超过新闻核对范围')
  events = events.concat(rows)
  const goals = events.filter(event => ['goal', 'penalty_goal', 'own_goal', 'own-goal', 'og'].includes(text(event.type || event.eventType).toLowerCase()))
    .map(event => ({ type: text(event.type || event.eventType), minute: Number(event.minute), side: text(event.teamSide || event.side), player: text(event.playerName || event.player) }))
    .sort((a, b) => a.minute - b.minute || a.type.localeCompare(b.type) || a.side.localeCompare(b.side) || a.player.localeCompare(b.player))
  const fields = {
    homeScore: match.homeScore, awayScore: match.awayScore,
    resultVersionId: text(match.resultVersionId), resultCorrectedAt: text(match.resultCorrectedAt || match.resultCorrection && match.resultCorrection.correctedAt),
    correctionId: text(match.resultCorrection && match.resultCorrection.correctionId), goals
  }
  return digest(JSON.stringify(fields))
}

async function listAllMatches(tournamentId) {
  const rows = []
  let cursor = ''
  while (true) {
    const where = cursor ? command.and({ tournamentId }, { _id: command.gt(cursor) }) : { tournamentId }
    const page = (await db.collection('matches').where(where).orderBy('_id', 'asc').limit(100).get()).data || []
    rows.push(...page)
    if (rows.length > 20000) throw new Error('赛事比赛超过当前核对范围')
    if (!page.length) return rows
    cursor = text(page[page.length - 1]._id)
  }
}

async function authorize(event) {
  const token = text(event && (event.__authToken || event.authToken))
  if (!token) throw new Error('请先登录主办方 PC 后台')
  const sessions = (await db.collection('auth_sessions').where({ tokenHash: digest(token), active: true, expiresAt: command.gt(new Date()) }).limit(2).get()).data || []
  if (sessions.length !== 1) throw new Error('登录会话已失效，请重新登录')
  const user = await getDoc('users', text(sessions[0].userId))
  if (!user) throw new Error('登录账号不存在')
  if (event.__actorUserId && text(event.__actorUserId) !== text(user._id)) throw new Error('登录身份校验失败')
  const orgId = text(sessions[0].activeOrgId || event.__actorOrgId || user.orgId || user.organizationId)
  if (!orgId || event.__actorOrgId && text(event.__actorOrgId) !== orgId) throw new Error('当前账号机构归属不一致')
  const organization = await getDoc('organizations', orgId)
  if (!organization || text(organization._id) !== orgId) throw new Error('机构不存在或归属不一致')
  if (await staffPolicy.isStaff(db, user._id, orgId) && !await staffPolicy.owner(db, user._id, orgId)) return { user, orgId, staff: true }
  const memberships = (await db.collection('organization_memberships').where(command.or([{ userId: user._id }, { memberUserId: user._id }])).limit(100).get()).data || []
  const member = memberships.find(item => text(item.orgId || item.organizationId) === orgId && !['disabled', 'removed', 'rejected', 'inactive'].includes(text(item.status || 'active').toLowerCase()))
  const owner = [organization.ownerId, organization.creatorId, organization.createdBy].map(text).includes(text(user._id))
  const permissions = member && Array.isArray(member.permissions) ? member.permissions.map(text) : member && member.permissions && typeof member.permissions === 'object' ? Object.keys(member.permissions).filter(key => member.permissions[key]) : []
  const roles = member ? [member.role, member.position].concat(member.roles || [], member.positions || []).map(text).join(',').toLowerCase() : ''
  if (!owner && !(permissions.length ? permissions.includes('event.manage') : /赛事|负责人|机构管理员|event|organizer|owner/.test(roles))) throw new Error('当前身份没有赛事管理权限')
  return { user, orgId }
}

async function tournamentAccess(tournamentId, orgId) {
  const tournament = await getDoc('tournaments', tournamentId)
  const ids = tournament ? orgIds(tournament) : []
  if (!tournament || !ids.length || ids.some(id => id !== orgId)) throw new Error('无权访问当前赛事')
  return tournament
}

function cleanFiles(value, tournamentId) {
  const ownedPath = `/tournament-news/${tournamentId}/`
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(item => item.startsWith('cloud://') && item.includes(ownedPath)))].slice(0, 3)
}

async function sourceRows(tournamentId, kind, date, matchId, requestedIds, currentRows) {
  const rows = currentRows || await listAllMatches(tournamentId)
  let selected
  if (kind === 'match') {
    selected = rows.filter(item => text(item._id) === matchId)
    if (selected.length !== 1 || !official(selected[0])) throw new Error('单场新闻只能关联已归档赛果')
  } else if (kind === 'daily') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('比赛日期无效')
    selected = rows.filter(item => text(item.matchDate || item.date).slice(0, 10) === date && official(item))
    const ids = selected.map(item => text(item._id)).sort()
    const requested = [...new Set((requestedIds || []).map(text).filter(Boolean))].sort()
    if (!ids.length || ids.length !== requested.length || ids.some((id, index) => id !== requested[index])) throw new Error('每日新闻关联赛果已变化，请重新生成')
  } else throw new Error('新闻类型无效')
  return Promise.all(selected.map(async match => ({ matchId: text(match._id), version: await resultVersion(match) })))
}

async function revalidate(news) {
  if (!Array.isArray(news.matchIds) || !Array.isArray(news.sourceResultVersions) || news.matchIds.length !== news.sourceResultVersions.length) return false
  for (let index = 0; index < news.matchIds.length; index += 1) {
    const match = await getDoc('matches', text(news.matchIds[index]))
    const source = news.sourceResultVersions[index]
    if (!match || text(match.tournamentId) !== text(news.tournamentId) || !official(match) || text(source.matchId) !== text(match._id) || text(source.version) !== await resultVersion(match)) return false
  }
  return true
}

async function listNews(event, actor, tournament) {
  const rows = (await db.collection('tournament_news').where({ tournamentId: text(tournament._id), orgId: actor.orgId }).orderBy('updateTime', 'desc').limit(200).get()).data || []
  const articles = []
  for (const row of rows) {
    if (row.status === 'deleted') continue
    articles.push({ ...row, id: text(row._id), needsUpdate: row.status === 'published' && !await revalidate(row) })
  }
  return { success: true, articles }
}

async function saveDraft(event, actor, tournament) {
  const title = text(event.title).slice(0, 120)
  const body = text(event.body).slice(0, 20000)
  if (!title || !body) throw new Error('请先填写标题和正文')
  const kind = text(event.kind)
  const matchIds = kind === 'match' ? [text(event.matchId)] : [...new Set((event.matchIds || []).map(text).filter(Boolean))].sort()
  const tournamentMatches = await listAllMatches(text(tournament._id))
  const articleDate = kind === 'daily' ? text(event.date) : text(tournamentMatches.find(item => text(item._id) === text(event.matchId))?.matchDate || event.date)
  const versions = (await sourceRows(text(tournament._id), kind, text(event.date), text(event.matchId), matchIds, tournamentMatches)).sort((a, b) => a.matchId.localeCompare(b.matchId))
  const data = {
    sportCode: 'football', tournamentId: text(tournament._id), orgId: actor.orgId, kind, date: articleDate,
    matchId: kind === 'match' ? text(event.matchId) : '', matchIds, sourceResultVersions: versions,
    title, body, coverFileId: cleanFiles([event.coverFileId], text(tournament._id))[0] || '',
    photoFileIds: cleanFiles(event.photoFileIds, text(tournament._id)), standingsSnapshotFileId: cleanFiles([event.standingsSnapshotFileId], text(tournament._id))[0] || '',
    dayResults: Array.isArray(event.dayResults) ? event.dayResults.slice(0, 100) : [], nextFixtures: Array.isArray(event.nextFixtures) ? event.nextFixtures.slice(0, 100) : [],
    suspensionNote: text(event.suspensionNote).slice(0, 300), status: 'draft', updatedBy: text(actor.user._id), updateTime: db.serverDate()
  }
  const id = text(event.newsId)
  if (id) {
    const existing = await getDoc('tournament_news', id)
    if (!existing || text(existing.orgId) !== actor.orgId || text(existing.tournamentId) !== text(tournament._id)) throw new Error('新闻不存在或无权编辑')
    if (existing.status === 'deleted') throw new Error('新闻已删除，不能继续编辑')
    if (existing.status === 'published') throw new Error('已发布新闻请先撤回')
    await db.runTransaction(async transaction => {
      const response = await transaction.collection('tournament_news').doc(id).get()
      const current = Array.isArray(response.data) ? response.data[0] : response.data
      if (!current || current.status === 'deleted' || Number(event.version) !== Number(current.version || 1)) throw Object.assign(new Error('草稿已在其他设备更新，请刷新'), { code: 'NEWS_VERSION_CONFLICT' })
      data.version = Number(current.version || 1) + 1
      await transaction.collection('tournament_news').doc(id).update({ data })
    })
    return { success: true, newsId: id, status: 'draft', version: data.version }
  }
  data.version = 1; data.createdBy = text(actor.user._id); data.createTime = db.serverDate()
  const added = await db.collection('tournament_news').add({ data })
  return { success: true, newsId: text(added._id), status: 'draft', version: 1 }
}

async function setStatus(event, actor, status) {
  const id = text(event.newsId)
  const news = await getDoc('tournament_news', id)
  if (!news || text(news.orgId) !== actor.orgId || text(news.tournamentId) !== text(event.tournamentId)) throw new Error('新闻不存在或无权操作')
  if (news.status === 'deleted') throw new Error('新闻已删除，不能发布或撤回')
  await tournamentAccess(text(news.tournamentId), actor.orgId)
  if (status === 'published') {
    if (!text(news.title) || !text(news.body)) throw new Error('标题和正文不能为空')
    if (!await revalidate(news)) throw new Error('关联赛果已更正，请重新生成或编辑新闻后再发布')
  }
  let version
  await db.runTransaction(async transaction => {
    const response = await transaction.collection('tournament_news').doc(id).get()
    const current = Array.isArray(response.data) ? response.data[0] : response.data
    if (!current || current.status === 'deleted' || Number(event.version) !== Number(current.version || 1)) throw Object.assign(new Error('新闻已在其他设备更新，请刷新'), { code: 'NEWS_VERSION_CONFLICT' })
    version = Number(current.version || 1) + 1
    await transaction.collection('tournament_news').doc(id).update({ data: { status, version, publishedAt: status === 'published' ? db.serverDate() : current.publishedAt || null, publishedBy: status === 'published' ? text(actor.user._id) : current.publishedBy || '', updatedBy: text(actor.user._id), updateTime: db.serverDate() } })
  })
  return { success: true, newsId: id, status, version }
}

async function deleteNews(event, actor, tournament) {
  const id = text(event.newsId)
  if (!id) throw new Error('缺少新闻 ID')
  const existing = await getDoc('tournament_news', id)
  if (!existing || text(existing.orgId) !== actor.orgId || text(existing.tournamentId) !== text(tournament._id)) throw new Error('新闻不存在或无权删除')
  if (existing.status === 'deleted') throw new Error('新闻已删除')

  let version
  await db.runTransaction(async transaction => {
    const response = await transaction.collection('tournament_news').doc(id).get()
    const current = Array.isArray(response.data) ? response.data[0] : response.data
    if (!current || text(current.orgId) !== actor.orgId || text(current.tournamentId) !== text(tournament._id)) throw new Error('新闻不存在或无权删除')
    if (current.status === 'deleted' || Number(event.version) !== Number(current.version || 1)) {
      throw Object.assign(new Error('新闻已在其他设备更新，请刷新'), { code: 'NEWS_VERSION_CONFLICT' })
    }
    version = Number(current.version || 1) + 1
    await transaction.collection('tournament_news').doc(id).update({ data: { status: 'deleted', version, deletedAt: db.serverDate(), deletedBy: text(actor.user._id), updatedBy: text(actor.user._id), updateTime: db.serverDate() } })
  })

  return { success: true, newsId: id, status: 'deleted', version }
}

exports.main = async event => {
  try {
    const actor = await authorize(event || {})
    const tournamentId = text(event && event.tournamentId)
    if (!tournamentId) throw new Error('缺少赛事信息')
    const tournament = await tournamentAccess(tournamentId, actor.orgId)
    const action = text(event && event.action)
    if (actor.staff) {
      const required = action === 'saveDraft' ? 'news.edit' : ['publish', 'withdraw'].includes(action) ? 'news.publish' : ''
      const allowed = required
        ? await staffPolicy.hasRight(db, actor.user._id, actor.orgId, tournamentId, required)
        : action === 'delete'
          ? await staffPolicy.hasRight(db, actor.user._id, actor.orgId, tournamentId, 'news.edit') || await staffPolicy.hasRight(db, actor.user._id, actor.orgId, tournamentId, 'news.publish')
          : action === 'list' && (await staffPolicy.hasRight(db, actor.user._id, actor.orgId, tournamentId, 'news.edit') || await staffPolicy.hasRight(db, actor.user._id, actor.orgId, tournamentId, 'news.publish'))
      if (!allowed) throw new Error('当前赛事没有对应新闻权限')
    }
    if (action === 'list') return await listNews(event, actor, tournament)
    if (action === 'saveDraft') return await saveDraft(event, actor, tournament)
    if (action === 'publish') return await setStatus(event, actor, 'published')
    if (action === 'withdraw') return await setStatus(event, actor, 'withdrawn')
    if (action === 'delete') return await deleteNews(event, actor, tournament)
    throw new Error('不支持的新闻操作')
  } catch (error) {
    console.error('newsCenter failed:', error)
    return { success: false, code: error && error.code || 'NEWS_OPERATION_FAILED', message: error && error.message || '新闻操作失败' }
  }
}
