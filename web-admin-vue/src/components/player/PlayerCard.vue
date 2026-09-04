<template>
  <div class="player-card-container">
    <!-- 球员卡主体 -->
    <div class="player-card" :class="cardLevelClass">
      <!-- 卡片背景 -->
      <div class="card-bg">
        <img :src="cardBgImage" alt="card bg" />
      </div>
      
      <!-- 卡片内容 -->
      <div class="card-content">
        <!-- 左上角：球衣号码和位置 -->
        <div class="card-header-info">
          <div class="jersey-number-large">{{ player.jerseyNumber || '--' }}</div>
          <div class="position-text">{{ positionMap[player.position] || player.position || '未知' }}</div>
        </div>
        
        <!-- 中间：球员照片 -->
        <div class="player-photo-wrapper">
          <img 
            :src="avatarUrl || defaultAvatar" 
            :alt="player.name"
            class="player-photo"
            @error="handleImageError"
          />
        </div>
        
        <!-- 底部：球员信息 -->
        <div class="player-info-section">
          <div class="player-name">{{ player.name || '未知球员' }}</div>
          <div class="player-jersey-name">{{ player.jerseyName || playerNameEn }}</div>
          
          <!-- 身高体重 -->
          <div class="player-physical">
            <div class="physical-item">
              <span class="physical-label">身高:</span>
              <span class="physical-value">{{ player.height || '--' }}CM</span>
            </div>
            <div class="physical-item">
              <span class="physical-label">体重:</span>
              <span class="physical-value">{{ player.weight || '--' }}KG</span>
            </div>
          </div>
          
          <!-- 国旗和球队Logo -->
          <div class="player-badges">
            <div class="badge-item">
              <img v-if="player.nationality" :src="getFlagUrl(player.nationality)" class="flag-icon" alt="国旗" />
            </div>
            <div class="badge-item team-badge">
              <img v-if="teamLogo" :src="teamLogo" class="team-logo-small" alt="球队" />
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 卡片等级指示器 -->
    <div class="card-level-indicator">
      <el-tooltip :content="cardLevelTooltip" placement="top">
        <div class="level-badges">
          <span class="level-badge" :class="{ active: cardLevel === 'bronze' }">铜卡</span>
          <span class="level-arrow">→</span>
          <span class="level-badge" :class="{ active: cardLevel === 'silver' }">银卡</span>
          <span class="level-arrow">→</span>
          <span class="level-badge" :class="{ active: cardLevel === 'gold' }">金卡</span>
        </div>
      </el-tooltip>
      <div class="match-count">
        参赛场次: <strong>{{ player.appearances || 0 }}</strong> 场
        <span v-if="nextLevelNeed > 0" class="next-level-hint">(再 {{ nextLevelNeed }} 场升级)</span>
        <span v-else class="max-level">(已满级)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getTempFileURL } from '../../utils/upload'

const props = defineProps({
  player: {
    type: Object,
    required: true,
    default: () => ({})
  },
  teamLogo: {
    type: String,
    default: ''
  }
})

const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1ZjdmYSIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1zaXplPSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzkwOTM5OSI+8J+OqjwvdGV4dD48L3N2Zz4='

// 头像URL（处理云存储fileID）
const avatarUrl = ref('')

// 判断是否是云存储fileID
function isCloudFileID(url) {
  return url && url.startsWith('cloud://')
}

// 获取头像URL
async function loadAvatarUrl() {
  if (!props.player) {
    avatarUrl.value = ''
    return
  }

  const photoUrl = props.player.photoUrl

  if (!photoUrl) {
    avatarUrl.value = ''
    return
  }

  // 如果是云存储fileID，获取临时URL
  if (isCloudFileID(photoUrl)) {
    try {
      const result = await getTempFileURL(photoUrl)
      if (result.success && result.url) {
        avatarUrl.value = result.url
      } else {
        avatarUrl.value = photoUrl
      }
    } catch (err) {
      console.error('[PlayerCard] 获取头像临时URL失败:', err)
      avatarUrl.value = photoUrl
    }
  } else {
    // 普通URL直接使用
    avatarUrl.value = photoUrl
  }
}

// 监听player变化，重新加载头像
watch(() => props.player?.photoUrl, loadAvatarUrl, { immediate: true })

const positionMap = {
  GK: '守门员',
  DF: '后卫',
  MF: '中场',
  FW: '前锋'
}

// 卡片等级计算
const cardLevel = computed(() => {
  const appearances = props.player.appearances || 0
  if (appearances >= 20) return 'gold'
  if (appearances >= 10) return 'silver'
  return 'bronze'
})

const cardLevelClass = computed(() => `card-${cardLevel.value}`)

// 卡片背景图路径
const cardBgImage = computed(() => {
  const publicBaseUrl = import.meta.env.BASE_URL
  const images = {
    bronze: `${publicBaseUrl}images/铜卡.png`,
    silver: `${publicBaseUrl}images/银卡.png`,
    gold: `${publicBaseUrl}images/金卡.png`
  }
  return images[cardLevel.value]
})

// 卡片等级提示
const cardLevelTooltip = computed(() => {
  const tooltips = {
    bronze: '铜卡：参赛 0-9 场',
    silver: '银卡：参赛 10-19 场',
    gold: '金卡：参赛 20 场以上'
  }
  return tooltips[cardLevel.value]
})

// 升级到下一级还需要多少场
const nextLevelNeed = computed(() => {
  const appearances = props.player.appearances || 0
  if (appearances < 10) return 10 - appearances
  if (appearances < 20) return 20 - appearances
  return 0
})

// 球员英文名（拼音首字母）- 备用显示
const playerNameEn = computed(() => {
  const name = props.player.name
  if (!name) return 'UNKNOWN'
  
  // 简单的拼音转换逻辑
  const pinyinMap = {
    '郑': 'ZHENG', '旭': 'XU', '升': 'SHENG',
    '李': 'LI', '王': 'WANG', '张': 'ZHANG', '刘': 'LIU',
    '陈': 'CHEN', '杨': 'YANG', '赵': 'ZHAO', '黄': 'HUANG',
    '周': 'ZHOU', '吴': 'WU', '徐': 'XU', '孙': 'SUN',
    '马': 'MA', '朱': 'ZHU', '胡': 'HU', '郭': 'GUO',
    '林': 'LIN', '何': 'HE', '高': 'GAO', '罗': 'LUO'
  }
  
  let result = ''
  for (let char of name) {
    if (pinyinMap[char]) {
      result += pinyinMap[char] + ' '
    }
  }
  
  if (result) {
    return result.trim().substring(0, 10) + '.'
  }
  return name.toUpperCase()
})

// 获取国旗URL
function getFlagUrl(nationality) {
  const flagMap = {
    '中国': 'https://flagcdn.com/w40/cn.png',
    'CHN': 'https://flagcdn.com/w40/cn.png',
    '美国': 'https://flagcdn.com/w40/us.png',
    'USA': 'https://flagcdn.com/w40/us.png',
    '日本': 'https://flagcdn.com/w40/jp.png',
    'JPN': 'https://flagcdn.com/w40/jp.png',
    '韩国': 'https://flagcdn.com/w40/kr.png',
    'KOR': 'https://flagcdn.com/w40/kr.png'
  }
  return flagMap[nationality] || ''
}

function handleImageError(e) {
  e.target.src = defaultAvatar
}
</script>

<style scoped>
/* ============================================
   球员卡样式 - 已锁定，禁止修改
   版本: 2026-05-07
   说明: 以下所有参数经过精确调试，确保卡片
         在任何场景下显示一致，请勿随意更改
   ============================================ */

/* 容器 */
.player-card-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* 卡片主体 - 固定尺寸 300x430px */
.player-card {
  position: relative;
  width: 300px;
  height: 430px;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: transform 0.3s ease;
  /* 锁定: 卡片基础尺寸 */
  flex-shrink: 0;
  flex-grow: 0;
}

.player-card:hover {
  transform: translateY(-4px) scale(1.02);
}

/* 背景层 */
.card-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.card-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 内容层 */
.card-content {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  color: #1a1a1a;
}

/* ============================================
   左上角: 球衣号码 + 位置
   ============================================ */
.card-header-info {
  position: absolute;
  top: 55px;
  left: 25px;
  text-align: center;
  /* 左上角信息位置，居中对齐 */
}

.jersey-number-large {
  font-size: 48px;
  font-weight: 900;
  color: #1a1a1a;
  line-height: 1;
  text-shadow: 2px 2px 4px rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
  /* 球衣号码大小 48px */
}

.position-text {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.6);
  /* 位置文字大小 22px */
}

/* ============================================
   中间: 球员头像
   ============================================ */
.player-photo-wrapper {
  position: absolute;
  top: 35px;
  left: 50%;
  transform: translateX(-50%);
  width: 220px;
  height: 220px;
  overflow: visible;
  /* 锁定: 头像容器 220x220px, 距顶 35px */
}

.player-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  /* 锁定: 图片适配模式 contain, 底部对齐 */
}

/* ============================================
   底部: 球员信息区域
   ============================================ */
.player-info-section {
  position: absolute;
  bottom: 35px;
  left: 0;
  right: 0;
  text-align: center;
  padding: 0 20px;
  /* 锁定: 信息区域距底 35px */
}

.player-name {
  font-size: 26px;
  font-weight: 800;
  color: #1a1a1a;
  margin-bottom: 2px;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.6);
  letter-spacing: 4px;
  /* 锁定: 球员名字 26px, 字间距 4px */
}

.player-jersey-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  letter-spacing: 2px;
  margin-bottom: 8px;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.5);
  /* 锁定: 球衣名 14px, 字间距 2px */
}

/* 身高体重 */
.player-physical {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-bottom: 10px;
  /* 锁定: 间距 24px */
}

.physical-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.physical-label,
.physical-value {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.5);
  /* 锁定: 数据文字 13px */
}

/* 徽章: 国旗 + 队徽 */
.player-badges {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 40px;
  margin-top: 4px;
  /* 锁定: 徽章间距 40px */
}

.badge-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.flag-icon {
  width: 28px;
  height: 20px;
  border-radius: 3px;
  object-fit: cover;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  /* 锁定: 国旗 28x20px */
}

.team-logo-small {
  width: 40px;
  height: 40px;
  object-fit: contain;
  background-color: transparent;
  /* 去除白底：混合模式让白色背景与下层融合 */
  mix-blend-mode: multiply;
  /* 队徽 40x40px, 透明背景 */
}

.team-badge {
  background-color: transparent;
}

.badge-text {
  font-size: 11px;
  font-weight: 600;
  color: #1a1a1a;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.5);
  /* 锁定: 徽章文字 11px */
}

/* 卡片等级指示器 */
.card-level-indicator {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 12px 20px;
  color: white;
  text-align: center;
}

.level-badges {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}

.level-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.1);
  color: #aaa;
  transition: all 0.3s ease;
}

.level-badge.active {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: #1a1a1a;
  box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
}

.card-bronze .level-badge.active {
  background: linear-gradient(135deg, #CD7F32, #A0522D);
  color: white;
}

.card-silver .level-badge.active {
  background: linear-gradient(135deg, #C0C0C0, #808080);
  color: #1a1a1a;
}

.level-arrow {
  color: #666;
  font-size: 12px;
}

.match-count {
  font-size: 13px;
  color: #ccc;
}

.match-count strong {
  color: #FFD700;
  font-size: 16px;
}

.next-level-hint {
  color: #4CAF50;
  margin-left: 8px;
  font-size: 12px;
}

.max-level {
  color: #FFD700;
  margin-left: 8px;
  font-size: 12px;
}

/* 不同等级的光效 */
.card-gold {
  box-shadow: 0 8px 32px rgba(255, 215, 0, 0.3);
}

.card-silver {
  box-shadow: 0 8px 32px rgba(192, 192, 192, 0.3);
}

.card-bronze {
  box-shadow: 0 8px 32px rgba(205, 127, 50, 0.3);
}
</style>
