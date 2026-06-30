<template>
  <button
    class="follow-btn"
    :class="{ followed: isFollowed, loading }"
    :disabled="loading"
    @click.stop="handleClick"
  >
    <el-icon v-if="loading" class="is-loading"><Loading /></el-icon>
    <el-icon v-else-if="isFollowed"><Check /></el-icon>
    <el-icon v-else><Plus /></el-icon>
    <span>{{ buttonText }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { Plus, Check, Loading } from '@element-plus/icons-vue'

/**
 * 关注按钮组件
 * 用于关注球队/球员/赛事
 * 关注状态由父组件控制（受控组件），点击触发 follow/unfollow 事件
 */
const props = defineProps({
  isFollowed: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  followedText: { type: String, default: '已关注' },
  followText: { type: String, default: '关注' }
})

const emit = defineEmits(['follow', 'unfollow', 'toggle'])

const buttonText = computed(() => (props.isFollowed ? props.followedText : props.followText))

function handleClick() {
  if (props.loading) return
  // 触发统一的 toggle 事件，同时按状态触发语义化事件
  emit('toggle', !props.isFollowed)
  if (props.isFollowed) {
    emit('unfollow')
  } else {
    emit('follow')
  }
}
</script>

<style scoped>
.follow-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid var(--portal-primary-lighter, #43A047);
  background: var(--portal-primary-lighter, #43A047);
  color: #fff;
  border-radius: var(--portal-radius-pill, 999px);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  line-height: 1;
}

.follow-btn:hover:not(:disabled) {
  background: var(--portal-primary-light, #2E7D32);
  border-color: var(--portal-primary-light, #2E7D32);
}

.follow-btn.followed {
  background: #fff;
  color: var(--portal-text-secondary, #909399);
  border-color: var(--portal-border, #ebeef5);
}

.follow-btn.followed:hover:not(:disabled) {
  color: var(--portal-danger, #f56c6c);
  border-color: var(--portal-danger, #f56c6c);
  background: #fff;
}

.follow-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.follow-btn.loading {
  opacity: 0.7;
}
</style>
