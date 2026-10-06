<template>
  <div class="team-logo" :class="{ vertical }" @click="handleClick">
    <div class="logo-wrap" :style="{ width: size + 'px', height: size + 'px' }">
      <img v-if="src" :src="src" :alt="name" class="logo-img" @error="handleImgError" />
      <div v-else class="logo-fallback" :style="fallbackStyle">
        {{ initial }}
      </div>
    </div>
    <div v-if="showName && name" class="team-info">
      <div class="team-name portal-text-ellipsis" :style="{ maxWidth: nameMaxWidth + 'px' }">
        {{ name }}
      </div>
      <div v-if="subText" class="team-sub">{{ subText }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

/**
 * 球队队徽组件
 * 支持图片/首字母占位，图片加载失败自动降级为占位
 */
const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: Number, default: 40 },
  showName: { type: Boolean, default: false },
  vertical: { type: Boolean, default: false },
  subText: { type: String, default: '' },
  nameMaxWidth: { type: Number, default: 80 },
  clickable: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])

// 图片是否加载失败（需要降级到首字母）
const imgFailed = ref(false)
watch(() => props.src, () => { imgFailed.value = false })

const showFallback = computed(() => !props.src || imgFailed.value)

const initial = computed(() => (props.name ? props.name.charAt(0) : '队'))

// 占位背景色（按名字 hash 取色）
const fallbackStyle = computed(() => {
  const colors = ['#43A047', '#2E7D32', '#1B5E20', '#1565C0', '#6A1B9A', '#E6A23C']
  if (!props.name) return { background: '#43A047' }
  let hash = 0
  for (let i = 0; i < props.name.length; i++) {
    hash = props.name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return {
    background: colors[Math.abs(hash) % colors.length],
    fontSize: Math.max(12, Math.floor(props.size * 0.4)) + 'px'
  }
})

function handleImgError() {
  imgFailed.value = true
}

function handleClick() {
  if (props.clickable) emit('click')
}
</script>

<style scoped>
.team-logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.team-logo.vertical {
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.logo-wrap {
  flex-shrink: 0;
  border-radius: var(--portal-radius-sm, 6px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
}

.team-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.team-name {
  font-size: 14px;
  color: var(--portal-text-primary, #303133);
  font-weight: 500;
}

.team-sub {
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
}

.team-logo.vertical .team-info {
  align-items: center;
}
</style>
