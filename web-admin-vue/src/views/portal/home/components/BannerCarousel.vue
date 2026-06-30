<template>
  <div class="banner-carousel" @mouseenter="pauseAutoplay" @mouseleave="resumeAutoplay">
    <div class="carousel-container">
      <div
        class="carousel-track"
        :style="{ transform: `translateX(-${currentIndex * 100}%)` }"
      >
        <div
          v-for="(banner, index) in banners"
          :key="banner.id"
          class="carousel-slide"
          @click="handleClick(banner)"
        >
          <img :src="banner.image" :alt="banner.title" class="slide-image" />
          <div class="slide-overlay">
            <div class="slide-content">
              <h3 class="slide-title">{{ banner.title }}</h3>
              <p class="slide-subtitle">{{ banner.subtitle }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 指示器 -->
      <div class="carousel-indicators">
        <span
          v-for="(banner, index) in banners"
          :key="index"
          class="indicator-dot"
          :class="{ active: currentIndex === index }"
          @click="goToSlide(index)"
        ></span>
      </div>

      <!-- 前进/后退按钮 -->
      <button class="carousel-btn prev" @click="prevSlide">‹</button>
      <button class="carousel-btn next" @click="nextSlide">›</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

/**
 * 轮播图组件
 * 设计要求：
 * - 高度：移动180px / PC 360px
 * - 圆角 12px，溢出隐藏
 * - 图片全宽填充 object-fit: cover
 * - 底部渐变遮罩 + 白色标题
 * - 指示器：底部居中，圆形小点
 * - 自动轮播 4s，过渡 ease-out 500ms
 */
const props = defineProps({
  banners: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['click'])

const router = useRouter()
const currentIndex = ref(0)
let autoplayTimer = null

function nextSlide() {
  currentIndex.value = (currentIndex.value + 1) % props.banners.length
}

function prevSlide() {
  currentIndex.value = (currentIndex.value - 1 + props.banners.length) % props.banners.length
}

function goToSlide(index) {
  currentIndex.value = index
}

function handleClick(banner) {
  emit('click', banner)
  if (banner.link) {
    router.push(banner.link)
  }
}

function startAutoplay() {
  stopAutoplay()
  autoplayTimer = setInterval(nextSlide, 4000)
}

function stopAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer)
    autoplayTimer = null
  }
}

function pauseAutoplay() {
  stopAutoplay()
}

function resumeAutoplay() {
  startAutoplay()
}

onMounted(() => {
  if (props.banners.length > 1) {
    startAutoplay()
  }
})

onUnmounted(() => {
  stopAutoplay()
})
</script>

<style scoped>
.banner-carousel {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--portal-card-shadow, 0 2px 12px rgba(0, 0, 0, 0.08));
}

.carousel-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

@media (min-width: 1024px) {
  .carousel-container {
    aspect-ratio: 21 / 9;
    max-height: 360px;
  }
}

.carousel-track {
  display: flex;
  height: 100%;
  transition: transform 0.5s ease-out;
}

.carousel-slide {
  flex-shrink: 0;
  width: 100%;
  height: 100%;
  position: relative;
  cursor: pointer;
}

.slide-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.slide-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--portal-gradient-card, linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.6) 100%));
  padding: 40px 20px 20px;
}

.slide-content {
  color: #FFFFFF;
}

.slide-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 4px 0;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.slide-subtitle {
  font-size: 13px;
  opacity: 0.9;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* 指示器 */
.carousel-indicators {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 10;
}

.indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.25s ease;
}

.indicator-dot.active {
  width: 8px;
  height: 8px;
  background: #FFFFFF;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
}

/* 前进/后退按钮 */
.carousel-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.3);
  color: #FFFFFF;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.25s ease;
  z-index: 10;
}

.banner-carousel:hover .carousel-btn {
  opacity: 1;
}

.carousel-btn:hover {
  background: rgba(0, 0, 0, 0.5);
}

.carousel-btn.prev {
  left: 8px;
}

.carousel-btn.next {
  right: 8px;
}
</style>
