const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const backend = read('cloudfunctions/getMiniWorkspace/index.js')
const page = read('miniprogram/pages/team/participation/participation.js')
const template = read('miniprogram/pages/team/participation/participation.wxml')

assert.match(backend, /groupedRegistrations/, '服务端必须按逻辑参赛关系聚合')
assert.match(backend, /divisionNameKey[\s\S]*tournamentId \+ ':'/, '去重键必须包含赛事与标准化组别')
assert.match(backend, /hiddenStatuses[\s\S]*invite_cancelled/, '已取消和已替换关系不得进入当前参赛管理')
assert.match(backend, /statusPriority[\s\S]*approved: 90/, '重复关系必须优先保留已审核状态')
assert.match(backend, /matchRows = matches\.map/, '接口必须返回球队全部比赛场次')
assert.match(backend, /opponentName[\s\S]*venueText[\s\S]*canSubmitLineup/, '场次必须包含对手、场地和阵容操作状态')
assert.match(backend, /dateText: matchDateText\(row\)[\s\S]*timeText: matchTimeValue\(row\)/, '参赛管理必须复用已发布赛程的日期与时间解析')
assert.match(page, /未开始[\s\S]*今日比赛[\s\S]*已结束/, '页面筛选必须按比赛进行状态展示')
assert.match(template, /item\.matches[\s\S]*match\.dateText[\s\S]*match\.timeText[\s\S]*match\.opponentName/, '页面必须逐场显示日期、时间和对手')
assert.doesNotMatch(template, /data-item="{{item}}"/, '赛事按钮不得把包含整组赛程的大对象写入 dataset')

const duplicateRows = [
  { tournamentId: 't1', divisionId: '', divisionName: '老年组', status: 'pending', updateTime: '2026-09-01' },
  { tournamentId: 't1', divisionId: 'd-old', divisionName: '老年组', status: 'approved', updateTime: '2026-09-02' },
  { tournamentId: 't1', divisionId: 'd-old', divisionName: '老年组', status: 'pending', updateTime: '2026-09-03' }
]
const priorities = { approved: 90, pending: 60 }
const grouped = {}
duplicateRows.forEach(row => {
  const nameKey = row.divisionName.replace(/\s+/g, '').toLowerCase()
  const key = row.tournamentId + ':name:' + nameKey
  const current = grouped[key]
  if (!current || priorities[row.status] > priorities[current.status] || (priorities[row.status] === priorities[current.status] && new Date(row.updateTime) > new Date(current.updateTime))) grouped[key] = row
})
assert.strictEqual(Object.keys(grouped).length, 1, '重复提交必须只得到一个参赛项')
assert.strictEqual(grouped['t1:name:老年组'].status, 'approved', '重复项必须保留已审核关系')

console.log('球队参赛管理去重与赛程展示测试通过')
