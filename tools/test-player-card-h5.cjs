'use strict'
// 阶段 2 自测：服务号 H5「我的球员卡」鉴权、本人/监护权限、跨账号拒绝、
// 会员换背景、无卡、读取/保存失败，以及换背景/构图不误扣蜂蜜。
// 只使用本地 CloudBase 桩和假的渲染依赖，不连接生产、不生成真实图片。
const assert = require('assert')
const path = require('path')
const { createDb } = require('./test-support/cloudbase-mock.cjs')

const root = path.resolve(__dirname, '..', 'cloudfunctions', 'webLoginApi')
const { createPlayerCards } = require(path.join(root, 'playerCards.cjs'))
const honeyWallet = require(path.join(root, 'honeyWallet.cjs'))

const DAY = 86400000
const FUTURE = new Date(Date.now() + 20 * DAY)

function seed(extra) {
  return Object.assign({
    players: [
      {
        _id: 'p1', name: '张一', linkedUserId: 'u1', recentPortraitId: 'portrait-1',
        jerseyNumber: 9, position: 'FW', playerCardVersion: 0, playerCardBackgroundId: 'gold'
      },
      {
        _id: 'p2', name: '张二', guardianUserId: 'u1', recentPortraitId: 'portrait-2',
        jerseyNumber: 7, playerCardVersion: 0, playerCardBackgroundId: 'gold'
      },
      {
        _id: 'p3', name: '李三', linkedUserId: 'u2', recentPortraitId: 'portrait-3',
        playerCardVersion: 0
      }
    ],
    parent_portraits: [
      { _id: 'portrait-1', playerId: 'p1', status: 'confirmed', sourceChannel: 'service_account_h5', serviceAccountOpenId: 'open-1', transparentFileId: 'file-p1', sourceType: 'standard_portrait' },
      { _id: 'portrait-2', playerId: 'p2', status: 'confirmed', sourceChannel: 'service_account_h5', serviceAccountOpenId: 'open-1', transparentFileId: 'file-p2', sourceType: 'standard_portrait' },
      { _id: 'portrait-3', playerId: 'p3', status: 'confirmed', sourceChannel: 'service_account_h5', serviceAccountOpenId: 'open-2', transparentFileId: 'file-p3', sourceType: 'standard_portrait' }
    ],
    parent_profile_submissions: [],
    teams: [],
    member_subscriptions: [],
    player_card_template_states: [
      { _id: 'gold', active: { templateId: 'tpl-gold', version: 1 }, revision: 1 },
      { _id: 'silver', active: { templateId: 'tpl-silver', version: 1 }, revision: 1 }
    ],
    player_card_template_versions: [
      { _id: 'tpl-gold_1', templateId: 'tpl-gold', version: 1, title: '金卡' },
      { _id: 'tpl-silver_1', templateId: 'tpl-silver', version: 1, title: '银卡' }
    ]
  }, extra || {})
}

function makeCloud(db) {
  return {
    database: () => db,
    downloadFile: async ({ fileID }) => ({ fileContent: Buffer.from(String(fileID)) }),
    getTempFileURL: async ({ fileList }) => ({ fileList: fileList.map(fileID => ({ fileID, tempFileURL: 'https://example/' + fileID })) })
  }
}

const SELF_AUTH = { user: { _id: 'u1' }, session: { serviceAccountOpenId: 'open-1', unionId: '' } }

function makeHandler(db, options) {
  const opts = options || {}
  const score = Object.assign({
    status: 'ready', tier: 'gold', points: 0, canChangeBackground: false, canReplacePhoto: false,
    metrics: { appearances: 5, goals: 2, assists: 1 }
  }, opts.score || {})
  const deps = {
    cloud: makeCloud(db),
    authenticateServicePrivate: async () => (opts.auth === undefined ? SELF_AUTH : opts.auth),
    scoreForPlayer: async () => score,
    hashSessionToken: value => String(value),
    dateValue: value => value instanceof Date ? value.getTime() : Number(value),
    authenticateParentH5Session: async () => ({ success: false }),
    previewParentProfileInvite: async () => ({ success: false })
  }
  return createPlayerCards(deps)
}

function saveEvent(playerId, extra) {
  return Object.assign({
    action: 'saveMyPlayerCard', serviceSessionToken: 'token-1', playerId,
    backgroundId: 'gold', crop: { zoom: 1.15, x: 0.2, y: -0.1 },
    mode: 'portrait', tier: 'gold', expectedVersion: 0
  }, extra || {})
}

function spySpend() {
  const original = honeyWallet.spendHoney
  const state = { calls: 0 }
  honeyWallet.spendHoney = async () => { state.calls += 1; throw new Error('本用例不应扣蜂蜜') }
  return {
    calls: () => state.calls,
    restore: () => { honeyWallet.spendHoney = original }
  }
}

function playerRow(data, id) {
  return (data.players || []).find(row => String(row._id) === String(id)) || null
}

async function testSessionFailures() {
  const { db } = createDb(seed())
  const expired = await makeHandler(db, { auth: { success: false, code: 'SERVICE_PRIVATE_AUTH_REQUIRED', error: '请重新连接微信' } })(saveEvent('p1'))
  assert.strictEqual(expired.success, false)
  assert.strictEqual(expired.code, 'SERVICE_PRIVATE_AUTH_REQUIRED')

  const missingToken = await makeHandler(db, { auth: { success: false, code: 'SERVICE_PRIVATE_AUTH_REQUIRED' } })({ action: 'saveMyPlayerCard', playerId: 'p1' })
  assert.strictEqual(missingToken.success, false)
  assert.strictEqual(missingToken.code, 'PLAYER_CARD_AUTH_REQUIRED')

  const binding = await makeHandler(db, { auth: { success: true, needsBinding: true } })(saveEvent('p1'))
  assert.strictEqual(binding.success, false)
  assert.strictEqual(binding.code, 'PLAYER_CARD_AUTH_REQUIRED')
  assert.ok(/手机号绑定/.test(binding.error))

  const unavailable = await makeHandler(db, { auth: { success: false, code: 'SERVICE_PRIVATE_ACCOUNT_UNAVAILABLE', error: '账号暂不可用' } })(saveEvent('p1'))
  assert.strictEqual(unavailable.success, false)
  assert.strictEqual(unavailable.code, 'SERVICE_PRIVATE_ACCOUNT_UNAVAILABLE')
}

async function testPermissions() {
  const selfDb = createDb(seed())
  const selfSpy = spySpend()
  try {
    const ok = await makeHandler(selfDb.db)(saveEvent('p1'))
    assert.strictEqual(ok.success, true, '本人球员应允许保存')
    assert.strictEqual(ok.version, 1)
    assert.strictEqual(playerRow(selfDb.data, 'p1').playerCardBackgroundId, 'gold')
    assert.deepStrictEqual(playerRow(selfDb.data, 'p1').playerCardCrop, { zoom: 1.15, x: 0.2, y: -0.1 })
    assert.strictEqual(selfSpy.calls(), 0, '只换背景/构图不得扣蜂蜜')
  } finally { selfSpy.restore() }

  const guardianDb = createDb(seed())
  const guardianSpy = spySpend()
  try {
    const ok = await makeHandler(guardianDb.db)(saveEvent('p2'))
    assert.strictEqual(ok.success, true, '监护球员应允许保存')
    assert.strictEqual(playerRow(guardianDb.data, 'p2').playerCardVersion, 1)
    assert.strictEqual(guardianSpy.calls(), 0)
  } finally { guardianSpy.restore() }

  const crossDb = createDb(seed())
  const cross = await makeHandler(crossDb.db)(saveEvent('p3'))
  assert.strictEqual(cross.success, false)
  assert.strictEqual(cross.code, 'PLAYER_CARD_FORBIDDEN', '跨账号球员必须拒绝')
  assert.strictEqual(playerRow(crossDb.data, 'p3').playerCardVersion, 0, '跨账号请求不得写库')
}

async function testNoCard() {
  const empty = createDb(seed({ players: [] }))
  const result = await makeHandler(empty.db)(saveEvent('p1'))
  assert.strictEqual(result.success, false)
  assert.strictEqual(result.code, 'PLAYER_CARD_FORBIDDEN', '无卡用户不应进入编辑流程')
}

async function testReadFailure() {
  const broken = createDb(seed(), { failCollections: { players: '球员资料读取失败' } })
  const result = await makeHandler(broken.db)(saveEvent('p1'))
  assert.strictEqual(result.success, false)
  assert.ok(/DATA_READ_FAILED|PLAYER_CARD_ERROR/.test(result.code))
  assert.ok(result.error)
}

async function testSaveFailure() {
  const { db, data } = createDb(seed(), { failWrites: { players: '球员卡写入失败' } })
  const spy = spySpend()
  try {
    const result = await makeHandler(db)(saveEvent('p1'))
    assert.strictEqual(result.success, false)
    assert.ok(/DATA_WRITE_FAILED|PLAYER_CARD_ERROR/.test(result.code))
    assert.strictEqual(playerRow(data, 'p1').playerCardVersion, 0, '保存失败不得留下半成品')
    assert.strictEqual(spy.calls(), 0, '保存失败不得扣蜂蜜')
  } finally { spy.restore() }
}

async function testMembershipBackground() {
  const memberSeed = seed({
    member_subscriptions: [{ _id: 'open-1', userId: 'u1', openId: 'open-1', levelCode: 'plus', status: 'active', expiresAt: FUTURE }]
  })
  memberSeed.players[0].playerCardBackgroundId = 'silver'
  const member = createDb(memberSeed)
  const spy = spySpend()
  try {
    const result = await makeHandler(member.db, { score: { tier: 'silver', canChangeBackground: false } })(
      saveEvent('p1', { tier: 'silver', backgroundId: 'gold' })
    )
    assert.strictEqual(result.success, true, '有效会员应可不达 100 分更换背景')
    assert.strictEqual(playerRow(member.data, 'p1').playerCardBackgroundId, 'gold')
    assert.strictEqual(spy.calls(), 0, '会员换背景不得扣蜂蜜')
  } finally { spy.restore() }

  const nonMemberSeed = seed()
  nonMemberSeed.players[0].playerCardBackgroundId = 'silver'
  const nonMember = createDb(nonMemberSeed)
  const locked = await makeHandler(nonMember.db, { score: { tier: 'silver', canChangeBackground: false } })(
    saveEvent('p1', { tier: 'silver', backgroundId: 'gold' })
  )
  assert.strictEqual(locked.success, false)
  assert.strictEqual(locked.code, 'PLAYER_CARD_BACKGROUND_LOCKED')
  assert.strictEqual(playerRow(nonMember.data, 'p1').playerCardBackgroundId, 'silver', '未解锁不得写库')

  const expiredSeed = seed({
    member_subscriptions: [{ _id: 'open-1', userId: 'u1', openId: 'open-1', levelCode: 'plus', status: 'active', expiresAt: new Date(Date.now() - DAY) }]
  })
  expiredSeed.players[0].playerCardBackgroundId = 'silver'
  const expired = createDb(expiredSeed)
  const expiredResult = await makeHandler(expired.db, { score: { tier: 'silver', canChangeBackground: false } })(
    saveEvent('p1', { tier: 'silver', backgroundId: 'gold' })
  )
  assert.strictEqual(expiredResult.success, false, '已到期会员不再享受换背景权益')
  assert.strictEqual(expiredResult.code, 'PLAYER_CARD_BACKGROUND_LOCKED')
}

async function testPhotoReplaceNoCharge() {
  const { db, data } = createDb(seed())
  data.players.find(row => row._id === 'p1').playerCardFileId = 'file-old-p1'
  const spy = spySpend()
  try {
    const result = await makeHandler(db)(saveEvent('p1'))
    assert.strictEqual(result.success, false, '换照片只能去小程序，H5 不得直接扣费保存')
    assert.strictEqual(result.code, 'PLAYER_CARD_PHOTO_PAY_REQUIRED')
    assert.strictEqual(result.photoReplaceCost > 0, true)
    assert.strictEqual(playerRow(data, 'p1').playerCardVersion, 0)
    assert.strictEqual(spy.calls(), 0, 'H5 保存不得调用蜂蜜扣费')
  } finally { spy.restore() }
}

async function main() {
  await testSessionFailures()
  await testPermissions()
  await testNoCard()
  await testReadFailure()
  await testSaveFailure()
  await testMembershipBackground()
  await testPhotoReplaceNoCharge()
  console.log('PASS test-player-card-h5: 会话失效、本人/监护、跨账号、无卡、读取/保存失败、会员换背景与不扣蜂蜜')
}

main().catch(error => { console.error(error); process.exit(1) })
