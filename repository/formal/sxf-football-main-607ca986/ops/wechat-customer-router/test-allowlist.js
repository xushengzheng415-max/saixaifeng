'use strict'

const fs = require('fs')
const path = require('path')

class KfTestAllowlist {
  constructor(filePath) {
    this.filePath = String(filePath || '').trim()
    if (!this.filePath) throw new Error('missing_wecom_kf_test_allowlist_path')
  }

  load() {
    if (!fs.existsSync(this.filePath)) return { version: 1, entries: {} }
    let data
    try { data = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) } catch (error) { throw new Error('invalid_wecom_kf_test_allowlist') }
    if (!data || data.version !== 1 || !data.entries || typeof data.entries !== 'object') throw new Error('invalid_wecom_kf_test_allowlist')
    return data
  }

  capture(account, openKfId, externalUserId) {
    const normalizedAccount = String(account || '').trim()
    const normalizedOpenKfId = String(openKfId || '').trim()
    const normalizedExternalUserId = String(externalUserId || '').trim()
    if (!['football', 'basketball', 'event'].includes(normalizedAccount) || !normalizedOpenKfId || !normalizedExternalUserId) {
      throw new Error('invalid_wecom_kf_test_identity')
    }
    const data = this.load()
    data.entries[normalizedAccount] = {
      openKfId: normalizedOpenKfId,
      externalUserId: normalizedExternalUserId,
      capturedAt: new Date().toISOString()
    }
    const directory = path.dirname(this.filePath)
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.tmp-${process.pid}`
    fs.writeFileSync(temporaryPath, `${JSON.stringify(data)}\n`, { mode: 0o600 })
    fs.chmodSync(temporaryPath, 0o600)
    fs.renameSync(temporaryPath, this.filePath)
  }

  get(account) {
    return this.load().entries[String(account || '')] || null
  }

  summary() {
    return { accounts: Object.keys(this.load().entries).sort() }
  }
}

module.exports = { KfTestAllowlist }
