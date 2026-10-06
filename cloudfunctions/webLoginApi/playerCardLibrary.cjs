const crypto = require('node:crypto')
const suite = require('./playerCardSuite.cjs')
const preload = require('./playerCardPreload.cjs')
const LIBRARY = 'player_card_library'
const libraryId = (playerId, templateId) => crypto.createHash('sha256').update(JSON.stringify([String(playerId),String(templateId)])).digest('hex')
function tierPermission(score, tier, scopeType) {
  if(scopeType==='player')return score?.status==='test_data_excluded'?'测试资料不能生成正式卡':''
  if (score.status !== 'ready' || !score.tier) return '生涯积分待核定'
  if (tier !== score.tier && !score.canChangeBackground) return '当前等级暂不能使用此卡'
  return ''
}
function createPlayerCardLibrary({ cloud }) {
  const db = cloud.database()
  async function sync(player, score) {
    const templates = await preload.readAll(db, suite.TEMPLATES, {status:'published'})
    const grants = await preload.readAll(db, LIBRARY, {playerId:String(player._id)})
    const byTemplate = new Map(grants.map(row => [row.templateId,row]))
    const events = new Map(), result = []
    for (const template of templates) {
      // Legacy base templates continue to use the original player card flow.
      if (!template.published?.preload) continue
      const scope = preload.normalizePreload(template.published.preload)
      let grant = byTemplate.get(template._id)
      let matches = scope.type === 'platform' || (scope.type === 'team' && String(player.teamId || '') === scope.targetId) ||
        (scope.type === 'player' && String(player._id) === scope.targetId)
      if (!matches && scope.type === 'tournament') {
        if (!events.has(scope.targetId)) events.set(scope.targetId,await preload.tournamentPlayerIds(db,scope.targetId))
        matches = events.get(scope.targetId).has(String(player._id))
      }
      if (!grant && !matches) continue
      const snapshot = await suite.activeTemplate(db, template.tier, scope, template._id)
      if (!snapshot || snapshot.templateId !== template._id) continue
      if (!grant) {
        const id = libraryId(player._id,template._id)
        await db.runTransaction(async tx => {
          grant = await suite.document(tx, LIBRARY, id)
          if (!grant) {
            grant = {playerId:String(player._id),templateId:String(template._id),preload:scope,revision:0,
              grantedAt:db.serverDate(),grantSource:'published_preload',grantRuleVersion:'player-card-preload/1',grantTemplateVersion:snapshot.version,
              grantRosterEvidence:scope.type === 'tournament' ? events.get(scope.targetId)?.evidenceByPlayer?.get(String(player._id)) || [] : [],grantTeamId:String(player.teamId || '')}
            await tx.collection(LIBRARY).doc(id).set({data:grant})
          }
        })
      }
      const render = await suite.document(db,suite.RENDERS,suite.renderId(player._id,template._id,snapshot.version))
      const ready = render?.status === 'ready' && Number(render.cardDataVersion) === Number(player.playerCardVersion || 0) && Number(render.libraryRevision || 0) === Number(grant.revision || 0)
      const reason = tierPermission(score,template.tier,scope.type)
      result.push({id:libraryId(player._id,template._id),cardId:ready?String(render.cardId||render._id||suite.renderId(player._id,template._id,snapshot.version)):'',templateId:template._id,title:snapshot.title,tier:template.tier,
        preload:scope,templateVersion:snapshot.version,revision:Number(grant.revision || 0),
        status:reason ? 'locked' : ready ? 'ready' : grant.fileId ? 'pending' : 'unmade',reason,renderVersion:render?.renderVersion || suite.RENDER_VERSION,
        fileId:!reason && ready ? render.fileId : '',backgroundFileId:snapshot.backgroundFileId,
        snapshot,grant})
    }
    return result
  }
  async function list(player, score) {
    const rows = await sync(player,score)
    const ids = [...new Set(rows.flatMap(row=>[row.fileId,row.backgroundFileId]).filter(Boolean))], urls = new Map()
    for (let i=0;i<ids.length;i+=50) {
      const files = (await cloud.getTempFileURL({fileList:ids.slice(i,i+50)})).fileList || []
      for (const file of files) if (file.tempFileURL) urls.set(file.fileID,file.tempFileURL)
    }
    return rows.map(({snapshot,grant,backgroundFileId,...row})=>{
      const cardUrl=urls.get(row.fileId)||''
      return {...row,...(row.status === 'ready' && !cardUrl ? {status:'load_failed',reason:'成卡读取失败，请重新加载'} : {}),cardUrl,backgroundUrl:urls.get(backgroundFileId)||''}
    })
  }
  async function resolve(player, score, templateId) {
    const row = (await sync(player,score)).find(item=>item.templateId === String(templateId || ''))
    if (!row) throw Object.assign(new Error('此卡未添加到该球员卡库'),{code:'PLAYER_CARD_LIBRARY_FORBIDDEN'})
    if (row.reason) throw Object.assign(new Error(row.reason),{code:'PLAYER_CARD_LIBRARY_LOCKED'})
    return row
  }
  async function render(player, score, event, portrait, normalizeCrop) {
    const row = await resolve(player,score,event.templateId)
    if (Number(event.templateVersion) !== row.templateVersion) throw Object.assign(new Error('卡面已更新，请重新打开'),{code:'PLAYER_CARD_TEMPLATE_CHANGED'})
    const crop = normalizeCrop(event.crop)
    const portraitFileId = row.grant.portraitFileId && !score.canReplacePhoto ? row.grant.portraitFileId : portrait.transparentFileId
    const rendered = await suite.renderPlayer(cloud,db,player,row.snapshot,score,{crop,portraitFileId})
    return {row,crop,portraitFileId,png:rendered.png}
  }
  async function save(player, score, event, portrait, normalizeCrop, isStillOwned) {
    const revision = Number(event.expectedRevision)
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('球员卡版本无效，请重新打开')
    const generated = await render(player,score,event,portrait,normalizeCrop), row = generated.row
    if (row.revision !== revision) throw Object.assign(new Error('此卡已更新，请重新打开'),{code:'PLAYER_CARD_LIBRARY_CONFLICT'})
    const file = await cloud.uploadFile({cloudPath:`restricted/player-cards/library/${row.id}/${crypto.randomBytes(12).toString('hex')}.png`,fileContent:generated.png})
    const renderId=suite.renderId(player._id,row.templateId,row.templateVersion),digest=crypto.createHash('sha256').update(generated.png).digest('hex'),cardId=require('./playerCardHistory.cjs').cardId(renderId,digest)
    try {
      await db.runTransaction(async tx => {
        const current = await suite.document(tx,'players',player._id), grant = await suite.document(tx,LIBRARY,row.id)
        const key = preload.stateId(row.tier,row.preload,row.templateId), state = await suite.document(tx,suite.STATES,key)
        if (!current || !isStillOwned(current)) throw Object.assign(new Error('球员绑定已变化，请重新进入'),{code:'PLAYER_CARD_FORBIDDEN'})
        if (!grant || Number(grant.revision || 0) !== revision || Number(current.playerCardVersion || 0) !== Number(player.playerCardVersion || 0)) throw Object.assign(new Error('此卡或资料已更新，请重新打开'),{code:'PLAYER_CARD_LIBRARY_CONFLICT'})
        if (state?.active?.templateId !== row.templateId || Number(state.active.version) !== row.templateVersion) throw Object.assign(new Error('卡面已更新，请重新打开'),{code:'PLAYER_CARD_TEMPLATE_CHANGED'})
        const previousRender=await suite.document(tx,suite.RENDERS,renderId)
        await require('./playerCardHistory.cjs').archiveCurrentRender(tx,db,renderId,previousRender)
        await tx.collection(LIBRARY).doc(row.id).update({data:{fileId:file.fileID,crop:generated.crop,portraitFileId:generated.portraitFileId,
          revision:revision+1,templateVersion:row.templateVersion,updatedAt:db.serverDate()}})
        await tx.collection(suite.RENDERS).doc(renderId).set({data:{playerId:String(player._id),
          templateId:row.templateId,publishedVersion:row.templateVersion,cardTypeId:row.tier,fileId:file.fileID,status:'ready',
          cardDataVersion:Number(player.playerCardVersion || 0),libraryRevision:revision+1,renderVersion:suite.RENDER_VERSION,
          cardId,editRevision:Number(previousRender?.editRevision||0)+1,digest,generatedAt:db.serverDate()}})
        await tx.collection(suite.STATES).doc(key).update({data:{mutation:Number(state.mutation || 0)+1}})
      })
      return {success:true,revision:revision+1,templateId:row.templateId,cardId}
    } catch (error) { await cloud.deleteFile({fileList:[file.fileID]}).catch(()=>{});throw error }
  }
  async function select(player, score, templateId, isStillOwned) {
    const row = templateId ? await resolve(player,score,templateId) : null
    if (row && row.status !== 'ready') throw new Error('请先制作此卡，再设为展示')
    await db.runTransaction(async tx => {
      const current = await suite.document(tx,'players',player._id)
      if (!current || !isStillOwned(current)) throw Object.assign(new Error('球员绑定已变化，请重新进入'),{code:'PLAYER_CARD_FORBIDDEN'})
      if (row) {
        const state = await suite.document(tx,suite.STATES,preload.stateId(row.tier,row.preload,row.templateId))
        const render = await suite.document(tx,suite.RENDERS,suite.renderId(player._id,row.templateId,row.templateVersion))
        const grant = await suite.document(tx,LIBRARY,row.id)
        if (state?.active?.templateId !== row.templateId || Number(state.active.version) !== row.templateVersion || render?.status !== 'ready' || Number(render.libraryRevision) !== Number(grant?.revision) || Number(render.cardDataVersion) !== Number(current.playerCardVersion || 0)) throw new Error('此卡已更新，请重新打开后选择')
      } else if (!current.playerCardFileId) throw new Error('请先制作基础卡')
      await tx.collection('players').doc(String(player._id)).update({data:{playerCardDisplayTemplateId:row?.templateId || '',playerCardDisplayUpdatedAt:db.serverDate()}})
    })
    return {success:true,displayTemplateId:row?.templateId || ''}
  }
  return {list,resolve,render,save,select}
}
module.exports = {createPlayerCardLibrary,libraryId,tierPermission,LIBRARY}
