'use strict'
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const profileStore = require('../cloudfunctions/webLoginApi/cardWorldProfile.cjs')
const handle = require('../cloudfunctions/webLoginApi/cardWorld.cjs')

function missingError(name) {
  const error = new Error('Db or Table not exist: ' + name)
  error.errCode = -502005
  error.errMsg = error.message
  return error
}

function createDb(options) {
  const state = {
    profiles: (options.profiles || []).map(function (row) { return Object.assign({}, row) }),
    added: [],
    collectionsCreated: [],
    missing: new Set(options.missing || [])
  }
  const db = {
    serverDate: function () { return { __serverDate: true } },
    command: { or: function (list) { return { __or: list } } },
    createCollection: async function (name) {
      if (options.createFails) {
        const error = new Error(options.createFails.message || 'permission denied')
        error.errCode = options.createFails.errCode
        error.errMsg = error.message
        throw error
      }
      state.collectionsCreated.push(name)
      state.missing.delete(name)
    },
    collection: function (name) {
      return {
        where: function (query) {
          return {
            limit: function () {
              return {
                get: async function () {
                  if (state.missing.has(name)) throw missingError(name)
                  if (name === 'card_world_profiles') {
                    return { data: state.profiles.filter(function (row) { return row.userId === query.userId }).slice(0, 2) }
                  }
                  if (name === 'players') {
                    const ids = (query.__or || []).map(function (item) { return item.linkedUserId || item.playerUserId || item.guardianUserId })
                    return { data: (options.players || []).filter(function (player) { return ids.indexOf(player.linkedUserId) >= 0 || ids.indexOf(player.playerUserId) >= 0 || ids.indexOf(player.guardianUserId) >= 0 }) }
                  }
                  const sessions = (options.sessions && options.sessions[name]) || []
                  return { data: sessions.filter(function (row) { return row.tokenHash === query.tokenHash && row.active !== false }).slice(0, 2) }
                }
              }
            }
          }
        },
        add: async function (payload) {
          const data = payload.data
          state.added.push(JSON.parse(JSON.stringify(data)))
          if (data._id || data._openid) {
            const error = new Error('invalid key _id/_openid')
            error.errCode = -501007
            error.errMsg = error.message
            throw error
          }
          if (state.missing.has(name)) throw missingError(name)
          const row = Object.assign({ _id: 'profile-' + (state.profiles.length + 1) }, data)
          state.profiles.push(row)
          return { _id: row._id }
        },
        doc: function (id) {
          return {
            get: async function () {
              if (name !== 'users') return { data: null }
              const user = (options.users || []).find(function (row) { return row._id === id || row.__docId === id })
              if (!user) return { data: null }
              const copy = Object.assign({}, user)
              delete copy.__docId
              return { data: copy }
            },
            update: async function (payload) {
              const row = state.profiles.find(function (item) { return item._id === id })
              if (row) Object.assign(row, payload.data)
            }
          }
        }
      }
    }
  }
  return { db: db, state: state }
}

function hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function depsFor(db) {
  return {
    cloud: { database: function () { return db } },
    hashSessionToken: hash,
    dateValue: function (value) { return Number(value) || 0 }
  }
}

async function main() {
  const stripped = profileStore.stripReserved({ _id: 'x', _openid: 'y', userId: 'u', nickname: '甲', empty: undefined })
  assert.deepEqual(Object.keys(stripped).sort(), ['nickname', 'userId'])
  assert.equal(profileStore.isMissingCollection(missingError('card_world_profiles')), true)
  assert.equal(profileStore.isMissingCollection(Object.assign(new Error('permission'), { errCode: -501009 })), false)

  const created = createDb({ missing: ['card_world_profiles'] })
  const profile = await profileStore.ensureProfile(created.db, { id: 'user-1' }, { _id: 'nope', _openid: 'wx', cityCode: '410200' })
  assert.equal(profile.userId, 'user-1')
  assert.equal(profile._id, 'profile-1')
  assert.deepEqual(created.state.collectionsCreated, ['card_world_profiles'])
  assert.equal(created.state.added.length, 1)
  assert.equal(created.state.added[0]._id, undefined)
  assert.equal(created.state.added[0]._openid, undefined)
  assert.equal(created.state.added[0].cityCode, '410200')
  assert.deepEqual(created.state.added[0].createdAt, { __serverDate: true })
  const again = await profileStore.ensureProfile(created.db, { _id: 'user-1' })
  assert.equal(again._id, 'profile-1')
  assert.equal(created.state.added.length, 1)

  const conflicted = createDb({
    profiles: [{ _id: 'a', userId: 'user-2' }, { _id: 'b', userId: 'user-2' }]
  })
  await assert.rejects(
    profileStore.ensureProfile(conflicted.db, { _id: 'user-2' }),
    function (error) { return error.code === 'WORLD_PROFILE_CONFLICT' }
  )
  assert.equal(conflicted.state.added.length, 0)

  await assert.rejects(
    profileStore.ensureProfile(created.db, { phone: '13800000000' }),
    function (error) { return error.code === 'WORLD_USER_ID_MISSING' }
  )

  const logs = []
  const original = console.error
  console.error = function (line) { logs.push(String(line)) }
  try {
    const blocked = createDb({ missing: ['card_world_profiles'], createFails: { errCode: -501009, message: 'permission denied' } })
    await assert.rejects(
      profileStore.ensureProfile(blocked.db, { _id: 'user-3' }),
      function (error) { return error.code === 'WORLD_PROFILE_FAILED' && error.errCode === -501009 }
    )
  } finally {
    console.error = original
  }
  assert.ok(logs.some(function (line) { return line.indexOf('[cardWorld] ensureProfile failed') === 0 && line.indexOf('-501009') > 0 }))

  const token = 'session-token'
  const ready = createDb({
    missing: ['card_world_profiles', 'referee_h5_sessions'],
    users: [{ __docId: 'user-9', phoneNumber: '13800138000', name: '已验证' }],
    players: [{ _id: 'player-1', name: '林川', position: '前锋', jerseyNumber: 9, linkedUserId: 'user-9' }],
    sessions: {
      service_private_sessions: [{
        _id: 's1', tokenHash: hash(token), active: true, userId: 'user-9', expiresAt: Date.now() + 60000
      }]
    }
  })
  const deps = depsFor(ready.db)
  const denied = await handle('cardWorldLogin', {}, deps)
  assert.equal(denied.code, 'WORLD_LOGIN_REQUIRED')
  assert.equal(denied.error, '请先完成手机号验证')
  const bad = await handle('cardWorldLogin', { serviceSessionToken: 'nope' }, deps)
  assert.equal(bad.error, '请重新连接微信')
  const login = await handle('cardWorldLogin', { serviceSessionToken: token, cityCode: '410100', cityName: '郑州市' }, deps)
  assert.equal(login.success, true, login.error)
  assert.equal(login.userId, 'user-9')
  assert.equal(login.cityCode, '410100')
  assert.equal(ready.state.added[0]._openid, undefined)
  const main = await handle('cardWorldMainCard', { serviceSessionToken: token }, deps)
  assert.equal(main.success, true)
  assert.equal(main.empty, false)
  assert.equal(main.name, '林川')
  assert.equal(main.stats[1].num, '—')
  const album = await handle('cardWorldAlbum', { serviceSessionToken: token }, deps)
  assert.equal(album.tiles.length, 1)
  assert.equal(album.tiles[0].isMain, true)
  const lineup = await handle('cardWorldLineup', { serviceSessionToken: token }, deps)
  assert.equal(lineup.rows.length, 5)
  assert.equal(lineup.rows[4].key, 'gk')
  assert.equal(lineup.challengeDisabled, true)
  const localOnly = await handle('cardWorldSignSameCity', { serviceSessionToken: token }, deps)
  assert.equal(localOnly.code, 'WORLD_ENGINE_LOCAL')

  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/webLoginApi/index.js'), 'utf8')
  assert.ok(source.indexOf("action.indexOf('cardWorld') === 0") > 0)
  assert.ok(source.indexOf("require('./cardWorld.cjs')") > 0)
  console.log('card world profile tests passed')
}

main().catch(function (error) {
  console.error(error)
  process.exit(1)
})
