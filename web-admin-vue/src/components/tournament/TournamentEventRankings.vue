<template>
  <section class="event-rankings" v-loading="loading">
    <header>
      <h2>{{ title }}</h2>
      <el-radio-group v-if="kind !== 'goals'" v-model="cardMetric">
        <el-radio-button label="yellowCards">黄牌榜</el-radio-button>
        <el-radio-button label="redCards">红牌榜</el-radio-button>
      </el-radio-group>
    </header>
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
        <el-table-column v-if="kind === 'goals'" label="进球" width="120" align="center">
          <template #default="{ row }"><strong class="goal-total">{{ row.value }}</strong></template>
        </el-table-column>
        <template v-else>
          <el-table-column label="黄牌" width="120" align="center"><template #default="{ row }"><span class="yellow">{{ row.metrics?.yellowCards ?? '—' }}</span></template></el-table-column>
          <el-table-column label="红牌" width="120" align="center"><template #default="{ row }"><span class="red">{{ row.metrics?.redCards ?? '—' }}</span></template></el-table-column>
        </template>
      </el-table>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { callFunction } from '../../utils/cloud'

const props = defineProps({ tournamentId:String, divisionId:String, date:String, kind:String, keyword:String })
const loading = ref(false), error = ref(''), statistics = ref(null), cardMetric = ref('yellowCards')
let requestVersion = 0
const title = computed(() => ({ goals:'进球榜', playerCards:'球员红黄牌榜', teamCards:'球队红黄牌榜' }[props.kind]))
const table = computed(() => statistics.value?.rankings?.[props.kind === 'teamCards' ? 'teams' : 'players']?.[props.kind === 'goals' ? 'goals' : cardMetric.value])
const rows = computed(() => (table.value?.rows || []).filter(row => row.value > 0 && (!props.keyword || `${row.name} ${teamNames(row.teamIds)}`.toLowerCase().includes(props.keyword.trim().toLowerCase()))))
const unverifiedCount = computed(() => table.value?.unverifiedCount || 0)
const teamDirectory = computed(() => new Map((statistics.value?.rankings?.teamTotals || []).map(row => [String(row.id),row.name])))
function teamNames(ids) { return (ids || []).map(id => teamDirectory.value.get(String(id)) || '球队资料待补齐').join('、') || '—' }
async function load() {
  const version = ++requestVersion
  loading.value = true; error.value = ''; statistics.value = null
  try {
    const scope = { tournamentId:props.tournamentId, mode:'official', ...(props.divisionId ? {divisionId:props.divisionId} : {}) }
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
watch(() => [props.tournamentId,props.divisionId,props.date],load,{immediate:true})
</script>

<style scoped>
.event-rankings{margin-top:16px}.event-rankings>header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.event-rankings h2{margin:0;font-size:23px}.ranking-table{border:1px solid #dce5df;border-radius:6px;font-size:16px}.goal-total{font-size:22px;color:#087b43}.yellow{color:#a96600;font-weight:700}.red{color:#d53939;font-weight:700}.incomplete{color:#986b1b;font-size:14px}.event-rankings :deep(.el-table__cell){padding:14px 12px}@media(max-width:650px){.event-rankings>header{align-items:flex-start;flex-wrap:wrap}}
</style>
