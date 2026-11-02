<template>
 <el-dialog v-model="visible" :title="kind==='claim'?'通知管理员催认领':'通知补资料'" width="560px" style="max-width:calc(100vw - 24px)" :close-on-click-modal="false" :show-close="!sending" :close-on-press-escape="!sending" append-to-body>
  <div v-loading="loading">
   <template v-if="kind==='claim'"><el-checkbox-group v-model="selectedTeams" class="notify-teams"><el-checkbox v-for="t in teams" :key="t.teamId" :label="t.teamId">{{ t.teamName }} · {{ t.count }}人未认领</el-checkbox></el-checkbox-group><el-empty v-if="!loading&&!teams.length" description="没有未认领球员" /></template>
   <template v-else><p>{{ player?.name }} · {{ claimed?'本人／监护人接收':'球队管理员接收' }}</p><el-checkbox-group :disabled="sending || !!results.length" v-model="selectedReasons" class="notify-reasons"><el-checkbox v-for="r in PLAYER_REJECTION_REASONS" :key="r.value" :label="r.value">{{ r.label }}</el-checkbox></el-checkbox-group><el-input v-if="selectedReasons.includes('other')" v-model="other" :disabled="sending || !!results.length" type="textarea" :rows="2" maxlength="100" show-word-limit placeholder="填写需补充事项" /></template>
   <el-alert v-if="error" type="error" :title="error" :closable="false" />
   <div v-for="r in results" :key="r.teamId" class="notify-result"><strong>{{ r.name }}</strong><span>{{ r.text }}</span></div>
  </div>
  <template #footer><el-button :disabled="sending" @click="visible=false">关闭</el-button><el-button type="primary" :loading="sending" :disabled="loading || (kind==='claim'?!selectedTeams.length:!reason)" @click="send">{{ results.length?'重试未送达':'发送通知' }}</el-button></template>
 </el-dialog>
</template>
<script setup>
import {ref,computed} from 'vue'
import {rosterExceptionBoard} from '../../utils/cloud'
import {PLAYER_REJECTION_REASONS,playerRejectionReason} from '../../utils/playerRejectionReasons.js'
const props=defineProps({tournamentId:String,divisionId:String})
const visible=ref(false),loading=ref(false),sending=ref(false),kind=ref('claim'),teams=ref([]),selectedTeams=ref([]),player=ref(null),selectedReasons=ref([]),other=ref(''),results=ref([]),error=ref('')
let requestId='',targetTeamId=''
const claimed=computed(()=>Boolean(player.value?.claimed||player.value?.guardianUserId||player.value?.playerUserId||player.value?.linkedUserId))
const reason=computed(()=>playerRejectionReason(selectedReasons.value,other.value))
const CHANNEL_TEXT={service_subscribe:'服务号订阅通知',service_custom:'服务号客服消息',service_template:'服务号模板消息',inbox:'站内待办'}
const FAIL_REASON={SERVICE_BINDING_REQUIRED:'家长未绑定服务号',BINDING_CONFLICT:'服务号绑定存在冲突',SERVICE_BRIDGE_REQUIRED:'服务号固定出口未配置',SERVICE_SIGNATURE_REQUIRED:'服务号签名未配置',SERVICE_CREDENTIALS_REQUIRED:'服务号凭据未配置',INTERACTION_UNKNOWN:'未记录家长最近互动时间',INTERACTION_EXPIRED:'家长最近互动已超过48小时',SERVICE_NO_RESULT:'微信通道未返回结果',SERVICE_CALL_FAILED:'调用服务号推送失败'}
// 只按后端返回的真实通道与结果说话，不再出现“已通知/已安排”这类无法核对的表述。
function resultText(r){
 const data=r.data||{},d=data.delivery||{}
 if(data.dedupe==='recent')return data.message||'刚刚已发送，请勿重复提醒'
 const status=String(d.status||''),channel=String(d.channel||''),code=String(d.errorCode||'')
 if(status==='delivered')return'已推送（'+(CHANNEL_TEXT[channel]||'服务号')+'）'
 if(status==='partial')return'部分接收人已推送，其余已放入站内待办'
 const reason=code?'（原因：'+(FAIL_REASON[code]||code)+'）':''
 return(status==='failed'?'发送失败'+reason+'，已放入站内待办':'已放入站内待办'+reason)
}
async function open({kind:next='claim',teamId='',player:target=null}={}){
 visible.value=true;kind.value=next;player.value=target;targetTeamId=teamId;results.value=[];error.value='';selectedReasons.value=[];other.value='';teams.value=[];selectedTeams.value=[];requestId=crypto.randomUUID().replaceAll('-','')
 if(next!=='claim')return
 loading.value=true
 try{const r=await rosterExceptionBoard({rosterAction:'reviewQueue',tournamentId:props.tournamentId,divisionId:props.divisionId,teamId});if(!r.success)throw Error(r.error||'无法读取名单，请重试');const map=new Map();for(const p of r.rows||[]){if(p.claimed)continue;const t=map.get(p.teamId)||{teamId:p.teamId,teamName:p.teamName,ids:new Set()};t.ids.add(p._id);map.set(p.teamId,t)}teams.value=[...map.values()].map(t=>({...t,count:t.ids.size}));selectedTeams.value=teams.value.map(t=>t.teamId)}catch(e){error.value=e.message}finally{loading.value=false}
}
async function send(){
 if(sending.value)return;sending.value=true;error.value=''
 const targets=kind.value==='claim'?teams.value.filter(t=>selectedTeams.value.includes(t.teamId)):[{teamId:targetTeamId,teamName:player.value?.name}]
 try{for(const t of targets){if(results.value.some(r=>r.teamId===t.teamId&&r.delivered))continue;try{const r=await rosterExceptionBoard({rosterAction:kind.value==='claim'?'notifyUnclaimed':'notifyPlayerMaterials',tournamentId:props.tournamentId,divisionId:props.divisionId,teamId:t.teamId,playerId:player.value?._id,reason:reason.value,requestId});if(!r.success)throw Error(r.error||'通知未创建，请重试');const delivery=r.data?.delivery||{};const result={teamId:t.teamId,name:t.teamName,delivered:['delivered','partial'].includes(String(delivery.status||'')),text:r.skipped?r.message:resultText(r)};results.value=results.value.filter(x=>x.teamId!==t.teamId).concat(result)}catch(e){results.value=results.value.filter(x=>x.teamId!==t.teamId).concat({teamId:t.teamId,name:t.teamName,text:e.message})}}}finally{sending.value=false}
}
defineExpose({open})
</script>
<style scoped>.notify-teams{display:flex;flex-direction:column;gap:6px}.notify-reasons{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:12px}.notify-reasons :deep(.el-checkbox){margin-right:0;height:auto;min-height:36px;white-space:normal}.notify-reasons :deep(.el-checkbox__label){white-space:normal}.notify-result{display:flex;flex-direction:column;gap:4px;padding:12px 0;border-bottom:1px solid #e5e9e6;font-size:13px}.notify-result span{color:#606266}</style>
