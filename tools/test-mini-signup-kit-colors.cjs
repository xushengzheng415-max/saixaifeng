// 扫码报名比赛服颜色回归：主/备用两套只能选上衣的问题，以及颜色面板必须带真实色块。
// 覆盖：WXML 表达式红线、三部位采集、面板选中/清除、提交载荷只落已选部位、云函数归一化。
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'miniprogram/pages/tournament/signup/signup.js')
const wxmlPath = path.join(root, 'miniprogram/pages/tournament/signup/signup.wxml')
const wxssPath = path.join(root, 'miniprogram/pages/tournament/signup/signup.wxss')
const cloudPath = path.join(root, 'cloudfunctions/applyTournament/index.js')

const pageSource = fs.readFileSync(pagePath, 'utf8')
const wxml = fs.readFileSync(wxmlPath, 'utf8')
const wxss = fs.readFileSync(wxssPath, 'utf8')
const cloudSource = fs.readFileSync(cloudPath, 'utf8')

// 1. WXML 只允许简单插值、取反与 ||
const expressions = Array.from(wxml.matchAll(/\{\{([^}]*)\}\}/g)).map(match => match[1].trim())
const forbidden = expressions.filter(expr => /===|!==|===|\?|\.\w+\(|\[\d+\]|\+|-/.test(expr))
assert.deepEqual(forbidden, [], 'WXML 出现比较、三元、方法调用、数组索引或运算：' + forbidden.join(' | '))

// 2. 两套比赛服 × 三个部位都必须有可点入口，且颜色面板用真实色块而非纯文字
assert.ok(/wx:for="{{set\.slots}}" wx:key="slot"/.test(wxml), '缺少部位循环')
assert.ok(/data-set="{{set\.key}}" data-slot="{{item\.slot}}" bindtap="onKitSlotTap"/.test(wxml), '缺少部位点选入口')
assert.ok(/wx:for="{{kitColorChoices}}" wx:key="value"/.test(wxml), '缺少颜色面板循环')
assert.ok(/class="kit-color-dot" style="background-color:{{item\.value}}"/.test(wxml), '颜色面板未渲染真实色块')
assert.ok(/<picker/.test(wxml) === false, '比赛服颜色仍在使用原生 picker，只能看到文字')

// 3. 色板全部带十六进制色值（无文字-only 项）
const palette = Array.from(pageSource.matchAll(/\{ label: '([^']+)', value: '([^']+)' \}/g))
assert.ok(palette.length >= 12, '色板数量异常：' + palette.length)
const withoutColor = palette.filter(item => !/^#[0-9A-Fa-f]{6}$/.test(item[2])).map(item => item[1])
assert.deepEqual(withoutColor, [], '存在没有色值的颜色项：' + withoutColor.join('、'))

// 4. 页面逻辑：加载页面定义并驱动三个部位的选择
const storage = {}
global.wx = {
  getStorageSync: key => (storage[key] === undefined ? '' : storage[key]),
  setStorageSync: (key, value) => { storage[key] = value },
  removeStorageSync: key => { delete storage[key] },
  getStorageInfoSync: () => ({ keys: Object.keys(storage) }),
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, statusBarHeight: 20 }),
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 667, statusBarHeight: 20 }),
  showModal: () => {},
  showToast: () => {},
  navigateTo: () => {},
  cloud: { callFunction: async () => ({ result: { success: true } }) }
}
global.getApp = () => ({ globalData: {} })
let pageDefinition = null
global.Page = definition => { pageDefinition = definition }
require(pagePath)
assert.ok(pageDefinition, '报名页定义未加载')

const context = Object.create(pageDefinition)
context.data = JSON.parse(JSON.stringify(pageDefinition.data))
context.setData = function (patch) { Object.assign(this.data, patch) }

context.ensureKitSelection()
context.syncKitSets()
assert.equal(context.data.kitSets.length, 2, '应有两套比赛服')
assert.deepEqual(context.data.kitSets.map(set => set.label), ['主比赛服', '备用比赛服'])
assert.deepEqual(context.data.kitSets[0].slots.map(slot => slot.slotLabel), ['上衣', '短裤', '球袜'], '主比赛服应可选上衣、短裤、球袜')
assert.deepEqual(context.data.kitSets[1].slots.map(slot => slot.slotLabel), ['上衣', '短裤', '球袜'], '备用比赛服应可选上衣、短裤、球袜')
assert.ok(context.data.kitSets[0].slots[1].valueClass.includes('empty'), '未选的部位应显示占位态')

// 选中「主比赛服 · 短裤」
context.onKitSlotTap({ currentTarget: { dataset: { set: 'primary', slot: 'shorts' } } })
assert.equal(context.data.kitPanelOpen, true)
assert.equal(context.data.kitPanelTitle, '主比赛服 · 短裤')
assert.equal(context.data.kitPanelCanClear, false, '未选过时不应出现清除入口')
assert.equal(context.data.kitColorChoices.length, palette.length, '面板应列出全部色板颜色')
context.onKitColorPick({ currentTarget: { dataset: { index: 2 } } })
assert.equal(context.data.kitPanelOpen, false)
const pickedShorts = context.data.kitSets[0].slots[1]
assert.equal(pickedShorts.color, palette[2][2])
assert.equal(pickedShorts.colorLabel, palette[2][1])
assert.ok(pickedShorts.valueClass.includes('empty') === false)

// 提交载荷：只落已选部位，未选的备用套不写空值
let payload = context.kitColorPayload()
assert.deepEqual(payload.kitColors, { primary: { shorts: palette[2][2] } })
assert.deepEqual(payload.kitColorLabels, { primary: { shorts: palette[2][1] } })

// 三个部位都可以分别选不同颜色
context.onKitSlotTap({ currentTarget: { dataset: { set: 'primary', slot: 'jersey' } } })
context.onKitColorPick({ currentTarget: { dataset: { index: 5 } } })
context.onKitSlotTap({ currentTarget: { dataset: { set: 'primary', slot: 'socks' } } })
context.onKitColorPick({ currentTarget: { dataset: { index: 7 } } })
payload = context.kitColorPayload()
assert.deepEqual(Object.keys(payload.kitColors.primary), ['jersey', 'shorts', 'socks'])
assert.equal(payload.kitColors.primary.jersey, palette[5][2])
assert.equal(payload.kitColors.primary.socks, palette[7][2])

// 重新打开已选部位时可清除
context.onKitSlotTap({ currentTarget: { dataset: { set: 'primary', slot: 'socks' } } })
assert.equal(context.data.kitPanelCanClear, true, '已选部位应可清除')
context.onKitColorClear()
payload = context.kitColorPayload()
assert.deepEqual(Object.keys(payload.kitColors.primary), ['jersey', 'shorts'], '清除后不应保留球袜颜色')

// 备用套共用同一套部位与色板
context.onKitSlotTap({ currentTarget: { dataset: { set: 'secondary', slot: 'jersey' } } })
assert.equal(context.data.kitPanelTitle, '备用比赛服 · 上衣')
context.onKitColorPick({ currentTarget: { dataset: { index: 1 } } })
payload = context.kitColorPayload()
assert.equal(payload.kitColors.secondary.jersey, palette[1][2])
context.onKitPanelClose()
assert.equal(context.data.kitPanelOpen, false)

// 5. 云函数按三个部位归一化，非法色值与非本部位字段不落库
assert.ok(/const KIT_SLOTS = \['jersey', 'shorts', 'socks'\]/.test(cloudSource), '云函数未覆盖上衣/短裤/球袜')
assert.ok(/\/\^#\(\[0-9A-F\]\{6\}\)\$\/\.test\(value\)/.test(cloudSource), '云函数未校验十六进制色值')
assert.ok(/hasPrimaryKit \? \{ primary: kitPrimaryColors \}/.test(cloudSource), '云函数未按已选部位落库')
assert.ok(/kitPrimaryColor \|\| kitSecondaryColor/.test(cloudSource) === false, '云函数仍只处理上衣')

// 6. 面板与色块样式存在（避免只有文字没有颜色）
assert.ok(/\.kit-color-dot[a-z\s\-]*\{/.test(wxss), '缺少颜色圆点样式')
assert.ok(/\.kit-slot-swatch[a-z\s\-.]*\{/.test(wxss), '缺少部位色块样式')

console.log('PASS test-mini-signup-kit-colors')
