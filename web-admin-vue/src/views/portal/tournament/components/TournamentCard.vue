<template>
  <div class="tournament-card" @click="goDetail">
    <!-- 封面区 -->
    <div class="card-cover">
      <img v-if="cover && !imgFailed" :src="cover" :alt="name" class="cover-img" @error="handleImgError" />
      <div v-else class="cover-fallback" :style="fallbackStyle">
        <span class="fallback-watermark">{{ name.charAt(0) }}</span>
      </div>
      <!-- 状态标签（右上角） -->
      <div class="cover-status-badge" :class="status">
        {{ statusText }}
      </div>
    </div>

    <!-- 信息区 -->
    <div class="card-body">
      <div class="card-title">{{ name }}</div>
      <div class="card-season">{{ season }}</div>
      <div class="card-organizer">{{ organizer || '赛小蜂足球' }}</div>
      <div class="card-footer">
        <div class="footer-left">
          <span class="footer-icon">👥</span>
          <span class="footer-value">{{ teamCount }}队</span>
        </div>
        <div class="footer-right">
          <span class="footer-icon">🔥</span>
          <span class="footer-value hot">{{ formatHot(hot) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

/**
 * 赛事卡片组件 - 精致化版本
 * 设计要求：
 * - 白色背景，圆角 12px，overflow hidden
 * - 封面区：120px(移动)/140px(PC)，渐变色块+水印 或 图片
 * - 状态badge：右上角绝对定位
 * - 信息区：赛事名+赛季+主办方+底部统计
 * - hover: 阴影加深 + 上移3px
 * - 过渡：all 0.3s cubic-bezier(0.4, 0, 0.2, 1)
 */
const props = defineProps({
  id: { type: [String, Number], required: true },
  name: { type: String, default: '赛事名称' },
  cover: { type: String, default: '' },
  season: { type: String, default: '2026 赛季' },
  organizer: { type: String, default: '' },
  teamCount: { type: [Number, String], default: 0 },
  status: { type: String, default: 'registering' },
  category: { type: String, default: '' },
  categoryLabel: { type: String, default: '' },
  hot: { type: [Number, String], default: 0 }
})

const router = useRouter()
const imgFailed = ref(false)

const STATUS_MAP = {
  registering: { text: '报名中', class: 'registering' },
  ongoing: { text: '进行中', class: 'ongoing' },
  completed: { text: '已结束', class: 'completed' }
}

const statusText = computed(() => (STATUS_MAP[props.status] || STATUS_MAP.registering).text)

const fallbackStyle = computed(() => {
  // 根据分类生成渐变色
  const categoryColors = {
    youth: { bg: 'linear-gradient(135deg, #6A1B9A, #AB47BC)' }
  }
  const colors = categoryColors[props.category] || { bg: 'linear-gradient(135deg, #1B5E20, #43A047)' }
  return { background: colors.bg }
})

function formatHot(value) {
  const num = Number(value) || 0
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'w'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return num.toString()
}

function handleImgError() {
  imgFailed.value = true
}

function goDetail() {
  router.push(`/portal/tournament/${props.id}`)
}
</script>

<style scoped>
.tournament-card {
  background: var(--portal-bg-card, #FFFFFF);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--portal-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
}

.tournament-card:hover {
  box-shadow: var(--portal-card-shadow-hover, 0 6px 24px rgba(27, 94, 32, 0.15));
  transform: translateY(-3px);
  border-color: var(--portal-primary-lighter, #43A047);
}

/* 封面区 */
.card-cover {
  position: relative;
  width: 100%;
  height: 120px;
  overflow: hidden;
  background: var(--portal-bg-page, #F5F7FA);
}

@media (min-width: 768px) {
  .card-cover {
    height: 140px;
  }
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}

.tournament-card:hover .cover-img {
  transform: scale(1.02);
}

.cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
}

.cover-fallback .fallback-watermark {
  font-size: 64px;
  font-weight: 700;
  opacity: 0.6;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* 状态标签 */
.cover-status-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  border-radius: var(--portal-radius-pill, 999px);
  font-size: 11px;
  font-weight: 600;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.cover-status-badge.registering {
  background: rgba(255, 193, 7, 0.95);
  color: #5D4037;
}

.cover-status-badge.ongoing {
  background: rgba(67, 160, 71, 0.95);
  color: #FFFFFF;
}

.cover-status-badge.completed {
  background: rgba(144, 147, 153, 0.95);
  color: #FFFFFF;
}

/* 信息区 */
.card-body {
  padding: 12px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--portal-text-primary, #303133);
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.card-season {
  font-size: 13px;
  color: var(--portal-text-regular, #606266);
  margin-bottom: 2px;
}

.card-organizer {
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
  margin-bottom: 10px;
}

/* 底部统计 */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--portal-border, #EBEEF5);
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.footer-icon {
  font-size: 12px;
}

.footer-value {
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
  font-weight: 500;
}

.footer-value.hot {
  color: var(--portal-gold, #FFC107);
  font-weight: 600;
}
</style>
