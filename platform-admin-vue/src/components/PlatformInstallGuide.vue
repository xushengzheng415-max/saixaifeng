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
    :title="dialogTitle"
    :data-mode="mode"
    width="min(460px, 92vw)"
    append-to-body
    class="platform-install-guide"
  >
    <ol class="guide-steps">
      <template v-if="mode === 'apk'">
        <li>点下方“下载安装包”，或在平板浏览器打开 www.sxffootball.cn/desktop/platform/android/ 下载 SxfPlatform-1.0.0.apk。</li>
        <li>下载完成后在通知栏或“文件”里点开该 APK；系统提示“禁止安装未知应用”时，允许当前浏览器或文件管理器安装。</li>
        <li>安装完成后桌面出现“赛小蜂平台运营”图标，打开后用平台管理员账号登录。</li>
        <li>不想安装 APK 也可以：用 Chrome 打开 pingtai.sxffootball.cn，菜单里选择“添加到主屏幕”。</li>
      </template>
      <template v-else-if="mode === 'ios'">
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
      <el-button v-if="mode === 'apk'" @click="guideVisible = false">稍后</el-button>
      <el-button type="primary" @click="onFooterClick">{{ mode === 'apk' ? '下载安装包' : '知道了' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, Iphone } from '@element-plus/icons-vue'

// 安卓平板安装包由 www.sxffootball.cn 托管，发布记录见 docs/releases/android-platform-1.0.0-20261028.md。
// 升级 APK 时必须同时更新此地址与 latest.json，避免页面指向已删除的旧版本。
const ANDROID_APK_URL = 'https://www.sxffootball.cn/desktop/platform/android/SxfPlatform-1.0.0.apk'

// variant: default 用于控制台顶栏；login 用于登录页，按钮显示为文字链接并优先提供安卓安装包。
const props = defineProps({ variant: { type: String, default: 'default' } })

const promptEvent = ref(null)
const guideVisible = ref(false)
const standalone = ref(false)
const nativeApp = ref(false)
const iosDevice = ref(false)
const androidDevice = ref(false)
const chromiumDesktop = ref(false)

const mode = computed(() => {
  if (standalone.value || nativeApp.value) return 'installed'
  if (props.variant === 'login' && androidDevice.value) return 'apk'
  if (promptEvent.value) return 'prompt'
  if (iosDevice.value) return 'ios'
  if (androidDevice.value) return 'android'
  if (chromiumDesktop.value) return 'manual'
  return 'installed'
})

const dialogTitle = computed(() => {
  if (mode.value === 'apk') return '在安卓平板上安装平台运营中心'
  if (mode.value === 'manual') return '在电脑上安装平台运营中心'
  return '把平台运营中心添加到主屏幕'
})

const entryLabel = computed(() => {
  if (mode.value === 'apk') return '下载安卓安装包'
  if (mode.value === 'prompt') return '安装到设备'
  if (mode.value === 'ios' || mode.value === 'android') return '添加到主屏幕'
  return '安装客户端'
})

const entryIcon = computed(() => (mode.value === 'ios' || mode.value === 'android' ? Iphone : Download))

function onEntryClick() {
  if (mode.value === 'prompt') return install()
  guideVisible.value = true
}

function onFooterClick() {
  if (mode.value === 'apk') return downloadApk()
  guideVisible.value = false
}

function downloadApk() {
  guideVisible.value = false
  window.location.href = ANDROID_APK_URL
}

function detectStandalone() {
  if (typeof window === 'undefined') return false
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches
  return Boolean(displayMode || window.navigator.standalone === true)
}

// 原生平板客户端（android-platform）已在 APK 内运行，UA 带 SxfPlatformApp 标记，不再显示安装入口。
function detectNativeApp() {
  if (typeof navigator === 'undefined') return false
  return /SxfPlatformApp\//.test(navigator.userAgent)
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
  nativeApp.value = detectNativeApp()
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
