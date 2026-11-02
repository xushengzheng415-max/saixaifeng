'use strict'
const crypto = require('crypto')
const one = r => Array.isArray(r && r.data) ? r.data[0] : r && r.data
const time = v => new Date(v && (v.$date || v._date || v)).getTime()
async function verify(db, ticket, now = Date.now()) {
  try {
    if (!/^[a-f0-9]{64}$/.test(String(ticket || ''))) return null
    const id = crypto.createHash('sha256').update(ticket).digest('hex')
    const grant = one(await db.collection('auth_sessions').doc('portrait_registration_' + id).get())
    if (!grant || grant.scope !== 'registration-portrait' || grant.active !== true || !(grant.expiresAt > now)) return null
    const session = one(await db.collection('service_entry_sessions').doc(grant.sessionId).get())
    if (!session || !session.active || session.phoneVerified !== true || !(time(session.expiresAt) > now) ||
      session.userId !== grant.userId || session.gateId !== grant.gateId || session.officialOpenId !== grant.officialOpenId) return null
    const gate = one(await db.collection('service_follow_gates').doc(grant.gateId).get())
    if (!gate || gate.purpose !== 'player_invite_entry' || gate.status !== 'active' || !(time(gate.expiresAt) > now)) return null
    return { sessionId: grant.sessionId, gateId: grant.gateId, userId: grant.userId, officialOpenId: grant.officialOpenId }
  } catch { return null }
}
async function save(app, context, inline, model) {
  if (!/^data:image\/png;base64,/.test(inline)) throw new Error('未获得透明 PNG，请重新生成')
  const id = crypto.randomBytes(16).toString('hex')
  const prefix = crypto.createHash('sha256').update(context.sessionId).digest('hex').slice(0, 24)
  const file = await app.uploadFile({ cloudPath: 'restricted/service-player-portraits/' + prefix + '/ai-' + id + '.png', fileContent: Buffer.from(inline.split(',')[1], 'base64') })
  try {
    const db = app.database()
    await db.runTransaction(async tx => {
      const session = one(await tx.collection('service_entry_sessions').doc(context.sessionId).get())
      if (!session || !session.active || session.phoneVerified !== true || session.officialOpenId !== context.officialOpenId || session.userId !== context.userId || session.gateId !== context.gateId || !(time(session.expiresAt) > Date.now())) throw new Error('登记会话已变化，请重新打开')
      const gate = one(await tx.collection('service_follow_gates').doc(context.gateId).get())
      if (!gate || gate.status !== 'active' || gate.purpose !== 'player_invite_entry' || !(time(gate.expiresAt) > Date.now())) throw new Error('登记入口已过期，请重新扫码')
      const assets = Array.isArray(session.aiGeneratedPortraits) ? session.aiGeneratedPortraits : []
      await tx.collection('service_entry_sessions').doc(context.sessionId).update({ aiGeneratedPortraits: db.command.set([...assets.slice(-4), { id, fileId: file.fileID, model, expiresAt: Date.now() + 2 * 60 * 60 * 1000 }]) })
    })
    return id
  } catch (error) {
    await app.deleteFile({ fileList: [file.fileID] })
    throw error
  }
}
module.exports = { verify, save }
