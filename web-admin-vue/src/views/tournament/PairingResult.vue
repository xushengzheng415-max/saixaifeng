<template>
  <section class="pairing-page" v-loading="loading">
    <header class="pairing-header"><div><span>赛事空间 / 抽签与分组 / 对阵结果</span><h1>{{ divisionName }} 对阵结果</h1><p>只显示轮次、场序和对阵来源；日期、时间、场地在赛历中手动安排。</p></div><div><el-button plain @click="backDraw">返回抽签结果</el-button><el-button type="primary" @click="goSchedule">进入赛历安排时间</el-button></div></header>
    <section class="pairing-summary"><span>对阵总数 <b>{{ matches.length }}</b></span><i></i><span>待排时间 <b>{{ matches.length }}</b></span><el-tag type="warning">不进入日历</el-tag></section>
    <div class="pairing-toolbar"><el-select v-model="roundFilter" clearable placeholder="全部轮次"><el-option v-for="round in rounds" :key="round" :label="round" :value="round" /></el-select><el-input v-model="keyword" clearable placeholder="搜索球队或来源" /></div>
    <section v-if="filteredMatches.length" class="pairing-list"><article v-for="match in filteredMatches" :key="match._id"><header><span>{{ match.roundName || match.phase || '比赛' }}</span><b>第{{ match.matchNo || match.matchIndex || '-' }}场</b></header><div class="pairing-versus"><strong>{{ match.homeTeamName || match.homeSourceLabel || '待产生' }}</strong><em>VS</em><strong>{{ match.awayTeamName || match.awaySourceLabel || '待产生' }}</strong></div><footer><span>{{ match.group || match.pool || '—' }}</span><el-tag size="small" type="warning">时间待排</el-tag></footer></article></section>
    <el-empty v-else description="暂无已确认对阵，请先完成抽签结果确认" />
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { queryList } from '../../utils/cloud'

const route = useRoute(); const router = useRouter(); const tournamentId = String(route.params.id || ''); const divisionId = String(route.query.divisionId || 'default')
const loading = ref(false); const matches = ref([]); const keyword = ref(''); const roundFilter = ref(''); const divisionName = ref(String(route.query.divisionName || '当前组别'))
const rounds = computed(() => [...new Set(matches.value.map(item => String(item.roundName || item.phase || '比赛')))])
const filteredMatches = computed(() => matches.value.filter(item => { const text = `${item.matchNo || ''} ${item.roundName || ''} ${item.homeTeamName || item.homeSourceLabel || ''} ${item.awayTeamName || item.awaySourceLabel || ''}`; return (!roundFilter.value || String(item.roundName || item.phase || '比赛') === roundFilter.value) && (!keyword.value.trim() || text.includes(keyword.value.trim())) }))
async function load() { loading.value = true; try { const rows = await queryList('matches', { where: { tournamentId, divisionId }, limit: 1000 }); matches.value = rows.filter(item => item.pairingStatus === 'confirmed' && item.scheduleStatus !== 'scheduled' && !item.schedulePublished).sort((a,b) => Number(a.matchNo || a.matchIndex || 0) - Number(b.matchNo || b.matchIndex || 0)); if (matches.value[0]?.divisionName) divisionName.value = matches.value[0].divisionName } finally { loading.value = false } }
function backDraw() { router.push({ path: `/tournaments/${tournamentId}/draw`, query: { divisionId } }) }
function goSchedule() { router.push({ path: `/tournaments/${tournamentId}/schedule`, query: { divisionId } }) }
onMounted(load)
</script>

<style scoped>
.pairing-page{min-height:100%;padding:28px 32px 80px;background:#f7faf8;color:#233b2d}.pairing-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding-bottom:20px;border-bottom:1px solid #dfe8e2}.pairing-header>div:first-child>span,.pairing-header p{color:#708077;font-size:13px}.pairing-header h1{margin:8px 0 5px;font-size:30px}.pairing-header p{margin:0}.pairing-summary{display:flex;align-items:center;gap:22px;margin:18px 0;padding:15px 18px;border:1px solid #dfe8e2;border-radius:8px;background:#fff}.pairing-summary span{font-size:13px}.pairing-summary b{margin-left:5px;font-size:22px}.pairing-summary i{height:22px;border-left:1px solid #dfe8e2}.pairing-toolbar{display:flex;gap:10px;margin-bottom:14px}.pairing-toolbar .el-select{width:180px}.pairing-toolbar .el-input{width:320px}.pairing-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.pairing-list article{padding:15px;border:1px solid #dfe8e2;border-radius:9px;background:#fff}.pairing-list article>header,.pairing-list footer{display:flex;align-items:center;justify-content:space-between}.pairing-list article>header{color:#69786e;font-size:12px}.pairing-list article>header b{color:#087943}.pairing-versus{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;min-height:84px}.pairing-versus strong{font-size:17px;line-height:1.4;word-break:break-word}.pairing-versus strong:last-child{text-align:right}.pairing-versus em{color:#8d9b92;font-size:12px;font-style:normal;font-weight:800}.pairing-list footer{padding-top:10px;border-top:1px solid #edf2ee;color:#7a887f;font-size:12px}@media(max-width:1000px){.pairing-header{align-items:flex-start;flex-direction:column}.pairing-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.pairing-page{padding:20px 16px 70px}.pairing-list{grid-template-columns:1fr}.pairing-toolbar{flex-direction:column}.pairing-toolbar .el-select,.pairing-toolbar .el-input{width:100%}}
</style>
