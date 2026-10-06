<template>
  <div class="responsive-container">
    <div class="container-left" v-if="showLeft && ($slots.left || hasLeft)">
      <slot name="left" />
    </div>
    <div class="container-main">
      <slot />
    </div>
    <div class="container-right" v-if="showRight && ($slots.right || hasRight)">
      <slot name="right" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useResponsive } from '../../../composables/useResponsive'

/**
 * 响应式三栏布局容器
 * - 移动端：单列（仅主内容）
 * - 平板：双列（主内容 + 右栏）
 * - 桌面：三列（左栏 + 主内容 + 右栏）
 * 通过插槽 left / default / right 分发内容
 */
const props = defineProps({
  hasLeft: { type: Boolean, default: false },
  hasRight: { type: Boolean, default: false }
})

const { isMobile, isTablet, isDesktop } = useResponsive()

const showLeft = computed(() => isDesktop.value)
const showRight = computed(() => !isMobile.value) // 平板+桌面显示右栏
</script>

<style scoped>
.responsive-container {
  width: 100%;
}

@media (min-width: 768px) {
  .responsive-container {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 20px;
    align-items: start;
  }
}

@media (min-width: 1024px) {
  .responsive-container {
    grid-template-columns: 220px 1fr 300px;
    gap: 24px;
  }
}

.container-left {
  position: sticky;
  top: calc(var(--portal-navbar-height-pc, 64px) + 16px);
}

.container-right {
  position: sticky;
  top: calc(var(--portal-navbar-height-pc, 64px) + 16px);
}

@media (max-width: 767px) {
  .container-left,
  .container-right {
    display: none;
  }
}
</style>
