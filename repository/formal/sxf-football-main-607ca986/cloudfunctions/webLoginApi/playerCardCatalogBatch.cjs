const crypto=require('node:crypto')
const suite=require('./playerCardSuite.cjs')
const preload=require('./playerCardPreload.cjs')
const history=require('./playerCardHistory.cjs')
const sourceTools=require('./playerCardSource.cjs')
const {createDataService}=require('./data-center/service.cjs')
const {libraryId,tierPermission}=require('./playerCardLibrary.cjs')

const JOBS='player_card_publish_jobs'
const TEMPLATE_ID=/^[a-f0-9]{32}$/
const PLAYER_ID=/^[a-zA-Z0-9_-]{1,128}$/
function chunk(values,size){const chunks=[];for(let i=0;i<values.length;i+=size)chunks.push(values.slice(i,i+size));return chunks}
function systemFor(template,scope){if(!template.published?.preload)return 'base';return ({platform:'platform',team:'team',tournament:'tournament',player:'player'})[scope.type]||'platform'}
function systemName(system){return ({base:'基础卡',platform:'全平台卡',team:'球队卡',tournament:'赛事卡',player:'球员定制卡'})[system]||'球员卡'}

function createPlayerCardCatalogBatch({cloud,authenticateWebSession,scoreForPlayer}){
  const db=cloud.database()
  async function owner(event){
    const auth=await authenticateWebSession(event)
    if(!auth.success)return auth
    return auth.principalType==='platform_owner'&&auth.user?.isPlatformOwner===true?auth:{success:false,code:'PLAYER_CARD_CATALOG_FORBIDDEN',error:'仅平台负责人可管理球员卡'}
  }
  async function resolveTemplate(templateId){
    if(!TEMPLATE_ID.test(templateId))return {error:'模板编号无效',code:'PLAYER_CARD_TEMPLATE_INVALID'}
    const template=await suite.document(db,suite.TEMPLATES,templateId)
    if(!template||template.status!=='published'||!template.published||!Number(template.publishedVersion||0))return {error:'请选择已发布的卡片模板',code:'PLAYER_CARD_TEMPLATE_NOT_PUBLISHED'}
    const scope=preload.normalizePreload(template.published.preload||{type:'platform'})
    const snapshot=await suite.activeTemplate(db,template.tier,scope,templateId)
    if(!snapshot||Number(snapshot.version)!==Number(template.publishedVersion))return {error:'模板活动版本已变化，请刷新模板列表',code:'PLAYER_CARD_TEMPLATE_NOT_ACTIVE'}
    const stateId=preload.stateId(template.tier,scope,template.published.preload?templateId:undefined)
    const state=await suite.document(db,suite.STATES,stateId)
    if(state?.candidate)return {error:'该模板正在更新，请完成后再制卡',code:'PLAYER_CARD_TEMPLATE_PUBLISHING'}
    return {template,scope,snapshot,system:systemFor(template,scope)}
  }
  async function listTemplates(event){
    const auth=await owner(event);if(!auth.success)return auth
    const rows=await preload.readAll(db,suite.TEMPLATES,{status:'published'}),templates=[]
    for(const template of rows){
      if(!template.published||!Number(template.publishedVersion||0))continue
      const scope=preload.normalizePreload(template.published.preload||{type:'platform'})
      const snapshot=await suite.activeTemplate(db,template.tier,scope,template._id)
      if(!snapshot||Number(snapshot.version)!==Number(template.publishedVersion))continue
      const system=systemFor(template,scope)
      templates.push({id:String(template._id),title:String(snapshot.title||template.published.title||'球员卡模板'),tier:String(template.tier||''),
        version:Number(snapshot.version),scopeType:scope.type,targetId:scope.targetId||'',targetName:scope.targetName||'',system})
    }
    templates.sort((a,b)=>a.system.localeCompare(b.system)||a.tier.localeCompare(b.tier)||a.title.localeCompare(b.title,'zh-CN'))
    return {success:true,templates}
  }
  async function scopeTargets(scope,ids){
    if(scope.type==='platform')return new Set(ids)
    if(scope.type==='player')return new Set(ids.filter(id=>id===scope.targetId))
    if(scope.type==='tournament')return await preload.tournamentPlayerIds(db,scope.targetId)
    const rows=await preload.readAll(db,'players',{teamId:scope.targetId})
    return new Set(rows.map(row=>String(row._id)))
  }
  async function start(event){
    const auth=await owner(event);if(!auth.success)return auth
    const requested=[...new Set((Array.isArray(event.playerIds)?event.playerIds:[]).map(value=>String(value||'')))].filter(Boolean)
    if(!requested.length)return {success:false,code:'PLAYER_CARD_BATCH_EMPTY',error:'请勾选待制卡球员'}
    if(requested.length>2000)return {success:false,code:'PLAYER_CARD_BATCH_TOO_LARGE',error:'一次最多选择 2000 名球员'}
    if(requested.some(id=>!PLAYER_ID.test(id)))return {success:false,code:'PLAYER_CARD_BATCH_PLAYER_ID_INVALID',error:'球员编号无效，请刷新卡库'}
    const templateId=String(event.templateId||''),active=await resolveTemplate(templateId)
    if(active.error)return {success:false,code:active.code,error:active.error}
    const players=[]
    for(const ids of chunk(requested,50)){
      const docs=await Promise.all(ids.map(id=>suite.document(db,'players',id)))
      for(const player of docs)if(player)players.push(player)
    }
    const allowed=await scopeTargets(active.scope,players.map(player=>String(player._id)))
    const mismatch=players.filter(player=>!allowed.has(String(player._id))).map(player=>String(player._id))
    if(mismatch.length)return {success:false,code:'PLAYER_CARD_BATCH_SCOPE_MISMATCH',error:'有球员不属于此模板的球队或赛事范围',ineligiblePlayerIds:mismatch.slice(0,20),ineligibleCount:mismatch.length}
    if(active.system==='player'&&(players.length!==1||String(players[0]._id)!==active.scope.targetId))return {success:false,code:'PLAYER_CARD_BATCH_SINGLE_PLAYER',error:'球员定制模板一次只能用于指定球员'}
    const candidates=[],skipped=[]
    for(const player of players){
      const playerId=String(player._id)
      if(active.system==='base'&&player.playerCardFileId){skipped.push({playerId,reason:'已有基础卡'});continue}
      if(active.system!=='base'){
        const grant=await suite.document(db,'player_card_library',libraryId(playerId,templateId))
        if(grant?.status==='revoked'){skipped.push({playerId,reason:'该球员已退出此卡授权'});continue}
        const render=await suite.document(db,suite.RENDERS,suite.renderId(playerId,templateId,active.snapshot.version))
        if(render?.status==='ready'&&render.fileId&&Number(render.cardDataVersion||0)===Number(player.playerCardVersion||0)&&Number(render.libraryRevision||0)===Number(grant?.revision||0)){
          skipped.push({playerId,reason:'该模板成卡已完成'});continue
        }
      }
      candidates.push(playerId)
    }
    if(!candidates.length)return {success:true,status:'completed',jobId:'',total:0,completed:0,generated:0,skipped:skipped.length,skipReasons:skipped.slice(0,20)}
    const running=(await db.collection(JOBS).where({catalogBatch:true,templateId,status:'pending'}).limit(1).get()).data||[]
    if(running.length)return {success:false,code:'PLAYER_CARD_BATCH_RUNNING',error:'该模板已有制卡任务正在进行',jobId:String(running[0]._id)}
    const jobId=crypto.randomBytes(16).toString('hex'),now=db.serverDate()
    await db.collection(JOBS).doc(jobId).set({data:{catalogBatch:true,templateId,tier:String(active.template.tier),version:Number(active.snapshot.version),scope:active.scope,system:active.system,
      targetIds:candidates,cursor:0,generated:0,generatedPlayerIds:[],skipped,failures:[],status:'pending',leaseToken:'',leaseUntil:0,
      createdBy:String(auth.userId||''),createdAt:now,updatedAt:now}})
    return {success:true,status:'pending',jobId,total:candidates.length,completed:0,generated:0,skipped:skipped.length,skipReasons:skipped.slice(0,20),system:active.system,templateName:String(active.snapshot.title||'卡片模板')}
  }
  async function status(event){
    const auth=await owner(event);if(!auth.success)return auth
    const job=await suite.document(db,JOBS,String(event.jobId||''))
    if(!job||!job.catalogBatch)return {success:false,code:'PLAYER_CARD_BATCH_NOT_FOUND',error:'制卡任务不存在'}
    return {success:true,status:job.status,jobId:String(job._id),templateId:job.templateId,system:job.system,total:job.targetIds.length,completed:Number(job.cursor||0),
      generated:Number(job.generated||0),skipped:job.skipped?.length||0,failed:job.failures?.length||0,skipReasons:(job.skipped||[]).slice(0,20),failures:(job.failures||[]).slice(0,20)}
  }
  async function advance(event){
    const auth=await owner(event);if(!auth.success)return auth
    const jobId=String(event.jobId||''),job=await suite.document(db,JOBS,jobId)
    if(!job||!job.catalogBatch)return {success:false,code:'PLAYER_CARD_BATCH_NOT_FOUND',error:'制卡任务不存在'}
    if(job.status!=='pending')return status(event)
    const token=crypto.randomBytes(12).toString('hex')
    const lease=await db.runTransaction(async tx=>{
      const live=await suite.document(tx,JOBS,jobId)
      if(!live||live.status!=='pending'||Number(live.cursor)!==Number(job.cursor)||Number(live.leaseUntil||0)>Date.now())return false
      await tx.collection(JOBS).doc(jobId).update({data:{leaseToken:token,leaseUntil:Date.now()+90000}});return true
    })
    if(!lease)return {success:true,status:'pending',jobId,total:job.targetIds.length,completed:job.cursor,generated:job.generated||0,skipped:job.skipped?.length||0,failed:job.failures?.length||0,busy:true}
    const active=await resolveTemplate(job.templateId)
    if(active.error||Number(active.snapshot.version)!==Number(job.version)||active.system!==job.system){
      await db.collection(JOBS).doc(jobId).update({data:{status:'blocked',leaseToken:'',leaseUntil:0,failures:[...(job.failures||[]),{playerId:'',reason:'模板已更新，任务停止'}],updatedAt:db.serverDate()}})
      return {success:false,code:'PLAYER_CARD_BATCH_TEMPLATE_CHANGED',error:active.error||'模板已更新，任务已停止'}
    }
    const slice=(job.targetIds||[]).slice(job.cursor,job.cursor+3)
    const scores=scoreForPlayer?null:await createDataService(db).playerCardsForAuthorizedPlayers(slice)
    let cursor=Number(job.cursor||0),generated=0
    const failures=[],skipped=[],generatedIds=[]
    const end=Math.min(cursor+3,job.targetIds.length)
    for(;cursor<end;cursor++){
      const playerId=String(job.targetIds[cursor]);let fileId=''
      try{
        const player=await suite.document(db,'players',playerId)
        if(!player){skipped.push({playerId,reason:'球员档案不存在'});continue}
        if(job.system==='base'&&player.playerCardFileId){skipped.push({playerId,reason:'已有基础卡'});continue}
        const score=scoreForPlayer?await scoreForPlayer(playerId):scores.get(playerId)
        if(score?.status==='test_data_excluded'){skipped.push({playerId,reason:'测试数据不参与正式制卡'});continue}
        if(score?.status!=='ready'){skipped.push({playerId,reason:'等级或生涯数据待核验'});continue}
        const permission=tierPermission(score,job.tier)
        if(permission){skipped.push({playerId,reason:permission});continue}
        const photo=await sourceTools.resolveSource(db,player)
        if(!photo?.fileId){skipped.push({playerId,reason:'缺少可用球员照片'});continue}
        const library=job.system==='base'?null:require('./playerCardLibrary.cjs'),grantId=library?library.libraryId(playerId,job.templateId):''
        const grant=library?await suite.document(db,'player_card_library',grantId):null
        if(grant?.status==='revoked'){skipped.push({playerId,reason:'该球员已退出此卡授权'});continue}
        const revision=Number(grant?.revision||0),portraitFileId=grant?.portraitFileId&&!score.canReplacePhoto?grant.portraitFileId:photo.fileId
        const crop=grant?.crop||{zoom:1,x:0,y:0}
        const result=await suite.generate(cloud,db,player,active.snapshot,score,{portraitFileId,crop})
        fileId=result.fileId
        const renderId=suite.renderId(playerId,job.templateId,job.version),cardId=history.cardId(renderId,result.digest),nextVersion=job.system==='base'?Number(player.playerCardVersion||0)+1:Number(player.playerCardVersion||0)
        await db.runTransaction(async tx=>{
          const current=await suite.document(tx,'players',playerId),stateId=preload.stateId(job.tier,job.scope,job.system==='base'?undefined:job.templateId)
          const state=await suite.document(tx,suite.STATES,stateId),oldRender=await suite.document(tx,suite.RENDERS,renderId)
          if(!current||Number(current.playerCardVersion||0)!==Number(player.playerCardVersion||0))throw Object.assign(new Error('球员资料已更新，请刷新后重试'),{code:'PLAYER_CARD_BATCH_CONFLICT'})
          if(!state?.active||state.active.templateId!==job.templateId||Number(state.active.version)!==Number(job.version)||state.candidate)throw Object.assign(new Error('活动模板正在变化，请稍后重试'),{code:'PLAYER_CARD_BATCH_TEMPLATE_CHANGED'})
          if(job.system==='base'){
            if(current.playerCardFileId)throw Object.assign(new Error('球员已有基础卡'),{code:'PLAYER_CARD_BATCH_ALREADY_DONE'})
            await tx.collection('players').doc(playerId).update({data:{playerCardSourceFileId:photo.fileId,playerCardSourceType:photo.type,playerCardSourceField:photo.field,playerCardFileId:fileId,
              playerCardTier:score.tier,playerCardBackgroundId:job.tier,playerCardVersion:nextVersion,playerCardPoints:score.points,playerCardScoreVersion:score.scoreVersion,
              playerCardTemplateId:job.templateId,playerCardTemplateVersion:job.version,playerCardCrop:db.command.set(crop),playerCardLayout:db.command.set({}),playerCardSchemaVersion:'player-card/4',playerCardUpdatedAt:db.serverDate()}})
          }else{
            const liveGrant=await suite.document(tx,'player_card_library',grantId)
            if(liveGrant?.status==='revoked'||Number(liveGrant?.revision||0)!==revision)throw Object.assign(new Error('球员卡授权已变化，请重试'),{code:'PLAYER_CARD_BATCH_CONFLICT'})
            if(oldRender?.status==='ready'&&Number(oldRender.cardDataVersion||0)===Number(current.playerCardVersion||0)&&Number(oldRender.libraryRevision||0)===revision)throw Object.assign(new Error('该模板成卡已完成'),{code:'PLAYER_CARD_BATCH_ALREADY_DONE'})
            const grantData={playerId,templateId:job.templateId,preload:job.scope,revision,grantSource:'catalog_batch',grantRuleVersion:'player-card-preload/1',grantTemplateVersion:job.version,
              portraitFileId,crop,grantTeamId:String(current.teamId||''),fileId,updatedAt:db.serverDate()}
            if(liveGrant)await tx.collection('player_card_library').doc(grantId).update({data:grantData})
            else await tx.collection('player_card_library').doc(grantId).set({data:{...grantData,grantedAt:db.serverDate()}})
          }
          if(oldRender?.status==='ready')await history.archiveCurrentRender(tx,db,renderId,oldRender)
          await tx.collection(suite.RENDERS).doc(renderId).set({data:{playerId,cardTypeId:job.tier,templateId:job.templateId,publishedVersion:job.version,cardDataVersion:nextVersion,
            libraryRevision:revision,renderVersion:suite.RENDER_VERSION,cardId,fileId,digest:result.digest,status:'ready',generatedAt:db.serverDate()}})
          await tx.collection(suite.STATES).doc(stateId).update({data:{mutation:Number(state.mutation||0)+1,updatedAt:db.serverDate()}})
        })
        generated++;generatedIds.push(playerId)
      }catch(error){
        if(fileId)await cloud.deleteFile({fileList:[fileId]}).catch(()=>{})
        if(error.code==='PLAYER_CARD_BATCH_ALREADY_DONE'){skipped.push({playerId,reason:error.message});continue}
        failures.push({playerId,reason:String(error.message||'制卡失败').slice(0,120)})
      }
    }
    const complete=cursor>=job.targetIds.length
    await db.runTransaction(async tx=>{
      const current=await suite.document(tx,JOBS,jobId)
      if(!current||current.status!=='pending'||Number(current.cursor)!==Number(job.cursor)||current.leaseToken!==token)throw new Error('制卡进度已变化，请刷新')
      const allFailures=[...(current.failures||[]),...failures]
      await tx.collection(JOBS).doc(jobId).update({data:{cursor,leaseToken:'',leaseUntil:0,generated:Number(current.generated||0)+generated,
        generatedPlayerIds:[...new Set([...(current.generatedPlayerIds||[]),...generatedIds])],skipped:[...(current.skipped||[]),...skipped],failures:allFailures,
        status:complete?(allFailures.length?'completed_with_failures':'completed'):'pending',completedAt:complete?db.serverDate():null,updatedAt:db.serverDate()}})
    })
    return status({...event,jobId})
  }
  async function retry(event){
    const auth=await owner(event);if(!auth.success)return auth
    const jobId=String(event.jobId||''),job=await suite.document(db,JOBS,jobId)
    if(!job||!job.catalogBatch||!job.failures?.length)return {success:false,code:'PLAYER_CARD_BATCH_NOT_RETRYABLE',error:'没有可重试的失败球员'}
    const retryIds=job.failures.map(row=>String(row.playerId)).filter(Boolean)
    if(!retryIds.length)return {success:false,code:'PLAYER_CARD_BATCH_NOT_RETRYABLE',error:'失败项需要先重新核对模板状态'}
    const running=(await db.collection(JOBS).where({catalogBatch:true,templateId:job.templateId,status:'pending'}).limit(1).get()).data||[]
    if(running.length)return {success:false,code:'PLAYER_CARD_BATCH_RUNNING',error:'该模板已有制卡任务正在进行'}
    await db.collection(JOBS).doc(jobId).update({data:{targetIds:retryIds,cursor:0,failures:[],status:'pending',leaseToken:'',leaseUntil:0,updatedAt:db.serverDate()}})
    return {success:true,status:'pending',jobId,total:retryIds.length,completed:0,generated:Number(job.generated||0),skipped:job.skipped?.length||0,failed:0}
  }
  return async event=>{
    try{
      if(event.action==='listPlayerCardCatalogTemplates')return await listTemplates(event)
      if(event.action==='startPlayerCardCatalogBatch')return await start(event)
      if(event.action==='advancePlayerCardCatalogBatch')return await advance(event)
      if(event.action==='getPlayerCardCatalogBatchStatus')return await status(event)
      if(event.action==='retryPlayerCardCatalogBatch')return await retry(event)
      return {success:false,code:'PLAYER_CARD_BATCH_ACTION_INVALID',error:'未知制卡操作'}
    }catch(error){return {success:false,code:error.code||'PLAYER_CARD_BATCH_ERROR',error:error.message||'制卡失败，请重试'}}
  }
}
module.exports={createPlayerCardCatalogBatch,systemFor,systemName}
