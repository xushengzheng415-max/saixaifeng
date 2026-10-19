'use strict'
const assert=require('node:assert/strict')
const {run,saveDraft,fields,conflicts,claimProof}=require('../cloudfunctions/getMiniWorkspace/playerRegistration.cjs')
function id(serial=1,birth='19900101') {const prefix='110101'+birth+String(serial).padStart(3,'0'),w=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2];return prefix+'10X98765432'[prefix.split('').reduce((s,n,i)=>s+Number(n)*w[i],0)%11]}
function memory(seed) {
  const rows=structuredClone(seed), copy=structuredClone
  const db={command:{set:v=>({$set:v})},serverDate:()=>new Date(),collection:name=>({doc:key=>({
    async get(){return {data:rows[name]?.[key]?copy({...rows[name][key],_id:key}):null}},
    async set({data}){rows[name]||={};rows[name][key]=copy(data)},
    async update({data}){if(!rows[name]?.[key])throw new Error('missing doc');for(const[k,v]of Object.entries(data))rows[name][key][k]=copy(v?.$set!==undefined?v.$set:v)}
  }),async add({data}){const key='added'+Object.keys(rows[name]||{}).length;rows[name]||={};rows[name][key]=copy(data);return {_id:key}},where:conds=>({limit:n=>({async get(){return {data:Object.entries(rows[name]||{}).filter(([,v])=>Object.entries(conds).every(([f,val])=>String(v[f]??'')===String(val))).slice(0,n).map(([k,v])=>copy({...v,_id:k}))}}})})})}
  let pending=Promise.resolve()
  db.runTransaction=fn=>{const result=pending.then(()=>fn(db));pending=result.catch(()=>{});return result}
  return {db,rows}
}
function setup(players={}) {
  const m=memory({teams:{team:{name:'Isolated QA',orgId:'org'}},team_invitations:{invite:{type:'team_player',teamId:'team',token:'tp_fixture',status:'active',expiresAt:new Date(Date.now()+86400000),orgId:'org'}},service_entry_sessions:{s:{active:true,userId:'user',expiresAt:new Date(Date.now()+86400000),playerRegistrationPortraits:[{id:'portrait',fileId:'cloud://isolated/transparent.png',originalId:'cloud://isolated/raw.jpg',processingStatus:'ready'}]}},players})
  const deps={db:m.db,cloud:{},async readPlayers(teamId){return Object.entries(m.rows.players||{}).map(([key,value])=>({...value,_id:key})).filter(p=>p.teamId===teamId||p.teamCode===teamId)},async loadServiceEntryRegistration(){return {session:{...structuredClone(m.rows.service_entry_sessions.s),_id:'s'},gate:{inviteId:'invite',entryKey:'tp_fixture',teamId:'team'},user:{_id:'user'},phone:'13800000000',officialOpenId:'official-fixture'}},async findWorkspaceForAction(){return {workspace:{permissions:['team.manage'],orgId:'org'}}},async loadTeams(){return [{_id:'team'}]}}
  return {...m,deps}
}
const valid={name:'测试球员',idCard:id(),birthDate:'1990-01-01',jerseyNumber:'21',position:'DF',height:'178',weight:'66.5',authorizationAgreed:true,portraitId:'portrait'}
async function reject(fn,code){await assert.rejects(fn,e=>e.code===code,code)}
async function choose(s,mode='new',playerId=''){if(mode==='new')await run(s.deps,{operation:'search',query:'测试球员'});return run(s.deps,{operation:'select',mode,playerId,idCard:id()})}
async function main(){
  for(const [key,code]of [['name','NAME_REQUIRED'],['idCard','IDCARD_INVALID'],['jerseyNumber','JERSEY_INVALID'],['position','POSITION_REQUIRED'],['height','HEIGHT_REQUIRED'],['weight','WEIGHT_REQUIRED'],['authorizationAgreed','AUTHORIZATION_REQUIRED']])assert.throws(()=>fields({...valid,[key]:''}),e=>e.code===code)
  assert.throws(()=>fields({...valid,idCard:id().slice(0,17)+'9'}),e=>e.code==='IDCARD_INVALID')
  conflicts([{_id:'old',status:'archived',jerseyNumber:'21'}],fields(valid),'')
  assert.throws(()=>conflicts([{_id:'old',jerseyNumber:'021'}],fields(valid),''),e=>e.code==='PLAYER_JERSEY_CONFLICT')
  assert.throws(()=>claimProof({idCard:id(),linkedUserId:'other'},{user:{_id:'user'},phone:'13800000000'},id(),{}),e=>e.code==='PLAYER_ALREADY_CLAIMED')
  assert.throws(()=>claimProof({idCard:id(),contactPhone:'13900000000'},{user:{_id:'user'},phone:'13800000000'},id(),{}),e=>e.code==='PLAYER_PHONE_MISMATCH')
  let s=setup({a:{teamId:'team',name:'同名球员',idCard:id(),jerseyNumber:'21'},b:{teamId:'team',name:'同名球员',idCard:id(3),jerseyNumber:'22'},foreign:{teamId:'other',teamCode:'team',name:'同名球员'},archived:{teamId:'team',name:'同名球员',status:'archived'}})
  const found=await run(s.deps,{operation:'search',query:'同名球员'})
  assert.equal(found.players.length,2);assert.ok(found.players.every(p=>!p.idCard&&!p.phone))
  assert.equal(Object.keys(s.rows.players).length,4,'search must not claim or create')
  await reject(()=>choose(s,'claim','foreign'),'PLAYER_CHOICE_STALE')
  await reject(()=>run(s.deps,{operation:'select',mode:'claim',playerId:'b',idCard:id()}),'PLAYER_IDENTITY_MISMATCH')
  const choice=await choose(s,'claim','a')
  const result=await run(s.deps,{...valid,name:'同名球员',operation:'submit',choiceToken:choice.choiceToken})
  assert.equal(result.playerId,'a');assert.equal(s.rows.players.a.height,178);assert.equal(s.rows.players.a.linkedUserId,'user');assert.ok(!s.rows.players.a.linkedOpenId)
  assert.equal(s.rows.players.b.linkedUserId,undefined,'other namesake stays untouched')
  const retry=await run(s.deps,{...valid,operation:'submit',choiceToken:choice.choiceToken});assert.equal(retry.idempotent,true)
  assert.equal(Object.keys(s.rows.parent_profile_submissions).length,1)
  s=setup({taken:{teamId:'team',name:'其他球员',jerseyNumber:'021',status:'active'}})
  let numberChoice=await choose(s)
  const takenNumber=await run(s.deps,{operation:'check_number',choiceToken:numberChoice.choiceToken,jerseyNumber:'21'})
  assert.equal(takenNumber.available,false);assert.match(takenNumber.message,/21号.*更换号码/)
  assert.equal((await run(s.deps,{operation:'check_number',choiceToken:numberChoice.choiceToken,jerseyNumber:'22'})).available,true)
  s=setup();const previewChoice=await choose(s)
  const initialDraft=await run(s.deps,{...valid,authorizationAgreed:false,operation:'preview',choiceToken:previewChoice.choiceToken})
  assert.equal(initialDraft.success,true);assert.equal(Object.keys(s.rows.players).length,0,'initial card preview must not register or claim')
  assert.equal(initialDraft.registrationDraft.player.idCard,undefined);assert.equal(initialDraft.registrationDraft.player.authorizationAgreed,undefined)
  await reject(()=>run(s.deps,{...valid,operation:'submit',choiceToken:previewChoice.choiceToken,cardPreviewRequired:true}),'PLAYER_CARD_CONFIRM_REQUIRED')
  s.rows.service_entry_sessions.s.playerRegistrationCardDraft={token:'confirmed-preview',renderRequest:'render',fingerprint:initialDraft.registrationDraft.fingerprint,crop:{zoom:1.3,x:.12,y:-.06},confirmed:true,tier:'bronze',templateId:'template',templateVersion:3,expiresAt:new Date(Date.now()+60000)}
  s.rows.service_entry_sessions.s.playerRegistrationCardRenderRequest='render'
  s.rows.player_card_template_states={bronze:{active:{templateId:'template',version:3}}}
  await reject(()=>run(s.deps,{...valid,height:'179',operation:'submit',choiceToken:previewChoice.choiceToken,cardPreviewRequired:true,cardPreviewToken:'confirmed-preview'}),'PLAYER_CARD_CONFIRM_REQUIRED')
  const registeredWithCrop=await run(s.deps,{...valid,operation:'submit',choiceToken:previewChoice.choiceToken,cardPreviewRequired:true,cardPreviewToken:'confirmed-preview'})
  assert.deepEqual(s.rows.players[registeredWithCrop.playerId].playerCardCrop,{zoom:1.3,x:.12,y:-.06})
  s=setup({legacy:{teamCode:'team',orgId:'original-org',name:valid.name,idCard:id(),historicalGoals:7,photoFileID:'cloud://isolated/legacy.png'}})
  await run(s.deps,{operation:'search',query:valid.name});const legacyChoice=await choose(s,'claim','legacy')
  assert.equal(legacyChoice.player.hasPhoto,true,'legacy photoFileID can be kept')
  await run(s.deps,{...valid,operation:'submit',choiceToken:legacyChoice.choiceToken})
  assert.equal(s.rows.players.legacy.teamId,'team');assert.equal(s.rows.players.legacy.historicalGoals,7)
  assert.equal(s.rows.players.legacy.orgId,'original-org','claim must preserve existing tenant ownership')
  s=setup({sameId:{teamId:'team',idCard:id(),name:'已有球员',jerseyNumber:'20'}})
  const newChoice=await choose(s)
  await reject(()=>run(s.deps,{...valid,operation:'submit',choiceToken:newChoice.choiceToken}),'PLAYER_IDCARD_CONFLICT')
  assert.equal(Object.keys(s.rows.players).length,1)
  s=setup({sameNumber:{teamId:'team',idCard:id(2),jerseyNumber:'021'}})
  let c=await choose(s)
  await reject(()=>run(s.deps,{...valid,operation:'submit',choiceToken:c.choiceToken}),'PLAYER_JERSEY_CONFLICT')
  s=setup();c=await choose(s)
  await reject(()=>run(s.deps,{...valid,portraitId:'forged',operation:'submit',choiceToken:c.choiceToken}),'PLAYER_PHOTO_REQUIRED')
  s=setup();c=await choose(s);const registered=await run(s.deps,{...valid,operation:'submit',choiceToken:c.choiceToken})
  const fresh=Object.values(s.rows.players).find(p=>p.name===valid.name)
  assert.equal(fresh.manualPlaceholder,false)
  assert.equal(fresh.profileStatus,'complete')
  assert.ok(fresh.recentPortraitId)
  assert.equal(registered.pendingTeamConfirm,true,'新登记必须回执为待球队确认')
  // 2026-10-19 用户确认口径：新登记只进入球队长期球员库「待确认」，等球队负责人确认后才正式入队。
  assert.equal(fresh.teamId,'');assert.equal(fresh.teamCode,'')
  assert.equal(fresh.pendingJoinTeamId,'team');assert.equal(fresh.pendingJoinStatus,'pending')
  assert.ok(fresh.pendingJoinRequestId);assert.equal(fresh.currentHistoryId,'')
  assert.equal(Object.keys(s.rows.player_team_history||{}).length,0,'新登记不写归属流转日志')
  // 待确认档案已占住身份证与球衣号：不进在队列表、不能作为可恢复档案，也不能重复登记。
  let hit2=await run(s.deps,{operation:'search',query:valid.idCard})
  assert.equal(hit2.players.length,0);assert.equal(hit2.restorable,null)
  const again=await run(s.deps,{operation:'select',mode:'new'})
  assert.equal((await run(s.deps,{operation:'check_number',choiceToken:again.choiceToken,jerseyNumber:'21'})).available,false)
  await reject(()=>run(s.deps,{...valid,operation:'submit',choiceToken:again.choiceToken}),'PLAYER_IDCARD_PENDING')
  assert.equal(Object.keys(s.rows.players).length,1)
  // 认领已有档案在同一支球队仍然即时生效，不进入待确认。
  s=setup({inTeam:{teamId:'team',name:'在队球员',idCard:id(),jerseyNumber:'21'}})
  await run(s.deps,{operation:'search',query:'在队球员'})
  const claimChoice=await choose(s,'claim','inTeam')
  const claimed=await run(s.deps,{...valid,name:'在队球员',operation:'submit',choiceToken:claimChoice.choiceToken})
  assert.equal(claimed.pendingTeamConfirm,false);assert.equal(s.rows.players.inTeam.teamId,'team')
  s=setup();c=await choose(s)
  const minor={...valid,idCard:id(1,'20150101'),birthDate:'2015-01-01',operation:'submit',choiceToken:c.choiceToken}
  await reject(()=>run(s.deps,minor),'GUARDIAN_REQUIRED')
  await run(s.deps,{...minor,guardianRelation:'mother'})
  assert.equal(Object.values(s.rows.players)[0].guardianUserId,'user');assert.equal(Object.values(s.rows.players)[0].linkedUserId,undefined)
  s=setup();const identity={user:{_id:'manager'},openId:'mini-manager'}
  const draft=await saveDraft(s.deps,{teamId:'team',contactPhone:'13800000000',requestId:'phone-only'},identity)
  assert.equal(s.rows.players[draft.playerId].manualPlaceholder,true);assert.equal(s.rows.players[draft.playerId].name,'')
  const repeated=await saveDraft(s.deps,{teamId:'team',contactPhone:'13800000000',requestId:'phone-only'},identity)
  assert.equal(repeated.playerId,draft.playerId);assert.equal(Object.keys(s.rows.players).length,1)
  await reject(()=>saveDraft(s.deps,{teamId:'team'},identity),'PLAYER_DRAFT_REQUIRED')
  s.deps.findWorkspaceForAction=async()=>({workspace:{permissions:[]}})
  await reject(()=>saveDraft(s.deps,{teamId:'team',name:'测试'},identity),'PLAYER_FORBIDDEN')
  // Two verified users choose the same free number concurrently. The second
  // transaction loses the team CAS, rereads the full pool, and receives conflict.
  s=setup();const choice1=await choose(s)
  s.rows.service_entry_sessions.s2={...structuredClone(s.rows.service_entry_sessions.s),userId:'user2',playerRegistrationChoice:{mode:'new',playerId:'',revision:'',nonce:'second'}}
  const deps2={...s.deps,async loadServiceEntryRegistration(){return {session:{...structuredClone(s.rows.service_entry_sessions.s2),_id:'s2'},gate:{inviteId:'invite',entryKey:'tp_fixture',teamId:'team'},user:{_id:'user2'},phone:'13900000000',officialOpenId:'official2'}}}
  const concurrent=await Promise.allSettled([run(s.deps,{...valid,operation:'submit',choiceToken:choice1.choiceToken}),run(deps2,{...valid,idCard:id(3),operation:'submit',choiceToken:'second'})])
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1)
  assert.equal(concurrent.find(r=>r.status==='rejected').reason.code,'PLAYER_JERSEY_CONFLICT')
  // 递卡确认（2026-10-18 档案个人持有）：存量被移出档案恢复入队，playerId 不变并写流转日志。
  s=setup({archived1:{name:'恢复球员',idCard:id(2),birthDate:'1990-01-01',position:'DF',jerseyNumber:'7',status:'archived',teamId:'team',linkedUserId:'user',photoUrl:'cloud://old/photo.png'}})
  let hit=await run(s.deps,{operation:'search',query:id(2)})
  assert.equal(hit.players.length,0);assert.equal(hit.restorable?.id,'archived1');assert.equal(hit.restorable.transfer,false)
  let picked=await run(s.deps,{operation:'select',mode:'restore',playerId:'archived1'})
  assert.equal(picked.mode,'restore');assert.equal(picked.player.name,'恢复球员')
  let done=await run(s.deps,{operation:'confirm_restore',choiceToken:picked.choiceToken,jerseyNumber:'7',portraitId:'',authorizationAgreed:true})
  assert.equal(done.restored,true);assert.equal(done.transfer,false);assert.equal(done.playerId,'archived1')
  assert.equal(s.rows.players.archived1.teamId,'team');assert.equal(s.rows.players.archived1.status,'');assert.ok(s.rows.players.archived1.currentHistoryId)
  let logs=Object.values(s.rows.player_team_history||{});assert.equal(logs.length,1);assert.equal(logs[0].joinSource,'restore');assert.equal(logs[0].leftAt,null)
  // 幂等重放：同 choiceToken 重复确认直接返回，不重复写日志。
  await run(s.deps,{operation:'confirm_restore',choiceToken:picked.choiceToken,jerseyNumber:'7',portraitId:'',authorizationAgreed:true})
  assert.equal(Object.keys(s.rows.player_team_history||{}).length,1)
  // 他队在队档案=转队：原队补 leftAt、新队写 transfer_in，原队名单标记刷新。
  s=setup({inb:{name:'转队球员',idCard:id(4),birthDate:'1990-01-01',position:'FW',jerseyNumber:'9',status:'active',teamId:'teamB',linkedUserId:'user'}})
  s.rows.teams.teamB={name:'原球队',orgId:'orgB'}
  hit=await run(s.deps,{operation:'search',query:id(4)})
  assert.equal(hit.restorable?.transfer,true);assert.equal(hit.restorable.fromTeamName,'原球队')
  picked=await run(s.deps,{operation:'select',mode:'restore',playerId:'inb'})
  assert.equal(picked.player.transfer,true)
  done=await run(s.deps,{operation:'confirm_restore',choiceToken:picked.choiceToken,jerseyNumber:'9',portraitId:'',authorizationAgreed:true})
  assert.equal(done.transfer,true)
  assert.equal(s.rows.players.inb.teamId,'team');assert.equal(s.rows.teams.teamB.rosterCountStatus,'needs_refresh')
  logs=Object.values(s.rows.player_team_history||{})
  assert.equal(logs.filter(l=>l.leftSource==='transfer_out'&&l.teamId==='teamB').length,1)
  assert.equal(logs.filter(l=>l.joinSource==='transfer_in'&&l.teamId==='team').length,1)
  // 球衣号被本队占用时必须改号；迁移合并残留与多档案命中禁止恢复。
  s=setup({occupier:{name:'在队球员',idCard:id(5),jerseyNumber:'7',status:'active',teamId:'team'},archived2:{name:'占位老档',idCard:id(6),position:'MF',jerseyNumber:'7',status:'archived',teamId:'team',linkedUserId:'user'}})
  hit=await run(s.deps,{operation:'search',query:id(6)})
  picked=await run(s.deps,{operation:'select',mode:'restore',playerId:'archived2'})
  await reject(()=>run(s.deps,{operation:'confirm_restore',choiceToken:picked.choiceToken,jerseyNumber:'7',portraitId:'',authorizationAgreed:true}),'PLAYER_JERSEY_CONFLICT')
  done=await run(s.deps,{operation:'confirm_restore',choiceToken:picked.choiceToken,jerseyNumber:'8',portraitId:'',authorizationAgreed:true})
  assert.equal(done.restored,true);assert.equal(s.rows.players.archived2.jerseyNumber,'8')
  s=setup({residue:{name:'迁移残留',idCard:id(7),status:'archived',teamId:'team',linkedUserId:'user',archivedReason:'account_transfer_duplicate'}})
  hit=await run(s.deps,{operation:'search',query:id(7)})
  assert.equal(hit.restorable,null)
  s=setup({dup1:{name:'档一',idCard:id(8),status:'archived',linkedUserId:'user'},dup2:{name:'档二',idCard:id(8),status:'archived',linkedUserId:'user'}})
  await reject(()=>run(s.deps,{operation:'search',query:id(8)}),'PLAYER_IDENTITY_REVIEW')
  console.log('PASS player registration: required fields, explicit claim, masks, scope, identity, active number pool, cutout provenance, idempotence, drafts, concurrency, restore and transfer')
}
main().catch(e=>{console.error(e);process.exitCode=1})
