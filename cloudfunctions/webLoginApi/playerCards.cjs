const { createDataService } = require('./data-center/service.cjs')
const suite = require('./playerCardSuite.cjs')
const {createPlayerCardLibrary}=require('./playerCardLibrary.cjs')
const { makeForegroundLayer } = require('./playerCardRender.cjs')

const PHOTO_REPLACE_HONEY_COST = 100
function photoReplaceHoneyCost() {
  const raw = process.env.PLAYER_CARD_PHOTO_REPLACE_HONEY_COST
  if (raw != null && raw !== '') {
    const parsed = Number(raw)
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
  return PHOTO_REPLACE_HONEY_COST
}
function photoReplaceSummary(score) {
  const free = Boolean(score && score.canReplacePhoto)
  return { free, cost: free ? 0 : photoReplaceHoneyCost() }
}

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
// 归档档案（账号合并、重复登记留下的历史副本）不再作为独立球员展示，避免同一人出现多个页签。
// 注意：球员“移出球队”只解除归属关系、档案保持有效（见 data-center/membership.cjs），不在本判定范围内。
function archivedPlayer(player) {
  if (!player || player.deleted === true || player.isDeleted === true) return true
  if (['archived', 'deleted', 'removed'].includes(String(player.status || '').toLowerCase())) return true
  return Boolean(player.archivedAt)
}
function portraitMatchesRegistration(portrait, entry, auth) {
  if (!portrait || portrait.status !== 'confirmed') return false
  if (String(portrait.parentInvite || '') === String(entry.relation?.parentInvite || '') && portrait.parentInvite) return true
  // A registration upgrade creates a new confirmed portrait version. An older
  // submission may still be the first relation returned for the same player.
  return portrait.sourceChannel === 'service_account_h5' &&
    String(portrait.playerId || '') === String(entry.player._id || '') &&
    String(portrait.serviceAccountOpenId || '') === String(auth.openId || '') &&
    Boolean(auth.openId) && owns(entry.player, entry.relation || {})
}
function cardChangePermission(level, player, portrait, event) {
  if (!level.cardTier) return { code:'PLAYER_CARD_TIER_UNVERIFIED', error:'生涯积分待核定，请稍后重试' }
  if (String(event.tier || '') !== level.cardTier) return { code:'PLAYER_CARD_TIER_CHANGED', error:'球员卡等级已更新，请重新打开编辑器' }
  if (event.sourceData || event.mode !== 'portrait') return { code:'PLAYER_CARD_SOURCE_LOCKED', error:'球员卡只能使用登记时的标准形象照' }
  const existingPhoto = String(player.playerCardSourceFileId || '')
  const firstStandard = player.playerCardSourceType === 'legacy_roster' && portrait.sourceType !== 'legacy_roster'
  const photoReplaceRequired = Boolean((player.playerCardFileId || player.playerCardDynamic) && (!existingPhoto || existingPhoto !== String(portrait.transparentFileId)) && !firstStandard && !level.playerCard.canReplacePhoto)
  const backgroundId = String(event.backgroundId || level.cardTier)
  if (!['bronze','silver','gold'].includes(backgroundId)) return { code:'PLAYER_CARD_BACKGROUND_INVALID', error:'卡片背景不可用' }
  if (backgroundId !== level.cardTier && !level.playerCard.canChangeBackground) return { code:'PLAYER_CARD_BACKGROUND_LOCKED', error:'满 100 分或开通会员后可更换卡片背景' }
  if (photoReplaceRequired) return { backgroundId, photoReplaceRequired: true, photoReplaceCost: photoReplaceHoneyCost() }
  return { backgroundId }
}
async function cardVersionsForPlayer(cloud,db,player) {
  const playerId=String(player._id||'')
  const result=await db.collection(suite.RENDERS).where({playerId,status:'ready'}).orderBy('_id','desc').limit(100).get()
  const rows=(result.data||[]).filter(row=>row.fileId),fileIds=[...new Set(rows.map(row=>String(row.fileId)))],urls=new Map()
  const urlBatches=[]
  for(let i=0;i<fileIds.length;i+=50)urlBatches.push(fileIds.slice(i,i+50))
  const urlResults=await Promise.all(urlBatches.map(batch=>cloud.getTempFileURL({fileList:batch})))
  for(const files of urlResults)for(const item of files.fileList||[])if(item.tempFileURL)urls.set(item.fileID,item.tempFileURL)
  // Render rows share a handful of (templateId, version) pairs; resolve the
  // version snapshots once per pair in parallel instead of one serial doc get
  // per row (a 100-row history previously cost ~100 sequential reads).
  const snapshotKeys=new Map()
  for(const row of rows){const templateId=String(row.templateId||'');if(templateId)snapshotKeys.set(templateId+'#'+Number(row.publishedVersion||0),{templateId,version:Number(row.publishedVersion||0)})}
  const snapshots=new Map()
  await Promise.all([...snapshotKeys.values()].map(async item=>{
    try{snapshots.set(item.templateId+'#'+item.version,await suite.document(db,suite.VERSIONS,suite.versionId(item.templateId,item.version)))}
    catch(error){snapshots.set(item.templateId+'#'+item.version,null)}
  }))
  const cards=[]
  for(const row of rows){
    const templateId=String(row.templateId||''),version=Number(row.publishedVersion||0)
    const snapshot=templateId?(snapshots.get(templateId+'#'+version)||null):null
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
      if (!player || archivedPlayer(player) || String(player.teamId || '') !== auth.teamId) return []
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
      if (!player || archivedPlayer(player) || !owns(player, relation)) continue
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
      if (portraitMatchesRegistration(row, entry, auth)) portrait = row
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
    // 会员只放开换背景，不放开换照片；积分核定结果仍以数据中心为准，此处只做权益叠加
    let memberBackgroundUnlock = null
    async function membershipUnlocksBackground() {
      if (memberBackgroundUnlock !== null) return memberBackgroundUnlock
      memberBackgroundUnlock = auth.openId ? await require('./membership.cjs').isActiveMember(db, auth.openId) : false
      return memberBackgroundUnlock
    }
    async function withMembershipBackground(score) {
      if (!score || typeof score !== 'object') return score
      const member = await membershipUnlocksBackground()
      if (!member) return Object.assign({}, score, { membershipBackground: false })
      if (score.canChangeBackground) return Object.assign({}, score, { membershipBackground: true, backgroundUnlock: score.points >= 100 ? 'points' : 'membership' })
      return Object.assign({}, score, { canChangeBackground: true, membershipBackground: true, backgroundUnlock: 'membership' })
    }
    async function summary(entry, precomputed) {
      const p = entry.player
      const score = await withMembershipBackground(precomputed || await (deps.scoreForPlayer ? deps.scoreForPlayer(String(p._id)) : createDataService(db).playerCardForAuthorizedPlayer(String(p._id))))
      const ready = score.status === 'ready'
      return { id: String(p._id), name: p.name || '球员', teamName: entry.teamName || '', jerseyNumber: p.jerseyNumber || '', jerseyName: p.jerseyName || '', position: p.position || '', height: p.height ?? null, weight: p.weight ?? null, nationality: p.nationality || '', appearances: ready ? score.metrics.appearances : null, cardTier: ready ? score.tier : null, playerCard: score, photoReplace: photoReplaceSummary(score), cardFileId: p.playerCardFileId || '', version: Number(p.playerCardVersion || 0), mode: p.playerCardMode || 'portrait', savedTier: p.playerCardTier || '', backgroundId:p.playerCardBackgroundId || score.tier || '',displayTemplateId:p.playerCardDisplayTemplateId || '' }
    }
    if (event.action === 'listMyPlayerCards') {
      // One canonical career dataset feeds summaries and base cards for every
      // bound player; per-player reads each re-read the full match corpus.
      const cardMap = await createDataService(db).playerCardsForAuthorizedPlayers(entries.map(entry => String(entry.player._id)))
      const players = await Promise.all(entries.map(async entry => {
        const t0 = Date.now()
        const versionsPromise = cardVersionsForPlayer(cloud, db, entry.player)
        const item = await summary(entry, cardMap.get(String(entry.player._id)))
        const t1 = Date.now()
        const type = String(item.backgroundId || item.cardTier || '')
        const [baseCard] = await require('./playerCardReader.cjs').readCards(cloud, db, [{ ...entry.player, playerCardBackgroundId: type }], { baseOnly: true, scores: cardMap, dynamic: event.dynamicCardProtocol === 'player-card-dynamic/1' })
        const active = { ...baseCard, url: baseCard.cardUrl, templateVersion: baseCard.publishedVersion }
        const t2 = Date.now()
        item.cardStatus = active.status
        item.templateId = active.templateId || ''
        item.cardId = active.cardId || ''
        item.publishedVersion = active.templateVersion || 0
        item.cardDataVersion = active.cardDataVersion || 0
        item.renderVersion = active.renderVersion || ''
        item.cardScene=active.cardScene||null
        item.cardUrl = active.url || ''
        item.cardFileId = active.fileId || ''
        item.preloadedCards=await library.list(entry.player,item.playerCard,{dynamic:event.dynamicCardProtocol==='player-card-dynamic/1'})
        const t3 = Date.now()
        const displayPlayer=await require('./playerCardSeriesReader.cjs').resolveSeriesPlayer(db,entry.player,item.playerCard,suite.document)
        item.displayTemplateId=displayPlayer.playerCardDisplayTemplateId||''
        item.cardVersions=await versionsPromise
        const t4 = Date.now()
        try { console.log('[playerCards] list timing', String(entry.player.name||entry.player._id||''), JSON.stringify({summaryMs:t1-t0, baseCardMs:t2-t1, libraryMs:t3-t2, seriesPlusVersionsMs:t4-t3, totalMs:t4-t0})) } catch (e) {}
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
    if(['getMyPlayerPointsLedger','submitMyPlayerPointsAppeal','listMyPlayerPointsAppeals'].includes(event.action)){
      if(!auth.openId&&!auth.parentInvite)throw Object.assign(new Error('微信会话身份无效，请重新进入'),{code:'PLAYER_CARD_AUTH_REQUIRED'})
      const actor={actorId:'h5:'+(auth.openId||'invite:'+auth.parentInvite),playerId:String(entry.player._id),channel:'h5'},appeals=require('./data-center/points-appeals.cjs')
      if(event.action==='listMyPlayerPointsAppeals')return appeals.list(db,actor,event)
      const ledger=await createDataService(db).playerPointsLedgerForAuthorizedPlayer(actor.playerId)
      if(event.action==='getMyPlayerPointsLedger')return {success:true,player:{id:actor.playerId,name:String(entry.player.name||'')},ledger}
      return appeals.submit(db,actor,event,ledger,{...entry.player,teamName:entry.teamName})
    }
    const isStillOwned = current => entry.relation ? owns(current,entry.relation) : ['teamId','guardianUserId','linkedUserId','playerUserId'].every(field=>String(current[field]||'') === String(entry.player[field]||''))
    if (event.action === 'deleteMyPlayerCard') return library.remove(entry.player,String(event.templateId || ''),isStillOwned)
    if (['getMyPreloadedPlayerCard','previewMyPreloadedPlayerCard','saveMyPreloadedPlayerCard','selectMyPlayerCard'].includes(event.action)) {
      const level = await summary(entry)
      if (event.action === 'selectMyPlayerCard') return library.select(entry.player,level.playerCard,String(event.templateId || ''),isStillOwned)
      const row = await library.resolve(entry.player,level.playerCard,event.templateId)
      const portrait = await standardPortrait(auth,entry,db)
      if (event.action === 'getMyPreloadedPlayerCard') return {success:true,player:level,card:{cardId:row.cardId,templateId:row.templateId,title:row.title,tier:row.tier,preload:row.preload,templateVersion:row.templateVersion,revision:row.revision},cardScene:row.cardScene||null,crop:row.grant.crop || {zoom:1,x:0,y:0}}
      if (event.action === 'previewMyPreloadedPlayerCard') {const card=await require('./playerCardDynamic.cjs').descriptor(cloud,db,entry.player,row.snapshot,{...row.grant,crop:normalizeCrop(event.crop)});if(event.dynamicCardProtocol!=='player-card-dynamic/1'){const rendered=await library.render(entry.player,level.playerCard,event,portrait,normalizeCrop);return {success:true,imageData:'data:image/png;base64,'+rendered.png.toString('base64'),templateVersion:row.templateVersion}}return {success:true,...card,templateVersion:row.templateVersion}
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
        teamLogoData, cardScene:(await require('./playerCardDynamic.cjs').read(cloud,db,p,{baseOnly:true}))?.cardScene||null, standardPortraitData:'data:image/png;base64,'+source.fileContent.toString('base64'),draft: (p.playerCardFileId || p.playerCardDynamic) ? { crop: p.playerCardCrop || { zoom: 1, x: 0, y: 0 }, layout: p.playerCardLayout || null } : null }
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
      const dynamic=await require('./playerCardDynamic.cjs').descriptor(cloud,db,{...entry.player,playerCardSourceFileId:portrait.transparentFileId,playerCardCrop:crop},active);if(event.dynamicCardProtocol!=='player-card-dynamic/1'){const rendered=await suite.renderPlayer(cloud,db,entry.player,active,level.playerCard,{portraitFileId:portrait.transparentFileId,crop});return {success:true,imageData:'data:image/png;base64,'+rendered.png.toString('base64'),templateId:active.templateId,publishedVersion:active.version}}return {success:true,...dynamic,templateId:active.templateId,publishedVersion:active.version}

    }
    const expectedVersion = Number(event.expectedVersion)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('球员卡版本无效，请重新加载')
    if (expectedVersion !== Number(entry.player.playerCardVersion || 0)) return { success: false, code: 'PLAYER_CARD_CONFLICT', error: '球员卡已更新，请重新加载后编辑' }
    if (permission.photoReplaceRequired && event.confirmPhotoReplaceHoney !== true) {
      const payCost = Number(permission.photoReplaceCost) || photoReplaceHoneyCost()
      return { success: false, code: 'PLAYER_CARD_PHOTO_PAY_REQUIRED', error: '未满 100 分更换照片需消耗 ' + payCost + ' 滴蜂蜜', photoReplaceCost: payCost }
    }
    const playerId = String(entry.player._id)
    const honeyRefId = 'player-card-photo:' + playerId + ':v' + expectedVersion
    let photoReplaceCharge = null
    if (permission.photoReplaceRequired) {
      if (!auth.openId) return { success: false, code: 'PLAYER_CARD_AUTH_REQUIRED', error: '请先完成微信授权' }
      try {
        const spend = await require('./honeyWallet.cjs').spendHoney(db, auth.openId, {
          cost: permission.photoReplaceCost || photoReplaceHoneyCost(),
          reason: 'player-card-photo-replace',
          refId: honeyRefId,
          sessionId: String(event.honeySessionId || '').trim()
        })
        photoReplaceCharge = { cost: spend.cost, balance: spend.balance, deduped: spend.deduped }
      } catch (error) {
        return { success: false, error: error.message || '蜂蜜扣费失败，请重试', code: error.code || 'PLAYER_CARD_ERROR' }
      }
    }
    try {
      await db.runTransaction(async tx=>{
        const current=await suite.document(tx,'players',entry.player._id),state=await suite.document(tx,suite.STATES,backgroundId)
        if(!current || !isStillOwned(current))throw Object.assign(new Error('球员关联已变化，请重新进入'),{code:'PLAYER_CARD_FORBIDDEN'})
        if(Number(current.playerCardVersion||0)!==expectedVersion)throw Object.assign(new Error('球员卡已更新，请重新打开'),{code:'PLAYER_CARD_CONFLICT'})
        if(state?.active?.templateId!==active.templateId||Number(state.active.version)!==active.version)throw new Error('模板已更新，请重新预览')
        await tx.collection('players').doc(entry.player._id).update({data:{playerCardDynamic:true,playerCardSourceFileId:portrait.transparentFileId,playerCardSourceType:portrait.sourceType||'standard_portrait',playerCardCrop:db.command.set(crop),playerCardBackgroundId:backgroundId,playerCardBackgroundSelected:backgroundId!==level.cardTier,playerCardTier:level.cardTier,playerCardVersion:expectedVersion+1,playerCardSchemaVersion:'player-card/5',playerCardUpdatedBy:auth.openId,playerCardUpdatedAt:db.serverDate()}})
      })
    } catch (error) {
      if (photoReplaceCharge && auth.openId) {
        try {
          await require('./honeyWallet.cjs').refundHoney(db, auth.openId, {
            reason: 'player-card-photo-replace-refund',
            refId: honeyRefId,
            sessionId: String(event.honeySessionId || '').trim()
          })
        } catch (refundError) { /* 保留原失败原因，退款异常由平台按流水处理 */ }
      }
      throw error
    }
    const saved = { success:true, displayMode:'dynamic', version:expectedVersion+1, templateId:active.templateId, publishedVersion:active.version }
    if (photoReplaceCharge) saved.photoReplaceCharge = photoReplaceCharge
    return saved

  }
  return async event => {
    try { return await handler(event) } catch (error) { return { success: false, error: error.message || '球员卡保存失败，请重试', code: error.code || 'PLAYER_CARD_ERROR' } }
  }
}
module.exports = { createPlayerCards, imageBuffer, normalizeCrop, normalizeLayout, owns, portraitMatchesRegistration, cardChangePermission, cardVersionsForPlayer, PHOTO_REPLACE_HONEY_COST, photoReplaceHoneyCost, photoReplaceSummary }
