import assert from 'node:assert/strict'
import { evaluatePenaltyShootout as evaluate } from '../cloudfunctions/dataCenter/shared/penalty-shootout.mjs'

const rows = (home, away) => home.map((kick, index) => ({ round: index + 1, home: kick == null ? '' : kick ? 'scored' : 'missed', away: away[index] == null ? '' : away[index] ? 'scored' : 'missed' }))
// Production screenshot: the away side's fifth goal must remain in the total.
const screenshot = rows([1, 0, 1, 1, 1], [0, 1, 0, 1, 1])
let result = evaluate(screenshot, 'away')
assert.deepEqual([result.home, result.away, result.complete, result.winnerSide], [4, 3, true, 'home'])
assert.equal(result.rounds.length, 5)
result = evaluate(screenshot, 'home')
assert.deepEqual([result.home, result.away, result.complete], [4, 3, false])
assert.match(result.reason, /先罚球队/)
result = evaluate(screenshot, '')
assert.deepEqual([result.home, result.away, result.complete], [4, 3, false])
assert.match(result.reason, /请选择/)

// A partially entered early round must not hide later values while correcting.
const incomplete = structuredClone(screenshot)
incomplete[1].home = ''
result = evaluate(incomplete, 'away')
assert.deepEqual([result.home, result.away, result.complete], [4, 3, false])
assert.match(result.reason, /第2轮/)
assert.equal(evaluate(rows([1, 1, 1], [0, 0, 0]), 'home').complete, true)
assert.equal(evaluate(rows([1, 1, 1, 1], [0, 0, 0, 0]), 'home').complete, false)

// A deciding fifth kick may be taken by either side, with the other left blank.
result = evaluate(rows([1, 0, 1, 1, 1], [0, 1, 0, 1, null]), 'home')
assert.deepEqual([result.complete, result.home, result.away, result.winnerSide], [true, 4, 2, 'home'])
result = evaluate(rows([0, 1, 0, 1, null], [1, 0, 1, 1, 1]), 'away')
assert.deepEqual([result.complete, result.home, result.away, result.winnerSide], [true, 2, 4, 'away'])

const fiveTied = rows([1, 1, 1, 1, 1], [1, 1, 1, 1, 1])
assert.equal(evaluate(fiveTied, 'away').canAddRound, true)
assert.equal(evaluate([...fiveTied, { round: 6, home: 'scored', away: '' }], 'home').complete, false)
result = evaluate([...fiveTied, { round: 6, home: 'scored', away: 'missed' }], 'away')
assert.deepEqual([result.complete, result.home, result.away, result.winnerSide], [true, 6, 5, 'home'])
assert.equal(evaluate([...fiveTied, { round: 6, home: 'missed', away: 'missed' }], 'away').canAddRound, true)
assert.equal(evaluate([{ round: 2, home: 'scored', away: 'missed' }], 'home').complete, false)
assert.equal(evaluate([{ round: 1, home: 'invalid', away: 'missed' }], 'home').complete, false)
for (const first of ['home', 'away']) {
  const mirrored = screenshot.map(row => ({ ...row, home: row.away, away: row.home }))
  const original = evaluate(screenshot, first)
  const opposite = evaluate(mirrored, first === 'home' ? 'away' : 'home')
  assert.deepEqual([original.home, original.away, original.complete], [opposite.away, opposite.home, opposite.complete])
}
console.log('PASS: shootout totals, first kicker, early decisions, incomplete corrections and sudden death')
