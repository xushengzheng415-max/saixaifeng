'use strict'
const crypto = require('crypto')
async function verify(db, ticket, now = Date.now()) {
  try {
    if (typeof ticket !== 'string' || !/^[a-f0-9]{64}$/.test(ticket)) return false
    const id = crypto.createHash('sha256').update(ticket).digest('hex')
    const result = await db.collection('auth_sessions').doc('portrait_tool_' + id).get()
    const data = Array.isArray(result.data) ? result.data[0] : result.data
    return Boolean(data && data.active === true && data.scope === 'platform-portrait-tool' && data.operatorId &&
      Number.isFinite(data.expiresAt) && data.expiresAt > now && data.expiresAt <= now + 15 * 60000)
  } catch { return false }
}
module.exports = { verify }
