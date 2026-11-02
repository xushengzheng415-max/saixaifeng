<template>
  <el-dialog :model-value="modelValue" :title="`报名资料 · ${source?.name || divisionName || '当前组别'}`" width="min(600px, calc(100vw - 32px))" :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="close">
    <div v-loading="loading">
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <template v-if="source">
        <el-alert v-if="editState && !editState.canEdit" :title="editState.reason" type="warning" :closable="false" />
        <section class="materials-section"><h3>球队资料</h3><p>队名、队徽沿用球队资料，负责人及手机号按现有登录流程核验。</p></section>
        <section class="materials-section"><h3>球员资料</h3><el-form label-position="left" label-width="170px" :disabled="saving || !editState?.canEdit">
          <el-form-item label="姓名、证件号码"><span class="fixed-material">基础资料</span></el-form-item>
          <el-form-item label="身份证人像面"><el-switch v-model="form.identityFrontRequired" @change="frontChanged" /></el-form-item>
          <el-form-item label="身份证国徽面"><el-switch v-model="form.identityBackRequired" @change="dependentChanged" /></el-form-item>
          <el-form-item label="本人照片比对"><el-switch v-model="form.faceComparisonRequired" @change="dependentChanged" /><span class="material-note">复用现有照片比对</span></el-form-item>
          <el-form-item label="标准形象照"><el-switch v-model="form.portraitRequired" /></el-form-item>
          <el-form-item label="保险保单或凭证"><el-switch v-model="form.insuranceProofRequired" /><span class="material-note">开启后未交保单不可出示参赛证</span></el-form-item>
        </el-form></section>
        <p class="material-note">仅作用于当前组别；保存会保留原规则版本。</p>
      </template>
      <el-empty v-else-if="!loading" description="资料要求尚未读取"><el-button @click="load">重新读取</el-button></el-empty>
    </div>
    <template #footer><el-button :disabled="saving" @click="close(false)">取消</el-button><el-button type="primary" :loading="saving" :disabled="loading || !source || !editState?.canEdit" @click="save">保存要求</el-button></template>
  </el-dialog>
</template>
<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { callFunctionHTTP, readDivisionRuleEditState, reviseDivisionRules, confirmDivisionRules } from '../../utils/cloud'
const props=defineProps({modelValue:Boolean,divisionId:String,divisionName:String,tournamentId:String,tournament:{type:Object,default:()=>({})}})
const emit=defineEmits(['update:modelValue','saved'])
const source=ref(null),editState=ref(null),loading=ref(false),saving=ref(false),error=ref('')
const form=reactive({identityFrontRequired:false,identityBackRequired:false,faceComparisonRequired:false,portraitRequired:false,insuranceProofRequired:false})
let session='',request=0,selectedId=''
const sessionKey=()=>[localStorage.getItem('authToken'),localStorage.getItem('userId')].join('|')
function assertSession(){if(session!==sessionKey())throw new Error('账号已切换，请重新打开资料设置')}
function close(value){if(saving.value)return;request++;emit('update:modelValue',value)}
function frontChanged(value){if(!value){form.identityBackRequired=false;form.faceComparisonRequired=false}}
function dependentChanged(){if(form.identityBackRequired || form.faceComparisonRequired)form.identityFrontRequired=true}
function setting(sources,names){for(const item of sources)for(const name of names)if(item && item[name]!==undefined && item[name]!==null && item[name]!=='')return item[name]===true || item[name]===1 || ['true','1','yes','required'].includes(String(item[name]).toLowerCase());return false}
async function freshDivision(){const result=await callFunctionHTTP('dbQuery',{collection:'divisions',operation:'get',id:selectedId},60000,{cache:'bypass'});assertSession();if(!result?.success || !result.data)throw new Error(result?.error || '组别资料读取失败');const row=Array.isArray(result.data)?result.data[0]:result.data;if(String(row.tournamentId)!==String(props.tournamentId))throw new Error('组别不属于当前赛事');return row}
async function load(){
  const current=++request;source.value=null;editState.value=null;error.value='';loading.value=true;session=sessionKey();selectedId=props.divisionId
  try{
    if(!selectedId || selectedId==='default')throw new Error('请先创建并选择竞赛组别')
    const [division,state]=await Promise.all([freshDivision(),readDivisionRuleEditState(selectedId)])
    assertSession();if(current!==request)return
    source.value=division;editState.value=state
    const rules=[division,division.rulesSnapshot,props.tournament],stored=rules.find(row=>row?.registrationMaterials)?.registrationMaterials
    const insuranceOn=setting(rules,['insuranceRequired'])
    if(stored)Object.assign(form,{...stored,insuranceProofRequired:stored.insuranceProofRequired===true||insuranceOn})
    else{const identity=setting(rules,['identityVerificationRequired','requiresRealName','requireRealName']);Object.assign(form,{identityFrontRequired:identity,identityBackRequired:identity,faceComparisonRequired:identity,portraitRequired:setting(rules,['portraitRequired','requiresPortrait','requirePortrait']),insuranceProofRequired:insuranceOn})}
  }catch(problem){if(current===request)error.value=problem.message || '资料要求读取失败'}finally{if(current===request)loading.value=false}
}
async function save(){
  if(saving.value || !editState.value?.canEdit)return
  saving.value=true;error.value=''
  try{
    assertSession();const state=await readDivisionRuleEditState(selectedId);assertSession();if(!state.canEdit)throw new Error(state.reason)
    let current=await freshDivision()
    if(current.rulesLocked===true || current.ruleFinalized===true || ['finalized','locked','published'].includes(String(current.ruleStatus||''))){const revision=await reviseDivisionRules(selectedId);assertSession();if(!revision?.success)throw new Error(revision?.error || '规则修订失败');current=revision.data;source.value=current}
    const materials={version:1,identityNumberRequired:true,...form}
    const result=await confirmDivisionRules(selectedId,{...current.rulesSnapshot,...current,registrationMaterials:materials,identityVerificationRequired:form.identityFrontRequired || form.faceComparisonRequired,identityDocumentRequired:form.identityFrontRequired || form.identityBackRequired,portraitRequired:form.portraitRequired,insuranceRequired:form.insuranceProofRequired})
    assertSession();if(!result?.success)throw new Error(result?.error || result?.message || '保存失败，请先完成组别规则')
    emit('saved',result.data);emit('update:modelValue',false);ElMessage.success('报名资料要求已保存')
  }catch(problem){error.value=problem.message || '保存失败，请重试'}finally{saving.value=false}
}
watch(()=>props.modelValue,value=>{if(value)load();else request++})
</script>
<style scoped>
.materials-section{padding:16px 0;border-bottom:1px solid #e5ebe7}.materials-section h3{margin:0 0 14px;font-size:16px}.materials-section p,.material-note{color:#748078;font-size:12px;line-height:1.6}.material-note{margin-left:12px}.materials-section :deep(.el-form-item){margin-bottom:16px}.fixed-material{color:#748078}
</style>
