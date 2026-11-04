'use strict'

const formationRules = require('./sharedFormation.cjs')
const freeBoard=require('./tacticsFree.cjs')
const COLLECTION = 'team_tactics'
const MATCH_SIZES = [5, 7, 8, 9, 11]
const MAX_TACTICS = 20
const MAX_SUBSTITUTES = 15
const MAX_READ = 100
const MAX_OPPONENT_NUMBER = 99
const DIRECTIONS = ['attack', 'defend']
function isMissingCollection(error) {
  const code = Number(error && (error.code || error.errCode))
  if (code === -502005) return true
  const message = String(error && (error.message || error.errMsg || error.code) || '')
  return /DATABASE_COLLECTION_NOT_EXIST|COLLECTION_NOT_EXIST|Db or Table not exist|ResourceNotFound|collection not exist|invalid collection|does not exist|not exist|not found|集合不存在|数据集合不存在|表不存在/i.test(message)
}

const text = value => String(value == null ? '' : value).trim()
const toTime = value => {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}
const unique = values => values.filter((value, index, rows) => rows.indexOf(value) === index)

function dateText(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return local.toISOString().slice(5, 16).replace('T', ' ')
}

function assertPermission(workspace, needManage) {
  const permissions = new Set(workspace.permissions || [])
  if (!permissions.has('team.view') && !permissions.has('team.manage')) throw new Error('当前身份没有查看球队战术板的权限')
  if (needManage && !permissions.has('team.manage')) throw new Error('当前身份没有编辑球队战术板的权限')
}

async function loadScope(event, identity, deps, needManage) {
  const result = await deps.findWorkspaceForAction(identity.user, identity.openId, event.workspaceId)
  const workspace = result.workspace
  assertPermission(workspace, needManage)
  const teamId = text(event.teamId)
  if (!teamId) throw new Error('缺少球队编号')
  const teams = await deps.loadTeams(workspace, identity.user, identity.openId)
  const team = teams.find(item => text(item._id) === teamId)
  if (!team) throw new Error('球队不存在或不属于当前工作空间')
  return { workspace, team, teamId }
}

async function readRows(db, teamId) {
  try {
    const result = await db.collection(COLLECTION).where({ teamId }).limit(MAX_READ).get()
    return result.data || []
  } catch (error) {
    if (isMissingCollection(error)) return []
    throw new Error('战术板读取失败，请重试')
  }
}

async function ensureCollection(db) {
  try {
    await db.createCollection(COLLECTION)
  } catch (error) {
    const code = Number(error && (error.code || error.errCode))
    const message = String(error && (error.message || error.errMsg) || '')
    if (code === -501001 || code === -502002 || /exist|already|已存在/i.test(message)) return
    throw new Error('战术板存储准备失败，请重试')
  }
}

// 横版球场点位：以屏幕百分比保存，允许自由拖拽；缺失时回退到阵型默认点位。
const POINT_MIN_X = 4
const POINT_MAX_X = 96
const POINT_MIN_Y = 10
const POINT_MAX_Y = 90

function round1(value) {
  return Math.round(Number(value) * 10) / 10
}

function clampPoint(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return round1(Math.min(max, Math.max(min, number)))
}

function defaultPoint(depth, lateral, mirror) {
  return {
    x: round1(mirror ? 92 - Number(depth || 0) * 0.84 : 8 + Number(depth || 0) * 0.84),
    y: round1(mirror ? 92 - Number(lateral || 0) * 0.84 : 8 + Number(lateral || 0) * 0.84)
  }
}

function pointFor(item, info, role, mirror) {
  const row = (info && info.positions ? info.positions : []).find(position => text(position.role) === role)
  const fallback = defaultPoint(row ? row.x : 50, row ? row.y : 50, mirror)
  const x = clampPoint(item && item.x, POINT_MIN_X, POINT_MAX_X)
  const y = clampPoint(item && item.y, POINT_MIN_Y, POINT_MAX_Y)
  return { x: x == null ? fallback.x : x, y: y == null ? fallback.y : y }
}

function publicTactic(row) {
  if(row.boardMode==='free')return {...freeBoard.normalize(row),id:text(row._id),name:text(row.name),version:Number(row.version||1),updatedAtText:dateText(row.updateTime||row.createTime)}
  const matchSize = Number(row.matchSize || 0)
  const formation = text(row.formation)
  const info = matchSize ? formationRules.formationFor(matchSize, formation) : null
  const positions = info && Array.isArray(row.positions)
    ? row.positions.map(item => ({ role: text(item && item.role), playerId: text(item && item.playerId), ...pointFor(item, info, text(item && item.role), false) })).filter(item => item.role && item.playerId)
    : []
  const substituteIds = Array.isArray(row.substituteIds) ? row.substituteIds.map(text).filter(Boolean) : []
  // 旧战术没有对方、攻防方向或点位字段，按“无对方、我方进攻、阵型默认点位”回读，不能报错或丢数据。
  const opponentPositions = info && Array.isArray(row.opponentPositions)
    ? row.opponentPositions.map(item => ({ role: text(item && item.role), number: normalizeOpponentNumber(item && item.number), ...pointFor(item, info, text(item && item.role), true) })).filter(item => item.role && item.number)
    : []
  return {
    id: text(row._id),
    name: text(row.name),
    matchSize,
    formation: info ? info.id : formation,
    formationName: info ? info.name : formation,
    direction: normalizeDirection(row.direction),
    positions,
    opponentPositions,
    substituteIds,
    notes: text(row.notes),
    version: Number(row.version || 1),
    updatedAtText: dateText(row.updateTime || row.createTime)
  }
}

function normalizeDirection(value) {
  return DIRECTIONS.includes(text(value)) ? text(value) : 'attack'
}

function normalizeOpponentNumber(value) {
  const digits = String(value == null ? '' : value).replace(/\D/g, '').replace(/^0+/, '')
  if (!digits || digits.length > 2) return ''
  const number = Number(digits)
  return number >= 1 && number <= MAX_OPPONENT_NUMBER ? String(number) : ''
}

// 对方只记球衣号码，不关联对手球队名单；同侧号码不重复，未填的位置允许留空。
function normalizeOpponentPositions(matchSize, formation, rows) {
  const info = formationRules.formationFor(matchSize, formation)
  if (!info) throw new Error('阵型不属于所选比赛人数，请重新选择')
  const roles = info.positions.map(item => item.role)
  const byRole = {}
  const seenNumbers = []
  ;(Array.isArray(rows) ? rows : []).forEach(item => {
    const role = text(item && item.role)
    const raw = text(item && item.number)
    if (!role || !raw) return
    if (!roles.includes(role)) throw new Error('对方位置不属于当前阵型，请重新选择')
    const number = normalizeOpponentNumber(raw)
    if (!number) throw new Error('对方号码只能填 1—' + MAX_OPPONENT_NUMBER + ' 的整数')
    if (seenNumbers.includes(number)) throw new Error('对方号码不能重复，请改成不同号码')
    seenNumbers.push(number)
    byRole[role] = { number, ...pointFor(item, info, role, true) }
  })
  return info.positions.map(item => {
    const stored = byRole[item.role]
    const point = stored || defaultPoint(item.x, item.y, true)
    return { role: item.role, number: stored ? stored.number : '', x: point.x, y: point.y }
  }).filter(item => item.number)
}

function normalizePositions(matchSize, formation, positions) {
  const info = formationRules.formationFor(matchSize, formation)
  if (!info) throw new Error('阵型不属于所选比赛人数，请重新选择')
  const byRole = {}
  ;(Array.isArray(positions) ? positions : []).forEach(item => {
    const role = text(item && item.role)
    const playerId = text(item && item.playerId)
    if (role && playerId) byRole[role] = { playerId, ...pointFor(item, info, role, false) }
  })
  return info.positions.map(item => {
    const stored = byRole[item.role]
    const point = stored || defaultPoint(item.x, item.y, false)
    return { role: item.role, playerId: stored ? stored.playerId : '', x: point.x, y: point.y }
  })
}

async function eligiblePlayers(deps, teamId) {
  const rows = await deps.safeGetTeamPlayers(teamId, 500)
  return rows.filter(item => !['archived', 'deleted'].includes(text(item.status).toLowerCase()))
}

function validatePayload(event, players) {
  const name = text(event.name).slice(0, 24)
  if (!name) throw new Error('请填写战术名称')
  const matchSize = Number(event.matchSize)
  if (!MATCH_SIZES.includes(matchSize)) throw new Error('请选择 5、7、8、9 或 11 人制')
  const formation = text(event.formation)
  const positions = normalizePositions(matchSize, formation, event.positions)
  if (positions.some(item => !item.playerId)) throw new Error('请排满我方位置')
  const playerIds = players.map(item => text(item._id))
  const rosterIds = unique(players.map(item => text(item._id)))
  let validated
  try {
    validated = formationRules.validate(matchSize, { formation, positions }, rosterIds)
  } catch (error) {
    throw new Error('我方位置与球员不一致，请重新排阵')
  }
  const substituteIds = unique((Array.isArray(event.substituteIds) ? event.substituteIds : []).map(text).filter(Boolean))
  if (substituteIds.length > MAX_SUBSTITUTES) throw new Error('替补最多 ' + MAX_SUBSTITUTES + ' 人')
  if (substituteIds.some(id => playerIds.indexOf(id) < 0)) throw new Error('替补包含不在本队的球员')
  if (substituteIds.some(id => positions.some(item => item.playerId === id))) throw new Error('我方球员不能同时放在替补席')
  return {
    name,
    matchSize,
    formation: validated.formation,
    direction: normalizeDirection(event.direction),
    positions: normalizePositions(matchSize, validated.formation, positions),
    opponentPositions: normalizeOpponentPositions(matchSize, validated.formation, event.opponentPositions),
    substituteIds,
    notes: text(event.notes).slice(0, 160)
  }
}

async function list(db, identity, event, deps) {
  const scope = await loadScope(event, identity, deps, false)
  const rows = await readRows(db, scope.teamId)
  const active = rows.filter(item => text(item.status || 'active') !== 'deleted')
  active.sort((a, b) => toTime(b.updateTime || b.createTime) - toTime(a.updateTime || a.createTime))
  return {
    success: true,
    team: {
      id: scope.teamId,
      name: text(scope.team.name || scope.team.teamName || '球队'),
      logo: text(scope.team.logo || scope.team.logoUrl || scope.team.teamLogo)
    },
    canManage: (scope.workspace.permissions || []).indexOf('team.manage') >= 0,
    tactics: active.map(publicTactic),
    maxSaved: MAX_TACTICS
  }
}

async function save(db, identity, event, deps) {
  const scope = await loadScope(event, identity, deps, true)
  const players = event.boardMode==='free'?[]:await eligiblePlayers(deps, scope.teamId)
  const name=text(event.name).slice(0,24)
  if(!name)throw new Error('请填写战术名称')
  const payload = event.boardMode==='free'?{...freeBoard.normalize(event),name}:{...validatePayload(event, players),boardMode:'lineup'}
  if(event.boardMode==='free'&&payload.tokens.some(t=>t.playerId)){
    const own=(await eligiblePlayers(deps,scope.teamId)).filter(p=>!p.isDeleted&&!['deleted','archived','removed'].includes(text(p.status).toLowerCase())&&text(p.teamId||p.teamCode)===scope.teamId)
    payload.tokens=payload.tokens.map(t=>{if(!t.playerId)return t;const player=own.find(p=>text(p._id)===t.playerId);if(!player)throw Error('阵容包含不在本队的球员，请重新选择');const jersey=text(player.jerseyNumber||player.jerseyNo||player.number||player.shirtNumber);return {...t,playerName:text(player.name||player.playerName).slice(0,30),number:/^[1-9]\d?$/.test(jersey)?jersey:t.number}})
    Object.assign(payload,freeBoard.normalize(payload))
  }
  const now = db.serverDate()
  const tacticId = text(event.tacticId)
  if (tacticId) {
    const current = (await readRows(db, scope.teamId)).find(item => text(item._id) === tacticId)
    if (!current || text(current.status || 'active') === 'deleted') throw new Error('战术方案不存在或已被删除')
    if (Number(event.version) !== Number(current.version || 1)) throw new Error('战术方案已更新，请刷新后重试')
    await db.runTransaction(async transaction => {
      const reply = await transaction.collection(COLLECTION).doc(tacticId).get()
      const fresh = Array.isArray(reply.data) ? reply.data[0] : reply.data
      if (!fresh || text(fresh.teamId) !== scope.teamId || text(fresh.status || 'active') === 'deleted') throw new Error('战术方案不存在或已被删除')
      if (Number(fresh.version || 1) !== Number(event.version)) throw new Error('战术方案已更新，请刷新后重试')
      await transaction.collection(COLLECTION).doc(tacticId).update({
        data: {
          ...payload,
          version: Number(fresh.version || 1) + 1,
          updatedBy: text(identity.user._id),
          updateTime: now
        }
      })
    })
    return { success: true, tactic: publicTactic({ ...payload, _id: tacticId, version: Number(event.version) + 1, updateTime: now }) }
  }
  const existing = await readRows(db, scope.teamId)
  if (existing.filter(item => text(item.status || 'active') !== 'deleted').length >= MAX_TACTICS) throw new Error('战术方案最多保存 ' + MAX_TACTICS + ' 套，请先删除不再使用的方案')
  await ensureCollection(db)
  const created = await db.collection(COLLECTION).add({
    data: {
      ...payload,
      orgId: text(scope.workspace.orgId || scope.team.orgId),
      teamId: scope.teamId,
      status: 'active',
      version: 1,
      createdBy: text(identity.user._id),
      updatedBy: text(identity.user._id),
      createTime: now,
      updateTime: now
    }
  })
  return { success: true, tactic: publicTactic({ ...payload, _id: text(created._id), version: 1, updateTime: now }) }
}

async function remove(db, identity, event, deps) {
  const scope = await loadScope(event, identity, deps, true)
  const tacticId = text(event.tacticId)
  if (!tacticId) throw new Error('缺少战术方案编号')
  const current = (await readRows(db, scope.teamId)).find(item => text(item._id) === tacticId)
  if (!current || text(current.status || 'active') === 'deleted') throw new Error('战术方案不存在或已被删除')
  if (event.version != null && Number(event.version) !== Number(current.version || 1)) throw new Error('战术方案已更新，请刷新后重试')
  await db.collection(COLLECTION).doc(tacticId).remove()
  return { success: true, tacticId }
}

module.exports = { list, save, remove, COLLECTION, MATCH_SIZES, MAX_TACTICS, MAX_SUBSTITUTES, publicTactic }
