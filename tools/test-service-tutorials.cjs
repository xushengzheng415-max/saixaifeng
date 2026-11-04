'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const tutorials = require('../cloudfunctions/manageTournamentCenterContent/tutorials.cjs')
const publicRead = require('../cloudfunctions/webLoginApi/serviceTutorial.cjs')
const tables = new Map()
function table(name) { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name) }
function value(row, key) { return key.split('.').reduce((v, k) => v?.[k], row) }
function collection(name, where = {}, skip = 0, limit = 100, order = '') {
  const rows = () => [...table(name).values()].filter(r => Object.entries(where).every(([key, v]) => v instanceof RegExp ? v.test(value(r, key)) : v?.gt ? value(r, key) > v.gt : value(r, key) === v)).sort((a, b) => order ? +new Date(b[order]) - +new Date(a[order]) : 0)
  return {
    where: w => collection(name, w, skip, limit, order), skip: s => collection(name, where, s, limit, order), limit: n => collection(name, where, skip, n, order), orderBy: k => collection(name, where, skip, limit, k),
    get: async () => ({ data: structuredClone(rows().slice(skip, skip + limit)) }), count: async () => ({ total: rows().length }),
    add: async ({ data }) => { const id = 'audit-' + table(name).size; table(name).set(id, { ...structuredClone(data), _id: id }); return { _id: id } },
    doc: id => ({ get: async () => ({ data: structuredClone(table(name).get(id) || null) }), set: async ({ data }) => { table(name).set(id, { ...structuredClone(data), _id: id }) }, update: async ({ data }) => { assert.ok(table(name).has(id)); table(name).set(id, { ...table(name).get(id), ...structuredClone(data) }) } })
  }
}
const db = { collection, serverDate: () => new Date(), RegExp: ({ regexp, options }) => new RegExp(regexp, options), command: { gt: date => ({ gt: date }) }, runTransaction: async work => work(db) }
const cloud = { database: () => db, init() {}, getTempFileURL: async ({ fileList }) => ({ fileList: fileList.map(fileID => ({ fileID, tempFileURL: 'https://example.com/tutorial.png' })) }), callFunction: async () => { throw new Error('Unexpected notification in offline test') } }
const owner = { _id: 'platform-owner' }
const draft = { title: '验收用：更换照片', category: '照片与图片', audience: '服务号H5', intro: '仅用于离线测试', steps: [{ title: '选择图片', text: '测试步骤，不代表实际产品入口。', image: 'cloud://test/screenshot.png' }] }
function loadManager() {
  const file = path.resolve(__dirname, '../cloudfunctions/manageTournamentCenterContent/index.js'), exports = {}
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { exports, require: id => id === 'wx-server-sdk' ? cloud : require(require.resolve(id, { paths: [path.dirname(file)] })), console: { ...console, error() {} }, process: { env: {} }, Buffer, Date, setTimeout, clearTimeout }, { filename: file })
  return exports.main
}
async function backendTests() {
  const manager = loadManager()
  let r = await manager({ action: 'tutorialSave', content: draft }); assert.equal(r.success, false, 'anonymous cannot write')
  table('auth_sessions').set('staff', { tokenHash: require('crypto').createHash('sha256').update('staff').digest('hex'), active: true, expiresAt: new Date(Date.now() + 3600000), userId: 'staff' })
  table('users').set('staff', { _id: 'staff', isPlatformOwner: false })
  r = await manager({ action: 'tutorialSave', __authToken: 'staff', content: draft }); assert.equal(r.success, false, 'staff cannot write')
  table('auth_sessions').set('owner', { tokenHash: require('crypto').createHash('sha256').update('owner').digest('hex'), active: true, expiresAt: new Date(Date.now() + 3600000), principalType: 'platform_owner', channel: 'platform_password' })
  r = await manager({ action: 'tutorialSave', __authToken: 'owner', content: draft }); assert.equal(r.success, true); const id = r.id
  assert.equal((await publicRead(cloud, { id })).success, false, 'draft is private')
  assert.equal((await tutorials.list(db, { publishedOnly: true }, cloud)).total, 0)
  await assert.rejects(() => tutorials.references(db, [id]), /下架/)
  await tutorials.save(db, { id, revision: 1, mode: 'publish', content: draft }, owner)
  r = await publicRead(cloud, { id }); assert.equal(r.success, true); assert.equal(r.article.steps[0].image, 'https://example.com/tutorial.png'); assert.equal(r.article.updatedBy, undefined); assert.equal(r.article.draft, undefined)
  await tutorials.save(db, { id, revision: 2, mode: 'draft', content: { ...draft, title: '未发布的改动' } }, owner)
  assert.equal((await publicRead(cloud, { id })).article.title, draft.title, 'draft edit preserves published content')
  assert.equal((await tutorials.list(db, { publishedOnly: true, keyword: '更换' }, cloud)).total, 1, 'picker searches published title')
  await assert.rejects(() => tutorials.save(db, { id, revision: 2, content: draft }, owner), /已被更新/)
  await assert.rejects(() => tutorials.references(db, [id, id, id, id]), /最多/)
  assert.throws(() => tutorials.content({ ...draft, steps: [{ title: 'x', text: 'x', image: 'javascript:alert(1)' }] }, true), /图片地址/)
  assert.throws(() => tutorials.content({ ...draft, steps: [] }, true), /补全/)
  table('service_feedback').set('feedback-test', { _id: 'feedback-test', userId: 'customer', content: '测试反馈', status: 'pending' })
  r = await manager({ action: 'serviceFeedbackReply', __authToken: 'owner', feedbackId: 'feedback-test', reply: '请查看教程', tutorialIds: [id] }); assert.equal(r.success, true)
  assert.equal(table('service_feedback').get('feedback-test').replyTutorials[0].title, draft.title)
  await tutorials.save(db, { id, revision: 3, mode: 'withdraw' }, owner)
  assert.equal((await publicRead(cloud, { id })).success, false)
  r = await manager({ action: 'serviceFeedbackReply', __authToken: 'owner', feedbackId: 'feedback-test', reply: '不应保存', tutorialIds: [id] }); assert.equal(r.success, false)
  assert.equal(table('service_feedback').get('feedback-test').reply, '请查看教程', 'unavailable reference cannot overwrite reply')
  assert.equal((await publicRead(cloud, { id: '../private' })).success, false)
  assert.equal(table('platform_content_audit_logs').size, 5)
  console.log('PASS: authentication, draft isolation, publication, revision conflicts, public projection, image resolution, reference validation, reply persistence, withdrawal, audit')
}
backendTests().catch(e => { console.error(e); process.exitCode = 1 })
