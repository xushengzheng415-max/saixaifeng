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
 *       → 成功 → 写 localStorage → 跳 /admin/#/tournaments
 *         → 需绑手机号 → 跳 /admin/#/bind-phone
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
      // 登录成功 → 写 localStorage
      const user = result.user || {}
      localStorage.setItem('loginType', 'wechat')
      localStorage.setItem('userInfo', JSON.stringify({
        uid: user._id || '',
        userName: user.nickname || '微信用户',
        avatarUrl: user.headimgurl || '',
        phone: user.phone || user.phoneNumber || '',
        email: user.email || '',
        openid: user.openid || user.wechatOpenId || '',
        unionid: user.unionid || ''
      }))
      localStorage.setItem('userId', user._id || '')
      localStorage.setItem('role', result.role || '')
      localStorage.setItem('currentRole', result.role || '')
      localStorage.setItem('isLoggedIn', 'true')

      if (result.needSetPassword) localStorage.setItem('needSetPassword', 'true')
      if (result.needPhoneBinding || result.needBindPhone) localStorage.setItem('needBindPhone', 'true')
      // ★ 关键修复：之前漏写了这两个标志，导致新用户不弹选身份页和邮箱绑定
      if (result.needSelectRole) localStorage.setItem('needSelectRole', 'true')
      if (result.needBindEmail) localStorage.setItem('needBindEmail', 'true')
      if (result.wechatTemp) {
        localStorage.setItem('wechatTemp', JSON.stringify(result.wechatTemp))
      }

      status.value = 'success'

      // ★ 按流程图正确跳转顺序：选身份 → 绑手机号 → 进首页
      setTimeout(() => {
        // 优先跳选身份页（新用户必须先选身份）
        if (result.needSelectRole) {
          window.location.href = '/admin/#/select-role'
        } else if (result.needPhoneBinding || result.needBindPhone) {
          window.location.href = '/admin/#/bind-phone'
        } else {
          // 根据角色跳转到对应首页
          const rolePathMap = {
            'organizer': '/admin/#/tournaments',
            'coach': '/admin/#/teams',
            'referee': '/admin/#/referees'
          }
          const role = (result.role || '').toLowerCase()
          window.location.href = rolePathMap[role] || '/admin/#/select-role'
        }
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
