<template>
  <div class="layout">
    <!-- 顶部导航栏 -->
    <header class="top-header">
      <div class="header-left">
        <div class="logo-area">
          <img src="/LOGO2.png" alt="赛小蜂足球赛事管理系统" class="logo-img" />
        </div>
      </div>
      <div class="header-center">
        <span class="page-title">{{ currentPageTitle }}</span>
      </div>
      <div class="header-right">
        <el-dropdown trigger="click" @command="handleUserCommand">
          <div class="user-avatar-wrapper">
            <el-avatar v-if="userInfo.avatarUrl" :size="36" :src="userInfo.avatarUrl" />
            <el-avatar v-else :size="36" style="background: #43A047; font-size: 14px;">
              {{ userInfo.userName ? userInfo.userName.charAt(0) : '?' }}
            </el-avatar>
            <el-icon class="dropdown-arrow"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>
                <div class="user-info-dropdown">
                  <div class="user-name">{{ userInfo.userName || '未登录' }}</div>
                  <div class="user-role">
                    <el-tag v-if="loginType === 'anonymous'" type="info" size="small">开发模式</el-tag>
                    <el-tag v-else-if="loginType === 'wechat'" type="success" size="small">微信扫码</el-tag>
                    <el-tag type="warning" size="small">{{ roleLabel }}</el-tag>
                  </div>
                </div>
              </el-dropdown-item>
              <el-dropdown-item divided command="refresh">
                <el-icon><Refresh /></el-icon>刷新数据
              </el-dropdown-item>
              <el-dropdown-item command="logout">
                <el-icon><SwitchButton /></el-icon>退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <!-- 绑定手机号弹窗（强制绑定，不可关闭） -->
    <el-dialog v-if="false"
      v-model="bindPhoneVisible"
      title="绑定手机号"
      width="400px"
      :close-on-click-modal="false"
      :show-close="false"
      :close-on-press-escape="false"
    >
      <div style="margin-bottom: 16px; color: #f56c6c; font-size: 13px;">
        <el-icon><Warning /></el-icon>
        为了账号安全，请绑定手机号后才能继续使用
      </div>
      <el-form :model="bindForm" label-width="80px">
        <el-form-item label="手机号">
          <el-input
            v-model="bindForm.phone"
            placeholder="请输入手机号"
            maxlength="11"
          >
            <template #append>
              <el-button
                :disabled="countdown > 0 || !isPhoneValid"
                @click="sendBindCode"
              >
                {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="验证码">
          <el-input
            v-model="bindForm.code"
            placeholder="请输入短信验证码"
            maxlength="6"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="confirmBindPhone">确认绑定</el-button>
      </template>
    </el-dialog>

    <!-- 强制设置密码弹窗（不可关闭） -->
    <el-dialog v-if="false"
      v-model="setPasswordVisible"
      title="设置登录密码"
      width="420px"
      :close-on-click-modal="false"
      :show-close="false"
      :close-on-press-escape="false"
    >
      <div style="margin-bottom: 16px; color: #e6a23; font-size: 13px;">
        <el-icon><Warning /></el-icon>
        为了账号安全，请设置密码后才能继续使用（须同时包含大写字母、小写字母和数字）
      </div>
      <el-form :model="passwordForm" label-width="80px">
        <el-form-item label="新密码">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            placeholder="至少8位，含大写+小写+数字"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认密码">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            placeholder="再次输入密码"
            show-password
            @keyup.enter="confirmSetPassword"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="confirmSetPassword" :disabled="!canSubmitPassword">确认设置</el-button>
      </template>
    </el-dialog>

    <!-- 强制绑定邮箱弹窗（不可关闭） -->
    <el-dialog v-if="false"
      v-model="bindEmailVisible"
      title="绑定邮箱"
      width="420px"
      :close-on-click-modal="false"
      :show-close="false"
      :close-on-press-escape="false"
    >
      <div style="margin-bottom: 16px; color: #e6a23; font-size: 13px;">
        <el-icon><Warning /></el-icon>
        为了账号安全，请绑定邮箱（用于找回密码）
      </div>
      <el-form :model="bindEmailForm" label-width="80px">
        <el-form-item label="邮箱">
          <el-input
            v-model="bindEmailForm.email"
            placeholder="请输入邮箱"
            maxlength="50"
          >
            <template #append>
              <el-button
                :disabled="!isEmailValid || emailCodeCountdown > 0"
                @click="sendBindEmailCode"
              >
                {{ emailCodeCountdown > 0 ? `${emailCodeCountdown}s` : '获取验证码' }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="验证码">
          <el-input
            v-model="bindEmailForm.code"
            placeholder="请输入邮箱验证码"
            maxlength="6"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="confirmBindEmail" :disabled="!bindEmailForm.email || !bindEmailForm.code">确认绑定</el-button>
      </template>
    </el-dialog>

    <div class="main-container">
      <!-- 侧边栏 -->
      <aside class="sidebar">
        <nav class="sidebar-nav">
          <template v-for="item in currentNavItems" :key="item.path">
            <!-- 有子菜单 -->
            <template v-if="item.children">
              <div
                class="nav-item"
                :class="{ active: isActive(item.path) || isChildActive(item.path) }"
                @click="toggleSubMenu(item)"
              >
                <el-icon :size="20"><component :is="item.icon" /></el-icon>
                <span class="nav-label">{{ item.label }}</span>
                <el-icon class="submenu-arrow" :class="{ rotated: expandedMenus.includes(item.path) }">
                  <ArrowDown />
                </el-icon>
              </div>
              <!-- 子菜单 -->
              <div v-show="expandedMenus.includes(item.path)" class="submenu">
                <div
                  v-for="child in item.children"
                  :key="child.path"
                  class="nav-sub-item"
                  :class="{ active: isActive(child.path) }"
                  @click="handleNavClick(child)"
                >
                  <span class="sub-label">{{ child.label }}</span>
                </div>
              </div>
            </template>
            
            <!-- 无子菜单 -->
            <template v-else>
              <div
                class="nav-item"
                :class="{ active: isActive(item.path) }"
                @click="handleNavClick(item)"
              >
                <el-icon :size="20"><component :is="item.icon" /></el-icon>
                <span class="nav-label">{{ item.label }}</span>
              </div>
            </template>
          </template>
        </nav>

        <!-- 当前身份（只读，在赛事中心管理页面隐藏）-->
        <div v-if="!isAdminPage" class="sidebar-footer">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:#f5f7fa;">
            <span style="font-size:12px;color:#909399;">当前身份：</span>
            <el-tag type="primary" size="small">{{ roleLabel }}</el-tag>
          </div>
        </div>
      </aside>

      <!-- 主内容区 -->
      <main class="content-area">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Refresh, SwitchButton, ArrowDown, Phone, Warning, Message,
  Trophy, UserFilled, User, SetUp, Picture, FirstAidKit, ShoppingBag,
  Postcard, Place
} from '@element-plus/icons-vue'
import { logout, queryById, queryList } from '../../utils/cloud'
import {
  ROLE_NAMES,
  ROLES
} from '../../utils/permissions'

const WEB_LOGIN_API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'

const router = useRouter()
const route = useRoute()

// 用户信息
const userInfo = ref({
  userName: '',
  avatarUrl: '',
  phone: '',
  email: ''
})
const loginType = ref('')
const currentRole = ref('')
const isHeadReferee = ref(false)

// 绑定手机号弹窗
const bindPhoneVisible = ref(false)
const bindForm = ref({ phone: '', code: '' })
const countdown = ref(0)
let countdownTimer = null

// 强制设置密码弹窗
const setPasswordVisible = ref(false)
const passwordForm = ref({ newPassword: '', confirmPassword: '' })

// 强制绑定邮箱弹窗
const bindEmailVisible = ref(false)
const bindEmailForm = ref({ email: '', code: '' })
const emailCodeCountdown = ref(0)
let emailCodeTimer = null

// 选择身份已移至独立页面 /select-role（SelectRoleView.vue）

const isPhoneValid = computed(() => /^1[3-9]\d{9}$/.test(bindForm.value.phone))

const isEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bindEmailForm.value.email))

// 密码提交校验
const canSubmitPassword = computed(() => {
  const pw = passwordForm.value.newPassword
  if (!pw || pw.length < 8) return false
  if (!/[A-Z]/.test(pw)) return false
  if (!/[a-z]/.test(pw)) return false
  if (!/[0-9]/.test(pw)) return false
  if (pw !== passwordForm.value.confirmPassword) return false
  return true
})

// 发送绑定验证码
async function sendBindCode() {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  try {
    const { callFunction } = await import('../../utils/cloud')
    const res = await callFunction('sendSms', { phoneNumber: bindForm.value.phone })
    if (res.success) {
      ElMessage.success('验证码已发送')
      countdown.value = 60
      countdownTimer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) clearInterval(countdownTimer)
      }, 1000)
    } else {
      ElMessage.error(res.error || '发送失败')
    }
  } catch (err) {
    ElMessage.error('发送失败：' + (err.message || '网络错误'))
  }
}

// 确认绑定手机号
async function confirmBindPhone() {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  if (!bindForm.value.code || bindForm.value.code.length !== 6) {
    ElMessage.warning('请输入6位验证码')
    return
  }
  const email = userInfo.value.email || (localStorage.getItem('userInfo') && JSON.parse(localStorage.getItem('userInfo')).email) || ''
  const userId = JSON.parse(localStorage.getItem('userInfo') || '{}').uid || userInfo.value.uid || localStorage.getItem('userId')
  if (!userId) {
    ElMessage.error('未获取到用户信息，请重新登录')
    return
  }
  try {
    const { callFunction } = await import('../../utils/cloud')
    const res = await callFunction('bindPhone', {
      email,
      phone: bindForm.value.phone,
      code: bindForm.value.code
    })
    if (res.success) {
      ElMessage.success('手机号绑定成功')
      
      // ★ 从后端重新加载完整用户信息
      try {
        const infoRes = await callFunction('emailLogin', {
          action: 'getUserInfo',
          userId: userId
        })
        if (infoRes.success && infoRes.user) {
          userInfo.value = {
            userName: infoRes.user.nickname || infoRes.user.email || infoRes.user.userName || '微信用户',
            avatarUrl: infoRes.user.headimgurl || infoRes.user.avatarUrl || '',
            phone: infoRes.user.phone || infoRes.user.phoneNumber || bindForm.value.phone,
            email: infoRes.user.email || '',
            uid: infoRes.user._id
          }
          localStorage.setItem('userInfo', JSON.stringify(userInfo.value))
          localStorage.setItem('userId', infoRes.user._id)
          console.log('[Layout] 用户信息已从后端同步:', userInfo.value)
        }
      } catch (e) {
        // 后端获取失败，手动合并
        console.warn('[Layout] getUserInfo 失败，手动合并:', e.message)
        userInfo.value.phone = bindForm.value.phone
        userInfo.value.uid = userId
        const saved = JSON.parse(localStorage.getItem('userInfo') || '{}')
        saved.phone = bindForm.value.phone
        saved.uid = userId
        localStorage.setItem('userInfo', JSON.stringify(saved))
      }

      // 根据手机号自动设置角色（云函数返回的 role）
      if (res.role) {
        currentRole.value = res.role
        localStorage.setItem('role', res.role)
        localStorage.setItem('currentRole', res.role)
        ElMessage.success(`身份已设置为：${ROLE_NAMES[res.role] || res.role}`)
      }

      // 清除强制绑定手机标志
      localStorage.removeItem('needBindPhone')
      bindPhoneVisible.value = false
      bindForm.value = { phone: '', code: '' }

      // ★ 按流程图顺序：绑手机号 → 设置密码 → 绑邮箱
      if (localStorage.getItem('needSetPassword') === 'true') {
        setPasswordVisible.value = true
      } else if (localStorage.getItem('needBindEmail') === 'true') {
        bindEmailVisible.value = true
      }
    } else {
      ElMessage.error(res.error || '绑定失败')
    }
  } catch (err) {
    ElMessage.error('绑定失败：' + (err.message || '网络错误'))
  }
}

// 确认设置密码（强制）
async function confirmSetPassword() {
  if (!canSubmitPassword.value) {
    ElMessage.warning('请检查密码规则')
    return
  }
  const userId = JSON.parse(localStorage.getItem('userInfo') || '{}').uid || userInfo.value.uid
  if (!userId) {
    ElMessage.error('未获取到用户信息，请重新登录')
    return
  }
  try {
    const response = await fetch(WEB_LOGIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'emailSetPassword',
        userId: userId,
        password: passwordForm.value.newPassword
      })
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const res = await response.json()
    if (res.success) {
      ElMessage.success('密码设置成功')
      setPasswordVisible.value = false
      passwordForm.value = { newPassword: '', confirmPassword: '' }
      // 清除强制标志
      localStorage.removeItem('needSetPassword')
      // ★ 按流程图：设置密码 → 绑定邮箱（手机号已在前面绑了）
      if (localStorage.getItem('needBindEmail') === 'true') {
        bindEmailVisible.value = true
      }
    } else {
      ElMessage.error(res.error || '设置失败')
    }
  } catch (err) {
    ElMessage.error('设置失败：' + (err.message || '网络错误'))
  }
}

// 发送绑定邮箱验证码
async function sendBindEmailCode() {
  const email = bindEmailForm.value.email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ElMessage.warning('请输入正确的邮箱')
    return
  }
  try {
    const response = await fetch(WEB_LOGIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'emailSendCode',
        email: email,
        purpose: 'bind'
      })
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const res = await response.json()
    if (res.success) {
      ElMessage.success('验证码已发送到邮箱')
      emailCodeCountdown.value = 60
      emailCodeTimer = setInterval(() => {
        emailCodeCountdown.value--
        if (emailCodeCountdown.value <= 0) {
          clearInterval(emailCodeTimer)
        }
      }, 1000)
    } else {
      ElMessage.error(res.error || '发送失败')
    }
  } catch (err) {
    ElMessage.error('发送失败：' + (err.message || '网络错误'))
  }
}

// 确认绑定邮箱（强制）
async function confirmBindEmail() {
  if (!bindEmailForm.value.email || !bindEmailForm.value.code) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const userId = JSON.parse(localStorage.getItem('userInfo') || '{}').uid || userInfo.value.uid
  if (!userId) {
    ElMessage.error('未获取到用户信息，请重新登录')
    return
  }
  try {
    const response = await fetch(WEB_LOGIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'emailBindEmail',
        userId: userId,
        email: bindEmailForm.value.email,
        code: bindEmailForm.value.code
      })
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const res = await response.json()
    if (res.success) {
      ElMessage.success('邮箱绑定成功')
      bindEmailVisible.value = false
      const boundEmail = bindEmailForm.value.email
      bindEmailForm.value = { email: '', code: '' }
      // 清除强制标志
      localStorage.removeItem('needBindEmail')

      // ★ 同步到 userInfo（响应式 + localStorage）
      userInfo.value.email = boundEmail
      const saved = JSON.parse(localStorage.getItem('userInfo') || '{}')
      saved.email = boundEmail
      localStorage.setItem('userInfo', JSON.stringify(saved))
      
      // 检查是否需要继续绑定手机号
      if (localStorage.getItem('needBindPhone') === 'true') {
        bindPhoneVisible.value = true
      }
    } else {
      ElMessage.error(res.error || '绑定失败')
    }
  } catch (err) {
    ElMessage.error('绑定失败：' + (err.message || '网络错误'))
  }
}

// 确认选择身份已移至独立页面 /select-role（SelectRoleView.vue）

const roleLabel = computed(() => ROLE_NAMES[currentRole.value] || '未知')

// 展开的子菜单列表
const expandedMenus = ref([])

// 切换子菜单展开/收起
function toggleSubMenu(item) {
  const index = expandedMenus.value.indexOf(item.path)
  if (index > -1) {
    expandedMenus.value.splice(index, 1)
  } else {
    expandedMenus.value.push(item.path)
  }
}

// 教练端导航菜单
const coachNavItems = [
  { path: '/coaches', label: '教练组管理', icon: 'UserFilled' },
  { path: '/teams', label: '球队管理', icon: 'UserFilled' },
  { path: '/players', label: '球员数据', icon: 'User' },
  { path: '/my-tournaments', label: '我的赛事', icon: 'Trophy' },
  { path: '/tournament-center', label: '赛事中心', icon: 'Trophy' },
  { path: '/team-album', label: '球队相册', icon: 'Picture' },
  { path: '/insurance', label: '赛事保险', icon: 'FirstAidKit' },
  { path: '/shop', label: '赛事商城', icon: 'ShoppingBag' }
]

// 主办方端导航菜单
const organizerNavItems = [
  { 
    path: '/tournaments', 
    label: '赛事管理', 
    icon: 'Trophy',
    children: [
      { path: '/tournaments', label: '赛事列表' }
    ]
  },
  { path: '/referees', label: '裁判管理', icon: 'SetUp' },
  { path: '/poster/editor', label: '海报编辑器', icon: 'Postcard' },
  { path: '/tournament-center', label: '赛事中心', icon: 'Picture' },
  { path: '/system', label: '系统管理', icon: 'Setting' }
]

// 裁判端导航菜单（裁判长额外显示"裁判长管理"）
const refereeNavItems = computed(() => {
  const items = [
    { path: '/referee/my-matches', label: '我的执法', icon: 'SetUp' },
    { path: '/tournament-center', label: '赛事中心', icon: 'Trophy' },
    { path: '/system', label: '系统管理', icon: 'Setting' }
  ]
  if (isHeadReferee.value) {
    items.splice(1, 0, { path: '/referee/head-referee', label: '裁判长管理', icon: 'UserFilled' })
  }
  return items
})

// 赛事中心超级管理后台导航
const adminNavItems = [
  { path: '/tournament-center-admin', label: '赛事中心管理', icon: 'Picture' },
  { path: '/admin/tournaments', label: '赛事列表', icon: 'Trophy' },
  { path: '/admin/teams', label: '球队列表', icon: 'UserFilled' },
  { path: '/referees', label: '裁判库', icon: 'SetUp' },
  { path: '/formation-designer.html', label: '阵型设计器', icon: 'Place', external: true },
  { path: '/shop-admin', label: '商城管理', icon: 'ShoppingBag' },
  { path: '/insurance-admin', label: '保险业务', icon: 'FirstAidKit' },
  { path: '/system', label: '系统管理', icon: 'Setting' }
]

// 是否是赛事中心管理页面
const isAdminPage = computed(() => {
  return route.path.startsWith('/tournament-center-admin') || 
         route.path.startsWith('/admin/')
})

// 根据角色返回对应导航菜单
const currentNavItems = computed(() => {
  // 赛事中心管理页面使用超级管理后台导航
  if (isAdminPage.value) {
    return adminNavItems
  }
  if (currentRole.value === ROLES.COACH) {
    return coachNavItems
  }
  if (currentRole.value === ROLES.REFEREE) {
    return refereeNavItems.value
  }
  return organizerNavItems
})

// 用户下拉菜单命令
function handleUserCommand(command) {
  switch (command) {
    case 'refresh':
      router.go(0)
      break
    case 'logout':
      // 先清理登录态
      logout()
      // 再直接跳到首页（不要经过路由守卫，它会在 isLoggedIn 清空后自动跳到 /login）
      window.location.replace('https://saixiaofeng.com/')
      break
  }
}

function handleNavClick(item) {
  if (item.external) {
    window.open(item.path, '_blank')
  } else {
    router.push(item.path)
  }
}

function isActive(path) {
  return route.path === path || route.path.startsWith(path + '/')
}

function isChildActive(parentPath) {
  const parent = currentNavItems.value.find(item => item.path === parentPath)
  if (!parent || !parent.children) return false
  return parent.children.some(child => route.path === child.path || route.path.startsWith(child.path + '/'))
}

onMounted(() => {
  const savedInfo = localStorage.getItem('userInfo')
  if (savedInfo) {
    try {
      const parsed = JSON.parse(savedInfo)
      userInfo.value = {
        userName: parsed.userName || '开发者',
        avatarUrl: parsed.avatarUrl || ''
      }
      localStorage.setItem('userInfo', JSON.stringify({
        uid: parsed.uid || '',
        userName: parsed.userName || '微信用户',
        avatarUrl: parsed.avatarUrl || '',
        openid: parsed.openid || '',
        unionid: parsed.unionid || ''
      }))
    } catch (e) {
      // ignore
    }
  }
  loginType.value = localStorage.getItem('loginType') || 'anonymous'
  currentRole.value = localStorage.getItem('currentRole') || localStorage.getItem('role') || ''

  ['needBindPhone', 'needSetPassword', 'needBindEmail', 'phone', 'phoneNumber']
    .forEach(key => localStorage.removeItem(key))

  // 检测是否为裁判长（查询 tournament_referees 集合，支持按赛事设置）
  const userId = localStorage.getItem('userId')
  if (userId && currentRole.value === ROLES.REFEREE) {
    // 新逻辑：查询 tournament_refereees，看是否是任意赛事的裁判长
    queryList('tournament_referees', {
      where: { refereeId: userId, isHeadReferee: true }
    }).then(res => {
      isHeadReferee.value = !!(res && res.length > 0)
    }).catch(() => {
      // 降级：查 referees 集合的 isHeadReferee 字段（兼容旧数据）
      queryById('referees', userId).then(res => {
        isHeadReferee.value = !!(res && res.isHeadReferee)
      }).catch(() => {
        isHeadReferee.value = false
      })
    })
  }
})

const currentPageTitle = computed(() => {
  return route.meta.title || '数据概览'
})

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;
}

/* 顶部导航栏 */
.top-header {
  height: 64px;
  background: linear-gradient(135deg, #1B5E20, #2E7D32);
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo-area {
  display: flex;
  align-items: center;
}

.logo-img {
  width: 160px;
  height: auto;
  max-height: 48px;
  object-fit: contain;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-avatar-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px;
  border-radius: 20px;
  transition: background 0.2s;
}

.user-avatar-wrapper:hover {
  background: rgba(255, 255, 255, 0.15);
}

.dropdown-arrow {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.user-info-dropdown {
  padding: 8px 0;
  min-width: 140px;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 6px;
}

.user-contact {
  font-size: 12px;
  color: #606266;
  line-height: 1.8;
  margin-bottom: 4px;
}
.user-contact .el-icon {
  margin-right: 4px;
  color: #909399;
}

.user-role {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

/* 主容器 */
.main-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 侧边栏 */
.sidebar {
  width: 200px;
  background: #fff;
  box-shadow: 1px 0 4px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-nav {
  flex: 1;
  padding: 16px 0;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  margin: 4px 12px;
  border-radius: 8px;
  color: #606266;
  cursor: pointer;
  transition: all 0.2s;
  gap: 12px;
}

.nav-item:hover {
  background: #f0f9eb;
  color: #2E7D32;
}

.nav-item.active {
  background: #e8f5e9;
  color: #2E7D32;
  font-weight: 500;
}

.nav-label {
  font-size: 14px;
}

/* 侧边栏底部 - 身份切换 */
.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #ebeef5;
}

.role-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.role-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
  background: #f5f7fa;
  cursor: pointer;
  transition: all 0.2s;
}

.role-option:hover {
  background: #e8f5e9;
  color: #2E7D32;
}

.role-option.active {
  background: #2E7D32;
  color: #fff;
}

/* 子菜单箭头 */
.submenu-arrow {
  margin-left: auto;
  transition: transform 0.2s;
  font-size: 12px;
  color: #909399;
}

.submenu-arrow.rotated {
  transform: rotate(180deg);
}

/* 子菜单容器 */
.submenu {
  padding: 4px 0;
}

/* 子菜单项 */
.nav-sub-item {
  padding: 10px 20px 10px 48px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-sub-item:hover {
  background: #f0f9eb;
  color: #2E7D32;
}

.nav-sub-item.active {
  background: #e8f5e9;
  color: #2E7D32;
  font-weight: 500;
}

/* 主内容区 */
.content-area {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

</style>
