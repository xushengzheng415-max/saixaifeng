<template>
  <section v-loading="loading">
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="info">
      <h3>{{ info.matchName }}</h3><p>{{ info.tournamentName }} · {{ info.divisionName }} · {{ info.date }}</p>
      <p>已保存比分 {{ info.scores.home ?? '—' }} : {{ info.scores.away ?? '—' }} · 整场 {{ info.durationMinutes || '待补齐' }} 分钟</p>
      <el-alert v-if="!info.editable" :title="info.lockedReason" type="warning" :closable="false" />
      <el-tabs v-model="kind"><el-tab-pane label="补阵容" name="lineup" /><el-tab-pane label="补事件" name="events" /></el-tabs>
      <template v-if="kind==='lineup'">
        <el-radio-group v-model="side"><el-radio-button v-for="key in ['home','away']" :key="key" :value="key">{{ info.sides[key].name }}</el-radio-button></el-radio-group>
        <p v-if="info.sides[side].lineup.known">该队已有阵容；更正已有记录须走原赛果复核。</p>
        <template v-else>
          <p v-if="!info.sides[side].players.length">该队缺少已审核名单，需先补齐正式参赛关联。</p>
          <el-table :data="info.sides[side].players" max-height="320"><el-table-column prop="name" label="球员" /><el-table-column prop="number" label="号码" width="70" /><el-table-column label="本场身份" min-width="170"><template #default="{row}"><el-select v-model="roles[side][row.id]" :disabled="!info.editable||!row.eligible" placeholder="未选择" clearable><el-option label="首发" value="starter" /><el-option label="替补" value="bench" /></el-select></template></el-table-column></el-table>
        </template>
      </template>
      <template v-else>
        <el-alert v-if="!bothLineups" title="请先补齐双方阵容，再录比赛事件" type="warning" :closable="false" />
        <el-table ref="eventsTable" :data="events" :row-class-name="({rowIndex})=>rowIndex===invalidEventIndex?'invalid-event':''" max-height="340" class="events">
          <el-table-column type="index" label="序号" width="55" />
          <el-table-column label="球队" min-width="130"><template #default="{row}"><el-select v-model="row.teamId" @change="row.playerId='';row.outPlayerId=''"><el-option v-for="key in ['home','away']" :key="key" :value="info.sides[key].teamId" :label="info.sides[key].name" /></el-select></template></el-table-column>
          <el-table-column label="事件" min-width="120"><template #default="{row}"><el-select v-model="row.type"><el-option v-for="[value,label] in eventTypes" :key="value" :value="value" :label="label" /></el-select></template></el-table-column>
          <el-table-column label="球员" min-width="170"><template #default="{row}"><div class="player-choice"><span v-if="row.type==='substitution'">换上</span><el-select v-model="row.playerId" filterable :placeholder="row.type==='substitution'?'换上球员':'事件球员'"><el-option v-for="p in pool(row.teamId)" :key="p.id" :value="p.id" :label="p.name" /></el-select></div><div v-if="row.type==='substitution'" class="player-choice"><span>换下</span><el-select v-model="row.outPlayerId" filterable placeholder="换下球员"><el-option v-for="p in pool(row.teamId)" :key="p.id" :value="p.id" :label="p.name" /></el-select></div></template></el-table-column>
          <el-table-column label="累计分钟" width="130"><template #default="{row}"><el-input-number v-model="row.minute" :min="0" :max="info.durationMinutes||300" :precision="0" controls-position="right" /></template></el-table-column>
          <el-table-column width="60"><template #default="{$index}"><el-button link type="danger" @click="events.splice($index,1);invalidEventIndex=-1">移除</el-button></template></el-table-column>
        </el-table>
        <el-button :disabled="!info.editable||!bothLineups||saving" @click="events.push({type:'goal',teamId:info.sides.home.teamId,playerId:'',minute:null})">添加事件</el-button>
        <p v-if="zeroEventMatch">本场无进球、牌罚和换人时，无需添加事件。</p>
        <p><el-checkbox v-model="complete" :disabled="!bothLineups">{{ zeroEventMatch ? '已核对原报告：本场无进球、牌罚和换人' : '已按原报告录全事件（含换人、罚下）' }}</el-checkbox></p>
      </template>
      <template v-if="info.editable && (kind==='events'||!info.sides[side].lineup.known)">
        <el-form label-position="top"><el-form-item label="原始资料来源" required :error="sourceError"><el-input v-model="reason" type="textarea" :rows="2" maxlength="500" placeholder="请填写资料来源（至少4字），例如：本场纸质裁判报告" @input="sourceError=''" /></el-form-item></el-form>
        <el-checkbox v-model="confirmed">确认按原始比赛记录补充</el-checkbox>
        <div class="actions"><el-button :loading="loading" :disabled="saving" @click="load">重新读取</el-button><el-button type="primary" :loading="saving" :disabled="loading||(kind==='events'&&!bothLineups)" @click="save">保存资料</el-button></div>
      </template>
    </template>
  </section>
</template>
<script setup>
import {computed,reactive,ref,onMounted,nextTick} from 'vue'
import {ElMessage} from 'element-plus'
import {playerCardTemplateRequest} from '@/utils/cloud'
import {normalizeRepairEvent,repairEventError} from '@/utils/matchRepairEvents'
const props=defineProps({matchId:{type:String,required:true}}),emit=defineEmits(['saved','busy'])
const info=ref(null),loading=ref(false),saving=ref(false),error=ref(''),kind=ref('lineup'),side=ref('home'),events=ref([]),complete=ref(false),reason=ref(''),confirmed=ref(false),roles=reactive({home:{},away:{}})
const eventTypes=[['goal','进球'],['penalty_scored','点球进球'],['own_goal','乌龙球'],['assist','助攻'],['yellow_card','黄牌'],['red_card','红牌'],['second_yellow','两黄变红'],['substitution','换人']]
const bothLineups=computed(()=>info.value?.sides.home.lineup.known&&info.value?.sides.away.lineup.known)
const sourceError=ref('')
const eventsTable=ref(null),invalidEventIndex=ref(-1)
const zeroEventMatch=computed(()=>events.value.length===0&&info.value?.scores.home!=null&&info.value?.scores.away!=null&&Number(info.value.scores.home)===0&&Number(info.value.scores.away)===0)
function pool(teamId){const s=Object.values(info.value?.sides||{}).find(x=>x.teamId===teamId);return s?s.players.filter(p=>p.eligible&&[...s.lineup.starters,...s.lineup.bench].includes(p.id)):[]}
async function api(workflowAction,params={}){const r=await playerCardTemplateRequest('savePlayerCardTemplate',{workflowAction,matchId:props.matchId,...params});if(!r?.success)throw Error(r?.error||'处理失败，请重试');return r}
async function load(){loading.value=true;error.value='';sourceError.value='';invalidEventIndex.value=-1;try{info.value=await api('auditRepairInspect');events.value=info.value.events.map(normalizeRepairEvent);complete.value=info.value.eventsComplete;roles.home={};roles.away={};confirmed.value=false;side.value=info.value.sides.home.lineup.known?'away':'home';if(bothLineups.value)kind.value='events'}catch(e){error.value=e.message}finally{loading.value=false}}
async function save(){if(saving.value||loading.value)return;sourceError.value='';error.value='';invalidEventIndex.value=-1;if(reason.value.trim().length<4){sourceError.value='请填写至少4字的原始资料来源';return}if(!confirmed.value){error.value='请勾选“确认按原始比赛记录补充”';return}if(kind.value==='events'){const invalid=repairEventError(events.value,info.value,eventTypes.map(([type])=>type));if(invalid){invalidEventIndex.value=invalid.index;error.value=invalid.message;await nextTick();eventsTable.value?.$el.querySelector('tr.invalid-event')?.scrollIntoView({block:'nearest'});return}}saving.value=true;emit('busy',true);try{const selected=Object.entries(roles[side.value]);await api('auditRepairSave',{revision:info.value.revision,kind:kind.value,side:side.value,starters:selected.filter(([,r])=>r==='starter').map(([id])=>id),bench:selected.filter(([,r])=>r==='bench').map(([id])=>id),events:events.value,eventsComplete:complete.value,reason:reason.value.trim(),confirmedSource:confirmed.value});ElMessage.success('资料已保存');await load();emit('saved')}catch(e){error.value=e.message}finally{saving.value=false;emit('busy',false)}}
onMounted(load)
</script>
<style scoped>
h3{margin-top:0}p{font-size:13px;color:var(--el-text-color-secondary)}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.events{margin-bottom:12px}.events :deep(.el-input-number){width:110px}.events :deep(.el-select){min-width:105px}section{min-height:160px}
.player-choice{display:flex;align-items:center;gap:6px}.player-choice+.player-choice{margin-top:4px}.player-choice>span{flex-shrink:0;font-size:12px;color:var(--el-text-color-secondary)}.events :deep(tr.invalid-event>td){background:var(--el-color-danger-light-9)}
</style>
