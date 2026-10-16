<template>
  <section v-loading="loading">
    <div class="appeal-toolbar"><el-select v-model="status" @change="refresh"><el-option label="待处理" value="pending" /><el-option label="已回复" value="resolved" /><el-option label="未采纳" value="rejected" /><el-option label="全部申诉" value="" /></el-select><el-input v-model="keyword" placeholder="搜索球员、球队或比赛" clearable @keyup.enter="refresh" @clear="refresh" /><el-button @click="refresh">查询</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false"><el-button link @click="refresh">重试</el-button></el-alert>
    <el-table :data="rows" empty-text="暂无积分申诉"><el-table-column prop="playerName" label="球员" min-width="100" /><el-table-column prop="teamName" label="球队" min-width="140" /><el-table-column prop="matchName" label="比赛" min-width="200" show-overflow-tooltip /><el-table-column label="项目" width="100"><template #default="{row}">{{ metricLabel(row.metric) }}</template></el-table-column><el-table-column prop="reason" label="说明" min-width="180" show-overflow-tooltip /><el-table-column label="状态" width="90"><template #default="{row}">{{ statusLabel(row.status) }}</template></el-table-column><el-table-column label="操作" width="90"><template #default="{row}"><el-button link type="primary" @click="open(row)">{{ row.status==='pending'?'处理':'查看' }}</el-button></template></el-table-column></el-table>
    <el-button v-if="cursor" :loading="loading" @click="loadMore">加载更多</el-button>
    <el-dialog v-model="visible" title="积分申诉" width="min(940px,96vw)" append-to-body :close-on-click-modal="false" :show-close="!saving&&!repairBusy" :before-close="done=>!saving&&!repairBusy&&done()">
      <template v-if="selected"><div class="appeal-person"><strong>{{ selected.playerName }} · {{ selected.teamName }}</strong><el-tag>{{ statusLabel(selected.status) }}</el-tag></div><p>{{ selected.matchName }} · {{ metricLabel(selected.metric) }}</p><p class="appeal-reason">{{ selected.reason }}</p><p v-if="selected.expected">希望核对：{{ selected.expected }}</p>
        <el-tabs v-model="pane"><el-tab-pane label="积分明细" name="ledger" /><el-tab-pane v-if="selected.matchId&&selected.status==='pending'" label="补录依据" name="repair" /></el-tabs>
        <template v-if="pane==='ledger'"><el-alert v-if="detailError" :title="detailError" type="error" :closable="false"><el-button link @click="readLedger">重试</el-button></el-alert><div v-if="ledger" v-loading="detailLoading"><strong>当前 {{ ledger.points ?? '—' }} 分</strong><p class="appeal-note">按已有依据计分；未记录项目计0分。</p><el-table :data="ledgerRows" max-height="320"><el-table-column prop="matchName" label="比赛" min-width="200" /><el-table-column prop="role" label="身份" width="105" /><el-table-column prop="minutesPlayed" label="有效分钟" width="90" /><el-table-column label="出场分" width="75"><template #default="{row}">{{ row.parts.appearance }}</template></el-table-column><el-table-column label="首发分" width="75"><template #default="{row}">{{ row.parts.starter }}</template></el-table-column><el-table-column label="分钟分" width="75"><template #default="{row}">{{ row.parts.minutes }}</template></el-table-column><el-table-column label="进球分" width="75"><template #default="{row}">{{ row.parts.goals }}</template></el-table-column></el-table><el-button link :loading="detailLoading" @click="readLedger">重新读取积分</el-button></div></template>
        <PlayerCardMatchRepair v-else :match-id="selected.matchId" @saved="readLedger" @busy="value=>repairBusy=value" />
        <el-form v-if="selected.status==='pending'" label-position="top"><el-form-item label="处理结果"><el-select v-model="resolution"><el-option label="依据已补录" value="corrected" /><el-option label="记录核对无误" value="confirmed" /><el-option label="未采纳" value="rejected" /></el-select></el-form-item><el-form-item label="回复球员"><el-input v-model="reply" type="textarea" :rows="3" maxlength="1000" /></el-form-item></el-form><p v-else class="appeal-reply">平台回复：{{ selected.reply }}</p>
      </template>
      <template #footer><el-button :disabled="saving||repairBusy" @click="visible=false">关闭</el-button><el-button v-if="selected?.status==='pending'" type="primary" :loading="saving" :disabled="repairBusy||reply.trim().length<4" @click="resolve">确认处理</el-button></template>
    </el-dialog>
  </section>
</template>
<script setup>
import {computed,onMounted,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {playerCardTemplateRequest} from '@/utils/cloud'
import PlayerCardMatchRepair from './PlayerCardMatchRepair.vue'
const rows=ref([]),loading=ref(false),error=ref(''),status=ref('pending'),keyword=ref(''),cursor=ref(''),visible=ref(false),selected=ref(null),ledger=ref(null),detailLoading=ref(false),detailError=ref(''),pane=ref('ledger'),resolution=ref('confirmed'),reply=ref(''),saving=ref(false),repairBusy=ref(false)
let sequence=0,detailSequence=0
const ledgerRows=computed(()=>selected.value?.matchId?ledger.value?.rows.filter(row=>row.matchId===selected.value.matchId)||[]:ledger.value?.rows||[])
const metricLabel=value=>({appearances:'出场',starts:'首发',minutesPlayed:'上场分钟',goals:'进球',supportDrops:'应援积分',missing_match:'遗漏比赛',other:'其他'}[value]||value)
const statusLabel=value=>({pending:'待处理',resolved:'已回复',rejected:'未采纳'}[value]||value)
async function api(workflowAction,data={}){const r=await playerCardTemplateRequest('savePlayerCardTemplate',{workflowAction,...data});if(!r?.success)throw Error(r?.error||'读取失败，请重试');return r}
async function load(more){const n=++sequence;loading.value=true;error.value='';try{const r=await api('pointsAppealList',{status:status.value,keyword:keyword.value,cursor:more?cursor.value:''});if(n!==sequence)return;rows.value=more?rows.value.concat(r.appeals):r.appeals;cursor.value=r.nextCursor}catch(e){if(n===sequence)error.value=e.message}finally{if(n===sequence)loading.value=false}}
function refresh(){return load(false)}function loadMore(){return load(true)}
async function readLedger(){const n=++detailSequence;detailLoading.value=true;detailError.value='';try{const r=await api('pointsAppealLedger',{playerId:selected.value.playerId});if(n===detailSequence)ledger.value=r.ledger}catch(e){if(n===detailSequence)detailError.value=e.message}finally{if(n===detailSequence)detailLoading.value=false}}
function open(row){selected.value=row;ledger.value=null;visible.value=true;pane.value='ledger';reply.value='';resolution.value='confirmed';readLedger()}
async function resolve(){if(saving.value)return;saving.value=true;try{await api('pointsAppealResolve',{appealId:selected.value.id,revision:selected.value.revision,resolution:resolution.value,reply:reply.value});visible.value=false;ElMessage.success('处理结果已保存');await refresh()}catch(e){ElMessage.error(e.message)}finally{saving.value=false}}
defineExpose({refresh,loading});onMounted(refresh)
</script>
<style scoped>
.appeal-toolbar{display:flex;gap:12px;margin:12px 0 20px}.appeal-toolbar>.el-select{width:140px}.appeal-toolbar>.el-input{max-width:320px}.appeal-person{display:flex;justify-content:space-between;gap:12px}.appeal-reason,.appeal-reply{white-space:pre-wrap;overflow-wrap:anywhere}.appeal-note{color:var(--el-text-color-secondary);font-size:13px}.el-form{margin-top:18px}.el-form :deep(.el-select){width:100%}@media(max-width:600px){.appeal-toolbar{flex-wrap:wrap}.appeal-toolbar>.el-input{max-width:none}}
</style>
