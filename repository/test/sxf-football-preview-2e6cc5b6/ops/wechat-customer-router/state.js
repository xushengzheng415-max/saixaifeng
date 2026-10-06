'use strict'

const fs = require('fs')
const path = require('path')

const PROCESSED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function emptyState() {
  return { version: 1, cursors: {}, sessions: {}, processed: {} }
}

class KfStateStore {
  constructor(filePath) {
    this.filePath = String(filePath || '').trim()
    if (!this.filePath) throw new Error('missing_wecom_kf_state_path')
    this.state = null
  }

  load() {
    if (this.state) return this.state
    if (!fs.existsSync(this.filePath)) {
      this.state = emptyState()
      return this.state
    }
    let parsed
    try { parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) } catch (error) { throw new Error('invalid_wecom_kf_state_file') }
    if (!parsed || parsed.version !== 1) throw new Error('invalid_wecom_kf_state_version')
    this.state = {
      version: 1,
      cursors: parsed.cursors && typeof parsed.cursors === 'object' ? parsed.cursors : {},
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      processed: parsed.processed && typeof parsed.processed === 'object' ? parsed.processed : {}
    }
    this.prune()
    return this.state
  }

  prune(now = Date.now()) {
    const state = this.state || this.load()
    for (const [key, value] of Object.entries(state.processed)) {
      if (!Number.isFinite(Number(value)) || now - Number(value) > PROCESSED_RETENTION_MS) delete state.processed[key]
    }
    for (const [key, value] of Object.entries(state.sessions)) {
      if (!value || !Number.isFinite(Number(value.updatedAt)) || now - Number(value.updatedAt) > SESSION_RETENTION_MS) delete state.sessions[key]
    }
  }

  getCursor(key) {
    return String(this.load().cursors[String(key || 'all')] || '')
  }

  getSessionMap() {
    const result = new Map()
    for (const [key, value] of Object.entries(this.load().sessions)) {
      if (value && value.route) result.set(key, value.route)
    }
    return result
  }

  hasProcessed(key) {
    return Object.prototype.hasOwnProperty.call(this.load().processed, String(key || ''))
  }

  markProcessed(key, now = Date.now()) {
    this.load().processed[String(key)] = now
  }

  commit(cursorKey, cursor, sessionRoutes, now = Date.now()) {
    const state = this.load()
    state.cursors[String(cursorKey || 'all')] = String(cursor || '')
    for (const [key, route] of sessionRoutes.entries()) state.sessions[key] = { route, updatedAt: now }
    this.prune(now)
    const directory = path.dirname(this.filePath)
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.filePath}.tmp-${process.pid}`
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state)}\n`, { mode: 0o600 })
    fs.renameSync(temporaryPath, this.filePath)
  }

  summary() {
    const state = this.load()
    return {
      cursorCount: Object.keys(state.cursors).length,
      sessionCount: Object.keys(state.sessions).length,
      processedCount: Object.keys(state.processed).length
    }
  }
}

module.exports = { KfStateStore }
