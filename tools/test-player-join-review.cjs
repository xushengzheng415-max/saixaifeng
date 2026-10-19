'use strict'
// 球员入队审核回归（2026-10-19）：新登记先进入「待球队确认」，
// 球队负责人确认后才写 teamId 与归属流转日志，驳回不改归属关系。
const assert=require('node:assert/strict')
const createPlayerJoinReview=require('../cloudfunctions/getMiniWorkspace/playerJoinReview.cjs')
function memory(seed){
  const rows=structuredClone(seed)
  const value=(row,key,id)=>key==='_id'?id:row[key]
  const match=(name,where)=>Object.entries(rows[name]||{}).filter(([id,row])=>Object.entries(where).every(([key,want])=>String(value(row,key,id)??'')===String(want)))
  const copy=row=>structuredClone(row)
  const db={serverDate:()=>new Date(),async runTransaction(fn){return fn(db)},collection(name){return {
    doc(id){return {async get(){const row=(rows[name]||{})[id];return {data:row?copy({...row,_id:id}):null}},async set({data}){rows[name]||={};rows[name][id]=copy(data)},async update({data}){if(!(rows[name]||{})[id])throw new Error('document does not exist');Object.assign(rows[name][id],copy(data))}}},
    where(where){return {
      limit(){return this},
      async get(){return {data:match(name,where).map(([id,row])=>copy({...row,_id:id}))}},
      async update({data}){const found=match(name,where);found.forEach(([,row])=>Object.assign(row,copy(data)));return {stats:{updated:found.length}}}
    }}
  }}}
  return {db,rows,match,copy}
}
const workspaceError=(code,message)=>Object.assign(new Error(message),{code})
async function main(){
  const m=memory({
    teams:{team:{name:'陆零後足球队',orgId:'org',playerRegistrationRevision:5}},
    players:{
      inTeam:{teamId:'team',name:'在队球员',jerseyNumber:'7'},
      pending:{name:'郑旭升',jerseyNumber:'21',idCard:'ID-CARD',orgId:'org',pendingJoinTeamId:'team',pendingJoinStatus:'pending',pendingJoinRequestId:'jr_1',joinRequestedAt:new Date(1000)},
      pending2:{name:'待驳回球员',jerseyNumber:'22',orgId:'org',pendingJoinTeamId:'team',pendingJoinStatus:'pending',pendingJoinRequestId:'jr_2',joinRequestedAt:new Date(500)},
      rejected:{name:'已驳回球员',jerseyNumber:'23',pendingJoinTeamId:'team',pendingJoinStatus:'rejected'}
    },
    player_team_history:{}
  })
  const review=createPlayerJoinReview({
    db:m.db, workspaceError, registrantTypeForPlayer:()=>'self', toTime:value=>value?new Date(value).getTime():0,
    async safeGet(name,where,limit){return m.match(name,where).slice(0,limit).map(([id,row])=>({...m.copy(row),_id:id}))},
    async safeGetTeamPlayers(teamId){return Object.entries(m.rows.players||{}).filter(([,row])=>String(row.teamId||row.teamCode||'')===teamId).map(([id,row])=>({...m.copy(row),_id:id}))},
    async loadTeams(){return [{_id:'team'}]},
    async findWorkspaceForAction(){return {workspace:{permissions:['team.manage'],orgId:'org'}}}
  })
  const identity={user:{_id:'owner'},openId:'mini-owner'}
  const pending=await review.pendingFor('team')
  assert.deepEqual(pending.map(item=>item.name),['郑旭升','待驳回球员'],'只有 pending 状态进入待确认列表')
  assert.equal(pending[0].registrantTypeText,'本人登记')
  assert.ok(!JSON.stringify(pending).includes('ID-CARD'),'待确认列表不得下发身份证号')
  // 号码已被在队球员占用时确认被拦截，且不写归属日志
  m.rows.players.inTeam.jerseyNumber='21'
  await assert.rejects(()=>review.review({action:'confirmTeamPlayerJoin',teamId:'team',playerId:'pending'},identity),e=>e.code==='PLAYER_JERSEY_CONFLICT')
  assert.equal(Object.keys(m.rows.player_team_history).length,0)
  m.rows.players.inTeam.jerseyNumber='7'
  await assert.rejects(()=>review.review({action:'confirmTeamPlayerJoin',teamId:'team',playerId:'rejected'},identity),e=>e.code==='PLAYER_JOIN_STATE_CHANGED')
  // 驳回只改状态、不建立球队归属，也不写归属日志。
  const rejected=await review.review({action:'rejectTeamPlayerJoin',teamId:'team',playerId:'pending2',reason:'人数已满'},identity)
  assert.equal(rejected.status,'rejected')
  assert.equal(m.rows.players.pending2.pendingJoinStatus,'rejected');assert.equal(m.rows.players.pending2.pendingJoinRejectReason,'人数已满')
  assert.equal(m.rows.players.pending2.teamId,undefined,'驳回不建立球队归属')
  assert.equal(Object.keys(m.rows.player_team_history).length,0)
  const approved=await review.review({action:'confirmTeamPlayerJoin',teamId:'team',playerId:'pending'},identity)
  assert.equal(approved.status,'approved');assert.equal(approved.playerName,'郑旭升')
  assert.equal(m.rows.players.pending.teamId,'team')
  assert.equal(m.rows.players.pending.pendingJoinStatus,'approved')
  assert.equal(m.rows.players.pending.currentHistoryId,'ph_pending_jr_1')
  assert.equal(m.rows.players.pending.archivedAt,'')
  assert.equal(m.rows.teams.team.playerRegistrationRevision,6)
  const logs=Object.values(m.rows.player_team_history)
  assert.equal(logs.length,1);assert.equal(logs[0].joinSource,'register');assert.equal(logs[0].teamId,'team');assert.equal(logs[0].leftAt,null)
  assert.equal((await review.pendingFor('team')).length,0,'确认与驳回后不再出现在待确认列表')
  await assert.rejects(()=>review.review({action:'confirmTeamPlayerJoin',teamId:'team',playerId:'pending'},identity),e=>e.code==='PLAYER_JOIN_STATE_CHANGED')
  await assert.rejects(()=>review.review({action:'rejectTeamPlayerJoin',teamId:'team',playerId:'pending2'},identity),e=>e.code==='PLAYER_JOIN_STATE_CHANGED')
  await assert.rejects(()=>review.review({action:'confirmTeamPlayerJoin',teamId:'other',playerId:'pending2'},identity),e=>e.code==='TEAM_SCOPE_DENIED')
  console.log('PASS player join review: pending list without identity data, jersey guard, transactional approval, no duplicate handling, rejection without membership')
}
main().catch(e=>{console.error(e);process.exitCode=1})
