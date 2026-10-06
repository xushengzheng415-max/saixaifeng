<template>
  <div class="layout">
    <el-dialog
      v-model="bindPhoneVisible"
      title="绑定手机号"
      width="400px"
      :close-on-click-modal="false"
    >
      <div class="phone-bind-note">手机号验证后不可直接更换。</div>
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
        <el-button @click="bindPhoneVisible=false">取消</el-button>
        <el-button type="primary" @click="confirmBindPhone">确认绑定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="profileDialogVisible" title="修改个人资料" width="440px">
      <el-form label-position="top">
        <el-form-item label="账号显示名称"><el-input v-model.trim="profileForm.nickname" maxlength="30" placeholder="请输入姓名或显示名称" /></el-form-item>
        <el-form-item label="手机号">
          <div class="profile-phone-row" v-loading="accountProfileLoading">
            <span>{{ accountPhoneMasked || '未绑定' }}</span>
            <el-tag v-if="accountPhoneVerified" type="success" size="small">已验证</el-tag>
            <el-button v-else link type="primary" @click="openPhoneBinding">绑定手机号</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="profile-dialog-footer">
          <el-button v-if="!userInfo.isPlatformOwner" link type="danger" :loading="accountDeleting" @click="deleteCurrentAccount">注销PC</el-button>
          <div><el-button @click="profileDialogVisible=false">取消</el-button><el-button type="primary" :loading="profileSubmitting" @click="saveProfile">保存个人资料</el-button></div>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="organizationDialogVisible" title="修改机构资料" width="560px">
      <el-form label-position="top"><el-form-item label="机构名称"><el-input v-model.trim="organizationForm.name" maxlength="80" /></el-form-item><el-form-item label="机构类型"><el-select v-model="organizationForm.organizationType"><el-option v-for="item in organizationTypeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item><div class="account-location-grid"><el-form-item label="所在省份"><el-select v-model="organizationForm.provinceCode" filterable @change="organizationForm.city=''"><el-option v-for="item in provinceOptions" :key="item.code" :label="item.name" :value="item.code" /></el-select></el-form-item><el-form-item label="所在城市"><el-select v-model="organizationForm.city" filterable :disabled="!organizationForm.provinceCode"><el-option v-for="item in organizationCityOptions" :key="item.code" :label="item.name" :value="item.name" /></el-select></el-form-item></div></el-form>
      <template #footer><el-button @click="organizationDialogVisible=false">取消</el-button><el-button type="primary" :loading="organizationSubmitting" @click="saveOrganization">保存机构资料</el-button></template>
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

      </aside>

      <section class="workspace">
        <!-- 顶部工具栏 -->
        <header v-if="usesWorkspaceShell" class="workspace-shell-header">
          <button class="product-brand" type="button" aria-label="返回赛事空间" @click="router.push('/tournament-space')">
            <img :src="productLogo" alt="赛小蜂足球" />
          </button>
          <div class="workspace-shell-actions">
            <el-button v-if="isTournamentStaff && route.path !== '/tournament-space'" plain @click="returnToTournamentSpace">返回赛事空间</el-button>
            <button class="header-action" type="button" @click="openHelpCenter"><el-icon><QuestionFilled /></el-icon><span>帮助中心</span></button>
            <button class="notification-action" type="button" :aria-label="pendingStaffInvitationCount ? '查看共享赛事邀请' : '查看站内信'" :title="pendingStaffInvitationCount ? '有共享赛事邀请待接受' : '站内信'" @click="showNotifications"><el-icon><Bell /></el-icon><span>{{ pendingStaffInvitationCount ? '赛事邀请' : '站内信' }}</span><b v-if="unreadNotificationCount" class="notification-count">{{ unreadNotificationCount > 99 ? '99+' : unreadNotificationCount }}</b></button>
            <el-dropdown trigger="click" @command="handleUserCommand">
              <div class="workspace-user">
                <el-avatar v-if="userInfo.avatarUrl" :size="38" :src="userInfo.avatarUrl" />
                <el-avatar v-else :size="38" class="workspace-user-avatar">{{ userInfo.userName ? userInfo.userName.charAt(0) : '蜂' }}</el-avatar>
                <span class="workspace-account-copy"><strong>{{ accountDisplayName }}</strong><small>{{ organizationDisplayName }}</small></span>
                <el-icon><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item disabled><div class="account-dropdown-summary"><strong>{{ organizationDisplayName }}</strong><span>{{ accountDisplayName }} · 机构负责人</span><span>{{ accountPhoneSummary }}</span></div></el-dropdown-item>
                  <el-dropdown-item v-if="!isPlatformContext()" divided command="profile"><el-icon><User /></el-icon>修改个人资料</el-dropdown-item>
                  <el-dropdown-item v-if="!isPlatformContext()" command="organization"><el-icon><Postcard /></el-icon>修改机构资料</el-dropdown-item>
                  <el-dropdown-item v-if="!isPlatformContext()" command="account-management"><el-icon><UserFilled /></el-icon>{{ accountManagementLabel }}</el-dropdown-item>
                  <el-dropdown-item command="refresh"><el-icon><Refresh /></el-icon>刷新数据</el-dropdown-item>
                  <el-dropdown-item divided command="logout"><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </header>
        <header v-else-if="!usesEmbeddedPageHeader" class="top-header">
          <div class="header-left">
            <el-button v-if="isTournamentStaff && route.path !== '/tournament-space'" link type="primary" @click="returnToTournamentSpace">返回赛事空间</el-button>
            <span class="page-title">{{ currentPageTitle }}</span>
          </div>
          <div class="header-right">
            <div class="header-role">{{ isPlatformContext() ? '平台运营' : '主办方管理' }}</div>
            <span class="header-divider" aria-hidden="true"></span>
            <el-dropdown trigger="click" @command="handleUserCommand">
              <div class="user-avatar-wrapper">
                <el-avatar v-if="userInfo.avatarUrl" :size="36" :src="userInfo.avatarUrl" />
                <el-avatar v-else :size="36" class="user-avatar-fallback">
                  {{ userInfo.userName ? userInfo.userName.charAt(0) : '?' }}
                </el-avatar>
                <span class="header-account-copy"><strong>{{ accountDisplayName }}</strong><small>{{ organizationDisplayName }}</small></span>
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
                      <div class="user-phone-summary">{{ accountPhoneSummary }}</div>
                    </div>
                  </el-dropdown-item>
                  <el-dropdown-item v-if="!isPlatformContext()" command="profile"><el-icon><User /></el-icon>修改个人资料</el-dropdown-item>
                  <el-dropdown-item v-if="!isPlatformContext()" command="organization"><el-icon><Postcard /></el-icon>修改机构资料</el-dropdown-item>
                  <el-dropdown-item v-if="!isPlatformContext()" command="account-management"><el-icon><UserFilled /></el-icon>{{ accountManagementLabel }}</el-dropdown-item>
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
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Refresh, SwitchButton, ArrowDown, Phone, Warning, Message,
  Trophy, UserFilled, User, SetUp, Picture, FirstAidKit, ShoppingBag,
  Postcard, Place, QuestionFilled, Bell
} from '@element-plus/icons-vue'
import { logout, queryById, queryList, callFunction } from '../../utils/cloud'
import { getPlatformSession, isPlatformContext, PLATFORM_LOGIN_TYPE } from '../../utils/platformSession'
import productLogo from '../../assets/logo-saixiaofeng.png'
import { provincesData, cityMapData } from '../team/areaData.js'
import {
  ROLE_NAMES,
  ROLES
} from '../../utils/permissions'

const WEB_LOGIN_API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
const LAYOUT_BOOTSTRAP_CACHE_KEY = 'sxfLayoutBootstrapAt'
const LAYOUT_BOOTSTRAP_CACHE_TTL = 5 * 60 * 1000

const router = useRouter()
const route = useRoute()
const usesWorkspaceShell = computed(() => route.meta.workspaceShell === true)
const usesEmbeddedPageHeader = computed(() => route.meta.embeddedPageHeader === true)
const unreadNotificationCount = ref(0)
const pendingStaffInvitationCount = ref(0)
const accountManagementLabel = computed(() => pendingStaffInvitationCount.value
  ? `账号管理（待接受 ${pendingStaffInvitationCount.value}）`
  : '账号管理')

function openHelpCenter() {
  router.push(userInfo.value.isPlatformOwner === true ? '/system' : '/assistance')
}

function showNotifications() {
  router.push(pendingStaffInvitationCount.value ? '/tournament-staff' : '/messages')
}
async function refreshUnreadNotificationCount() {
  if (isPlatformContext()) return
  const [inbox, invitations] = await Promise.allSettled([
    callFunction('onboardingWorkspace', { action: 'organizerInboxList' }),
    callFunction('tournamentStaffAccess', { action: 'invitations' })
  ])
  const inboxResult = inbox.status === 'fulfilled' ? inbox.value : null
  const invitationResult = invitations.status === 'fulfilled' ? invitations.value : null
  if (invitations.status === 'fulfilled') {
    pendingStaffInvitationCount.value = invitationResult?.success && Array.isArray(invitationResult.invitations)
      ? invitationResult.invitations.length
      : 0
  }
  if (inboxResult?.success || invitationResult?.success) {
    unreadNotificationCount.value = Number(inboxResult?.data?.unreadCount || 0) + pendingStaffInvitationCount.value
  }
}
function handleInboxUpdated() { void refreshUnreadNotificationCount() }
function handleInboxVisibility() {
  if (document.visibilityState === 'visible') void refreshUnreadNotificationCount()
}

// 用户信息
function readStoredObject(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || {} } catch { return {} }
}
const initialStoredUser = isPlatformContext() ? (getPlatformSession()?.user || {}) : readStoredObject('userInfo')
const initialStoredOrganization = isPlatformContext() ? {} : readStoredObject('currentOrganization')
const userInfo = ref({
  userName: initialStoredUser.userName || initialStoredUser.nickname || '',
  avatarUrl: initialStoredUser.avatarUrl || '',
  phone: initialStoredUser.phone || '',
  email: initialStoredUser.email || '',
  organizationName: isPlatformContext() ? '平台运营中心' : (initialStoredOrganization.name || initialStoredOrganization.organizationName || initialStoredUser.organizationName || ''),
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
const accountDisplayName = computed(() => userInfo.value.userName || '主办方管理员')
const organizationDisplayName = computed(() => userInfo.value.organizationName || '尚未建立机构')
const accountPhoneMasked = ref('')
const accountPhoneVerified = ref(false)
const accountProfileLoading = ref(false)
const accountPhoneSummary = computed(() => accountPhoneMasked.value || maskAccountPhone(userInfo.value.phone) || '手机号未绑定')
const profileDialogVisible = ref(false)
const organizationDialogVisible = ref(false)
const profileSubmitting = ref(false)
const accountDeleting = ref(false)
const organizationSubmitting = ref(false)
const profileForm = reactive({ nickname: '' })
const organizationForm = reactive({ name: '', organizationType: '', provinceCode: '', city: '' })
const organizationRecord = ref(initialStoredOrganization || {})
const organizationTypeOptions = [{ value:'event_company', label:'赛事公司' }, { value:'club', label:'足球俱乐部' }, { value:'school', label:'学校' }, { value:'association', label:'足协/体育组织' }, { value:'other', label:'其他机构' }]
const provinceOptions = provincesData
const organizationCityOptions = computed(() => cityMapData[organizationForm.provinceCode] || [])

function layoutBootstrapIdentity() {
  const stored = readStoredObject('userInfo')
  return String(stored._id || stored.uid || localStorage.getItem('userId') || '')
}

function shouldLoadLayoutBootstrap() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(LAYOUT_BOOTSTRAP_CACHE_KEY) || 'null')
    return !cached || cached.identity !== layoutBootstrapIdentity() || Date.now() - Number(cached.loadedAt || 0) > LAYOUT_BOOTSTRAP_CACHE_TTL
  } catch {
    return true
  }
}

function markLayoutBootstrapLoaded() {
  sessionStorage.setItem(LAYOUT_BOOTSTRAP_CACHE_KEY, JSON.stringify({
    identity: layoutBootstrapIdentity(),
    loadedAt: Date.now()
  }))
}

function clearLayoutBootstrapCache() {
  sessionStorage.removeItem(LAYOUT_BOOTSTRAP_CACHE_KEY)
}

function persistWorkspaceOrganization(organization) {
  if (!organization) return
  const id = organization.id || organization._id || ''
  const name = organization.name || organization.organizationName || ''
  organizationRecord.value = { ...organization, id, name }
  userInfo.value.organizationName = name
  userInfo.value.organizationLogo = organization.logo || organization.logoUrl || organization.organizationLogo || userInfo.value.organizationLogo
  localStorage.setItem('currentOrganization', JSON.stringify(organizationRecord.value))
  const storedUser = readStoredObject('userInfo')
  localStorage.setItem('userInfo', JSON.stringify({ ...storedUser, orgId:id || storedUser.orgId, organizationId:id || storedUser.organizationId, organizationName:name, organizationLogo:userInfo.value.organizationLogo }))
}

async function loadWorkspaceAccount() {
  try {
    const result = await callFunction('onboardingWorkspace', { action:'state' })
    if (result?.success && result.organization) persistWorkspaceOrganization(result.organization)
  } catch (error) {
    console.warn('读取机构资料失败:', error.message || error)
  }
}

function maskAccountPhone(value) {
  const phone = String(value || '').replace(/\D/g, '')
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : ''
}
async function loadCurrentAccountProfile() {
  accountProfileLoading.value = true
  try {
    const result = await callFunction('getCurrentAccountProfile')
    if (!result?.success) throw new Error(result?.error || '手机号状态读取失败')
    const account = result.user || {}
    accountPhoneMasked.value = account.phoneMasked || maskAccountPhone(account.phone)
    accountPhoneVerified.value = account.phoneVerified === true
    if (account.phone) {
      userInfo.value.phone = account.phone
      const stored = readStoredObject('userInfo')
      localStorage.setItem('userInfo', JSON.stringify({ ...stored, phone:account.phone, phoneNumber:account.phone }))
    }
  } catch (error) {
    accountPhoneMasked.value = maskAccountPhone(userInfo.value.phone)
    accountPhoneVerified.value = Boolean(accountPhoneMasked.value)
    ElMessage.error(error.message || '手机号状态读取失败')
  } finally {
    accountProfileLoading.value = false
  }
}
function openProfileDialog() {
  profileForm.nickname = accountDisplayName.value
  accountPhoneMasked.value = maskAccountPhone(userInfo.value.phone)
  accountPhoneVerified.value = Boolean(accountPhoneMasked.value)
  profileDialogVisible.value = true
  loadCurrentAccountProfile()
}
function openPhoneBinding() {
  if (accountPhoneVerified.value) return
  bindForm.value = { phone: '', code: '' }
  profileDialogVisible.value = false
  bindPhoneVisible.value = true
}
async function openContactInfoFromNotice() {
  const target = route.query.openContactInfo
  if (target !== 'profile' && target !== 'organization') return
  if (target === 'organization' && !organizationRecord.value.id) await loadWorkspaceAccount()
  const query = { ...route.query }
  delete query.openContactInfo
  router.replace({ path: route.path, query })
  if (target === 'organization') openOrganizationDialog()
  else openProfileDialog()
}
watch(() => route.query.openContactInfo, value => {
  if (value === 'profile' || value === 'organization') void openContactInfoFromNotice()
})
function openOrganizationDialog() {
  const organization = organizationRecord.value || {}
  organizationForm.name = organization.name || organization.organizationName || organizationDisplayName.value
  organizationForm.organizationType = organization.organizationType || ''
  organizationForm.provinceCode = organization.provinceCode || ''
  organizationForm.city = organization.city || ''
  organizationDialogVisible.value = true
}
async function saveProfile() {
  if (!profileForm.nickname || profileSubmitting.value) return ElMessage.warning('请输入账号显示名称')
  profileSubmitting.value = true
  try {
    const result = await callFunction('onboardingWorkspace', { action:'updateProfile', nickname:profileForm.nickname })
    if (!result?.success) throw new Error(result?.message || '保存失败')
    userInfo.value.userName = result.user?.nickname || profileForm.nickname
    const storedUser = readStoredObject('userInfo')
    localStorage.setItem('userInfo', JSON.stringify({ ...storedUser, userName:userInfo.value.userName, nickname:userInfo.value.userName }))
    profileDialogVisible.value = false
    ElMessage.success('个人资料已更新')
  } catch (error) { ElMessage.error(error.message || '保存失败') } finally { profileSubmitting.value = false }
}
async function deleteCurrentAccount() {
  if (accountDeleting.value) return
  try {
    const confirmation = await ElMessageBox.prompt(
      '仅解除PC微信、服务号绑定和网页会话；小程序、机构和球队不受影响。请输入“注销PC”确认。',
      '注销账号',
      {
        confirmButtonText: '确认注销',
        cancelButtonText: '取消',
        type: 'error',
        inputPattern: /^注销PC$/,
        inputErrorMessage: '请输入“注销PC”'
      }
    )
    accountDeleting.value = true
    const result = await callFunction('deleteCurrentAccount', { confirmText: confirmation.value })
    if (!result?.success) throw new Error(result?.error || '账号注销失败')
    await logout()
    ElMessage.success('PC账号已注销，小程序不受影响')
    window.location.replace('https://www.sxffootball.cn/')
  } catch (error) {
    if (!['cancel', 'close'].includes(error)) ElMessage.error(error.message || '账号注销失败')
  } finally {
    accountDeleting.value = false
  }
}
async function saveOrganization() {
  if (organizationSubmitting.value) return
  if (organizationForm.name.length < 2 || !organizationForm.organizationType || !organizationForm.provinceCode || !organizationForm.city) return ElMessage.warning('请完整填写机构资料')
  organizationSubmitting.value = true
  try {
    const province = provinceOptions.find(item => item.code === organizationForm.provinceCode)?.name || ''
    const result = await callFunction('onboardingWorkspace', { action:'updateOrganization', ...organizationForm, province })
    if (!result?.success) throw new Error(result?.message || '保存失败')
    persistWorkspaceOrganization(result.organization)
    organizationDialogVisible.value = false
    ElMessage.success('机构资料已更新')
  } catch (error) { ElMessage.error(error.message || '保存失败') } finally { organizationSubmitting.value = false }
}

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
  if (!isPhoneValid.value) return ElMessage.warning('请输入正确的手机号')
  try {
    const res = await callFunction('sendCurrentUserPhoneBindSms', { phoneNumber:bindForm.value.phone })
    if (!res?.success) throw new Error(res?.error || '验证码发送失败')
    ElMessage.success('验证码已发送')
    countdown.value = 60
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) clearInterval(countdownTimer)
    }, 1000)
  } catch (error) {
    ElMessage.error(error.message || '验证码发送失败')
  }
}

// 确认绑定手机号
async function confirmBindPhone() {
  if (!isPhoneValid.value) return ElMessage.warning('请输入正确的手机号')
  if (!/^\d{6}$/.test(String(bindForm.value.code || ''))) return ElMessage.warning('请输入6位验证码')
  try {
    const res = await callFunction('bindCurrentUserPhone', {
      phoneNumber:bindForm.value.phone,
      smsCode:bindForm.value.code
    })
    if (!res?.success) throw new Error(res?.error || '手机号绑定失败')
    const phone = String(res.user?.phone || bindForm.value.phone)
    userInfo.value.phone = phone
    accountPhoneMasked.value = res.user?.phoneMasked || maskAccountPhone(phone)
    accountPhoneVerified.value = true
    const stored = readStoredObject('userInfo')
    localStorage.setItem('userInfo', JSON.stringify({ ...stored, phone, phoneNumber:phone }))
    localStorage.setItem('phone', phone)
    localStorage.setItem('phoneNumber', phone)
    bindPhoneVisible.value = false
    bindForm.value = { phone:'', code:'' }
    profileDialogVisible.value = true
    ElMessage.success('手机号已绑定')
  } catch (error) {
    ElMessage.error(error.message || '手机号绑定失败')
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
      body: JSON.stringify({ action: 'emailSendCode', email, purpose: 'bind' })
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
      body: JSON.stringify({ action: 'emailBindEmail', userId, email: bindEmailForm.value.email, code: bindEmailForm.value.code })
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

const roleLabel = computed(() => isPlatformContext() ? '平台管理员' : (ROLE_NAMES[currentRole.value] || '未知'))

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

// PC 当前只保留主办方正式赛事空间；教练业务由小程序承接。
const coachNavItems = [{ path: '/tournament-space', label: '赛事空间', icon: 'Trophy' }]

const currentTournamentId = computed(() => String(route.params.id || ''))

function tournamentWorkspacePath(suffix = '') {
  return currentTournamentId.value
    ? `/tournaments/${currentTournamentId.value}${suffix}`
    : '/tournaments'
}

// 主办方 PC 端统一为一套赛事空间分类；赛事内入口会复用当前路由中的赛事上下文。
const organizerNavItems = computed(() => [
  {
    path: tournamentWorkspacePath(),
    label: '赛事主控制台',
    icon: 'HomeFilled',
    requiresTournament: true,
    activeWhen: () => Boolean(currentTournamentId.value) && /^\/tournaments\/[^/]+$/.test(route.path)
  },
  {
    path: tournamentWorkspacePath('/competition'),
    label: '竞赛管理',
    icon: 'Trophy',
    requiresTournament: true,
    activeWhen: () => /\/tournaments\/[^/]+\/competition(?:\/create)?$/.test(route.path)
  },
  {
    path: tournamentWorkspacePath('/registration'),
    label: '报名管理',
    icon: 'Postcard',
    requiresTournament: true,
    activeWhen: () => /\/tournaments\/[^/]+\/registration$/.test(route.path) || (route.query.from === 'registration' && /\/tournaments\/[^/]+\/teams\//.test(route.path))
  },
  {
    path: tournamentWorkspacePath('/teams'),
    label: '球队管理',
    icon: 'UserFilled',
    requiresTournament: true,
    activeWhen: () => /\/tournaments\/[^/]+\/teams/.test(route.path) && !(route.query.from === 'registration' && /\/tournaments\/[^/]+\/teams\//.test(route.path))
  },
  {
    path: tournamentWorkspacePath('/draw'),
    label: '抽签与分组',
    icon: 'Grid',
    requiresTournament: true,
    activeWhen: () => route.path.includes('/draw')
  },
  {
    path: tournamentWorkspacePath('/matches'),
    label: '比赛管理',
    icon: 'Football',
    requiresTournament: true,
    activeWhen: () => Boolean(currentTournamentId.value) &&
      /\/tournaments\/[^/]+\/(?:matches|schedule|match\/[^/]+(?:\/monitor|\/post-match|\/review)?)$/.test(route.path)
  },
  {
    path: tournamentWorkspacePath('/results'),
    label: '赛果管理',
    icon: 'DataAnalysis',
    requiresTournament: true,
    activeWhen: () => /\/tournaments\/[^/]+\/results(?:\/match\/[^/]+\/archive)?$/.test(route.path)
  },
  {
    path: tournamentWorkspacePath('/news'),
    label: '新闻中心',
    icon: 'Document',
    requiresTournament: true,
    activeWhen: () => /\/tournaments\/[^/]+\/news$/.test(route.path)
  },
  {
    path: tournamentWorkspacePath('/referees'),
    label: '裁判管理',
    icon: 'SetUp',
    requiresTournament: true,
    activeWhen: () => /\/tournaments\/[^/]+\/referees$/.test(route.path)
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
const refereeNavItems = computed(() => [{ path: '/tournament-space', label: '赛事空间', icon: 'Trophy' }])

// 赛事中心超级管理后台导航
const adminNavItems = [
  {path:'/data-center',label:'数据中心',icon:'DataAnalysis'},
  { path: '/tournament-center-admin', label: '平台运营中心', icon: 'Picture' },
  { path: '/admin/tournaments', label: '赛事列表', icon: 'Trophy' },
  { path: '/admin/teams', label: '球队列表', icon: 'UserFilled' },
  { path: `${import.meta.env.BASE_URL}formation-designer.html`, label: '阵型设计器', icon: 'Place', external: true },
  { path: '/shop-admin', label: '商城管理', icon: 'ShoppingBag' },
  { path: '/insurance-admin', label: '保险业务', icon: 'FirstAidKit' },
  { path: '/tournament-center-admin?section=support', label: '问题与协助', icon: 'Setting' }
]

// 是否是赛事中心管理页面
const isAdminPage = computed(() => {
  return (route.path === '/data-center' && userInfo.value.isPlatformOwner === true) || route.path.startsWith('/tournament-center-admin') ||
         route.path.startsWith('/admin/') ||
         (route.path === '/system' && userInfo.value.isPlatformOwner === true)
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
    case 'profile':
      openProfileDialog()
      break
    case 'organization':
      openOrganizationDialog()
      break
    case 'account-management':
      router.push('/tournament-staff')
      break
    case 'refresh':
      clearLayoutBootstrapCache()
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

async function returnToTournamentSpace() {
  const ownOrgId = String(userInfo.value.orgId || userInfo.value.organizationId || '')
  if (isTournamentStaff.value && ownOrgId) {
    try {
      const activated = await callFunction('tournamentStaffAccess', { action: 'activateOrganizerWorkspace', orgId: ownOrgId })
      if (!activated?.success) throw new Error(activated?.error || activated?.message || '无法切换到自己的机构')
    } catch (error) {
      ElMessage.error(error.message || '无法切换到自己的机构')
      return
    }
  }
  router.push('/tournament-space')
}

function handleNavClick(item) {
  if (item.external) {
    window.open(item.path, '_blank')
  } else if (item.requiresTournament && !currentTournamentId.value) {
    ElMessage.info('请先选择赛事，进入赛事空间后再使用此功能')
    router.push('/tournament-space')
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
  if (isPlatformContext()) {
    const platformUser = getPlatformSession()?.user || {}
    userInfo.value = {
      userName: platformUser.userName || '平台负责人',
      avatarUrl: '',
      phone: '',
      email: platformUser.email || '',
      uid: platformUser._id || 'platform-owner',
      organizationName: '平台运营中心',
      organizationLogo: '',
      isPlatformOwner: true
    }
    loginType.value = PLATFORM_LOGIN_TYPE
    currentRole.value = 'platform_owner'
    return
  }
  if (route.query.openContactInfo === 'profile' || route.query.openContactInfo === 'organization') {
    void openContactInfoFromNotice()
  }
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
        userName: parsed.userName || parsed.nickname || '微信用户',
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
        userName: parsed.userName || parsed.nickname || '微信用户',
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
  window.addEventListener('sxf-organizer-inbox-updated', handleInboxUpdated)
  document.addEventListener('visibilitychange', handleInboxVisibility)
  void refreshUnreadNotificationCount()
  if (shouldLoadLayoutBootstrap()) {
    // 机构状态和账号资料在会话内短时间稳定；菜单切换不需要重复等待这两次请求。
    Promise.all([loadWorkspaceAccount(), loadCurrentAccountProfile()]).finally(markLayoutBootstrapLoaded)
  } else {
    const phone = userInfo.value.phone || ''
    accountPhoneMasked.value = maskAccountPhone(phone)
    accountPhoneVerified.value = Boolean(accountPhoneMasked.value)
  }

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
  window.removeEventListener('sxf-organizer-inbox-updated', handleInboxUpdated)
  document.removeEventListener('visibilitychange', handleInboxVisibility)
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
.header-action .el-icon { font-size: 21px; }
.notification-action { justify-content: center; gap: 6px; min-height: 34px; padding: 0 10px; border: 1px solid #dce6df; border-radius: 6px; color: #34443a; font-size: 14px; white-space: nowrap; }
.notification-action:hover { border-color: #a9cdb5; background: #f5faf6; }
.notification-action .el-icon { color: #118a47; font-size: 17px; }
.notification-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 10px; color: #fff; font-size: 11px; font-weight: 600; line-height: 18px; background: #e5484d; }
.workspace-user { gap: 9px; min-height: 46px; color: #4d5952; font-size: 14px; cursor: pointer; }
.workspace-user-avatar { color: #fff; background: #087b45; }
.workspace-account-copy,.header-account-copy { display:flex; min-width:0; flex-direction:column; align-items:flex-start; gap:3px; line-height:1.15; }
.workspace-account-copy strong,.header-account-copy strong { max-width:150px; overflow:hidden; color:#26342c; font-size:14px; text-overflow:ellipsis; white-space:nowrap; }
.workspace-account-copy small,.header-account-copy small { max-width:180px; overflow:hidden; color:#738078; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
.account-dropdown-summary { display:flex; min-width:220px; flex-direction:column; gap:5px; padding:5px 0; }
.account-dropdown-summary strong { color:#1f3026; font-size:14px; }.account-dropdown-summary span { color:#758079; font-size:12px; }
.phone-bind-note { margin-bottom:14px; color:#66736b; font-size:13px; }
.profile-phone-row { display:flex; min-height:32px; align-items:center; gap:10px; }
.profile-phone-row>span { color:#26332c; font-size:15px; }
.profile-dialog-footer { display:flex; width:100%; align-items:center; justify-content:space-between; gap:12px; }
.account-location-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }.account-location-grid :deep(.el-select),.layout :deep(.el-dialog .el-select) { width:100%; }

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
@media (max-width:720px) { .account-location-grid { grid-template-columns:1fr; }.workspace-account-copy small { display:none; } }

</style>
