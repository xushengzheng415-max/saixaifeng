<template>
  <span class="status-badge" :class="statusClass">
    <span v-if="status === 'ongoing'" class="portal-live-pulse" />
    {{ statusText }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

/**
 * 比赛状态标签组件
 * status: 'upcoming'（未开始） | 'ongoing'（进行中） | 'finished'（已结束）
 */
const props = defineProps({
  status: { type: String, default: 'upcoming' },
  // 自定义文本（可选），不传则使用默认映射
  text: { type: String, default: '' }
})

const STATUS_TEXT = {
  upcoming: '未开始',
  ongoing: '进行中',
  finished: '已结束'
}

const statusText = computed(() => props.text || STATUS_TEXT[props.status] || '未知')

const statusClass = computed(() => `status-${props.status}`)
</script>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--portal-radius-sm, 6px);
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}

.status-upcoming {
  background: #ECF5FF;
  color: var(--portal-info, #409EFF);
}

.status-ongoing {
  background: var(--portal-danger-bg, #fdecea);
  color: var(--portal-danger, #f56c6c);
}

.status-finished {
  background: #F4F4F5;
  color: var(--portal-text-secondary, #909399);
}

.status-badge .portal-live-pulse {
  width: 6px;
  height: 6px;
}

.status-badge .portal-live-pulse::after {
  width: 6px;
  height: 6px;
}
</style>
