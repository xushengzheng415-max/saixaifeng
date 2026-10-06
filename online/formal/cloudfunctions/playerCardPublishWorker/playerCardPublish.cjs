const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { renderCard } = require('./playerCardRender.cjs')
const { createDataService } = require('./data-center/service.cjs')
const suite = require('./playerCardSuite.cjs')
const {resolveSource}=require('./playerCardSource.cjs')

function createPlayerCardPublish({ cloud }) {
  const db = cloud.database()
  async function begin(row, revision, userId) {
    const tier = String(row.tier || '')
    if (!suite.TYPES.includes(tier)) throw new Error('暂不支持该卡种')
    const state = await suite.document(db, suite.STATES, tier)
    if (!state) throw new Error('卡种尚未初始化，请联系平台处理')
    if (state.candidate) throw new Error('此卡种正在发布，请先完成或修复')
    if (Number(row.revision) !== revision) throw new Error('模板已更新，请重新加载')
    if (!row.draft?.backgroundFileId || !row.draft?.maskFileId) throw new Error('请先上传背景图和黑白遮罩')
    const version = Number(row.draftVersion || 0)
    if (version <= Number(row.publishedVersion || 0)) throw new Error('没有待发布的草稿')
    const snapshot = { _id: suite.versionId(row._id, version), templateId: row._id, cardTypeId: tier,
      version, title: row.draft.title, backgroundFileId: row.draft.backgroundFileId,
      maskFileId: row.draft.maskFileId, layout: row.draft.layout, photo: row.draft.photo,
      badges: row.draft.badges, createdAt: db.serverDate(), createdBy: userId }
    const [backgroundBuffer, maskBuffer] = await Promise.all([suite.asset(cloud,snapshot.backgroundFileId,2*1024*1024),suite.asset(cloud,snapshot.maskFileId,2*1024*1024)])
    const preview = renderCard({ backgroundBuffer,maskBuffer,portraitBuffer:fs.readFileSync(path.join(__dirname,'player-card-preview-portrait.png')),template:snapshot,
      player:{name:'示例球员',jerseyNumber:'10',position:'FW',jerseyName:'SAMPLE',height:178,weight:72,nationality:'中国'} })
    snapshot.previewDigest = crypto.createHash('sha256').update(preview).digest('hex')
    const players = await suite.publicationPlayers(db, tier)
    const jobId = crypto.randomBytes(16).toString('hex')
    if (await suite.document(db, suite.VERSIONS, snapshot._id)) throw new Error('此草稿已创建发布版本，请继续原发布任务')
    const job = { _id: jobId, tier, templateId: row._id, version, templateRevision: revision,
      targetIds: players.map(p => String(p._id)), cursor: 0, failures: [], skipped:[], generated:0, status: 'pending',
      createdBy: userId, createdAt: db.serverDate(), updatedAt: db.serverDate(),
      stateRevision: Number(state.revision || 0) }
    const snapshotData = { ...snapshot }; delete snapshotData._id
    const jobData = { ...job }; delete jobData._id
    await db.runTransaction(async tx => {
      const current = await suite.document(tx, suite.STATES, tier)
      const template = await suite.document(tx, suite.TEMPLATES, row._id)
      if (!current || current.candidate || Number(current.revision || 0) !== job.stateRevision ||
          !template || Number(template.revision || 0) !== revision) throw new Error('发布状态已变化，请刷新后重试')
      await tx.collection(suite.VERSIONS).doc(snapshot._id).set({ data: snapshotData })
      await tx.collection(suite.JOBS).doc(jobId).set({ data: jobData })
      await tx.collection(suite.STATES).doc(tier).update({ data: { candidate: db.command.set({ jobId, templateId: row._id, version }),
        revision: job.stateRevision + 1, updatedAt: db.serverDate() } })
    })
    return players.length ? { success:true, status:'pending', jobId, total:players.length, completed:0, failed:0 } : finish(jobId)
  }

  async function finish(jobId) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if (!job || job.status !== 'pending') throw new Error('发布任务已失效')
    if (job.failures?.length) return { success:false, status:'blocked', jobId,
      total:job.targetIds.length, completed:job.cursor, failed:job.failures.length, failures:job.failures.slice(0, 10) }
    if (job.cursor < job.targetIds.length) return { success:true, status:'pending', jobId,
      total:job.targetIds.length, completed:job.cursor, failed:0 }
    const stateBeforeScan = await suite.document(db, suite.STATES, job.tier)
    const currentPlayers = await suite.savedPlayers(db, job.tier)
    const missing = [], renders = new Map()
    for (let offset=0;offset<currentPlayers.length;offset+=100) {
      const ids=currentPlayers.slice(offset,offset+100).map(player=>suite.renderId(player._id,job.templateId,job.version))
      const page=await db.collection(suite.RENDERS).where({_id:db.command.in(ids)}).limit(100).get()
      for(const render of page.data||[])renders.set(String(render._id),render)
    }
    for(const player of currentPlayers){
      const render=renders.get(suite.renderId(player._id,job.templateId,job.version))
      if(!render || render.status!=='ready' || render.renderVersion!==suite.RENDER_VERSION || Number(render.cardDataVersion)!==Number(player.playerCardVersion||0))missing.push(String(player._id))
    }
    if (missing.length) {
      const next = [...(job.targetIds || []), ...missing]
      await db.collection(suite.JOBS).doc(jobId).update({ data: { targetIds: next, cursor: job.cursor,
        updatedAt: db.serverDate() } })
      return { success:true, status:'pending', jobId, total:next.length, completed:job.cursor, failed:0 }
    }
    await db.runTransaction(async tx => {
      const liveJob = await suite.document(tx, suite.JOBS, jobId)
      if (!liveJob || liveJob.status !== 'pending' || liveJob.failures?.length || Number(liveJob.cursor) !== Number(job.cursor)) throw new Error('发布任务已变化，请刷新后继续')
      const state = await suite.document(tx, suite.STATES, job.tier)
      const row = await suite.document(tx, suite.TEMPLATES, job.templateId)
      if (!state?.candidate || state.candidate.jobId !== jobId ||
          Number(state.mutation || 0) !== Number(stateBeforeScan?.mutation || 0) ||
          !row || (!job.syncActive && Number(row.revision || 0) !== Number(job.templateRevision))) throw new Error('发布状态已变化，请重新核对')
      const snapshot = await suite.document(tx, suite.VERSIONS, suite.versionId(job.templateId, job.version))
      if (!snapshot) throw new Error('待发布模板缺失')
      await tx.collection(suite.STATES).doc(job.tier).update({ data: {
        active: db.command.set({ templateId: job.templateId, version: job.version }), candidate: null,
        revision: Number(state.revision || 0) + 1, activatedAt: db.serverDate(), activatedBy: job.createdBy
      } })
      if(!job.syncActive)await tx.collection(suite.TEMPLATES).doc(job.templateId).update({ data: {
        published: db.command.set({ title:snapshot.title, backgroundFileId:snapshot.backgroundFileId,
          maskFileId:snapshot.maskFileId, layout:snapshot.layout, photo:snapshot.photo, badges:snapshot.badges }),
        publishedVersion:job.version, status:'published', revision:Number(row.revision||0)+1,
        publishedAt:db.serverDate(), publishedBy:job.createdBy, updateAt:db.serverDate()
      } })
      await tx.collection(suite.JOBS).doc(jobId).update({ data: { status:'active',
        affected:currentPlayers.length,
        completedAt:db.serverDate(), updatedAt:db.serverDate() } })
    })
    return { success:true, status:'active', jobId, templateId:job.templateId,
      publishedVersion:job.version, affected:currentPlayers.length, skipped:job.skipped?.length||0,
      skipReasons:(job.skipped||[]).reduce((counts,row)=>{counts[row.reason]=(counts[row.reason]||0)+1;return counts},{}), failed:0 }
  }

  async function advance(jobId,options={}) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if(job?.status==='active')return {success:true,status:'active',jobId,templateId:job.templateId,publishedVersion:job.version,affected:job.affected??job.generated??0,skipped:job.skipped?.length||0,skipReasons:(job.skipped||[]).reduce((counts,row)=>{counts[row.reason]=(counts[row.reason]||0)+1;return counts},{}),failed:0}
    if (!job || job.status !== 'pending') throw new Error('发布任务已失效')
    if (job.failures?.length) return finish(jobId)
    const leaseToken=crypto.randomBytes(12).toString('hex')
    const leased=await db.runTransaction(async tx=>{
      const live=await suite.document(tx,suite.JOBS,jobId)
      if(!live||live.status!=='pending'||Number(live.cursor)!==Number(job.cursor)||Number(live.leaseUntil||0)>Date.now())return false
      await tx.collection(suite.JOBS).doc(jobId).update({data:{leaseToken,leaseUntil:Date.now()+90000}})
      return true
    })
    if(!leased)return {success:true,status:'pending',jobId,total:job.targetIds.length,completed:job.cursor,busy:true}
    const snapshot = await suite.document(db, suite.VERSIONS, suite.versionId(job.templateId, job.version))
    if (!snapshot) throw new Error('待发布模板缺失')
    const targetIds = job.targetIds || []
    let cursor = Number(job.cursor || 0)
    const failures = []
    const skipped=[]
    let generatedCount=0
    const batchEnd = Math.min(cursor + Math.min(20,Number(options.batchSize)||3), targetIds.length)
    const scores=options.scores||await createDataService(db).playerCardsForAuthorizedPlayers(targetIds.slice(cursor,batchEnd))
    const uncached=targetIds.slice(cursor,batchEnd).filter(id=>!scores.has(String(id)))
    if(uncached.length){const fresh=await createDataService(db).playerCardsForAuthorizedPlayers(uncached);for(const [id,score] of fresh)scores.set(id,score)}
    for (; cursor < batchEnd; cursor++) {
      if(options.deadline&&Date.now()>=options.deadline)break
      const playerId = targetIds[cursor]
      try {
        const player = await suite.document(db, 'players', playerId)
        if(!player){skipped.push({playerId,reason:'record_missing'});continue}
        const score=scores.get(String(playerId))
        if(score?.status!=='ready'||!score.tier){
          if(player.playerCardFileId)throw new Error('现有成卡积分待核定，需核验后重试')
          skipped.push({playerId,reason:score?.status==='test_data_excluded'?'test_data_excluded':'grade_unverified'});continue
        }
        const type=String(player.playerCardBackgroundId||player.playerCardTier||score.tier)
        if(type!==job.tier){skipped.push({playerId,reason:'other_card_type'});continue}
        const source=await resolveSource(db,player)
        if(!source){if(player.playerCardFileId)throw new Error('现有成卡源图缺失');skipped.push({playerId,reason:'photo_missing'});continue}
        const initial=!player.playerCardFileId
        const nextVersion=Number(player.playerCardVersion||0)+(initial?1:0)
        const generated = await suite.generate(cloud, db, player, snapshot, score,{portraitFileId:source.fileId,layout:{}})
        try{await db.runTransaction(async tx=>{
          const live=await suite.document(tx,'players',playerId)
          const state=await suite.document(tx,suite.STATES,job.tier)
          if(state?.candidate?.jobId!==jobId||!live||Number(live.playerCardVersion||0)!==Number(player.playerCardVersion||0)||['name','teamId','jerseyNumber','height','weight','position','photoUrl','recentPortraitId','playerCardSourceFileId'].some(key=>String(live[key]||'')!==String(player[key]||'')))throw new Error('球员资料已更新，请重试')
          await tx.collection(suite.RENDERS).doc(suite.renderId(playerId, job.templateId, job.version)).set({ data: {
          playerId, cardTypeId:job.tier, templateId:job.templateId, publishedVersion:job.version,
          cardDataVersion:nextVersion, renderVersion:suite.RENDER_VERSION,
          fileId:generated.fileId, digest:generated.digest, status:'ready', generatedAt:db.serverDate()
          } })
          if(initial){
            await tx.collection('players').doc(playerId).update({data:{playerCardSourceFileId:source.fileId,playerCardSourceType:source.type,playerCardSourceField:source.field,playerCardFileId:generated.fileId,playerCardTier:score.tier,playerCardBackgroundId:job.tier,playerCardVersion:nextVersion,playerCardPoints:score.points,playerCardScoreVersion:score.scoreVersion,playerCardTemplateId:job.templateId,playerCardTemplateVersion:job.version,playerCardCrop:db.command.set({zoom:1,x:0,y:0}),playerCardLayout:db.command.set({}),playerCardSchemaVersion:'player-card/4',playerCardUpdatedAt:db.serverDate()}})
            await tx.collection(suite.STATES).doc(job.tier).update({data:{mutation:Number(state.mutation||0)+1}})
          }
        })}catch(error){await cloud.deleteFile({fileList:[generated.fileId]}).catch(()=>{});throw error}
        generatedCount++
      } catch (error) {
        failures.push({ playerId, reason:String(error.message||'成卡生成失败').slice(0,120) })
      }
    }
    await db.runTransaction(async tx => {
      const current = await suite.document(tx, suite.JOBS, jobId)
      if (!current || current.status !== 'pending' || Number(current.cursor) !== Number(job.cursor)||current.leaseToken!==leaseToken) throw new Error('发布进度已变化，请刷新后继续')
      await tx.collection(suite.JOBS).doc(jobId).update({ data: { cursor, leaseUntil:0,leaseToken:'', failures:[...(current.failures||[]),...failures], skipped:[...(current.skipped||[]),...skipped],generated:Number(current.generated||0)+generatedCount, updatedAt:db.serverDate() } })
    })
    return finish(jobId)
  }

  async function status(tier) {
    const state = await suite.document(db, suite.STATES, tier)
    const jobId = state?.candidate?.jobId
    if (!jobId) return { success:true, status:'idle' }
    const job = await suite.document(db, suite.JOBS, jobId)
    return job ? { success:true, status:job.failures?.length ? 'blocked' : job.status,
      jobId, total:job.targetIds?.length || 0, completed:job.cursor || 0,
      failed:job.failures?.length || 0, generated:job.generated||0, skipped:job.skipped?.length||0, failures:(job.failures||[]).slice(0,10) } :
      { success:false, status:'error', error:'发布任务记录缺失，请联系平台处理' }
  }

  async function retry(jobId) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if (!job || job.status !== 'pending' || !job.failures?.length) throw new Error('没有可重试的成卡')
    const state = await suite.document(db, suite.STATES, job.tier)
    if (state?.candidate?.jobId !== jobId) throw new Error('发布任务已失效')
    const targetIds = [...(job.targetIds||[]), ...job.failures.map(item => item.playerId)]
    await db.collection(suite.JOBS).doc(jobId).update({ data: { targetIds, failures:[], updatedAt:db.serverDate() } })
    return { success:true, status:'pending', jobId, total:targetIds.length, completed:job.cursor, failed:0 }
  }

  async function synchronizeActive(tier,userId='platform_sync'){
    const state=await suite.document(db,suite.STATES,tier)
    if(!state?.active)throw new Error('该卡种尚未发布')
    if(state.candidate)return status(tier)
    const players=await suite.publicationPlayers(db,tier)
    const row=await suite.document(db,suite.TEMPLATES,state.active.templateId)
    const jobId=crypto.randomBytes(16).toString('hex')
    await db.runTransaction(async tx=>{
      const live=await suite.document(tx,suite.STATES,tier)
      if(live.candidate||live.active.templateId!==state.active.templateId||Number(live.active.version)!==Number(state.active.version))throw new Error('模板已更新，请重试')
      await tx.collection(suite.JOBS).doc(jobId).set({data:{tier,templateId:state.active.templateId,version:Number(state.active.version),templateRevision:Number(row.revision||0),syncActive:true,targetIds:players.map(p=>String(p._id)),cursor:0,failures:[],skipped:[],generated:0,status:'pending',createdBy:userId,createdAt:db.serverDate(),updatedAt:db.serverDate()}})
      await tx.collection(suite.STATES).doc(tier).update({data:{candidate:db.command.set({jobId,...state.active}),revision:Number(live.revision||0)+1}})
    })
    return {success:true,status:'pending',jobId,total:players.length}
  }
  return { begin, advance, status, retry, synchronizeActive }
}

module.exports = { createPlayerCardPublish }
