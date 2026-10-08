<template>
  <el-dialog :model-value="open" title="制卡进度" width="min(680px, 94vw)" align-center append-to-body :close-on-click-modal="false" @update:model-value="emit('update:open',$event)">
    <div class="task-name"><strong>{{ title }}</strong><span>{{ scope }}</span></div>
    <ol class="stages"><li v-for="(label,index) in stages" :key="label" :class="{current:index===stage,done:index<stage}"><span>{{ index+1 }}</span>{{ label }}</li></ol>
    <div class="phase" role="status" aria-live="polite"><strong>{{ phase }}</strong><span>{{ preparing ? '正在核对模板素材和制卡范围' : processed }}</span></div>
    <el-progress v-if="hasTotal && !preparing" :percentage="percentage" :stroke-width="10" :status="error || job?.status==='blocked' ? 'exception' : job?.status==='active' ? 'success' : undefined" />
    <div v-else-if="running" class="preparing"><el-icon class="is-loading"><Loading /></el-icon>正在处理，请稍候</div>
    <dl v-if="job && !dynamic" class="counts"><div v-for="item in counts" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <section v-if="job?.failures?.length" class="exceptions"><h3>制卡失败</h3><p v-for="row in job.failures" :key="row.playerId"><span>{{ row.playerName || row.playerId }}</span>{{ row.reason }}</p></section>
    <details v-if="job?.skippedPlayers?.length" class="exceptions"><summary>未制卡 {{ job.skipped }} 人</summary><p v-for="row in job.skippedPlayers" :key="row.playerId"><span>{{ row.playerName || row.playerId }}</span>{{ row.reason }}</p></details>
    <p v-if="running" class="note">收起后继续处理；刷新后可继续制卡。</p>
    <p v-else-if="job?.status==='review'" class="note">请预览成卡，再确认上线。</p>
    <template #footer><el-button @click="emit('update:open',false)">{{ running ? '收起' : '关闭' }}</el-button><el-button v-if="job?.status==='review'" type="primary" @click="emit('review')">预览成卡</el-button><el-button v-else-if="!running && (error || ['pending','blocked','preloading'].includes(job?.status))" type="primary" @click="emit('resume')">{{ job?.status==='blocked' ? '重试制卡' : job?.jobId ? '继续处理' : '重新制卡' }}</el-button></template>
  </el-dialog>
</template>
<script setup>
import {computed} from 'vue'
import {Loading} from '@element-plus/icons-vue'
const props=defineProps({open:Boolean,title:String,scope:String,job:Object,running:Boolean,preparing:Boolean,error:String})
const emit=defineEmits(['update:open','review','resume'])
const dynamic=computed(()=>props.job?.displayMode==='dynamic')
const stages=computed(()=>dynamic.value?['校验模板','发布配置','已生效']:['准备制卡','生成成卡','预览确认','预装上线'])
const stage=computed(()=>dynamic.value?(props.job?.status==='active'?2:props.preparing?0:1):props.preparing?0:['preloading','active'].includes(props.job?.status)?3:props.job?.status==='review'?2:props.job?1:0)
const phase=computed(()=>props.error?'处理未完成':props.job?.status==='blocked'?'部分成卡需修复':props.job?.status==='active'?(dynamic.value?'配置已生效':'已上线'):stages.value[stage.value])
const hasTotal=computed(()=>Number.isFinite(Number(props.job?.total))&&Number(props.job?.total)>0)
const count=computed(()=>stage.value===3?Number(props.job?.preloadCompleted??(props.job?.status==='active'?props.job?.total:0)):Number(props.job?.completed||0))
const percentage=computed(()=>hasTotal.value?Math.min(100,Math.max(0,Math.round(count.value/props.job.total*100))):0)
const processed=computed(()=>dynamic.value?'页面重新读取后使用新版本':hasTotal.value?`${stage.value===3?'已预装':'已处理'} ${count.value} / ${props.job.total}`:'等待服务返回数量')
const counts=computed(()=>[{label:'已生成',value:props.job?.generated??'—'},{label:'失败',value:props.job?.failed??'—'},{label:'跳过',value:props.job?.skipped??'—'}])
</script>
<style scoped>
.task-name{display:flex;gap:12px;align-items:center;margin-bottom:24px}.task-name span,.note{font-size:13px;color:#68776e}.stages{display:flex;list-style:none;padding:0;margin:0 0 26px;gap:12px}.stages li{flex:1;color:#8b9690;font-size:13px;display:flex;align-items:center;gap:7px;border-bottom:2px solid #e3e9e5;padding-bottom:12px}.stages li span{width:22px;height:22px;border-radius:50%;background:#eef2ef;display:grid;place-items:center}.stages .current{color:#137447;border-color:#137447;font-weight:600}.stages .done{color:#137447}.phase{display:flex;justify-content:space-between;gap:16px;margin:0 0 16px}.phase span{color:#68776e;font-size:13px}.counts{display:flex;gap:40px;margin:24px 0}.counts dt{font-size:13px;color:#68776e}.counts dd{font-size:24px;font-weight:600;margin:4px 0 0}.preparing{display:flex;align-items:center;gap:8px;padding:12px 0;color:#68776e}.exceptions{margin:18px 0;max-height:180px;overflow:auto;font-size:13px}.exceptions h3{font-size:14px}.exceptions p{display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid #edf1ee;padding:8px 0;margin:0;overflow-wrap:anywhere}.exceptions span{color:#68776e}.note{margin:18px 0 0}@media(max-width:520px){.stages{gap:5px}.stages li{flex-direction:column;font-size:12px}.phase{flex-direction:column;gap:6px}.counts{gap:30px}}
</style>
