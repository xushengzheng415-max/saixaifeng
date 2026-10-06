import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { dedupeImportedPlayerRows, registerImportedPlayerIdentity } = require('../cloudfunctions/tournamentRegistrationFlow/importDualRole.js')

function context(staff) {
  return { teamName:'成人测试队', staff, batchIdentities:new Set(staff.map(item => item.identityNumber).filter(Boolean)), dualRoleIdentities:new Set() }
}

const coach = { name:'张三', roleType:'head_coach', roleLabel:'主教练', identityNumber:'410000199001010011' }
const allowed = context([coach])
const result = registerImportedPlayerIdentity({ ...allowed, playerName:'张三', identityNumber:coach.identityNumber, playerJerseyNumber:'72' })
assert.equal(result.dualRoleType, 'head_coach_player')
assert.equal(coach.dualRoleType, 'head_coach_player')

assert.throws(
  () => registerImportedPlayerIdentity({ ...allowed, playerName:'张三', identityNumber:coach.identityNumber, playerJerseyNumber:'72' }),
  error => error.code === 'IMPORT_IDENTITY_DUPLICATED'
)

const mismatchCoach = { name:'李四', roleType:'head_coach', identityNumber:'410000199001010022' }
const mismatch = context([mismatchCoach])
assert.throws(
  () => registerImportedPlayerIdentity({ ...mismatch, playerName:'李五', identityNumber:mismatchCoach.identityNumber, playerJerseyNumber:'18' }),
  error => error.code === 'IMPORT_DUAL_ROLE_NAME_MISMATCH'
)

const otherStaff = { name:'王六', roleType:'team_leader', roleLabel:'领队', identityNumber:'410000199001010033' }
const leaderPlayer = context([otherStaff])
assert.equal(registerImportedPlayerIdentity({ ...leaderPlayer, playerName:'王六', identityNumber:otherStaff.identityNumber, playerJerseyNumber:'12' }).dualRoleType, 'team_leader_player')

const crossTeam = { teamName:'另一支球队', staff:[], batchIdentities:new Set([coach.identityNumber]), dualRoleIdentities:new Set() }
assert.throws(
  () => registerImportedPlayerIdentity({ ...crossTeam, playerName:'张三', identityNumber:coach.identityNumber, playerJerseyNumber:'72' }),
  error => error.code === 'IMPORT_IDENTITY_DUPLICATED'
)

const unique = context([])
const uniqueResult = registerImportedPlayerIdentity({ ...unique, playerName:'赵七', identityNumber:'410000199001010044' })
assert.equal(uniqueResult.dualRoleType, '')
assert.equal(unique.batchIdentities.has('410000199001010044'), true)

const duplicateRows = dedupeImportedPlayerRows([
  { name:'孙八', identityNumber:'410000199001010055', jerseyNumber:'69', photoFileId:'' },
  { name:'孙八', identityNumber:'410000199001010055', jerseyNumber:'69', photoFileId:'cloud://photo' }
], '成人测试队')
assert.equal(duplicateRows.rows.length, 1)
assert.equal(duplicateRows.duplicateCount, 1)
assert.equal(duplicateRows.rows[0].photoFileId, 'cloud://photo')

assert.throws(
  () => dedupeImportedPlayerRows([
    { name:'孙八', identityNumber:'410000199001010066' },
    { name:'孙九', identityNumber:'410000199001010066' }
  ], '成人测试队'),
  error => error.code === 'IMPORT_DUPLICATE_PERSON_NAME_MISMATCH'
)

console.log('team registration dual-role contract: PASS')
