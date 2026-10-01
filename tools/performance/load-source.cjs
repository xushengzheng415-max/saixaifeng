'use strict'
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const baseline = process.env.SXF_READ_BASELINE || '1b046eb41e528e967a8fc7b4cdcf79bf85da963e'

function loadSource(functionName, db, before = false, complete = false) {
  const relative = `cloudfunctions/${functionName}/index.js`
  let source = before ? execFileSync('git', ['show', `${baseline}:${relative}`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, relative), 'utf8')
  if (before && complete) {
    if (functionName === 'webLoginApi') {
      const start = source.indexOf('async function getPublicTournamentCenter()'), end = source.indexOf('function newsResultOfficial', start)
      const body = source.slice(start,end).replace(/await db\.collection\('([^']+)'\)(?:\.where\(([^\n]+)\))?\.limit\([^\n]+?\)\.get\(\)/g, (all,name,where) => `({data:await require('./data-center/reader.cjs').readAll(db,'${name}',${where || '{}'})})`)
        .replace(/await db\.collection\('publication_snapshots'\)\s*\.where\(([^\n]+)\)\s*\.limit\(200\)\s*\.get\(\)/g, (all,where) => `({data:await require('./data-center/reader.cjs').readAll(db,'publication_snapshots',${where})})`)
      source = source.slice(0,start) + body + source.slice(end)
    } else {
      source = source.replace('const result = await query.limit(limit || 100).get()', "const result = {data:await require('./data-center/reader.cjs').readAll(db,collection,where || {})}")
      source = source.replace('return limit ? merged.slice(0, limit) : merged', 'return merged')
    }
  }
  const localRequire = createRequire(path.join(root, relative))
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: 'synthetic-openid' }) }
  const sandbox = { require: id => id === 'wx-server-sdk' ? cloud : id === 'nodemailer' ? {} : localRequire(id), console: { log() {}, warn() {}, error() {} }, process: { env: {} }, Buffer, URL, setTimeout, clearTimeout, exports: {} }
  const append = functionName === 'webLoginApi' ? `
    ensureUserOrgId = async (db, user) => user;
    authenticateWebSession = async event => event._testAuth || ({ success: true, user: event._testUser, userId: event._testUser._id });
    exports.hooks = { buildOrganizerScope, organizerRecordAllowed, handleDbQuery, getPublicTournamentCenter, main: exports.main };
  ` : `exports.hooks = { loadTeams, safeGetPlayersForTeams, safeGetTeamPlayers, loadTeamPlayersForWorkspace, main:exports.main, setOverviewIdentity(identity, workspaces) { findCurrentUser = async () => identity; loadWorkspaceCatalog = async () => workspaces; } };`
  vm.runInNewContext(source + append, sandbox, { filename: relative })
  return sandbox.exports.hooks
}
module.exports = { root, baseline, loadSource }
