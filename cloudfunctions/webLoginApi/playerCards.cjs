const { createDataService } = require('./data-center/service.cjs')
const suite = require('./playerCardSuite.cjs')
const {createPlayerCardLibrary}=require('./playerCardLibrary.cjs')
const { makeForegroundLayer } = require('./playerCardRender.cjs')

function imageBuffer(value, limit) {
  const match = String(value || '').match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new Error('照片格式错误，请重新选择')
  const buffer = Buffer.from(match[2], 'base64')
  const valid = match[1] === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
  if (!valid || buffer.length < 16 || buffer.length > limit) throw new Error('照片无效或过大，请重新选择')
  return { buffer, extension: match[1] === 'png' ? 'png' : 'jpg', data: String(value) }
}
function normalizeCrop(value) {
  const crop = value || {}
  if (![crop.zoom, crop.x, crop.y].every(Number.isFinite) || crop.zoom < 1 || crop.zoom > 4 || Math.abs(crop.x) > 10 || Math.abs(crop.y) > 10) throw new Error('照片位置无效，请重新调整')
  return { zoom: crop.zoom, x: crop.x, y: crop.y }
}
function normalizeLayout(value) {
  if (value && Object.values(value).some(item => Number(item?.x||0)!==0 || Number(item?.y||0)!==0 || Number(item?.scale||1)!==1)) throw new Error('文字版式由平台统一设置')
  return {}
}

function owns(player, relation) {
  const owner = String(relation.registrantUserId || '')
  return Boolean(owner && (relation.registrantType === 'self' ? [player.linkedUserId, player.playerUserId].map(String).includes(owner) : String(player.guardianUserId || '') === owner))
}
function cardChangePermission(level, player, portrait, event) {
  if (!level.cardTier) return { code:'PLAYER_CARD_TIER_UNVERIFIED', error:'生涯积分待核定，请稍后重试' }
  if (String(event.tier || '') !== level.cardTier) return { code:'PLAYER_CARD_TIER_CHANGED', error:'球员卡等级已更新，请重新打开编辑器' }
  if (event.sourceData || event.mode !== 'portrait') return { code:'PLAYER_CARD_SOURCE_LOCKED', error:'球员卡只能使用登记时的标准形象照' }
  const existingPhoto = String(player.playerCardSourceFileId || '')
  const firstStandard = player.playerCardSourceType === 'legacy_roster' && portrait.sourceType !== 'legacy_roster'
  if (player.playerCardFileId && (!existingPhoto || existingPhoto !== String(portrait.transparentFileId)) && !firstStandard && !level.playerCard.canReplacePhoto) return { code:'PLAYER_CARD_PHOTO_LOCKED', error:'满 100 分后可更换球员卡照片' }
  const backgroundId = String(event.backgroundId || level.cardTier)
  if (!['bronze','silver','gold'].includes(backgroundId)) return { code:'PLAYER_CARD_BACKGROUND_INVALID', error:'卡片背景不可用' }
  if (backgroundId !== level.cardTier && !level.playerCard.canChangeBackground) return { code:'PLAYER_CARD_BACKGROUND_LOCKED', error:'满 100 分后可更换卡片背景' }
  return { backgroundId }
}
async function cardVersionsForPlayer(cloud,db,player) {
  const playerId=String(player._id||'')
  const result=await db.collection(suite.RENDERS).where({playerId,status:'ready'}).orderBy('_id','desc').limit(100).get()
  const rows=(result.data||[]).filter(row=>row.fileId),fileIds=[...new Set(rows.map(row=>String(row.fileId)))],urls=new Map()
  for(let i=0;i<fileIds.length;i+=50){const files=await cloud.getTempFileURL({fileList:fileIds.slice(i,i+50)});for(const item of files.fileList||[])if(item.tempFileURL)urls.set(item.fileID,item.tempFileURL)}
  const cards=[]
  for(const row of rows){
    const templateId=String(row.templateId||''),version=Number(row.publishedVersion||0)
    const snapshot=templateId?await suite.document(db,suite.VERSIONS,suite.versionId(templateId,version)):null
    cards.push({cardId:String(row.cardId||row._id),renderId:String(row._id),playerId,cardUrl:urls.get(String(row.fileId))||'',
      title:String(snapshot?.title||'球员卡'),cardTypeId:String(row.cardTypeId||''),templateId,publishedVersion:version,
      cardDataVersion:Number(row.cardDataVersion||0),editRevision:Number(row.editRevision||0),isHistory:Boolean(row.isSnapshot),generatedAt:row.generatedAt||null})
  }
  return cards
}
function createPlayerCards(deps) {
  const { cloud, authenticateParentH5Session, previewParentProfileInvite, hashSessionToken, dateValue } = deps
  async function readAll(db, collection, where) {
    const rows = []; let after = ''
    for (;;) {
      const query = Object.assign({}, where, after ? { _id: db.command.gt(after) } : {})
      const page = (await db.collection(collection).where(query).orderBy('_id', 'asc').limit(100).get()).data || []
      if (!page.length) return rows
      rows.push(...page); if (rows.length > 1000) throw new Error('关联球员过多，请联系平台处理')
      after = String(page[page.length - 1]._id)
    }
  }
  async function authorize(event, db) {
    if (event.parentSessionToken) {
      const auth = await authenticateParentH5Session(event)
      if (!auth.success) throw Object.assign(new Error(auth.error || '登记会话已失效'), { code: auth.code || 'PLAYER_CARD_AUTH_REQUIRED' })
      const preview = await previewParentProfileInvite({ parentInvite: auth.session.parentInvite })
      if (!preview.success) throw new Error(preview.error || '登记邀请已失效')
      const invites = (await db.collection('parent_profile_invites').where({ token: auth.session.parentInvite, status: 'active' }).limit(2).get()).data || []
      if (invites.length !== 1 || !invites[0].playerId) throw new Error('登记邀请已失效，请重新进入')
      return { parentInvite: auth.session.parentInvite, openId: auth.session.serviceAccountOpenId, playerId: String(invites[0].playerId), teamId: String(invites[0].teamId || ''), teamName: preview.data.teamName }
    }
    const token = String(event.fanSessionToken || '')
    if (!token) throw Object.assign(new Error('请先完成微信授权'), { code: 'PLAYER_CARD_AUTH_REQUIRED' })
    const sessions = (await db.collection('fan_h5_sessions').where({ tokenHash: hashSessionToken(token), active: true }).limit(2).get()).data || []
    if (sessions.length !== 1 || dateValue(sessions[0].expiresAt) <= Date.now()) throw Object.assign(new Error('微信会话已失效，请重新进入'), { code: 'PLAYER_CARD_AUTH_REQUIRED' })
    return { openId: String(sessions[0].serviceAccountOpenId || '') }
  }
  async function playersFor(auth, db) {
    if (auth.playerId) {
      const result = await db.collection('players').doc(auth.playerId).get()
      const player = Array.isArray(result.data) ? result.data[0] : result.data
      if (!player || String(player.teamId || '') !== auth.teamId) return []
      const teamResult = await db.collection('teams').doc(auth.teamId).get()
      const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
      return [{ player, relation: null, teamName: auth.teamName, teamLogo: require('./playerCardSource.cjs').teamLogoFileId(team) }]
    }
    const submissions = await readAll(db, 'parent_profile_submissions', { serviceAccountOpenId: auth.openId, status: 'submitted' })
    const unique = new Map()
    for (const relation of submissions) {
      const playerId = String(relation.playerId || ''); if (!playerId || unique.has(playerId)) continue
      const result = await db.collection('players').doc(playerId).get()
      const player = Array.isArray(result.data) ? result.data[0] : result.data
      if (!player || !owns(player, relation)) continue
      const teamResult = player.teamId ? await db.collection('teams').doc(String(player.teamId)).get() : { data: null }
      const team = Array.isArray(teamResult.data) ? teamResult.data[0] : teamResult.data
      unique.set(playerId, { player, relation, teamName: team && (team.name || team.teamName) || '', teamLogo: require('./playerCardSource.cjs').teamLogoFileId(team) })
    }
    return Array.from(unique.values())
  }
  async function standardPortrait(auth, entry, db) {
    let portrait = null
    if (auth.parentInvite) {
      const rows = await readAll(db, 'parent_portraits', { parentInvite: auth.parentInvite })
      portrait = rows.filter(row => ['ready_for_confirmation', 'confirmed'].includes(String(row.status || '')) && String(row.serviceAccountOpenId || '') === String(auth.openId || '')).sort((a,b) => Number(b.version || 0) - Number(a.version || 0))[0] || null
    } else if (entry.player.recentPortraitId) {
      const result = await db.collection('parent_portraits').doc(String(entry.player.recentPortraitId)).get()
      const row = Array.isArray(result.data) ? result.data[0] : result.data
      if (row && row.status === 'confirmed' && String(row.parentInvite || '') === String(entry.relation && entry.relation.parentInvite || '')) portrait = row
    }
    if (!portrait || !portrait.transparentFileId) {
      const source=await require('./playerCardSource.cjs').resolveSource(db,entry.player)
      if(source?.type==='legacy_roster')return {_id:'legacy_roster',transparentFileId:source.fileId,sourceType:'legacy_roster'}
      throw Object.assign(new Error('请先完成标准形象照拍摄'), { code:'PLAYER_CARD_PORTRAIT_REQUIRED' })
    }
    return portrait
  }
  async function activeTemplates(db) {
    const snapshots = (await Promise.all(suite.TYPES.map(type => suite.activeTemplate(db,type)))).filter(Boolean)
    return Object.fromEntries(snapshots.map(item => [item.cardTypeId,{templateId:item.templateId,version:item.version,title:item.title}]))
  }
  const library=createPlayerCardLibrary({cloud})
  async function handler(event) {
    const db = cloud.database(), auth = await authorize(event, db), entries = await playersFor(auth, db)
    async function summary(entry) {
      const p = entry.player
      const score = await (deps.scoreForPlayer ? deps.scoreForPlayer(String(p._id)) : createDataService(db).playerCardForAuthorizedPlayer(String(p._id)))
      const ready = score.status === 'ready'
      return { id: String(p._id), name: p.name || '球员', teamName: entry.teamName || '', jerseyNumber: p.jerseyNumber || '', jerseyName: p.jerseyName || '', position: p.position || '', height: p.height ?? null, weight: p.weight ?? null, nationality: p.nationality || '', appearances: ready ? score.metrics.appearances : null, cardTier: ready ? score.tier : null, playerCard: score, cardFileId: p.playerCardFileId || '', version: Number(p.playerCardVersion || 0), mode: p.playerCardMode || 'portrait', savedTier: p.playerCardTier || '', backgroundId:p.playerCardBackgroundId || score.tier || '',displayTemplateId:p.playerCardDisplayTemplateId || '' }
    }
    if (event.action === 'listMyPlayerCards') {
      const players = await Promise.all(entries.map(async entry => {
        const item = await summary(entry)
        const type = String(item.backgroundId || item.cardTier || '')
        const active = await (deps.readBaseCard ? deps.readBaseCard(entry.player,type) : suite.signedCard(cloud, db, entry.player, type))
        item.cardStatus = active.status
        item.templateId = active.templateId || ''
        item.cardId = active.cardId || ''
        item.publishedVersion = active.templateVersion || 0
        item.cardDataVersion = active.cardDataVersion || 0
        item.renderVersion = active.renderVersion || ''
        item.cardUrl = active.url || ''
        item.cardFileId = active.fileId || ''
        item.preloadedCards=await library.list(entry.player,item.playerCard)
        item.cardVersions=await cardVersionsForPlayer(cloud,db,entry.player)
        const currentCardIds=new Set([item.cardId,...item.preloadedCards.filter(card=>card.status==='ready').map(card=>card.cardId)].filter(Boolean))
        item.cardVersions.forEach(card=>{card.isCurrent=currentCardIds.has(card.cardId)})
        const display=item.preloadedCards.find(card=>card.templateId === item.displayTemplateId && card.status === 'ready')
        item.displayCardUrl=display?.cardUrl || '';item.displayCardId=display?.cardId || '';item.displayState=!item.displayTemplateId?'base':display?'ready':'unavailable'
        return item
      }))
      return { success: true, players }
    }
    const entry = entries.find(item => String(item.player._id) === String(event.playerId || auth.playerId || ''))
    if (!entry) return { success: false, code: 'PLAYER_CARD_FORBIDDEN', error: '只能编辑本人或已绑定孩子的球员卡' }
    const isStillOwned = current => entry.relation ? owns(current,entry.relation) : ['teamId','guardianUserId','linkedUserId','playerUserId'].every(field=>String(current[field]||'') === String(entry.player[field]||''))
    if (['getMyPreloadedPlayerCard','previewMyPreloadedPlayerCard','saveMyPreloadedPlayerCard','selectMyPlayerCard'].includes(event.action)) {
      const level = await summary(entry)
      if (event.action === 'selectMyPlayerCard') return library.select(entry.player,level.playerCard,String(event.templateId || ''),isStillOwned)
      const row = await library.resolve(entry.player,level.playerCard,event.templateId)
      const portrait = await standardPortrait(auth,entry,db)
      if (event.action === 'getMyPreloadedPlayerCard') return {success:true,player:level,card:{cardId:row.cardId,templateId:row.templateId,title:row.title,tier:row.tier,preload:row.preload,templateVersion:row.templateVersion,revision:row.revision},crop:row.grant.crop || {zoom:1,x:0,y:0}}
      if (event.action === 'previewMyPreloadedPlayerCard') {
        const generated = await library.render(entry.player,level.playerCard,event,portrait,normalizeCrop)
        return {success:true,imageData:'data:image/png;base64,'+generated.png.toString('base64'),cardId:generated.row.cardId,templateVersion:generated.row.templateVersion}
      }
      return library.save(entry.player,level.playerCard,event,portrait,normalizeCrop,isStillOwned)
    }
    if (event.action === 'getMyPlayerCard') {
      const p = entry.player
      const portrait = await standardPortrait(auth, entry, db)
      const source = await cloud.downloadFile({ fileID: portrait.transparentFileId })
      if (!source.fileContent || source.fileContent.length > 5 * 1024 * 1024) throw new Error('标准形象照过大，请重新生成')
      let teamLogoData = ''
      if (entry.teamLogo.startsWith('cloud://')) {
        try {
          const logo = await cloud.downloadFile({ fileID: entry.teamLogo })
          if (logo.fileContent && logo.fileContent.length <= 1024 * 1024) {
            const b = logo.fileContent, mime = b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : (b[0] === 255 && b[1] === 216 ? 'jpeg' : '')
            if (mime) teamLogoData = 'data:image/' + mime + ';base64,' + b.toString('base64')
          }
        } catch (error) { teamLogoData = '' }
      }
      return { success: true, player: await summary(entry), templates:await activeTemplates(db),
        portraitId: String(portrait._id), portraitAvailable:true,
        teamLogoData, draft: p.playerCardFileId ? { crop: p.playerCardCrop || { zoom: 1, x: 0, y: 0 }, layout: p.playerCardLayout || null } : null }
    }
    if (!['previewMyPlayerCard','saveMyPlayerCard'].includes(event.action)) return { success: false, error: '未知球员卡操作' }
    const level = await summary(entry)
    const portrait = await standardPortrait(auth, entry, db)
    const permission = cardChangePermission(level, entry.player, portrait, event)
    if (permission.code) return { success:false, ...permission }
    const backgroundId = permission.backgroundId
    if (auth.parentInvite && String(event.portraitId || '') !== String(portrait._id)) return { success:false, code:'PLAYER_CARD_PORTRAIT_CHANGED', error:'形象照已更新，请返回确认页重新制作球员卡' }
    const crop = normalizeCrop(event.crop), layout = normalizeLayout(event.layout), mode = 'portrait'
    const active = await suite.activeTemplate(db, backgroundId)
    if (!active) return { success:false, code:'PLAYER_CARD_TEMPLATE_UNAVAILABLE', error:'该卡种尚未发布，请稍后重试' }
    if (event.expectedTemplateId && (String(event.expectedTemplateId)!==String(active.templateId) || Number(event.expectedTemplateVersion)!==Number(active.version))) return {success:false,code:'PLAYER_CARD_TEMPLATE_CHANGED',error:'球员卡模板已更新，请重新打开编辑器'}
    if (event.action === 'previewMyPlayerCard') {
      const rendered = await suite.renderPlayer(cloud, db, entry.player, active, level.playerCard,
        { portraitFileId:portrait.transparentFileId, crop, layout })
      return { success:true, imageData:'data:image/png;base64,' + rendered.png.toString('base64'),
        templateId:active.templateId, publishedVersion:active.version }
    }
    const expectedVersion = Number(event.expectedVersion)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('球员卡版本无效，请重新加载')
    if (expectedVersion !== Number(entry.player.playerCardVersion || 0)) return { success: false, code: 'PLAYER_CARD_CONFLICT', error: '球员卡已更新，请重新加载后编辑' }
    const uploaded = []
    try {
      const generated = await suite.generate(cloud, db, entry.player, active, level.playerCard,
        { portraitFileId:portrait.transparentFileId, crop, layout })
      uploaded.push(generated.fileId)
      const renderId=suite.renderId(entry.player._id,active.templateId,active.version),cardId=require('./playerCardHistory.cjs').cardId(renderId,generated.digest)
      await db.runTransaction(async transaction => {
        const currentResult = await transaction.collection('players').doc(String(entry.player._id)).get()
        const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
        if (!current || (entry.relation && !owns(current, entry.relation)) || (auth.parentInvite && ['teamId', 'guardianUserId', 'linkedUserId', 'playerUserId'].some(field => String(current[field] || '') !== String(entry.player[field] || '')))) throw Object.assign(new Error('球员关联已变化，请重新加载'), { code: 'PLAYER_CARD_FORBIDDEN' })
        if (Number(current.playerCardVersion || 0) !== expectedVersion) throw Object.assign(new Error('球员卡已更新，请重新加载后编辑'), { code: 'PLAYER_CARD_CONFLICT' })
        const state = await suite.document(transaction, suite.STATES, backgroundId)
        if (!state?.active || state.active.templateId !== active.templateId || Number(state.active.version) !== active.version) {
          throw Object.assign(new Error('球员卡模板已更新，请重新打开编辑器'), { code:'PLAYER_CARD_TEMPLATE_CHANGED' })
        }
        const previousRender=await suite.document(transaction,suite.RENDERS,renderId)
        await require('./playerCardHistory.cjs').archiveCurrentRender(transaction,db,renderId,previousRender)
        await transaction.collection(suite.RENDERS).doc(renderId).set({ data: {
          playerId:String(entry.player._id), cardTypeId:backgroundId, templateId:active.templateId,
          publishedVersion:active.version, cardDataVersion:expectedVersion+1, renderVersion:suite.RENDER_VERSION,
          cardId,editRevision:Number(previousRender?.editRevision||0)+1,fileId:generated.fileId, digest:generated.digest, status:'ready', generatedAt:db.serverDate()
        } })
        await transaction.collection(suite.STATES).doc(backgroundId).update({ data: {
          mutation:Number(state.mutation||0)+1, updatedAt:db.serverDate()
        } })
        await transaction.collection('players').doc(String(entry.player._id)).update({ data: { playerCardSourceFileId: portrait.transparentFileId, playerCardSourceType: portrait.sourceType || 'standard_portrait', playerCardFileId: generated.fileId, playerCardCrop: db.command.set(crop), playerCardLayout: db.command.set(layout), playerCardMode: mode, playerCardTier: level.cardTier, playerCardBackgroundId:backgroundId, playerCardPoints:level.playerCard.points, playerCardScoreVersion:level.playerCard.scoreVersion, playerCardAppearances: level.appearances, playerCardVersion: expectedVersion + 1, playerCardSchemaVersion: 'player-card/3', playerCardTemplateId:active.templateId, playerCardTemplateVersion:active.version, playerCardUpdatedBy: auth.openId, playerCardUpdatedAt: db.serverDate() } })
      })
      return { success: true, version: expectedVersion + 1, cardFileId: generated.fileId,cardId,
        templateId:active.templateId, publishedVersion:active.version, renderVersion:suite.RENDER_VERSION }
    } catch (error) {
      if (uploaded.length) await cloud.deleteFile({ fileList: uploaded }).catch(() => {})
      throw error
    }
  }
  return async event => {
    try { return await handler(event) } catch (error) { return { success: false, error: error.message || '球员卡保存失败，请重试', code: error.code || 'PLAYER_CARD_ERROR' } }
  }
}
module.exports = { createPlayerCards, imageBuffer, normalizeCrop, normalizeLayout, owns, cardChangePermission, cardVersionsForPlayer }
