'use strict'
// 阶段 1–2 补充自测：球员卡源解析（playerCardSource.cjs）。
// 使用脱敏 parent_portraits 数据验证 recentPortraitId 关联、status==='confirmed'、
// 历史 roster 照片回退与非法文件地址过滤，不读取真实用户照片、不连接生产。
const assert = require('assert')
const path = require('path')
const { createDb } = require('./test-support/cloudbase-mock.cjs')

const root = path.resolve(__dirname, '..', 'cloudfunctions', 'webLoginApi')
const source = require(path.join(root, 'playerCardSource.cjs'))

const PREFIX = 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/'
const CDN = 'https://636c-cloud1-7g8ckb3c7815a011-1419431905.cos.ap-shanghai.myqcloud.com/'

function seed() {
  return {
    // 脱敏数据：不含姓名、openId、真实文件内容，只验证字段关联。
    players: [
      { _id: 'p-confirmed', name: '测试甲', recentPortraitId: 'portrait-confirmed' },
      { _id: 'p-pending', name: '测试乙', recentPortraitId: 'portrait-pending' },
      { _id: 'p-missing', name: '测试丙', recentPortraitId: 'portrait-missing' },
      { _id: 'p-direct', name: '测试丁', playerCardSourceFileId: PREFIX + 'card/source-direct.png' },
      { _id: 'p-legacy', name: '测试戊', photoFileID: CDN + 'card/legacy-photo.png' },
      { _id: 'p-none', name: '测试己' }
    ],
    parent_portraits: [
      { _id: 'portrait-confirmed', status: 'confirmed', transparentFileId: PREFIX + 'portrait/confirmed.png', parentInvite: 'invite-demo' },
      { _id: 'portrait-pending', status: 'pending', transparentFileId: PREFIX + 'portrait/pending.png' }
    ]
  }
}

function db() {
  return createDb(seed(), { existing: ['players', 'parent_portraits'] }).db
}

async function testConfirmedPortraitAsync() {
  const result = await source.resolveSource(db(), { _id: 'p-confirmed', recentPortraitId: 'portrait-confirmed' })
  assert.strictEqual(result.type, 'standard_portrait')
  assert.strictEqual(result.field, 'recentPortraitId')
  assert.strictEqual(result.fileId, PREFIX + 'portrait/confirmed.png')
}

async function testNotConfirmed() {
  const result = await source.resolveSource(db(), { _id: 'p-pending', recentPortraitId: 'portrait-pending' })
  assert.strictEqual(result, null, '未确认形象照不得作为卡面源')
}

async function testMissingPortrait() {
  const result = await source.resolveSource(db(), { _id: 'p-missing', recentPortraitId: 'portrait-missing' })
  assert.strictEqual(result, null, '照片文档不存在时不得抛错')
}

async function testDirectSource() {
  const result = await source.resolveSource(db(), { _id: 'p-direct', playerCardSourceFileId: PREFIX + 'card/source-direct.png' })
  assert.strictEqual(result.type, 'standard_portrait')
  assert.strictEqual(result.field, 'playerCardSourceFileId')
}

async function testLegacyRoster() {
  const result = await source.resolveSource(db(), { _id: 'p-legacy', photoFileID: CDN + 'card/legacy-photo.png' })
  assert.strictEqual(result.type, 'legacy_roster')
  assert.strictEqual(result.fileId, PREFIX + 'card/legacy-photo.png')
}

async function testNoSource() {
  const result = await source.resolveSource(db(), { _id: 'p-none' })
  assert.strictEqual(result, null)
}

function testPermanentFile() {
  assert.strictEqual(source.permanentFile(PREFIX + 'a.png'), PREFIX + 'a.png')
  assert.strictEqual(source.permanentFile(CDN + 'dir/a%20b.png'), PREFIX + 'dir/a b.png')
  assert.strictEqual(source.permanentFile('https://evil.example.com/a.png'), '')
  assert.strictEqual(source.permanentFile('https://636c-cloud1-7g8ckb3c7815a011-1419431905.tcb.qcloud.la/dir/%2e%2e%2fa.png'), '')
}

function testTeamLogo() {
  assert.strictEqual(source.teamLogoFileId({ logoTransparent: CDN + 'team/logo.png' }), PREFIX + 'team/logo.png')
  assert.strictEqual(source.teamLogoFileId({ logoFileId: { fileID: PREFIX + 'team/logo-2.png' } }), PREFIX + 'team/logo-2.png')
  assert.strictEqual(source.teamLogoFileId({}), '')
}

async function main() {
  await testConfirmedPortraitAsync()
  await testNotConfirmed()
  await testMissingPortrait()
  await testDirectSource()
  await testLegacyRoster()
  await testNoSource()
  testPermanentFile()
  testTeamLogo()
  console.log('PASS test-player-card-source: recentPortraitId、confirmed 校验、历史 roster 回退、非法地址过滤')
}

main().catch(error => { console.error(error); process.exit(1) })
