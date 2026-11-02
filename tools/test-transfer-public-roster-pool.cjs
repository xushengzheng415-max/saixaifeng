'use strict'
const assert = require('node:assert/strict')
const { handle } = require('../cloudfunctions/dataCenter/transfer/showcase.cjs')
const { pageIds } = require('../cloudfunctions/dataCenter/transfer/public-roster-pool.cjs')
function database(data, failures = []) {
  const cmd = { in: x => ({ $in: x }), gt: x => ({ $gt: x }), neq: x => ({ $ne: x }), and: x => ({ $and: x }) }
  function match(row, query) {
    if (query.$and) return query.$and.every(q => match(row, q))
    return Object.entries(query).every(([k,v]) => v && typeof v === 'object' ? ('$in' in v ? v.$in.includes(row[k]) : '$gt' in v ? row[k] > v.$gt : '$ne' in v ? row[k] !== v.$ne : false) : row[k] === v)
  }
  return { command: cmd, collection(name) {
    let condition = {}, count = 100, fields
    const query = { where(q) { condition = q; return query }, orderBy() { return query }, limit(n) { count = n; return query }, field(f) { fields = f; return query }, async get() {
      if (failures.includes(name)) throw Object.assign(Error('read failed'), { code: 'DATA_READ_FAILED' })
      let rows = (data[name] || []).filter(r => match(r, condition)).sort((a,b) => String(a._id).localeCompare(String(b._id))).slice(0,count)
      if (fields) rows = rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => fields[k])))
      return { data: rows }
    } }; return query
  } }
}
function fixture () {
  const players = Array.from({length:322},(_,i)=>({_id:'p'+String(i+1).padStart(3,'0'),name:'隔离球员'+(i+1),teamId:'team',photoUrl:'fixture://portrait',position:'MF',birthday:'1990-01-01'}))
  players.push({_id:'other',name:'他赛球员',teamId:'team'},{_id:'test-player',name:'测试球员',teamId:'team',isTest:true},{_id:'bad-team-player',name:'测试球队球员',teamId:'test-team'},{_id:'private-player',name:'私有球员',teamId:'team'},{_id:'optout',name:'不公开球员',teamId:'team',isPublic:false},{_id:'draft-player',name:'草稿赛事球员',teamId:'team'},{_id:'youth',name:'青少年示例',teamId:'team',birthday:'2015-01-01'})
  return {
    tournaments:[{_id:'t1',name:'隔离赛事1',status:'ongoing'},{_id:'t2',name:'隔离赛事2',status:'completed'},{_id:'private',status:'ongoing',isPublic:false},{_id:'draft',status:'draft'},{_id:'test-event',status:'ongoing',isTest:true}],
    teams:[{_id:'team',name:'隔离球队'},{_id:'test-team',name:'测试球队',isTest:true}], players,
    roster_snapshots:[
      {_id:'r1',tournamentId:'t1',teamId:'team',divisionId:'adult',status:'approved',playerIds:players.slice(0,322).map(x=>x._id)},
      {_id:'r2',tournamentId:'t2',teamId:'team',divisionId:'adult',status:'approved',playerIds:['p001','other','youth','test-player','optout']},
      {_id:'r3',tournamentId:'private',teamId:'team',status:'approved',playerIds:['private-player']},
      {_id:'r4',tournamentId:'draft',teamId:'team',status:'approved',playerIds:['draft-player']},
      {_id:'r5',tournamentId:'t1',teamId:'test-team',status:'approved',playerIds:['bad-team-player']},
      {_id:'r6',tournamentId:'t1',teamId:'team',status:'pending',playerIds:['private-player']},
      {_id:'r7',tournamentId:'test-event',teamId:'team',status:'approved',playerIds:['private-player']}
    ],
    player_valuations:[{_id:'v1',playerId:'p001',coverage:'complete',money:260,total:400,minor:false,computedAt:'2026-10-26T00:00:00Z'},{_id:'v2',playerId:'youth',coverage:'complete',money:8000,total:900,minor:true,computedAt:'2026-10-26T00:00:00Z'},{_id:'v3',playerId:'private-player',coverage:'complete',money:99999,minor:false,computedAt:'2026-10-26T00:00:00Z'}],
    divisions:[{_id:'adult',name:'成人组'}],transfer_requests:[],transfer_free_signings:[]
  }
}
async function main () {
  const data = fixture(), db = database(data)
  const first = await handle(db, {})
  assert.equal(first.success,true); assert.equal(first.data.schema,'transfer-showcase/5')
  assert.equal(first.data.playerPool,'public_roster')
  assert.equal(first.data.playerTotal,324,'322人加他赛2人，稳定ID跨赛事去重')
  assert.equal(first.data.players.length,30)
  assert.equal(first.data.top.length,1,'未测算/私有/青少年不进货币榜')
  assert.equal(first.data.players[0].moneyText,'¥260')
  let cursor='', all=[], pages=0
  do {
    const r=await handle(db,{tournamentId:'t1',playerCursor:cursor});assert.equal(r.success,true)
    all.push(...r.data.players);cursor=r.data.nextPlayerCursor;pages++
    assert.equal(r.data.playerTotal,322)
    if(!r.data.playerHasMore)assert.equal(cursor,'')
  } while(cursor && pages<20)
  assert.equal(pages,11);assert.equal(all.length,322);assert.equal(new Set(all.map(p=>p.playerId)).size,322)
  assert.equal(all.filter(p=>p.moneyState==='not_measured').length,321)
  assert(all.filter(p=>p.moneyState==='not_measured').every(p=>p.money===null&&p.photoUrl))
  const privacy = await handle(db,{tournamentId:'private'});assert.equal(privacy.data.players.length,0)
  const scoped=await handle(db,{tournamentId:'t1'})
  const wrong=await handle(db,{tournamentId:'t2',playerCursor:scoped.data.nextPlayerCursor});assert.equal(wrong.success,false);assert.equal(wrong.code,'DATA_VIEW_CHANGED')
  const invalid=await handle(db,{playerCursor:'broken'});assert.equal(invalid.success,false);assert.equal(invalid.code,'DATA_CURSOR_INVALID')
  const oldIds=['a','b','c'];const token=pageIds(oldIds,'scope','',1).nextCursor
  assert.throws(()=>pageIds(['c','a','b'],'scope',token,1),{code:'DATA_VIEW_CHANGED'})
  const failed=await handle(database(data,['roster_snapshots']),{});assert.equal(failed.success,false)
  const youth=await handle(db,{tournamentId:'t2'});const child=youth.data.players.find(p=>p.playerId==='youth');assert.equal(child.money,null);assert.equal(child.photoUrl,'');assert.equal(child.moneyState,'hidden')
  const legacy=fixture();delete legacy.player_valuations[1].minor
  const youthLegacy=await handle(database(legacy),{tournamentId:'t2'})
  assert.equal(youthLegacy.data.players.find(p=>p.playerId==='youth').moneyState,'hidden','旧快照漏minor也不能公开已知青少年金额')
  assert(!youthLegacy.data.top.some(p=>p.playerId==='youth'))
  const contradictory=fixture();contradictory.player_valuations[1].minor=false
  contradictory.transfer_requests.push({_id:'loan-youth',status:'completed',playerId:'youth',fromTeamId:'team',toTeamId:'team',tournamentId:'t2',type:'loan',amountFen:8800,completedAt:'2026-10-28T00:00:00Z'})
  const protectedChild=await handle(database(contradictory),{tournamentId:'t2'})
  assert.equal(protectedChild.data.focus.priceState,'hidden','真实生日青少年不能被旧快照adult标记放开成交金额')
  const exposed=JSON.stringify(first.data)
  for(const forbidden of ['private-player','test-player','bad-team-player','draft-player','optout','birthday','phone','identityNumber']) assert(!exposed.includes(forbidden),forbidden)
  console.log('PASS: 公开赛事池、跨赛事稳定ID去重、322人11页无重复漏人、未测算保留、私有/测试三层排除、青少年隐藏、游标跨范围/版本阻断、失败非空')
}
main().catch(e=>{console.error(e);process.exitCode=1})
