const crypto = require('node:crypto')
const { imageBuffer } = require('./playerCards.cjs')

function createAdminPlayerCards({ cloud, authenticateWebSession, buildOrganizerScope, organizerRecordAllowed, queryPlayerOfficialAppearances }) {
  return async function handle(event) {
    try {
      const auth = await authenticateWebSession(event)
      if (!auth.success) return auth
      const playerId = String(event.playerId || '').trim()
      if (!playerId) return { success: false, code: 'PLAYER_CARD_PLAYER_REQUIRED', error: '请选择球员' }
      const db = cloud.database()
      const scope = await buildOrganizerScope(db, auth.user)
      const result = await db.collection('players').doc(playerId).get()
      const player = Array.isArray(result.data) ? result.data[0] : result.data
      if (!player || !organizerRecordAllowed('players', player, scope)) {
        return { success: false, code: 'PLAYER_CARD_FORBIDDEN', error: '无权操作该球员卡' }
      }
      let appearances = null
      try { appearances = await queryPlayerOfficialAppearances(db, player) }
      catch (error) {
        if (event.action === 'saveAdminPlayerCard') throw error
        console.error('[playerCardsAdmin] card grade unavailable:', error)
      }
      const tier = Number.isSafeInteger(appearances) && appearances >= 0
        ? (appearances >= 20 ? 'gold' : appearances >= 10 ? 'silver' : 'bronze') : ''
      const cardFileId = String(player.playerCardFileId || '')
      const version = Number(player.playerCardVersion || 0)
      if (event.action === 'getAdminPlayerCard') {
        let cardUrl = ''
        if (cardFileId) {
          try {
            const files = (await cloud.getTempFileURL({ fileList: [cardFileId] })).fileList || []
            cardUrl = String(files.find(file => file.fileID === cardFileId)?.tempFileURL || '')
          } catch (error) { console.error('[playerCardsAdmin] saved card URL unavailable:', error) }
        }
        return { success: true, playerId, version, tier, appearances: tier ? appearances : null,
          cardState: cardFileId ? (cardUrl ? 'ready' : 'load_failed') : 'missing', cardUrl, savedTier: String(player.playerCardTier || '') }
      }
      if (event.action !== 'saveAdminPlayerCard') return { success: false, error: '未知球员卡操作' }
      // PC 导入名单只补齐未保存的卡；已由球员/监护人在注册端制作的卡不能覆盖。
      if (cardFileId) return { success: false, code: 'PLAYER_CARD_EXISTS', error: '该球员已有成卡，请刷新查看' }
      if (!tier) return { success: false, code: 'PLAYER_CARD_TIER_UNVERIFIED', error: '卡片等级尚未核定，暂不能保存' }
      if (String(event.tier || '') !== tier) return { success: false, code: 'PLAYER_CARD_TIER_CHANGED', error: '等级已更新，请重新加载卡片' }
      if (Number(event.expectedVersion) !== version) return { success: false, code: 'PLAYER_CARD_CONFLICT', error: '卡片已更新，请刷新查看' }
      const photo = String(player.photoFileID || player.photoFileId || player.photoUrl || player.photo || '')
      if (!photo) return { success: false, code: 'PLAYER_CARD_PORTRAIT_REQUIRED', error: '请先上传球员形象照' }
      const card = imageBuffer(event.cardData, 2 * 1024 * 1024)
      const key = crypto.createHash('sha256').update(playerId).digest('hex').slice(0, 24)
      const path = `restricted/player-cards/${key}/${crypto.randomBytes(12).toString('hex')}/card.${card.extension}`
      const uploaded = await cloud.uploadFile({ cloudPath: path, fileContent: card.buffer })
      try {
        await db.runTransaction(async transaction => {
          const currentResult = await transaction.collection('players').doc(playerId).get()
          const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
          if (!current || !organizerRecordAllowed('players', current, scope) || String(current.playerCardFileId || '') || Number(current.playerCardVersion || 0) !== version) {
            throw Object.assign(new Error('卡片已更新，请刷新查看'), { code: 'PLAYER_CARD_CONFLICT' })
          }
          await transaction.collection('players').doc(playerId).update({ data: {
            playerCardFileId: uploaded.fileID, playerCardSourceFileId: photo,
            playerCardMode: 'pc_roster', playerCardTier: tier, playerCardAppearances: appearances,
            playerCardVersion: version + 1, playerCardSchemaVersion: 'player-card/1',
            playerCardUpdatedBy: String(auth.userId || ''), playerCardUpdatedAt: db.serverDate()
          } })
        })
      } catch (error) {
        await cloud.deleteFile({ fileList: [uploaded.fileID] }).catch(() => {})
        throw error
      }
      return { success: true, playerId, version: version + 1, cardFileId: uploaded.fileID }
    } catch (error) {
      return { success: false, code: error.code || 'PLAYER_CARD_ERROR', error: error.message || '球员卡暂不可用' }
    }
  }
}

module.exports = { createAdminPlayerCards }
