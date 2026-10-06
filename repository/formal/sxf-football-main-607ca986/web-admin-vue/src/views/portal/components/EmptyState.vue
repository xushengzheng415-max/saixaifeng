<template>
  <div class="empty-state" :style="{ padding: padding }">
    <div class="empty-content">
      <!-- 自定义图片/图标 -->
      <div v-if="$slots.image" class="empty-image">
        <slot name="image" />
      </div>
      <!-- 默认图标 -->
      <div v-else class="empty-icon">
        <svg viewBox="0 0 120 120" class="icon-svg">
          <!-- 足球图标 -->
          <circle cx="60" cy="60" r="50" fill="#E8F5E9" stroke="#43A047" stroke-width="2"/>
          <polygon points="60,15 68,45 100,45 73,65 83,95 60,75 37,95 47,65 20,45 52,45" fill="#43A047" opacity="0.8"/>
        </svg>
      </div>

      <!-- 描述文字 -->
      <div class="empty-description">{{ description }}</div>

      <!-- 操作按钮 -->
      <div v-if="$slots.default" class="empty-action">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 空状态通用组件 - 精致化版本
 * 设计要求：
 * - 插画风格（SVG内联）
 * - 提示文字
 * - 操作按钮（可选）
 */
defineProps({
  description: {
    type: String,
    default: '暂无数据'
  },
  imageSize: {
    type: Number,
    default: 120
  },
  padding: {
    type: String,
    default: '48px 0'
  }
})
</script>

<style scoped>
.empty-state {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px;
}

.empty-image {
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.icon-svg {
  width: 100%;
  height: 100%;
}

.empty-description {
  font-size: 14px;
  color: var(--portal-text-secondary, #909399);
  text-align: center;
  line-height: 1.6;
}

.empty-action {
  margin-top: 8px;
}
</style>
