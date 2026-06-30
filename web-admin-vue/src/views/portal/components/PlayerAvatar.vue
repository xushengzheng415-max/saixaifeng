<template>
  <div class="player-avatar" :class="{ vertical }" @click="handleClick">
    <div class="avatar-wrap" :style="{ width: size + 'px', height: size + 'px' }">
      <el-avatar v-if="src" :size="size" :src="src" shape="square" />
      <el-avatar
        v-else
        :size="size"
        shape="square"
        :style="{ background: bgColor, fontSize: numberFontSize, color: '#fff', fontWeight: 600 }"
      >
        {{ jerseyNumber !== null && jerseyNumber !== undefined && jerseyNumber !== '' ? jerseyNumber : initial }}
      </el-avatar>
      <!-- 球衣号码角标 -->
      <span v-if="showNumber && jerseyNumber !== null && jerseyNumber !== undefined && jerseyNumber !== ''" class="number-badge">
        #{{ jerseyNumber }}
      </span>
    </div>
    <div v-if="showName && name" class="player-info">
      <div class="player-name portal-text-ellipsis">{{ name }}</div>
      <div v-if="position" class="player-position">{{ position }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

/**
 * 球员头像组件
 * 方形头像 + 球衣号码角标 + 可选位置信息
 */
const props = defineProps({
  src: { type: String, default: '' },
  name: { type: String, default: '' },
  jerseyNumber: { type: [Number, String], default: null },
  position: { type: String, default: '' },
  size: { type: Number, default: 48 },
  showName: { type: Boolean, default: false },
  showNumber: { type: Boolean, default: true },
  vertical: { type: Boolean, default: false },
  clickable: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])

const initial = computed(() => (props.name ? props.name.charAt(0) : '?'))

const numberFontSize = computed(() => Math.max(12, Math.floor(props.size * 0.38)) + 'px')

// 按号码 hash 取色，保证同一球员颜色稳定
const bgColor = computed(() => {
  const colors = ['#43A047', '#2E7D32', '#1B5E20', '#1565C0', '#E6A23C', '#8E24AA']
  const seed = props.jerseyNumber !== null ? String(props.jerseyNumber) : props.name
  if (!seed) return '#43A047'
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
})

function handleClick() {
  if (props.clickable) emit('click')
}
</script>

<style scoped>
.player-avatar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.player-avatar.vertical {
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.avatar-wrap {
  position: relative;
  border-radius: var(--portal-radius-sm, 6px);
  overflow: visible;
  flex-shrink: 0;
}

.avatar-wrap :deep(.el-avatar) {
  border-radius: var(--portal-radius-sm, 6px);
}

.number-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: var(--portal-gold, #FFC107);
  color: #5d4037;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: var(--portal-radius-pill, 999px);
  border: 1.5px solid #fff;
  line-height: 1.2;
  white-space: nowrap;
}

.player-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.player-name {
  font-size: 13px;
  color: var(--portal-text-primary, #303133);
  font-weight: 500;
  max-width: 100px;
}

.player-position {
  font-size: 11px;
  color: var(--portal-text-secondary, #909399);
}

.player-avatar.vertical .player-info {
  align-items: center;
}

.player-avatar.vertical .player-name {
  max-width: 80px;
}
</style>
