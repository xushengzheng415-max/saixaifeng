<template>
  <section class="platform-data">
    <el-alert v-if="error" :title="error" type="error" :closable="false"><template #default><el-button link @click="refresh">重试</el-button></template></el-alert>
    <div class="filters">
      <label>赛事<el-select v-model="scope.tournamentId" filterable clearable placeholder="全部赛事" @change="changeTournament"><el-option v-for="item in catalog.tournaments" :key="item.id" :label="item.name" :value="item.id" /></el-select></label>
      <label>竞赛组别<el-select v-model="scope.divisionId" clearable placeholder="全部组别"><el-option v-for="item in divisions" :key="item.id" :label="item.name" :value="item.id" /></el-select></label>
      <label>统计口径<el-select v-model="scope.mode"><el-option label="正式结果" value="official" /><el-option label="含现场暂定" value="provisional" /></el-select></label>
      <el-button type="primary" :loading="loading" @click="query">查询</el-button><el-button :disabled="!result || loading" @click="download">导出</el-button>
    </div>
    <el-tabs v-model="tab"><el-tab-pane label="分组排名" name="standings" /><el-tab-pane label="各类榜单" name="rankings" /><el-tab-pane label="球队列表" name="teams" /><el-tab-pane label="球员列表" name="players" /><el-tab-pane label="判罚与事件" name="records" /><el-tab-pane label="数据质量" name="quality" /></el-tabs>
    <div v-if="result" class="meta"><span>{{ result.scope.mode === 'official' ? '正式结果' : '含现场暂定' }}</span><span>{{ result.summary.matchCount }} 场统计比赛</span><el-tag :type="result.coverage.status === 'complete' ? 'success' : 'warning'">{{ result.coverage.status === 'complete' ? '记录完整' : '部分记录待核定' }}</el-tag></div>
    <div v-if="loading && !result" class="empty" role="status">正在读取数据…</div>
    <template v-else-if="result">
      <template v-if="tab === 'standings'">
        <div class="table-tools"><el-select v-model="groupKey" clearable placeholder="全部分组"><el-option v-for="group in groups" :key="group.key" :label="group.label" :value="group.key" /></el-select></div>
        <section v-for="group in shownGroups" :key="group.key" class="group-section"><h2>{{ group.label }}</h2>
          <el-table :data="group.officialTeams" stripe empty-text="暂无正式排名"><el-table-column prop="rank" label="排名" width="70" /><el-table-column prop="teamName" label="球队" min-width="165" /><el-table-column v-for="field in standingFields" :key="field.key" :label="field.label" width="80"><template #default="{row}">{{ numeric(row[field.key]) }}</template></el-table-column></el-table>
        </section><div v-if="!shownGroups.length" class="empty">暂无符合条件的正式分组排名</div>
      </template>
      <template v-else-if="tab === 'rankings'">
        <div class="table-tools"><el-radio-group v-model="rankingKind" @change="rankingMetric = rankingKind === 'players' ? 'goals' : 'goalsFor'"><el-radio-button value="players">球员榜</el-radio-button><el-radio-button value="teams">球队榜</el-radio-button></el-radio-group><el-select v-model="rankingMetric"><el-option v-for="field in rankingOptions" :key="field.key" :label="field.label" :value="field.key" /></el-select></div>
        <el-table :data="pageRows(rankingRows)" stripe empty-text="暂无已核定榜单数据"><el-table-column prop="rank" label="排名" width="75" /><el-table-column prop="name" :label="rankingKind === 'players' ? '球员' : '球队'" min-width="180" /><el-table-column v-if="rankingKind === 'players'" label="历史球队" min-width="220"><template #default="{row}">{{ (row.teamIds || []).map(teamName).join('、') }}</template></el-table-column><el-table-column :label="rankingLabel" width="100"><template #default="{row}">{{ numeric(row.value) }}</template></el-table-column></el-table>
        <p v-if="rankingUnverified" class="note">{{ rankingUnverified }} 条指标待核定，未列入排名</p><ListPager :total="rankingRows.length" />
      </template>
      <template v-else-if="tab === 'teams'">
        <div class="table-tools"><el-input v-model="keyword" clearable placeholder="搜索球队、城市" /><el-select v-model="directoryGroup" clearable placeholder="全部分组"><el-option v-for="group in groups" :key="group.key" :label="group.label" :value="group.key" /></el-select></div>
        <el-table :data="pageRows(teamRows)" stripe empty-text="暂无球队"><el-table-column prop="name" label="球队" min-width="180" /><el-table-column prop="city" label="城市" width="120" /><el-table-column label="参赛分组" min-width="210"><template #default="{row}">{{ teamGroups(row.id) }}</template></el-table-column><el-table-column label="正式记录" width="95"><template #default="{row}">{{ recordCount(row.id) }}</template></el-table-column><el-table-column label="球员档案" width="100"><template #default="{row}">{{ directoryCount(row.id) }}</template></el-table-column><el-table-column label="球队编号" min-width="200"><template #default="{row}">{{ row.id }}</template></el-table-column></el-table><ListPager :total="teamRows.length" />
      </template>
      <template v-else-if="tab === 'players'">
        <div class="table-tools"><el-input v-model="keyword" clearable placeholder="搜索球员、编号" /><el-select v-model="teamFilter" filterable clearable placeholder="全部球队"><el-option v-for="team in availableTeams" :key="team.id" :label="team.name" :value="team.id" /></el-select></div>
        <el-table :data="pageRows(playerRows)" stripe empty-text="暂无球员"><el-table-column prop="name" label="球员" min-width="140" /><el-table-column label="当前球队" min-width="175"><template #default="{row}">{{ teamName(row.teamId) }}</template></el-table-column><el-table-column label="球衣号" width="80"><template #default="{row}">{{ row.jerseyNumber ?? '—' }}</template></el-table-column><el-table-column label="位置" width="95"><template #default="{row}">{{ positionName(row.position) }}</template></el-table-column><el-table-column label="资料状态" width="110"><template #default="{row}">{{ playerHasRecords(row.id) ? '有正式记录' : '暂无正式记录' }}</template></el-table-column><el-table-column label="球员编号" min-width="210"><template #default="{row}">{{ row.playerCode || row.id }}</template></el-table-column></el-table><ListPager :total="playerRows.length" />
      </template>
      <template v-else-if="tab === 'records'">
        <div class="table-tools"><el-input v-model="keyword" clearable placeholder="搜索比赛、球队、球员" /><el-select v-model="eventFilter" clearable placeholder="全部事件"><el-option v-for="(name,key) in eventNames" :key="key" :label="name" :value="key" /></el-select></div>
        <el-table :data="pageRows(eventRows)" stripe empty-text="暂无判罚或比赛事件"><el-table-column prop="matchName" label="比赛" min-width="220" /><el-table-column prop="groupName" label="分组" width="110" /><el-table-column label="分钟" width="75"><template #default="{row}">{{ row.minute ?? '—' }}</template></el-table-column><el-table-column label="事件" width="110"><template #default="{row}">{{ eventNames[row.type] || row.type }}</template></el-table-column><el-table-column prop="teamName" label="球队" min-width="140" /><el-table-column label="球员" min-width="130"><template #default="{row}">{{ row.playerName || (row.playerId ? '姓名待补充' : '待关联球员') }}</template></el-table-column><el-table-column label="结果状态" width="115"><template #default="{row}">{{ eventStatuses[row.status] || '待核定' }}</template></el-table-column><el-table-column label="统计采用" width="90"><template #default="{row}">{{ row.counted ? '计入' : '未计入' }}</template></el-table-column></el-table><ListPager :total="eventRows.length" />
      </template>
      <template v-else>
        <p class="note">排除测试比赛 {{ result.coverage.excludedTestMatches }} 场 · 含测试球员 {{ result.coverage.testPlayerMatches }} 场 · 待审核 {{ result.coverage.pendingReviewCount }} 场</p>
        <el-table :data="pageRows(result.issues || [])" stripe empty-text="当前范围没有质量问题"><el-table-column label="问题" min-width="210"><template #default="{row}">{{ issueNames[row.code] || row.code }}</template></el-table-column><el-table-column prop="matchId" label="比赛编号" min-width="200" /><el-table-column prop="eventId" label="事件编号" min-width="180" /><el-table-column prop="playerId" label="球员编号" min-width="180" /><el-table-column label="操作" width="110"><template #default="{row}"><DurationVerification :issue="row" :allowed="catalog.accessScope==='platform'" @saved="query" /></template></el-table-column></el-table><ListPager :total="result.issues.length" />
      </template>
      <details class="version"><summary>数据版本</summary><p>{{ result.schemaVersion }} · {{ result.metricVersion }} · {{ result.dataVersion }}</p></details>
    </template>
  </section>
</template>

<script setup>
import { computed,defineComponent,h,onBeforeUnmount,onMounted,reactive,ref,watch } from 'vue'
import { ElPagination } from 'element-plus'
import DurationVerification from './DurationVerification.vue'
import { callFunction } from '@/utils/cloud'
const loading=ref(false),error=ref(''),lastLoadedAt=ref(null),result=ref(null),catalog=reactive({teams:[],players:[],tournaments:[],divisions:[],rosters:[]})
const scope=reactive({tournamentId:'',divisionId:'',mode:'official'}),tab=ref('standings'),keyword=ref(''),groupKey=ref(''),directoryGroup=ref(''),teamFilter=ref(''),eventFilter=ref(''),page=ref(1),rankingKind=ref('players'),rankingMetric=ref('goals')
let requestId=0
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:'—'
const playerOptions=[{key:'goals',label:'进球榜'},{key:'assists',label:'助攻榜'},{key:'appearances',label:'出场榜'},{key:'starts',label:'首发榜'},{key:'minutesPlayed',label:'出场时间榜'},{key:'yellowCards',label:'黄牌榜'},{key:'redCards',label:'红牌榜'}]
const teamOptions=[{key:'wins',label:'胜场榜'},{key:'goalsFor',label:'进球榜'},{key:'goalsAgainst',label:'失球榜'},{key:'yellowCards',label:'黄牌榜'},{key:'redCards',label:'红牌榜'}]
const standingFields=[{key:'played',label:'场次'},{key:'win',label:'胜'},{key:'draw',label:'平'},{key:'loss',label:'负'},{key:'goalsFor',label:'进球'},{key:'goalsAgainst',label:'失球'},{key:'goalDifference',label:'净胜球'},{key:'points',label:'积分'}]
const eventNames={goal:'进球',assist:'助攻',own_goal:'乌龙球',penalty_scored:'点球进球',penalty_missed:'点球未进',penalty:'点球判罚',yellow_card:'黄牌',red_card:'红牌',second_yellow:'二黄罚下',substitution:'换人',foul:'犯规',offside:'越位',injury:'受伤',forfeit:'弃赛'}
const eventStatuses={official:'正式',provisional:'待审核',unverified:'待核定',excluded:'已排除'}
const issueNames={EVENT_COVERAGE_PARTIAL:'事件记录不足',EVENT_PLAYER_UNLINKED:'事件球员未关联',EVENT_TEAM_UNLINKED:'事件球队未关联',EVENT_PLAYER_TEAM_CONFLICT:'球员与球队不匹配',SCORE_MISSING:'比分未核定',MATCH_DURATION_UNPROVEN:'比赛时长缺少依据',LINEUP_MISSING:'比赛阵容缺失',MATCH_ORIGIN_UNVERIFIED:'比赛来源待核定',TEST_PLAYER_MATCH_EXCLUDED:'含测试球员，未计入正式统计'}
const teamsById=computed(()=>new Map(catalog.teams.map(row=>[row.id,row]))),tournamentsById=computed(()=>new Map(catalog.tournaments.map(row=>[row.id,row])))
const teamName=id=>teamsById.value.get(id)?.name||'球队待补充'
const positionName=value=>({GK:'守门员',DF:'后卫',MF:'中场',FW:'前锋'}[value]||value||'—')
const divisions=computed(()=>catalog.divisions.filter(row=>!scope.tournamentId||row.tournamentId===scope.tournamentId))
const groups=computed(()=>(result.value?.standings||[]).map(row=>({...row,key:JSON.stringify([row.tournamentId,row.divisionId,row.groupName]),label:[tournamentsById.value.get(row.tournamentId)?.name,row.divisionName,row.groupName].filter(Boolean).join(' · ')})))
const shownGroups=computed(()=>groups.value.filter(row=>!groupKey.value||row.key===groupKey.value).map(row=>({...row,officialTeams:result.value.scope.mode==='provisional'?row.previewTeams:row.officialTeams})))
const rankingOptions=computed(()=>rankingKind.value==='players'?playerOptions:teamOptions),rankingLabel=computed(()=>rankingOptions.value.find(row=>row.key===rankingMetric.value)?.label||'指标')
const rankingTable=computed(()=>result.value?.rankings?.[rankingKind.value]?.[rankingMetric.value]),rankingRows=computed(()=>rankingTable.value?.rows||[]),rankingUnverified=computed(()=>rankingTable.value?.unverifiedCount||0)
const appliedTournament=computed(()=>result.value?.scope?.tournamentId||''),appliedDivision=computed(()=>result.value?.scope?.divisionId||'')
function matchesKeyword(values){const text=keyword.value.trim().toLowerCase();return !text||values.join(' ').toLowerCase().includes(text)}
function groupTeamIds(key){return new Set(groups.value.find(row=>row.key===key)?.officialTeams.map(row=>row.teamId)||[])}
const availableTeams=computed(()=>catalog.teams.filter(team=>{
  if(directoryGroup.value&&!groupTeamIds(directoryGroup.value).has(team.id))return false
  return !appliedTournament.value||(team.tournamentLinks||[]).some(link=>link.tournamentId===appliedTournament.value&&(!appliedDivision.value||link.divisionId===appliedDivision.value))||(result.value.teams||[]).some(row=>row.teamId===team.id)
}))
const teamRows=computed(()=>availableTeams.value.filter(team=>matchesKeyword([team.name,team.city])))
const selectedRosterIds=computed(()=>new Set([...catalog.rosters.filter(row=>row.tournamentId===appliedTournament.value&&(!appliedDivision.value||row.divisionId===appliedDivision.value)&&(!teamFilter.value||row.teamId===teamFilter.value)).flatMap(row=>row.playerIds),...(result.value?.players||[]).filter(row=>!teamFilter.value||row.teamId===teamFilter.value).map(row=>row.playerId)]))
const playerRows=computed(()=>catalog.players.filter(player=>matchesKeyword([player.name,player.playerCode,player.id])&&(appliedTournament.value?selectedRosterIds.value.has(player.id):(!teamFilter.value||player.teamId===teamFilter.value))))
const eventRows=computed(()=>(result.value?.records||[]).filter(row=>(!eventFilter.value||row.type===eventFilter.value)&&matchesKeyword([row.matchName,row.playerName,row.teamName])))
function teamGroups(id){return groups.value.filter(group=>group.officialTeams.some(row=>row.teamId===id)).map(group=>group.divisionName+' · '+group.groupName).join('、')||'暂无正式分组记录'}
function recordCount(id){return numeric(result.value?.rankings?.teamTotals?.find(row=>row.id===id)?.metrics.played)}
function directoryCount(id){return catalog.players.filter(row=>row.teamId===id).length}
function playerHasRecords(id){return (result.value?.players||[]).some(row=>row.playerId===id)}
function pageRows(rows){return rows.slice((page.value-1)*20,page.value*20)}
const ListPager=defineComponent({props:{total:Number},setup:props=>()=>props.total>20?h(ElPagination,{currentPage:page.value,'onUpdate:currentPage':value=>page.value=value,pageSize:20,total:props.total,layout:'total, prev, pager, next'}):null})
watch([tab,keyword,teamFilter,directoryGroup,eventFilter,rankingMetric,rankingKind],()=>{page.value=1})
function changeTournament(){scope.divisionId='';groupKey.value='';directoryGroup.value='';teamFilter.value=''}
async function api(data){const reply=await callFunction('dataCenter',data);if(!reply.success)throw new Error(reply.error||'数据读取失败，请重试');return reply}
async function query(){const id=++requestId;loading.value=true;error.value='';try{const reply=await api({action:scope.tournamentId?'tournamentStatistics':'platformStatistics',scope:{mode:scope.mode,...(scope.tournamentId?{tournamentId:scope.tournamentId}:{}),...(scope.divisionId?{divisionId:scope.divisionId}:{})}});if(id!==requestId)return;result.value=reply;lastLoadedAt.value=new Date(reply.generatedAt);page.value=1;groupKey.value='';directoryGroup.value=''}catch(cause){if(id===requestId)error.value=cause.message}finally{if(id===requestId)loading.value=false}}
async function refresh(){loading.value=true;error.value='';try{const reply=await api({action:'catalog'});Object.assign(catalog,reply);await query()}catch(cause){error.value=cause.message;loading.value=false}}
function download(){if(!result.value)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result.value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='数据中心-'+result.value.dataVersion+'.json';link.click();URL.revokeObjectURL(url)}
onMounted(refresh);onBeforeUnmount(()=>{requestId++});defineExpose({refresh,loading,lastLoadedAt})
</script>

<style scoped>
.platform-data{background:#fff;padding:20px;border:1px solid #e0e7e3;color:#172a20}.filters,.table-tools{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin-bottom:16px}.filters label{display:grid;gap:6px;font-size:12px}.filters .el-select{width:220px}.table-tools .el-input{width:280px}.table-tools .el-select{width:250px}.meta{display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:12px;color:#65766a;margin:10px 0 18px}.group-section{margin-top:24px}.group-section h2{font-size:15px;margin:0 0 12px}.empty{padding:48px 16px;text-align:center;color:#748178}.note,.version{font-size:12px;color:#68796e}.version{margin-top:24px}.version p{overflow-wrap:anywhere}.platform-data :deep(.el-pagination){margin-top:18px}@media(max-width:760px){.platform-data{padding:14px}.filters label,.filters .el-select,.table-tools .el-input,.table-tools .el-select{width:100%}}
</style>
