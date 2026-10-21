<template>
  <section class="pairing-page" v-loading="loading">
    <header class="schedule-center-header">
      <div class="center-heading"><el-button text @click="emit('navigate','map')">返回比赛地图</el-button><h1>赛程中心</h1><div class="center-context"><strong>{{ tournament.name || '当前赛事' }}</strong><el-tag effect="plain">{{ divisionName }}</el-tag><span>已编排 {{ scheduledCount }} / {{ matches.length }} 场</span></div></div>
      <div class="center-actions"><el-button type="danger" plain :loading="resetting" :disabled="!resetCandidates.length || loading" @click="resetSchedule">重置赛事时间</el-button><el-button plain @click="goSchedule('settings')">赛程设置</el-button><el-button plain @click="goSchedule('imports')">上传赛程</el-button><el-button type="warning" plain @click="emit('navigate','referees')"><el-icon><MagicStick /></el-icon>裁判中心</el-button><el-tooltip :disabled="!exportDisabledReason" :content="exportDisabledReason" placement="bottom"><span><el-button type="warning" :disabled="Boolean(exportDisabledReason)" @click="openScheduleExport">导出赛程表</el-button></span></el-tooltip><el-button type="success" :loading="exporting" :disabled="!filteredMatches.length || resetting" @click="downloadTemplate">下载赛程表</el-button></div>
    </header>
    <section class="method-strip">
      <button type="button" class="method-card" @click="goSchedule('imports')"><span class="method-index">1</span><span class="method-text"><b>上传赛程表</b><small>下载赛程填写表，线下排好后整表上传识别</small></span></button>
      <button type="button" class="method-card" @click="emit('navigate','map')"><span class="method-index">2</span><span class="method-text"><b>手动排赛程</b><small>进入比赛地图，把待排比赛拖到场地时间格</small></span></button>
      <button type="button" class="method-card" :disabled="!pendingCount" @click="emit('navigate','map',{autostart:true})"><span class="method-index">3</span><span class="method-text"><b>自动排赛程</b><small>按公共日历和组别策略一键生成全部赛程</small></span></button>
    </section>
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

    <el-dialog v-model="exportVisible" title="导出赛程表" width="min(1120px,96vw)" class="schedule-export-dialog" :close-on-click-modal="false">
      <div class="export-toolbar">
        <el-radio-group v-model="exportOrientation" size="small"><el-radio-button value="portrait">A4 竖版</el-radio-button><el-radio-button value="landscape">A4 横版</el-radio-button></el-radio-group>
        <span class="export-summary">共 {{ exportSheet.rows.length }} 场 · 赛程日期 {{ exportSheet.meta.dateRange }} · {{ exportSheet.meta.venues.length }} 个场地</span>
      </div>
      <el-alert v-if="exportNotices.length" type="warning" :closable="false" :title="exportNotices.join('；')" />
      <div ref="exportPreviewEl" class="export-preview" :class="exportOrientation">
        <section class="schedule-sheet">
          <h1>赛小蜂足球 · 正式竞赛文件</h1>
          <h2>竞赛日程（{{ exportSheet.meta.divisionName }}）</h2>
          <p class="sheet-meta"><span>赛事：{{ exportSheet.meta.tournamentName }}</span><span>竞赛组别：{{ exportSheet.meta.divisionName }}</span><span>赛程日期：{{ exportSheet.meta.dateRange }}</span><span>场馆：{{ exportSheet.meta.venues.join('、') || '待安排' }}</span><span>方向：{{ exportSheet.meta.orientationLabel }}</span><span>制表日期：{{ exportSheet.meta.preparedAt }}</span></p>
          <table>
            <colgroup><col v-for="column in exportSheet.columns" :key="column.key" :class="`col-${column.key}`" /></colgroup>
            <thead><tr><th v-for="column in exportSheet.columns" :key="column.key">{{ column.label }}</th></tr></thead>
            <tbody>
              <tr v-for="(row,index) in exportSheet.rows" :key="row.id || index">
                <td v-if="exportSheet.dateSpans.has(index)" :rowspan="exportSheet.dateSpans.get(index).span">{{ row.date }}</td>
                <td :class="{ 'is-unscheduled': !row.scheduled }">{{ row.time }}</td>
                <td v-if="exportSheet.roundSpans.has(index)" :rowspan="exportSheet.roundSpans.get(index).span">{{ row.round || '—' }}</td>
                <td>{{ row.division }}</td>
                <td>{{ row.group || '—' }}</td>
                <td class="cell-teams"><b>{{ row.teams.split(' VS ')[0] }}</b><span>VS</span><b>{{ row.teams.split(' VS ').slice(1).join(' VS ') }}</b></td>
                <td :class="{ 'is-unscheduled': !row.scheduled }">{{ row.venue }}</td>
                <td>{{ row.serial }}</td>
              </tr>
              <tr v-if="!exportSheet.rows.length"><td colspan="8" class="sheet-empty">暂无符合当前筛选条件的竞赛日程</td></tr>
            </tbody>
          </table>
          <footer><span>注：{{ exportSheet.meta.note }}</span><span>制表日期：{{ exportSheet.meta.preparedAt }}</span></footer>
        </section>
      </div>
      <template #footer><span class="export-foot-hint">{{ hasFilters ? '当前有筛选条件，导出只包含筛选后的场次；要导出该组全部场次请先清空筛选。' : '页面预览、打印、PDF、Word 与 Excel 使用同一份八列标准日程数据。' }}</span><el-button @click="exportVisible=false">关闭</el-button><el-button :loading="printingExport" @click="printScheduleSheet">打印</el-button><el-button :loading="exportingPdf" @click="runExportPdf">导出 PDF</el-button><el-button :loading="exportingWord" @click="runExportWord">导出 Word</el-button><el-button type="success" :loading="exportingXlsx" @click="runExportXlsx">导出 Excel</el-button></template>
    </el-dialog>
  </section>
</template>
<script setup>
import {computed,onBeforeUnmount,ref} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {ElMessage,ElMessageBox} from 'element-plus'
import {MagicStick} from '@element-plus/icons-vue'
import {callFunction} from '../../utils/cloud'
import {isDemoMode} from '../../utils/demoMode'
import {createScheduleTemplateWorkbook} from '../../utils/scheduleTemplateWorkbook.mjs'
import {buildScheduleSheet,exportScheduleWord,exportScheduleXlsx,normalizeScheduleRows,openSchedulePrint} from '../../utils/scheduleExportWorkbook.mjs'
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
const pendingCount=computed(()=>matches.value.length-scheduledCount.value)
const groups=computed(()=>[...new Set(matches.value.map(groupName).filter(Boolean))].sort())
const dates=computed(()=>[...new Set(matches.value.map(row=>row.matchDate).filter(Boolean))].sort())
const venues=computed(()=>[...new Set(matches.value.map(row=>row.venue).filter(Boolean))].sort())
const hasFilters=computed(()=>Boolean(stageFilter.value || groupFilter.value || dateFilter.value || venueFilter.value || scheduleFilter.value || keyword.value || matchStatus.value))
function clearFilters(){stageFilter.value='';groupFilter.value='';dateFilter.value='';venueFilter.value='';scheduleFilter.value='';keyword.value='';matchStatus.value=''}
const canReset=row=>['scheduled','pending','not_started','upcoming',''].includes(String(row.status || '').toLowerCase()) && !row.executionSnapshot && !row.refereeRecordLocked && !row.schedulePublished && !row.published && !(row.events || []).length
const resetCandidates=computed(()=>divisionId.value==='all'?[]:matches.value.filter(row=>canReset(row) && (row.matchDate || row.matchTime || row.venue)))
const ROUND_DIGITS=['','一','二','三','四','五','六','七','八','九','十']
function chineseRoundLabel(round){const n=Math.max(1,Number(round)||1);if(n<=10)return `第${ROUND_DIGITS[n]}轮`;if(n<20)return `第十${ROUND_DIGITS[n-10]}轮`;return `第${ROUND_DIGITS[Math.floor(n/10)]}十${ROUND_DIGITS[n%10]}轮`}
function stageLabel(row){
  if(row.phase==='group' || row.stage==='group')return '小组赛'
  const named=row.roundName || row.scheduleStageName || row.stageName || ''
  if(named && named!=='联赛')return named
  const phase=String(row.phase || row.stage || '').toLowerCase()
  if(phase==='knockout' || phase==='placement')return '淘汰赛'
  if(Number(row.round)>0)return chineseRoundLabel(row.round)
  return named || '联赛'
}
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

const exportVisible=ref(false),exportOrientation=ref('portrait'),exportingXlsx=ref(false),printingExport=ref(false),exportingPdf=ref(false),exportingWord=ref(false),exportPreviewEl=ref(null)
function divisionLabelOf(match){return props.divisions.find(item=>String(item.id)===String(match.divisionId || 'default'))?.name || match.divisionName || '竞赛组别'}
const exportPendingCount=computed(()=>filteredMatches.value.filter(match=>!match.matchDate || !match.matchTime || !match.venue).length)
const exportDisabledReason=computed(()=>{
  if(!filteredMatches.value.length)return '当前没有可导出的竞赛日程'
  if(exportPendingCount.value)return `还有 ${exportPendingCount.value} 场比赛未排定日期、时间或场地，全部编排完成后才能导出`
  return ''
})
const exportFilters=computed(()=>{
  const active=[]
  if(divisionId.value!=='all')active.push(divisionName.value)
  if(stageFilter.value)active.push(`阶段：${stageFilter.value}`)
  if(groupFilter.value)active.push(`小组：${groupFilter.value==='__none'?'无小组':groupFilter.value}`)
  if(dateFilter.value)active.push(`日期：${dateFilter.value==='__none'?'待定':dateFilter.value}`)
  if(venueFilter.value)active.push(`场地：${venueFilter.value==='__none'?'待定':venueFilter.value}`)
  if(scheduleFilter.value)active.push(`排期：${scheduleFilter.value==='scheduled'?'已编排':'待编排'}`)
  if(matchStatus.value)active.push(`比赛状态：${matchStatus.value}`)
  if(keyword.value.trim())active.push(`关键词：${keyword.value.trim()}`)
  return active
})
const exportSheet=computed(()=>buildScheduleSheet({rows:normalizeScheduleRows({matches:filteredMatches.value,divisionOrder:props.divisions.map(item=>String(item.id)),stageLabel,teamName,groupName,divisionLabel:divisionLabelOf}),tournament:tournament.value,divisionName:divisionName.value,orientation:exportOrientation.value,filters:exportFilters.value}))
const exportNotices=computed(()=>{
  const list=[]
  if(exportSheet.value.meta.unscheduledCount)list.push(`有 ${exportSheet.value.meta.unscheduledCount} 场未排（第${exportSheet.value.meta.unscheduledSerials.join('、')}场），需补齐日期、时间与场地`)
  if(exportSheet.value.meta.conflicts.length)list.push(`存在场地冲突：${exportSheet.value.meta.conflicts.join('；')}`)
  return list
})
function openScheduleExport(){if(exportDisabledReason.value)return ElMessage.warning(exportDisabledReason.value);exportVisible.value=true}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function runExportPdf(){
  if(exportingPdf.value)return
  const sheetEl=exportPreviewEl.value?.querySelector('.schedule-sheet')
  if(!sheetEl)return ElMessage.warning('预览尚未渲染完成，请稍后重试')
  exportingPdf.value=true
  try{
    const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')])
    const orientation=exportOrientation.value
    const canvas=await html2canvas(sheetEl,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false})
    const pdf=new jsPDF({orientation,unit:'mm',format:'a4',compress:true})
    const pageW=orientation==='portrait'?210:297,pageH=orientation==='portrait'?297:210,margin=9
    const imgW=pageW-margin*2,pagePxH=canvas.width*(pageH-margin*2)/imgW
    // 分页切割尽量对齐表格行边界，避免把一行切成两页。
    const sheetRect=sheetEl.getBoundingClientRect()
    const pxPerCss=canvas.width/sheetRect.width
    const rowTops=[...sheetEl.querySelectorAll('tbody tr')].map(tr=>(tr.getBoundingClientRect().top-sheetRect.top)*pxPerCss).filter(top=>top>0).sort((a,b)=>a-b)
    const pages=[];let startY=0
    while(startY<canvas.height-1){
      let endY=Math.min(startY+pagePxH,canvas.height)
      if(endY<canvas.height-1){const boundary=rowTops.filter(top=>top>startY+4&&top<=endY).pop();if(boundary&&boundary>startY+pagePxH*0.35)endY=boundary}
      pages.push({startY,endY});startY=endY
    }
    pages.forEach((page,index)=>{
      const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=Math.ceil(page.endY-page.startY)
      slice.getContext('2d').drawImage(canvas,0,page.startY,canvas.width,slice.height,0,0,canvas.width,slice.height)
      if(index>0)pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg',0.92),'JPEG',margin,margin,imgW,slice.height*imgW/canvas.width)
    })
    const safeName=String(tournament.value.name || '赛事').replace(/[\\/:*?"<>|]/g,'_')
    pdf.save(`${safeName}-竞赛日程-A4${orientation==='portrait'?'竖版':'横版'}.pdf`)
    ElMessage.success('PDF 已导出')
  }catch(error){ElMessage.error(error.message || '导出 PDF 失败，请重试')}
  finally{exportingPdf.value=false}
}
async function runExportWord(){
  if(exportingWord.value)return
  exportingWord.value=true
  try{const {blob,filename}=exportScheduleWord(exportSheet.value,{fileName:tournament.value.name || '赛事'});downloadBlob(blob,filename);ElMessage.success(`已导出 ${filename}`)}
  catch(error){ElMessage.error(error.message || '导出 Word 失败，请重试')}
  finally{exportingWord.value=false}
}
function printScheduleSheet(){
  if(printingExport.value)return
  printingExport.value=true
  try{if(!openSchedulePrint(exportSheet.value))ElMessage.warning('打印预览被浏览器拦截，请允许打开新窗口后重试')}
  catch(error){ElMessage.error(error.message || '打开打印预览失败')}
  finally{printingExport.value=false}
}
async function runExportXlsx(){
  if(exportingXlsx.value)return
  exportingXlsx.value=true
  try{
    const {buffer,filename}=await exportScheduleXlsx({sheet:exportSheet.value,orientation:exportOrientation.value,fileName:tournament.value.name || '赛事'})
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
    ElMessage.success(`已导出 ${filename}`)
  }catch(error){ElMessage.error(error.message || '导出失败，请重试')}
  finally{exportingXlsx.value=false}
}

onBeforeUnmount(()=>{if(download.value)URL.revokeObjectURL(download.value.url)})</script>
<style scoped>
.pairing-page{padding:0;color:#26352c;background:#f7f9f8;min-height:100%;max-width:1400px;margin:0 auto}.schedule-center-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 0 20px;margin-bottom:18px;border-bottom:1px solid #dce5df}.center-heading h1{margin:8px 0 10px;font-size:26px}.center-heading>.el-button{padding:0;height:auto;color:#617469}.center-context{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.center-context strong{font-size:14px;font-weight:500}.center-context>span{font-size:12px;color:#66746b}.center-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.center-actions :deep(.el-button + .el-button){margin-left:0}.pairing-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px;padding:12px 0}.pairing-toolbar .el-select{width:140px}.pairing-toolbar .el-select:first-child{width:160px}.pairing-toolbar .el-input{width:220px}.pairing-toolbar>span{margin-left:auto;font-size:13px;color:#66746b;white-space:nowrap}.download-link{display:block;margin-bottom:12px;color:#087b43;font-size:13px}.center-match-table :deep(th.el-table__cell){background:#edf4ef;color:#355342;font-weight:600}.center-match-table :deep(.el-table__cell){padding:10px 0}.center-match-table :deep(.cell){font-size:13px}.center-match-table{border:1px solid #dfe7e2;border-radius:6px}@media(max-width:1000px){.schedule-center-header{align-items:flex-start;flex-direction:column}.center-actions{justify-content:flex-start}.pairing-toolbar .el-select{width:130px}.pairing-toolbar .el-input{flex:1;min-width:200px}}
.method-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
.method-card{display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fff;border:1px solid #dce5df;border-radius:10px;cursor:pointer;text-align:left;transition:border-color .15s,box-shadow .15s}
.method-card:hover:not(:disabled){border-color:#087b43;box-shadow:0 2px 10px rgba(8,123,67,.12)}
.method-card:disabled{opacity:.55;cursor:not-allowed}
.method-index{flex:0 0 30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#e7f5ec;color:#087b43;font-weight:700;font-size:15px}
.method-text{display:flex;flex-direction:column;gap:2px}
.method-text b{font-size:14px;color:#26352c}
.method-text small{font-size:12px;color:#718078}
@media(max-width:900px){.method-strip{grid-template-columns:1fr}}
.center-match-table :deep(.next-match-row td){background:#edf8f1}.center-match-table :deep(.el-dropdown){margin-left:10px}
.schedule-export-dialog .export-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.schedule-export-dialog .export-summary{color:#66746b;font-size:13px}
.schedule-export-dialog .export-foot-hint{margin-right:auto;color:#7b877f;font-size:12px;text-align:left}
.export-preview{max-height:min(62vh,620px);overflow:auto;padding:14px;background:#e9ecef;border-radius:6px}
.export-preview .schedule-sheet{background:#fff;padding:14mm 10mm;color:#111;font-size:11px;box-shadow:0 6px 22px #0002}
.export-preview.portrait .schedule-sheet{width:210mm;margin:0 auto}
.export-preview.landscape .schedule-sheet{width:297mm;margin:0 auto}
.export-preview .schedule-sheet h1{margin:0;font-size:11px;font-weight:700;color:#087b43;letter-spacing:1px}
.export-preview .schedule-sheet h2{margin:6px 0 0;font-size:19px;text-align:center}
.export-preview .sheet-meta{margin:8px 0 0;display:flex;flex-wrap:wrap;gap:6px 20px;justify-content:center;color:#3d4a42;font-size:11px}
.export-preview .schedule-sheet table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}
.export-preview .schedule-sheet th,.export-preview .schedule-sheet td{border:1px solid #6b7570;padding:5px 6px;text-align:center;vertical-align:middle;word-break:break-word}
.export-preview .schedule-sheet thead th{background:#eaf3ee;font-weight:700}
.export-preview .col-date{width:9%}.export-preview .col-time{width:8%}.export-preview .col-round{width:13%}
.export-preview .col-division{width:12%}.export-preview .col-group{width:7%}.export-preview .col-teams{width:34%}
.export-preview .col-venue{width:11%}.export-preview .col-serial{width:6%}
.export-preview .cell-teams{text-align:left}
.export-preview .cell-teams b{font-weight:600}
.export-preview .cell-teams span{color:#087b43;margin:0 6px;font-size:10px}
.export-preview .is-unscheduled{color:#b4551f;font-weight:700}
.export-preview .sheet-empty{padding:18px;text-align:center;color:#87938c}
.export-preview .schedule-sheet footer{display:flex;justify-content:space-between;gap:16px;margin-top:8px;color:#55605a;font-size:10px}
</style>
