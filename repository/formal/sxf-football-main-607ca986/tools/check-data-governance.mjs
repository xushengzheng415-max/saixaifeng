import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root,file),'utf8')
for (const file of ['docs/data-center/README.md','docs/data-center/CONTRACT.md','docs/data-center/INTEGRATION.md','docs/data-center/RELEASE.md']) assert(fs.existsSync(path.join(root,file)),`缺少数据基准 ${file}`)
for (const directory of ['cloudfunctions','miniprogram','web-admin-vue/src','service-account-h5']) assert(read(directory + '/AGENTS.md').includes('data-center/README.md'),`${directory} 未登记数据规范`)
assert(read('cloudfunctions/webLoginApi/index.js').includes("'dataCenter'"),'PC 中转未登记')
const miniService = read('cloudfunctions/getMiniWorkspace/index.js')
assert(miniService.includes("event.action === 'teamPlayerDetail'") && miniService.includes('cardService.playerCardForAuthorizedPlayer'),'小程序球员详情未使用统一服务')
assert(read('cloudfunctions/webLoginApi/index.js').includes("case 'publicDataCenter'"),'公开入口未登记')
assert(!read('cloudfunctions/resultCenter/index.js').includes(".where({ matchId: db.command.in(chunk) }).limit(200)"),'成绩中心仍截断事件')
assert(read('AGENTS.md').includes('docs/data-center/README.md'),'根开发规则未引用数据规范')
assert(read('cloudfunctions/webLoginApi/index.js').includes('assertPlayerFactWrite'),'累计统计缺少写入保护')
const miniTemplate = read('miniprogram/pages/team/player-detail/player-detail.wxml')
assert(!/\{\{[^}]*\[[^}]*\}\}/.test(miniTemplate),'新页面存在 WXML 数组索引')
console.log('PASS: 数据知识库、各端研发约束、统一接口与成绩中心完整读取登记')
