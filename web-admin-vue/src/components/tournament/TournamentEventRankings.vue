<template>
  <section class="event-rankings" v-loading="loading">
    <header>
      <h2>{{ title }}</h2>
      <el-radio-group v-if="kind === 'goals'" v-model="goalMode">
        <el-radio-button label="players">个人榜单</el-radio-button>
        <el-radio-button label="teams">球队榜单</el-radio-button>
      </el-radio-group>
      <el-radio-group v-else v-model="cardMetric">
        <el-radio-button label="yellowCards">黄牌榜</el-radio-button>
        <el-radio-button label="redCards">红牌榜</el-radio-button>
      </el-radio-group>
    </header>

    <template v-if="kind === 'goals'">
      <el-tabs v-model="divisionTab" class="division-tabs">
        <el-tab-pane v-for="tab in divisionTabs" :key="tab.id" :label="tab.name" :name="tab.id" />
      </el-tabs>

      <el-radio-group v-if="goalMode === 'teams'" v-model="teamMetric" class="metric-tabs">
        <el-radio-button label="goals">球队进球最多</el-radio-button>
        <el-radio-button label="conceded">球队失球最少</el-radio-button>
      </el-radio-group>

      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-button v-if="error" link type="primary" @click="load">重新加载</el-button>

      <template v-else-if="goalMode === 'players'">
        <p v-if="unverifiedCount" class="incomplete">{{ unverifiedCount }} 项统计记录不完整，暂不参与排名</p>
        <article class="rank-card panel">
          <header class="rank-card-head">
            <div><h3>{{ divisionTabLabel }} · 个人进球榜</h3><p>按正式赛果的进球事件统计，排序以统一数据中心为准。</p></div>
            <span>{{ visiblePlayerRows.length }} 名球员</span>
          </header>
          <div v-if="visiblePlayerRows.length" class="rank-table-wrap">
            <table class="rank-table">
              <thead>
                <tr><th class="rank-col">排名</th><th>球员</th><th>球队</th><th v-if="isAllDivisions">组别</th><th class="num-col">进球</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in visiblePlayerRows" :key="row.id">
                  <td class="rank-col"><b class="rank-number">{{ row.rank }}</b></td>
                  <td><strong>{{ row.name }}</strong></td>
                  <td class="team-col">{{ teamNames(row.teamIds) }}</td>
                  <td v-if="isAllDivisions">{{ row.divisionName }}</td>
                  <td class="num-col"><strong class="goal-total">{{ row.value }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <el-empty v-else description="当前范围暂无进球记录" :image-size="70" />
        </article>
      </template>

      <template v-else>
        <article v-if="teamMetric === 'goals'" class="rank-card panel">
          <header class="rank-card-head">
            <div><h3>{{ divisionTabLabel }} · 球队进球最多</h3><p>取自主赛事积分榜的进球数，只统计已归档正式赛果，不受上方日期筛选影响。</p></div>
            <span>{{ scorerRows.length }} 支球队</span>
          </header>
          <div v-if="scorerRows.length" class="rank-table-wrap">
            <table class="rank-table">
              <thead>
                <tr><th class="rank-col">排名</th><th>球队</th><th v-if="isAllDivisions">组别</th><th>小组</th><th>赛</th><th class="num-col">进球</th><th class="num-col">场均进球</th><th class="num-col">失球</th></tr>
              </thead>
              <tbody>
                <tr v-for="team in scorerRows" :key="team.key">
                  <td class="rank-col"><b class="rank-number">{{ team.rank }}</b></td>
                  <td class="team-cell"><img v-if="team.logo" :src="team.logo" :alt="`${team.teamName}队徽`" /><span v-else class="team-avatar">{{ team.initial }}</span><b>{{ team.teamName }}</b></td>
                  <td v-if="isAllDivisions">{{ team.divisionName }}</td>
                  <td>{{ team.groupName }}</td>
                  <td>{{ team.played }}</td>
                  <td class="num-col"><strong class="goal-total">{{ team.goalsFor }}</strong></td>
                  <td class="num-col">{{ team.averageForText }}</td>
                  <td class="num-col">{{ team.goalsAgainst }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <el-empty v-else description="当前范围暂无已归档赛果" :image-size="70" />
        </article>

        <article v-else class="rank-card panel">
          <header class="rank-card-head">
            <div><h3>{{ divisionTabLabel }} · 球队失球最少</h3><p>取自主赛事积分榜的失球数，失球相同时按场均失球更低、积分更高排序。</p></div>
            <span>{{ keeperRows.length }} 支球队</span>
          </header>
          <div v-if="keeperRows.length" class="rank-table-wrap">
            <table class="rank-table">
              <thead>
                <tr><th class="rank-col">排名</th><th>球队</th><th v-if="isAllDivisions">组别</th><th>小组</th><th>赛</th><th class="num-col">失球</th><th class="num-col">场均失球</th><th class="num-col">进球</th></tr>
              </thead>
              <tbody>
                <tr v-for="team in keeperRows" :key="team.key">
                  <td class="rank-col"><b class="rank-number">{{ team.rank }}</b></td>
                  <td class="team-cell"><img v-if="team.logo" :src="team.logo" :alt="`${team.teamName}队徽`" /><span v-else class="team-avatar">{{ team.initial }}</span><b>{{ team.teamName }}</b></td>
                  <td v-if="isAllDivisions">{{ team.divisionName }}</td>
                  <td>{{ team.groupName }}</td>
                  <td>{{ team.played }}</td>
                  <td class="num-col"><strong class="conceded-total">{{ team.goalsAgainst }}</strong></td>
                  <td class="num-col">{{ team.averageAgainstText }}</td>
                  <td class="num-col">{{ team.goalsFor }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <el-empty v-else description="当前范围暂无已归档赛果" :image-size="70" />
        </article>
      </template>
    </template>

    <template v-else>
      <el-tabs v-model="divisionTab" class="division-tabs" @tab-change="onCardDivisionChange">
        <el-tab-pane v-for="tab in divisionTabs" :key="tab.id" :label="tab.name" :name="tab.id" />
      </el-tabs>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-button v-if="error" link type="primary" @click="load">重新加载</el-button>
      <template v-else>
        <p v-if="unverifiedCount" class="incomplete">{{ unverifiedCount }} 项统计记录不完整，暂不参与排名</p>
        <el-table :data="rows" class="ranking-table" empty-text="当前范围暂无已核实记录">
          <el-table-column prop="rank" label="排名" width="86" />
          <el-table-column :label="kind === 'teamCards' ? '球队' : '球员'" min-width="210">
            <template #default="{ row }"><strong>{{ row.name }}</strong></template>
          </el-table-column>
          <el-table-column v-if="kind !== 'teamCards'" label="球队" min-width="200">
            <template #default="{ row }">{{ teamNames(row.teamIds) }}</template>
          </el-table-column>
          <el-table-column label="黄牌" width="120" align="center"><template #default="{ row }"><span class="yellow">{{ row.metrics?.yellowCards ?? '—' }}</span></template></el-table-column>
          <el-table-column label="红牌" width="120" align="center"><template #default="{ row }"><span class="red">{{ row.metrics?.redCards ?? '—' }}</span></template></el-table-column>
        </el-table>
      </template>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { callFunction } from '../../utils/cloud'
import { teamBoard } from '../../../../cloudfunctions/dataCenter/shared/tournament-boards.mjs'

const props = defineProps({ tournamentId:String, divisionId:String, date:String, kind:String, keyword:String, divisions:{ type:Array, default:() => [] }, teamRows:{ type:Array, default:() => [] } })
const emit = defineEmits(['division-change'])
const loading = ref(false), error = ref(''), statistics = ref(null), cardMetric = ref('yellowCards')
const goalMode = ref('players'), teamMetric = ref('goals'), divisionTab = ref('all')
let requestVersion = 0
const title = computed(() => ({ goals:'进球榜', playerCards:'球员红黄牌榜', teamCards:'球队红黄牌榜' }[props.kind]))
const table = computed(() => statistics.value?.rankings?.[props.kind === 'teamCards' ? 'teams' : 'players']?.[props.kind === 'goals' ? 'goals' : cardMetric.value])
const rows = computed(() => (table.value?.rows || []).filter(row => row.value > 0 && (!props.keyword || `${row.name} ${teamNames(row.teamIds)}`.toLowerCase().includes(props.keyword.trim().toLowerCase()))))
const unverifiedCount = computed(() => table.value?.unverifiedCount || 0)
const teamDirectory = computed(() => new Map((statistics.value?.rankings?.teamTotals || []).map(row => [String(row.id),row.name])))
function teamNames(ids) { return (ids || []).map(id => teamDirectory.value.get(String(id)) || '球队资料待补齐').join('、') || '—' }
function averageText(value){ const text=Number(value||0).toFixed(2); return text.endsWith('.00') ? text.slice(0,-3) : text }

// 组别标签：总榜 + 各竞赛组别。球队与球员的组别归属都取积分榜同一口径。
const divisionTabs = computed(() => {
  const seen = new Map()
  for (const division of props.divisions) {
    const id=String(division.id || division._id || '')
    if(id)seen.set(id,String(division.name || '').trim() || '未命名组别')
  }
  for (const team of props.teamRows) {
    const key = String(team.divisionId || '')
    if (seen.has(key)) continue
    seen.set(key, String(team.divisionName || '').trim() || '未分组别')
  }
  const list = [...seen.entries()].map(([id,name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name,'zh-CN',{numeric:true}))
  return [{ id:'all', name:'总榜' }, ...list]
})
watch(divisionTabs, tabs => { if (!tabs.some(tab => tab.id === divisionTab.value)) divisionTab.value = 'all' })
watch(() => props.divisionId, value => { if(props.kind !== 'goals')divisionTab.value = value || 'all' }, { immediate:true })
function onCardDivisionChange(id) { emit('division-change', id === 'all' ? '' : id) }
const isAllDivisions = computed(() => divisionTab.value === 'all')
const divisionTabLabel = computed(() => divisionTabs.value.find(tab => tab.id === divisionTab.value)?.name || '总榜')

const playerRowsWithDivision = computed(() => rows.value.map(row => {
  const division = !isAllDivisions.value ? {id:divisionTab.value,name:divisionTabLabel.value} : {id:'',name:'跨组别总榜'}
  return { ...row, divisionId:division.id, divisionName:division.name }
}))
// 服务端进球榜已按进球、助攻、出场等规则排序，这里只做范围筛选并重排连续名次。
const visiblePlayerRows = computed(() => {
  const list = isAllDivisions.value ? playerRowsWithDivision.value : playerRowsWithDivision.value.filter(row => row.divisionId === divisionTab.value)
  return list.map((row,index) => ({ ...row, rank:index+1 }))
})

const teamRows = computed(() => props.teamRows.map(team => ({
  ...team,
  key:String(team.teamId || team.teamName || ''),
  divisionKey:String(team.divisionId || ''),
  divisionName:String(team.divisionName || '').trim() || '未分组别',
  groupName:String(team.groupName || ''),
  initial:Array.from(team.teamName || '队')[0] || '队',
  averageForText:averageText(Number(team.goalsFor || 0) / Number(team.played || 1)),
  averageAgainstText:averageText(Number(team.goalsAgainst || 0) / Number(team.played || 1))
})))
const scorerRows = computed(() => {
  const list = isAllDivisions.value ? teamRows.value : teamRows.value.filter(team => team.divisionKey === divisionTab.value)
  return teamBoard(list, 'goals')
})
const keeperRows = computed(() => {
  const list = isAllDivisions.value ? teamRows.value : teamRows.value.filter(team => team.divisionKey === divisionTab.value)
  return teamBoard(list, 'conceded')
})

async function load() {
  const version = ++requestVersion
  loading.value = true; error.value = ''; statistics.value = null
  try {
    const selectedDivision = props.divisionId || (divisionTab.value === 'all' ? '' : divisionTab.value)
    const scope = { tournamentId:props.tournamentId, mode:'official', ...(selectedDivision ? {divisionId:selectedDivision} : {}) }
    if (props.date) {
      const end = new Date(`${props.date}T00:00:00+08:00`)
      end.setUTCDate(end.getUTCDate() + 1)
      scope.from = `${props.date}T00:00:00+08:00`; scope.to = end.toISOString()
    }
    const result = await callFunction('dataCenter',{action:'query',scope})
    if (!result?.success) throw new Error(result?.error || result?.message || '榜单加载失败，请重试')
    if (!result.rankings) throw new Error('统计接口尚未提供榜单，请重新加载')
    if (version === requestVersion) statistics.value = result
  } catch (cause) { if (version === requestVersion) error.value = cause.message }
  finally { if (version === requestVersion) loading.value = false }
}
watch(() => [props.tournamentId,props.divisionId,props.date,divisionTab.value],load,{immediate:true})
</script>

<style scoped>
.event-rankings{margin-top:16px}.event-rankings>header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:8px}.event-rankings h2{margin:0;font-size:23px}
.division-tabs :deep(.el-tabs__header){margin:0 0 14px}.division-tabs :deep(.el-tabs__item){height:42px;font-weight:600}
.metric-tabs{margin:0 0 14px}
.ranking-table{border:1px solid #dce5df;border-radius:6px;font-size:16px}.goal-total{font-size:22px;color:#087b43}.conceded-total{font-size:20px;color:#087b43}.yellow{color:#a96600;font-weight:700}.red{color:#d53939;font-weight:700}.incomplete{color:#986b1b;font-size:14px}.event-rankings :deep(.el-table__cell){padding:14px 12px}
.rank-card{overflow:hidden;margin-bottom:14px;border:1px solid #e0e6e2;border-radius:10px;background:#fff}
.rank-card-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:17px 20px;border-bottom:1px solid #e8ece9}
.rank-card-head h3{margin:0;font-size:18px}.rank-card-head p{margin:4px 0 0;color:#7b877f;font-size:12px}.rank-card-head>span{color:#bc7216;font-size:12px}
.rank-table-wrap{overflow:auto}.rank-table{width:100%;min-width:840px;border-collapse:collapse}
.rank-table th,.rank-table td{height:50px;padding:0 13px;border-bottom:1px solid #edf0ee;text-align:center;font-size:16px}
.rank-table th{height:42px;color:#607067;background:#f7f9f7;font-size:14px}.rank-table th:nth-child(2),.rank-table td:nth-child(2),.rank-table th:nth-child(3),.rank-table td:nth-child(3){text-align:left}
.rank-col{width:88px}.num-col{width:110px}
.rank-number{display:inline-grid;width:25px;height:25px;place-items:center;border-radius:50%;background:#f0f3f1;font-size:16px}
.team-cell{display:flex;align-items:center;gap:9px}.team-cell img{width:38px;height:38px;object-fit:contain}
.team-cell b{font-size:18px}.team-avatar{display:inline-grid;width:38px;height:38px;place-items:center;border-radius:50%;color:#087840;background:#e4f5ea;font-weight:800}
.rank-table td .goal-total,.rank-table td .conceded-total{font-size:20px}
@media(max-width:650px){.event-rankings>header{align-items:flex-start;flex-wrap:wrap}}
</style>
