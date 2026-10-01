const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { renderCard } = require('./playerCardRender.cjs')
const { createDataService } = require('./data-center/service.cjs')
const suite = require('./playerCardSuite.cjs')
const preload = require('./playerCardPreload.cjs')

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
      badges: row.draft.badges, createdAt: db.serverDate(), createdBy: userId }
    const [backgroundBuffer, maskBuffer] = await Promise.all([suite.asset(cloud,snapshot.backgroundFileId,2*1024*1024),suite.asset(cloud,snapshot.maskFileId,2*1024*1024)])
    const preview = renderCard({ backgroundBuffer,maskBuffer,portraitBuffer:fs.readFileSync(path.join(__dirname,'player-card-preview-portrait.png')),template:snapshot,
      player:{name:'示例球员',jerseyNumber:'10',position:'FW',jerseyName:'SAMPLE',height:178,weight:72,nationality:'中国'} })
    snapshot.previewDigest = crypto.createHash('sha256').update(preview).digest('hex')
    const players = await suite.savedPlayers(db, tier, scope, row.draft?.preload ? row._id : undefined)
    const jobId = crypto.randomBytes(16).toString('hex')
    if (await suite.document(db, suite.VERSIONS, snapshot._id)) throw new Error('此草稿已创建发布版本，请继续原发布任务')
    const job = { _id: jobId, tier, stateId:key, preload:scope, additive:Boolean(row.draft?.preload), templateId: row._id, version, templateRevision: revision,
      targetIds: players.map(p => String(p._id)), cursor: 0, failures: [], status: 'pending',
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
    return players.length ? { success:true, status:'pending', jobId, total:players.length, completed:0, failed:0 } : finish(jobId)
  }

  async function finish(jobId) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if (!job || job.status !== 'pending') throw new Error('发布任务已失效')
    if (job.failures?.length) return { success:false, status:'blocked', jobId,
      total:job.targetIds.length, completed:job.cursor, failed:job.failures.length, failures:job.failures.slice(0, 10) }
    if (job.cursor < job.targetIds.length) return { success:true, status:'pending', jobId,
      total:job.targetIds.length, completed:job.cursor, failed:0 }
    const stateBeforeScan = await suite.document(db, suite.STATES, job.stateId || job.tier)
    const currentPlayers = await suite.savedPlayers(db, job.tier, job.preload, job.additive ? job.templateId : undefined)
    const missing = []
    for (const player of currentPlayers) {
      const render = await suite.document(db, suite.RENDERS, suite.renderId(player._id, job.templateId, job.version))
      if (!render || render.status !== 'ready' || Number(render.cardDataVersion) !== Number(player.playerCardVersion || 0) || (job.additive && Number(render.libraryRevision || 0) !== Number(player.preloadLibraryVersion || 0))) {
        missing.push(String(player._id))
      }
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
      const state = await suite.document(tx, suite.STATES, job.stateId || job.tier)
      const row = await suite.document(tx, suite.TEMPLATES, job.templateId)
      if (!state?.candidate || state.candidate.jobId !== jobId ||
          Number(state.mutation || 0) !== Number(stateBeforeScan?.mutation || 0) ||
          !row || Number(row.revision || 0) !== Number(job.templateRevision)) throw new Error('发布状态已变化，请重新核对')
      const snapshot = await suite.document(tx, suite.VERSIONS, suite.versionId(job.templateId, job.version))
      if (!snapshot) throw new Error('待发布模板缺失')
      await tx.collection(suite.STATES).doc(job.stateId || job.tier).update({ data: {
        active: db.command.set({ templateId: job.templateId, version: job.version }), candidate: null,
        revision: Number(state.revision || 0) + 1, activatedAt: db.serverDate(), activatedBy: job.createdBy
      } })
      await tx.collection(suite.TEMPLATES).doc(job.templateId).update({ data: {
        published: db.command.set({ title:snapshot.title, backgroundFileId:snapshot.backgroundFileId,
          maskFileId:snapshot.maskFileId, preload:preload.normalizePreload(snapshot.preload), layout:snapshot.layout, photo:snapshot.photo, badges:snapshot.badges }),
        publishedVersion:job.version, status:'published', revision:Number(row.revision||0)+1,
        publishedAt:db.serverDate(), publishedBy:job.createdBy, updateAt:db.serverDate()
      } })
      await tx.collection(suite.JOBS).doc(jobId).update({ data: { status:'active',
        completedAt:db.serverDate(), updatedAt:db.serverDate() } })
    })
    return { success:true, status:'active', jobId, templateId:job.templateId,
      publishedVersion:job.version, affected:currentPlayers.length, failed:0 }
  }

  async function advance(jobId) {
    const job = await suite.document(db, suite.JOBS, jobId)
    if (!job || job.status !== 'pending') throw new Error('发布任务已失效')
    if(!job.additive) return basePublisher.advance(jobId)
    if (job.failures?.length) return finish(jobId)
    const snapshot = await suite.document(db, suite.VERSIONS, suite.versionId(job.templateId, job.version))
    if (!snapshot) throw new Error('待发布模板缺失')
    const targetIds = job.targetIds || []
    let cursor = Number(job.cursor || 0)
    const failures = []
    const batchEnd = Math.min(cursor + 3, targetIds.length)
    for (; cursor < batchEnd; cursor++) {
      const playerId = targetIds[cursor]
      try {
        const player = await suite.document(db, 'players', playerId)
        if (!player) continue
        const grant = job.additive ? await suite.document(db, 'player_card_library', require('./playerCardLibrary.cjs').libraryId(playerId,job.templateId)) : null
        if (job.additive && !grant?.fileId) continue
        if (!job.additive && !player.playerCardFileId) continue
        if (grant) { player.playerCardSourceFileId = grant.portraitFileId; player.playerCardCrop = grant.crop }
        const score = await (scoreForPlayer ? scoreForPlayer(playerId) : createDataService(db).playerCardForAuthorizedPlayer(playerId))
        const generated = await suite.generate(cloud, db, player, snapshot, score)
        await db.collection(suite.RENDERS).doc(suite.renderId(playerId, job.templateId, job.version)).set({ data: {
          playerId, cardTypeId:job.tier, templateId:job.templateId, publishedVersion:job.version,
          cardDataVersion:Number(player.playerCardVersion||0), libraryRevision:Number(grant?.revision||0), renderVersion:suite.RENDER_VERSION,
          fileId:generated.fileId, digest:generated.digest, status:'ready', generatedAt:db.serverDate()
        } })
      } catch (error) {
        failures.push({ playerId, reason:String(error.message||'成卡生成失败').slice(0,120) })
      }
    }
    await db.runTransaction(async tx => {
      const current = await suite.document(tx, suite.JOBS, jobId)
      if (!current || current.status !== 'pending' || Number(current.cursor) !== Number(job.cursor)) throw new Error('发布进度已变化，请刷新后继续')
      await tx.collection(suite.JOBS).doc(jobId).update({ data: { cursor, failures:[...(current.failures||[]),...failures], updatedAt:db.serverDate() } })
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
      failed:job.failures?.length || 0, failures:(job.failures||[]).slice(0,10) } :
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
    return { success:true, status:'pending', jobId, total:targetIds.length, completed:job.cursor, failed:0 }
  }

  return { begin, advance, status, retry }
}

module.exports = { createPlayerCardPublish }
