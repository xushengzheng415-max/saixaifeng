'use strict'
const crypto = require('node:crypto')
const suite = require('./playerCardSuite.cjs')
const preload = require('./playerCardPreload.cjs')
const SETS = 'player_card_sets'
const TIERS = ['bronze', 'silver', 'gold']
const id = () => crypto.randomBytes(16).toString('hex')
const titleOf = value => { const text=String(value||'').trim(); if(text.length<2||text.length>24)throw new Error('名称须为2–24个字');return text }
const keysOf = set => set.kind==='progression'?TIERS:['single']
const grantId = (playerId, templateId) => crypto.createHash('sha256').update(JSON.stringify([String(playerId),String(templateId)])).digest('hex')
const issueFailure=(code,message)=>Object.assign(new Error(message),{recipientFailure:true,code})
function issueSummary(job){const failures=job.failures||[];return {success:true,jobId:job._id,setId:job.setId,title:job.title,revision:job.setRevision,setDisplay:job.setDisplay,total:job.playerIds.length,completed:job.cursor,succeeded:job.cursor-failures.length,status:job.status,failures}}
function createPlayerCardWorkflows({cloud,read,save,preview,urlsFor,itemOf,normalizeLayout,normalizePhoto,normalizeBadges,scoreService}) {
  const db=cloud.database()
  const scores=()=>scoreService||require('./data-center/service.cjs').createDataService(db)
  async function ensure() {try{await db.createCollection(SETS)}catch(error){if(!/exist|duplicate/i.test(String(error.message)))throw error}}
  async function getSet(setId) {const row=await suite.document(db,SETS,String(setId||''));if(!row||row.recordType!=='set')throw new Error('卡片项目不存在');return row}
  async function members(set) {return Promise.all(keysOf(set).map(async key=>{const row=await read(set.members[key]);if(!row||row.setId!==set._id)throw new Error('套系成员关联异常');return {key,row}}))}
  async function view(set) {
    const rows=await members(set),urls=await urlsFor(rows.map(x=>x.row),false)
    return {...set, members:Object.fromEntries(rows.map(({key,row})=>[key,itemOf(row,urls,false)])),hasDraft:rows.some(x=>Number(x.row.draftVersion)>Number(x.row.publishedVersion||0))}
  }
  async function list() {
    let sets=[]
    try{sets=await preload.readAll(db,SETS,{recordType:'set'})}catch(error){if(!/collection.*(not exist|not found)|DATABASE_COLLECTION_NOT_EXIST/i.test(String(error.message)))throw error}
    const templates=await preload.readAll(db,suite.TEMPLATES,{})
    const urls=await urlsFor(templates,false),byId=new Map(templates.map(row=>[row._id,row]))
    return {success:true,sets:sets.map(set=>({...set,hasDraft:keysOf(set).some(key=>Number(byId.get(set.members[key])?.draftVersion)>Number(byId.get(set.members[key])?.publishedVersion||0)),styles:keysOf(set).map(key=>{const row=byId.get(set.members[key]);return {key,templateId:row?._id,backgroundUrl:urls[row?.published?.backgroundFileId||row?.draft?.backgroundFileId]||''}})})),legacy:templates.filter(row=>!row.setId).map(row=>itemOf(row,urls,false))}
  }
  async function create(event,auth) {
    if(!['progression','honor'].includes(event.kind))throw new Error('请选择升级套系或荣誉单卡')
    const scope=await preload.validatePreload(db,event.preload,suite.document)
    if(event.kind==='progression'&&!['platform','tournament'].includes(scope.type))throw new Error('升级套系用于全平台或赛事')
    const {synthetic}=await import('./data-center/statistics.mjs')
    if(scope.type!=='platform'&&synthetic(await suite.document(db,preload.COLLECTIONS[scope.type],scope.targetId)))throw new Error('测试对象不能用于正式制卡')
    const title=titleOf(event.title),setId=id(),keys=event.kind==='progression'?TIERS:['single']
    const imports=Array.isArray(event.importTemplateIds)?event.importTemplateIds:[]
    if(imports.length>3)throw new Error('最多导入三张旧模板')
    const original=await Promise.all(imports.map(value=>read(String(value))))
    if(original.some(row=>!row))throw new Error('旧模板不存在，请刷新')
    await ensure()
    const set={_id:setId,recordType:'set',kind:event.kind,title,preload:scope,members:{},revision:1,status:'draft',createAt:db.serverDate(),createdBy:auth.userId}
    const rows=keys.map(key=>{
      const templateId=id(),tier=key==='single'?'bronze':key,source=original.find(row=>event.kind==='honor'||row.tier===tier)?.draft,fallback=source||original[0]?.draft
      set.members[key]=templateId
      return {_id:templateId,setId,cardKind:event.kind,issuanceMode:event.kind==='progression'&&scope.type==='platform'?'base':'explicit',tier,
        draft:{title: event.kind==='honor'?title:title+'·'+({bronze:'铜卡',silver:'银卡',gold:'金卡'}[tier]),preload:scope,
          backgroundFileId:source?.backgroundFileId||'',maskFileId:fallback?.maskFileId||'',layout:normalizeLayout(fallback?.layout),photo:normalizePhoto(fallback?.photo),badges:normalizeBadges(fallback?.badges),positionOverride:scope.type==='player'?source?.positionOverride||'':''},
        draftVersion:source?.backgroundFileId&&source?.maskFileId?1:0,publishedVersion:0,revision:1,status:'draft',createdBy:auth.userId,createAt:db.serverDate()}
    })
    await db.runTransaction(async tx=>{const {_id,...data}=set;await tx.collection(SETS).doc(setId).set({data});for(const row of rows){const {_id,...data}=row;await tx.collection(suite.TEMPLATES).doc(_id).set({data})}})
    return {success:true,set:await view(set)}
  }
  async function saveMaterials(event,auth) {
    const set=await getSet(event.setId),rows=await members(set)
    if(!Array.isArray(event.variants)||!event.variants.length)throw new Error('请选择素材')
    for(const input of event.variants){const member=rows.find(x=>x.key===input.key);if(!member)throw new Error('卡片档位无效');const row=member.row
      const result=await save({templateId:row._id,tier:row.tier,revision:input.revision,title:row.draft.title,preload:set.preload,
        backgroundData:input.backgroundData||'',maskData:input.maskData||'',backgroundFileId:input.backgroundFileId||'',maskFileId:input.maskFileId||'',layout:row.draft.layout,photo:row.draft.photo,badges:row.draft.badges},auth)
      if(!result.success)throw new Error(result.error||'素材保存失败，请刷新后重试')
    }
    return {success:true,set:await view(await getSet(set._id))}
  }
  async function copyLayout(event,auth) {
    const set=await getSet(event.setId),rows=await members(set),source=rows.find(x=>x.key===event.sourceKey)
    if(set.kind!=='progression'||!source)throw new Error('请选择套系内的排版来源')
    await db.runTransaction(async tx=>{
      const actual=await suite.document(tx,suite.TEMPLATES,source.row._id)
      if(Number(actual?.revision)!==Number(event.revision))throw new Error('排版已变化，请保存并刷新')
      for(const member of rows.filter(x=>x.key!==event.sourceKey)){
        const row=await suite.document(tx,suite.TEMPLATES,member.row._id)
        if(Number(row?.revision)!==Number(member.row.revision))throw new Error('其他档位已更新，请刷新')
        const draft={...row.draft,layout:actual.draft.layout,photo:actual.draft.photo,badges:actual.draft.badges}
        if(event.shareMask===true)draft.maskFileId=actual.draft.maskFileId
        if(JSON.stringify(draft)===JSON.stringify(row.draft))continue
        await tx.collection(suite.TEMPLATES).doc(row._id).update({data:{draft:db.command.set(draft),revision:Number(row.revision)+1,draftVersion:Number(row.draftVersion||0)+1,updatedBy:auth.userId,updateAt:db.serverDate()}})
      }
    })
    return {success:true,set:await view(await getSet(set._id))}
  }
  async function review(event,auth) {
    const set=await getSet(event.setId),rows=await members(set),cards=[]
    for(const {key,row} of rows){if(!row.draft?.backgroundFileId||!row.draft?.maskFileId)throw new Error((key==='single'?'卡片':{bronze:'铜卡',silver:'银卡',gold:'金卡'}[key])+'缺少背景或遮罩');const response=await preview({templateId:row._id,...(set.preload.type==='player'?{playerId:set.preload.targetId,preload:set.preload}:{})});if(!response.success)throw new Error(response.error||'预览失败');cards.push({key,imageUrl:response.imageUrl})}
    const proof={token:id(),actor:auth.userId,revisions:Object.fromEntries(rows.map(x=>[x.row._id,Number(x.row.revision)])),expiresAt:Date.now()+30*60*1000}
    await db.collection(SETS).doc(set._id).update({data:{previewProof:db.command.set(proof)}})
    return {success:true,cards,proof:proof.token}
  }
  async function publish(event,auth) {
    const set=await getSet(event.setId),rows=await members(set),proof=set.previewProof
    if(!proof||proof.token!==event.proof||proof.actor!==auth.userId||proof.expiresAt<Date.now())throw new Error('请先完成整套预览')
    if(!rows.some(x=>Number(x.row.draftVersion)>Number(x.row.publishedVersion||0)))throw new Error('没有需要发布的新草稿')
    const {synthetic}=await import('./data-center/statistics.mjs')
    if(set.preload.type!=='platform'&&synthetic(await suite.document(db,preload.COLLECTIONS[set.preload.type],set.preload.targetId)))throw new Error('测试对象不能发布正式卡')
    await db.runTransaction(async tx=>{
      const currentSet=await suite.document(tx,SETS,set._id)
      if(currentSet?.previewProof?.token!==proof.token)throw new Error('预览已变化，请重新检查')
      const prepared=[]
      for(const {key,row} of rows){
        const current=await suite.document(tx,suite.TEMPLATES,row._id)
        if(!current||Number(current.revision)!==proof.revisions[row._id])throw new Error('草稿已变化，请重新预览整套')
        if(!current.draft.backgroundFileId||!current.draft.maskFileId)throw new Error('素材不完整')
        const stateKey=set.kind==='progression'&&set.preload.type==='platform'?row.tier:preload.stateId(row.tier,set.preload,row._id)
        const state=await suite.document(tx,suite.STATES,stateKey)
        if(state?.candidate)throw new Error('该范围有历史制卡任务，请先处理')
        prepared.push({key,row:current,stateKey,state,version:Number(current.draftVersion)})
      }
      for(const p of prepared){
        const versionId=suite.versionId(p.row._id,p.version)
        const old=await suite.document(tx,suite.VERSIONS,versionId)
        if(!old)await tx.collection(suite.VERSIONS).doc(versionId).set({data:{...p.row.draft,templateId:p.row._id,version:p.version,cardTypeId:p.row.tier,cardKind:set.kind,setId:set._id,displayMode:'dynamic',createdAt:db.serverDate(),createdBy:auth.userId}})
        const active={templateId:p.row._id,version:p.version,displayMode:'dynamic',setId:set._id}
        await tx.collection(suite.STATES).doc(p.stateKey).set({data:{...(p.state||{}),tier:p.row.tier,preload:set.preload,revision:Number(p.state?.revision||0)+1,active,candidate:null,activatedAt:db.serverDate(),activatedBy:auth.userId}})
        // Keep the selected-card lookup key available for upgraded legacy clients too.
        if(set.kind==='progression'&&set.preload.type==='platform')await tx.collection(suite.STATES).doc(preload.stateId(p.row.tier,set.preload,p.row._id)).set({data:{tier:p.row.tier,preload:set.preload,active,candidate:null,revision:Number(p.state?.revision||0)+1}})
        await tx.collection(suite.TEMPLATES).doc(p.row._id).update({data:{published:db.command.set({...p.row.draft,cardKind:set.kind,setId:set._id,displayMode:'dynamic'}),publishedVersion:p.version,status:'published',revision:Number(p.row.revision)+1,publishedAt:db.serverDate(),publishedBy:auth.userId}})
      }
      await tx.collection(SETS).doc(set._id).update({data:{status:'published',revision:Number(set.revision)+1,published:db.command.set({title:set.title,preload:set.preload,members:Object.fromEntries(prepared.map(p=>[p.key,{templateId:p.row._id,version:p.version}]))}),publishedAt:db.serverDate(),publishedBy:auth.userId,previewProof:null}})
    })
    return {success:true,set:await view(await getSet(set._id))}
  }
  // 名单为空时说明原因：赛事名单需主办方审核通过（approved/locked）才会进入发放范围。
  async function scopeHintFor(set) {
    if (set.preload.type === 'tournament') {
      const snapshots = await preload.readAll(db, 'roster_snapshots', { tournamentId: set.preload.targetId }), latest = new Map()
      for (const row of snapshots) {
        if (!row.teamId) continue
        const key = JSON.stringify([row.teamId, row.divisionId || row.division || 'default']), old = latest.get(key)
        if (!old || Number(row.version || 0) > Number(old.version || 0)) latest.set(key, row)
      }
      let pendingTeams = 0, pendingPlayers = 0, returnedTeams = 0, approvedTeams = 0, approvedPlayers = 0
      for (const row of latest.values()) {
        const status = String(row.status || ''), count = Array.isArray(row.playerIds) ? row.playerIds.length : 0
        if (status === 'submitted' || status === 'pending') { pendingTeams += 1; pendingPlayers += count }
        else if (status === 'returned') returnedTeams += 1
        else if (status === 'approved' || status === 'locked') { approvedTeams += 1; approvedPlayers += count }
      }
      if (pendingTeams) return `该赛事有 ${pendingTeams} 支球队的名单已提交待审核（${pendingPlayers} 名球员），审核通过后才能发放`
      if (returnedTeams) return `该赛事有 ${returnedTeams} 支球队的名单被退回，需球队重新提交并审核通过后才能发放`
      if (approvedTeams && !approvedPlayers) return '该赛事的正式名单为空，请先在报名管理补充球员并审核'
      if (approvedTeams) return '该赛事正式名单中的球员尚未通过审核，请先在报名管理审核球员'
      return '该赛事还没有正式名单，请先在报名管理审核球员或导入名单'
    }
    if (set.preload.type === 'team') return '该球队还没有球员档案，请先在球队管理中添加球员'
    if (set.preload.type === 'player') return '该球员档案不存在或已删除'
    return ''
  }
  async function candidates(event) {
    const set=await getSet(event.setId)
    await preload.validatePreload(db,set.preload,suite.document)
    const found=await preload.playersForScope(db,set.preload)
    if(found.players.length>1000)throw new Error('名单超过1000人，请按球队分批发放')
    const {synthetic}=await import('./data-center/statistics.mjs'),teams=new Map(),rows=[]
    if(set.preload.type!=='platform'&&synthetic(await suite.document(db,preload.COLLECTIONS[set.preload.type],set.preload.targetId)))throw new Error('测试范围不能发放正式卡')
    const gradeById=set.kind==='progression'?await scores().playerCardsForAuthorizedPlayers(found.players.map(x=>String(x._id))):new Map()
    for(const player of found.players){
      if(player.teamId&&!teams.has(player.teamId))teams.set(player.teamId,await suite.document(db,'teams',player.teamId))
      const team=teams.get(player.teamId),source=await require('./playerCardSource.cjs').resolveSource(db,player)
      const grade=gradeById.get(String(player._id))
      const reason=synthetic(player)||synthetic(team)||grade?.status==='test_data_excluded'?'测试资料不发放':!source?.fileId?'缺少可用照片':set.kind==='progression'&&(grade?.status!=='ready'||!TIERS.includes(grade?.tier))?'竞技等级待核定':''
      rows.push({id:player._id,name:String(player.name||'未填写姓名'),teamName:String(team?.name||team?.teamName||''),reason,eligible:!reason,missing:grade?.missing||[],rosterEvidence:found.evidenceByPlayer?.get(String(player._id))||[]})
    }
    return {success:true,players:rows,missingCount:found.missingPlayers?.length||0,scopeHint:rows.length?'':await scopeHintFor(set)}
  }
  async function beginIssue(event,auth) {
    const set=await getSet(event.setId)
    if(set.status!=='published'||!set.published)throw new Error('请先发布样式')
    if(Number(event.previewRevision)!==Number(set.revision))throw new Error('请先预览所选球员；样式更新后需要重新预览')
    if(set.kind==='progression'&&set.preload.type==='platform')throw new Error('全平台升级套系已按等级生效，无需逐人发放')
    const ids=Array.isArray(event.playerIds)?[...new Set(event.playerIds.map(String))]:[]
    if(!ids.length||ids.length>1000)throw new Error('请选择1至1000名球员')
    const available=await candidates({setId:set._id}),allowed=new Set(available.players.filter(x=>x.eligible).map(x=>x.id))
    if(ids.some(x=>!allowed.has(x)))throw new Error('名单含无权限、测试或缺少照片的球员，请刷新')
    if(!/^[a-zA-Z0-9_-]{16,80}$/.test(String(event.requestId||'')))throw new Error('缺少发放请求编号，请重新打开')
    const evidence=Object.fromEntries(available.players.filter(x=>ids.includes(x.id)).map(x=>[x.id,x.rosterEvidence]))
    return createIssue(set,ids,evidence,event,auth)
  }
  async function createIssue(set,ids,evidence,event,auth) {
    if(!/^[a-zA-Z0-9_-]{16,80}$/.test(String(event.requestId||'')))throw new Error('缺少发放请求编号，请重新打开')
    const jobId='issue_'+crypto.createHash('sha256').update(auth.userId+':'+set._id+':'+event.requestId).digest('hex').slice(0,32)
    const current=await db.runTransaction(async tx=>{const old=await suite.document(tx,SETS,jobId);if(old){if(old.setId!==set._id||JSON.stringify(old.playerIds)!==JSON.stringify(ids)||old.setDisplay!==(event.setDisplay===true)||String(old.retryOf||'')!==String(event.retryOf||''))throw new Error('发放请求已用于其他名单，请重新打开');return old}const currentSet=await suite.document(tx,SETS,set._id);if(currentSet?.status!=='published'||Number(currentSet.revision)!==Number(set.revision))throw new Error('样式已更新，请重新预览');const created={_id:jobId,recordType:'issue',setId:set._id,setRevision:set.revision,title:set.title,playerIds:ids,evidence,cursor:0,status:'pending',setDisplay:event.setDisplay===true,createdBy:auth.userId,createdAt:db.serverDate(),failures:[],...(event.retryOf?{retryOf:event.retryOf}:{})};const {_id,...data}=created;await tx.collection(SETS).doc(jobId).set({data});return created})
    return issueSummary(current)
  }
  async function retryIssue(event,auth) {
    const job=await suite.document(db,SETS,String(event.jobId||''))
    if(!job||job.recordType!=='issue'||job.status!=='complete'||!job.failures?.length)throw new Error('没有可重试的失败名单')
    const set=await getSet(job.setId)
    if(set.status!=='published'||Number(set.revision)!==Number(job.setRevision))throw new Error('样式已更新，请重新预览并选择名单')
    await preload.validatePreload(db,set.preload,suite.document)
    return createIssue(set,[...new Set(job.failures.map(row=>row.playerId))],job.evidence||{},{requestId:event.requestId,setDisplay:job.setDisplay,retryOf:job._id},auth)
  }
  async function continueIssue(event,auth) {
    const job=await suite.document(db,SETS,String(event.jobId||''))
    if(!job||job.recordType!=='issue')throw new Error('发放记录不存在')
    if(job.status==='complete')return issueSummary(job)
    const set=await getSet(job.setId)
    await preload.validatePreload(db,set.preload,suite.document)
    if(Number(set.revision)!==Number(job.setRevision))throw new Error('样式已更新，请重新确认发放名单')
    const {synthetic}=await import('./data-center/statistics.mjs')
    if(set.preload.type!=='platform'&&synthetic(await suite.document(db,preload.COLLECTIONS[set.preload.type],set.preload.targetId)))throw new Error('测试范围不能发放正式卡')
    const scopeIds=set.preload.type==='tournament'?await preload.tournamentPlayerIds(db,set.preload.targetId):null
    const service=scores(),end=Math.min(job.cursor+10,job.playerIds.length)
    const pageScores=await service.playerCardsForAuthorizedPlayers(job.playerIds.slice(job.cursor,end))
    for(let index=job.cursor;index<end;index++){
      const playerId=job.playerIds[index],player=await suite.document(db,'players',playerId)
      const score=pageScores.get(playerId)||{status:'unverified'}
      try {
      if(!player||player.deleted||player.isDeleted||player.status==='deleted')throw issueFailure('PLAYER_UNAVAILABLE','球员档案不存在或已删除')
      const team=player.teamId?await suite.document(db,'teams',player.teamId):null
      if(synthetic(player)||synthetic(team)||score.status==='test_data_excluded')throw issueFailure('TEST_DATA','测试资料不发放')
      if(scopeIds&&!scopeIds.has(playerId)||set.preload.type==='team'&&String(player.teamId)!==set.preload.targetId||set.preload.type==='player'&&playerId!==set.preload.targetId)throw issueFailure('SCOPE_CHANGED','球员已不在当前发放范围')
      if(set.kind==='progression'&&(!TIERS.includes(score.tier)||score.status!=='ready'))throw issueFailure('GRADE_UNREADY','竞技等级尚未核定')
      if(!(await require('./playerCardSource.cjs').resolveSource(db,player))?.fileId)throw issueFailure('PHOTO_MISSING','缺少可用照片')
      await db.runTransaction(async tx=>{
        const currentJob=await suite.document(tx,SETS,job._id),currentSet=await suite.document(tx,SETS,set._id),currentPlayer=await suite.document(tx,'players',playerId)
        if(Number(currentJob.cursor)!==index)throw new Error('发放进度已更新，请刷新后继续')
        if(!currentSet||currentSet.status!=='published'||Number(currentSet.revision)!==Number(job.setRevision))throw new Error('样式已变化，请重新检查')
        if(!currentPlayer||currentPlayer.deleted||currentPlayer.isDeleted||currentPlayer.status==='deleted')throw issueFailure('PLAYER_UNAVAILABLE','球员档案不存在或已删除')
        if(String(currentPlayer.teamId||'')!==String(player.teamId||''))throw new Error('球员资料已变化，请继续发放以重新检查')
        const grants=[]
        for(const key of keysOf(set)){
          const templateId=set.members[key],gid=grantId(playerId,templateId),old=await suite.document(tx,'player_card_library',gid)
          if(old?.status==='revoked')throw issueFailure('GRANT_REVOKED','已有撤销记录，需人工核查')
          grants.push({templateId,gid,old})
        }
        for(const {templateId,gid,old} of grants){
          if(!old)await tx.collection('player_card_library').doc(gid).set({data:{playerId,templateId,setId:set._id,cardKind:set.kind,preload:set.preload,revision:0,grantSource:'platform_confirmed_award',grantRuleVersion:'player-card-workflow/1',grantRosterEvidence:job.evidence?.[playerId]||[],grantTeamId:String(currentPlayer.teamId||''),grantedAt:db.serverDate(),grantedBy:auth.userId,issueJobId:job._id}})
        }
        if(job.setDisplay)await tx.collection('players').doc(playerId).update({data:{playerCardDisplayTemplateId:set.members[set.kind==='progression'?score.tier:'single'],playerCardDisplayUpdatedAt:db.serverDate()}})
        await tx.collection(SETS).doc(job._id).update({data:{cursor:index+1,status:index+1===job.playerIds.length?'complete':'pending',updatedAt:db.serverDate()}})
      })
      } catch(error) {
        // Only confirmed per-player business failures are skipped. Read/network,
        // transaction and version failures pause without advancing the cursor.
        if(!error.recipientFailure)throw error
        await db.runTransaction(async tx=>{const current=await suite.document(tx,SETS,job._id),currentSet=await suite.document(tx,SETS,set._id);if(Number(current.cursor)!==index)throw new Error('发放进度已更新，请继续');if(Number(currentSet?.revision)!==Number(job.setRevision))throw new Error('样式已更新，请重新确认');await tx.collection(SETS).doc(job._id).update({data:{cursor:index+1,status:index+1===job.playerIds.length?'complete':'pending',failures:db.command.set([...(current.failures||[]),{playerId,name:String(player?.name||playerId),reason:error.message,code:error.code}]),updatedAt:db.serverDate()}})})
      }
    }
    return issueSummary(await suite.document(db,SETS,job._id))
  }
  async function issuePreviews(event) {
    const set=await getSet(event.setId)
    if(set.status!=='published'||!set.published)throw new Error('请先发布样式')
    const ids=Array.isArray(event.playerIds)?[...new Set(event.playerIds.map(String))]:[]
    if(!ids.length||ids.length>1000)throw new Error('请选择发放名单')
    await preload.validatePreload(db,set.preload,suite.document)
    const scope=await preload.playersForScope(db,set.preload),byId=new Map(scope.players.map(row=>[String(row._id),row]))
    if(ids.some(key=>!byId.has(key)))throw new Error('名单已变化，请重新选择')
    const offset=Math.max(0,Math.floor(Number(event.offset)||0)),page=ids.slice(offset,offset+24)
    const grades=await scores().playerCardsForAuthorizedPlayers(page)
    const {createAssetResolver,mapLimit}=require('./playerCardPreviewAssets.cjs'),resolveUrls=createAssetResolver(cloud)
    const cards=await mapLimit(page,4,async playerId=>{
      const player=byId.get(playerId),score=grades.get(playerId)||{status:'unverified'}
      if(score.status==='test_data_excluded')return {playerId,name:String(player.name||''),status:'failed',cardError:'测试资料不发放'}
      const key=set.kind==='progression'?score.tier:'single',member=set.published.members[key]
      if(!member||(set.kind==='progression'&&score.status!=='ready'))return {playerId,name:String(player.name||''),status:'failed',cardError:'竞技等级待核定'}
      const snapshot=await suite.document(db,suite.VERSIONS,suite.versionId(member.templateId,member.version)),grant=await suite.document(db,'player_card_library',grantId(playerId,member.templateId))
      if(!snapshot||grant?.status==='revoked')return {playerId,name:String(player.name||''),status:'failed',cardError:'样式或发放状态需要核查'}
      const card=await require('./playerCardDynamic.cjs').descriptor(cloud,db,player,snapshot,grant,{resolveUrls})
      return {...card,name:String(player.name||''),previewOnly:true,cardError:card.reason||''}
    })
    return {success:true,cards,revision:set.revision,total:ids.length,nextOffset:offset+page.length<ids.length?offset+page.length:null}
  }
  return async function(event,auth){
    auth={...auth,userId:auth.userId||auth.user?._id||'platform-owner'}
    const action=String(event.workflowAction||'')
    if(action.startsWith('pointsAppeal')){
      if(auth.principalType!=='platform_owner'||auth.user?.isPlatformOwner!==true)throw new Error('仅平台负责人可处理积分申诉')
      const api=require('./data-center/points-appeals.cjs'),actor={platformOwner:true,actorId:'owner:'+auth.userId}
      if(action==='pointsAppealList')return api.list(db,actor,event)
      if(action==='pointsAppealResolve')return api.resolve(db,actor,event,playerId=>scores().playerPointsLedgerForAuthorizedPlayer(playerId))
      if(action==='pointsAppealLedger')return {success:true,ledger:await scores().playerPointsLedgerForAuthorizedPlayer(String(event.playerId||''))}
      throw new Error('积分申诉操作不存在')
    }
    if(action.startsWith('auditRepair'))return require('./playerCardMatchRepair.cjs').createMatchRepair({cloud})(event,auth)
    if(action.startsWith('scoreRules'))return require('./playerCardScoreRules.cjs').createScoreRulesManager({cloud,service:scores})(event,auth)
    if(action==='auditPlayer'||action==='auditQueue'){const actor={platformOwner:auth.principalType==='platform_owner'&&auth.user?.isPlatformOwner===true};return require('./playerCardAudit.cjs')[action](db,actor,event,scores())}
    if(action==='list')return list()
    if(action==='create')return create(event,auth)
    if(action==='get')return {success:true,set:await view(await getSet(event.setId))}
    if(action==='materials')return saveMaterials(event,auth)
    if(action==='copyLayout')return copyLayout(event,auth)
    if(action==='review')return review(event,auth)
    if(action==='publish')return publish(event,auth)
    if(action==='candidates')return candidates(event)
    if(action==='issuePreviews')return issuePreviews(event)
    if(action==='beginIssue')return beginIssue(event,auth)
    if(action==='continueIssue')return continueIssue(event,auth)
    if(action==='retryIssue')return retryIssue(event,auth)
    if(action==='issueStatus'){const job=await suite.document(db,SETS,String(event.jobId||''));if(!job||job.recordType!=='issue')throw new Error('发放记录不存在');return issueSummary(job)}
    if(action==='issues'){let rows=[];try{rows=await preload.readAll(db,SETS,{recordType:'issue',...(event.setId?{setId:String(event.setId)}:{})})}catch(error){if(!/collection.*(not exist|not found)|DATABASE_COLLECTION_NOT_EXIST/i.test(String(error.message)))throw error}return {success:true,issues:rows.map(({playerIds,evidence,...row})=>({...row,total:playerIds.length})).sort((a,b)=>String(b._id).localeCompare(String(a._id)))}}
    throw new Error('未知制卡流程操作')
  }
}
module.exports={createPlayerCardWorkflows,SETS,keysOf}
