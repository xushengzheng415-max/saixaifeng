'use strict'
// 独立背景卡/皮肤后台首期静态验收：入口接线、三页签、标签建项、素材规格、整套预览与发布契约。
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const studioPath = path.join(root, 'web-admin-vue/src/views/tournament-center/PlayerCardSkinStudio.vue')
const adminPath = path.join(root, 'web-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue')
assert.ok(fs.existsSync(studioPath), '缺少背景卡后台组件 PlayerCardSkinStudio.vue')
const studio = fs.readFileSync(studioPath, 'utf8')
const admin = fs.readFileSync(adminPath, 'utf8')

assert.ok(admin.includes("import PlayerCardSkinStudio from './PlayerCardSkinStudio.vue'"), '运营中心未引入背景卡后台')
assert.ok(admin.includes("activeTab === 'cardSkins'"), '运营中心未渲染背景卡后台')
assert.ok(admin.includes("'playerCards','cardSkins'"), 'cardSkins 未加入 activeTab 白名单')
assert.ok(admin.includes("key:'cardSkins'"), '运营中心导航缺少背景卡入口')
assert.ok(admin.includes('cardSkins: ['), '运营中心缺少背景卡栏目说明')

for (const tab of ['制作项目', '已发布样式库', '发放记录']) {
  assert.ok(studio.includes(tab), '缺少页签: ' + tab)
}
for (const action of ['list', 'create', 'get', 'copyLayout', 'review', 'publish', 'issues']) {
  assert.ok(studio.includes("'" + action + "'"), '缺少工作流动作: ' + action)
}
for (const scope of ['platform', 'tournament', 'team', 'player']) {
  assert.ok(studio.includes("value: '" + scope + "'"), '缺少标签范围: ' + scope)
}
assert.ok(studio.includes("playerCardTemplateRequest('savePlayerCardTemplate'"), '素材与落位必须走 savePlayerCardTemplate')
assert.ok(studio.includes("playerCardTemplateRequest('listPlayerCardPreloadTargets'"), '标签目标必须走 listPlayerCardPreloadTargets')
assert.ok(studio.includes('300') && studio.includes('430'), '缺少 300×430 卡面尺寸校验')
assert.ok(studio.includes('2 * 1024 * 1024'), '缺少单张 2MB 上限校验')
assert.ok(studio.includes('card-skin-studio/'), '素材必须落在独立云存储目录')
assert.ok(studio.includes('uploadLargeFileViaCloud('), '素材必须走分片上传')
assert.ok(studio.includes("wf('review'"), '缺少整套预览')
assert.ok(studio.includes("wf('publish'"), '缺少整套发布')
assert.ok(studio.includes('proof'), '发布必须携带整套预览 proof')
assert.ok(/backgroundFileId[^}]*maskFileId|maskFileId[^}]*backgroundFileId/s.test(studio), '保存必须同时提交背景与遮罩 fileId')
assert.ok(studio.includes("preload: selectedSet.value.preload"), '保存成员时必须沿用项目标签范围')

const failures = []
if (failures.length) throw new Error(failures.join('\n'))
console.log('card-skin-studio OK: 入口、三页签、标签、素材规格、落位同步、整套预览与发布契约齐全')
