<template>
  <div class="quick-entry-grid">
    <div class="grid-container">
      <div
        v-for="item in entries"
        :key="item.key"
        class="grid-item"
        @click="handleClick(item)"
      >
        <div class="item-icon" :style="{ background: item.bgColor }">
          <el-icon :size="28">
            <component :is="item.icon" />
          </el-icon>
        </div>
        <span class="item-label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import {
  Trophy, Medal, Flag, Sunny, Basketball, Collection, MoreFilled, Star
} from '@element-plus/icons-vue'

/**
 * 快速入口宫格组件
 * 设计要求：
 * - 移动端：4列 grid，gap 12px
 * - PC端：8列 grid 或横向滚动
 * - 每个入口：圆角方形容器 + 图标 + 文字
 * - hover: transform translateY(-2px) + 阴影加深
 * - 各分类不同颜色
 */
const emit = defineEmits(['select'])

const router = useRouter()

const entries = [
  { key: 'youth', label: '青少年赛事', icon: Sunny, bgColor: '#F3E5F5', color: '#AB47BC' },
  { key: 'amateur', label: '业余赛事', icon: Basketball, bgColor: '#E8F5E9', color: '#66BB6A' },
  { key: 'local', label: '地协赛', icon: Flag, bgColor: '#E3F2FD', color: '#42A5F5' },
  { key: 'city', label: '城市联赛', icon: Medal, bgColor: '#FFF3E0', color: '#FF9800' },
  { key: 'professional', label: '职业联赛', icon: Trophy, bgColor: '#FFEBEE', color: '#E53935' },
  { key: 'guess', label: '竞猜', icon: Star, bgColor: '#FFF8E1', color: '#FFA000' }
]

function handleClick(item) {
  emit('select', item)
  if (item.key === 'guess') {
    router.push('/portal/tournament/all/guess')
  } else {
    router.push({ path: '/portal/tournaments', query: { category: item.key } })
  }
}
</script>

<style scoped>
.quick-entry-grid {
  background: var(--portal-bg-card, #FFFFFF);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--portal-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.08));
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (min-width: 768px) {
  .grid-container {
    grid-template-columns: repeat(8, 1fr);
    gap: 16px;
  }
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.25s ease;
  padding: 8px 4px;
  border-radius: 8px;
}

.grid-item:hover {
  transform: translateY(-2px);
  background: var(--portal-bg-page, #F5F7FA);
}

.grid-item:active {
  transform: translateY(0);
}

.item-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.grid-item:hover .item-icon {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: scale(1.05);
}

.item-icon .el-icon {
  font-size: 28px;
}

.item-label {
  font-size: 11px;
  color: var(--portal-text-regular, #606266);
  text-align: center;
  line-height: 1.3;
  font-weight: 500;
}

@media (min-width: 768px) {
  .item-icon {
    width: 68px;
    height: 68px;
    border-radius: 16px;
  }

  .item-label {
    font-size: 13px;
  }
}
</style>
