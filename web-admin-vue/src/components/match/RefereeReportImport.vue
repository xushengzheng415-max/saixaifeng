<template>
  <el-button size="small" :disabled="disabled" @click="chooseFile">上传裁判表</el-button>
  <input ref="fileInput" type="file" accept="image/jpeg,image/png" hidden @change="readFile" />
  <el-dialog v-model="visible" title="核对裁判表" width="min(1450px, 96vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="beforeClose" destroy-on-close>
    <div v-loading="busy" :element-loading-text="stage" class="report-grid">
      <div class="original"><img v-if="preview" :src="preview" alt="裁判表原图" /></div>
      <section class="review">
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <div v-if="draft" class="score-row">
          <span>比分</span><el-input-number v-model="draft.score.home" :min="0" :max="99" :precision="0" aria-label="主队比分" />
          <span>:</span><el-input-number v-model="draft.score.away" :min="0" :max="99" :precision="0" aria-label="客队比分" /><span v-if="draft.timing?.halfMinutes" class="field-note">中场：{{ draft.timing.halfMinutes }}′</span>
        </div>
        <el-alert v-for="warning in draft?.warnings || []" :key="warning" :title="warning" type="warning" :closable="false" />
        <template v-if="draft">
          <el-tabs v-model="side">
            <el-tab-pane :label="homeName" name="home" />
            <el-tab-pane :label="awayName" name="away" />
          </el-tabs>
          <el-table :data="draft.teams[side]" size="small" max-height="450" :row-class-name="rowClass">
            <el-table-column label="球员" min-width="190">
              <template #default="{row}">
                <el-select v-model="row.playerId" filterable placeholder="选择正式名单球员" @change="selectPlayer(row)">
                  <el-option v-for="p in rosters[side]" :key="p.playerId" :value="p.playerId" :label="`${p.number}号 ${p.name}`" />
                </el-select><small v-if="row.originalName">原表：{{ row.number }}号 {{ row.originalName }}</small><small v-if="row.reviewNotes?.length" class="analysis-note">{{ row.reviewNotes.join("；") }}</small>
              </template>
            </el-table-column>
            <el-table-column label="阵容" width="108"><template #default="{row}"><el-select v-model="row.role" @change="pairSubstitutions"><el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" /></el-select></template></el-table-column>
            <el-table-column v-for="field in fields" :key="field.key" :label="field.label" width="85"><template #default="{row}"><el-input v-model="row[field.key]" :aria-label="`${field.label}分钟`" @change="onMinuteChange(row,field.key)" /></template></el-table-column>
            <el-table-column label="身份" width="90"><template #default="{row}"><el-checkbox v-model="row.captain">队长</el-checkbox><el-checkbox v-model="row.goalkeeper">门将</el-checkbox></template></el-table-column>
            <el-table-column width="58"><template #default="{ $index }"><el-button link type="danger" @click="deletePlayer($index)">删除</el-button></template></el-table-column>
          </el-table>
          <el-button link @click="addPlayer">添加球员</el-button>
          <div class="sub-heading"><strong>换人记录</strong><el-button link @click="pairSubstitutions">合并同分钟</el-button><el-button link @click="addPair">添加换人组</el-button></div>
          <p class="field-note">同队同分钟合并一组，不需指定谁换谁。</p>
          <div class="sub-row field-note"><span>球队</span><span>分钟</span><span>换下球员（多选）</span><span>换上球员（多选）</span><span></span></div><div v-for="(row,i) in substitutions" :key="i" class="sub-row" :class="{ 'sub-row-error':pairErrorIndex===i }">
            <el-select v-model="row.side" aria-label="换人球队" @change="onPairSideChange(row)"><el-option :label="homeName" value="home" /><el-option :label="awayName" value="away" /></el-select>
            <el-input-number v-model="row.minute" :min="0" :max="150" :precision="0" placeholder="分钟" :controls="false" @change="syncPairEdits" />
            <el-select v-model="row.outIds" multiple filterable placeholder="选择换下球员" @change="syncPairEdits"><el-option v-for="p in groupPlayers(row.side)" :key="p.playerId" :label="`${p.number}号 ${p.name}`" :value="p.playerId" /></el-select>
            <el-select v-model="row.inIds" multiple filterable placeholder="选择换上球员" @change="syncPairEdits"><el-option v-for="p in groupPlayers(row.side)" :key="p.playerId" :label="`${p.number}号 ${p.name}`" :value="p.playerId" /></el-select>
            <el-button link type="danger" @click="removePair(i)">删除</el-button>
          </div>
        </template>
      </section>
    </div>
    <template #footer><el-button :disabled="busy" @click="visible=false">取消</el-button><el-button :disabled="busy" @click="chooseFile">重新上传</el-button><el-button v-if="error && !draft" :disabled="busy" @click="recognize">重试</el-button><el-button type="primary" :disabled="!draft || busy" :loading="saving" @click="confirm">确认录入</el-button></template>
  </el-dialog>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { callFunctionHTTP, uploadLargeFileViaCloud } from '../../utils/cloud'
import {readMinutes as minutes,rebuildPairs,syncPairMarks,missingMarks,copyPairs,mergeGroups,draftBatchEvents} from '../../utils/refereeGroupedSubstitutions.js'
import {substitutionState} from '../../../../cloudfunctions/dataCenter/shared/substitution.mjs'
const props=defineProps({matchId:String,homeName:String,awayName:String,disabled:Boolean,loadRoster:Function,rules:Object,existingEvents:Array})
const emit=defineEmits(['saved'])
const visible=ref(false),busy=ref(false),saving=ref(false),stage=ref('正在识别'),error=ref(''),preview=ref(''),draft=ref(null),fileInput=ref(null),side=ref('home'),rosters=ref({home:[],away:[]}),substitutions=ref([])
let selectedFile=null; let uploadedFileId=''; let generation=0; let pairSnapshot=[]
const pairErrorIndex=ref(-1),pairErrorPlayerId=ref('')
const roles=[{label:'待确认',value:'unknown'},{label:'首发',value:'starter'},{label:'替补',value:'substitute'},{label:'不出场',value:'absent'}]
const fields=[{key:'on',label:'换上'},{key:'off',label:'换下'},{key:'goals',label:'进球'},{key:'yellow',label:'黄牌'},{key:'red',label:'红牌'}]
function chooseFile(){if(!busy.value&&!props.disabled)fileInput.value?.click()}
function beforeClose(done){if(!busy.value)done()}
function revoke(){if(preview.value)URL.revokeObjectURL(preview.value);preview.value=''}
function activePlayers(team){return (draft.value?.teams[team]||[]).filter(row=>['starter','substitute'].includes(row.role)&&row.playerId)}
function groupPlayers(team){return (draft.value?.teams[team]||[]).filter(row=>row.playerId&&row.role!=='absent')}
function rowClass({row}){return row.playerId===pairErrorPlayerId.value||!row.playerId||row.role==='unknown'||row.reviewNotes?.some(note=>/核对|候选|不晚于/.test(note))?'needs-review':''}
function selectPlayer(row){const p=rosters.value[side.value].find(p=>p.playerId===row.playerId);if(p){row.name=p.name;row.number=p.number}pairSubstitutions()}
function addPlayer(){draft.value.teams[side.value].push({playerId:'',name:'',number:'',role:'unknown',on:'',off:'',goals:'',yellow:'',red:'',captain:false,goalkeeper:false})}
async function readFile(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  if(!['image/jpeg','image/png'].includes(file.type)||file.size>3*1024*1024)return ElMessage.warning('请选择不超过3MB的JPG或PNG照片')
  revoke();preview.value=URL.createObjectURL(file);visible.value=true;draft.value=null;error.value=''
  selectedFile=file;uploadedFileId='';substitutions.value=[];pairSnapshot=[];await recognize()
}
async function recognize(){
  if(!selectedFile||busy.value)return
  const current=++generation;busy.value=true;error.value='';stage.value='正在识别裁判表'
  try{
    if(!uploadedFileId){
      stage.value='准备上传照片'
      const preparation=await callFunctionHTTP('recognizeRefereeReport',{matchId:props.matchId,prepareUpload:true})
      if(!preparation?.success||!preparation.data?.uploadFolder)throw new Error(preparation?.error||'无法准备照片上传')
      const extension=selectedFile.type==='image/png'?'png':'jpg'
      const upload=await uploadLargeFileViaCloud(`${preparation.data.uploadFolder}/paper-${Date.now()}.${extension}`,selectedFile,{chunkSize:48*1024,fallbackChunkSize:24*1024,onProgress:(done,total)=>{stage.value=`上传照片 ${done}/${total}`}})
      if(!upload?.success||!upload.fileId)throw new Error('照片上传未完成，请重试')
      uploadedFileId=upload.fileId
    }
    stage.value='正在识别裁判表'
    const [response,home,away]=await Promise.all([callFunctionHTTP('recognizeRefereeReport',{matchId:props.matchId,fileId:uploadedFileId},120000),props.loadRoster('home'),props.loadRoster('away')])
    if(current!==generation)return
    if(!response?.success)throw new Error(response?.error||'识别未完成，请重试')
    rosters.value={home:home.players,away:away.players};draft.value=response.data
    for(const team of ['home','away'])for(const row of draft.value.teams[team]){
      row.originalName=row.name
      const candidates=rosters.value[team].filter(p=>String(p.number)===String(row.number))
      row.playerId=candidates.length===1?candidates[0].playerId:''
      if(candidates.length===1){
        row.name=candidates[0].name
        const a=String(row.originalName||'').replace(/\s/g,''),b=String(row.name||'').replace(/\s/g,'')
        if(a!==b){
          row.reviewNotes ||= [];row.reviewNotes.push('号码对应的姓名已取正式名单，请核对原图')
          const near=a.length===b.length&&[...a].filter((c,i)=>c!==b[i]).length<=1
          if(!a||!near)row.playerId=''
        }
      }
    }
    pairSubstitutions()
  }catch(e){if(current===generation)error.value=e.message||'识别失败，请重试'}finally{if(current===generation)busy.value=false}
}
function clearPairError(){error.value='';pairErrorIndex.value=-1;pairErrorPlayerId.value=''}
function pairSubstitutions(){
  if(!draft.value)return
  substitutions.value=rebuildPairs(draft.value.teams,substitutions.value)
  pairSnapshot=copyPairs(substitutions.value);clearPairError()
}
function onMinuteChange(row,key){if(['on','off'].includes(key))pairSubstitutions()}
function deletePlayer(index){draft.value.teams[side.value].splice(index,1);pairSubstitutions()}
function addPair(){substitutions.value.push({side:side.value,minute:null,inIds:[],outIds:[]});pairSnapshot=copyPairs(substitutions.value);clearPairError()}
function syncPairEdits(){if(!draft.value)return;syncPairMarks(draft.value.teams,pairSnapshot,substitutions.value);substitutions.value=mergeGroups(substitutions.value);pairSnapshot=copyPairs(substitutions.value);clearPairError()}
function onPairSideChange(row){row.inIds=[];row.outIds=[];syncPairEdits()}
function removePair(index){substitutions.value.splice(index,1);syncPairEdits()}
function pairProblem(message,index=-1,playerId='',team=''){error.value=message;pairErrorIndex.value=index;pairErrorPlayerId.value=playerId;if(team)side.value=team;return false}
function validatePairs(){
  for(const [i,row] of substitutions.value.entries()){
    if(row.minute==null||!Number.isInteger(row.minute)||row.minute<0||row.minute>150)return pairProblem(`第${i+1}组换人：请填写0至150的分钟`,i)
    const ins=row.inIds || [],outs=row.outIds || []
    if(!ins.length||ins.length!==outs.length)return pairProblem(`${row.minute}′换下${outs.length}人、换上${ins.length}人，请补齐本组球员`,i)
    if(new Set(ins).size!==ins.length||new Set(outs).size!==outs.length||ins.some(id=>outs.includes(id)))return pairProblem(`${row.minute}′本组存在重复球员或同人同时换上换下`,i)
  }
  const missing=missingMarks(draft.value.teams,substitutions.value)[0]
  if(missing){const team=missing.side==='home'?props.homeName:props.awayName;return pairProblem(`${team} ${missing.number}号${missing.name} ${missing.minute}′${missing.field==='on'?'换上':'换下'}：尚未加入该组`,-1,missing.playerId,missing.side)}
  if(!substitutions.value.length)return true
  if(!props.rules?.ruleKnown)return pairProblem('本场换人规则尚未载入，请关闭弹窗刷新比赛详情')
  const lineups=Object.fromEntries(['home','away'].map(team=>[team,{players:activePlayers(team).filter(row=>row.role==='starter'),substitutes:activePlayers(team).filter(row=>row.role==='substitute')}]))
  const existing=props.existingEvents || []
  let added
  try{added=draftBatchEvents(substitutions.value,existing,draft.value.timing?.halfMinutes)}catch(e){return pairProblem(e.message)}
  const state=substitutionState({lineups,events:[...existing,...added]},props.rules,[...existing,...added])
  const issue=state.issues.find(row=>String(row.eventId).startsWith('draft-group-'))
  if(issue){const i=Number(String(issue.eventId).split('-')[2]);const team=issue.side==='home'?props.homeName:props.awayName;return pairProblem(`${team} ${issue.minute}′：${issue.message}`,i)}
  return true
}
async function confirm(){
  if(!draft.value||busy.value||saving.value)return
  const rows=[...draft.value.teams.home,...draft.value.teams.away]
  if(rows.some(row=>row.role==='unknown'||(!row.playerId&&row.role!=='absent')))return ElMessage.warning('请核对标出的球员及首发替补')
  for(const row of rows)for(const field of fields){const text=String(row[field.key]||'').trim();if(text&&!minutes(text).length)return ElMessage.warning('请核对事件分钟；无法确认的记录不要填0')}
  if(!validatePairs())return
  saving.value=true;busy.value=true;stage.value='正在保存';error.value=''
  try{const result=await callFunctionHTTP('confirmRefereeReport',{matchId:props.matchId,...draft.value,substitutions:substitutions.value},120000);if(!result?.success)throw new Error(result?.message||result?.error||'记录未保存');ElMessage.success(result.alreadyImported?'这张裁判表已录入':'裁判表已录入');visible.value=false;emit('saved')}catch(e){error.value=e.message}finally{saving.value=false;busy.value=false}
}
onBeforeUnmount(()=>{generation++;revoke()})
</script>

<style scoped>
.report-grid{display:grid;grid-template-columns:minmax(220px,30%) minmax(0,1fr);gap:20px;min-height:250px}.original{max-height:70vh;overflow:auto;background:#f4f7f5}.original img{display:block;width:100%;height:auto}.review{min-width:0}.score-row{display:flex;align-items:center;gap:12px;margin-bottom:14px}.review .el-alert{margin-bottom:12px}small{display:block;color:#7c8580;font-size:12px;margin-top:4px}.sub-heading{display:flex;gap:16px;align-items:center;margin-top:18px}.sub-row{display:grid;grid-template-columns:1fr 75px 1fr 1fr 40px;gap:8px;margin-bottom:8px}.sub-row .el-input-number{width:75px}.sub-row-error{outline:1px solid #f56c6c;outline-offset:3px;background:#fef0f0}.field-note{font-size:12px;color:#67766e;margin:8px 0}.review :deep(.needs-review){--el-table-tr-bg-color:#fff8e8}@media(max-width:900px){.report-grid{grid-template-columns:1fr}.original{max-height:220px}.original img{width:auto;max-width:100%;max-height:600px}.sub-row{grid-template-columns:1fr 65px 1fr 1fr 40px}}
</style>
