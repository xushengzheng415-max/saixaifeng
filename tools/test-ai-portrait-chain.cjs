'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const upload = require('../cloudfunctions/aiPortraitDemo/referenceUpload.cjs')
const jpeg = require('../cloudfunctions/aiPortraitDemo/node_modules/jpeg-js')

async function main() {
  const fileID = 'cloud://test.bucket/ai-portrait-reference/' + 'a'.repeat(32) + '.jpg'
  const secret = 'offline-test-secret'
  const now = Date.now()
  const ticket = upload.ticketFor(fileID, secret, now)
  assert.equal(upload.readTicket(ticket, secret, now), fileID)
  const owned = upload.ticketFor(fileID, secret, now, 'fixture-registration')
  assert.equal(upload.readTicket(owned, secret, now, 'fixture-registration'), fileID)
  assert.throws(() => upload.readTicket(owned, secret, now, 'other-registration'))
  assert.throws(() => upload.readTicket(owned, secret, now))
  assert.throws(() => upload.readTicket(ticket, secret, now, 'fixture-registration'))
  assert.throws(() => upload.readTicket(ticket, 'other-secret', now))
  assert.throws(() => upload.readTicket(ticket, secret, now + 600001))
  assert.throws(() => upload.readTicket(upload.ticketFor('cloud://test.bucket/private/photo.jpg', secret, now), secret, now))
  let removed = []
  const raw = Buffer.alloc(16 * 16 * 4, 255)
  const data = Buffer.from(jpeg.encode({ data: raw, width: 16, height: 16 }, 94).data)
  const app = {
    getFileInfo: async () => ({ fileList: [{ code: 'SUCCESS', size: data.length }] }),
    downloadFile: async () => ({ fileContent: data }),
    deleteFile: async ({ fileList }) => { removed.push(...fileList) }
  }
  const ref = await upload.consume(app, secret, ticket)
  assert.deepEqual(Buffer.from(ref.split(',')[1], 'base64'), data)
  assert.deepEqual(removed, [fileID])
  app.getFileInfo = async () => ({ fileList: [{ code: 'SUCCESS', size: upload.MAX_BYTES + 1 }] })
  app.downloadFile = async () => { throw new Error('must not download oversized reference') }
  await assert.rejects(upload.consume(app, secret, ticket), /大小/)
  assert.equal(removed.length, 2)
  await assert.rejects(upload.initiate({}, secret, upload.MAX_BYTES + 1))

  const html = fs.readFileSync(path.join(root, 'service-account-h5/ai-portrait-demo.html'), 'utf8')
  let script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  const el = () => ({ style: {}, value: '', textContent: '', className: '', appendChild() {}, addEventListener() {}, setAttribute() {}, getAttribute() {}, querySelectorAll() { return [] } })
  const context = { Promise, console, fetch: async () => ({ json: async () => ({ success: false }) }), document: { getElementById: el, createElement: el }, window: { addEventListener() {} } }
  script = script.replace(/\}\)\(\)\s*$/, 'globalThis.testHooks = { trimWatermark, uploadReference }; })()')
  vm.runInNewContext(script, context)
  // No canvas, decode, crop, or recompression may happen when there is no watermark.
  assert.equal(await context.testHooks.trimWatermark('data:image/jpeg;base64,untouched', false), 'data:image/jpeg;base64,untouched')
  assert.match(html, /trimWatermark\(src, data.watermark === 'trim'\)/)
  assert.match(html, /\[2048, 0\.94\]/)
  assert.match(html, /referenceTicket: referenceTicket/)
  assert.match(html, /preserveOriginal: true/)
  assert.match(html, /transparentOutput: true/)
  assert.match(html, /stamp \+ '\.png'/)
  assert.doesNotMatch(html, /@cloudbase\/js-sdk/)
  const calls = []
  context.fetch = async (url, options) => {
    calls.push({ url, options })
    if (String(url).startsWith('data:')) return { blob: async () => ({ size: 300000 }) }
    if (url === '/aiPortraitDemo') return { json: async () => ({ success: true, data: { url: 'https://storage.test/one.jpg', headers: { authorization: 'one-object-only' }, ticket: 'test-ticket' } }) }
    return { ok: true }
  }
  assert.equal(await context.testHooks.uploadReference('data:image/jpeg;base64,test'), 'test-ticket')
  assert.equal(JSON.parse(calls[1].options.body).bytes, 300000)
  assert.equal(calls[2].options.method, 'PUT')
  assert.equal(calls[2].options.body.size, 300000)
  const transparent = require('../cloudfunctions/aiPortraitDemo/transparentPortrait.cjs')
  const { PNG } = require('../cloudfunctions/aiPortraitDemo/node_modules/pngjs')
  const original = { width: 16, height: 16, data: Buffer.alloc(16 * 16 * 4, 255) }
  const mask = { width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4) }
  for (let y = 1; y < 7; y++) for (let x = 1; x < 7; x++) mask.data[(y * 8 + x) * 4 + 3] = 255
  original.data[(8 * 16 + 8) * 4] = 71
  const masked = transparent.applyMask(original, mask)
  assert.equal(masked.width, 16)
  assert.equal(masked.height, 16)
  assert.equal(masked.data[3], 0)
  assert.equal(masked.data[(8 * 16 + 8) * 4], 71)
  assert.equal(masked.data[(8 * 16 + 8) * 4 + 3], 255)
  // White fabric inside the person must stay opaque; alpha comes from segmentation, not RGB whiteness.
  assert.equal(masked.data[(7 * 16 + 7) * 4], 255)
  assert.equal(masked.data[(7 * 16 + 7) * 4 + 3], 255)
  assert.throws(() => transparent.applyMask(original, original), /透明通道/)
  const pngMask = PNG.sync.write(mask).toString('base64')
  const rendered = await transparent.render(data, 'image/jpeg', {
    callFunction: async () => ({ result: { success: true, personNum: 1, data: pngMask } })
  }, () => original, () => {})
  const decoded = PNG.sync.read(Buffer.from(rendered.inline.split(',')[1], 'base64'))
  assert.equal(decoded.width, 16)
  assert.equal(decoded.data[3], 0)
  assert.equal(decoded.data[(8 * 16 + 8) * 4], 71)
  await assert.rejects(transparent.render(data, 'image/jpeg', {
    callFunction: async () => ({ result: { success: true, type: 'labelmap', data: pngMask } })
  }, () => original, () => {}), /抠图未完成/)
  console.log('PASS: signed reference scope/expiry/tamper, byte-preserving upload, oversized rejection, cleanup, no-watermark no-op, HD browser upload and small JSON')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
