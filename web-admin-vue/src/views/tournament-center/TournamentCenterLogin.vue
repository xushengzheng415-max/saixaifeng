<template>
  <div class="tc-login-page">
    <!-- 背景装饰 -->
    <div class="bg-decoration">
      <div class="bg-circle bg-circle-1"></div>
      <div class="bg-circle bg-circle-2"></div>
      <div class="bg-circle bg-circle-3"></div>
    </div>

    <!-- 登录卡片 -->
    <div class="login-card">
      <!-- 品牌区域 -->
      <div class="brand-section">
        <div class="brand-icon">
          <img src="/logo-saixiaofeng.png" alt="赛小蜂" class="brand-logo-img" />
        </div>
        <h1 class="brand-title">赛事中心管理后台</h1>
        <p class="brand-subtitle">Tournament Center Admin</p>
      </div>

      <!-- 登录表单 -->
      <div class="form-section">
        <!-- 需要设置密码时显示 -->
        <template v-if="needSetPassword">
          <div class="set-password-notice">
            <el-icon class="notice-icon"><InfoFilled /></el-icon>
            <div class="notice-text">
              <p class="notice-title">首次登录，请设置密码</p>
              <p class="notice-desc">账号 {{ phoneForSetPassword }} 尚未设置密码，请设置登录密码</p>
            </div>
          </div>
          <el-form :model="setPasswordForm" :rules="setPasswordRules" ref="setPasswordFormRef" @submit.prevent>
            <el-form-item prop="password">
              <el-input
                v-model="setPasswordForm.password"
                type="password"
                placeholder="请设置密码（至少6位）"
                show-password
                size="large"
                :prefix-icon="Lock"
              />
            </el-form-item>
            <el-form-item prop="confirmPassword">
              <el-input
                v-model="setPasswordForm.confirmPassword"
                type="password"
                placeholder="请确认密码"
                show-password
                size="large"
                :prefix-icon="Lock"
              />
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                size="large"
                class="submit-btn set-password-btn"
                @click="handleSetPassword"
                :loading="submitting"
              >
                设置密码并登录
              </el-button>
            </el-form-item>
          </el-form>
        </template>

        <!-- 正常登录表单 -->
        <template v-else>
          <el-form :model="loginForm" :rules="loginRules" ref="loginFormRef" @submit.prevent>
            <el-form-item prop="phone">
              <el-input
                v-model="loginForm.phone"
                placeholder="请输入手机号"
                maxlength="11"
                size="large"
                :prefix-icon="Phone"
              />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="loginForm.password"
                type="password"
                placeholder="请输入密码"
                show-password
                size="large"
                :prefix-icon="Lock"
                @keyup.enter="handleLogin"
              />
            </el-form-item>
            <el-form-item>
              <el-button
                type="primary"
                size="large"
                class="submit-btn"
                @click="handleLogin"
                :loading="submitting"
              >
                登 录
              </el-button>
            </el-form-item>
          </el-form>
        </template>
      </div>

      <!-- 底部信息 -->
      <div class="footer-info">
        <p>仅限白名单账号登录 · 如需开通请联系超级管理员</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Phone, Lock, InfoFilled } from '@element-plus/icons-vue'
import { callFunction } from '@/utils/cloud'

const router = useRouter()

// ========== 状态 ==========
const submitting = ref(false)
const needSetPassword = ref(false)
const phoneForSetPassword = ref('')
const loginFormRef = ref(null)
const setPasswordFormRef = ref(null)

// ========== 登录表单 ==========
const loginForm = reactive({
  phone: '',
  password: ''
})

const loginRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

// ========== 设置密码表单 ==========
const setPasswordForm = reactive({
  password: '',
  confirmPassword: ''
})

const validateConfirmPassword = (rule, value, callback) => {
  if (value !== setPasswordForm.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const setPasswordRules = {
  password: [
    { required: true, message: '请设置密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

// ========== 登录逻辑 ==========
async function handleLogin() {
  const valid = await loginFormRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const result = await callFunction('tournamentCenterLogin', {
      phone: loginForm.phone,
      password: loginForm.password
    })

    if (result.success) {
      // 需要设置密码
      if (result.needSetPassword) {
        phoneForSetPassword.value = result.phone
        needSetPassword.value = true
        return
      }

      // 登录成功
      onLoginSuccess(result)
    } else {
      ElMessage.error(result.error || '登录失败')
    }
  } catch (err) {
    console.error('登录失败:', err)
    ElMessage.error('登录服务异常，请稍后重试')
  } finally {
    submitting.value = false
  }
}

// ========== 设置密码逻辑 ==========
async function handleSetPassword() {
  const valid = await setPasswordFormRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const result = await callFunction('setTournamentCenterPassword', {
      phone: phoneForSetPassword.value,
      password: setPasswordForm.password
    })

    if (result.success) {
      ElMessage.success('密码设置成功，正在登录...')

      // 设置密码后自动登录
      const loginResult = await callFunction('tournamentCenterLogin', {
        phone: phoneForSetPassword.value,
        password: setPasswordForm.password
      })

      if (loginResult.success) {
        onLoginSuccess(loginResult)
      } else {
        ElMessage.error('自动登录失败，请刷新页面重试')
        needSetPassword.value = false
      }
    } else {
      ElMessage.error(result.error || '设置密码失败')
    }
  } catch (err) {
    console.error('设置密码失败:', err)
    ElMessage.error('设置密码失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

// ========== 登录成功处理 ==========
function onLoginSuccess(result) {
  const { token, user } = result

  // 存储登录态
  localStorage.setItem('tc_isLoggedIn', 'true')
  localStorage.setItem('tc_phone', user.phone)
  localStorage.setItem('tc_token', token)
  localStorage.setItem('tc_role', user.role)
  localStorage.setItem('tc_displayName', user.displayName || '')

  ElMessage.success(`欢迎回来，${user.displayName || user.phone}`)

  // 跳转到赛事中心管理后台
  router.push('/tournament-center-admin')
}
</script>

<style scoped>
/* ========== 页面容器 ========== */
.tc-login-page {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0d3b0f 0%, #1B5E20 30%, #2E7D32 60%, #43A047 100%);
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* ========== 背景装饰 ========== */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
}

.bg-circle-1 {
  width: 600px;
  height: 600px;
  top: -200px;
  right: -150px;
  animation: float-circle 20s ease-in-out infinite;
}

.bg-circle-2 {
  width: 400px;
  height: 400px;
  bottom: -100px;
  left: -100px;
  animation: float-circle 25s ease-in-out infinite reverse;
}

.bg-circle-3 {
  width: 200px;
  height: 200px;
  top: 40%;
  left: 60%;
  animation: float-circle 15s ease-in-out infinite;
}

@keyframes float-circle {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -20px) scale(1.05); }
  66% { transform: translate(-20px, 10px) scale(0.95); }
}

/* ========== 登录卡片 ========== */
.login-card {
  position: relative;
  z-index: 1;
  width: 420px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  overflow: hidden;
  animation: card-enter 0.6s ease-out;
}

@keyframes card-enter {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ========== 品牌区域 ========== */
.brand-section {
  padding: 40px 40px 20px;
  text-align: center;
  background: linear-gradient(180deg, rgba(27, 94, 32, 0.04) 0%, transparent 100%);
}

.brand-icon {
  margin-bottom: 16px;
  display: inline-block;
}

.brand-icon img {
  width: 180px;
  height: auto;
  max-width: 100%;
}

.brand-title {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
  color: #1B5E20;
  letter-spacing: 2px;
}

.brand-subtitle {
  margin: 0;
  font-size: 13px;
  color: #78909C;
  letter-spacing: 3px;
  text-transform: uppercase;
}

/* ========== 表单区域 ========== */
.form-section {
  padding: 20px 40px 10px;
}

.form-section :deep(.el-input__wrapper) {
  border-radius: 8px;
  box-shadow: 0 0 0 1px #e0e0e0 inset;
  transition: box-shadow 0.3s;
}

.form-section :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #66BB6A inset;
}

.form-section :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(27, 94, 32, 0.2) inset;
}

.submit-btn {
  width: 100%;
  border-radius: 8px;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 4px;
  background: linear-gradient(135deg, #1B5E20 0%, #43A047 100%) !important;
  border: none !important;
  transition: all 0.3s;
}

.submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(27, 94, 32, 0.4);
}

.submit-btn:active {
  transform: translateY(0);
}

.set-password-btn {
  background: linear-gradient(135deg, #E65100 0%, #FF9800 100%) !important;
}

.set-password-btn:hover {
  box-shadow: 0 6px 20px rgba(230, 81, 0, 0.4);
}

/* ========== 设置密码提示 ========== */
.set-password-notice {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px;
  margin-bottom: 20px;
  background: linear-gradient(135deg, #FFF3E0, #FFE0B2);
  border-radius: 10px;
  border: 1px solid #FFCC80;
}

.notice-icon {
  font-size: 22px;
  color: #E65100;
  flex-shrink: 0;
  margin-top: 2px;
}

.notice-text {
  flex: 1;
}

.notice-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #E65100;
}

.notice-desc {
  margin: 0;
  font-size: 13px;
  color: #795548;
  line-height: 1.5;
}

/* ========== 底部信息 ========== */
.footer-info {
  padding: 16px 40px 32px;
  text-align: center;
}

.footer-info p {
  margin: 0;
  font-size: 12px;
  color: #B0BEC5;
  letter-spacing: 1px;
}

/* ========== 响应式 ========== */
@media (max-width: 480px) {
  .login-card {
    width: 92%;
    border-radius: 12px;
  }
  .brand-section {
    padding: 32px 24px 16px;
  }
  .form-section {
    padding: 16px 24px 8px;
  }
  .footer-info {
    padding: 12px 24px 24px;
  }
  .brand-title {
    font-size: 20px;
  }
}
</style>
