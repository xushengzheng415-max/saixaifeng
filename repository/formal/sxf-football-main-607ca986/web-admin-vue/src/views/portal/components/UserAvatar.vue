<template>
  <div class="user-avatar" :class="{ clickable }" @click="handleClick">
    <el-avatar v-if="src" :size="size" :src="src" />
    <el-avatar
      v-else
      :size="size"
      :style="{ background: bgColor, fontSize: nameFontSize, color: '#fff' }"
    >
      {{ initial }}
    </el-avatar>
    <span v-if="showName && name" class="avatar-name">{{ name }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

/**
 * 用户头像组件
 * 支持图片头像/首字母占位，可选展示昵称
 */
const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  size: { type: Number, default: 40 },
  showName: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])

// 首字母占位
const initial = computed(() => {
  return props.name ? props.name.charAt(0).toUpperCase() : '?'
})

// 字号随尺寸缩放
const nameFontSize = computed(() => Math.max(12, Math.floor(props.size * 0.4)) + 'px')

// 头像背景色（按名字首字母 hash 取色，保证同一用户颜色稳定）
const bgColor = computed(() => {
  const colors = ['#43A047', '#2E7D32', '#1B5E20', '#FFC107', '#E6A23C', '#409EFF']
  if (!props.name) return '#43A047'
  let hash = 0
  for (let i = 0; i < props.name.length; i++) {
    hash = props.name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
})

function handleClick() {
  if (props.clickable) emit('click')
}
</script>

<style scoped>
.user-avatar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.user-avatar.clickable {
  cursor: pointer;
}

.avatar-name {
  font-size: 14px;
  color: var(--portal-text-primary, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}
</style>
