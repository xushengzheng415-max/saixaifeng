<template>
  <span class="live-dot-wrap" :class="[sizeClass]">
    <span class="portal-live-pulse" />
    <span v-if="showText" class="live-text">直播中</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

/**
 * 直播脉冲点组件
 * 红色脉冲动画，用于进行中比赛的视觉提示
 */
const props = defineProps({
  size: { type: String, default: 'md' }, // sm / md / lg
  showText: { type: Boolean, default: false }
})

const sizeClass = computed(() => `size-${props.size}`)
</script>

<style scoped>
.live-dot-wrap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  line-height: 1;
}

.live-dot-wrap .portal-live-pulse {
  flex-shrink: 0;
}

.live-text {
  color: var(--portal-danger, #f56c6c);
  font-size: 12px;
  font-weight: 500;
}

/* 尺寸变体 */
.size-sm .portal-live-pulse {
  width: 6px;
  height: 6px;
}
.size-sm .portal-live-pulse::after {
  width: 6px;
  height: 6px;
}
.size-sm .live-text {
  font-size: 11px;
}

.size-md .portal-live-pulse {
  width: 8px;
  height: 8px;
}

.size-lg .portal-live-pulse {
  width: 10px;
  height: 10px;
}
.size-lg .portal-live-pulse::after {
  width: 10px;
  height: 10px;
}
.size-lg .live-text {
  font-size: 13px;
}
</style>
