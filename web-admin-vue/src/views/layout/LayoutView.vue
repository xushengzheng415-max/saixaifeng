<template>
  <div class="layout">
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
      <aside v-if="!usesWorkspaceShell" class="sidebar">
        <button
          class="sidebar-brand"
          type="button"
          :aria-label="`${organizationBrand.name}，返回赛事管理`"
          @click="router.push('/tournament-space')"
        >
          <span class="organization-logo">
            <img
              :src="organizationBrand.logo"
              :alt="`${organizationBrand.name} Logo`"
              @error="handleOrganizationLogoError"
            />
          </span>
          <span class="organization-name">{{ organizationBrand.name }}</span>
        </button>

        <nav class="sidebar-nav">
          <template v-for="item in currentNavItems" :key="item.path">
            <!-- 有子菜单 -->
            <template v-if="item.children">
              <div
                class="nav-item"
                :class="{ active: isItemActive(item) || isChildActive(item.path) }"
                @click="toggleSubMenu(item)"
              >
                <el-icon :size="22"><component :is="item.icon" /></el-icon>
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
                :class="{ active: isItemActive(item) }"
                @click="handleNavClick(item)"
              >
                <el-icon :size="22"><component :is="item.icon" /></el-icon>
                <span class="nav-label">{{ item.label }}</span>
              </div>
            </template>
          </template>
        </nav>

        <div v-if="route.path.includes('/draw')" class="sidebar-pro-badge">♛　PRO 专业版 · 已开通</div>
        <div class="sidebar-support">由赛小蜂足球提供技术支持</div>
      </aside>

      <section class="workspace">
        <!-- 顶部工具栏 -->
        <header v-if="usesWorkspaceShell" class="workspace-shell-header">
          <button class="product-brand" type="button" aria-label="返回赛事空间" @click="router.push('/tournament-space')">
            <img :src="productLogo" alt="赛小蜂足球" />
          </button>
          <div class="workspace-shell-actions">
            <button class="header-action" type="button" @click="openHelpCenter"><el-icon><QuestionFilled /></el-icon><span>帮助中心</span></button>
            <button class="notification-action" type="button" aria-label="查看通知" @click="showNotifications"><el-icon><Bell /></el-icon><i v-if="unreadNotificationCount">{{ unreadNotificationCount }}</i></button>
            <el-dropdown trigger="click" @command="handleUserCommand">
              <div class="workspace-user">
                <el-avatar v-if="userInfo.avatarUrl" :size="38" :src="userInfo.avatarUrl" />
                <el-avatar v-else :size="38" class="workspace-user-avatar">{{ userInfo.userName ? userInfo.userName.charAt(0) : '蜂' }}</el-avatar>
                <span>{{ userInfo.userName || '主办方管理员' }}</span>
                <el-icon><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="refresh"><el-icon><Refresh /></el-icon>刷新数据</el-dropdown-item>
                  <el-dropdown-item divided command="logout"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </header>
        <header v-else-if="!usesEmbeddedPageHeader" class="top-header">
          <div class="header-left">
            <span class="page-title">{{ currentPageTitle }}</span>
          </div>
          <div class="header-right">
            <div class="header-role">主办方管理</div>
            <span class="header-divider" aria-hidden="true"></span>
            <el-dropdown trigger="click" @command="handleUserCommand">
              <div class="user-avatar-wrapper">
                <el-avatar v-if="userInfo.avatarUrl" :size="36" :src="userInfo.avatarUrl" />
                <el-avatar v-else :size="36" class="user-avatar-fallback">
                  {{ userInfo.userName ? userInfo.userName.charAt(0) : '?' }}
                </el-avatar>
                <span class="header-user-name">{{ userInfo.userName || '主办方管理员' }}</span>
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

        <!-- 主内容区 -->
        <main class="content-area" :class="{ 'workspace-shell-content': usesWorkspaceShell, 'embedded-header-content': usesEmbeddedPageHeader }">
          <div class="admin-content-frame">
            <router-view />
          </div>
        </main>
      </section>
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
  Postcard, Place, QuestionFilled, Bell
} from '@element-plus/icons-vue'
import { logout, queryById, queryList } from '../../utils/cloud'
import productLogo from '../../assets/logo-saixiaofeng.png'
import {
  ROLE_NAMES,
  ROLES
} from '../../utils/permissions'

const WEB_LOGIN_API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'

const router = useRouter()
const route = useRoute()
const usesWorkspaceShell = computed(() => route.meta.workspaceShell === true)
const usesEmbeddedPageHeader = computed(() => route.meta.embeddedPageHeader === true)
const unreadNotificationCount = ref(0)

function openHelpCenter() {
  window.open('https://www.sxffootball.cn/#features', '_blank', 'noopener,noreferrer')
}

function showNotifications() {
  ElMessage.info(unreadNotificationCount.value ? `你有 ${unreadNotificationCount.value} 条未读通知` : '暂无新通知')
}

// 用户信息
function readStoredObject(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || {} } catch { return {} }
}
const initialStoredUser = readStoredObject('userInfo')
const initialStoredOrganization = readStoredObject('currentOrganization')
const userInfo = ref({
  userName: initialStoredUser.userName || '',
  avatarUrl: initialStoredUser.avatarUrl || '',
  phone: initialStoredUser.phone || '',
  email: initialStoredUser.email || '',
  organizationName: initialStoredOrganization.name || initialStoredOrganization.organizationName || initialStoredUser.organizationName || '',
  organizationLogo: initialStoredOrganization.logo || initialStoredOrganization.logoUrl || initialStoredUser.organizationLogo || '',
  isPlatformOwner: initialStoredUser.isPlatformOwner === true
})
const loginType = ref('')
const currentRole = ref('')
const isHeadReferee = ref(false)
const DEFAULT_ORGANIZATION_LOGO = `${import.meta.env.BASE_URL}organization-logo-placeholder.svg`

const organizationBrand = computed(() => ({
  name: userInfo.value.organizationName || '未建立机构',
  logo: userInfo.value.organizationLogo || DEFAULT_ORGANIZATION_LOGO
}))

function handleOrganizationLogoError(event) {
  const image = event.currentTarget
  if (image && !image.src.endsWith(DEFAULT_ORGANIZATION_LOGO)) {
    image.src = DEFAULT_ORGANIZATION_LOGO
  }
}

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
            uid: infoRes.user._id,
            isPlatformOwner: infoRes.user.isPlatformOwner === true || userInfo.value.isPlatformOwner === true
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

const currentTournamentId = computed(() => String(route.params.id || ''))

function tournamentWorkspacePath(suffix = '') {
  return currentTournamentId.value
    ? `/tournaments/${currentTournamentId.value}${suffix}`
    : '/tournaments'
}

// 主办方 PC 端统一为一套赛事空间分类；赛事内入口会复用当前路由中的赛事上下文。
const organizerNavItems = computed(() => [
  {
    path: '/dashboard',
    label: '赛事主控制台',
    icon: 'HomeFilled',
    exact: true
  },
  {
    path: '/tournaments',
    label: '竞赛管理',
    icon: 'Trophy',
    activeWhen: () => route.path === '/tournaments' || route.path === '/tournaments/create'
  },
  {
    path: '/teams',
    label: '球队管理',
    icon: 'UserFilled',
    activeWhen: () => route.path.startsWith('/teams') || /\/tournaments\/[^/]+\/teams/.test(route.path)
  },
  {
    path: tournamentWorkspacePath('/draw'),
    label: '抽签与分组',
    icon: 'Grid',
    requiresTournament: true,
    activeWhen: () => route.path.includes('/draw')
  },
  {
    path: tournamentWorkspacePath('/schedule'),
    label: '赛程管理',
    icon: 'Calendar',
    requiresTournament: true,
    activeWhen: () => route.path.includes('/schedule')
  },
  {
    path: tournamentWorkspacePath(),
    label: '比赛管理',
    icon: 'Football',
    requiresTournament: true,
    activeWhen: () => Boolean(currentTournamentId.value) &&
      /\/tournaments\/[^/]+(?:\/match\/[^/]+)?$/.test(route.path)
  },
  {
    path: '/referees',
    label: '裁判管理',
    icon: 'SetUp',
    activeWhen: () => route.path.startsWith('/referees') || route.path.startsWith('/referee/')
  },
  {
    path: '/data',
    label: '数据中心',
    icon: 'DataAnalysis'
  },
  {
    path: tournamentWorkspacePath('/edit'),
    label: '赛事设置',
    icon: 'Setting',
    requiresTournament: true,
    activeWhen: () => route.path.includes('/edit')
  }
])

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
  { path: `${import.meta.env.BASE_URL}formation-designer.html`, label: '阵型设计器', icon: 'Place', external: true },
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
  const ownerOnly = (items) => userInfo.value.isPlatformOwner
    ? items
    : items.filter(item => item.path !== '/system')
  // 赛事中心管理页面使用超级管理后台导航
  if (isAdminPage.value) {
    return ownerOnly(adminNavItems)
  }
  if (currentRole.value === ROLES.COACH) {
    return coachNavItems
  }
  if (currentRole.value === ROLES.REFEREE) {
    return ownerOnly(refereeNavItems.value)
  }
  return ownerOnly(organizerNavItems.value)
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
  window.location.replace('https://www.sxffootball.cn/')
      break
  }
}

function handleNavClick(item) {
  if (item.external) {
    window.open(item.path, '_blank')
  } else if (item.requiresTournament && !currentTournamentId.value) {
    ElMessage.info('请先选择赛事，进入赛事空间后再使用此功能')
    router.push('/tournaments')
  } else {
    router.push(item.path)
  }
}

function isActive(path) {
  return route.path === path || route.path.startsWith(path + '/')
}

function isItemActive(item) {
  if (typeof item.activeWhen === 'function') return item.activeWhen()
  if (item.exact) return route.path === item.path
  return isActive(item.path)
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
      const storedOrganization = ['organizationInfo', 'currentOrganization', 'currentOrg']
        .map(key => {
          try {
            return JSON.parse(localStorage.getItem(key) || 'null')
          } catch (e) {
            return null
          }
        })
        .find(Boolean) || {}
      const organizationName = storedOrganization.name ||
        storedOrganization.organizationName ||
        parsed.organizationName ||
        parsed.orgName ||
        parsed.organizerName ||
        parsed.institutionName ||
        ''
      const organizationLogo = storedOrganization.logo ||
        storedOrganization.logoUrl ||
        storedOrganization.organizationLogo ||
        parsed.organizationLogo ||
        parsed.orgLogo ||
        parsed.organizerLogo ||
        parsed.institutionLogo ||
        ''
      userInfo.value = {
        userName: parsed.userName || '开发者',
        avatarUrl: parsed.avatarUrl || '',
        phone: parsed.phone || '',
        email: parsed.email || '',
        uid: parsed.uid || parsed._id || '',
        organizationName,
        organizationLogo,
        isPlatformOwner: parsed.isPlatformOwner === true
      }
      localStorage.setItem('userInfo', JSON.stringify({
        ...parsed,
        _id: parsed._id || parsed.uid || '',
        uid: parsed.uid || parsed._id || '',
        userName: parsed.userName || '微信用户',
        avatarUrl: parsed.avatarUrl || '',
        openid: parsed.openid || '',
        unionid: parsed.unionid || '',
        phone: parsed.phone || '',
        email: parsed.email || '',
        organizationName,
        organizationLogo,
        isPlatformOwner: parsed.isPlatformOwner === true
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
  height: 100vh;
  min-width: 1024px;
  color: #1f2937;
  background: #f6f8f7;
  overflow: hidden;
}

/* 主容器 */
.main-container {
  flex: 1;
  display: flex;
  min-width: 0;
  overflow: hidden;
}

/* 侧边栏 */
.sidebar {
  position: relative;
  z-index: 2;
  width: var(--admin-sidebar-width);
  color: #fff;
  font-family: "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  background:
    linear-gradient(180deg, rgba(0, 44, 31, 0.1), rgba(0, 64, 38, 0.18)),
    url('../../assets/images/organizer-sidebar.png') center / cover no-repeat,
    #003d2b;
  box-shadow: 4px 0 20px rgba(1, 39, 28, 0.12);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-brand {
  width: 100%;
  height: var(--admin-topbar-height);
  padding: 8px 16px;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  text-align: left;
  cursor: pointer;
}

.organization-logo {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.organization-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 3px 7px rgba(0, 25, 17, 0.24));
}

.organization-name {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  word-break: break-all;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.sidebar-nav {
  flex: 1;
  padding: 24px 14px 16px;
  overflow-x: hidden;
  overflow-y: auto;
}

.sidebar-pro-badge {
  flex-shrink: 0;
  margin: 0 14px 18px;
  padding: 13px 10px;
  border: 1px solid #f4c63d;
  border-radius: 7px;
  color: #ffd95e;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  box-shadow: 0 0 16px rgba(244, 198, 61, 0.08) inset;
}

.sidebar-support {
  flex-shrink: 0;
  margin: 0 18px;
  padding: 16px 0 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  letter-spacing: 0.02em;
}

.nav-item {
  display: flex;
  align-items: center;
  min-height: 54px;
  padding: 0 18px;
  margin: 0 0 8px;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
  gap: 14px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.nav-item.active {
  color: #fff;
  font-weight: 600;
  background: linear-gradient(135deg, #008b4e, #06a75e);
  box-shadow: 0 8px 20px rgba(0, 144, 80, 0.24);
}

.nav-label {
  font-size: 17px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

/* 子菜单箭头 */
.submenu-arrow {
  margin-left: auto;
  transition: transform 0.2s;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.64);
}

.submenu-arrow.rotated {
  transform: rotate(180deg);
}

/* 子菜单容器 */
.submenu {
  margin: -2px 0 8px;
  padding: 2px 0 2px 14px;
}

/* 子菜单项 */
.nav-sub-item {
  min-height: 38px;
  padding: 10px 16px 10px 42px;
  border-radius: 7px;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.68);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.nav-sub-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-sub-item.active {
  background: rgba(0, 171, 95, 0.18);
  color: #65e8a8;
  font-weight: 600;
}

.workspace {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.workspace-shell-header {
  height: 90px;
  padding: 0 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  border-bottom: 1px solid #e5e9e7;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 2px 12px rgba(20, 48, 34, 0.05);
}

.product-brand {
  width: 188px;
  height: 66px;
  padding: 5px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.product-brand img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: left center; }
.workspace-shell-actions,.workspace-user,.header-action,.notification-action { display: flex; align-items: center; }
.workspace-shell-actions { gap: 22px; }
.header-action,.notification-action { border: 0; color: #59645e; background: transparent; cursor: pointer; }
.header-action { gap: 7px; font-size: 14px; }
.header-action .el-icon,.notification-action { font-size: 21px; }
.notification-action { position: relative; justify-content: center; width: 34px; height: 34px; }
.notification-action i { position: absolute; right: -2px; top: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 10px; color: #fff; font-size: 11px; font-style: normal; line-height: 18px; background: #f04438; }
.workspace-user { gap: 9px; min-height: 46px; color: #4d5952; font-size: 14px; cursor: pointer; }
.workspace-user-avatar { color: #fff; background: #087b45; }

/* 顶部工具栏 */
.top-header {
  height: var(--admin-topbar-height);
  padding: 0 30px;
  background: rgba(255, 255, 255, 0.98);
  border-bottom: 1px solid #e5e9e7;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.header-left,
.header-right,
.user-avatar-wrapper {
  display: flex;
  align-items: center;
}

.header-left {
  min-width: 0;
  gap: 12px;
}

.page-title {
  overflow: hidden;
  color: #28332d;
  font-size: 16px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  flex-shrink: 0;
  gap: 16px;
}

.header-role {
  color: #6b7280;
  font-size: 14px;
}

.header-divider {
  width: 1px;
  height: 24px;
  background: #e3e8e5;
}

.user-avatar-wrapper {
  gap: 10px;
  min-height: 44px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.user-avatar-wrapper:hover {
  background: #f3f7f5;
}

.user-avatar-fallback {
  color: #fff;
  background: #087a45;
  font-size: 14px;
}

.header-user-name {
  max-width: 140px;
  overflow: hidden;
  color: #28332d;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-arrow {
  color: #7a847f;
  font-size: 12px;
}

.user-info-dropdown {
  min-width: 160px;
  padding: 8px 0;
}

.user-name {
  margin-bottom: 6px;
  color: #303133;
  font-size: 14px;
  font-weight: 500;
}

.user-role {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

/* 主内容区 */
.content-area {
  min-width: 0;
  flex: 1;
  padding: var(--admin-content-gutter-y) var(--admin-content-gutter-x) 32px;
  background: #f6f8f7;
  overflow-y: auto;
}

.content-area.workspace-shell-content { padding: 0 0 32px; }
.workspace-shell-content .admin-content-frame { width: 100%; max-width: none; }
.content-area.embedded-header-content { padding-top: 0; }

.admin-content-frame {
  width: min(100%, var(--admin-content-max-width));
  min-width: 0;
  min-height: 100%;
  margin: 0 auto;
}

@media (max-width: 1280px) {
  .top-header {
    padding-inline: 24px;
  }

  .content-area {
    padding-inline: 22px;
  }
}

</style>
