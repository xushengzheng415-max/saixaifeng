import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { firstUnfinishedMatchDate } from '../web-admin-vue/src/utils/matchCalendarSelection.js'
import { matchListQuery } from '../web-admin-vue/src/utils/matchListContext.js'

const days = ['2026-09-26', '2026-10-01', '2026-10-04'].map(date => ({ date }))
const matches = [
  { matchDate: days[0].date, state: 'completed' },
  { matchDate: days[1].date, state: 'scheduled' },
  { matchDate: days[1].date, state: 'completed' },
  { matchDate: days[2].date, state: 'scheduled' }
]
const needsEntry = match => ['scheduled', 'live', 'supplement', 'review'].includes(match.state)
assert.equal(firstUnfinishedMatchDate(days, matches, needsEntry), days[1].date)
matches[1].state = 'completed'
assert.equal(firstUnfinishedMatchDate(days, matches, needsEntry), days[2].date)
matches[3].state = 'completed'
assert.equal(firstUnfinishedMatchDate(days, matches, needsEntry), days[0].date)

const source = fs.readFileSync(new URL('../web-admin-vue/src/views/tournament/TournamentScheduleV2.vue', import.meta.url), 'utf8')
const context = {
  tournamentId: 't', selectedDate: { value: days[1].date }, divisionFilter: { value: 'all' },
  view: { value: 'map' }, arrangedMatches: { value: matches }, firstUnfinishedMatchDate,
  managementState: match => ({ key: match.state })
}
vm.createContext(context)
vm.runInContext(source.slice(source.indexOf('function matchRoute('), source.indexOf('function openMatchWorkspace')), context)
const matchQuery = context.matchRoute({ _id: 'm', divisionId: 'middle' }).query
assert.deepEqual(matchListQuery(matchQuery), { date: days[1].date })
vm.runInContext('const restoreDate = ' + source.match(/watch\(calendarDays, ([\s\S]*?), \{ immediate:true \}\)/)[1], context)
vm.runInContext('restoreDate(' + JSON.stringify(days) + ')', context)
assert.equal(context.selectedDate.value, days[1].date)
context.selectedDate.value = ''
matches[1].state = 'scheduled'
vm.runInContext('restoreDate(' + JSON.stringify(days) + ')', context)
assert.equal(context.selectedDate.value, days[1].date)
assert.equal(context.divisionFilter.value, 'all')
console.log('PASS: unfinished date, all divisions, and return context')
