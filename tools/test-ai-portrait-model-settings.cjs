'use strict'
const assert = require('node:assert/strict')
process.env.TOKENHUB_API_KEY = 'offline-tokenhub'
process.env.ARK_API_KEY = 'offline-ark'
process.env.BV_API_KEY = 'offline-vod'
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')
const sourcePath = path.resolve(__dirname, '../cloudfunctions/aiPortraitDemo/index.js')
const localRequire = createRequire(sourcePath)
const moduleStub = { exports: {} }
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), {
  module: moduleStub, exports: moduleStub.exports, process, Buffer, console,
  require: name => name === '@cloudbase/node-sdk' ? { init: () => { throw new Error('unexpected network call in model test') } } : localRequire(name)
}, { filename: sourcePath })
const { __modelInternals: m, main } = moduleStub.exports
const sessions = require('../cloudfunctions/aiPortraitDemo/adminSession.cjs')
async function run() {
  const setting = m.defaultModelSetting()
  assert.equal(setting.models.hunyuan35.enabled, false)
  setting.models.hunyuan35.enabled = true
  setting.models.seedream5flash.enabled = true
  setting.defaultModel = 'hunyuan35'
  assert.equal(m.resolveModel(setting, '').key, 'hunyuan35')
  assert.equal(m.resolveModel(setting, 'seedream45').key, 'seedream45')
  assert.equal(m.resolveModel(setting, 'seedream5flash').key, 'seedream5flash')
  assert.equal(m.listModels(setting).length, 3)
  setting.allowUserChoice = false
  assert.equal(m.resolveModel(setting, 'seedream45').key, 'hunyuan35')
  setting.models.hunyuan35.enabled = false
  assert.equal(m.resolveModel(setting, '').key, '')
  setting.allowUserChoice = true
  assert.equal(m.resolveModel(setting, 'hunyuan35').key, '')
  assert.equal(m.resolveModel(setting, 'unknown').key, '')
  const ticket = 'a'.repeat(64)
  const wanted = 'portrait_tool_' + require('crypto').createHash('sha256').update(ticket).digest('hex')
  const db = { collection: () => ({ doc: id => ({ get: async () => ({ data: id === wanted ? { scope: 'platform-portrait-tool', active: true, operatorId: 'fixture-owner', expiresAt: 901000 } : null }) }) }) }
  assert.equal(await sessions.verify(db, ticket, 1001), true)
  assert.equal(await sessions.verify(db, 'b'.repeat(64), 1001), false)
  assert.equal(await sessions.verify(db, ticket, 901001), false)
  const ownerSource = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/platformOwner/index.js'), 'utf8')
  const start = ownerSource.indexOf("    if (action === 'createAiPortraitToolSession')")
  const end = ownerSource.indexOf('\n    if (', start + 6)
  const issue = new (Object.getPrototypeOf(async function() {}).constructor)('db', 'user', 'requireOwner', 'require', "const action='createAiPortraitToolSession';\n" + ownerSource.slice(start, end))
  const documents = new Map()
  const ownerDb = { serverDate: () => new Date(), collection: name => {
    assert.equal(name, 'auth_sessions')
    return { doc: id => ({ set: async ({ data }) => documents.set(id, data), get: async () => ({ data: documents.get(id) }) }) }
  } }
  await assert.rejects(issue(ownerDb, {}, async () => { throw new Error('forbidden') }, require), /forbidden/)
  assert.equal(documents.size, 0)
  const issued = await issue(ownerDb, { _id: 'fixture-owner' }, async () => {}, require)
  assert.equal(issued.ticket.length, 64)
  assert.equal(documents.size, 1)
  assert.equal(await sessions.verify(ownerDb, issued.ticket), true)
  const stored = [...documents.values()][0]
  assert.equal(stored.principalType, 'portrait_tool')
  assert.equal(JSON.stringify(stored).includes(issued.ticket), false)
  stored.active = false
  assert.equal(await sessions.verify(ownerDb, issued.ticket), false)
  for (const body of [{ action: 'adminCreateSession' }, { action: 'adminToolGenerate' }, { action: 'prepareReference', bytes: 1000 }, { transparentOutput: true }]) {
    const response = await main({ httpMethod: 'POST', body: JSON.stringify(body), headers: { host: 'www.sxffootball.cn' } })
    assert.equal(response.statusCode, 403)
  }
  for (const body of ['', '{broken-json', JSON.stringify({ action: 'unsupported' })]) {
    const response = await main({ httpMethod: 'POST', body, headers: { host: 'www.sxffootball.cn' } })
    assert.equal(response.statusCode, 400)
  }
  for (const action of ['registrationGenerate', 'registrationPrepare', 'registrationCancel']) {
    const noRegistrationGrant = await main({ httpMethod: 'POST', body: JSON.stringify({ action }) })
    assert.equal(noRegistrationGrant.statusCode, 403)
  }
  console.log('PASS: three configured models, selected/default dispatch, platform-only mode, disabled/unknown rejection, admin ticket scope/expiry, all public admin-tool entrypoints denied')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
