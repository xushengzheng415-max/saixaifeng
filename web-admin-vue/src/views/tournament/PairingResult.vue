<template>
  <section class="pairing-page" v-loading="loading">
    <header class="schedule-center-header">
      <div class="center-heading"><el-button text @click="emit('navigate','map')">返回比赛地图</el-button><h1>赛程中心</h1><div class="center-context"><strong>{{ tournament.name || '当前赛事' }}</strong><el-tag effect="plain">{{ divisionName }}</el-tag><span>已编排 {{ scheduledCount }} / {{ matches.length }} 场</span></div></div>
      <div class="center-actions"><el-button type="danger" plain :loading="resetting" :disabled="!resetCandidates.length || loading" @click="resetSchedule">重置赛事时间</el-button><el-button plain @click="goSchedule('settings')">自主编排</el-button><el-button plain @click="goSchedule('imports')">上传赛程</el-button><el-button type="success" :loading="exporting" :disabled="!filteredMatches.length || resetting" @click="downloadTemplate">下载赛程表</el-button></div>
    </header>
    <div class="pairing-toolbar">
      <el-select v-model="divisionId" aria-label="筛选组别" @change="value => {clearFilters();emit('scope',value)}"><el-option label="全部组别" value="all" /><el-option v-for="division in divisions" :key="division.id" :label="division.name" :value="String(division.id)" /></el-select>
      <el-select v-model="stageFilter" clearable placeholder="全部阶段" aria-label="筛选比赛阶段"><el-option v-for="stage in stages" :key="stage" :label="stage" :value="stage" /></el-select>
      <el-select v-model="groupFilter" clearable placeholder="全部小组" aria-label="筛选小组"><el-option v-for="group in groups" :key="group" :label="group" :value="group" /><el-option label="无小组" value="__none" /></el-select>
      <el-select v-model="dateFilter" clearable placeholder="全部日期" aria-label="筛选比赛日期"><el-option v-for="date in dates" :key="date" :label="date" :value="date" /><el-option label="待定日期" value="__none" /></el-select>
      <el-select v-model="venueFilter" clearable placeholder="全部场地" aria-label="筛选场地"><el-option v-for="venue in venues" :key="venue" :label="venue" :value="venue" /><el-option label="待定场地" value="__none" /></el-select>
      <el-select v-model="scheduleFilter" clearable placeholder="全部状态" aria-label="筛选排期状态"><el-option label="已编排" value="scheduled" /><el-option label="待编排" value="pending" /></el-select>
      <el-select v-model="matchStatus" clearable placeholder="比赛状态" aria-label="筛选比赛状态"><el-option v-for="status in ['待开始','进行中','已完赛','完赛未补录','待复核','已归档']" :key="status" :label="status" :value="status" /></el-select>
      <el-input v-model="keyword" clearable placeholder="搜索场序、球队或来源" aria-label="搜索比赛" />
      <el-button text :disabled="!hasFilters" @click="clearFilters">清空筛选</el-button><span>{{ filteredMatches.length }} / {{ matches.length }} 场</span>
    </div>
    <a v-if="download" class="download-link" :href="download.url" :download="download.name">下载 {{ download.name }}</a>
    <el-table :data="filteredMatches" empty-text="当前筛选下没有比赛" stripe class="center-match-table" row-key="_id" :row-class-name="rowClass">
      <el-table-column label="场序" width="66" align="center"><template #default="{row}">{{ row.matchSequence ?? row.matchNo ?? row.matchIndex ?? '—' }}</template></el-table-column>
      <el-table-column label="阶段" width="128"><template #default="{row}">{{ stageLabel(row) }}</template></el-table-column>
      <el-table-column label="组别" width="104"><template #default="{row}">{{ row.divisionName || divisionName }}</template></el-table-column>
      <el-table-column label="小组" width="72" align="center"><template #default="{row}">{{ row.groupName || row.group || row.pool || '—' }}</template></el-table-column>
      <el-table-column label="比赛对阵" min-width="280"><template #default="{row}">{{ teamName(row,'home') }}　VS　{{ teamName(row,'away') }}</template></el-table-column>
      <el-table-column label="日期" width="114" align="center"><template #default="{row}">{{ row.matchDate || '待定' }}</template></el-table-column>
      <el-table-column label="时间" width="78" align="center"><template #default="{row}">{{ row.matchTime || '待定' }}</template></el-table-column>
      <el-table-column label="场地" width="100" align="center"><template #default="{row}">{{ row.venue || '待定' }}</template></el-table-column>
      <el-table-column label="排期状态" width="92" align="center"><template #default="{row}"><el-tag size="small" :type="isScheduled(row) ? 'success' : 'warning'" effect="plain">{{ isScheduled(row) ? '已编排' : '待编排' }}</el-tag></template></el-table-column>
      <el-table-column label="比赛状态" width="90" align="center"><template #default="{row}">{{ stateLabel?.(row) || '待开始' }}</template></el-table-column>
      <el-table-column label="裁判" width="90"><template #default="{row}">{{ row.refereeCrew?.mainReferee?.name || '未指派' }}</template></el-table-column>
      <el-table-column label="操作" width="110" fixed="right"><template #default="{row}"><el-button link type="success" :disabled="!canAdjust?.(row)" @click="emit('edit',row)">调时间</el-button><el-dropdown trigger="click"><el-button link>更多</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item :disabled="!canAdjust?.(row)" @click="emit('sequence',row)">改场序</el-dropdown-item><el-dropdown-item :disabled="!canAssign?.(row)" @click="emit('referee',row)">安排裁判</el-dropdown-item><el-dropdown-item :disabled="!canAssign?.(row)" @click="emit('kit',row)">球衣颜色</el-dropdown-item><el-dropdown-item @click="emit('detail',row)">比赛详情</el-dropdown-item></el-dropdown-menu></template></el-dropdown></template></el-table-column>
    </el-table>
  </section>
</template>
<script setup>
import {computed,onBeforeUnmount,ref} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {ElMessage,ElMessageBox} from 'element-plus'
import {callFunction} from '../../utils/cloud'
import {isDemoMode} from '../../utils/demoMode'
import {createScheduleTemplateWorkbook} from '../../utils/scheduleTemplateWorkbook.mjs'
const props=defineProps({rows:{type:Array,default:()=>[]},event:{type:Object,default:()=>({})},divisions:{type:Array,default:()=>[]},canAdjust:Function,canAssign:Function,stateLabel:Function,focusId:String})
const emit=defineEmits(['edit','sequence','referee','kit','detail','reset','navigate','scope'])
const route=useRoute(),router=useRouter(),tournamentId=String(route.params.id || '')
const divisionId=ref(String(route.query.divisionId || 'all'))
const divisionName=computed(()=>props.divisions.find(row=>String(row.id)===divisionId.value)?.name || (divisionId.value==='all'?'全部组别':String(route.query.divisionName || '当前组别')))
const loading=ref(false),tournament=computed(()=>props.event),matches=computed(()=>props.rows.filter(row=>divisionId.value==='all' || String(row.divisionId || 'default')===divisionId.value))
const stageFilter=ref(''),keyword=ref(''),exporting=ref(false),download=ref(null)
const groupFilter=ref(''),dateFilter=ref(''),venueFilter=ref(''),scheduleFilter=ref(''),resetting=ref(false),matchStatus=ref('')
function rowClass({row}){return String(row._id)===props.focusId?'next-match-row':''}
function groupName(row){return String(row.groupName || row.group || row.pool || '')}
function isScheduled(row){return Boolean(row.matchDate && row.matchTime && row.venue)}
const scheduledCount=computed(()=>matches.value.filter(isScheduled).length)
const groups=computed(()=>[...new Set(matches.value.map(groupName).filter(Boolean))].sort())
const dates=computed(()=>[...new Set(matches.value.map(row=>row.matchDate).filter(Boolean))].sort())
const venues=computed(()=>[...new Set(matches.value.map(row=>row.venue).filter(Boolean))].sort())
const hasFilters=computed(()=>Boolean(stageFilter.value || groupFilter.value || dateFilter.value || venueFilter.value || scheduleFilter.value || keyword.value || matchStatus.value))
function clearFilters(){stageFilter.value='';groupFilter.value='';dateFilter.value='';venueFilter.value='';scheduleFilter.value='';keyword.value='';matchStatus.value=''}
const canReset=row=>['scheduled','pending','not_started','upcoming',''].includes(String(row.status || '').toLowerCase()) && !row.executionSnapshot && !row.refereeRecordLocked && !row.schedulePublished && !row.published && !(row.events || []).length
const resetCandidates=computed(()=>divisionId.value==='all'?[]:matches.value.filter(row=>canReset(row) && (row.matchDate || row.matchTime || row.venue)))
function stageLabel(row){return row.phase==='group' || row.stage==='group' ? '小组赛' : row.roundName || row.scheduleStageName || row.stageName || '联赛'}
function teamName(row,side){return row[`${side}TeamName`] || row[`${side}SourceLabel`] || '待产生'}
const stages=computed(()=>[...new Set(matches.value.map(stageLabel))])
const filteredMatches=computed(()=>matches.value.filter(row=>
  (!matchStatus.value || props.stateLabel?.(row)===matchStatus.value) &&
  (!stageFilter.value || stageLabel(row)===stageFilter.value) &&
  (!groupFilter.value || (groupFilter.value==='__none' ? !groupName(row) : groupName(row)===groupFilter.value)) &&
  (!dateFilter.value || (dateFilter.value==='__none' ? !row.matchDate : row.matchDate===dateFilter.value)) &&
  (!venueFilter.value || (venueFilter.value==='__none' ? !row.venue : row.venue===venueFilter.value)) &&
  (!scheduleFilter.value || (scheduleFilter.value==='scheduled' ? isScheduled(row) : !isScheduled(row))) &&
  (!keyword.value.trim() || `${row.matchSequence ?? row.matchNo ?? row.matchIndex ?? ''} ${teamName(row,'home')} ${teamName(row,'away')}`.toLowerCase().includes(keyword.value.trim().toLowerCase()))
))
async function resetSchedule(){
  if(resetting.value || !resetCandidates.value.length)return
  const candidates=[...resetCandidates.value]
  try {
    await ElMessageBox.confirm(`将清空「${divisionName.value}」中${candidates.length}场未开赛比赛的日期、开赛时间和场地，对阵及场序保留。`, '重置赛事时间',{type:'warning',confirmButtonText:'确认重置',cancelButtonText:'取消'})
    resetting.value=true
    let resetCount=0,failures=[]
    if(isDemoMode(tournamentId)) {
      const result=await callFunction('generateSchedule',{action:'resetDivisionSchedule',tournamentId,divisionId:divisionId.value,matchIds:candidates.map(row=>row._id)})
      if(!result?.success)throw new Error(result?.message || '重置失败')
      resetCount=result.resetCount
    } else {
      for(const match of candidates)try{const result=await callFunction('updateMatch',{matchId:match._id,data:{matchDate:'',matchTime:'',venue:'',date:'',startTime:'',timeSlot:'',scheduleStatus:'unassigned'},adjustmentType:'unassign'});if(!result?.success)throw new Error(result?.message || result?.error || '重置失败');resetCount++}catch(error){failures.push(`第${match.matchNo || match.matchIndex || '—'}场：${error.message}`)}
    }
    if(download.value){URL.revokeObjectURL(download.value.url);download.value=null}
    clearFilters();emit('reset')
    if(failures.length)ElMessage.error({message:`已重置${resetCount}场，${failures.join('；')}`,duration:8000})
    else ElMessage.success(`已重置${resetCount}场比赛时间`)
  } catch(error){if(error!=='cancel' && error!=='close')ElMessage.error(error.message || '重置失败，请刷新重试')}
  finally{resetting.value=false}
}
function goSchedule(view){emit('navigate',view)}
async function downloadTemplate(){
  exporting.value=true
  try{
    const {buffer:bytes,filename:name}=await createScheduleTemplateWorkbook({tournament:tournament.value,matches:filteredMatches.value,divisionName:divisionName.value,stageLabel,teamName})
    if(download.value)URL.revokeObjectURL(download.value.url)
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))

    download.value={url,name};const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();ElMessage.success('赛程表已生成')
  }catch(error){ElMessage.error(error.message || '生成失败，请重试')}finally{exporting.value=false}
}

onBeforeUnmount(()=>{if(download.value)URL.revokeObjectURL(download.value.url)})
</script>
<style scoped>
.pairing-page{padding:0;color:#26352c;background:#f7f9f8;min-height:100%;max-width:1400px;margin:0 auto}.schedule-center-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 0 20px;margin-bottom:18px;border-bottom:1px solid #dce5df}.center-heading h1{margin:8px 0 10px;font-size:26px}.center-heading>.el-button{padding:0;height:auto;color:#617469}.center-context{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.center-context strong{font-size:14px;font-weight:500}.center-context>span{font-size:12px;color:#66746b}.center-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.center-actions :deep(.el-button + .el-button){margin-left:0}.pairing-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px;padding:12px 0}.pairing-toolbar .el-select{width:140px}.pairing-toolbar .el-select:first-child{width:160px}.pairing-toolbar .el-input{width:220px}.pairing-toolbar>span{margin-left:auto;font-size:13px;color:#66746b;white-space:nowrap}.download-link{display:block;margin-bottom:12px;color:#087b43;font-size:13px}.center-match-table :deep(th.el-table__cell){background:#edf4ef;color:#355342;font-weight:600}.center-match-table :deep(.el-table__cell){padding:10px 0}.center-match-table :deep(.cell){font-size:13px}.center-match-table{border:1px solid #dfe7e2;border-radius:6px}@media(max-width:1000px){.schedule-center-header{align-items:flex-start;flex-direction:column}.center-actions{justify-content:flex-start}.pairing-toolbar .el-select{width:130px}.pairing-toolbar .el-input{flex:1;min-width:200px}}
.center-match-table :deep(.next-match-row td){background:#edf8f1}.center-match-table :deep(.el-dropdown){margin-left:10px}
</style>
