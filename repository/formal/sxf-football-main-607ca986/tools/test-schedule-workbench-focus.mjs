import assert from 'node:assert/strict'
import { findWorkbenchFocusMatch } from '../web-admin-vue/src/utils/matchScheduleFocus.js'

const rows = [
  { _id:'done',matchDate:'2026-10-01',matchTime:'09:00',state:'completed' },
  { _id:'postponed',matchDate:'2026-10-03',matchTime:'09:00',status:'postponed',state:'scheduled' },
  { _id:'first',matchDate:'2026-10-04',matchTime:'09:00',state:'scheduled' },
  { _id:'second',matchDate:'2026-10-04',matchTime:'10:30',state:'scheduled' },
  { _id:'later',matchDate:'2026-10-07',matchTime:'09:00',state:'scheduled' },
  { _id:'unassigned',matchDate:'',matchTime:'',state:'scheduled' }
]
const stateOf = match => ({ key:match.state })

assert.equal(findWorkbenchFocusMatch(rows,'2026-10-07',stateOf)?._id,'later')
assert.equal(findWorkbenchFocusMatch(rows,'2026-10-01',stateOf)?._id,'first')
assert.equal(findWorkbenchFocusMatch(rows,'2026-10-03',stateOf)?._id,'first')
assert.equal(findWorkbenchFocusMatch(rows,'2026-10-04',stateOf)?._id,'first')
assert.equal(findWorkbenchFocusMatch(rows.filter(match => match.state === 'completed'),'2026-10-01',stateOf),null)
console.log('PASS: workbench focuses the selected day or earliest unstarted match')
