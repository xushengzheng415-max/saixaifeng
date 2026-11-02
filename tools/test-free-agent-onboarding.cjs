'use strict'
const assert=require('node:assert/strict')
const {run}=require('../cloudfunctions/getMiniWorkspace/selfPlayerOnboard.cjs')
const documents={players:new Map(),marketing_selftest_events:new Map()}
const paginate=(rows,state)=>rows.slice(state.skip,state.skip+state.limit)
const db={serverDate:()=>new Date(),runTransaction:async work=>work(db),collection:name=>({
  where:query=>{
    const state={skip:0,limit:100}
    const api={
      skip:value=>{state.skip=value;return api},
      limit:value=>{state.limit=value;return api},
      get:async()=>({data:paginate([...documents[name].entries()].filter(([id,row])=>Object.entries(query).every(([key,value])=>(key==='_id'?id:row[key])===value)).map(([id,row])=>({_id:id,...row})),state)})
    }
    return api
  },
  doc:id=>({get:async()=>({data:documents[name].get(id)||null}),set:async({data})=>{documents[name].set(id,data)},update:async({data})=>{const current=documents[name].get(id);if(!current)throw new Error('DOCUMENT_NOT_EXIST');documents[name].set(id,{...current,...data})}})
})}
const identity={user:{_id:'user-1'},phone:'13800138000',openId:'wx-mini-openid'}
const form={action:'registerSelfPlayer',name:'测试球员',birthDate:'1998-05-10',position:'中场',height:178,weight:72,agreed:true,requestId:'request-20261024-001',marketingSessionId:'123e4567-e89b-42d3-a456-426614174000'}
const seed=(id,row)=>documents.players.set(id,row)
;(async()=>{
  const created=await run(db,identity,form)
  assert.equal(created.success,true)
  assert.equal(created.created,true)
  const row=documents.players.get(created.player.id)
  assert.equal(row.teamId,'')
  assert.equal(row.linkedUserId,'user-1')
  assert.equal(row.profileStatus,'pending')
  assert.equal(documents.marketing_selftest_events.size,1)

  const repeated=await run(db,identity,form)
  assert.equal(repeated.reused,true)
  assert.equal(documents.players.size,1)

  const other=await run(db,identity,{...form,requestId:'request-20261024-002'})
  assert.equal(other.reused,true)
  assert.equal(documents.players.size,1)

  const profile=await run(db,identity,{action:'selfPlayerProfile'})
  assert.equal(profile.self.id,created.player.id)

  // 不同 requestId 的并发提交必须落在同一份档案上。
  documents.players.clear()
  const concurrent=await Promise.all([{...form,requestId:'request-20261024-011'},{...form,requestId:'request-20261024-012'}].map(input=>run(db,identity,input)))
  assert.equal(concurrent.every(result=>result.success),true)
  assert.equal(new Set(concurrent.map(result=>result.player.id)).size,1)
  assert.equal(documents.players.size,1)

  // 历史同人档案（不同文档 ID）不能被自动合并，必须阻断待人工核对。
  documents.players.clear()
  seed('legacy-self-1',{name:'测试球员',birthDate:'1998-05-10',birthday:'1998-05-10',linkedUserId:'user-9',playerPhone:'13800138000'})
  const legacy=await run(db,identity,form)
  assert.equal(legacy.code,'SELF_PLAYER_REVIEW_REQUIRED')
  assert.equal(documents.players.size,1)

  // 同手机号候选查询不能被前几条已删除记录截断。
  documents.players.clear()
  for(let index=0;index<120;index++)seed('deleted-'+index,{name:'已删除'+index,birthDate:'2000-01-01',playerPhone:'13800138000',linkedUserId:'',isDeleted:true})
  seed('live-dup',{name:'测试球员',birthDate:'1998-05-10',birthday:'1998-05-10',playerPhone:'13800138000',linkedUserId:''})
  const deep=await run(db,identity,form)
  assert.equal(deep.code,'SELF_PLAYER_REVIEW_REQUIRED')

  // 监护人重复登记同一名孩子保持幂等；历史不同 ID 档案阻断。
  documents.players.clear()
  const guardian={user:{_id:'guardian-1'},phone:'13900139000',openId:'guardian-mini'}
  const child=await run(db,guardian,{...form,name:'小球员',birthDate:'2015-05-10',guardianRelation:'母亲',requestId:'request-20261024-003',marketingSessionId:''})
  assert.equal(child.success,true)
  assert.equal(documents.players.get(child.player.id).guardianUserId,'guardian-1')
  assert.equal(documents.players.get(child.player.id).linkedUserId,undefined)
  const childRepeated=await run(db,guardian,{...form,name:'小球员',birthDate:'2015-05-10',guardianRelation:'母亲',requestId:'request-20261024-004'})
  assert.equal(childRepeated.reused,true)
  assert.equal(documents.players.size,1)
  documents.players.clear()
  seed('legacy-child-1',{name:'小球员',birthDate:'2015-05-10',birthday:'2015-05-10',guardianUserId:'guardian-1'})
  const childConflict=await run(db,guardian,{...form,name:'小球员',birthDate:'2015-05-10',guardianRelation:'母亲',requestId:'request-20261024-005'})
  assert.equal(childConflict.code,'SELF_PLAYER_REVIEW_REQUIRED')
  // 历史无归属档案：核对验证手机号后由本人明确认领，只补归属，保留球队与历史字段。
  documents.players.clear()
  seed('legacy-claim-1',{name:'测试球员',birthDate:'1998-05-10',birthday:'1998-05-10',playerPhone:'13800138000',teamId:'team-7',orgId:'org-7',currentHistoryId:'ph-legacy',profileStatus:'complete',position:'前锋'})
  const listed=await run(db,identity,{action:'selfPlayerProfile'})
  assert.equal(listed.claimable.length,1)
  assert.equal(listed.claimable[0].id,'legacy-claim-1')
  assert.equal(listed.claimable[0].maskedName,'测**员')
  assert.equal(listed.claimable[0].guardianArchive,false)
  const claimed=await run(db,identity,{action:'claimSelfPlayer',playerId:'legacy-claim-1',requestId:'request-20261024-101'})
  assert.equal(claimed.success,true)
  assert.equal(claimed.role,'self')
  const claimedRow=documents.players.get('legacy-claim-1')
  assert.equal(claimedRow.linkedUserId,'user-1')
  assert.equal(claimedRow.teamId,'team-7')
  assert.equal(claimedRow.currentHistoryId,'ph-legacy')
  assert.equal(claimedRow.profileStatus,'complete')
  assert.equal(claimedRow.position,'前锋')
  assert.equal(documents.players.size,1)
  const claimedAgain=await run(db,identity,{action:'claimSelfPlayer',playerId:'legacy-claim-1',requestId:'request-20261024-102'})
  assert.equal(claimedAgain.reused,true)

  // 已绑定其他账号的档案不自动换绑，且不出现在认领候选里。
  documents.players.clear()
  seed('legacy-bound',{name:'测试球员',birthDate:'1998-05-10',playerPhone:'13800138000',linkedUserId:'user-9'})
  const boundClaim=await run(db,identity,{action:'claimSelfPlayer',playerId:'legacy-bound',requestId:'request-20261024-103'})
  assert.equal(boundClaim.code,'SELF_PLAYER_REVIEW_REQUIRED')
  assert.equal(documents.players.get('legacy-bound').linkedUserId,'user-9')
  const boundListed=await run(db,identity,{action:'selfPlayerProfile'})
  assert.equal(boundListed.claimable.length,0)

  // 验证手机号与档案登记手机号不一致时不允许认领。
  seed('legacy-phone',{name:'测试球员',birthDate:'1998-05-10',playerPhone:'13700137000'})
  const mismatch=await run(db,identity,{action:'claimSelfPlayer',playerId:'legacy-phone',requestId:'request-20261024-104'})
  assert.equal(mismatch.code,'SELF_PLAYER_CLAIM_PHONE_MISMATCH')
  assert.equal(documents.players.get('legacy-phone').linkedUserId,undefined)

  // 账号已有本人档案时不能再认领第二份成人档案。
  seed('legacy-claim-2',{name:'测试球员',birthDate:'1998-05-10',playerPhone:'13800138000'})
  seed('my-own',{name:'测试球员',birthDate:'1998-05-10',linkedUserId:'user-1'})
  const second=await run(db,identity,{action:'claimSelfPlayer',playerId:'legacy-claim-2',requestId:'request-20261024-105'})
  assert.equal(second.code,'SELF_PLAYER_CONFLICT')
  const afterOwn=await run(db,identity,{action:'selfPlayerProfile'})
  assert.deepEqual(afterOwn.claimable.map(item=>item.id),['legacy-claim-2'])

  // 监护人认领由球队建立、尚未绑定监护账号的孩子档案。
  documents.players.clear()
  seed('legacy-child-2',{name:'小球员',birthDate:'2015-05-10',guardianPhone:'13900139000',teamId:'team-3',profileStatus:'pending'})
  const guardianProfile=await run(db,guardian,{action:'selfPlayerProfile'})
  assert.equal(guardianProfile.claimable.length,1)
  assert.equal(guardianProfile.claimable[0].guardianArchive,true)
  const guardianClaim=await run(db,guardian,{action:'claimSelfPlayer',playerId:'legacy-child-2',requestId:'request-20261024-106'})
  assert.equal(guardianClaim.success,true)
  assert.equal(guardianClaim.role,'guardian')
  const guardianRow=documents.players.get('legacy-child-2')
  assert.equal(guardianRow.guardianUserId,'guardian-1')
  assert.equal(guardianRow.linkedUserId,undefined)
  assert.equal(guardianRow.teamId,'team-3')
  console.log('自由球员登记：本人、监护人、并发幂等、历史冲突、全量候选查询与历史档案认领通过')
})().catch(error=>{console.error(error);process.exitCode=1})
