'use strict'
// 只读公开赛事已审名单；不扫描私有球员库来扩大公开范围。
const { createHash } = require('node:crypto')
const { readOptionalAll, readByIds, missingCollection } = require('../shared/reader.cjs')
const { readRosters, rosterPlayerIds, rosterLineApproved } = require('../shared/roster.cjs')
const text = value => String(value == null ? '' : value).trim()
const alive = row => row && row.isDeleted !== true && !['deleted', 'removed'].includes(text(row.status))
const publicEvent = row => alive(row) && !['draft', 'unpublished', 'private'].includes(text(row.status)) && row.isPublic !== false && row.published !== false && text(row.visibility) !== 'private'
const fail = code => { const e = new Error(code); e.code = code; return e }

async function readMap(db, collection, ids, fields) {
  if (!ids.length) return new Map()
  const rows = await readByIds(db, collection, '_id', ids, { maxRows: 20000, fields })
  return new Map(rows.map(row => [text(row._id), row]))
}

async function loadPublicMembers(db, tournamentId, synthetic) {
  let events
  if (tournamentId) {
    events = { rows: [...(await readMap(db, 'tournaments', [tournamentId])).values()], status: 'ready' }
  } else {
    events = await readOptionalAll(db, 'tournaments', { status: db.command.neq('draft') }, { maxRows: 2000 })
  }
  const tournaments = events.rows.filter(row => publicEvent(row) && !synthetic(row))
  const allowed = new Set(tournaments.map(row => text(row._id)))
  let rows = [], status = 'ready'
  if (tournamentId) {
    if (!allowed.has(tournamentId)) return { members: new Map(), status: 'none', tournaments: [] }
    const read = await readRosters(db, tournamentId)
    rows = read.rows; status = read.status
  } else if (allowed.size) {
    const states = []
    for (const collection of ['roster_snapshots', 'rosters']) {
      try {
        rows.push(...await readByIds(db, collection, 'tournamentId', [...allowed], { maxRows: 20000 }))
        states.push('ready')
      } catch (e) { if (!missingCollection(e)) throw e; states.push('not_recorded') }
    }
    status = states.every(s => s === 'not_recorded') ? 'not_recorded' : 'ready'
  }
  rows = rows.filter(row => allowed.has(text(row.tournamentId)) && rosterLineApproved(row) && !synthetic(row))
  const teams = await readMap(db, 'teams', [...new Set(rows.map(row => text(row.teamId)).filter(Boolean))])
  const members = new Map()
  // 同一球员按稳定playerId去重，保留所有公开赛事证明，不按姓名合并。
  for (const row of rows) {
    const teamId = text(row.teamId), team = teams.get(teamId)
    if (!alive(team) || synthetic(team)) continue
    for (const playerId of rosterPlayerIds(row)) {
      const proof = { tournamentId: text(row.tournamentId), teamId, divisionId: text(row.divisionId || row.division) || 'default' }
      if (!members.has(playerId)) members.set(playerId, { ...proof, proofs: [] })
      const member = members.get(playerId)
      member.proofs.push(proof)
    }
  }
  return { members, status, tournaments }
}

const profileFields = Object.fromEntries(['name','playerName','teamId','teamName','photoUrl','position','birthDate','birthday','status','isDeleted','isPublic','visibility','synthetic','isTest','syntheticDatasetId','syntheticKey','source','originType','dataKind'].map(k => [k, true]))
async function readPublicProfiles(db, ids, synthetic) {
  const profiles = await readMap(db, 'players', ids, profileFields)
  const teams = await readMap(db, 'teams', [...new Set([...profiles.values()].map(row => text(row.teamId)).filter(Boolean))])
  for (const [id, row] of profiles) {
    const teamId = text(row.teamId), team = teams.get(teamId)
    if (!alive(row) || !text(row.name || row.playerName) || row.isPublic === false || text(row.visibility) === 'private' || synthetic(row) || (teamId && (!alive(team) || synthetic(team)))) profiles.delete(id)
  }
  return profiles
}

function pageIds(ids, scope, cursor, pageSize = 30) {
  const version = createHash('sha256').update(JSON.stringify([scope, ids])).digest('hex').slice(0, 24)
  let start = 0
  if (cursor) {
    let value
    try { if (typeof cursor !== 'string' || cursor.length > 1024) throw Error(); value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) } catch (_) { throw fail('DATA_CURSOR_INVALID') }
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.after !== 'string' || typeof value.version !== 'string' || typeof value.scope !== 'string') throw fail('DATA_CURSOR_INVALID')
    if (value.version !== version || value.scope !== scope) throw fail('DATA_VIEW_CHANGED')
    const at = ids.indexOf(value.after)
    if (at < 0) throw fail('DATA_CURSOR_INVALID')
    start = at + 1
  }
  const page = ids.slice(start, start + pageSize)
  const hasMore = start + page.length < ids.length
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ version, scope, after: page[page.length - 1] })).toString('base64url') : ''
  return { ids: page, hasMore, nextCursor, version, offset: start }
}

module.exports = { loadPublicMembers, readPublicProfiles, pageIds, publicEvent }
