<template>
  <el-button v-if="eligible && allowed" link type="primary" @click="open">核实时长</el-button>
  <el-dialog v-model="visible" title="核实时长" width="min(460px, 92vw)" append-to-body :close-on-click-modal="false" :before-close="close">
    <div v-loading="loading">
      <p>{{ info.matchName }}</p>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-form label-position="top">
        <el-form-item label="时长单位"><el-radio-group v-model="form.minutesBasis"><el-radio value="period">每节／半场</el-radio><el-radio value="total">整场</el-radio></el-radio-group></el-form-item>
        <el-form-item label="时长（分钟）"><el-input-number v-model="form.minutes" :min="1" :max="300" /></el-form-item>
        <el-form-item v-if="form.minutesBasis === 'period'" label="节数／半场数"><el-input-number v-model="form.periodCount" :min="1" :max="10" :precision="0" /></el-form-item>
        <el-form-item label="核实依据"><el-input v-model="form.reason" type="textarea" :rows="3" maxlength="500" placeholder="例如：本届规程第3条，每半场40分钟，共2个半场" /></el-form-item>
      </el-form>
      <p>整场 {{ total || '—' }} 分钟；保存后重新计算出场时间。</p>
    </div>
    <template #footer><el-button :disabled="saving" @click="visible=false">取消</el-button><el-button type="primary" :disabled="loading || !info.editable || !total || form.reason.trim().length < 4" :loading="saving" @click="save">保存核实</el-button></template>
  </el-dialog>
</template>
<script setup>
import {computed,reactive,ref} from 'vue'
import {ElMessage} from 'element-plus'
import {callFunction} from '@/utils/cloud'
const props=defineProps({issue:{type:Object,required:true},allowed:Boolean})
const emit=defineEmits(['saved'])
const eligible=computed(()=>props.issue.matchId && /^(MATCH_DURATION_|DURATION_)/.test(props.issue.code||''))
const visible=ref(false),loading=ref(false),saving=ref(false),error=ref(''),info=ref({})
const form=reactive({minutesBasis:'period',minutes:null,periodCount:2,reason:''})
const total=computed(()=>form.minutes ? form.minutes*(form.minutesBasis==='period'?form.periodCount:1):null)
function close(done){if(!saving.value)done()}
async function api(data){const reply=await callFunction('dataCenter',data);if(!reply.success)throw new Error(reply.error||'核实失败，请重试');return reply}
async function open(){visible.value=true;loading.value=true;error.value='';info.value={};Object.assign(form,{minutesBasis:'period',minutes:null,periodCount:2,reason:''});try{info.value=await api({action:'inspectDuration',matchId:props.issue.matchId});if(!info.value.editable)error.value='此比赛已核实，请刷新列表'}catch(e){error.value=e.message}finally{loading.value=false}}
async function save(){if(saving.value)return;saving.value=true;error.value='';try{await api({action:'verifyDuration',matchId:props.issue.matchId,expectedRevision:info.value.revision,...form});visible.value=false;ElMessage.success('时长已核实');emit('saved')}catch(e){error.value=e.message}finally{saving.value=false}}
</script>
