<template>
  <div class="wechat-callback-page">
    <div class="callback-card">

      <!-- 处理中 -->
      <div v-if="status === 'processing'" class="status-section">
        <el-icon class="loading-icon" :size="48"><Loading /></el-icon>
        <h3>{{ hint }}</h3>
        <p class="sub-hint">正在通过微信授权登录...</p>
      </div>

      <!-- 成功 -->
      <div v-else-if="status === 'success'" class="status-section">
        <el-icon class="success-icon" :size="64" color="#67C23A"><CircleCheckFilled /></el-icon>
        <h3>登录成功！</h3>
        <p>正在跳转至管理后台...</p>
      </div>

      <!-- 错误 -->
      <div v-else-if="status === 'error'" class="status-section">
        <el-icon class="error-icon" :size="64" color="#F56C6C"><CircleCloseFilled /></el-icon>
        <h3>登录失败</h3>
        <p class="error-msg">{{ errorMessage }}</p>
        <div class="action-buttons">
          <el-button @click="retryLogin">重新扫码</el-button>
          <el-button type="primary" @click="goLogin">返回登录页</el-button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
/**
 * ═══════════════════════════════════════════════════════
 * 微信扫码登录回调页 —— 直接用 HTTP API，不再委托 index.html
 * ═══════════════════════════════════════════════════════
 *
 * 流程：
 *   微信 OAuth 回调 → /admin/#/wechat-callback?code=xxx&state=xxx
 *     → 此页面直接用 fetch 调 webLoginApi (wechatWebLogin)
 *       → 成功 → 写入纯微信会话 → 跳 /admin/#/tournaments
 */
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Loading, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'

// webLoginApi HTTP 访问服务地址（与 cloud.js 中 WEB_LOGIN_API_URL 保持一致）
const API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'

const router = useRouter()
const route = useRoute()

const status = ref('processing')
const errorMessage = ref('')
const hint = ref('正在验证微信授权...')

const AUTH_STORAGE_KEYS = [
  'isLoggedIn',
  'userInfo',
  'role',
  'currentRole',
  'userId',
  'loginType',
  'phone',
  'phoneNumber',
  'openid',
  'unionid',
  'needBindPhone',
  'needSetPassword',
  'needBindEmail',
  'needSelectRole',
  'wechatTemp',
  'authSessionVersion'
]

function clearStoredAuthSession() {
  AUTH_STORAGE_KEYS.forEach(key => localStorage.removeItem(key))
}

onMounted(async () => {
  const code = route.query.code
  const state = route.query.state || ''

  if (!code) {
    status.value = 'error'
    errorMessage.value = '未获取到微信授权码，请重新扫码登录'
    return
  }

  // 校验 state 防 CSRF
  const savedState = sessionStorage.getItem('wechat_login_state')
  if (savedState && savedState !== state) {
    status.value = 'error'
    errorMessage.value = '安全校验失败，请重新扫码'
    sessionStorage.removeItem('wechat_login_state')
    return
  }
  sessionStorage.removeItem('wechat_login_state')

  try {
    hint.value = '正在验证微信授权...'

    // 直接调 HTTP API，绕过浏览器端 CloudBase SDK
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'wechatWebLogin', code })
    })
    const result = await res.json()

    if (result.success) {
      // 每次扫码登录都原子替换认证会话，避免上一个账号的手机号和流程标志残留。
      const user = result.user || {}
      const normalizedRole = String(result.role || user.role || '').toLowerCase()
      if (normalizedRole !== 'organizer') {
        clearStoredAuthSession()
        throw new Error('主办方账号初始化失败，请重新登录')
      }
      clearStoredAuthSession()
      localStorage.setItem('loginType', 'wechat')
      localStorage.setItem('userInfo', JSON.stringify({
        uid: user._id || '',
        userName: user.nickname || '微信用户',
        avatarUrl: user.headimgurl || '',
        openid: user.openid || user.wechatOpenId || '',
        unionid: user.unionid || ''
      }))
      localStorage.setItem('userId', user._id || '')
      localStorage.setItem('role', normalizedRole)
      localStorage.setItem('currentRole', normalizedRole)
      localStorage.setItem('isLoggedIn', 'true')
      localStorage.setItem('authSessionVersion', 'wechat-only-v1')

      status.value = 'success'

      setTimeout(() => {
        window.location.href = '/admin/#/tournaments'
      }, 800)

    } else {
      status.value = 'error'
      errorMessage.value = result.error || '微信登录失败，请重试'
    }

  } catch (err) {
    status.value = 'error'
    errorMessage.value = err.message || '网络错误，请检查连接后重试'
    console.error('[WechatCallback] 错误：', err)
  }
})

function retryLogin() { window.location.href = '/' }
function goLogin() { router.push('/login') }
</script>

<style scoped>
.wechat-callback-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #1B5E20 0%, #43A047 100%);
}
.callback-card {
  background: white;
  border-radius: 16px;
  padding: 60px 80px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}
.status-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.status-section h3 {
  font-size: 24px;
  color: #333;
  margin: 0;
}
.status-section p {
  font-size: 16px;
  color: #666;
  margin: 0;
}
.sub-hint {
  font-size: 14px !important;
  color: #999 !important;
  margin-top: -8px !important;
}
.error-msg {
  color: #F56C6C !important;
  max-width: 400px;
  word-break: break-all;
  line-height: 1.5;
}
.loading-icon {
  animation: rotate 1.5s linear infinite;
  color: #43A047;
}
@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.action-buttons {
  display: flex;
  gap: 16px;
  margin-top: 16px;
}
</style>
