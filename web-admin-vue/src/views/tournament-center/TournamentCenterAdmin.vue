<template>
  <div class="content-admin">
    <div v-if="checkingPermission" class="permission-loading">
      <el-icon class="is-loading" :size="28"><Loading /></el-icon>
      <span>正在校验平台负责人权限…</span>
    </div>

    <template v-else>
      <header class="page-header">
        <div class="brand">
          <img :src="logoUrl" alt="赛小蜂足球" class="brand-logo" />
          <div>
            <h1>赛事中心内容后台</h1>
            <p>统一管理公开赛事中心的轮播与推荐内容</p>
          </div>
        </div>
        <div class="header-actions">
          <span class="current-user">{{ currentUserName }}</span>
          <el-button @click="loadOverview">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
          <el-button type="primary" plain @click="goBack">
            返回管理后台
          </el-button>
        </div>
      </header>

      <main class="page-main">
        <el-alert
          title="主办方账号由用户首次登录自动创建；本页仅提供账号概览，不在这里新增、停用或切换登录身份。"
          type="info"
          :closable="false"
          show-icon
          class="scope-alert"
        />

        <el-row :gutter="16" class="stats-row">
          <el-col v-for="item in statCards" :key="item.key" :xs="12" :sm="12" :lg="6">
            <div class="stat-card">
              <div class="stat-icon" :class="item.color">
                <el-icon><component :is="item.icon" /></el-icon>
              </div>
              <div>
                <div class="stat-value">{{ item.value }}</div>
                <div class="stat-label">{{ item.label }}</div>
              </div>
            </div>
          </el-col>
        </el-row>

        <el-card shadow="never" class="content-card">
          <el-tabs v-model="activeTab">
            <el-tab-pane label="轮播图" name="banners">
              <div class="section-header">
                <div>
                  <h2>首页轮播图</h2>
                  <p>停用后将不再作为公开内容展示。</p>
                </div>
                <el-button type="primary" @click="openBannerDialog()">
                  <el-icon><Plus /></el-icon>
                  添加轮播图
                </el-button>
              </div>

              <el-table :data="banners" v-loading="loading" border>
                <el-table-column label="图片" width="190">
                  <template #default="{ row }">
                    <button class="image-button" type="button" @click="previewImage(row.displayImageUrl)">
                      <img :src="row.displayImageUrl" :alt="row.title || '轮播图'" class="banner-image" />
                    </button>
                  </template>
                </el-table-column>
                <el-table-column prop="title" label="标题" min-width="160" />
                <el-table-column prop="link" label="跳转链接" min-width="210" show-overflow-tooltip />
                <el-table-column label="排序" width="120">
                  <template #default="{ row }">
                    <el-input-number
                      v-model="row.sort"
                      :min="0"
                      :max="999"
                      size="small"
                      controls-position="right"
                      @change="saveBannerQuick(row)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="100">
                  <template #default="{ row }">
                    <el-switch v-model="row.isActive" @change="saveBannerQuick(row)" />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="150" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" link @click="openBannerDialog(row)">编辑</el-button>
                    <el-button type="danger" link @click="removeBanner(row)">删除</el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty description="暂无轮播图" />
                </template>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="推荐赛事" name="featured">
              <div class="section-header">
                <div>
                  <h2>推荐赛事</h2>
                  <p>推荐内容按排序数字从小到大展示。</p>
                </div>
                <el-button type="primary" @click="openFeaturedDialog">
                  <el-icon><Plus /></el-icon>
                  添加推荐
                </el-button>
              </div>

              <el-table :data="featuredTournaments" v-loading="loading" border>
                <el-table-column prop="name" label="赛事名称" min-width="220" />
                <el-table-column prop="organizerName" label="主办方" min-width="150" />
                <el-table-column label="类型" width="120">
                  <template #default="{ row }">
                    <el-tag>{{ categoryText(row.category) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="110">
                  <template #default="{ row }">
                    <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="排序" width="120">
                  <template #default="{ row }">
                    <el-input-number
                      v-model="row.featuredSort"
                      :min="0"
                      :max="999"
                      size="small"
                      controls-position="right"
                      @change="updateFeatured(row, true)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="160" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" link @click="viewTournament(row)">查看</el-button>
                    <el-button type="danger" link @click="confirmRemoveFeatured(row)">取消推荐</el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty description="暂无推荐赛事" />
                </template>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="全部赛事" name="tournaments">
              <div class="section-header">
                <div>
                  <h2>赛事数据</h2>
                  <p>此处展示平台赛事概览，赛事业务编辑仍在主办方管理后台完成。</p>
                </div>
                <div class="filters">
                  <el-select v-model="categoryFilter" placeholder="全部类型" clearable>
                    <el-option
                      v-for="item in categories"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                    />
                  </el-select>
                  <el-input v-model="keyword" placeholder="搜索赛事名称" clearable>
                    <template #prefix><el-icon><Search /></el-icon></template>
                  </el-input>
                </div>
              </div>

              <el-table :data="filteredTournaments" v-loading="loading" border>
                <el-table-column prop="name" label="赛事名称" min-width="220" />
                <el-table-column prop="organizerName" label="主办方" min-width="150" />
                <el-table-column label="赛事类型" width="120">
                  <template #default="{ row }">{{ categoryText(row.category) }}</template>
                </el-table-column>
                <el-table-column label="赛制" width="110">
                  <template #default="{ row }">{{ formatText(row.formatType) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="110">
                  <template #default="{ row }">
                    <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="推荐" width="90">
                  <template #default="{ row }">
                    <el-tag :type="row.isFeatured ? 'success' : 'info'">
                      {{ row.isFeatured ? '已推荐' : '未推荐' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" link @click="viewTournament(row)">查看</el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty description="暂无赛事数据" />
                </template>
              </el-table>
            </el-tab-pane>

            <el-tab-pane label="主办方概览" name="organizers">
              <div class="section-header">
                <div>
                  <h2>主办方账号概览</h2>
                  <p>手机号已脱敏；账号创建和身份归一由统一登录流程负责。</p>
                </div>
              </div>

              <el-table :data="organizers" v-loading="loading" border>
                <el-table-column prop="name" label="主办方名称" min-width="190" />
                <el-table-column prop="contact" label="联系人" min-width="130" />
                <el-table-column prop="phone" label="手机号" width="140" />
                <el-table-column prop="email" label="邮箱" min-width="190" show-overflow-tooltip />
                <el-table-column prop="orgId" label="机构标识" min-width="190" show-overflow-tooltip />
                <el-table-column label="账号状态" width="110">
                  <template #default="{ row }">
                    <el-tag :type="row.isActive ? 'success' : 'info'">
                      {{ row.isActive ? '正常' : '已停用' }}
                    </el-tag>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty description="暂无主办方账号" />
                </template>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </main>

      <el-dialog
        v-model="bannerDialogVisible"
        :title="bannerForm.bannerId ? '编辑轮播图' : '添加轮播图'"
        width="min(620px, 92vw)"
        destroy-on-close
      >
        <el-form label-width="88px">
          <el-form-item label="标题">
            <el-input v-model="bannerForm.title" maxlength="80" show-word-limit />
          </el-form-item>
          <el-form-item label="图片" required>
            <div class="upload-area">
              <button type="button" class="upload-button" @click="openBannerCropper">
                <img v-if="bannerForm.displayImageUrl" :src="bannerForm.displayImageUrl" alt="轮播图预览" />
                <span v-else><el-icon><Plus /></el-icon> 选择并裁剪图片</span>
              </button>
              <span class="form-tip">建议比例 16:5，支持 JPG、PNG。</span>
            </div>
          </el-form-item>
          <el-form-item label="跳转链接">
            <el-input v-model="bannerForm.link" placeholder="/portal/tournaments 或 https://…" />
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="bannerForm.sort" :min="0" :max="999" />
            <span class="form-tip inline-tip">数字越小越靠前</span>
          </el-form-item>
          <el-form-item label="状态">
            <el-switch v-model="bannerForm.isActive" active-text="启用" inactive-text="停用" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="bannerDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingBanner" @click="submitBanner">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="featuredDialogVisible" title="添加推荐赛事" width="min(760px, 92vw)">
        <el-input v-model="featuredKeyword" placeholder="搜索未推荐赛事" clearable class="dialog-search">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-table :data="featuredCandidates" border max-height="420">
          <el-table-column prop="name" label="赛事名称" min-width="220" />
          <el-table-column prop="organizerName" label="主办方" min-width="150" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">{{ statusText(row.status) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link @click="addFeatured(row)">添加</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="没有可添加的赛事" />
          </template>
        </el-table>
      </el-dialog>

      <ImageCropper
        ref="bannerCropperRef"
        title="裁剪轮播图"
        :aspect-ratio="1920 / 600"
        @confirm="handleBannerCrop"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Loading,
  Picture,
  Plus,
  Refresh,
  Search,
  Star,
  Trophy,
  User
} from '@element-plus/icons-vue'
import { callFunction } from '@/utils/cloud'
import { getTempFileURL, uploadBase64Image } from '@/utils/upload'
import ImageCropper from '@/components/common/ImageCropper.vue'

const router = useRouter()
const logoUrl = `${import.meta.env.BASE_URL}logo.png`

const activeTab = ref('banners')
const checkingPermission = ref(true)
const loading = ref(false)
const savingBanner = ref(false)
const bannerDialogVisible = ref(false)
const featuredDialogVisible = ref(false)
const bannerCropperRef = ref(null)
const keyword = ref('')
const categoryFilter = ref('')
const featuredKeyword = ref('')
const banners = ref([])
const tournaments = ref([])
const organizers = ref([])

const stats = reactive({
  totalTournaments: 0,
  featuredTournaments: 0,
  totalOrganizers: 0,
  bannerCount: 0
})

const bannerForm = reactive({
  bannerId: '',
  title: '',
  imageUrl: '',
  displayImageUrl: '',
  link: '',
  sort: 0,
  isActive: true,
  storageType: 'cloud'
})

const categories = [
  { value: 'youth', label: '青少年赛事' },
  { value: 'amateur', label: '业余赛事' },
  { value: 'local', label: '地协赛' },
  { value: 'city', label: '城市联赛' },
  { value: 'professional', label: '职业联赛' }
]

const categoryMap = Object.fromEntries(categories.map(item => [item.value, item.label]))
const formatMap = {
  tournament: '赛会制',
  cup: '杯赛制',
  league: '联赛制',
  combined: '复合制',
  hybrid: '复合制'
}
const statusMap = {
  draft: '草稿',
  registering: '报名中',
  published: '已发布',
  ongoing: '进行中',
  ended: '已结束',
  completed: '已结束',
  cancelled: '已取消'
}

const currentUserName = computed(() => {
  try {
    const user = JSON.parse(localStorage.getItem('userInfo') || '{}')
    return user.organizationName || user.nickname || user.name || user.phone || '平台负责人'
  } catch (error) {
    return '平台负责人'
  }
})

const statCards = computed(() => [
  { key: 'tournaments', label: '赛事总数', value: stats.totalTournaments, icon: Trophy, color: 'blue' },
  { key: 'featured', label: '推荐赛事', value: stats.featuredTournaments, icon: Star, color: 'green' },
  { key: 'organizers', label: '主办方账号', value: stats.totalOrganizers, icon: User, color: 'orange' },
  { key: 'banners', label: '轮播图', value: stats.bannerCount, icon: Picture, color: 'purple' }
])

const featuredTournaments = computed(() => tournaments.value
  .filter(item => item.isFeatured)
  .sort((a, b) => a.featuredSort - b.featuredSort))

const filteredTournaments = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase()
  return tournaments.value.filter(item => {
    const matchesCategory = !categoryFilter.value || item.category === categoryFilter.value
    const matchesKeyword = !normalizedKeyword || item.name.toLowerCase().includes(normalizedKeyword)
    return matchesCategory && matchesKeyword
  })
})

const featuredCandidates = computed(() => {
  const normalizedKeyword = featuredKeyword.value.trim().toLowerCase()
  return tournaments.value.filter(item =>
    !item.isFeatured &&
    (!normalizedKeyword || item.name.toLowerCase().includes(normalizedKeyword))
  )
})

function resultError(result, fallback) {
  return (result && (result.error || result.message)) || fallback
}

function categoryText(value) {
  return categoryMap[value] || value || '未分类'
}

function formatText(value) {
  return formatMap[value] || value || '未设置'
}

function statusText(value) {
  return statusMap[value] || value || '未知'
}

function statusType(value) {
  return {
    draft: 'info',
    registering: 'primary',
    published: 'success',
    ongoing: 'warning',
    ended: 'info',
    completed: 'info',
    cancelled: 'danger'
  }[value] || 'info'
}

async function resolveImageUrl(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('cloud://')) return imageUrl
  try {
    const result = await getTempFileURL(imageUrl)
    return result.success ? result.url : imageUrl
  } catch (error) {
    return imageUrl
  }
}

async function checkPermission() {
  const result = await callFunction('platformOwner', { action: 'status' })
  if (!result.success || !result.isPlatformOwner) {
    ElMessage.error(resultError(result, '仅平台负责人可以进入赛事中心内容后台'))
    await router.replace('/tournaments')
    return false
  }
  return true
}

async function loadOverview() {
  loading.value = true
  try {
    const result = await callFunction('manageTournamentCenterContent', { action: 'overview' })
    if (!result.success) throw new Error(resultError(result, '加载赛事中心数据失败'))

    const data = result.data || {}
    const rawBanners = data.banners || []
    banners.value = await Promise.all(rawBanners.map(async banner => ({
      ...banner,
      displayImageUrl: await resolveImageUrl(banner.imageUrl)
    })))
    tournaments.value = data.tournaments || []
    organizers.value = data.organizers || []
    Object.assign(stats, data.stats || {})
  } catch (error) {
    ElMessage.error(error.message || '加载赛事中心数据失败')
  } finally {
    loading.value = false
  }
}

function resetBannerForm() {
  Object.assign(bannerForm, {
    bannerId: '',
    title: '',
    imageUrl: '',
    displayImageUrl: '',
    link: '',
    sort: 0,
    isActive: true,
    storageType: 'cloud'
  })
}

function openBannerDialog(banner = null) {
  resetBannerForm()
  if (banner) {
    Object.assign(bannerForm, {
      bannerId: banner._id,
      title: banner.title,
      imageUrl: banner.imageUrl,
      displayImageUrl: banner.displayImageUrl,
      link: banner.link,
      sort: banner.sort,
      isActive: banner.isActive,
      storageType: banner.storageType || 'cloud'
    })
  }
  bannerDialogVisible.value = true
}

function openBannerCropper() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/webp'
  input.onchange = event => {
    const file = event.target.files && event.target.files[0]
    if (file) bannerCropperRef.value?.open(file)
  }
  input.click()
}

async function handleBannerCrop(blob, dataUrl) {
  bannerForm.displayImageUrl = dataUrl
  try {
    const result = await uploadBase64Image(dataUrl, 'banners')
    if (!result.success || !result.fileID) throw new Error(result.message || '图片上传失败')
    bannerForm.imageUrl = result.fileID
    bannerForm.displayImageUrl = await resolveImageUrl(result.fileID)
    bannerForm.storageType = 'cloud'
    ElMessage.success('图片上传成功')
  } catch (error) {
    bannerForm.imageUrl = ''
    ElMessage.error(error.message || '图片上传失败')
  }
}

async function persistBanner(payload, successMessage = '') {
  const result = await callFunction('manageTournamentCenterContent', {
    action: 'saveBanner',
    ...payload
  })
  if (!result.success) throw new Error(resultError(result, '保存轮播图失败'))
  if (successMessage) ElMessage.success(successMessage)
}

async function submitBanner() {
  if (!bannerForm.imageUrl) {
    ElMessage.warning('请先上传轮播图片')
    return
  }
  savingBanner.value = true
  try {
    await persistBanner({ ...bannerForm }, bannerForm.bannerId ? '轮播图已更新' : '轮播图已添加')
    bannerDialogVisible.value = false
    await loadOverview()
  } catch (error) {
    ElMessage.error(error.message || '保存轮播图失败')
  } finally {
    savingBanner.value = false
  }
}

async function saveBannerQuick(banner) {
  try {
    await persistBanner({
      bannerId: banner._id,
      title: banner.title,
      imageUrl: banner.imageUrl,
      link: banner.link,
      sort: banner.sort,
      isActive: banner.isActive,
      storageType: banner.storageType
    }, '设置已保存')
    await loadOverview()
  } catch (error) {
    ElMessage.error(error.message || '保存设置失败')
    await loadOverview()
  }
}

async function removeBanner(banner) {
  try {
    await ElMessageBox.confirm(`确定删除轮播图“${banner.title || '未命名'}”吗？`, '删除轮播图', {
      type: 'warning'
    })
    const result = await callFunction('manageTournamentCenterContent', {
      action: 'deleteBanner',
      bannerId: banner._id
    })
    if (!result.success) throw new Error(resultError(result, '删除轮播图失败'))
    ElMessage.success('轮播图已删除')
    await loadOverview()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '删除轮播图失败')
  }
}

function openFeaturedDialog() {
  featuredKeyword.value = ''
  featuredDialogVisible.value = true
}

async function updateFeatured(tournament, enabled, showMessage = true) {
  try {
    const result = await callFunction('manageTournamentCenterContent', {
      action: 'setFeatured',
      tournamentId: tournament._id,
      enabled,
      sort: tournament.featuredSort || 0
    })
    if (!result.success) throw new Error(resultError(result, '更新推荐赛事失败'))
    if (showMessage) ElMessage.success(enabled ? '推荐设置已保存' : '已取消推荐')
    await loadOverview()
  } catch (error) {
    ElMessage.error(error.message || '更新推荐赛事失败')
  }
}

async function addFeatured(tournament) {
  await updateFeatured(tournament, true)
  featuredDialogVisible.value = false
}

async function confirmRemoveFeatured(tournament) {
  try {
    await ElMessageBox.confirm(`确定取消推荐“${tournament.name}”吗？`, '取消推荐', {
      type: 'warning'
    })
    await updateFeatured(tournament, false)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message || '取消推荐失败')
  }
}

function previewImage(url) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

function viewTournament(tournament) {
  const href = `${import.meta.env.BASE_URL}#/tournaments/${tournament._id}`
  window.open(href, '_blank', 'noopener,noreferrer')
}

function goBack() {
  router.push('/tournaments')
}

onMounted(async () => {
  document.title = '赛小蜂足球赛事中心 - 内容后台'
  try {
    const allowed = await checkPermission()
    if (allowed) await loadOverview()
  } catch (error) {
    ElMessage.error(error.message || '权限校验失败')
    await router.replace('/tournaments')
  } finally {
    checkingPermission.value = false
  }
})
</script>

<style scoped>
.content-admin {
  min-height: 100vh;
  color: #1f2937;
  background: #f3f6f4;
}

.permission-loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #4b5563;
}

.page-header {
  min-height: 84px;
  padding: 14px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  color: #fff;
  background: linear-gradient(120deg, #14532d, #16a34a);
  box-shadow: 0 6px 24px rgb(5 46 22 / 18%);
}

.brand,
.header-actions,
.stat-card,
.section-header,
.filters {
  display: flex;
  align-items: center;
}

.brand {
  gap: 14px;
}

.brand-logo {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 12px;
  background: rgb(255 255 255 / 92%);
  padding: 5px;
}

.brand h1,
.section-header h2 {
  margin: 0;
}

.brand h1 {
  font-size: 22px;
  line-height: 1.25;
}

.brand p,
.section-header p {
  margin: 5px 0 0;
}

.brand p {
  color: rgb(255 255 255 / 74%);
  font-size: 13px;
}

.header-actions {
  gap: 10px;
}

.current-user {
  margin-right: 4px;
  font-size: 14px;
}

.page-main {
  max-width: 1500px;
  margin: 0 auto;
  padding: 22px 28px 36px;
}

.scope-alert {
  margin-bottom: 18px;
}

.stats-row {
  row-gap: 16px;
  margin-bottom: 18px;
}

.stat-card {
  min-height: 96px;
  gap: 14px;
  padding: 18px;
  border: 1px solid #e6ebe8;
  border-radius: 14px;
  background: #fff;
}

.stat-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 13px;
  font-size: 23px;
}

.stat-icon.blue {
  color: #2563eb;
  background: #eff6ff;
}

.stat-icon.green {
  color: #15803d;
  background: #f0fdf4;
}

.stat-icon.orange {
  color: #c2410c;
  background: #fff7ed;
}

.stat-icon.purple {
  color: #7e22ce;
  background: #faf5ff;
}

.stat-value {
  color: #111827;
  font-size: 27px;
  font-weight: 700;
  line-height: 1.1;
}

.stat-label {
  margin-top: 7px;
  color: #6b7280;
  font-size: 13px;
}

.content-card {
  border-radius: 14px;
}

.section-header {
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.section-header h2 {
  font-size: 18px;
}

.section-header p,
.form-tip {
  color: #6b7280;
  font-size: 13px;
}

.filters {
  gap: 10px;
}

.filters .el-select {
  width: 160px;
}

.filters .el-input {
  width: 240px;
}

.image-button,
.upload-button {
  border: 0;
  padding: 0;
  cursor: pointer;
  background: transparent;
}

.banner-image {
  width: 160px;
  height: 52px;
  display: block;
  object-fit: cover;
  border-radius: 7px;
  background: #eef2f0;
}

.upload-area {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.upload-button {
  width: min(430px, 100%);
  aspect-ratio: 16 / 5;
  overflow: hidden;
  display: grid;
  place-items: center;
  color: #15803d;
  border: 1px dashed #86b69a;
  border-radius: 10px;
  background: #f4fbf6;
}

.upload-button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.inline-tip {
  margin-left: 10px;
}

.dialog-search {
  margin-bottom: 14px;
}

@media (max-width: 760px) {
  .page-header,
  .section-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .page-header,
  .page-main {
    padding-left: 16px;
    padding-right: 16px;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .current-user {
    width: 100%;
  }

  .filters {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }

  .filters .el-select,
  .filters .el-input {
    width: 100%;
  }
}
</style>
