<template>
  <div class="tournament-header">
    <!-- 封面 banner -->
    <div class="header-cover">
      <img v-if="cover" :src="cover" :alt="name" class="cover-img" @error="handleImgError" />
      <div v-else class="cover-fallback" :style="fallbackStyle">
        <el-icon class="fallback-icon"><Trophy /></el-icon>
        <div class="fallback-text">赛事封面</div>
      </div>
      <div class="cover-mask"></div>
      <!-- 返回按钮（移动端） -->
      <button class="back-btn" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
      </button>
    </div>

    <!-- 信息区 -->
    <div class="header-info portal-container">
      <div class="info-main">
        <div class="info-top">
          <h1 class="info-title">{{ name }}</h1>
          <span class="info-status" :class="statusClass">{{ statusText }}</span>
        </div>
        <div class="info-meta">
          <div class="meta-item">
            <el-icon><Calendar /></el-icon>
            <span>{{ season }}</span>
          </div>
          <div class="meta-item">
            <el-icon><OfficeBuilding /></el-icon>
            <span>{{ organizer || '赛小蜂' }}</span>
          </div>
          <div class="meta-item">
            <el-icon><User /></el-icon>
            <span>{{ teamCount }} 支球队</span>
          </div>
          <div v-if="categoryLabel" class="meta-item">
            <el-icon><Collection /></el-icon>
            <span>{{ categoryLabel }}</span>
          </div>
        </div>
      </div>
      <div class="info-actions">
        <FollowButton :is-followed="isFollowed" @toggle="handleFollow" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Trophy, ArrowLeft, Calendar, OfficeBuilding, User, Collection } from '@element-plus/icons-vue'
import FollowButton from '../../components/FollowButton.vue'

/**
 * 赛事头部组件
 * 封面 banner + 赛事名 + 赛季 + 主办方 + 参赛队数 + 关注按钮
 */
const props = defineProps({
  id: { type: [String, Number], required: true },
  name: { type: String, default: '赛事名称' },
  cover: { type: String, default: '' },
  season: { type: String, default: '2026 赛季' },
  organizer: { type: String, default: '' },
  teamCount: { type: [Number, String], default: 0 },
  status: { type: String, default: 'ongoing' },
  categoryLabel: { type: String, default: '' },
  followed: { type: Boolean, default: false }
})

const emit = defineEmits(['follow', 'unfollow'])

const router = useRouter()
const imgFailed = ref(false)
const isFollowed = ref(props.followed)
watch(() => props.followed, (v) => { isFollowed.value = v })

const STATUS_MAP = {
  registering: { text: '报名中', class: 'registering' },
  ongoing: { text: '进行中', class: 'ongoing' },
  completed: { text: '已结束', class: 'completed' }
}

const statusText = computed(() => (STATUS_MAP[props.status] || STATUS_MAP.ongoing).text)
const statusClass = computed(() => (STATUS_MAP[props.status] || STATUS_MAP.ongoing).class)

const fallbackStyle = computed(() => {
  const colors = ['#1B5E20', '#2E7D32', '#43A047']
  let hash = 0
  const seed = props.name || 't'
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return { background: `linear-gradient(135deg, ${colors[Math.abs(hash) % colors.length]}, #2E7D32)` }
})

function handleImgError() {
  imgFailed.value = true
}

function goBack() {
  router.back()
}

function handleFollow(followed) {
  if (followed) emit('follow')
  else emit('unfollow')
}
</script>

<style scoped>
.tournament-header {
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  overflow: hidden;
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
}

.header-cover {
  position: relative;
  width: 100%;
  height: 160px;
  overflow: hidden;
  background: var(--portal-bg-page, #f5f7fa);
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.7);
}

.fallback-icon {
  font-size: 56px;
}

.fallback-text {
  font-size: 13px;
}

.cover-mask {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.3) 100%);
}

.back-btn {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
  z-index: 2;
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.6);
}

.header-info {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.info-main {
  flex: 1;
  min-width: 0;
}

.info-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.info-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--portal-text-primary, #303133);
  margin: 0;
}

.info-status {
  padding: 2px 8px;
  border-radius: var(--portal-radius-pill, 999px);
  font-size: 11px;
  font-weight: 500;
}

.info-status.registering {
  background: #FDF6EC;
  color: #E6A23C;
}

.info-status.ongoing {
  background: var(--portal-primary-bg, #E8F5E9);
  color: var(--portal-primary-light, #2E7D32);
}

.info-status.completed {
  background: #F4F4F5;
  color: var(--portal-text-secondary, #909399);
}

.info-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
}

.meta-item .el-icon {
  font-size: 13px;
}

.info-actions {
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .header-cover {
    height: 240px;
  }
  .header-info {
    padding: 20px 24px;
  }
  .info-title {
    font-size: 22px;
  }
  .meta-item {
    font-size: 13px;
  }
}

@media (min-width: 1024px) {
  .header-cover {
    height: 300px;
  }
}
</style>
