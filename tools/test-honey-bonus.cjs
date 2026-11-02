'use strict'
const assert = require('node:assert/strict')
const path = require('node:path')
const bonus = require(path.resolve(__dirname, '../cloudfunctions/webLoginApi/honeyBonus.cjs'))

function makeDb(seed) {
  const rows = {
    fan_profiles: [...(seed.fan_profiles || [])],
    fan_points_ledger: [...(seed.fan_points_ledger || [])]
  }
  const whereMatch = (row, where) => {
    if (!where) return true
    return Object.keys(where).every(key => {
      const expected = where[key]
      if (expected && typeof expected === 'object' && expected.$gt != null) return String(row[key] || '') > String(expected.$gt)
      return String(row[key] == null ? '' : row[key]) === String(expected == null ? '' : expected)
    })
  }
  const collection = name => ({
    where(where) {
      const filtered = () => (rows[name] || []).filter(row => whereMatch(row, where))
      return {
        limit() { return this },
        orderBy() { return this },
        async get() { return { data: filtered() } }
      }
    },
    doc(id) {
      return {
        async get() {
          const row = (rows[name] || []).find(item => String(item._id) === String(id))
          return { data: row || null }
        },
        async update({ data }) {
          const row = (rows[name] || []).find(item => String(item._id) === String(id))
          if (!row) throw new Error('missing ' + id)
          Object.assign(row, data)
        }
      }
    },
    async add({ data }) {
      const id = data._id || name + '-' + (rows[name].length + 1)
      rows[name].push(Object.assign({ _id: id }, data))
      return { _id: id }
    }
  })
  const db = {
    command: { gt: value => ({ $gt: value }) },
    serverDate: () => new Date(),
    collection,
    async runTransaction(fn) { return fn({ collection }) }
  }
  return { db, rows }
}

async function main() {
  let count = 0
  const test = async (name, fn) => { await fn(); count += 1; console.log('PASS ' + name) }

  await test('constants', async () => {
    assert.equal(bonus.REGISTRATION_BONUS_DROPS, 10)
    assert.equal(bonus.PROFILE_COMPLETE_BONUS_DROPS, 50)
  })

  await test('profile complete requires status and portrait', async () => {
    assert.equal(bonus.isProfileCompleteReady({ profileStatus: 'complete' }), false)
    assert.equal(bonus.isProfileCompleteReady({ profileStatus: 'complete', photoUrl: 'cloud://x' }), true)
    assert.equal(bonus.isProfileCompleteReady({ profileStatus: 'pending', photoUrl: 'cloud://x' }), false)
  })

  await test('grant profile complete once per player', async () => {
    const x = makeDb({
      fan_profiles: [{ _id: 'p1', serviceAccountOpenId: 'oid-1', honeyBalance: 10 }],
      fan_points_ledger: [{ _id: 'l0', serviceAccountOpenId: 'oid-1', delta: 10, reason: 'fan-registration-bonus', refId: 'fan-registration-bonus:oid-1' }]
    })
    const first = await bonus.grantProfileCompleteBonus(x.db, { serviceAccountOpenId: 'oid-1', playerId: 'pr_1' })
    assert.equal(first.success, true)
    assert.equal(first.deduped, false)
    assert.equal(first.drops, 50)
    assert.equal(x.rows.fan_profiles[0].honeyBalance, 60)
    assert.equal(x.rows.fan_points_ledger.filter(row => row.reason === 'player-profile-complete-bonus').length, 1)
    const second = await bonus.grantProfileCompleteBonus(x.db, { serviceAccountOpenId: 'oid-1', playerId: 'pr_1' })
    assert.equal(second.success, true)
    assert.equal(second.deduped, true)
    assert.equal(x.rows.fan_profiles[0].honeyBalance, 60)
    assert.equal(x.rows.fan_points_ledger.filter(row => row.reason === 'player-profile-complete-bonus').length, 1)
  })

  await test('skip when honey account not open', async () => {
    const x = makeDb({ fan_profiles: [], fan_points_ledger: [] })
    const result = await bonus.grantProfileCompleteBonus(x.db, { serviceAccountOpenId: 'missing', playerId: 'pr_2' })
    assert.equal(result.success, false)
    assert.equal(result.skipped, true)
    assert.equal(result.code, 'HONEY_ACCOUNT_NOT_OPEN')
    assert.equal(x.rows.fan_points_ledger.length, 0)
  })

  console.log(count + ' honey bonus tests passed')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
