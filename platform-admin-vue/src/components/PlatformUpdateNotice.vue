<template>
  <div
    v-if="notice"
    class="platform-update-notice"
    :data-type="notice.type"
    role="status"
  >
    <div class="notice-body">
      <strong class="notice-title">{{ notice.type === 'release' ? '平台已发布新版本' : '应用外观已更新' }}</strong>
      <span class="notice-text">{{ noticeText }}</span>
    </div>
    <div class="notice-actions">
      <el-button v-if="notice.type === 'release'" type="primary" size="small" @click="onRefresh">立即刷新</el-button>
      <el-button v-else size="small" @click="notice = null">知道了</el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { refreshPlatformShell, startPlatformUpdateWatch } from '../utils/platformUpdate'

const notice = ref(null)
let watcher = null

const noticeText = computed(() => (notice.value?.type === 'release'
  ? '刷新后即可使用新版本，不需要重新安装，也不用重新登录。'
  : '图标或窗口样式有变化：关闭应用后重新打开即可生效；若仍是旧样式，卸载后重新安装一次。'))

function onRefresh() {
  notice.value = null
  refreshPlatformShell()
}

onMounted(() => {
  watcher = startPlatformUpdateWatch(payload => {
    notice.value = payload
  })
})

onBeforeUnmount(() => {
  watcher?.stop()
  watcher = null
})
</script>

<style scoped>
.platform-update-notice {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 1300;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(460px, calc(100vw - 32px));
  padding: 12px 14px;
  border: 1px solid #c9dbd0;
  border-left: 4px solid #1b5e20;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 10px 26px rgba(12, 59, 39, 0.16);
  box-sizing: border-box;
}

.notice-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.notice-title {
  color: #0f3d28;
  font-size: 13.5px;
  line-height: 1.3;
}

.notice-text {
  color: #4a5e52;
  font-size: 12.5px;
  line-height: 1.45;
}

.notice-actions {
  flex: none;
}

/* 应用窗口（window-controls-overlay）下让到自绘标题条下方，避免被遮住。 */
@media (display-mode: window-controls-overlay) {
  .platform-update-notice {
    top: calc(env(titlebar-area-height, 33px) + 12px);
  }
}

@media (max-width: 760px) {
  .platform-update-notice {
    left: 12px;
    right: 12px;
    max-width: none;
  }
}
</style>
