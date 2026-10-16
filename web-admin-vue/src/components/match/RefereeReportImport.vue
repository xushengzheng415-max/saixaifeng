<template>
  <el-button size="small" :disabled="disabled" @click="chooseFile">上传裁判表</el-button>
  <el-button v-if="hasLocalDraft" size="small" :disabled="disabled || busy" @click="restoreDraft">继续核对</el-button>
  <input ref="fileInput" type="file" accept="image/jpeg,image/png" hidden @change="readFile" />
  <el-dialog v-model="visible" title="核对裁判表" width="min(1450px, 96vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="beforeClose" destroy-on-close>
    <div v-loading="busy" :element-loading-text="stage" class="report-grid">
      <div class="original"><ReportImageMagnifier v-if="preview" :src="preview" /></div>
      <section class="review">
        <el-alert v-if="error && !/比分.*进球|进球.*比分/.test(error)" :title="error" type="error" :closable="false" show-icon />
        <div v-if="draft" class="score-row">
          <span>比分</span><div class="score-field"><el-input-number v-model="draft.score.home" :min="0" :max="99" :precision="0" aria-label="主队比分" /><small :class="{invalid:scoreIssue('home')}">{{ scoreSummary('home') }}</small></div>
          <span>:</span><div class="score-field"><el-input-number v-model="draft.score.away" :min="0" :max="99" :precision="0" aria-label="客队比分" /><small :class="{invalid:scoreIssue('away')}">{{ scoreSummary('away') }}</small></div><span v-if="draft.timing?.halfMinutes" class="field-note">中场：{{ draft.timing.halfMinutes }}′</span><small v-if="error &amp;&amp; /比分.*进球|进球.*比分/.test(error) &amp;&amp; !scoreIssue('home') &amp;&amp; !scoreIssue('away')" class="invalid">{{ error }}；请检查本场已有进球记录。</small>
        </div>
        
        <template v-if="draft">
          <el-tabs v-model="side">
            <el-tab-pane :label="homeName" name="home" />
            <el-tab-pane :label="awayName" name="away" />
          </el-tabs>
          <small v-for="warning in scopedWarnings" :key="warning" class="field-note">{{ warning }}</small>
          <el-table :data="draft.teams[side]" size="small" max-height="450" :row-class-name="rowClass">
            <el-table-column label="球员" min-width="190">
              <template #default="{row}">
                <el-select v-model="row.playerId" filterable placeholder="选择正式名单球员" @change="selectPlayer(row)">
                  <el-option v-for="p in rosters[side]" :key="p.playerId" :value="p.playerId" :label="`${p.number}号 ${p.name}`" />
                </el-select><small v-if="row.originalName">原表：{{ row.number }}号 {{ row.originalName }}</small><small v-if="rowNotes(row).length && !isRowReviewed(row)" class="analysis-note">{{ rowNotes(row).join("；") }}</small>
                <div v-if="needsRowReview(row) || isRowReviewed(row)" class="row-review-actions">
                  <el-tag v-if="isRowReviewed(row)" type="success" size="small">已核对</el-tag>
                  <el-button v-else type="success" plain size="small" :disabled="busy" @click="confirmRowReview(row)">确认核对</el-button>
                  <small v-if="row.reviewError && row.reviewErrorFingerprint===rowReviewFingerprint(row)" class="row-review-error">{{ row.reviewError }}</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="阵容" width="108"><template #default="{row}"><el-select v-model="row.role" @change="pairSubstitutions"><el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" /></el-select></template></el-table-column>
            <el-table-column v-for="field in fields" :key="field.key" :label="field.label" :width="field.key==='goals'?190:72"><template #default="{row}">
              <template v-if="field.key==='goals'"><div class="goal-grid"><div v-for="(value,index) in row.goalMinutes" :key="index" class="goal-minute"><el-input v-model="row.goalMinutes[index]" size="small" inputmode="numeric" :class="{ 'invalid-input':goalCellInvalid(value) }" :aria-label="row.name+'第'+(index+1)+'个进球分钟'" @input="updateGoals(row)" /><el-button v-if="row.goalMinutes.length>1" link type="danger" :aria-label="'删除第'+(index+1)+'个进球'" @click="removeGoal(row,index)">×</el-button></div><el-button link type="primary" size="small" @click="addGoal(row)">加一球</el-button></div><small v-if="row.goalMinutes.some(goalCellInvalid)" class="invalid">标红格须填0—150的分钟</small><small v-if="goalCorrectionFor(row)" class="invalid">已存 {{ goalCorrectionFor(row).oldMinutes.join('、') }}′ → 本表 {{ goalCorrectionFor(row).newMinutes.join('、') }}′，请确认更正</small></template>
              <template v-else><el-input v-model="row[field.key]" :aria-label="field.label+'分钟'" :class="{ 'invalid-input':fieldIssue(row,field.key) }" @input="error=''" @change="onMinuteChange(row,field.key)" /><small v-if="fieldIssue(row,field.key)" class="invalid">分钟待修正</small></template>
            </template></el-table-column>
            <el-table-column label="身份" width="90"><template #default="{row}"><el-checkbox v-model="row.captain">队长</el-checkbox><el-checkbox v-model="row.goalkeeper">门将</el-checkbox></template></el-table-column>
            <el-table-column width="58"><template #default="{ $index }"><el-button link type="danger" @click="deletePlayer($index)">删除</el-button></template></el-table-column>
          </el-table>
          <el-button link @click="addPlayer">添加球员</el-button>
          <div class="sub-heading"><strong>换人记录</strong><small v-if="pairValidationMessage" class="invalid">{{ pairValidationMessage }}</small><el-button link @click="pairSubstitutions">合并同分钟</el-button><el-button link @click="addPair">添加换人组</el-button></div>
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
    <template #footer><span v-if="draftStorageError" class="invalid">{{ draftStorageError }}</span><span v-else-if="localSavedAt" class="field-note">本机草稿 {{ new Date(localSavedAt).toLocaleTimeString() }}</span><el-button :disabled="!draft || busy || draftSaving" :loading="draftSaving" @click="saveDraft(true)">保存草稿</el-button><el-button :disabled="busy" @click="closeReview">关闭</el-button><el-button :disabled="busy" @click="chooseFile">重新上传</el-button><el-button v-if="error && !draft" :disabled="busy" @click="recognize">重试</el-button><el-button :type="hasGoalCorrections?'warning':'primary'" :disabled="!draft || busy" :loading="saving" @click="confirm(hasGoalCorrections)">{{ hasGoalCorrections ? '更正并录入' : '确认录入' }}</el-button></template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ReportImageMagnifier from './ReportImageMagnifier.vue'
import { loadReportDraft, saveReportDraft, deleteReportDraft } from '../../utils/refereeReportDraftStore'
import { callFunctionHTTP, uploadLargeFileViaCloud, getPlayerReadIdentity } from '../../utils/cloud'
import {readMinutes as minutes,rebuildPairs,syncPairMarks,missingMarks,copyPairs,mergeGroups,draftBatchEvents} from '../../utils/refereeGroupedSubstitutions.js'
import {substitutionState} from '../../../../cloudfunctions/dataCenter/shared/substitution.mjs'
const props=defineProps({matchId:String,homeName:String,awayName:String,disabled:Boolean,loadRoster:Function,rules:Object,existingEvents:Array})
const emit=defineEmits(['saved'])
const visible=ref(false),busy=ref(false),saving=ref(false),stage=ref('正在识别'),error=ref(''),preview=ref(''),draft=ref(null),fileInput=ref(null),side=ref('home'),rosters=ref({home:[],away:[]}),substitutions=ref([])
let selectedFile=null; let uploadedFileId=''; let generation=0; let pairSnapshot=[]
const pairErrorIndex=ref(-1),pairErrorPlayerId=ref('')

const hasLocalDraft=ref(false),draftSaving=ref(false),localSavedAt=ref(0),draftStorageError=ref(''),pairValidationMessage=ref('')
let draftTimer=null
const scopedWarnings=computed(()=>(draft.value?.warnings || []).filter(message=>!/比分|进球|部分记录|不清楚|核对标记|姓名识别/.test(message)))
function initGoals(row){if(!Array.isArray(row.goalMinutes))row.goalMinutes=String(row.goals ?? '').split(/[,，;；、]/).map(value=>value.trim());if(!row.goalMinutes.length)row.goalMinutes=['']}
function goalCellInvalid(value){return String(value).trim()!==''&&(!/^\d{1,3}$/.test(String(value).trim())||Number(value)>150)}
function updateGoals(row){row.goals=row.goalMinutes.map(value=>String(value).trim()).filter(Boolean).join(',');row.goalsEdited=true;error.value=''}
function addGoal(row){initGoals(row);row.goalMinutes.push('')}
function removeGoal(row,index){row.goalMinutes.splice(index,1);if(!row.goalMinutes.length)row.goalMinutes.push('');updateGoals(row)}
function fieldIssue(row,key){const value=String(row[key] ?? '').trim();return Boolean(value&&(!minutes(value).length||minutes(value).some(minute=>minute>150)))}
function rowNotes(row){return (row.reviewNotes || []).filter(note=>!(row.goalsEdited&&!row.goalMinutes.some(goalCellInvalid)&&/进球|圈号/.test(note)))}
function goalCount(team){return (draft.value?.teams[team] || []).filter(row=>!['absent','skip'].includes(row.role)).reduce((sum,row)=>sum+(row.goalMinutes || []).filter(value=>String(value).trim()!==''&&!goalCellInvalid(value)).length,0)}
function uncertainGoals(team){return (draft.value?.teams[team] || []).reduce((sum,row)=>sum+(row.goalMinutes || []).filter(goalCellInvalid).length,0)}
function scoreIssue(team){return draft.value?.score?.[team]==null||Number(draft.value.score[team])!==goalCount(team)||uncertainGoals(team)>0}
function scoreSummary(team){const count=goalCount(team),pending=uncertainGoals(team),score=draft.value?.score?.[team],name=team==='home'?props.homeName:props.awayName;if(score==null)return name+'：请填比分';const difference=Number(score)-count;return name+'：已录'+count+'球'+(pending?'，'+pending+'格待核对':difference>0?'，还差'+difference+'球':difference<0?'，多录'+(-difference)+'球':'，与比分一致')}
async function saveDraft(notify=false){
 if(!draft.value||draftSaving.value)return false
 draftSaving.value=true;draftStorageError.value=''
 try{if(draft.value.evidence?.matchId&&String(draft.value.evidence.matchId)!==props.matchId)throw new Error('比赛已切换，不能保存到本场');await saveReportDraft(props.matchId,{draft:JSON.parse(JSON.stringify(draft.value)),substitutions:copyPairs(substitutions.value),fileId:uploadedFileId,file:selectedFile,side:side.value});hasLocalDraft.value=true;localSavedAt.value=Date.now();if(notify)ElMessage.success('草稿已保存到本机');return true}
 catch(cause){draftStorageError.value=cause.message;return false}finally{draftSaving.value=false}
}
async function restoreDraft(){
 if(busy.value||props.disabled)return
 busy.value=true;stage.value='正在恢复草稿';error.value=''
 try{const identity=getPlayerReadIdentity(),saved=await loadReportDraft(props.matchId);if(!saved?.draft)throw new Error('本场没有可恢复草稿');const [home,away]=await Promise.all([props.loadRoster('home'),props.loadRoster('away')]);if(identity!==getPlayerReadIdentity())throw new Error('账号已变化，请重新进入比赛');if(!Array.isArray(home?.players)||!Array.isArray(away?.players))throw new Error('正式名单无法读取，请重试');revoke();selectedFile=saved.file || null;preview.value=selectedFile?URL.createObjectURL(selectedFile):'';uploadedFileId=saved.fileId || '';rosters.value={home:home.players,away:away.players};draft.value=saved.draft;for(const team of ['home','away'])for(const row of draft.value.teams[team])initGoals(row);substitutions.value=copyPairs(saved.substitutions || []);pairSnapshot=copyPairs(substitutions.value);side.value=saved.side==='away'?'away':'home';localSavedAt.value=saved.savedAt;visible.value=true;ElMessage.success('草稿已恢复')}
 catch(cause){ElMessage.error(cause.message)}finally{busy.value=false}
}

const goalCorrections=ref([]),goalCorrectionFingerprint=ref('')
function goalDraftFingerprint(){return JSON.stringify(['home','away'].map(team=>(draft.value?.teams[team] || []).map(row=>[row.playerId,row.role,row.goals])))}
const hasGoalCorrections=computed(()=>goalCorrections.value.length>0&&goalCorrectionFingerprint.value===goalDraftFingerprint())
function goalCorrectionFor(row){if(!hasGoalCorrections.value)return null;const team=draft.value.teams.home.includes(row)?'home':'away';return goalCorrections.value.find(item=>item.side===team&&item.playerId===row.playerId)}
const roles=[{label:'待确认',value:'unknown'},{label:'首发',value:'starter'},{label:'替补',value:'substitute'},{label:'不出场',value:'absent'}]
const fields=[{key:'on',label:'换上'},{key:'off',label:'换下'},{key:'goals',label:'进球'},{key:'yellow',label:'黄牌'},{key:'red',label:'红牌'}]
function chooseFile(){if(!busy.value&&!props.disabled)fileInput.value?.click()}
async function beforeClose(done){if(!busy.value && (!draft.value || await saveDraft(false)))done()}
async function closeReview(){if(!busy.value && (!draft.value || await saveDraft(false)))visible.value=false}
function revoke(){if(preview.value)URL.revokeObjectURL(preview.value);preview.value=''}
function activePlayers(team){return (draft.value?.teams[team]||[]).filter(row=>['starter','substitute'].includes(row.role)&&row.playerId)}
function groupPlayers(team){return (draft.value?.teams[team]||[]).filter(row=>row.playerId&&row.role!=='absent')}
function rowReviewFingerprint(row){return JSON.stringify([row.playerId || '',row.role || '',...fields.map(field=>String(row[field.key] ?? '').trim()),Boolean(row.captain),Boolean(row.goalkeeper)])}
function isRowReviewed(row){return Boolean(row.reviewConfirmedFingerprint && row.reviewConfirmedFingerprint===rowReviewFingerprint(row))}
function needsRowReview(row){return !isRowReviewed(row)&&Boolean(!row.playerId || !['starter','substitute','absent'].includes(row.role) || row.reviewConfirmedFingerprint || (row.role==='absent'&&fields.some(field=>String(row[field.key] || '').trim())) || rowNotes(row).some(note=>/核对|候选|不晚于/.test(note)))}
function rowClass({row}){return goalCorrectionFor(row)||(row.playerId && row.playerId===pairErrorPlayerId.value)||needsRowReview(row)?'needs-review':''}
function confirmRowReview(row){
  const reject=message=>{row.reviewError=message;row.reviewErrorFingerprint=rowReviewFingerprint(row)}
  const team=(draft.value?.teams.home || []).includes(row)?'home':'away'
  if(!row.playerId || !rosters.value[team].some(player=>player.playerId===row.playerId))return reject('请先选择正式名单中的球员')
  if(!['starter','substitute','absent'].includes(row.role))return reject('请选择首发、替补或不出场')
  if(row.role==='absent'&&fields.some(field=>String(row[field.key] || '').trim()))return reject('不出场球员含比赛事件，请清除事件或修改阵容')
  for(const field of fields){const value=String(row[field.key] || '').trim();if(value&&(!minutes(value).length||minutes(value).some(minute=>minute>150)))return reject(`${field.label}分钟尚未确定，请修正或清除误识别内容`)}
  row.reviewError='';row.reviewConfirmedFingerprint=rowReviewFingerprint(row)
  if(pairErrorPlayerId.value===row.playerId)pairErrorPlayerId.value=''
  error.value=''
}
function selectPlayer(row){const p=rosters.value[side.value].find(p=>p.playerId===row.playerId);if(p){row.name=p.name;row.number=p.number}pairSubstitutions()}
function addPlayer(){draft.value.teams[side.value].push({playerId:'',name:'',number:'',role:'unknown',on:'',off:'',goals:'',goalMinutes:[''],yellow:'',red:'',captain:false,goalkeeper:false})}
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
      initGoals(row);row.originalName=row.name
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
  }catch(e){if(current===generation)error.value=e.message||'识别失败，请重试'}finally{if(current===generation){busy.value=false;if(draft.value)await saveDraft(false)}}
}
function clearPairError(){error.value='';pairValidationMessage.value='';pairErrorIndex.value=-1;pairErrorPlayerId.value=''}
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
function pairProblem(message,index=-1,playerId='',team=''){pairValidationMessage.value=message;pairErrorIndex.value=index;pairErrorPlayerId.value=playerId;if(team)side.value=team;return false}
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
async function confirm(replaceGoals=false){
  if(!draft.value||busy.value||saving.value)return
  const rows=[...draft.value.teams.home,...draft.value.teams.away]
  const pending=rows.find(row=>needsRowReview(row))
  if(pending){
    side.value=draft.value.teams.home.includes(pending)?'home':'away'
    pairErrorPlayerId.value=pending.playerId || ''
    pending.reviewError='请核对本行后点击确认核对';pending.reviewErrorFingerprint=rowReviewFingerprint(pending)
    return
  }
  for(const row of rows)for(const field of fields){const text=String(row[field.key]||'').trim();if(text&&(!minutes(text).length||minutes(text).some(value=>value>150))){side.value=draft.value.teams.home.includes(row)?'home':'away';row.reviewError=field.label+'分钟未确定，请修正标红格';row.reviewErrorFingerprint=rowReviewFingerprint(row);return}}
  const scoreSide=['home','away'].find(team=>scoreIssue(team))
  if(scoreSide){side.value=scoreSide;return}
  if(!validatePairs())return
  if(replaceGoals===true&&hasGoalCorrections.value){
    saving.value=true
    try{await ElMessageBox.confirm(goalCorrections.value.map(row=>(row.side==='home'?props.homeName:props.awayName)+' '+row.number+'号 '+row.playerName+'：'+row.oldMinutes.join('、')+'′ → '+row.newMinutes.join('、')+'′').join('；')+'。按本表更正，旧记录留档。','确认进球更正',{type:'warning',confirmButtonText:'按本表更正',cancelButtonText:'返回核对'})}catch{saving.value=false;return}
    saving.value=false
  }else replaceGoals=false
  saving.value=true;busy.value=true;stage.value='正在保存';error.value=''
  try{const result=await callFunctionHTTP('confirmRefereeReport',{matchId:props.matchId,...draft.value,substitutions:substitutions.value,replaceGoalConflicts:replaceGoals===true},120000);if(result?.code==='PAPER_GOAL_CORRECTION_REQUIRED'){goalCorrections.value=result.goalCorrections || [];goalCorrectionFingerprint.value=goalDraftFingerprint();side.value=goalCorrections.value[0]?.side || side.value;return}if(!result?.success)throw new Error(result?.message||result?.error||'记录未保存');ElMessage.success(result.alreadyImported?'这张裁判表已录入':'裁判表已录入');draft.value=null;clearTimeout(draftTimer);await deleteReportDraft(props.matchId).catch(()=>{});hasLocalDraft.value=false;localSavedAt.value=0;visible.value=false;emit('saved')}catch(e){error.value=e.message}finally{saving.value=false;busy.value=false}
}
onMounted(async()=>{try{const saved=await loadReportDraft(props.matchId);hasLocalDraft.value=Boolean(saved);localSavedAt.value=saved?.savedAt || 0}catch{}})
watch([draft,substitutions],()=>{clearTimeout(draftTimer);if(draft.value&&!busy.value)draftTimer=setTimeout(()=>saveDraft(false),900)},{deep:true})
onBeforeUnmount(()=>{generation++;clearTimeout(draftTimer);if(draft.value&&!busy.value)saveDraft(false);revoke()})
</script>

<style scoped>
.report-grid{display:grid;grid-template-columns:minmax(220px,30%) minmax(0,1fr);gap:20px;min-height:250px}.original{align-self:start;background:#f4f7f5}.review{min-width:0}.score-row{display:flex;align-items:center;gap:12px;margin-bottom:14px}.review .el-alert{margin-bottom:12px}small{display:block;color:#7c8580;font-size:12px;margin-top:4px}.sub-heading{display:flex;gap:16px;align-items:center;margin-top:18px}.sub-row{display:grid;grid-template-columns:1fr 75px 1fr 1fr 40px;gap:8px;margin-bottom:8px}.sub-row .el-input-number{width:75px}.sub-row-error{outline:1px solid #f56c6c;outline-offset:3px;background:#fef0f0}.field-note{font-size:12px;color:#67766e;margin:8px 0}.row-review-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:7px}.row-review-error{width:100%;color:#c45656}.review :deep(.needs-review){--el-table-tr-bg-color:#fff8e8}@media(max-width:900px){.report-grid{grid-template-columns:1fr}.original{max-height:none}.sub-row{grid-template-columns:1fr 65px 1fr 1fr 40px}}
.goal-grid{display:flex;flex-wrap:wrap;align-items:center;gap:5px}.goal-minute{display:flex;align-items:center;gap:2px}.goal-minute .el-input{width:48px}.goal-minute .el-button{margin:0}.invalid{color:#c45656!important}.invalid-input :deep(.el-input__wrapper){box-shadow:0 0 0 1px #e35656 inset}.score-field{min-width:0;max-width:260px}.score-field small{max-width:260px;line-height:1.5}.score-row{align-items:flex-start;flex-wrap:wrap}.sub-heading{flex-wrap:wrap}
</style>
