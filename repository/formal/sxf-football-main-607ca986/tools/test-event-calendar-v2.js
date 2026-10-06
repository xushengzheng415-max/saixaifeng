'use strict'

const assert = require('assert')
const pairing = require('../cloudfunctions/generateSchedule/pairingTemplates')
const scheduler = require('../cloudfunctions/generateSchedule/scheduler')

const fourSingle = pairing.standardRoundRobinRounds(4, 'single')
assert.strictEqual(fourSingle.length, 3)
assert.strictEqual(fourSingle.flat().length, 6)
const pairs = new Set(fourSingle.flat().map(pair => pair.slice().sort((a,b) => a-b).join('-')))
assert.strictEqual(pairs.size, 6)
fourSingle.forEach(round => assert.strictEqual(new Set(round.flat()).size, 4))

const fiveSingle = pairing.standardRoundRobinRounds(5, 'single')
assert.strictEqual(fiveSingle.length, 5)
assert.strictEqual(fiveSingle.flat().length, 10)
fiveSingle.forEach(round => assert.strictEqual(new Set(round.flat()).size, 4))

const fourDouble = pairing.standardRoundRobinRounds(4, 'double')
assert.strictEqual(fourDouble.length, 6)
assert.strictEqual(fourDouble.flat().length, 12)
assert.deepStrictEqual(fourDouble[3], fourDouble[0].map(pair => [pair[1], pair[0]]))

const template = pairing.standardRoundRobinTemplate({ groupSizes:[4,4],loopType:'single' })
assert.strictEqual(pairing.validatePairingTemplate(template).valid, true)
const broken = JSON.parse(JSON.stringify(template))
broken.stages[0].matches[1].home = broken.stages[0].matches[0].home
assert.strictEqual(pairing.validatePairingTemplate(broken).valid, false)

const config = {
  schemaVersion:2,
  startDate:'2026-10-01',
  endDate:'2026-10-03',
  matchDays:['周四','周五','周六'],
  timeStepMinutes:5,
  defaultTurnaroundMinutes:10,
  frequencyPreset:'adaptive',
  venueResources:[
    { name:'五人制1号场',fieldFormat:'5side',sessionWindows:[{ key:'morning',enabled:true,start:'09:00',end:'12:00' },{ key:'afternoon',enabled:true,start:'14:00',end:'18:00' }] },
    { name:'十一人制1号场',fieldFormat:'11side',sessionWindows:[{ key:'morning',enabled:true,start:'09:00',end:'13:00' },{ key:'afternoon',enabled:true,start:'14:00',end:'18:00' }] }
  ],
  divisionPolicies:{
    short:{ turnaroundMinutes:10,maxMatchesPerDay:2,maxPerSession:1,minRestMinutes:120,allowedDates:[],allowedSessions:[],allowedVenues:[] },
    long:{ turnaroundMinutes:20,maxMatchesPerDay:1,maxPerSession:1,minRestMinutes:1080,allowedDates:[],allowedSessions:[],allowedVenues:[] }
  }
}
const matches = [
  { _id:'s1',divisionId:'short',matchNo:1,matchFormat:'5side',requiredVenueFormat:'5side',durationMinutes:40,homeTeamId:'A',awayTeamId:'B' },
  { _id:'s2',divisionId:'short',matchNo:2,matchFormat:'5side',requiredVenueFormat:'5side',durationMinutes:40,homeTeamId:'A',awayTeamId:'C' },
  { _id:'l1',divisionId:'long',matchNo:1,matchFormat:'11side',requiredVenueFormat:'11side',durationMinutes:90,homeTeamId:'L1',awayTeamId:'L2' },
  { _id:'l2',divisionId:'long',matchNo:2,matchFormat:'11side',requiredVenueFormat:'11side',durationMinutes:90,homeTeamId:'L1',awayTeamId:'L3' }
]
const result = scheduler.assign(matches, config, new Set())
assert.strictEqual(result.unassigned, 0)
assert.notStrictEqual(matches[0].scheduleSession, matches[1].scheduleSession)
assert.notStrictEqual(matches[2].matchDate, matches[3].matchDate)
assert(matches.every(match => match.bufferMinutes === (match.divisionId === 'long' ? 20 : 10)))

console.log(JSON.stringify({ passed:true,roundRobin:{ fourSingle:6,fiveSingle:10,fourDouble:12 },adaptiveScheduling:matches.map(match => ({ id:match._id,date:match.matchDate,time:match.matchTime,venue:match.venue })) },null,2))
