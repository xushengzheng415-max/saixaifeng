<template>
  <button
    class="claim-btn"
    :class="{ claimed: isClaimed, loading }"
    :disabled="loading || isClaimed"
    @click.stop="handleClick"
  >
    <el-icon v-if="loading" class="is-loading"><Loading /></el-icon>
    <el-icon v-else-if="isClaimed"><Check /></el-icon>
    <el-icon v-else><Pointer /></el-icon>
    <span>{{ buttonText }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { Pointer, Check, Loading } from '@element-plus/icons-vue'

/**
 * 认领按钮组件
 * 用于球员认领球队身份、教练认领球队等场景
 * 受控组件，认领状态由父组件管理
 */
const props = defineProps({
  isClaimed: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  claimedText: { type: String, default: '已认领' },
  claimText: { type: String, default: '认领' }
})

const emit = defineEmits(['claim'])

const buttonText = computed(() => (props.isClaimed ? props.claimedText : props.claimText))

function handleClick() {
  if (props.loading || props.isClaimed) return
  emit('claim')
}
</script>

<style scoped>
.claim-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid var(--portal-gold, #FFC107);
  background: var(--portal-gold, #FFC107);
  color: #5d4037;
  border-radius: var(--portal-radius-pill, 999px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1;
}

.claim-btn:hover:not(:disabled) {
  background: #FFB300;
  border-color: #FFB300;
}

.claim-btn.claimed {
  background: #fff;
  color: var(--portal-text-secondary, #909399);
  border-color: var(--portal-border, #ebeef5);
  cursor: default;
}

.claim-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
</style>
