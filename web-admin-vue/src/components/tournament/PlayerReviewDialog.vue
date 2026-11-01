<template>
  <el-dialog :model-value="modelValue" title="驳回队员" width="460px" style="max-width:calc(100vw - 32px)" append-to-body :close-on-click-modal="false" :close-on-press-escape="!loading" :show-close="!loading" @close="close">
    <div class="review-player"><PlayerAvatar v-if="player" :player="player" /><strong>{{ player?.name || '队员' }}</strong><span v-if="player?.jerseyNumber">{{ player.jerseyNumber }}号</span></div>
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="驳回原因（可多选）" required><el-checkbox-group v-model="selected" :disabled="loading" class="rejection-options"><el-checkbox v-for="item in PLAYER_REJECTION_REASONS" :key="item.value" :label="item.value">{{ item.label }}</el-checkbox></el-checkbox-group></el-form-item>
      <el-form-item v-if="selected.includes('other')" label="其他说明" required><el-input v-model="otherReason" type="textarea" :rows="2" maxlength="100" show-word-limit :disabled="loading" placeholder="填写具体问题" /></el-form-item>
    </el-form>
    <template #footer><el-button :disabled="loading" @click="close">取消</el-button><el-button type="danger" :loading="loading" :disabled="!reason" @click="submit">确认驳回</el-button></template>
  </el-dialog>
</template>
<script setup>
import { computed,ref,watch } from 'vue'
import PlayerAvatar from '../common/PlayerAvatar.vue'
import { PLAYER_REJECTION_REASONS,playerRejectionReason } from '../../utils/playerRejectionReasons.js'
const props=defineProps({modelValue:Boolean,player:Object,loading:Boolean})
const emit=defineEmits(['update:modelValue','submit'])
const selected=ref([]),otherReason=ref('')
const reason=computed(()=>playerRejectionReason(selected.value,otherReason.value))
watch(()=>props.modelValue,visible=>{if(visible){selected.value=[];otherReason.value=''}})
function close(){if(!props.loading)emit('update:modelValue',false)}
function submit(){if(props.loading || !reason.value)return;emit('submit',{decision:'rejected',reason:reason.value})}
</script>
<style scoped>
.review-player{display:flex;align-items:center;gap:12px;margin-bottom:18px;color:#25372b}.review-player strong{min-width:0;flex:1;overflow-wrap:anywhere}.review-player>span{color:#738178;font-size:13px}.rejection-options{display:grid;grid-template-columns:1fr 1fr;width:100%;gap:4px 12px}.rejection-options :deep(.el-checkbox){margin-right:0}
</style>
