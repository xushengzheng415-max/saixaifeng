<template>
  <section class="issue-repair" v-loading="loading">
    <template v-if="matchOpen"><header><h3>补充比赛资料</h3><el-button :disabled="saving" @click="matchOpen=false">返回异常列表</el-button></header><PlayerCardMatchRepair :match-id="matchId" @saved="repaired" @busy="value=>{saving=value;emit('busy',value)}" /></template><template v-else>
    <el-alert v-if="error" :title="error" type="error" :closable="false"><el-button link @click="load">重试</el-button></el-alert>
    <template v-if="audit">
      <header><div><h3>{{ audit.player.name }}</h3><span>{{ audit.player.teamName || '球队待关联' }}</span></div><el-button :loading="loading" @click="load">重新检查</el-button></header>
      <el-alert :title="ready ? '竞技数据已通过，可返回选择发卡' : audit.score?.status==='test_data_excluded'?'测试资料不进入正式发卡':'先补齐下列资料，再重新检查'" :type="ready?'success':'warning'" :closable="false" />
      <p v-if="!ready && audit.score?.missing?.length" class="audit-missing">{{ audit.score.missing.map(missingText).join('、') }}</p>
      <p v-if="ready&&audit.playerTotal?.metrics?.appearances===0" class="secondary">未出场，不计比赛积分。</p>
      <article v-for="row in findings" :key="row.matchId || 'other'" class="finding">
        <div class="finding-head"><div><strong>{{ row.matchName }}</strong><small>{{ row.date }}{{ row.related?' · 该球员参赛记录':'' }}</small></div><el-button v-if="row.matchId && row.issues.some(x=>!/DURATION/.test(x.code))" @click="openMatch(row)">处理资料</el-button></div>
        <ul><li v-for="code in [...new Set(row.issues.map(x=>x.code))]" :key="code">{{ issueText(code) }}<DurationVerification v-if="/DURATION/.test(code)" :issue="{matchId:row.matchId,code}" allowed @saved="repaired" /></li></ul>
      </article>
      <p v-if="!ready&&!findings.length">当前缺少可处理的比赛记录，请先补齐球员档案及正式参赛关联。</p>
      <details><summary>积分与数据版本</summary><p>已核定积分 {{ audit.score?.points ?? '—' }} · {{ ({bronze:'铜卡',silver:'银卡',gold:'金卡'}[audit.score?.tier] || '等级待定') }}</p><p>{{ audit.score?.scoreVersion }} · {{ audit.dataVersion }}</p></details>
    </template>
    </template>
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue'
import {playerCardTemplateRequest} from '@/utils/cloud'
import DurationVerification from '@/views/data/DurationVerification.vue'
import PlayerCardMatchRepair from './PlayerCardMatchRepair.vue'
const props=defineProps({playerId:{type:String,required:true},initialAudit:Object}),emit=defineEmits(['changed','busy'])
const audit=ref(null),loading=ref(false),error=ref(''),matchOpen=ref(false),matchId=ref(''),saving=ref(false)
let sequence=0
const ready=computed(()=>audit.value?.score?.status==='ready'),findings=computed(()=>audit.value?.findings||[])
const missingText=key=>({minutesPlayed:'出场分钟不完整',appearances:'出场记录不完整',starts:'首发记录不完整',goals:'进球记录不完整',supportDrops:'应援账本待核对',dataCoverage:'比赛或阵容记录不完整',scope:'生涯范围不足'}[key]||'资料待补齐')
const issueText=code=>({LINEUP_COVERAGE_MISSING:'缺少首发或替补名单，请按原报告补齐',EVENT_COVERAGE_PARTIAL:'比赛事件未记完整，请补录并确认',EVENT_COVERAGE_MISSING:'缺少完整比赛事件',MATCH_DURATION_EVIDENCE_MISSING:'比赛时长缺少依据',MATCH_DURATION_MISSING:'缺少比赛时长',EVENT_PLAYER_UNLINKED:'事件未关联球员',EVENT_TEAM_UNLINKED:'事件未关联球队',EVENT_PLAYER_TEAM_CONFLICT:'事件球员与球队不符',MATCH_ORIGIN_UNVERIFIED:'比赛来源待审核',SCORE_MISSING:'正式比分待补齐',TEST_PLAYER_IN_MATCH:'包含测试资料，不能计入正式积分'}[code]||'记录存在异常，请核对原始资料')
async function load(){const n=++sequence;loading.value=true;error.value='';try{const r=await playerCardTemplateRequest('savePlayerCardTemplate',{workflowAction:'auditPlayer',playerId:props.playerId});if(!r?.success)throw Error(r?.error||'检查未完成，请重试');if(n===sequence)audit.value=r}catch(e){if(n===sequence)error.value=e.message}finally{if(n===sequence)loading.value=false}}
function openMatch(row){matchId.value=row.matchId;matchOpen.value=true}
async function repaired(){await load();emit('changed',audit.value)}
watch(()=>[props.playerId,props.initialAudit],()=>{sequence++;audit.value=props.initialAudit||null;if(!props.initialAudit)load()},{immediate:true})
</script>
<style scoped>
header,.finding-head{display:flex;align-items:center;justify-content:space-between;gap:12px}h3{margin:0 0 6px}header{margin-bottom:16px}.finding{padding:16px 0;border-bottom:1px solid var(--el-border-color-lighter)}small{display:block;color:var(--el-text-color-secondary);margin-top:5px}.secondary,details{color:var(--el-text-color-secondary);font-size:13px}ul{padding-left:20px;margin-bottom:0}li{margin:6px 0}.audit-missing{color:var(--el-color-warning-dark-2)}details{margin-top:20px;overflow-wrap:anywhere}.issue-repair{min-height:140px}
</style>
