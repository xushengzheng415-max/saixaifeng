<template>
 <section v-loading="loading" class="review-queue">
  <header><el-select v-model="filter" aria-label="审核状态" style="width:140px"><el-option v-for="s in states" :key="s.value" :label="s.label" :value="s.value" /></el-select><el-input v-model="search" placeholder="搜索队员或球队" clearable style="width:220px" /><el-button :disabled="loading" @click="load">刷新</el-button><el-button :disabled="!rows.length" @click="notify.open()">通知催认领</el-button></header>
  <el-alert v-if="error" type="error" :title="error" :closable="false" />
  <el-table :data="visibleRows" empty-text="当前筛选下没有队员" row-key="queueKey"><el-table-column label="照片" width="62"><template #default="{row}"><PlayerAvatar :player="row" /></template></el-table-column><el-table-column prop="name" label="姓名" min-width="90" /><el-table-column prop="teamName" label="球队" min-width="150" /><el-table-column prop="divisionName" label="组别" min-width="90" /><el-table-column prop="jerseyNumber" label="号码" width="60" /><el-table-column label="认领" width="80"><template #default="{row}">{{ row.claimed?'已认领':'未认领' }}</template></el-table-column><el-table-column label="审核" min-width="100"><template #default="{row}"><el-tooltip :content="row.organizerReviewReason || organizerPlayerReviewLabel(row.organizerReviewStatus)"><el-tag :type="row.organizerReviewStatus==='rejected'?'danger':row.organizerReviewStatus==='approved'?'success':'warning'">{{ organizerPlayerReviewLabel(row.organizerReviewStatus) }}</el-tag></el-tooltip></template></el-table-column><el-table-column label="操作" min-width="230"><template #default="{row}"><el-button v-if="['pending','resubmitted'].includes(row.organizerReviewStatus)" link type="success" :disabled="!!busy" @click="approve(row)">通过</el-button><el-button v-if="['pending','resubmitted'].includes(row.organizerReviewStatus)" link type="danger" :disabled="!!busy" @click="reject(row)">驳回</el-button><el-button link type="primary" @click="notify.open({kind:'materials',teamId:row.teamId,player:row})">通知补资料</el-button><el-button link @click="openTeam(row)">查看球队</el-button></template></el-table-column></el-table>
  <PlayerReviewDialog v-model="rejectVisible" :player="target" :loading="!!busy" @submit="submitReject" /><PlayerNotifyDialog ref="notify" :tournament-id="tournamentId" :division-id="divisionId" />
 </section>
</template>
<script setup>
import {ref,computed,watch} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage,ElMessageBox} from 'element-plus'
import {rosterExceptionBoard} from '../../utils/cloud'
import {organizerPlayerReviewLabel} from '../../utils/playerReviewDisplay.js'
import PlayerAvatar from '../common/PlayerAvatar.vue'
import PlayerReviewDialog from './PlayerReviewDialog.vue'
import PlayerNotifyDialog from './PlayerNotifyDialog.vue'
const props=defineProps({tournamentId:String,divisionId:String}),router=useRouter()
const rows=ref([]),loading=ref(false),error=ref(''),filter=ref('pending'),search=ref(''),busy=ref(''),target=ref(null),rejectVisible=ref(false),notify=ref(null)
const states=[{value:'pending',label:'待审核'},{value:'resubmitted',label:'待复审'},{value:'rejected',label:'已驳回'},{value:'approved',label:'已通过'},{value:'all',label:'全部队员'}]
const visibleRows=computed(()=>rows.value.filter(p=>(filter.value==='all'||p.organizerReviewStatus===filter.value)&&(!search.value||(p.name+p.teamName).includes(search.value))))
let epoch=0
async function load(){const generation=++epoch;loading.value=true;error.value='';try{const r=await rosterExceptionBoard({rosterAction:'reviewQueue',tournamentId:props.tournamentId,divisionId:props.divisionId});if(!r.success)throw Error(r.error||'名单读取失败，请重试');if(generation===epoch)rows.value=(r.rows||[]).map(p=>({...p,queueKey:[p._id,p.teamId,p.divisionId].join(':')}))}catch(e){if(generation===epoch){rows.value=[];error.value=e.message}}finally{if(generation===epoch)loading.value=false}}
watch(()=>[props.tournamentId,props.divisionId],load,{immediate:true})
function reject(row){target.value=row;rejectVisible.value=true}
async function mutate(row,action,reason){if(busy.value)return;busy.value=row.queueKey;try{const r=await rosterExceptionBoard({rosterAction:action,tournamentId:props.tournamentId,divisionId:row.divisionId,teamId:row.teamId,playerId:row._id,reason});if(!r.success)throw Error(r.error||'审核未完成，请重试');ElMessage.success(action==='approvePlayer'?'已通过':'已驳回');if(action==='rejectPlayer'&&r.notification&&(!r.notification.success||r.notification.data?.channels?.serviceAccount!=='delivered'))ElMessage.warning('驳回已保存；微信通知未送达，请查看通知状态');rejectVisible.value=false;await load()}catch(e){ElMessage.error(e.message)}finally{busy.value=''}}
async function approve(row){try{await ElMessageBox.confirm('通过后加入本届正式名单，确认通过 '+row.name+'？','审核队员',{confirmButtonText:'通过',cancelButtonText:'取消'});await mutate(row,'approvePlayer')}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message)}}
function submitReject({reason}){return mutate(target.value,'rejectPlayer',reason)}
function openTeam(row){router.push({path:'/tournaments/'+props.tournamentId+'/teams/'+row.teamId,query:{divisionId:row.divisionId,from:'registration'}})}
</script>
<style scoped>.review-queue{background:#fff;border:1px solid #dfe5e0;padding:16px}.review-queue header{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}</style>
