const assert = require('node:assert/strict')
const Module = require('node:module')
const crypto = require('node:crypto')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const tables = {
  auth_sessions: [{ _id: 'session', tokenHash: hash('session-token'), active: true, expiresAt: new Date('2099-01-01'), userId: 'user' }],
  users: [{ _id: 'user', orgId: 'org' }],
  organizations: [{ _id: 'org', ownerId: 'user' }],
  organization_memberships: [],
  tournaments: [{ _id: 'tournament', orgId: 'org' }, { _id: 'other', orgId: 'another-org' }],
  matches: [
    { _id: 'z', tournamentId: 'tournament', matchDate: '2026-09-26', status: 'finished', homeScore: 5, awayScore: 1, events: [] },
    { _id: 'a', tournamentId: 'tournament', matchDate: '2026-09-26', status: 'finished', homeScore: 1, awayScore: 1, events: [] }
  ],
  match_events: [], tournament_news: []
}
const command = { gt: value => ({ op: 'gt', value }), and: (...items) => ({ op: 'and', items }), or: items => ({ op: 'or', items }) }
function matches(row, condition) {
  if (!condition) return true
  if (condition.op === 'and') return condition.items.every(item => matches(row, item))
  if (condition.op === 'or') return condition.items.some(item => matches(row, item))
  return Object.entries(condition).every(([key, value]) => value?.op === 'gt' ? row[key] > value.value : row[key] === value)
}
const db = {
  command, serverDate: () => new Date(),
  async runTransaction(work) { return work(db) },
  collection(name) {
    let where, sort, maximum = 100
    const api = {
      where(value) { where = value; return api }, orderBy(key, direction) { sort = [key, direction]; return api }, limit(value) { maximum = value; return api },
      async get() { let rows = (tables[name] || []).filter(row => matches(row, where)); if (sort) rows.sort((a, b) => String(a[sort[0]]).localeCompare(String(b[sort[0]])) * (sort[1] === 'desc' ? -1 : 1)); return { data: rows.slice(0, maximum) } },
      doc(id) { return { async get() { return { data: (tables[name] || []).find(row => row._id === id) || null } }, async update({ data }) { Object.assign(tables[name].find(row => row._id === id), data) } } },
      async add({ data }) { const _id = `news-${tables[name].length + 1}`; tables[name].push({ ...data, _id }); return { _id } }
    }
    return api
  }
}
const originalLoad = Module._load
Module._load = function (name) { if (name === 'wx-server-sdk') return { init() {}, database: () => db }; return originalLoad.apply(this, arguments) }
const service = require(process.env.NEWS_CENTER_MODULE || '../cloudfunctions/newsCenter/index.js')
Module._load = originalLoad
const base = { __authToken: 'session-token', __actorUserId: 'user', __actorOrgId: 'org', tournamentId: 'tournament' }
;(async () => {
  assert.equal((await service.main({ ...base, tournamentId: 'other', action: 'list' })).success, false)
  const saved = await service.main({ ...base, action: 'saveDraft', kind: 'daily', date: '2026-09-26', matchIds: ['z', 'a'], title: '比赛日战报', body: '正文' })
  assert.equal(saved.success, true)
  assert.equal(saved.version, 1)
  assert.deepEqual(tables.tournament_news[0].matchIds, ['a', 'z'])
  assert.deepEqual(tables.tournament_news[0].sourceResultVersions.map(row => row.matchId), ['a', 'z'])
  const staleDraft = await service.main({ ...base, action: 'saveDraft', newsId: saved.newsId, version: 0, kind: 'daily', date: '2026-09-26', matchIds: ['z', 'a'], title: '过期草稿', body: '正文' })
  assert.equal(staleDraft.success, false)
  assert.equal(staleDraft.code, 'NEWS_VERSION_CONFLICT')
  const published = await service.main({ ...base, action: 'publish', newsId: saved.newsId, version: saved.version })
  assert.equal(published.status, 'published')
  assert.equal(published.version, 2)
  assert.equal((await service.main({ ...base, action: 'list' })).articles[0].needsUpdate, false)
  tables.matches[0].homeScore = 6
  assert.equal((await service.main({ ...base, action: 'list' })).articles[0].needsUpdate, true)
  const rejected = await service.main({ ...base, action: 'publish', newsId: saved.newsId, version: published.version })
  assert.equal(rejected.success, false)
  assert.match(rejected.message, /赛果已更正/)
  const withdrawn = await service.main({ ...base, action: 'withdraw', newsId: saved.newsId, version: published.version })
  assert.equal(withdrawn.status, 'withdrawn')
  assert.equal(withdrawn.version, 3)

  const publishedDeleteDraft = await service.main({ ...base, action: 'saveDraft', kind: 'match', matchId: 'z', title: '待删除已发布新闻', body: '正文' })
  const publishedToDelete = await service.main({ ...base, action: 'publish', newsId: publishedDeleteDraft.newsId, version: publishedDeleteDraft.version })
  const deletedPublished = await service.main({ ...base, action: 'delete', newsId: publishedDeleteDraft.newsId, version: publishedToDelete.version })
  assert.equal(deletedPublished.success, true)
  assert.equal(deletedPublished.status, 'deleted')
  assert.equal(tables.tournament_news.find(row => row._id === publishedDeleteDraft.newsId).status, 'deleted')
  assert.equal((await service.main({ ...base, action: 'list' })).articles.some(row => row.id === publishedDeleteDraft.newsId), false)

  const draftToDelete = await service.main({ ...base, action: 'saveDraft', kind: 'match', matchId: 'a', title: '待删除草稿', body: '正文' })
  const deletedDraft = await service.main({ ...base, action: 'delete', newsId: draftToDelete.newsId, version: draftToDelete.version })
  assert.equal(deletedDraft.success, true)
  assert.equal(deletedDraft.status, 'deleted')
  assert.equal((await service.main({ ...base, action: 'list' })).articles.some(row => row.id === draftToDelete.newsId), false)

  const invalid = await service.main({ ...base, action: 'saveDraft', kind: 'match', matchId: 'z', title: '', body: '正文' })
  assert.equal(invalid.success, false)
  console.log('PASS: tenant access, daily ordering, version conflicts, draft/publish/withdraw/delete and stale-result rejection')
})().catch(error => { console.error(error); process.exitCode = 1 })
