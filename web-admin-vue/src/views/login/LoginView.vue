<template>
  <main class="login-overlay" aria-labelledby="login-title">
    <section class="login-card" role="dialog" aria-modal="true">
      <button class="close" type="button" aria-label="关闭登录" @click="goHome">×</button>
      <section class="qr-panel">
        <h1 id="login-title">微信登录</h1>
        <div class="qr-shell">
        <div v-if="isLocalPreview" class="qr-preview" aria-label="本地视觉验收二维码预览"><span>微信扫码授权</span></div>
        <iframe v-else-if="qrUrl" :src="qrUrl" title="微信扫码登录二维码" scrolling="no" frameborder="0" />
        <div v-else class="qr-loading">正在生成安全登录二维码…</div>
        </div>
        <p class="scan-tip">使用微信扫一扫登录<br />“赛小蜂赛事管理”</p>
      </section>
      <p class="scan-tip outer-tip">请使用微信客户端扫码登录</p>
      <button v-if="!isLocalPreview" class="retry" type="button" @click="refreshQr">刷新二维码</button>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
const qrUrl = ref('')
const WEB_APP_ID = 'wx5a42aae0e5d0669c'
const isLocalPreview = computed(() => import.meta.env.DEV || ['127.0.0.1', 'localhost'].includes(window.location.hostname))
function refreshQr() {
  const state = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now())
  sessionStorage.setItem('wechat_login_state', state)
  const redirect = `${window.location.protocol}//${window.location.host}${import.meta.env.BASE_URL}#/wechat-callback`
  qrUrl.value = `https://open.weixin.qq.com/connect/qrconnect?appid=${encodeURIComponent(WEB_APP_ID)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=snsapi_login&state=${encodeURIComponent(state)}#wechat_redirect`
}
function goHome() { window.location.href = 'https://www.sxffootball.cn/' }
onMounted(refreshQr)
</script>

<style scoped>
.login-overlay{display:grid;min-height:100vh;place-items:center;padding:40px;background-color:#00180e;background-image:radial-gradient(circle at 25% 70%,rgba(0,90,55,.11),transparent 29%),radial-gradient(circle at 75% 26%,rgba(19,104,66,.08),transparent 26%);backdrop-filter:blur(16px)}.login-card{position:relative;box-sizing:border-box;width:440px;height:550px;padding:47px 40px 0;border:1px solid #08734b;border-radius:22px;background:linear-gradient(145deg,#004a31,#003d28);box-shadow:0 28px 80px rgba(0,0,0,.45);color:#fff;text-align:center}.close{position:absolute;right:17px;top:15px;width:38px;height:38px;border:1px solid rgba(255,255,255,.18);border-radius:50%;background:rgba(255,255,255,.07);color:#b5d0c2;font-size:27px;line-height:31px;cursor:pointer}.qr-panel{box-sizing:border-box;height:420px;padding:22px 38px 20px;border-radius:12px;background:#fff;color:#303534}.qr-panel h1{margin:0 0 19px;font-size:23px;font-weight:500;line-height:1.2}.qr-shell{display:grid;place-items:center;box-sizing:border-box;width:282px;height:283px;margin:0 auto;border:1px solid #d9d9d9;background:#fff;overflow:hidden}.qr-shell iframe{width:280px;height:280px}.qr-preview{display:grid;place-items:center;width:244px;height:244px;background:repeating-conic-gradient(#003d28 0 25%,#fff 0 50%) 50%/20px 20px}.qr-preview span{padding:9px 12px;border-radius:5px;background:#fff;color:#003d28;font-size:13px;font-weight:700}.qr-loading{padding:25px;color:#527260}.scan-tip{margin:10px 0 0;color:#39423d;font-size:14px;line-height:1.6}.outer-tip{margin-top:15px;color:#7fb39c}.retry{position:absolute;right:24px;bottom:16px;padding:8px 18px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:transparent;color:#d0e4d9;font-size:13px;cursor:pointer}
</style>
