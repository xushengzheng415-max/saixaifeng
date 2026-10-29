'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto')
const { PNG } = require('../cloudfunctions/aiPortraitDemo/node_modules/pngjs')
const { Command } = require('../cloudfunctions/webLoginApi/node_modules/@cloudbase/database/dist/commonjs/command')
const { UpdateSerializer } = require('../cloudfunctions/webLoginApi/node_modules/@cloudbase/database/dist/commonjs/serializer/update')
const root = path.resolve(__dirname, '..')
function load(file, deps) {
  const mod = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { module: mod, exports: mod.exports, Buffer, Date, console, process: { env: {} },
    require: name => Object.hasOwn(deps, name) ? deps[name] : require(name) }, { filename: file })
  return mod.exports
}
async function main() {
  const rows = { service_entry_sessions: { s: { active: true, phoneVerified: true, userId: 'qa-user', gateId: 'g', officialOpenId: 'qa-openid', expiresAt: new Date(Date.now() + 3600000) } }, service_follow_gates: { g: { purpose: 'player_invite_entry', status: 'active', expiresAt: new Date(Date.now() + 3600000) } }, auth_sessions: {} }
  let queue = Promise.resolve(), rejectSave = false
  const db = { command: Command, serverDate: () => new Date(),
    collection: name => ({ doc: id => ({
      get: async () => ({ data: rows[name]?.[id] ? structuredClone({ ...rows[name][id], _id: id }) : null }),
      set: async ({ data }) => { rows[name] ||= {}; rows[name][id] = structuredClone(data) },
      update: async input => {
        const data = input.data || input
        if (rejectSave && data.playerRegistrationPortraits) { rejectSave = false; throw new Error('isolated media save failure') }
        // Use the real SDK serializer. Plain object updates become dotted paths;
        // assigning those paths under a cleared null lock must fail like MongoDB.
        const encoded = UpdateSerializer.encode(data)
        for (const [field, val] of Object.entries(encoded.$set || {})) {
          const parts = field.split('.'), key = parts.pop()
          let target = rows[name][id]
          for (const part of parts) {
            if (target[part] === null) throw new Error('cannot create nested field under null')
            target = target[part] ||= {}
          }
          target[key] = structuredClone(val)
        }
      }
    }) }),
    runTransaction: fn => { const task = queue.then(() => fn(db)); queue = task.catch(() => {}); return task }
  }
  const suite = { document: async (database, table, id) => (await database.collection(table).doc(id).get()).data }
  const rendererSource = fs.readFileSync(path.join(root, 'cloudfunctions/webLoginApi/playerCardRender.cjs'), 'utf8')
  const validatorStart = rendererSource.indexOf('function isTransparentPng(buffer) {')
  const validatorEnd = rendererSource.indexOf('\n}', validatorStart) + 2
  const validate = vm.runInNewContext('(' + rendererSource.slice(validatorStart, validatorEnd) + ')', { PNG, Buffer })
  let spendCalls = 0, refundCalls = 0, balance = 500, segmentationCalls = 0, uploadCalls = 0, failSpend = false
  const ledger = new Map(), files = new Map()
  const wallet = {
    readHoney: async () => ({ balance }),
    spendHoney: async (_, __, { cost, refId }) => { if (failSpend) throw new Error('isolated wallet failure'); spendCalls++; if (ledger.has(refId)) return { balance, deduped: true }; balance -= cost; ledger.set(refId, cost); return { balance, deduped: false } },
    refundHoney: async (_, __, { refId }) => { refundCalls++; const amount = ledger.get(refId) || 0; balance += amount; ledger.delete(refId); return { balance, amount } }
  }
  const cloud = {
    uploadFile: async ({ cloudPath, fileContent }) => { uploadCalls++; const fileID = 'cloud://isolated/' + cloudPath; files.set(fileID, Buffer.from(fileContent)); return { fileID } },
    downloadFile: async ({ fileID }) => ({ fileContent: files.get(fileID) }),
    callFunction: async () => { segmentationCalls++; throw new Error('must not segment an already transparent portrait') },
    deleteFile: async ({ fileList }) => fileList.forEach(id => files.delete(id))
  }
  const media = load('cloudfunctions/webLoginApi/serviceRegistrationMedia.cjs', { './playerCardSuite.cjs': suite, './data-center/service.cjs': {}, './playerCardRender.cjs': { isTransparentPng: validate } })
  const ai = load('cloudfunctions/webLoginApi/serviceAiPortrait.cjs', { './playerCardSuite.cjs': suite, './playerCardRender.cjs': { isTransparentPng: validate }, './honeyWallet.cjs': wallet, './serviceRegistrationMedia.cjs': media })
  const generation = require('../cloudfunctions/aiPortraitDemo/registrationPortrait.cjs')
  const loaded = { session: { ...rows.service_entry_sessions.s, _id: 's' }, gate: { ...rows.service_follow_gates.g, _id: 'g' } }
  const access = await ai.prepare(db, loaded)
  const context = await generation.verify(db, access.generationTicket)
  assert.ok(context)
  rows.service_entry_sessions.s.gateId = 'other'
  assert.equal(await generation.verify(db, access.generationTicket), null)
  rows.service_entry_sessions.s.gateId = 'g'
  assert.equal(await generation.verify(db, 'f'.repeat(64)), null)
  const png = new PNG({ width: 256, height: 384 })
  let seed = 71
  for (let y = 1; y < 383; y++) for (let x = 1; x < 255; x++) {
    const i = (y * 256 + x) * 4
    for (let c = 0; c < 3; c++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; png.data[i + c] = seed >>> 24 }
    png.data[i + 3] = 255
  }
  const bytes = PNG.sync.write(png), inline = 'data:image/png;base64,' + bytes.toString('base64')
  assert.ok(inline.length > 96000)
  const app = { ...cloud, database: () => db }
  const id = await generation.save(app, context, inline, 'seedream5flash')
  const asset = rows.service_entry_sessions.s.aiGeneratedPortraits[0]
  const requestId = 'qa_transparent_request_001'
  const result = await ai.apply(cloud, db, loaded, { generatedPortraitId: id, requestId })
  assert.equal(result.fileID, asset.fileId)
  assert.deepEqual(Buffer.from(result.transparentPreview.split(',')[1], 'base64'), bytes)
  assert.equal(uploadCalls, 1)
  assert.equal(segmentationCalls, 0)
  const grantCount = Object.keys(rows.auth_sessions).length
  const originalBalance = balance
  balance = 20
  const insufficient = await ai.prepare(db, loaded)
  assert.equal(insufficient.success, false)
  assert.equal(insufficient.code, 'HONEY_INSUFFICIENT')
  assert.equal(Object.keys(rows.auth_sessions).length, grantCount)
  balance = originalBalance
  assert.equal(spendCalls, 1)
  const repeated = await ai.apply(cloud, db, loaded, { generatedPortraitId: id, requestId })
  assert.equal(repeated.portraitId, result.portraitId)
  assert.equal(spendCalls, 1)
  assert.equal(rows.service_entry_sessions.s.playerRegistrationPortraits.length, 1)
  await assert.rejects(ai.apply(cloud, db, loaded, { generatedPortraitId: 'not-owned', requestId: 'qa_not_owned_001' }), /过期/)
  assert.equal(spendCalls, 1)
  rejectSave = true
  const failed = await ai.apply(cloud, db, loaded, { generatedPortraitId: id, requestId: 'qa_fail_then_retry_001' })
  assert.equal(failed.success, false)
  assert.equal(failed.refunded, true)
  assert.equal(refundCalls, 1)
  assert.equal(rows.service_entry_sessions.s.aiPortraitApplyLock, null)
  const retry = await ai.apply(cloud, db, loaded, { generatedPortraitId: id, requestId: 'qa_fail_then_retry_001' })
  assert.equal(retry.success, true)
  assert.equal(balance, 300)
  const before = spendCalls
  const simultaneous = await Promise.allSettled([1, 2].map(() => ai.apply(cloud, db, loaded, { generatedPortraitId: id, requestId: 'qa_concurrent_save_001' })))
  assert.ok(simultaneous.some(r => r.status === 'fulfilled'))
  assert.equal(spendCalls, before + 1)
  failSpend = true
  await assert.rejects(ai.apply(cloud, db, loaded, { generatedPortraitId: id, requestId: 'qa_wallet_failure_001' }), /wallet failure/)
  assert.equal(rows.service_entry_sessions.s.aiPortraitApplyLock, null)
  assert.equal(refundCalls, 1)
  assert.equal(segmentationCalls, 0)
  // 先扣费后生成（2026-10-29 用户确认）：prepare 带 chargeFirst 时先扣蜂蜜，入库复用同一 refId 只去重。
  failSpend = false
  const chargeFirstId = 'qa_charge_first_001'
  const spendBeforeCharge = spendCalls, balanceBeforeCharge = balance
  const chargedFirst = await ai.prepare(db, loaded, { chargeFirst: true, requestId: chargeFirstId })
  assert.equal(chargedFirst.success, true)
  assert.equal(chargedFirst.charge.deduped, false)
  assert.equal(chargedFirst.charge.cost, 100)
  assert.equal(spendCalls, spendBeforeCharge + 1)
  assert.equal(balance, balanceBeforeCharge - 100)
  assert.equal(chargedFirst.aiPortrait.balance, balance)
  const chargedApply = await ai.apply(cloud, db, loaded, { generatedPortraitId: id, requestId: chargeFirstId })
  assert.equal(chargedApply.success, true)
  assert.equal(chargedApply.aiPortrait.deduped, true)
  // 入库会再调一次 spendHoney，但命中同一 refId 的幂等分支，余额不再变化
  assert.equal(balance, balanceBeforeCharge - 100)
  // 已入库的成片不允许退回，否则可以先退钱再白拿成片
  await assert.rejects(ai.refund(db, loaded, { requestId: chargeFirstId }), /已保存/)
  // 生成失败：同一 requestId 退回一次，重复调用不会多退
  const failedChargeId = 'qa_charge_first_fail_001'
  const balanceBeforeFail = balance
  const chargedFailed = await ai.prepare(db, loaded, { chargeFirst: true, requestId: failedChargeId })
  assert.equal(chargedFailed.success, true)
  assert.equal(balance, balanceBeforeFail - 100)
  const refundedOnce = await ai.refund(db, loaded, { requestId: failedChargeId })
  assert.equal(refundedOnce.success, true)
  assert.equal(refundedOnce.refunded, true)
  assert.equal(refundedOnce.refundedAmount, 100)
  assert.equal(balance, balanceBeforeFail)
  const refundedTwice = await ai.refund(db, loaded, { requestId: failedChargeId })
  assert.equal(refundedTwice.refundedAmount, 0)
  assert.equal(balance, balanceBeforeFail)
  // 余额不足时先扣费失败，不签发凭证、不写流水
  const grantsBeforeShort = Object.keys(rows.auth_sessions).length, spendBeforeShort = spendCalls
  balance = 20
  const shortCharge = await ai.prepare(db, loaded, { chargeFirst: true, requestId: 'qa_charge_first_short_001' })
  assert.equal(shortCharge.success, false)
  assert.equal(shortCharge.code, 'HONEY_INSUFFICIENT')
  assert.equal(Object.keys(rows.auth_sessions).length, grantsBeforeShort)
  assert.equal(spendCalls, spendBeforeShort)
  assert.equal(refundedTwice.success, true)
  console.log('PASS: bound registration grant, cross-session denial, >96KB server asset reference, unchanged PNG bytes/dimensions, zero duplicate segmentation/upload, single-charge retry/concurrency, save-failure refund and recovery, wallet-failure unlock, charge-first prepare/apply dedupe/refund idempotence/no grant on insufficient (isolated memory only)')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
