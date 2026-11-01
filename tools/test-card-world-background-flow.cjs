'use strict'
// 阶段 2 背景链路实测：选背景 → 预览 → 保存 → 重新进入仍生效。
// 同时验证基础背景与卡库皮肤都使用同一份 player_card_library 数据，
// H5 服务号会话与小程序 fan 会话读到的成卡 cardId 一致。
// 只使用本地 CloudBase 桩，不连接生产、不扣真实蜂蜜。
const assert = require('assert')
const crypto = require('crypto')
const path = require('path')
const { createDb } = require('./test-support/cloudbase-mock.cjs')

const root = path.resolve(__dirname, '..', 'cloudfunctions', 'webLoginApi')
const { createPlayerCards } = require(path.join(root, 'playerCards.cjs'))
const honeyWallet = require(path.join(root, 'honeyWallet.cjs'))

const DAY = 86400000
const FUTURE = new Date(Date.now() + 20 * DAY)
const PREFIX = 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/'
const file = name => PREFIX + 'test/' + name
const libraryId = (playerId, templateId) => crypto.createHash('sha256').update(JSON.stringify([String(playerId), String(templateId)])).digest('hex')
const skinStateId = templateId => 'gold_preload_' + crypto.createHash('sha256').update(String(templateId)).digest('hex').slice(0, 32)

const SELF_AUTH = { user: { _id: 'u1' }, session: { serviceAccountOpenId: 'open-1', unionId: '' } }

function seed(extra) {
  return Object.assign({
    players: [{
      _id: 'p1', name: '张一', linkedUserId: 'u1', recentPortraitId: 'portrait-1',
      jerseyNumber: 9, position: 'FW', playerCardVersion: 0, playerCardBackgroundId: 'gold'
    }],
    parent_portraits: [{
      _id: 'portrait-1', playerId: 'p1', status: 'confirmed', sourceChannel: 'service_account_h5',
      serviceAccountOpenId: 'open-1', transparentFileId: file('portraits/p1.png'), sourceType: 'standard_portrait'
    }],
    parent_profile_submissions: [{
      _id: 'sub-1', playerId: 'p1', status: 'submitted', serviceAccountOpenId: 'open-1',
      registrantType: 'self', registrantUserId: 'u1'
    }],
    teams: [],
    member_subscriptions: [],
    player_card_renders: [],
    player_card_templates: [],
    player_card_library: [],
    player_card_sets: [],
    player_card_template_states: [
      { _id: 'gold', active: { templateId: 'tpl-gold', version: 1 }, revision: 1 },
      { _id: 'silver', active: { templateId: 'tpl-silver', version: 1 }, revision: 1 }
    ],
    player_card_template_versions: [
      { _id: 'tpl-gold_1', templateId: 'tpl-gold', version: 1, cardTypeId: 'gold', title: '金卡', backgroundFileId: file('bg-gold.png'), maskFileId: file('mask-gold.png'), layout: {}, photo: {}, badges: {} },
      { _id: 'tpl-silver_1', templateId: 'tpl-silver', version: 1, cardTypeId: 'silver', title: '银卡', backgroundFileId: file('bg-silver.png'), maskFileId: file('mask-silver.png'), layout: {}, photo: {}, badges: {} }
    ],
    fan_h5_sessions: [{
      _id: 'fan-1', tokenHash: 'token-mini', active: true, expiresAt: FUTURE, serviceAccountOpenId: 'open-1'
    }]
  }, extra || {})
}

function seedSkin() {
  const templateId = 'tpl-skin'
  return seed({
    player_card_templates: [{
      _id: templateId, tier: 'gold', cardKind: 'progression', setId: 'set-1', issuanceMode: 'explicit', status: 'published',
      published: { preload: { type: 'platform', targetId: '', targetName: '' }, backgroundFileId: file('bg-skin.png'), maskFileId: file('mask-skin.png'), layout: {}, photo: {}, badges: {} }
    }],
    player_card_template_states: [
      { _id: 'gold', active: { templateId: 'tpl-gold', version: 1 }, revision: 1 },
      { _id: 'silver', active: { templateId: 'tpl-silver', version: 1 }, revision: 1 },
      { _id: skinStateId(templateId), active: { templateId, version: 1 }, revision: 1 }
    ],
    player_card_template_versions: [
      { _id: 'tpl-gold_1', templateId: 'tpl-gold', version: 1, cardTypeId: 'gold', title: '金卡', backgroundFileId: file('bg-gold.png'), maskFileId: file('mask-gold.png'), layout: {}, photo: {}, badges: {} },
      { _id: 'tpl-silver_1', templateId: 'tpl-silver', version: 1, cardTypeId: 'silver', title: '银卡', backgroundFileId: file('bg-silver.png'), maskFileId: file('mask-silver.png'), layout: {}, photo: {}, badges: {} },
      { _id: templateId + '_1', templateId, version: 1, cardTypeId: 'gold', title: '赛季皮肤', backgroundFileId: file('bg-skin.png'), maskFileId: file('mask-skin.png'), layout: {}, photo: {}, badges: {} }
    ],
    player_card_library: [{
      _id: libraryId('p1', templateId), playerId: 'p1', templateId, preload: { type: 'platform', targetId: '', targetName: '' },
      revision: 0, crop: { zoom: 1.1, x: 0.1, y: 0 }, grantedAt: new Date()
    }]
  })
}

function makeCloud() {
  return {
    database: db => db,
    downloadFile: async ({ fileID }) => ({ fileContent: Buffer.from(String(fileID)) }),
    getTempFileURL: async ({ fileList }) => ({
      fileList: fileList.map(fileID => ({ fileID, tempFileURL: 'https://example.test/' + encodeURIComponent(String(fileID)) }))
    })
  }
}

function makeHandler(db, options) {
  const opts = options || {}
  const score = Object.assign({
    status: 'ready', tier: 'gold', points: 120, canChangeBackground: true, canReplacePhoto: false,
    metrics: { appearances: 5, goals: 2, assists: 1 }
  }, opts.score || {})
  return createPlayerCards({
    cloud: Object.assign(makeCloud(), { database: () => db }),
    authenticateServicePrivate: async () => (opts.auth === undefined ? SELF_AUTH : opts.auth),
    scoreForPlayer: async () => score,
    playerCardsForAuthorizedPlayers: async ids => new Map(ids.map(id => [String(id), score])),
    hashSessionToken: value => String(value),
    dateValue: value => value instanceof Date ? value.getTime() : Number(value),
    authenticateParentH5Session: async () => ({ success: false }),
    previewParentProfileInvite: async () => ({ success: false })
  })
}

function spySpend() {
  const original = honeyWallet.spendHoney
  const state = { calls: 0 }
  honeyWallet.spendHoney = async () => { state.calls += 1; throw new Error('本用例不应扣蜂蜜') }
  return { calls: () => state.calls, restore: () => { honeyWallet.spendHoney = original } }
}

async function testBaseBackgroundFlow() {
  const { db, data } = createDb(seed())
  const handler = makeHandler(db)
  const spy = spySpend()
  try {
    // 1. 进入设置：后台已发布背景带缩略图
    const first = await handler({ action: 'getMyPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1' })
    assert.strictEqual(first.success, true)
    assert.ok(first.templates.silver && first.templates.silver.backgroundUrl, '银卡背景必须有后台缩略图')
    assert.ok(first.templates.gold && first.templates.gold.backgroundUrl, '金卡背景必须有后台缩略图')

    // 2. 选银卡背景 → 预览
    const preview = await handler({
      action: 'previewMyPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1',
      backgroundId: 'silver', crop: { zoom: 1.2, x: 0.1, y: -0.1 },
      mode: 'portrait', tier: 'gold', expectedVersion: 0, dynamicCardProtocol: 'player-card-dynamic/1'
    })
    assert.strictEqual(preview.success, true, '预览应返回成卡描述')
    assert.strictEqual(preview.status, 'ready')
    assert.strictEqual(preview.templateId, 'tpl-silver')
    assert.ok(preview.cardScene && preview.cardScene.assets.background, '预览必须使用银卡背景素材')

    // 3. 保存背景
    const saved = await handler({
      action: 'saveMyPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1',
      backgroundId: 'silver', crop: { zoom: 1.2, x: 0.1, y: -0.1 },
      mode: 'portrait', tier: 'gold', expectedVersion: 0
    })
    assert.strictEqual(saved.success, true)
    assert.strictEqual(saved.version, 1)
    assert.strictEqual(data.players[0].playerCardBackgroundId, 'silver')
    assert.deepStrictEqual(data.players[0].playerCardCrop, { zoom: 1.2, x: 0.1, y: -0.1 })

    // 4. 重新进入仍生效
    const again = await handler({ action: 'getMyPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1' })
    assert.strictEqual(again.success, true)
    assert.strictEqual(again.player.backgroundId, 'silver', '重新进入设置必须仍显示已保存背景')
    assert.strictEqual(again.player.version, 1)
    const list = await handler({ action: 'listMyPlayerCards', serviceSessionToken: 'token-1', dynamicCardProtocol: 'player-card-dynamic/1' })
    if (!list.success) console.error('DEBUG listMyPlayerCards', list)
    assert.strictEqual(list.success, true)
    assert.strictEqual(list.players[0].backgroundId, 'silver', '主卡列表必须使用同一背景')
    assert.strictEqual(spy.calls(), 0, '换背景/构图不得扣蜂蜜')
  } finally { spy.restore() }
  console.log('  ✓ 基础背景：选银卡 → 预览 → 保存 → 重进仍为银卡，不扣蜂蜜')
}

async function testSkinFlow() {
  const { db, data } = createDb(seedSkin())
  const handler = makeHandler(db)
  const spy = spySpend()
  try {
    const templateId = 'tpl-skin'

    // 1. 卡库皮肤按已拥有状态展示（缩略图来自后台背景）
    const list0 = await handler({ action: 'listMyPlayerCards', serviceSessionToken: 'token-1', dynamicCardProtocol: 'player-card-dynamic/1' })
    assert.strictEqual(list0.success, true)
    const cards = list0.players[0].preloadedCards || []
    const skin = cards.find(card => card.templateId === templateId)
    assert.ok(skin, '已拥有的卡库皮肤必须出现在列表中')
    assert.strictEqual(skin.status, 'ready')
    assert.ok(skin.backgroundUrl, '皮肤必须有后台缩略图')
    assert.deepStrictEqual(skin.crop, { zoom: 1.1, x: 0.1, y: 0 }, '皮肤必须保留自己的构图')

    // 2. 选皮肤 → 预览
    const preview = await handler({
      action: 'previewMyPreloadedPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1',
      templateId, templateVersion: skin.templateVersion,
      crop: { zoom: 1.25, x: 0, y: -0.1 }, dynamicCardProtocol: 'player-card-dynamic/1'
    })
    assert.strictEqual(preview.success, true, '皮肤预览应返回成卡描述')
    assert.strictEqual(preview.status, 'ready')
    assert.strictEqual(preview.templateId, templateId)
    assert.ok(preview.cardScene && preview.cardScene.assets.background, '皮肤预览必须使用后台背景')

    // 3. 保存皮肤并与小程序一致的装备动作
    const saved = await handler({
      action: 'saveMyPreloadedPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1',
      templateId, templateVersion: skin.templateVersion, expectedRevision: skin.revision,
      crop: { zoom: 1.25, x: 0, y: -0.1 }
    })
    assert.strictEqual(saved.success, true)
    assert.strictEqual(saved.revision, 1)
    const equipped = await handler({ action: 'selectMyPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1', templateId })
    assert.strictEqual(equipped.success, true)
    assert.strictEqual(equipped.displayTemplateId, templateId)
    assert.strictEqual(data.players[0].playerCardDisplayTemplateId, templateId)

    // 4. 重新进入仍生效，且 H5 与小程序读取同一成卡 cardId
    const h5 = await handler({ action: 'listMyPlayerCards', serviceSessionToken: 'token-1', dynamicCardProtocol: 'player-card-dynamic/1' })
    const h5Player = h5.players[0]
    assert.strictEqual(h5Player.displayTemplateId, templateId, '重新进入必须仍装备该皮肤')
    assert.strictEqual(h5Player.displayState, 'ready')
    const h5Skin = (h5Player.preloadedCards || []).find(card => card.templateId === templateId)
    assert.ok(h5Skin && h5Skin.cardId, '皮肤必须有统一成卡 cardId')
    assert.strictEqual(h5Player.displayCardId, h5Skin.cardId, 'H5 展示卡与卡库成卡必须一致')
    assert.strictEqual(h5Skin.crop.zoom, 1.25, '保存后必须回写该皮肤的构图')

    const mini = await handler({ action: 'listMyPlayerCards', fanSessionToken: 'token-mini', dynamicCardProtocol: 'player-card-dynamic/1' })
    assert.strictEqual(mini.success, true, '小程序会话也必须读取同一球员卡')
    const miniPlayer = (mini.players || []).find(item => String(item.id) === 'p1')
    assert.ok(miniPlayer, '小程序必须看到同一球员')
    assert.strictEqual(miniPlayer.displayTemplateId, templateId, '小程序与 H5 必须看到同一装备皮肤')
    assert.strictEqual(miniPlayer.displayCardId, h5Player.displayCardId, '小程序与 H5 必须使用同一成卡结果')
    assert.strictEqual(spy.calls(), 0, '换背景/皮肤不得扣蜂蜜')

    const again = await handler({ action: 'getMyPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1' })
    assert.strictEqual(again.player.displayTemplateId, templateId, '重新进入设置必须仍装备该皮肤')
  } finally { spy.restore() }
  console.log('  ✓ 卡库皮肤：已拥有展示 → 预览 → 保存 → 装备 → 重进仍生效，H5/小程序同一 cardId')
}

// playerCardSuite 对模板状态/版本有 60 秒进程内缓存；空态与失败用例必须
// 重新加载模块，否则会读到前两个用例缓存的模板。
function freshPlayerCards() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(root + path.sep)) delete require.cache[key]
  }
  return require(path.join(root, 'playerCards.cjs')).createPlayerCards
}

function makeFreshHandler(factory, db, options) {
  return factory({
    cloud: Object.assign(makeCloud(), { database: () => db }),
    authenticateServicePrivate: async () => (!options || options.auth === undefined ? SELF_AUTH : options.auth),
    scoreForPlayer: async () => Object.assign({
      status: 'ready', tier: 'gold', points: 120, canChangeBackground: true, canReplacePhoto: false,
      metrics: { appearances: 5, goals: 2, assists: 1 }
    }, (options && options.score) || {}),
    playerCardsForAuthorizedPlayers: async ids => new Map(ids.map(id => [String(id), Object.assign({
      status: 'ready', tier: 'gold', points: 120, canChangeBackground: true, canReplacePhoto: false,
      metrics: { appearances: 5, goals: 2, assists: 1 }
    }, (options && options.score) || {})])),
    hashSessionToken: value => String(value),
    dateValue: value => value instanceof Date ? value.getTime() : Number(value),
    authenticateParentH5Session: async () => ({ success: false }),
    previewParentProfileInvite: async () => ({ success: false })
  })
}

async function testEmptyAndFailure() {
  // 没有任何已发布背景时返回空模板集，H5 据此显示明确空态
  const empty = createDb(seed({ player_card_template_states: [], player_card_template_versions: [] }))
  const emptyHandler = makeFreshHandler(freshPlayerCards(), empty.db)
  assert.deepStrictEqual(empty.data.player_card_template_states, [], '空态 seed 必须覆盖默认模板状态')
  const emptyResult = await emptyHandler({ action: 'getMyPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1' })
  assert.strictEqual(emptyResult.success, true)
  assert.deepStrictEqual(emptyResult.templates, {}, '后台没有已发布背景时不得伪造模板')

  // 背景读取失败必须抛出可重试错误，而不是静默空白
  const broken = createDb(seed(), { failCollections: { player_card_template_versions: '背景读取失败' } })
  const failed = await makeFreshHandler(freshPlayerCards(), broken.db)({ action: 'getMyPlayerCard', serviceSessionToken: 'token-1', playerId: 'p1' })
  assert.strictEqual(failed.success, false)
  assert.ok(/DATA_READ_FAILED|PLAYER_CARD_ERROR/.test(failed.code), '读取失败必须返回可识别错误')
  console.log('  ✓ 空态与读取失败：无背景返回空模板，失败返回可重试错误')
}

async function main() {
  await testBaseBackgroundFlow()
  await testSkinFlow()
  await testEmptyAndFailure()
  console.log('PASS test-card-world-background-flow: 选背景 → 预览 → 保存 → 重进仍生效；H5/小程序同一成卡')
}

main().catch(error => { console.error(error); process.exit(1) })
