'use strict'
// 卡面「AI 定妆照」的生图凭证校验与成片保存。
// 与 registrationPortrait.cjs 平行，但作用域独立：
//   - 凭证来自 webLoginApi 的 cardPortraitAi.prepare（scope = card-portrait）。
//   - 成片只写回该凭证文档的 assets，不写登记会话、不写 parent_portraits；
//     真正生效由 webLoginApi 的 apply 在校验归属后写球员卡面素材。
const crypto = require('crypto')
const one = r => Array.isArray(r && r.data) ? r.data[0] : r && r.data

async function verify(db, ticket, now = Date.now()) {
  try {
    if (!/^[a-f0-9]{64}$/.test(String(ticket || ''))) return null
    const ticketId = 'portrait_card_' + crypto.createHash('sha256').update(ticket).digest('hex')
    const grant = one(await db.collection('auth_sessions').doc(ticketId).get())
    if (!grant || grant.scope !== 'card-portrait' || grant.active !== true || !(grant.expiresAt > now)) return null
    if (!grant.playerId || !grant.userId) return null
    const player = one(await db.collection('players').doc(String(grant.playerId)).get())
    if (!player) return null
    const owners = [player.linkedUserId, player.playerUserId, player.guardianUserId].map(value => String(value || ''))
    if (!owners.includes(String(grant.userId))) return null
    return {
      ticketId,
      userId: String(grant.userId),
      officialOpenId: String(grant.officialOpenId || ''),
      playerId: String(grant.playerId),
      requestId: String(grant.requestId || '')
    }
  } catch (error) {
    return null
  }
}

async function save(app, context, inline, model) {
  if (!/^data:image\/png;base64,/.test(inline)) throw new Error('未获得透明 PNG，请重新生成')
  const id = crypto.randomBytes(16).toString('hex')
  const prefix = crypto.createHash('sha256').update(context.playerId + '|' + context.userId).digest('hex').slice(0, 24)
  const file = await app.uploadFile({
    cloudPath: 'restricted/player-card-portraits/' + prefix + '/ai-' + id + '.png',
    fileContent: Buffer.from(inline.split(',')[1], 'base64')
  })
  try {
    const db = app.database()
    await db.runTransaction(async tx => {
      const grant = one(await tx.collection('auth_sessions').doc(context.ticketId).get())
      if (!grant || grant.active !== true || !(grant.expiresAt > Date.now())) throw new Error('AI 定妆照凭证已过期，请重新生成')
      if (String(grant.playerId || '') !== context.playerId || String(grant.userId || '') !== context.userId) throw new Error('AI 定妆照凭证与当前球员不一致，请重新生成')
      const assets = Array.isArray(grant.assets) ? grant.assets : []
      await tx.collection('auth_sessions').doc(context.ticketId).update({
        assets: db.command.set([...assets.slice(-2), { id, fileId: file.fileID, model, requestId: context.requestId, expiresAt: Date.now() + 2 * 60 * 60 * 1000 }])
      })
    })
    return id
  } catch (error) {
    await app.deleteFile({ fileList: [file.fileID] })
    throw error
  }
}

module.exports = { verify, save }
