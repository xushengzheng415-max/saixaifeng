<template>
  <section class="score-rules" v-loading="busy">
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="state">
      <div class="rule-state"><el-tag type="success">当前规则 {{ versionLabel(state.active.version) }}</el-tag><el-tag v-if="state.draft" type="info">有未发布草稿</el-tag></div>
      <el-form label-position="top">
        <div class="rule-groups"><section v-for="group in groups" :key="group.title"><h2>{{ group.title }}</h2><div class="rule-fields"><el-form-item v-for="field in group.fields" :key="field.key" :label="field.label"><div class="rule-input"><el-input-number v-model="form[field.key]" :min="field.min" :max="field.max" :precision="0" :disabled="publishing" /><span>{{ field.unit }}</span></div><small v-if="form[field.key]!==state.active.parameters[field.key]">当前 {{ state.active.parameters[field.key] }}{{ field.unit }}</small></el-form-item></div></section></div>
        <p class="rule-policy">已获卡级保留，只允许升级。换照片／背景仍按实际积分满100分解锁。</p>
        <el-form-item label="变更原因"><el-input v-model="reason" type="textarea" :rows="2" maxlength="500" show-word-limit :disabled="publishing" /></el-form-item>
      </el-form>
      <div class="rule-actions"><el-button :disabled="publishing || !dirty || reason.trim().length<4" @click="save">保存草稿</el-button><el-button :type="report?'default':'primary'" :disabled="publishing || dirty || !state.draft" @click="preview">试算影响</el-button><el-button v-if="report" type="primary" :disabled="dirty || publishing" @click="publish">确认发布</el-button></div>
      <template v-if="report"><h2>试算结果</h2><div class="impact-summary"><span>已核定 {{ report.summary.ready }} 人</span><span>待核定 {{ report.summary.unverified }} 人</span><span>测试排除 {{ report.summary.excluded }} 人</span><span>积分变化 {{ report.summary.changedPoints }} 人</span><span>升级 {{ report.summary.upgraded }} 人</span><span>保留原卡级 {{ report.summary.retained }} 人</span><span>新增换照权益 {{ report.summary.entitlementGains }} 人</span><span>换照权益锁定 {{ report.summary.entitlementLosses }} 人</span></div><el-table :data="report.changes" max-height="340"><el-table-column prop="name" label="球员" /><el-table-column prop="beforePoints" label="原积分" /><el-table-column prop="afterPoints" label="新积分" /><el-table-column label="原卡级"><template #default="{row}">{{ tierLabel(row.beforeTier) }}</template></el-table-column><el-table-column label="新卡级"><template #default="{row}">{{ tierLabel(row.afterTier) }}{{ row.retained?' · 保留':'' }}</template></el-table-column></el-table><small v-if="report.changeCount>100">共 {{ report.changeCount }} 人变化，显示前100人。</small></template>
      <div v-if="job" class="rule-progress"><p>{{ job.status==='complete'?'规则已生效':'正在准备卡级保留记录' }} {{ job.cursor }} / {{ job.total }}</p><el-progress :percentage="job.status==='complete'?100:Math.floor(job.cursor*100/Math.max(1,job.total))" /><el-button v-if="job.status!=='complete'&&!publishing" @click="continuePublish">继续发布</el-button></div>
      <details v-if="state.history?.length" class="rule-history"><summary>最近20个版本</summary><el-table :data="state.history"><el-table-column label="版本" width="100"><template #default="{row}">{{ versionLabel(row.version) }}</template></el-table-column><el-table-column prop="reason" label="变更原因" /><el-table-column label="发布时间" width="180"><template #default="{row}">{{ new Date(row.publishedAt).toLocaleString('zh-CN') }}</template></el-table-column></el-table></details>
    </template>
    <el-button v-else-if="error" @click="load">重新加载</el-button>
  </section>
</template>
<script setup>
import {computed,onBeforeUnmount,onMounted,reactive,ref} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {playerCardTemplateRequest} from '@/utils/cloud'
const state=ref(null),busy=ref(false),publishing=ref(false),error=ref(''),reason=ref(''),form=reactive({}),report=ref(null),job=ref(null)
let stopped=false
const field=(key,label,unit,min,max)=>({key,label,unit,min,max})
const groups=[{title:'竞技积分',fields:[field('appearancePoints','每次出场','分',0,100),field('startPoints','每次首发','分',0,100),field('minutesPerPoint','每多少分钟得1分','分钟',1,300),field('goalPoints','每个进球','分',0,100),field('goalCapPercent','进球加分上限','%基础分',0,100)]},{title:'应援积分',fields:[field('supportDropsPerPoint','每多少次应援得1分','次',1,10000)]},{title:'卡级门槛',fields:[field('silverAt','银卡起点','分',1,100000),field('goldAt','金卡起点','分',2,100000)]}]
const dirty=computed(()=>!!state.value&&(JSON.stringify(form)!==JSON.stringify(state.value.draft||state.value.active.parameters)||reason.value!==(state.value.draftReason||'')))
const versionLabel=value=>value==='football-player-card-points/2'?'V2':'V'+(String(value).match(/config-(\d+)/)?.[1]||'—')
const tierLabel=value=>({bronze:'铜卡',silver:'银卡',gold:'金卡'}[value]||'待核定')
async function api(workflowAction,data={}){const r=await playerCardTemplateRequest('savePlayerCardTemplate',{workflowAction,...data});if(!r?.success)throw new Error(r?.error||'积分规则操作失败，请重试');return r}
function accept(r){state.value=r;Object.assign(form,r.draft||r.active.parameters);reason.value=r.draftReason||'';job.value=r.job}
async function load(){busy.value=true;error.value='';try{accept(await api('scoreRulesRead'));report.value=null}catch(e){error.value=e.message}finally{busy.value=false}}
async function save(){busy.value=true;error.value='';try{accept(await api('scoreRulesSave',{revision:state.value.revision,parameters:{...form},reason:reason.value}));report.value=null;ElMessage.success('草稿已保存')}catch(e){error.value=e.message}finally{busy.value=false}}
async function preview(){busy.value=true;error.value='';report.value=null;try{report.value=await api('scoreRulesPreview',{revision:state.value.revision})}catch(e){error.value=e.message}finally{busy.value=false}}
async function publish(){try{await ElMessageBox.confirm('发布后按新规则计算积分，已获卡级保留。换照片／背景权益仍按实际积分满100分判断。','发布积分规则',{confirmButtonText:'确认发布',cancelButtonText:'取消',type:'warning'})}catch{return}publishing.value=true;busy.value=true;error.value='';try{job.value=(await api('scoreRulesBegin',{revision:state.value.revision,proof:report.value.proof})).job;await advance()}catch(e){error.value=e.message}finally{publishing.value=false;busy.value=false}}
async function advance(){while(!stopped&&job.value?.status!=='complete')job.value=(await api('scoreRulesContinue',{jobId:job.value.id})).job;if(job.value?.status==='complete'){accept(await api('scoreRulesRead'));report.value=null;ElMessage.success('积分规则已生效')}}
async function continuePublish(){publishing.value=true;busy.value=true;error.value='';try{await advance()}catch(e){error.value=e.message}finally{publishing.value=false;busy.value=false}}
onMounted(load);onBeforeUnmount(()=>{stopped=true})
defineExpose({refresh:load,loading:busy})
</script>
<style scoped>
.score-rules{max-width:1200px;margin:auto}.rule-state,.rule-actions{display:flex;gap:12px;margin:0 0 20px}.rule-groups h2,.score-rules h2{font-size:16px;margin:18px 0}.rule-groups>section{border-bottom:1px solid #dce5df;padding-bottom:8px}.rule-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 20px}.rule-input{display:flex;align-items:center;gap:8px}.rule-input span,.rule-fields small,.rule-policy{font-size:12px;color:#617267}.rule-fields :deep(.el-form-item__content){display:block}.rule-fields small{display:block;margin-top:4px}.rule-actions{margin:20px 0}.impact-summary{display:flex;gap:12px 24px;flex-wrap:wrap;font-size:13px;margin-bottom:16px}.rule-progress,.rule-history{margin-top:24px}.rule-history summary{cursor:pointer;color:#617267;margin-bottom:12px}.rule-policy{line-height:1.8}@media(max-width:900px){.rule-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.rule-fields{grid-template-columns:1fr}.rule-actions{flex-wrap:wrap}}
</style>
