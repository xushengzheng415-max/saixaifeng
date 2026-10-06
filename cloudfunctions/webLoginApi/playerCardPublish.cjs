const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { renderCard } = require('./playerCardRender.cjs')
const { createDataService } = require('./data-center/service.cjs')
const suite = require('./playerCardSuite.cjs')
const preload = require('./playerCardPreload.cjs')
const { resolveSource } = require('./playerCardSource.cjs')

function tierPermission(score,tier,scopeType) {
  if(scopeType==='player') return score?.status==='test_data_excluded' ? '测试资料不能生成正式卡' : ''
    if (!score || score.status !== 'ready' || !score.tier) return '生涯积分待核定'
  if (String(score.tier) !== String(tier) && !score.canChangeBackground) return '当前等级暂不能使用此卡'
  return ''
}

function createPlayerCardPublish({ cloud, scoreForPlayer }) {
  const db = cloud.database()
  const basePublisher=require('./playerCardBasePublish.cjs').createPlayerCardPublish({cloud})
  async function begin(row, revision, userId) {
    if(!row.draft?.preload) return basePublisher.begin(row,revision,userId)
    const tier = String(row.tier || '')
    if (!suite.TYPES.includes(tier)) throw new Error('暂不支持该卡种')
    const scope = await preload.validatePreload(db, row.draft?.preload, suite.document)
    const key = preload.stateId(tier, scope, row.draft?.preload ? row._id : undefined)
    let state = await suite.document(db, suite.STATES, key)
    if (!state) {
      await db.runTransaction(async tx => {
        if (!await suite.document(tx, suite.STATES, key)) {
          await tx.collection(suite.STATES).doc(key).set({ data: { tier, preload:scope, revision:0, mutation:0, active:null, candidate:null } })
        }
      })
      state = await suite.document(db, suite.STATES, key)
    }
    if (state.candidate) throw new Error('此卡种正在发布，请先完成或修复')
    if (Number(row.revision) !== revision) throw new Error('模板已更新，请重新加载')
    if (!row.draft?.backgroundFileId || !row.draft?.maskFileId) throw new Error('请先上传背景图和黑白遮罩')
    const version = Number(row.draftVersion || 0)
    if (version <= Number(row.publishedVersion || 0)) throw new Error('没有待发布的草稿')
    const snapshot = { _id: suite.versionId(row._id, version), templateId: row._id, cardTypeId: tier,
      version, preload:scope, title: row.draft.title, backgroundFileId: row.draft.backgroundFileId,
      maskFileId: row.draft.maskFileId, layout: row.draft.layout, photo: row.draft.photo,
      badges: row.draft.badges, positionOverride:String(row.draft.positionOverride||''),createdAt: db.serverDate(), createdBy: userId }
    const [backgroundBuffer, maskBuffer] = await Promise.all([suite.asset(cloud,snapshot.backgroundFileId,2*1024*1024),suite.asset(cloud,snapshot.maskFileId,2*1024*1024)])
    await require('./playerCardRender.cjs').ensureFonts()
    const preview = renderCard({ backgroundBuffer,maskBuffer,portraitBuffer:fs.readFileSync(require('./playerCardFontCache.cjs').pathFor('player-card-preview-portrait.png')),template:snapshot,
      player:{name:'示例球员',jerseyNumber:'10',position:'FW',jerseyName:'SAMPLE',height:178,weight:72,nationality:'中国'} })
    snapshot.previewDigest = crypto.createHash('sha256').update(preview).digest('hex')
    const scoped = await preload.playersForScope(db,scope)
    const targetIds=scoped.players.map(player=>String(player._id||'')).filter(Boolean)
    if(!targetIds.length) throw Object.assign(new Error('当前范围内没有球员'),{code:'CARD_PRELOAD_NO_PLAYERS'})
    const jobId = crypto.randomBytes(16).toString('hex')
    if (await suite.document(db, suite.VERSIONS, snapshot._id)) throw new Error('此草稿已创建发布版本，请继续原发布任务')
    const rosterEvidenceByPlayer=scope.type==='tournament' ? Object.fromEntries(targetIds.map(id=>[id,scoped.evidenceByPlayer?.get(id)||[]])) : {}
    const job = { _id: jobId, tier, stateId:key, preload:scope, additive:Boolean(row.draft?.preload), templateId: row._id, version, templateRevision: revision,
      targetIds, cursor: 0, generated:0, generatedPlayerIds:[], failures: [], skipped:[], rosterEvidenceByPlayer, status: 'pending',
      createdBy: userId, createdAt: db.serverDate(), updatedAt: db.serverDate(),
      stateRevision: Number(state.revision || 0) }
    const snapshotData = { ...snapshot }; delete snapshotData._id
    const jobData = { ...job }; delete jobData._id
    await db.runTransaction(async tx => {
      const current = await suite.document(tx, suite.STATES, key)
      const template = await suite.document(tx, suite.TEMPLATES, row._id)
      if (!current || current.candidate || Number(current.revision || 0) !== job.stateRevision ||
          !template || Number(template.revision || 0) !== revision) throw new Error('发布状态已变化，请刷新后重试')
      await tx.collection(suite.VERSIONS).doc(snapshot._id).set({ data: snapshotData })
      await tx.collection(suite.JOBS).doc(jobId).set({ data: jobData })
      await tx.collection(suite.STATES).doc(key).update({ data: { candidate: db.command.set({ jobId, templateId: row._id, version }),
        revision: job.stateRevision + 1, updatedAt: db.serverDate() } })
    })
    return { success:true, status:'pending', jobId, total:targetIds.length, completed:0, generated:0, failed:0, skipped:0 }
  }

  async function confirm(jobId,userId) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if (!job || job.status !== 'review') throw new Error('成卡尚未全部生成，请先完成制卡')
    if (job.failures?.length) throw new Error('仍有成卡生成失败，请先修复')
    if (!(job.generatedPlayerIds||[]).length) throw new Error('没有生成可预览的成卡，不能上线')
    const skippedIds=new Set((job.skipped||[]).map(item=>String(item.playerId)))
    for (const playerId of job.targetIds || []) {
      if(skippedIds.has(String(playerId)))continue
      const player=await suite.document(db,'players',playerId)
      const render=await suite.document(db,suite.RENDERS,suite.renderId(playerId,job.templateId,job.version))
      const grant=job.additive ? await suite.document(db,'player_card_library',require('./playerCardLibrary.cjs').libraryId(playerId,job.templateId)) : null
      if(!player || !render || render.status!=='ready' || !render.fileId || Number(render.cardDataVersion)!==Number(player.playerCardVersion||0) || (grant && Number(render.libraryRevision||0)!==Number(grant.revision||0)) || (!grant && Number(render.libraryRevision||0)!==0)) throw new Error('成卡清单已变化，请重新生成后再确认')
    }
    await db.collection(suite.JOBS).doc(jobId).update({data:{status:'preloading',preloadCursor:0,confirmedBy:userId,confirmedAt:db.serverDate(),updatedAt:db.serverDate()}})
    return advancePreload(jobId)
  }

  async function reject(jobId,userId) {
    const job=await suite.document(db,suite.JOBS,jobId)
    if(!job||job.status!=='review')throw new Error('只有待预览的成卡可以退回修改')
    await db.runTransaction(async tx=>{
      const currentJob=await suite.document(tx,suite.JOBS,jobId),state=await suite.document(tx,suite.STATES,job.stateId||job.tier)
      if(!currentJob||currentJob.status!=='review'||state?.candidate?.jobId!==jobId)throw new Error('预览任务已变化，请刷新后重试')
      await tx.collection(suite.STATES).doc(job.stateId||job.tier).update({data:{candidate:null,revision:Number(state.revision||0)+1,updatedAt:db.serverDate()}})
      await tx.collection(suite.JOBS).doc(jobId).update({data:{status:'rejected',rejectedBy:userId,rejectedAt:db.serverDate(),updatedAt:db.serverDate()}})
      await tx.collection(suite.VERSIONS).doc(suite.versionId(job.templateId,job.version)).remove()
    })
    for(const playerId of [...new Set(job.generatedPlayerIds||[])]){
      const renderId=suite.renderId(playerId,job.templateId,job.version),render=await suite.document(db,suite.RENDERS,renderId)
      if(render?.fileId)await cloud.deleteFile({fileList:[render.fileId]}).catch(()=>{})
      await db.collection(suite.RENDERS).doc(renderId).remove().catch(()=>{})
    }
    return {success:true,status:'rejected',jobId,templateId:job.templateId}
  }

  async function activate(jobId) {
    const job=await suite.document(db,suite.JOBS,jobId)
    if(!job||job.status!=='preloading')throw new Error('预装任务已失效')
    const stateBeforeScan=await suite.document(db,suite.STATES,job.stateId||job.tier),skippedIds=new Set((job.skipped||[]).map(item=>String(item.playerId)))
    await db.runTransaction(async tx=>{
      const liveJob=await suite.document(tx,suite.JOBS,jobId),state=await suite.document(tx,suite.STATES,job.stateId||job.tier),row=await suite.document(tx,suite.TEMPLATES,job.templateId)
      if(!liveJob||liveJob.status!=='preloading'||Number(liveJob.preloadCursor||0)<(job.targetIds||[]).length)throw new Error('预装尚未完成')
      if(!state?.candidate||state.candidate.jobId!==jobId||Number(state.mutation||0)!==Number(stateBeforeScan?.mutation||0)||!row||Number(row.revision||0)!==Number(job.templateRevision))throw new Error('发布状态已变化，请重新核对')
      const snapshot=await suite.document(tx,suite.VERSIONS,suite.versionId(job.templateId,job.version));if(!snapshot)throw new Error('待发布模板缺失')
      await tx.collection(suite.STATES).doc(job.stateId||job.tier).update({data:{active:db.command.set({templateId:job.templateId,version:job.version}),candidate:null,revision:Number(state.revision||0)+1,activatedAt:db.serverDate(),activatedBy:job.confirmedBy}})
      await tx.collection(suite.TEMPLATES).doc(job.templateId).update({data:{published:db.command.set({title:snapshot.title,backgroundFileId:snapshot.backgroundFileId,maskFileId:snapshot.maskFileId,preload:preload.normalizePreload(snapshot.preload),layout:snapshot.layout,photo:snapshot.photo,badges:snapshot.badges,positionOverride:String(snapshot.positionOverride||'')}),publishedVersion:job.version,status:'published',revision:Number(row.revision||0)+1,publishedAt:db.serverDate(),publishedBy:job.confirmedBy,updateAt:db.serverDate()}})
      if(job.preload?.type==='player'&&!skippedIds.has(String(job.preload.targetId||'')))await tx.collection('players').doc(String(job.preload.targetId)).update({data:{playerCardDisplayTemplateId:job.templateId,playerCardDisplayUpdatedAt:db.serverDate()}})
      await tx.collection(suite.JOBS).doc(jobId).update({data:{status:'active',completedAt:db.serverDate(),updatedAt:db.serverDate()}})
    })
    return {success:true,status:'active',jobId,templateId:job.templateId,publishedVersion:job.version,total:job.targetIds.length,completed:job.cursor,affected:job.generated||0,generated:job.generated||0,skipped:job.skipped?.length||0,skippedPlayers:(job.skipped||[]).slice(0,10),failed:0}
  }

  async function advancePreload(jobId) {
    const job=await suite.document(db,suite.JOBS,jobId)
    if(!job||job.status!=='preloading')throw new Error('预装任务已失效')
    const skippedIds=new Set((job.skipped||[]).map(item=>String(item.playerId))),start=Number(job.preloadCursor||0),end=Math.min(start+10,(job.targetIds||[]).length)
    for(let index=start;index<end;index++){
      const playerId=String(job.targetIds[index]);if(skippedIds.has(playerId))continue
      const player=await suite.document(db,'players',playerId),render=await suite.document(db,suite.RENDERS,suite.renderId(playerId,job.templateId,job.version))
      if(!player||!render?.fileId)throw new Error('成卡数据缺失，请重新生成')
      const library=require('./playerCardLibrary.cjs'),grantId=library.libraryId(playerId,job.templateId)
      await db.runTransaction(async tx=>{
        const current=await suite.document(tx,'player_card_library',grantId)
        if(current)return
        await tx.collection('player_card_library').doc(grantId).set({data:{playerId,templateId:job.templateId,preload:job.preload,revision:0,
          grantedAt:db.serverDate(),grantSource:'published_preload',grantRuleVersion:'player-card-preload/1',grantTemplateVersion:job.version,
          grantRosterEvidence:job.rosterEvidenceByPlayer?.[playerId]||[],grantTeamId:String(player.teamId||''),portraitFileId:render.portraitFileId||'',crop:render.crop||{zoom:1,x:0,y:0}}})
      })
    }
    await db.collection(suite.JOBS).doc(jobId).update({data:{preloadCursor:end,updatedAt:db.serverDate()}})
    if(end<(job.targetIds||[]).length)return {success:true,status:'preloading',jobId,total:job.targetIds.length,completed:end,preloadCompleted:end,generated:job.generated||0,skipped:job.skipped?.length||0,failed:0}
    const result=await activate(jobId)
    return result
  }

  async function finish(jobId) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if (!job || job.status !== 'pending') throw new Error('发布任务已失效')
    if (job.failures?.length) return { success:false, status:'blocked', jobId,
      total:job.targetIds.length, completed:job.cursor, generated:job.generated||0, failed:job.failures.length, skipped:job.skipped?.length||0, failures:job.failures.slice(0, 10), skippedPlayers:(job.skipped||[]).slice(0,10) }
    if (job.cursor < job.targetIds.length) return { success:true, status:'pending', jobId,
      total:job.targetIds.length, completed:job.cursor, generated:job.generated||0, failed:0, skipped:job.skipped?.length||0 }
    const missing = [], skippedIds=new Set((job.skipped||[]).map(item=>String(item.playerId)))
    for (const playerId of job.targetIds) {
      if(skippedIds.has(String(playerId)))continue
      const player=await suite.document(db,'players',playerId)
      if(!player) { missing.push(String(playerId)); continue }
      const render=await suite.document(db,suite.RENDERS,suite.renderId(playerId,job.templateId,job.version))
      const grant=job.additive ? await suite.document(db,'player_card_library',require('./playerCardLibrary.cjs').libraryId(playerId,job.templateId)) : null
      if(!render || render.status!=='ready' || Number(render.cardDataVersion)!==Number(player.playerCardVersion||0) || (grant && Number(render.libraryRevision||0)!==Number(grant.revision||0)) || (!grant && Number(render.libraryRevision||0)!==0)) missing.push(String(playerId))
    }
    if (missing.length) {
      const next = [...(job.targetIds || []), ...missing]
      await db.collection(suite.JOBS).doc(jobId).update({ data: { targetIds: next, cursor: job.cursor,
        updatedAt: db.serverDate() } })
      return { success:true, status:'pending', jobId, total:next.length, completed:job.cursor, generated:job.generated||0, failed:0, skipped:job.skipped?.length||0 }
    }
    await db.collection(suite.JOBS).doc(jobId).update({ data: { status:'review',
      reviewReadyAt:db.serverDate(), updatedAt:db.serverDate() } })
    return { success:true, status:'review', jobId, templateId:job.templateId,
      publishedVersion:job.version, total:job.targetIds.length, completed:job.cursor,
      generated:job.generated||0, skipped:job.skipped?.length||0,
      skippedPlayers:(job.skipped||[]).slice(0,10), failed:0 }
  }

  async function previews(jobId,offset=0,limit=24) {
    const job=await suite.document(db,suite.JOBS,jobId)
    if(!job || !['review','active'].includes(job.status))throw new Error('成卡尚未进入预览状态')
    const skipped=new Set((job.skipped||[]).map(item=>String(item.playerId)))
    const ids=[...new Set((job.generatedPlayerIds||[]).map(String))].filter(id=>!skipped.has(id))
    const start=Math.max(0,Number(offset)||0),size=Math.max(1,Math.min(24,Number(limit)||24)),page=ids.slice(start,start+size)
    const rows=await Promise.all(page.map(async playerId=>{
      const [player,render]=await Promise.all([suite.document(db,'players',playerId),suite.document(db,suite.RENDERS,suite.renderId(playerId,job.templateId,job.version))])
      return player&&render?.status==='ready'&&render.fileId?{playerId,name:String(player.name||''),teamId:String(player.teamId||''),jerseyNumber:String(player.jerseyNumber||''),cardId:String(render.cardId||''),fileId:String(render.fileId)}:null
    }))
    const valid=rows.filter(Boolean),idsToSign=valid.map(row=>row.fileId),result=idsToSign.length?await cloud.getTempFileURL({fileList:idsToSign}):{fileList:[]},urlById=new Map((result.fileList||[]).map(file=>[file.fileID,file.tempFileURL||'']))
    return {success:true,status:job.status,jobId,total:ids.length,offset:start,nextOffset:start+page.length<ids.length?start+page.length:null,
      cards:valid.map(row=>({playerId:row.playerId,name:row.name,teamId:row.teamId,jerseyNumber:row.jerseyNumber,cardId:row.cardId,imageUrl:urlById.get(row.fileId)||''}))}
  }

  async function advance(jobId,options={}) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if(job?.status==='preloading')return advancePreload(jobId)
    if (!job || job.status !== 'pending') throw new Error('发布任务已失效')
    if(!job.additive) return basePublisher.advance(jobId,options)
    if (job.failures?.length) return finish(jobId)
    const snapshot = await suite.document(db, suite.VERSIONS, suite.versionId(job.templateId, job.version))
    if (!snapshot) throw new Error('待发布模板缺失')
    const targetIds = job.targetIds || []
    let cursor = Number(job.cursor || 0)
    const failures = [], skipped=[],generatedPlayerIds=[]
    const batchEnd = Math.min(cursor + 3, targetIds.length)
    for (; cursor < batchEnd; cursor++) {
        const playerId = targetIds[cursor]
      try {
        const player = await suite.document(db, 'players', playerId)
        if (!player) { failures.push({playerId,reason:'球员档案不存在'}); continue }
        const grant = job.additive ? await suite.document(db, 'player_card_library', require('./playerCardLibrary.cjs').libraryId(playerId,job.templateId)) : null
        if (job.additive && grant?.status === 'revoked') throw new Error('该球员的卡片授权已撤销')
        if (!job.additive && !player.playerCardFileId) continue
        const score = await (scoreForPlayer ? scoreForPlayer(playerId) : createDataService(db).playerCardForAuthorizedPlayer(playerId))
        const permission=tierPermission(score,job.tier,job.preload?.type)
        if(permission) { skipped.push({playerId,reason:permission}); continue }
        const source=await resolveSource(db,player)
        if(!source?.fileId) { skipped.push({playerId,reason:'标准形象照缺失'}); continue }
        const currentGrant=grant
        const portraitFileId=currentGrant?.portraitFileId && !score.canReplacePhoto ? currentGrant.portraitFileId : source.fileId
        const crop=currentGrant?.crop || {zoom:1,x:0,y:0}
        const generated=await suite.generate(cloud,db,player,snapshot,score,{portraitFileId,crop})
        const renderId=suite.renderId(playerId,job.templateId,job.version),cardId=require('./playerCardHistory.cjs').cardId(renderId,generated.digest)
        await db.collection(suite.RENDERS).doc(renderId).set({data:{
          playerId,cardTypeId:job.tier,templateId:job.templateId,publishedVersion:job.version,
          cardDataVersion:Number(player.playerCardVersion||0),libraryRevision:Number(currentGrant?.revision||0),renderVersion:suite.RENDER_VERSION,
          portraitFileId,crop,cardId,fileId:generated.fileId,digest:generated.digest,status:'ready',generatedAt:db.serverDate()
        }})
        generatedPlayerIds.push(String(playerId))
      } catch (error) {
        failures.push({ playerId, reason:String(error.message||'成卡生成失败').slice(0,120) })
      }
    }
    await db.runTransaction(async tx => {
      const current = await suite.document(tx, suite.JOBS, jobId)
      if (!current || current.status !== 'pending' || Number(current.cursor) !== Number(job.cursor)) throw new Error('发布进度已变化，请刷新后继续')
      const completedIds=[...new Set([...(current.generatedPlayerIds||[]),...generatedPlayerIds])]
      await tx.collection(suite.JOBS).doc(jobId).update({ data: { cursor, generatedPlayerIds:completedIds, generated:completedIds.length, skipped:[...(current.skipped||[]),...skipped], failures:[...(current.failures||[]),...failures], updatedAt:db.serverDate() } })
    })
    return finish(jobId)
  }

  async function status(tier, scope, templateId) {
    if(!templateId) return basePublisher.status(tier)
    const key = preload.stateId(tier, scope, templateId)
    const state = await suite.document(db, suite.STATES, key)
    const jobId = state?.candidate?.jobId
    if (!jobId) { const base=await suite.document(db,suite.STATES,tier);return base?.candidate?.templateId === templateId ? basePublisher.status(tier) : {success:true,status:'idle'} }
    const job = await suite.document(db, suite.JOBS, jobId)
    return job ? { success:true, status:job.failures?.length ? 'blocked' : job.status,
      jobId, total:job.targetIds?.length || 0, completed:job.cursor || 0,
      generated:job.generated||0, preloadCompleted:job.preloadCursor||0, skipped:job.skipped?.length||0,
      skippedPlayers:(job.skipped||[]).slice(0,10), failed:job.failures?.length || 0, failures:(job.failures||[]).slice(0,10) } :
      { success:false, status:'error', error:'发布任务记录缺失，请联系平台处理' }
  }

  async function retry(jobId) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if (!job || job.status !== 'pending' || !job.failures?.length) throw new Error('没有可重试的成卡')
    if(!job.additive) return basePublisher.retry(jobId)
    const state = await suite.document(db, suite.STATES, job.stateId || job.tier)
    if (state?.candidate?.jobId !== jobId) throw new Error('发布任务已失效')
    const targetIds = [...(job.targetIds||[]), ...job.failures.map(item => item.playerId)]
    await db.collection(suite.JOBS).doc(jobId).update({ data: { targetIds, failures:[], updatedAt:db.serverDate() } })
    return { success:true, status:'pending', jobId, total:targetIds.length, completed:job.cursor, generated:job.generated||0, skipped:job.skipped?.length||0, skippedPlayers:(job.skipped||[]).slice(0,10), failed:0 }
  }

  return { begin, advance, status, retry, confirm, reject, previews, synchronizeActive:basePublisher.synchronizeActive }
}

module.exports = { createPlayerCardPublish }
