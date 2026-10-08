<template>
  <section class="demo-claim">
    <el-tag type="warning" effect="plain">演示示例</el-tag>
    <h3>{{ tournamentName || '模拟足球赛事' }}</h3>
    <div class="claim-code-example" aria-label="球队认领码示例，不可扫码">
      <svg viewBox="0 0 160 160" aria-hidden="true"><path d="M12 12h40v40H12zm96 0h40v40h-40zM12 108h40v40H12z" fill="none" stroke="#087c47" stroke-width="8"/><path d="M76 20v40h20v30h42M72 108h30v40M120 108h28v40" fill="none" stroke="#087c47" stroke-width="8"/><rect x="16" y="62" width="132" height="36" fill="#fff"/><text x="80" y="86" text-anchor="middle" font-size="17" fill="#087c47">认领码示例</text></svg>
      <span>示例码不可扫码</span>
    </div>
    <el-steps :active="step" finish-status="success" align-center><el-step title="手机号验证"/><el-step title="选择球队"/><el-step title="确认认领"/></el-steps>
    <div class="claim-stage">
      <template v-if="step===0"><el-form label-position="top"><el-form-item label="模拟手机号"><el-input v-model="phone" maxlength="11" inputmode="numeric"/></el-form-item></el-form><el-button type="primary" @click="verify">模拟验证</el-button></template>
      <template v-else-if="step===1"><el-radio-group v-model="selected"><el-radio v-for="team in candidates" :key="team.id" :label="team.id">{{ team.name }}</el-radio></el-radio-group><el-button type="primary" :disabled="!selected" @click="step=2">下一步</el-button></template>
      <template v-else-if="step===2"><p>{{ selectedName }}</p><el-button type="primary" @click="step=3">模拟认领</el-button></template>
      <template v-else><el-result icon="success" title="模拟认领完成"><template #sub-title>{{ selectedName }}</template><template #extra><el-button @click="step=0">重新演示</el-button></template></el-result></template>
    </div>
    <small>仅演示操作流程，不发送短信或认领通知</small>
  </section>
</template>
<script setup>
import {computed,ref} from 'vue'
import {ElMessage} from 'element-plus'
const props=defineProps({tournamentName:{type:String,default:''},teams:{type:Array,default:()=>[]}})
const step=ref(0),phone=ref('13800000000'),selected=ref('')
const candidates=computed(()=>props.teams.length?props.teams.map(team=>({id:String(team.teamId||team._id),name:team.teamName||team.name||'虚拟球队'})):[1,2,3].map(index=>({id:`demo-claim-example-${index}`,name:`模拟球队${index}`})))
const selectedName=computed(()=>candidates.value.find(team=>team.id===selected.value)?.name||'')
function verify(){if(!/^1\d{10}$/.test(phone.value))return ElMessage.warning('请输入11位模拟手机号');step.value=1}
</script>
<style scoped>
.demo-claim{text-align:center}.demo-claim h3{margin:14px 0;color:#193e2b;font-size:18px}.claim-code-example{display:flex;flex-direction:column;align-items:center;gap:8px;margin:16px 0 24px;color:#758078;font-size:12px}.claim-code-example svg{width:160px;height:160px}.claim-stage{max-width:360px;min-height:144px;margin:24px auto 16px}.claim-stage .el-radio-group{display:flex;flex-direction:column;align-items:flex-start;margin-bottom:16px}.demo-claim>small{color:#758078;font-size:12px}
</style>
