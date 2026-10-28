<template>
  <el-button
    v-if="mode !== 'installed'"
    class="platform-install-entry"
    :class="{ 'is-link': props.variant === 'login' }"
    @click="onEntryClick"
  >
    <el-icon><component :is="entryIcon" /></el-icon>
    <span>{{ entryLabel }}</span>
  </el-button>

  <el-dialog
    v-model="guideVisible"
    :title="mode === 'manual' ? '在电脑上安装平台运营中心' : '把平台运营中心添加到主屏幕'"
    width="min(460px, 92vw)"
    append-to-body
    class="platform-install-guide"
  >
    <ol class="guide-steps">
      <template v-if="mode === 'ios'">
        <li>用 iPad / iPhone 自带的 Safari 打开 pingtai.sxffootball.cn 并登录。</li>
        <li>点击顶部工具栏的“分享”按钮。</li>
        <li>在菜单中选择“添加到主屏幕”。</li>
        <li>名称保持“平台运营”，点击“添加”。桌面会出现独立图标，打开即全屏运行。</li>
      </template>
      <template v-else-if="mode === 'android'">
        <li>用 Chrome 打开 pingtai.sxffootball.cn 并登录。</li>
        <li>点击右上角菜单，选择“添加到主屏幕”或“安装应用”。</li>
        <li>名称保持“平台运营”，确认添加。桌面会出现独立图标，打开即全屏运行。</li>
      </template>
      <template v-else>
        <li>用 Edge 或 Chrome 打开 pingtai.sxffootball.cn 并登录。</li>
        <li>点击地址栏右侧的“安装”图标；也可以打开浏览器菜单，选择“应用 → 安装此网站”。</li>
        <li>确认后可从开始菜单或桌面启动，窗口不带浏览器标签栏，操作区域更大。</li>
      </template>
    </ol>
    <p class="guide-note">安装包只是打开方式不同，账号、权限和数据仍与网页版完全一致。</p>
    <template #footer>
      <el-button type="primary" @click="guideVisible = false">知道了</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, Iphone } from '@element-plus/icons-vue'

// variant: default 用于控制台顶栏；login 用于登录页，按钮显示为文字链接。
const props = defineProps({ variant: { type: String, default: 'default' } })

const promptEvent = ref(null)
const guideVisible = ref(false)
const standalone = ref(false)
const iosDevice = ref(false)
const androidDevice = ref(false)
const chromiumDesktop = ref(false)

const mode = computed(() => {
  if (standalone.value) return 'installed'
  if (promptEvent.value) return 'prompt'
  if (iosDevice.value) return 'ios'
  if (androidDevice.value) return 'android'
  if (chromiumDesktop.value) return 'manual'
  return 'installed'
})

const entryLabel = computed(() => {
  if (mode.value === 'prompt') return '安装到设备'
  if (mode.value === 'ios' || mode.value === 'android') return '添加到主屏幕'
  return '安装客户端'
})

const entryIcon = computed(() => (mode.value === 'ios' || mode.value === 'android' ? Iphone : Download))

function onEntryClick() {
  if (mode.value === 'prompt') return install()
  guideVisible.value = true
}

function detectStandalone() {
  if (typeof window === 'undefined') return false
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches
  return Boolean(displayMode || window.navigator.standalone === true)
}

function detectIos() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function detectAndroid() {
  if (typeof navigator === 'undefined') return false
  return /Android/.test(navigator.userAgent) && /Chrome\/|EdgA\//.test(navigator.userAgent)
}

function detectChromiumDesktop() {
  if (typeof navigator === 'undefined') return false
  if (detectIos() || detectAndroid()) return false
  return /Edg\//.test(navigator.userAgent) || (/Chrome\//.test(navigator.userAgent) && !/Mobile/.test(navigator.userAgent))
}

async function install() {
  const event = promptEvent.value
  if (!event) return
  promptEvent.value = null
  await event.prompt()
  const choice = await event.userChoice.catch(() => null)
  if (choice && choice.outcome === 'accepted') standalone.value = true
}

function onBeforeInstall(event) {
  event.preventDefault()
  promptEvent.value = event
}

function onInstalled() {
  promptEvent.value = null
  standalone.value = true
}

onMounted(() => {
  standalone.value = detectStandalone()
  iosDevice.value = detectIos()
  androidDevice.value = detectAndroid()
  chromiumDesktop.value = detectChromiumDesktop()
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onInstalled)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onInstalled)
})
</script>

<style scoped>
.platform-install-entry {
  flex: 0 0 auto;
}

.platform-install-entry.is-link {
  height: 32px;
  padding: 0 14px;
  color: #176f45;
  border-color: #cfe3d8;
  border-radius: 999px;
  background: #f3faf6;
  font-size: 12.5px;
  font-weight: 600;
}

.platform-install-entry.is-link:hover {
  color: #125c39;
  border-color: #258557;
  background: #e9f6ee;
}

.guide-steps {
  display: grid;
  gap: 10px;
  margin: 0;
  padding-left: 20px;
  color: #263d2e;
  line-height: 1.6;
}

.guide-note {
  margin: 14px 0 0;
  color: #6b7d72;
  font-size: 12px;
  line-height: 1.6;
}
</style>
