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
          <span>:</span><el-input-number v-model="draft.score.away" :min="0" :max="99" :precision="0" aria-label="客队比分" />
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
                </el-select><small v-if="row.originalName">原表：{{ row.number }}号 {{ row.originalName }}</small>
              </template>
            </el-table-column>
            <el-table-column label="阵容" width="108"><template #default="{row}"><el-select v-model="row.role"><el-option v-for="r in roles" :key="r.value" :label="r.label" :value="r.value" /></el-select></template></el-table-column>
            <el-table-column v-for="field in fields" :key="field.key" :label="field.label" width="85"><template #default="{row}"><el-input v-model="row[field.key]" :aria-label="`${field.label}分钟`" /></template></el-table-column>
            <el-table-column label="身份" width="90"><template #default="{row}"><el-checkbox v-model="row.captain">队长</el-checkbox><el-checkbox v-model="row.goalkeeper">门将</el-checkbox></template></el-table-column>
            <el-table-column width="58"><template #default="{ $index }"><el-button link type="danger" @click="draft.teams[side].splice($index,1)">删除</el-button></template></el-table-column>
          </el-table>
          <el-button link @click="addPlayer">添加球员</el-button>
          <div class="sub-heading"><strong>换人记录</strong><el-button link @click="pairSubstitutions">按分钟配对</el-button><el-button link @click="substitutions.push({side,minute:null,inId:'',outId:''})">添加换人</el-button></div>
          <p class="field-note">事件填写分钟，多次用逗号分隔；换人须核对双方。</p>
          <div v-for="(row,i) in substitutions" :key="i" class="sub-row">
            <el-select v-model="row.side" aria-label="换人球队"><el-option :label="homeName" value="home" /><el-option :label="awayName" value="away" /></el-select>
            <el-input-number v-model="row.minute" :min="0" :max="150" :precision="0" placeholder="分钟" :controls="false" />
            <el-select v-model="row.outId" filterable placeholder="换下"><el-option v-for="p in activePlayers(row.side)" :key="p.playerId" :label="`${p.number}号 ${p.name}`" :value="p.playerId" /></el-select>
            <el-select v-model="row.inId" filterable placeholder="换上"><el-option v-for="p in activePlayers(row.side)" :key="p.playerId" :label="`${p.number}号 ${p.name}`" :value="p.playerId" /></el-select>
            <el-button link type="danger" @click="substitutions.splice(i,1)">删除</el-button>
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
const props=defineProps({matchId:String,homeName:String,awayName:String,disabled:Boolean,loadRoster:Function})
const emit=defineEmits(['saved'])
const visible=ref(false),busy=ref(false),saving=ref(false),stage=ref('正在识别'),error=ref(''),preview=ref(''),draft=ref(null),fileInput=ref(null),side=ref('home'),rosters=ref({home:[],away:[]}),substitutions=ref([])
let selectedFile=null; let uploadedFileId=''; let generation=0
const roles=[{label:'待确认',value:'unknown'},{label:'首发',value:'starter'},{label:'替补',value:'substitute'},{label:'不出场',value:'absent'}]
const fields=[{key:'on',label:'换上'},{key:'off',label:'换下'},{key:'goals',label:'进球'},{key:'yellow',label:'黄牌'},{key:'red',label:'红牌'}]
function chooseFile(){if(!busy.value&&!props.disabled)fileInput.value?.click()}
function beforeClose(done){if(!busy.value)done()}
function revoke(){if(preview.value)URL.revokeObjectURL(preview.value);preview.value=''}
function activePlayers(team){return (draft.value?.teams[team]||[]).filter(row=>['starter','substitute'].includes(row.role)&&row.playerId)}
function rowClass({row}){return !row.playerId||row.role==='unknown'?'needs-review':''}
function selectPlayer(row){const p=rosters.value[side.value].find(p=>p.playerId===row.playerId);if(p){row.name=p.name;row.number=p.number}}
function addPlayer(){draft.value.teams[side.value].push({playerId:'',name:'',number:'',role:'unknown',on:'',off:'',goals:'',yellow:'',red:'',captain:false,goalkeeper:false})}
async function readFile(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  if(!['image/jpeg','image/png'].includes(file.type)||file.size>3*1024*1024)return ElMessage.warning('请选择不超过3MB的JPG或PNG照片')
  revoke();preview.value=URL.createObjectURL(file);visible.value=true;draft.value=null;error.value=''
  selectedFile=file;uploadedFileId='';await recognize()
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
      if(candidates.length===1){row.name=candidates[0].name;if(row.originalName.replace(/\s/g,'')!==row.name.replace(/\s/g,''))row.role='unknown'}
    }
    pairSubstitutions()
  }catch(e){if(current===generation)error.value=e.message||'识别失败，请重试'}finally{if(current===generation)busy.value=false}
}
function minutes(value){const text=String(value||'').trim().replace(/[′'’]/g,'');return /^\d{1,3}(?:\s*[,，;；、]\s*\d{1,3})*$/.test(text)?text.split(/[,，;；、]/).map(Number):[]}
function pairSubstitutions(){
  const result=[]
  for(const team of ['home','away']){
    const times=new Set(activePlayers(team).flatMap(row=>[...minutes(row.on),...minutes(row.off)]))
    for(const minute of times){const ins=activePlayers(team).filter(row=>minutes(row.on).includes(minute)),outs=activePlayers(team).filter(row=>minutes(row.off).includes(minute));for(let i=0;i<Math.max(ins.length,outs.length);i++)result.push({side:team,minute,inId:ins.length===1?ins[0].playerId:'',outId:outs.length===1?outs[0].playerId:''})}
  }
  substitutions.value=result
}
async function confirm(){
  if(!draft.value||busy.value||saving.value)return
  const rows=[...draft.value.teams.home,...draft.value.teams.away]
  if(rows.some(row=>row.role==='unknown'||(!row.playerId&&row.role!=='absent')))return ElMessage.warning('请核对标出的球员及首发替补')
  for(const row of rows)for(const field of fields){const text=String(row[field.key]||'').trim();if(text&&!minutes(text).length)return ElMessage.warning('请核对事件分钟；无法确认的记录不要填0')}
  // Every on/off minute must have a confirmed pair; do not silently discard marks.
  for(const team of ['home','away'])for(const row of activePlayers(team))for(const field of ['on','off'])for(const minute of minutes(row[field]))if(!substitutions.value.some(sub=>sub.side===team&&sub.minute===minute&&(field==='on'?sub.inId:sub.outId)===row.playerId))return ElMessage.warning('换上换下记录尚未完整配对')
  saving.value=true;busy.value=true;stage.value='正在保存';error.value=''
  try{const result=await callFunctionHTTP('confirmRefereeReport',{matchId:props.matchId,...draft.value,substitutions:substitutions.value},120000);if(!result?.success)throw new Error(result?.message||result?.error||'记录未保存');ElMessage.success(result.alreadyImported?'这张裁判表已录入':'裁判表已录入');visible.value=false;emit('saved')}catch(e){error.value=e.message}finally{saving.value=false;busy.value=false}
}
onBeforeUnmount(()=>{generation++;revoke()})
</script>

<style scoped>
.report-grid{display:grid;grid-template-columns:minmax(220px,30%) minmax(0,1fr);gap:20px;min-height:250px}.original{max-height:70vh;overflow:auto;background:#f4f7f5}.original img{display:block;width:100%;height:auto}.review{min-width:0}.score-row{display:flex;align-items:center;gap:12px;margin-bottom:14px}.review .el-alert{margin-bottom:12px}small{display:block;color:#7c8580;font-size:12px;margin-top:4px}.sub-heading{display:flex;gap:16px;align-items:center;margin-top:18px}.sub-row{display:grid;grid-template-columns:1fr 75px 1fr 1fr 40px;gap:8px;margin-bottom:8px}.sub-row .el-input-number{width:75px}.field-note{font-size:12px;color:#67766e;margin:8px 0}.review :deep(.needs-review){--el-table-tr-bg-color:#fff8e8}@media(max-width:900px){.report-grid{grid-template-columns:1fr}.original{max-height:220px}.original img{width:auto;max-width:100%;max-height:600px}.sub-row{grid-template-columns:1fr 65px 1fr 1fr 40px}}
</style>
