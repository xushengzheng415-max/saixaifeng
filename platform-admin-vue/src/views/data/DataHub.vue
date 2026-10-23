<template>
 <section class="hub-directory">
  <PlayerCareer v-if="selectedPlayer" :player-id="selectedPlayer" :back-label="selectedTeam?'返回球队档案':'返回球员目录'" ref="playerRef" @back="selectedPlayer=''" @audit="emit('audit',$event)"/>
  <TeamCareer v-else-if="selectedTeam" :team-id="selectedTeam" ref="teamRef" @back="selectedTeam=''" @player="selectedPlayer=$event"/>
  <template v-else>
   <form class="hub-toolbar" @submit.prevent="search"><el-input v-model="keyword" clearable maxlength="50" :placeholder="kind==='players'?'搜索球员姓名或编号':'搜索球队名称或城市'" @clear="search"/>
    <el-select v-if="kind==='players'" v-model="teamFilter" remote filterable clearable :remote-method="searchTeams" :loading="teamsLoading" placeholder="全部所属球队" @change="search" @visible-change="v=>v&&!teamOptions.length&&searchTeams('')"><el-option v-for="t in teamOptions" :key="t.id" :label="t.name" :value="t.id"/><template #footer><el-button v-if="teamCursor" link :loading="teamsLoading" @click="moreTeams">加载更多球队</el-button></template></el-select>
    <el-button type="primary" native-type="submit" :loading="busy">查询</el-button><span class="directory-scope">正式档案 · 已排除测试来源</span>
   </form>
   <el-alert v-if="error" :title="error" type="error" :closable="false"><el-button link @click="load(currentCursor)">重试</el-button></el-alert>
   <el-table :data="items" v-loading="busy" stripe empty-text="暂无符合条件的正式档案" @row-dblclick="open">
    <el-table-column :label="kind==='players'?'球员':'球队'" min-width="190"><template #default="{row}"><el-button link type="primary" @click="open(row)">{{row.name||'名称待完善'}}</el-button><small class="hub-code">{{kind==='players'?(row.playerCode||row.id):row.id}}</small></template></el-table-column>
    <el-table-column v-if="kind==='players'" label="当前所属球队" min-width="180"><template #default="{row}">{{row.currentTeam?.name||'未关联球队'}}</template></el-table-column>
    <el-table-column v-if="kind==='players'" label="位置" width="100"><template #default="{row}">{{row.position||'—'}}</template></el-table-column><el-table-column v-if="kind==='players'" label="号码" width="85"><template #default="{row}">{{row.jerseyNumber??'—'}}</template></el-table-column>
    <el-table-column v-else label="城市" min-width="140"><template #default="{row}">{{row.city||'—'}}</template></el-table-column>
    <el-table-column label="入驻平台" min-width="130"><template #default="{row}">{{dateText(row.registration?.registeredAt)}}</template></el-table-column><el-table-column label="档案创建" min-width="130"><template #default="{row}">{{dateText(row.registration?.profileCreatedAt)}}</template></el-table-column>
    <el-table-column label="操作" width="110"><template #default="{row}"><el-button link type="primary" @click="open(row)">{{kind==='players'?'生涯档案':'球队档案'}}</el-button></template></el-table-column>
   </el-table>
   <div class="hub-pagination"><span>第 {{previous.length+1}} 页 · 本页 {{items.length}} 条</span><el-button :disabled="busy||!previous.length" @click="backPage">上一页</el-button><el-button :disabled="busy||!hasMore" @click="nextPage">下一页</el-button></div>
   <p v-if="scanLimited" class="hub-hint">本批来源校验已达读取预算，可继续下一页。</p>
  </template>
 </section>
</template>
<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {dataHub,dateText} from './dataHubApi'
import PlayerCareer from './PlayerCareer.vue'
import TeamCareer from './TeamCareer.vue'
const props=defineProps({kind:{type:String,default:'teams'}}),emit=defineEmits(['audit'])
const items=ref([]),busy=ref(false),error=ref(''),keyword=ref(''),teamFilter=ref(''),currentCursor=ref(null),nextCursor=ref(null),previous=ref([]),hasMore=ref(false),scanLimited=ref(false)
const selectedPlayer=ref(''),selectedTeam=ref(''),playerRef=ref(null),teamRef=ref(null),teamOptions=ref([]),teamCursor=ref(null),teamsLoading=ref(false),teamKeyword=ref('')
let seq=0,teamSeq=0
const loading=computed(()=>busy.value||Boolean(playerRef.value?.loading)||Boolean(teamRef.value?.loading))
async function load(cursor=null){const s=++seq;busy.value=true;error.value='';try{const r=await dataHub('hubCatalog',{kind:props.kind,keyword:keyword.value.trim(),...(teamFilter.value&&props.kind==='players'?{teamId:teamFilter.value}:{}),pageSize:50,cursor});if(s!==seq)return;items.value=r.items||[];currentCursor.value=cursor;nextCursor.value=r.page?.nextCursor||null;hasMore.value=r.page?.hasMore===true;scanLimited.value=r.page?.scanBudgetReached===true;return true}catch(e){if(s===seq)error.value=e.message;return false}finally{if(s===seq)busy.value=false}}
function search(){previous.value=[];currentCursor.value=null;items.value=[];hasMore.value=false;return load()}
async function nextPage(){if(busy.value||!hasMore.value)return;const oldCursor=currentCursor.value;if(await load(nextCursor.value))previous.value.push(oldCursor)}
async function backPage(){if(!previous.value.length||busy.value)return;if(await load(previous.value.at(-1)))previous.value.pop()}
function open(row){if(props.kind==='players')selectedPlayer.value=row.id;else selectedTeam.value=row.id}
async function searchTeams(value=''){teamKeyword.value=value;teamOptions.value=[];teamCursor.value=null;return fetchTeams(false)}
async function fetchTeams(append){const s=++teamSeq;teamsLoading.value=true;try{const r=await dataHub('hubCatalog',{kind:'teams',keyword:teamKeyword.value,pageSize:50,cursor:append?teamCursor.value:null});if(s!==teamSeq)return;teamOptions.value=append?[...teamOptions.value,...r.items]:r.items;teamCursor.value=r.page.nextCursor}catch(e){if(s===teamSeq)error.value=e.message}finally{if(s===teamSeq)teamsLoading.value=false}}
const moreTeams=()=>fetchTeams(true)
function refresh(){return selectedPlayer.value?playerRef.value?.refresh():selectedTeam.value?teamRef.value?.refresh():load(currentCursor.value)}
watch(()=>props.kind,()=>{seq++;selectedPlayer.value='';selectedTeam.value='';keyword.value='';teamFilter.value='';search()})
onMounted(search);onBeforeUnmount(()=>{seq++;teamSeq++});defineExpose({refresh,loading})
</script>
<style scoped>
.hub-toolbar{display:flex;gap:12px;align-items:center;margin:12px 0 22px}.hub-toolbar .el-input{max-width:330px}.hub-toolbar .el-select{width:230px}.directory-scope{margin-left:auto;font-size:12px;color:#839488}.hub-code{display:block;font-size:10px;color:#90a096;overflow-wrap:anywhere}.hub-pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin:18px 0}.hub-pagination span{font-size:12px;color:#7f9085;margin-right:auto}.hub-hint{font-size:12px;color:#8b7853}@media(max-width:900px){.hub-toolbar{flex-wrap:wrap}.directory-scope{margin-left:0}}
</style>

