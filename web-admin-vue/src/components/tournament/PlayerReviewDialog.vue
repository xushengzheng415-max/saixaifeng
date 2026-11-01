<template>
  <el-dialog :model-value="modelValue" title="审核队员" width="460px" style="max-width:calc(100vw - 32px)" append-to-body :close-on-click-modal="false" :close-on-press-escape="!loading" :show-close="!loading" @close="close">
    <div class="review-player"><PlayerAvatar v-if="player" :player="player" /><strong>{{ player?.name || '队员' }}</strong><span v-if="player?.jerseyNumber">{{ player.jerseyNumber }}号</span></div>
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="审核结果"><el-radio-group v-model="decision" :disabled="loading"><el-radio-button label="approved">通过</el-radio-button><el-radio-button label="rejected">驳回</el-radio-button></el-radio-group></el-form-item>
      <el-form-item v-if="decision === 'rejected'" label="驳回原因" required><el-input v-model="reason" type="textarea" :rows="3" maxlength="200" show-word-limit :disabled="loading" placeholder="请说明需要补充或修改的内容" /></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="loading" @click="close">取消</el-button><el-button :type="decision === 'rejected' ? 'danger' : 'success'" :loading="loading" :disabled="decision === 'rejected' && !reason.trim()" @click="submit">{{ decision === 'rejected' ? '确认驳回' : '确认通过' }}</el-button></template>
  </el-dialog>
</template>
<script setup>
import { ref,watch } from 'vue'
import PlayerAvatar from '../common/PlayerAvatar.vue'
const props=defineProps({modelValue:Boolean,player:Object,loading:Boolean})
const emit=defineEmits(['update:modelValue','submit'])
const decision=ref('approved'),reason=ref('')
watch(()=>props.modelValue,visible=>{if(visible){decision.value='approved';reason.value=String(props.player?.organizerReviewReason || '')}})
function close(){if(!props.loading)emit('update:modelValue',false)}
function submit(){if(props.loading || (decision.value==='rejected' && !reason.value.trim()))return;emit('submit',{decision:decision.value,reason:reason.value.trim()})}
</script>
<style scoped>
.review-player{display:flex;align-items:center;gap:12px;margin-bottom:18px;color:#25372b}.review-player strong{min-width:0;flex:1;overflow-wrap:anywhere}.review-player>span{color:#738178;font-size:13px}
</style>
