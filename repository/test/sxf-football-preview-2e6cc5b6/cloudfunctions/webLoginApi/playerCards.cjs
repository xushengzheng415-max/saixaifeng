const crypto = require('node:crypto')
const { createDataService } = require('./data-center/service.cjs')

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
  const result = {}
  for (const key of ['name', 'number']) {
    const item = value && value[key] || { scale: 1, x: 0, y: 0 }
    if (![item.scale, item.x, item.y].every(Number.isFinite) || item.scale < .7 || item.scale > 1.6 || Math.abs(item.x) > 180 || Math.abs(item.y) > 140) throw new Error('文字位置无效，请重新调整')
    result[key] = { scale: item.scale, x: item.x, y: item.y }
  }
  return result
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
  if (player.playerCardFileId && (!existingPhoto || existingPhoto !== String(portrait.transparentFileId)) && !level.playerCard.canReplacePhoto) return { code:'PLAYER_CARD_PHOTO_LOCKED', error:'满 100 分后可更换球员卡照片' }
  const backgroundId = String(event.backgroundId || level.cardTier)
  if (!['bronze','silver','gold'].includes(backgroundId)) return { code:'PLAYER_CARD_BACKGROUND_INVALID', error:'卡片背景不可用' }
  if (backgroundId !== level.cardTier && !level.playerCard.canChangeBackground) return { code:'PLAYER_CARD_BACKGROUND_LOCKED', error:'满 100 分后可更换卡片背景' }
  return { backgroundId }
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
      return [{ player, relation: null, teamName: auth.teamName, teamLogo: String(team && (team.logoTransparent || team.logo || team.logoUrl) || '') }]
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
      unique.set(playerId, { player, relation, teamName: team && (team.name || team.teamName) || '', teamLogo: String(team && (team.logoTransparent || team.logo || team.logoUrl) || '') })
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
    if (!portrait || !portrait.transparentFileId) throw Object.assign(new Error('请先完成标准形象照拍摄'), { code:'PLAYER_CARD_PORTRAIT_REQUIRED' })
    return portrait
  }
  async function handler(event) {
    const db = cloud.database(), auth = await authorize(event, db), entries = await playersFor(auth, db)
    async function summary(entry) {
      const p = entry.player
      const score = await createDataService(db).playerCardForAuthorizedPlayer(String(p._id))
      const ready = score.status === 'ready'
      return { id: String(p._id), name: p.name || '球员', teamName: entry.teamName || '', jerseyNumber: p.jerseyNumber || '', jerseyName: p.jerseyName || '', position: p.position || '', height: p.height ?? null, weight: p.weight ?? null, nationality: p.nationality || '', appearances: ready ? score.metrics.appearances : null, cardTier: ready ? score.tier : null, playerCard: score, cardFileId: p.playerCardFileId || '', version: Number(p.playerCardVersion || 0), mode: p.playerCardMode || 'portrait', savedTier: p.playerCardTier || '', backgroundId:p.playerCardBackgroundId || score.tier || '' }
    }
    if (event.action === 'listMyPlayerCards') {
      const players = await Promise.all(entries.map(summary)), files = players.map(p => p.cardFileId).filter(Boolean)
      const urls = files.length ? (await cloud.getTempFileURL({ fileList: files })).fileList || [] : []
      players.forEach(p => { const file = urls.find(f => f.fileID === p.cardFileId); p.cardUrl = file && file.tempFileURL || '' })
      return { success: true, players }
    }
    const entry = entries.find(item => String(item.player._id) === String(event.playerId || auth.playerId || ''))
    if (!entry) return { success: false, code: 'PLAYER_CARD_FORBIDDEN', error: '只能编辑本人或已绑定孩子的球员卡' }
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
      return { success: true, player: await summary(entry), portraitId: String(portrait._id), standardPortraitData: 'data:image/png;base64,' + source.fileContent.toString('base64'), teamLogoData, draft: p.playerCardFileId ? { crop: p.playerCardCrop || { zoom: 1, x: 0, y: 0 }, layout: p.playerCardLayout || null } : null }
    }
    if (event.action !== 'saveMyPlayerCard') return { success: false, error: '未知球员卡操作' }
    const level = await summary(entry)
    const portrait = await standardPortrait(auth, entry, db)
    const permission = cardChangePermission(level, entry.player, portrait, event)
    if (permission.code) return { success:false, ...permission }
    const backgroundId = permission.backgroundId
    if (auth.parentInvite && String(event.portraitId || '') !== String(portrait._id)) return { success:false, code:'PLAYER_CARD_PORTRAIT_CHANGED', error:'形象照已更新，请返回确认页重新制作球员卡' }
    const card = imageBuffer(event.cardData, 2 * 1024 * 1024)
    const crop = normalizeCrop(event.crop), layout = normalizeLayout(event.layout), mode = 'portrait'
    const expectedVersion = Number(event.expectedVersion)
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('球员卡版本无效，请重新加载')
    if (expectedVersion !== Number(entry.player.playerCardVersion || 0)) return { success: false, code: 'PLAYER_CARD_CONFLICT', error: '球员卡已更新，请重新加载后编辑' }
    const key = crypto.createHash('sha256').update(String(entry.player._id)).digest('hex').slice(0, 24)
    const prefix = 'restricted/player-cards/' + key + '/' + crypto.randomBytes(12).toString('hex')
    const uploaded = []
    try {
      const cardFile = await cloud.uploadFile({ cloudPath: prefix + '/card.' + card.extension, fileContent: card.buffer }); uploaded.push(cardFile.fileID)
      await db.runTransaction(async transaction => {
        const currentResult = await transaction.collection('players').doc(String(entry.player._id)).get()
        const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data
        if (!current || (entry.relation && !owns(current, entry.relation)) || (auth.parentInvite && ['teamId', 'guardianUserId', 'linkedUserId', 'playerUserId'].some(field => String(current[field] || '') !== String(entry.player[field] || '')))) throw Object.assign(new Error('球员关联已变化，请重新加载'), { code: 'PLAYER_CARD_FORBIDDEN' })
        if (Number(current.playerCardVersion || 0) !== expectedVersion) throw Object.assign(new Error('球员卡已更新，请重新加载后编辑'), { code: 'PLAYER_CARD_CONFLICT' })
        await transaction.collection('players').doc(String(entry.player._id)).update({ data: { playerCardSourceFileId: portrait.transparentFileId, playerCardFileId: cardFile.fileID, playerCardCrop: crop, playerCardLayout: layout, playerCardMode: mode, playerCardTier: level.cardTier, playerCardBackgroundId:backgroundId, playerCardPoints:level.playerCard.points, playerCardScoreVersion:level.playerCard.scoreVersion, playerCardAppearances: level.appearances, playerCardVersion: expectedVersion + 1, playerCardSchemaVersion: 'player-card/2', playerCardUpdatedBy: auth.openId, playerCardUpdatedAt: db.serverDate() } })
      })
      return { success: true, version: expectedVersion + 1, cardFileId: cardFile.fileID }
    } catch (error) {
      if (uploaded.length) await cloud.deleteFile({ fileList: uploaded }).catch(() => {})
      throw error
    }
  }
  return async event => {
    try { return await handler(event) } catch (error) { return { success: false, error: error.message || '球员卡保存失败，请重试', code: error.code || 'PLAYER_CARD_ERROR' } }
  }
}
module.exports = { createPlayerCards, imageBuffer, normalizeCrop, normalizeLayout, owns, cardChangePermission }
