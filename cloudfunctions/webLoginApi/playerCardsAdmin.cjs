const { createDataService } = require('./data-center/service.cjs')
const suite = require('./playerCardSuite.cjs')
const { normalizeCrop, normalizeLayout } = require('./playerCards.cjs')

function createAdminPlayerCards({ cloud, authenticateWebSession, buildOrganizerScope, organizerRecordAllowed, queryPlayerOfficialAppearances }) {
  return async function handle(event) {
    try {
      const auth = await authenticateWebSession(event)
      if (!auth.success) return auth
      const playerId = String(event.playerId || '').trim()
      if (!playerId) return { success: false, code: 'PLAYER_CARD_PLAYER_REQUIRED', error: '请选择球员' }
      const db = cloud.database()
      const owner = auth.principalType === 'platform_owner' && auth.user?.isPlatformOwner === true
      const scope = owner ? null : await buildOrganizerScope(db, auth.user)
      const result = await db.collection('players').doc(playerId).get()
      const player = Array.isArray(result.data) ? result.data[0] : result.data
      if (!player || (!owner && !organizerRecordAllowed('players', player, scope))) {
        return { success: false, code: 'PLAYER_CARD_FORBIDDEN', error: '无权操作该球员卡' }
      }
      let score = null
      try { score = await createDataService(db).playerCardForAuthorizedPlayer(playerId) }
      catch (error) {
        if (event.action === 'saveAdminPlayerCard') throw error
        console.error('[playerCardsAdmin] card grade unavailable:', error)
      }
      const tier = score?.status === 'ready' ? score.tier : ''
      const appearances = tier ? score.metrics.appearances : null
      const cardFileId = String(player.playerCardFileId || '')
      const version = Number(player.playerCardVersion || 0)
      if (event.action === 'getAdminPlayerCard') {
        const card = await suite.signedCard(cloud, db, player, String(player.playerCardBackgroundId || player.playerCardTier || tier),{dynamic:event.dynamicCardProtocol==='player-card-dynamic/1'})
        return { success: true, playerId, version, tier, appearances: tier ? appearances : null,
          cardState: card.status === 'ready' ? 'ready' : card.status === 'pending' ? 'pending' : 'missing',
          cardScene:card.cardScene||null,cardUrl:card.url || '', cardId:card.cardId || '', publishedVersion:card.templateVersion || 0, savedTier: String(player.playerCardTier || '') }
      }
      if (event.action !== 'saveAdminPlayerCard') return { success: false, error: '未知球员卡操作' }
      // PC 导入名单只补齐未保存的卡；已由球员/监护人在注册端制作的卡不能覆盖。
      if (cardFileId) return { success: false, code: 'PLAYER_CARD_EXISTS', error: '该球员已有成卡，请刷新查看' }
      if (!tier) return { success: false, code: 'PLAYER_CARD_TIER_UNVERIFIED', error: '卡片等级尚未核定，暂不能保存' }
      if (String(event.tier || '') !== tier) return { success: false, code: 'PLAYER_CARD_TIER_CHANGED', error: '等级已更新，请重新加载卡片' }
      if (Number(event.expectedVersion) !== version) return { success: false, code: 'PLAYER_CARD_CONFLICT', error: '卡片已更新，请刷新查看' }
      const source=await require('./playerCardSource.cjs').resolveSource(db,player)
      const photo=source?.fileId||''
      if (!photo) return { success: false, code: 'PLAYER_CARD_PORTRAIT_REQUIRED', error: '请先补齐球员照片' }
      const snapshot = await suite.activeTemplate(db, tier)
      if (!snapshot) return { success:false, code:'PLAYER_CARD_TEMPLATE_UNAVAILABLE', error:'卡种尚未发布' }
      const crop = normalizeCrop(event.crop || { zoom:1,x:0,y:0 })
      const layout = normalizeLayout(event.layout)
      await db.runTransaction(async tx=>{
        const current=await suite.document(tx,'players',playerId),state=await suite.document(tx,suite.STATES,tier)
        if(!current||(!owner&&!organizerRecordAllowed('players',current,scope))||Number(current.playerCardVersion||0)!==version||current.playerCardDynamic)throw new Error('球员卡或权限已变化，请刷新')
        if(state?.active?.templateId!==snapshot.templateId||Number(state.active.version)!==snapshot.version)throw new Error('模板已更新，请刷新')
        await tx.collection('players').doc(playerId).update({data:{playerCardDynamic:true,playerCardSourceFileId:photo,playerCardSourceType:source.type,playerCardCrop:db.command.set(crop),playerCardTier:tier,playerCardBackgroundId:tier,playerCardVersion:version+1,playerCardSchemaVersion:'player-card/5',playerCardUpdatedBy:auth.userId,playerCardUpdatedAt:db.serverDate()}})
      })
      return {success:true,displayMode:'dynamic',playerId,version:version+1,templateId:snapshot.templateId,publishedVersion:snapshot.version}

    } catch (error) {
      return { success: false, code: error.code || 'PLAYER_CARD_ERROR', error: error.message || '球员卡暂不可用' }
    }
  }
}

module.exports = { createAdminPlayerCards }
