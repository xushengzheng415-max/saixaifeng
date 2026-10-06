import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  extractScheduleRows,
  normalizeOpponent,
  normalizeScheduleDate,
  normalizeScheduleTime,
  recognitionSummary,
  recognizeScheduleRows
} from '../web-admin-vue/src/utils/scheduleWorkbookRecognition.js'

const require = createRequire(import.meta.url)
const XLSX = require('../web-admin-vue/node_modules/xlsx')

assert.equal(normalizeScheduleDate('9/26/26'), '2026-09-26')
assert.equal(normalizeScheduleDate('2026年9月26日'), '2026-09-26')
assert.equal(normalizeScheduleTime('9:00'), '09:00')
assert.equal(normalizeScheduleTime(0.5), '12:00')
assert.equal(normalizeOpponent('场序41负者'), 'm41l')
assert.equal(normalizeOpponent('41负(青年组7.8名)'), 'm41l')
assert.equal(normalizeOpponent('A组第3'), 'a3')

const sheet = XLSX.utils.aoa_to_sheet([
  ['2026年测试赛程'],
  ['场序','比赛日期','星期','时间','组别','比赛对阵','场地'],
  [1,'9/26/26','星期六','9:00','青年组A组','汴梁小伙伴 vs 开封立洋足球队',1],
  [2,'','','10:30','青年组','41负VS42负(青年组7.8名)',2]
])
sheet['!merges'] = [{ s:{ r:2,c:1 },e:{ r:3,c:1 } },{ s:{ r:2,c:2 },e:{ r:3,c:2 } }]
const extracted = extractScheduleRows(XLSX, sheet)
assert.equal(extracted.error, '')
assert.equal(extracted.rows.length, 2)
assert.equal(extracted.rows[1].matchDate, '2026-09-26')

const matches = [
  { _id:'m1',matchNo:1,divisionId:'youth',divisionName:'青年组',group:'A组',homeTeamName:'汴梁小伙伴',awayTeamName:'开封立洋足球队' },
  { _id:'m2',matchNo:50,divisionId:'youth',divisionName:'青年组',homeSourceLabel:'场序41负者',awaySourceLabel:'场序42负者' }
]
const recognized = recognizeScheduleRows(extracted.rows, matches, [{ name:'1号场地' },{ name:'2号场地' }])
assert.equal(recognized[0].matchId, 'm1')
assert.equal(recognized[0].venue, '1号场地')
assert.equal(recognized[0].status, 'ready')
assert.equal(recognized[1].matchId, 'm2')
assert.equal(recognized[1].status, 'ready')
assert.deepEqual(recognitionSummary(recognized), { total:2,recognized:2,ready:2,pairingOnly:0,plannedKnockout:0,incomplete:0,unmatched:0 })

const pairingOnlySheet = XLSX.utils.aoa_to_sheet([
  ['场序','组别','比赛对阵','比赛日期','开赛时间','比赛场地'],
  [1,'青年组A组','汴梁小伙伴 VS 开封立洋足球队','','','']
])
const pairingOnly = recognizeScheduleRows(extractScheduleRows(XLSX, pairingOnlySheet).rows, matches, [])
assert.equal(pairingOnly[0].status, 'pairing_only')

const dependencyRows = [
  { sourceRow:2,matchNo:41,division:'青年组',home:'A组第3',away:'B组第4',matchDate:'2026-10-17',matchTime:'15:00',venueRaw:'1' },
  { sourceRow:3,matchNo:42,division:'青年组',home:'A组第4',away:'B组第3',matchDate:'2026-10-17',matchTime:'15:00',venueRaw:'2' },
  { sourceRow:4,matchNo:48,division:'青年组',home:'41负',away:'42负(青年组7.8名)',matchDate:'2026-10-24',matchTime:'10:30',venueRaw:'2' }
]
const dependencyMatches = [
  { _id:'q1',matchNo:17,divisionId:'youth',divisionName:'青年组',homeSourceLabel:'A组第3',awaySourceLabel:'B组第4' },
  { _id:'q2',matchNo:18,divisionId:'youth',divisionName:'青年组',homeSourceLabel:'A组第4',awaySourceLabel:'B组第3' },
  { _id:'p1',matchNo:21,divisionId:'youth',divisionName:'青年组',homeSourceLabel:'场序17负者',awaySourceLabel:'场序18负者' }
]
const dependencyRecognized = recognizeScheduleRows(dependencyRows,dependencyMatches,[{name:'1号场地'},{name:'2号场地'}])
assert.deepEqual(dependencyRecognized.map(row=>row.matchId),['q1','q2','p1'])

const plannedKnockout = recognizeScheduleRows([{ sourceRow:43,matchNo:41,division:'青年组',home:'A组第3',away:'B组第4',matchDate:'2026-10-17',matchTime:'15:00',venueRaw:'2' }],[],[{name:'2号场地'}])
assert.equal(plannedKnockout[0].status,'planned_knockout')
assert.equal(recognitionSummary(plannedKnockout).plannedKnockout,1)

console.log(JSON.stringify({ passed:true,recognized:recognized.length,pairingOnly:pairingOnly.length,dependencyReferences:dependencyRecognized.length,plannedKnockout:plannedKnockout.length },null,2))
