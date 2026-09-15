<template>
  <div class="profile-page portal-container">
    <!-- 未登录态 -->
    <div v-if="!isLoggedIn" class="login-guide">
      <div class="guide-card">
        <img :src="brandLogoUrl" alt="赛小蜂足球" class="guide-logo" />
        <h2 class="guide-title">登录赛小蜂足球</h2>


        <el-form :model="loginForm" class="login-form" @submit.prevent="handleLogin">
          <el-form-item>
            <el-input
              v-model="loginForm.phone"
              placeholder="请输入手机号"
              maxlength="11"
              size="large"
              :prefix-icon="Phone"
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="loginForm.code"
              placeholder="请输入验证码"
              maxlength="6"
              size="large"
              :prefix-icon="Key"
              @keyup.enter="handleLogin"
            >
              <template #append>
                <el-button :disabled="countdown > 0 || !isPhoneValid" @click="sendCode">
                  {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
                </el-button>
              </template>
            </el-input>
          </el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-submit"
            :loading="loginLoading"
            :disabled="!isPhoneValid || loginForm.code.length !== 6"
            @click="handleLogin"
          >
            登录 / 注册
          </el-button>
        </el-form>

        <div class="guide-footer">
          登录即表示同意 <a href="javascript:void(0)">《用户协议》</a> 和 <a href="javascript:void(0)">《隐私政策》</a>
        </div>
      </div>
    </div>

    <!-- 已登录态 -->
    <div v-else class="profile-content">
      <!-- 用户信息卡片 -->
      <div class="user-card">
        <div class="user-main">
          <UserAvatar :src="userInfo.avatarUrl" :name="userInfo.userName" :size="64" />
          <div class="user-info">
            <div class="user-name">{{ userInfo.userName || '赛小蜂足球用户' }}</div>
            <div class="user-phone">{{ maskedPhone }}</div>
          </div>
          <el-button text @click="goSettings">
            <el-icon><Setting /></el-icon>
          </el-button>
        </div>
        <!-- 竞猜币余额 -->
        <div class="user-coin">
          <div class="coin-block" @click="goCoinDetail">
            <el-icon class="coin-icon"><GoldMedal /></el-icon>
            <div>
              <div class="coin-label">蜂蜜币</div>
              <div class="coin-value">{{ coins }}</div>
            </div>
          </div>
          <el-button type="warning" size="small" round @click="goTaskCenter">赚蜂蜜币</el-button>
        </div>
      </div>

      <!-- 功能宫格 -->
      <div class="feature-grid">
        <div
          v-for="f in features"
          :key="f.key"
          class="feature-item"
          @click="handleFeature(f)"
        >
          <div class="feature-icon" :style="{ background: f.bgColor }">
            <el-icon><component :is="f.icon" /></el-icon>
          </div>
          <div class="feature-label">{{ f.label }}</div>
        </div>
      </div>

      <!-- 更多功能列表 -->
      <div class="menu-list">
        <div
          v-for="m in menuItems"
          :key="m.key"
          class="menu-item"
          @click="handleMenu(m)"
        >
          <el-icon class="menu-icon"><component :is="m.icon" /></el-icon>
          <span class="menu-label">{{ m.label }}</span>
          <el-icon class="menu-arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <!-- 退出登录 -->
      <div class="logout-area">
        <el-button plain class="logout-btn" @click="handleLogout">退出登录</el-button>
      </div>
    </div>

    <!-- 登录弹窗（复用，备用） -->
    <LoginDialog v-model="loginDialogVisible" @success="handleLoginSuccess" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Phone, Key, Setting, GoldMedal, ArrowRight,
  Star, Ticket, Coin, Calendar, Bell, QuestionFilled, InfoFilled
} from '@element-plus/icons-vue'
import UserAvatar from '../components/UserAvatar.vue'
import LoginDialog from '../components/LoginDialog.vue'

const brandLogoUrl = `${import.meta.env.BASE_URL}LOGO2.png`

/**
 * 个人中心基础页
 * - 未登录态：手机号 + 验证码登录引导
 * - 已登录态：头像 + 昵称 + 竞猜币 + 功能宫格 + 菜单列表
 */
const isLoggedIn = ref(false)
const userInfo = ref({ userName: '', avatarUrl: '', phone: '' })
const coins = ref(1000)
const loginDialogVisible = ref(false)

// 登录表单
const loginForm = ref({ phone: '', code: '' })
const countdown = ref(0)
const loginLoading = ref(false)
let timer = null

const isPhoneValid = computed(() => /^1[3-9]\d{9}$/.test(loginForm.value.phone))

const maskedPhone = computed(() => {
  const p = userInfo.value.phone || ''
  if (p.length === 11) return p.slice(0, 3) + '****' + p.slice(7)
  return p
})

// 功能宫格
const features = [
  { key: 'follow', label: '我的关注', icon: Star, bgColor: 'linear-gradient(135deg, #43A047, #2E7D32)' },
  { key: 'guess', label: '竞猜记录', icon: Ticket, bgColor: 'linear-gradient(135deg, #FFC107, #FF9800)' },
  { key: 'coin', label: '蜂蜜币明细', icon: Coin, bgColor: 'linear-gradient(135deg, #FFB300, #FF8F00)' },
  { key: 'task', label: '任务中心', icon: Calendar, bgColor: 'linear-gradient(135deg, #2196F3, #1565C0)' }
]

// 菜单列表
const menuItems = [
  { key: 'notify', label: '消息通知', icon: Bell },
  { key: 'help', label: '帮助中心', icon: QuestionFilled },
  { key: 'about', label: '关于赛小蜂足球', icon: InfoFilled }
]

async function sendCode() {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  try {
    // 预留：callFunction('sendSms', { phoneNumber: loginForm.value.phone })
    ElMessage.success('验证码已发送（Mock）')
    countdown.value = 60
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) clearInterval(timer)
    }, 1000)
  } catch (err) {
    ElMessage.error('发送失败：' + (err.message || '网络错误'))
  }
}

async function handleLogin() {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  if (loginForm.value.code.length !== 6) {
    ElMessage.warning('请输入6位验证码')
    return
  }
  loginLoading.value = true
  try {
    // 预留：callFunction('phoneLogin', { phone, code })
    await new Promise((resolve) => setTimeout(resolve, 800))
    ElMessage.success('登录成功（Mock）')
    isLoggedIn.value = true
    userInfo.value = { userName: '赛小蜂足球用户', avatarUrl: '', phone: loginForm.value.phone }
    localStorage.setItem('isLoggedIn', 'true')
    localStorage.setItem('userInfo', JSON.stringify(userInfo.value))
    loginForm.value = { phone: '', code: '' }
  } catch (err) {
    ElMessage.error('登录失败：' + (err.message || '网络错误'))
  } finally {
    loginLoading.value = false
  }
}

function handleLoginSuccess(data) {
  isLoggedIn.value = true
  userInfo.value = { userName: '赛小蜂足球用户', avatarUrl: '', phone: data.phone || '' }
}

function handleFeature(f) {
  ElMessage.info(`${f.label} 开发中`)
}

function handleMenu(m) {
  ElMessage.info(`${m.label} 开发中`)
}

function goSettings() {
  ElMessage.info('设置页开发中')
}

function goCoinDetail() {
  ElMessage.info('蜂蜜币明细开发中')
}

function goTaskCenter() {
  ElMessage.info('任务中心开发中')
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning'
    })
    // 预留：logout()
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('userInfo')
    isLoggedIn.value = false
    userInfo.value = { userName: '', avatarUrl: '', phone: '' }
    ElMessage.success('已退出登录')
  } catch (e) {
    // 取消
  }
}

onMounted(() => {
  isLoggedIn.value = localStorage.getItem('isLoggedIn') === 'true'
  try {
    const saved = localStorage.getItem('userInfo')
    if (saved) userInfo.value = JSON.parse(saved)
  } catch (e) {
    // ignore
  }
})
</script>

<style scoped>
.profile-page {
  padding: 12px 0 16px;
}

@media (min-width: 1024px) {
  .profile-page {
    padding: 20px 0 32px;
  }
}

/* 未登录态 */
.login-guide {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.guide-card {
  width: 100%;
  max-width: 380px;
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-lg, 14px);
  padding: 28px 24px;
  box-shadow: var(--portal-shadow-md, 0 2px 12px rgba(0,0,0,0.08));
  text-align: center;
}

.guide-logo {
  width: 72px;
  height: auto;
  margin-bottom: 12px;
}

.guide-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--portal-primary, #1B5E20);
  margin: 0 0 6px 0;
}

.guide-desc {
  font-size: 13px;
  color: var(--portal-text-secondary, #909399);
  margin-bottom: 20px;
}

.login-form {
  text-align: left;
}

.login-submit {
  width: 100%;
}

.guide-footer {
  margin-top: 14px;
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
}

.guide-footer a {
  color: var(--portal-primary-light, #2E7D32);
  text-decoration: none;
}

/* 已登录态 */
.profile-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (min-width: 768px) {
  .profile-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
  }
}

/* 用户信息卡片 */
.user-card {
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  padding: 16px;
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
}

@media (min-width: 768px) {
  .user-card {
    grid-column: 1 / -1;
  }
}

.user-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--portal-text-primary, #303133);
}

.user-phone {
  font-size: 13px;
  color: var(--portal-text-secondary, #909399);
  margin-top: 2px;
}

.user-coin {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: linear-gradient(135deg, #FFC107, #FF9800);
  border-radius: var(--portal-radius-md, 10px);
}

.coin-block {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.coin-icon {
  font-size: 28px;
  color: #5D4037;
}

.coin-label {
  font-size: 12px;
  color: rgba(93, 64, 55, 0.85);
}

.coin-value {
  font-size: 20px;
  font-weight: 700;
  color: #5D4037;
  font-variant-numeric: tabular-nums;
}

/* 功能宫格 */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  padding: 16px 12px;
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
}

@media (min-width: 768px) {
  .feature-grid {
    grid-column: 1 / -1;
  }
}

.feature-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 0;
}

.feature-item:active {
  transform: scale(0.95);
}

.feature-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.feature-label {
  font-size: 12px;
  color: var(--portal-text-regular, #606266);
}

/* 菜单列表 */
.menu-list {
  background: var(--portal-bg-card, #fff);
  border-radius: var(--portal-radius-md, 10px);
  padding: 4px 0;
  box-shadow: var(--portal-shadow-sm, 0 1px 4px rgba(0,0,0,0.06));
  overflow: hidden;
}

@media (min-width: 768px) {
  .menu-list {
    grid-column: 1 / -1;
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid var(--portal-border, #ebeef5);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: var(--portal-primary-bg, #E8F5E9);
}

.menu-icon {
  font-size: 18px;
  color: var(--portal-primary-light, #2E7D32);
}

.menu-label {
  flex: 1;
  font-size: 14px;
  color: var(--portal-text-primary, #303133);
}

.menu-arrow {
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
}

/* 退出登录 */
.logout-area {
  text-align: center;
}

@media (min-width: 768px) {
  .logout-area {
    grid-column: 1 / -1;
  }
}

.logout-btn {
  width: 100%;
  color: var(--portal-danger, #f56c6c);
  border-color: var(--portal-danger, #f56c6c);
}

.logout-btn:hover {
  background: var(--portal-danger-bg, #fdecea);
  color: var(--portal-danger, #f56c6c);
  border-color: var(--portal-danger, #f56c6c);
}
</style>
