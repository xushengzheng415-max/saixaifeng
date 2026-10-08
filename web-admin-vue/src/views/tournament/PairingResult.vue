<template>
  <section class="pairing-page" v-loading="loading">
    <header class="pairing-header"><h1>对阵预览</h1><div><el-button text @click="backDraw">返回分组</el-button><el-button plain @click="goSchedule('settings')">自主编排</el-button><el-button plain @click="goSchedule('imports')">上传赛程</el-button><el-button type="success" :loading="exporting" :disabled="!matches.length" @click="downloadTemplate">下载赛程表</el-button></div></header>
    <div class="pairing-toolbar"><el-select v-model="stageFilter" clearable placeholder="全部阶段"><el-option v-for="stage in stages" :key="stage" :label="stage" :value="stage" /></el-select><el-input v-model="keyword" clearable placeholder="搜索球队或来源" /><span>{{ filteredMatches.length }} / {{ matches.length }} 场</span></div>
    <a v-if="download" class="download-link" :href="download.url" :download="download.name">下载 {{ download.name }}</a>
    <el-table :data="filteredMatches" empty-text="暂无已确认对阵">
      <el-table-column label="场序" width="70"><template #default="{row}">{{ row.matchNo || row.matchIndex || '—' }}</template></el-table-column>
      <el-table-column label="阶段" width="160"><template #default="{row}">{{ stageLabel(row) }}</template></el-table-column>
      <el-table-column label="组别" width="110"><template #default="{row}">{{ row.divisionName || divisionName }}</template></el-table-column>
      <el-table-column label="小组" width="80"><template #default="{row}">{{ row.groupName || row.group || row.pool || '—' }}</template></el-table-column>
      <el-table-column label="比赛对阵" min-width="280"><template #default="{row}">{{ teamName(row,'home') }}　VS　{{ teamName(row,'away') }}</template></el-table-column>
      <el-table-column label="日期" width="110"><template #default="{row}">{{ row.matchDate || '待填写' }}</template></el-table-column>
      <el-table-column label="时间" width="85"><template #default="{row}">{{ row.matchTime || '待填写' }}</template></el-table-column>
      <el-table-column label="场地" width="110"><template #default="{row}">{{ row.venue || '待填写' }}</template></el-table-column>
    </el-table>
  </section>
</template>
<script setup>
import {computed,onMounted,onBeforeUnmount,ref} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import {queryList,queryById} from '../../utils/cloud'
const route=useRoute(),router=useRouter(),tournamentId=String(route.params.id || ''),divisionId=String(route.query.divisionId || 'default')
const divisionName=String(route.query.divisionName || '当前组别'),loading=ref(false),matches=ref([]),tournament=ref({}),stageFilter=ref(''),keyword=ref(''),exporting=ref(false),download=ref(null)
function stageLabel(row){return row.phase==='group' || row.stage==='group' ? '小组赛' : row.roundName || row.scheduleStageName || row.stageName || '联赛'}
function teamName(row,side){return row[`${side}TeamName`] || row[`${side}SourceLabel`] || '待产生'}
const stages=computed(()=>[...new Set(matches.value.map(stageLabel))])
const filteredMatches=computed(()=>matches.value.filter(row=>(!stageFilter.value || stageLabel(row)===stageFilter.value) && (!keyword.value || `${teamName(row,'home')} ${teamName(row,'away')}`.includes(keyword.value))))
function backDraw(){router.push({path:`/tournaments/${tournamentId}/draw`,query:{divisionId,mode:'quick',view:'result',format:'tournament'}})}
function goSchedule(view){router.push({path:`/tournaments/${tournamentId}/matches`,query:{divisionId,view}})}
async function downloadTemplate(){
  exporting.value=true
  try{
    const module=await import('xlsx'),XLSX=module.default || module
    const headers=['比赛ID','组别ID','场序','比赛日期','星期','时间','组别','阶段','比赛对阵','场地']
    const rows=matches.value.map(row=>[row._id,divisionId,row.matchNo || row.matchIndex || '',row.matchDate || '',row.matchDate ? ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date(`${row.matchDate}T00:00:00`).getDay()] : '',row.matchTime || '',row.divisionName || divisionName,stageLabel(row),`${teamName(row,'home')} VS ${teamName(row,'away')}`,row.venue || ''])
    const sheet=XLSX.utils.aoa_to_sheet([[`${tournament.value.name || '赛事'}赛程表`],headers,...rows]);sheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}}];sheet['!cols']=[{hidden:true},{hidden:true},{wch:8},{wch:14},{wch:10},{wch:10},{wch:16},{wch:22},{wch:46},{wch:16}]
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'赛程填写')
    if(download.value)URL.revokeObjectURL(download.value.url)
    const bytes=XLSX.write(book,{bookType:'xlsx',type:'array'}),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),name=`${tournament.value.name || '赛事'}-${divisionName}-赛程填写表.xlsx`
    download.value={url,name};const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();ElMessage.success('赛程表已生成')
  }catch(error){ElMessage.error(error.message || '生成失败，请重试')}finally{exporting.value=false}
}
onMounted(async()=>{loading.value=true;try{const [event,rows]=await Promise.all([queryById('tournaments',tournamentId),queryList('matches',{where:{tournamentId,divisionId},limit:1000})]);tournament.value=event || {};matches.value=(rows || []).filter(row=>row.status!=='cancelled' && !row.demoLegacyPairing).sort((a,b)=>Number(a.matchNo || a.matchIndex || 0)-Number(b.matchNo || b.matchIndex || 0))}catch(error){ElMessage.error(error.message || '对阵加载失败')}finally{loading.value=false}})
onBeforeUnmount(()=>{if(download.value)URL.revokeObjectURL(download.value.url)})
</script>
<style scoped>
.pairing-page{padding:24px;color:#26352c;background:#f7f9f8;min-height:100%}.pairing-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}.pairing-header h1{margin:0;font-size:26px}.pairing-header>div{display:flex;gap:8px;flex-wrap:wrap}.pairing-header :deep(.el-button + .el-button){margin-left:0}.pairing-toolbar{display:flex;align-items:center;gap:12px;margin-bottom:14px}.pairing-toolbar .el-select{width:180px}.pairing-toolbar .el-input{width:260px}.pairing-toolbar>span{margin-left:auto;font-size:13px;color:#66746b}.download-link{display:block;margin-bottom:12px;color:#087b43;font-size:13px}@media(max-width:900px){.pairing-header{align-items:flex-start;flex-direction:column}.pairing-toolbar{flex-wrap:wrap}}
</style>
