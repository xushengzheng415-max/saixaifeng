const assert = require('node:assert/strict')
const { handleRankingSupport } = require('../cloudfunctions/webLoginApi/fanSupportPlayer.cjs')
const createFanCenter = require('../cloudfunctions/webLoginApi/fanCenter.cjs')

function mockCloud() {
  let data = {
    fan_h5_sessions:[{_id:'session',tokenHash:'token',active:true,expiresAt:new Date(Date.now()+60000),serviceAccountOpenId:'fan'}],
    fan_profiles:[{_id:'profile',serviceAccountOpenId:'fan'}],
    fan_points_ledger:[{_id:'bonus',serviceAccountOpenId:'fan',delta:100,reason:'fan-registration-bonus'}],
    fan_supports:[]
  }
  let nextId = 1
  const command = { gt:value => ({op:'gt',value}), and:values => ({op:'and',values}), in:values => ({op:'in',values}) }
  function matches(row,where) {
    if (where.op === 'and') return where.values.every(part => matches(row,part))
    return Object.entries(where).every(([key,value]) => value?.op === 'gt' ? row[key] > value.value : value?.op === 'in' ? value.values.includes(row[key]) : row[key] === value)
  }
  function collection(name) {
    const query = { filter:{}, max:100, where(value){this.filter=value;return this},orderBy(){return this},limit(value){this.max=value;return this},async get(){return {data:(data[name] || []).filter(row => matches(row,this.filter)).sort((a,b) => String(a._id).localeCompare(String(b._id))).slice(0,this.max)}} }
    query.doc = key => ({ async get(){return {data:(data[name] || []).find(row => row._id === key) || null}},async update({data:patch}){Object.assign(data[name].find(row => row._id === key),patch)},async set({data:row}){ const list=data[name] ||= [];const index=list.findIndex(item => item._id === key);const item={_id:key,...row};if(index < 0) list.push(item);else list[index]=item } })
    query.add = async ({data:row}) => { data[name].push({_id:'new-'+nextId++,...row}) }
    return query
  }
  const db = { command, collection, serverDate:() => new Date(), createCollection:async name => {data[name] ||= []}, async runTransaction(work) { const before=structuredClone(data);try{return {result:await work({collection})}}catch(error){data=before;throw error} } }
  return { cloud:{database:() => db}, data:() => data }
}

async function main() {
  const mock = mockCloud()
  const deps = { cloud:mock.cloud, hashSessionToken:value => value, dateValue:value => new Date(value).getTime(), fanPeriodKey:() => '2026-10-01', handleFanRankings:async () => ({data:{players:[{targetId:'public-target',playerId:'real-player',cardScoreVersion:'football-player-card-points/2',supportCount:0}],teams:[{targetId:'real-team',supportCount:0}]}}), loadCardScore:async () => ({status:'ready',points:45,tier:'silver',careerPoints:44,supportDrops:10,supportPoints:1,scoreVersion:'football-player-card-points/2'}) }
  const event = {fanSessionToken:'token',targetType:'player',targetId:'public-target',tournamentId:'real-cup',requestKey:'request-0001'}
  const first = await handleRankingSupport(event,deps)
  assert.equal(first.success,true)
  assert.equal(first.data.balance,99)
  assert.equal(first.data.playerId,'real-player')
  assert.equal(first.data.cardScore.points,45)
  assert.equal(mock.data().fan_supports.length,1)
  assert.equal(mock.data().fan_points_ledger.length,2)
  assert.equal(mock.data().fan_profiles[0].honeyBalance,99)
  assert.equal(mock.data().fan_supports[0].supportId,mock.data().fan_points_ledger[1].supportId)
  const repeated = await handleRankingSupport(event,deps)
  assert.equal(repeated.success,true)
  assert.equal(repeated.data.idempotent,true)
  assert.equal(mock.data().fan_supports.length,1)
  assert.equal(mock.data().fan_points_ledger.length,2)
  const fake = await handleRankingSupport({...event,targetId:'unknown',requestKey:'request-0002'},deps)
  assert.equal(fake.code,'FAN_TARGET_INVALID')
  const stale = await handleRankingSupport({...event,requestKey:'request-0003'},{...deps,handleFanRankings:async () => ({data:{players:[{targetId:'public-target',playerId:'real-player',cardScoreVersion:'football-player-card-points/1'}]}})})
  assert.equal(stale.code,'FAN_TARGET_INVALID')
  const badKey = await handleRankingSupport({...event,requestKey:'x'},deps)
  assert.equal(badKey.code,'FAN_REQUEST_INVALID')
  const team = await handleRankingSupport({...event,targetType:'team',targetId:'real-team',requestKey:'request-team1'},deps)
  assert.equal(team.success,true)
  assert.equal(team.data.cardScore,null)
  assert.equal(mock.data().fan_profiles[0].honeyBalance,98)
  assert.equal(mock.data().fan_supports.length,2)
  const center = createFanCenter({...deps,crypto:require('node:crypto'),SERVICE_ACCOUNT_CONFIG:{},normalizeServiceH5Url:value => value,httpsGet:async () => ({}),getPublicTournamentCenter:async () => ({data:{matches:[]}})})
  const checked = await center.handleFanCheckIn({fanSessionToken:'token'})
  assert.equal(checked.success,true)
  assert.equal(checked.data.points.balance,103)
  assert.equal(mock.data().fan_profiles[0].honeyBalance,103)
  mock.data().fan_profiles[0].honeyBalance = 0
  mock.data().fan_points_ledger.push({_id:'spent-rest',serviceAccountOpenId:'fan',delta:-103,reason:'test-spend'})
  const empty = await handleRankingSupport({...event,requestKey:'request-0004'},deps)
  assert.equal(empty.code,'FAN_POINTS_INSUFFICIENT')
  assert.equal(mock.data().fan_supports.length,2)
  console.log('PASS: 稳定球员 ID、同事务钱包扣费与应援、签到入账、幂等及余额门禁')
}
main().catch(error => { console.error(error); process.exitCode=1 })
