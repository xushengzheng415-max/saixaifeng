import assert from 'node:assert/strict'
import { formatMatchPhase, formatMatchRound } from '../web-admin-vue/src/utils/matchLabels.js'

const cases = [
  {
    name: '联赛显示阶段和真实轮次',
    match: { phase: 'league', round: 2, roundName: '联赛' },
    phase: '联赛阶段',
    round: '第2轮'
  },
  {
    name: '小组赛显示小组和真实轮次',
    match: { phase: 'group', group: 'A组', round: 3, roundName: '小组赛 A组' },
    phase: '小组赛 · A组',
    round: '第3轮'
  },
  {
    name: '淘汰赛保留语义轮次',
    match: { phase: 'knockout', round: 2, roundName: '淘汰赛 半决赛' },
    phase: '淘汰赛',
    round: '半决赛'
  },
  {
    name: '决赛不降级为数字轮次',
    match: { phase: 'cup', round: 3, roundName: '决赛' },
    phase: '淘汰赛',
    round: '决赛'
  },
  {
    name: '兼容旧 roundNumber 字段',
    match: { scheduleType: 'league', roundNumber: 4 },
    phase: '联赛阶段',
    round: '第4轮'
  },
  {
    name: '缺失数据明确显示短横线',
    match: {},
    phase: '-',
    round: '-'
  }
]

for (const item of cases) {
  assert.equal(formatMatchPhase(item.match), item.phase, `${item.name}：阶段`)
  assert.equal(formatMatchRound(item.match), item.round, `${item.name}：轮次`)
}

console.log(`阶段与轮次显示校验通过：${cases.length} 个场景。`)
