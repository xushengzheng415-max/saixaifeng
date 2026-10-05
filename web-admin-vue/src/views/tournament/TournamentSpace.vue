<template>
  <section class="tournament-space" aria-labelledby="tournament-space-title">
    <div class="space-hero">
      <div class="hero-copy">
        <h1 id="tournament-space-title">赛事空间</h1>

      </div>
      <div class="space-heading"><i></i><h2>{{ isStaffAccount ? '共享赛事' : '我的赛事' }}</h2></div>
    </div>

    <div v-loading="loading" class="tournament-grid">
      <button v-if="!isStaffAccount" class="create-card" type="button" @click="goToCreate">
        <span class="create-border">
          <span class="create-icon" aria-hidden="true"><el-icon><Plus /></el-icon></span>
          <strong>创建新赛事</strong>
          <small>创建赛事项目并完成基础设置</small>
        </span>
      </button>

      <article
        v-for="tournament in visibleTournaments"
        :key="tournament._id"
        class="tournament-card"
        tabindex="0"
        role="button"
        :aria-label="`进入 ${tournament.name} 赛事空间`"
        @click="openTournament(tournament)"
        @keydown.enter="openTournament(tournament)"
        @keydown.space.prevent="openTournament(tournament)"
      >
        <div class="card-cover" :style="coverStyle(tournament)">
          <span v-if="tournament.isShared" class="status-pill shared-pill">共享赛事</span>
          <span v-else class="status-pill" :class="statusClass(tournament.status)">{{ statusLabel(tournament.status) }}</span>
          <el-dropdown v-if="!tournament.isShared" trigger="click" @command="command => handleMenu(command, tournament)" @click.stop>
            <button class="more-button" type="button" aria-label="赛事操作" @click.stop><el-icon><MoreFilled /></el-icon></button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="open">进入赛事空间</el-dropdown-item>
                <el-dropdown-item command="edit">编辑基础信息</el-dropdown-item>
              </el-dropdown-menu>
                <el-dropdown-item command="delete" divided>删除赛事</el-dropdown-item>
            </template>
          </el-dropdown>
          <img v-if="logoOf(tournament)" class="tournament-logo" :src="logoOf(tournament)" :alt="`${tournament.name} Logo`" />
          <span v-else class="tournament-mark" aria-hidden="true"><el-icon><Trophy /></el-icon></span>
        </div>

        <div class="card-body">
          <h3>{{ tournament.name || '未命名赛事' }}</h3>
          <p v-if="tournament.isShared" class="category-line">主办方共享给你的赛事</p>
          <p v-else class="category-line">{{ divisionLabel(tournament) }} · {{ regionLabel(tournament) }}</p>
          <p v-if="tournament.isShared" class="shared-rights">授权模块：{{ sharedRightsLabel(tournament.permissions) }}</p>
          <div v-if="!tournament.isShared" class="card-metrics">
            <span><el-icon><UserFilled /></el-icon>{{ displayNumber(tournament.registeredTeams || tournament.teamCount) }} 支球队</span>
            <i>·</i>
            <span><el-icon><Football /></el-icon>{{ displayNumber(tournament.matchCount || tournament.matchesCount) }} 场比赛</span>
          </div>
          <template v-if="!tournament.isShared">
            <div class="date-line"><el-icon><Calendar /></el-icon>{{ dateRange(tournament) }}</div>
            <div class="progress-heading"><strong>赛程进度</strong><span>{{ progressOf(tournament) }}%</span></div>
            <el-progress :percentage="progressOf(tournament)" :stroke-width="6" :show-text="false" :color="progressColor(tournament.status)" />
            <p class="updated-at">最近更新：{{ updatedAt(tournament) }}</p>
          </template>
          <button class="enter-button" type="button" @click.stop="openTournament(tournament)">{{ tournament.isShared ? '进入共享赛事' : '进入赛事空间' }}</button>
        </div>
      </article>
    </div>

    <div v-if="!loading && visibleTournaments.length === 0" class="empty-note">
      {{ isStaffAccount ? '当前账号暂无共享赛事授权。' : '当前机构还没有赛事，使用左侧“创建新赛事”开始配置。' }}
    </div>

    <aside class="guidance-panel">
      <span class="guidance-icon" aria-hidden="true"><el-icon><Document /></el-icon></span>
      <div><strong>使用说明</strong><p v-if="isStaffAccount">返回赛事空间可查看主办方共享给你的赛事；进入后只能使用获授权的模块。</p><p v-else>进入赛事空间后，报名、抽签、赛程、比赛、裁判和数据操作均针对当前赛事。</p></div>
    </aside>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Document, Football, MoreFilled, Plus, Trophy, UserFilled } from '@element-plus/icons-vue'
import { callFunction, deleteTournamentWorkspace, getFileUrl, queryList } from '../../utils/cloud'
import { TOURNAMENT_SIDEBAR_RIGHTS, visibleSidebarKeys } from '../../utils/tournamentStaffRights'
import defaultCover from '../../assets/images/tournament-space-emerald-field-v1.png'

const router = useRouter()
const loading = ref(false)
const tournaments = ref([])
const isStaffAccount = ref(false)
const deletingTournamentId = ref('')
const isVisualQa = import.meta.env.DEV && (window.location.href.includes('visualQa=1') || localStorage.getItem('sxfVisualQa') === '1')
const visibleTournaments = computed(() => {
  if (!isVisualQa || !tournaments.value.length) return tournaments.value
  const primary = tournaments.value[0]
  return [
    primary,
    { ...primary, _id: 'qa-tournament-campus', name: '郑州市校园足球联赛', divisionName: 'U14', city: '郑州市', status: 'registering', registeredTeams: 18, matchCount: 64, startDate: '2026-05-12', endDate: '2026-07-15', scheduleProgress: 35, updateTime: '2026-05-12T09:48:00+08:00' },
    { ...primary, _id: 'qa-tournament-invite', name: '夏季青训邀请赛', divisionName: 'U16', province: '河南省', status: 'draft', registeredTeams: 12, matchCount: 36, startDate: '2026-06-12', endDate: '2026-06-20', scheduleProgress: 15, updateTime: '2026-05-11T16:30:00+08:00' }
  ]
})

function getCurrentOrgId() {
  if (import.meta.env.DEV && (sessionStorage.getItem('sxfVisualQa') === '1' || localStorage.getItem('sxfVisualQa') === '1')) return 'qa-org'
  try {
    const user = JSON.parse(localStorage.getItem('userInfo') || '{}')
    return user.orgId || user.organizationId || ''
  } catch {
    return ''
  }
}

async function loadTournaments() {
  isStaffAccount.value = sessionStorage.getItem('sxfTournamentStaff') === '1'
  if (isStaffAccount.value) {
    loading.value = true
    try {
      const result = await callFunction('tournamentStaffAccess', { action: 'mine' })
      if (!result?.success) throw new Error(result?.error || '共享赛事加载失败')
      tournaments.value = (result.grants || []).map(grant => ({
        _id: String(grant.tournamentId || ''),
        name: grant.tournamentName || grant.tournamentId || '赛事',
        isShared: true,
        permissions: Array.isArray(grant.permissions) ? grant.permissions : []
      })).filter(item => item._id)
    } catch (error) {
      tournaments.value = []
      ElMessage.error(error.message || '共享赛事加载失败')
    } finally {
      loading.value = false
    }
    return
  }
  const orgId = getCurrentOrgId()
  if (!orgId) {
    tournaments.value = []
    ElMessage.info('请先选择业务场景并建立机构工作空间')
    router.replace('/organization-onboarding')
    return
  }
  loading.value = true
  try {
    const rows = await queryList('tournaments', { where: { orgId }, orderBy: { createTime: 'desc' } })
    tournaments.value = await Promise.all((rows || []).map(resolveTournamentLogo))
  } finally {
    loading.value = false
  }
}

function sharedRightsLabel(permissions = []) {
  const visible = visibleSidebarKeys(permissions)
  return TOURNAMENT_SIDEBAR_RIGHTS.filter(right => visible.has(right.key)).map(right => right.label).join('、') || '权限待确认'
}

function goToCreate() { router.push('/tournaments/create') }
function openTournament(tournament) { if (tournament?._id) router.push(`/tournaments/${tournament._id}`) }
async function handleMenu(command, tournament) {
  if (command === 'edit') {
    router.push(`/tournaments/${tournament._id}/edit`)
    return
  }
  if (command !== 'delete') {
    openTournament(tournament)
    return
  }
  if (!tournament?._id || deletingTournamentId.value) return
  if (String(tournament._id).startsWith('qa-tournament-')) {
    ElMessage.info('视觉验收样例不能删除')
    return
  }
  try {
    const confirmation = await ElMessageBox.prompt(
      `将删除“${tournament.name || '未命名赛事'}”及其报名、组别、赛程、比赛、名单快照、裁判指派和邀请。球队资料、球员资料和登录账号不会删除。请输入“删除”确认。`,
      '删除赛事',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
        inputPattern: /^删除$/,
        inputErrorMessage: '请输入“删除”'
      }
    )
    deletingTournamentId.value = tournament._id
    const result = await deleteTournamentWorkspace(tournament._id, confirmation.value)
    if (!result?.success) throw new Error(result?.error || '赛事删除失败')
    tournaments.value = tournaments.value.filter(item => String(item._id) !== String(tournament._id))
    ElMessage.success('赛事已删除，球队和球员资料未受影响')
  } catch (error) {
    if (!['cancel', 'close'].includes(error)) ElMessage.error(error.message || '赛事删除失败')
  } finally {
    deletingTournamentId.value = ''
  }
}
async function resolveTournamentLogo(tournament) {
  const source = String(tournament?.logoTransparentUrl || tournament?.logoUrl || tournament?.logo || '')
  if (!source.startsWith('cloud://')) return tournament
  const resolved = await getFileUrl(source)
  const url = /^https?:\/\//i.test(String(resolved || '')) ? resolved : ''
  return { ...tournament, _logoFileId:source, logoTransparentUrl:url, logoUrl:url, logo:url }
}
function logoOf(tournament) {
  const value = String(tournament?.logoTransparentUrl || tournament?.logoUrl || tournament?.logo || '')
  return /^(https?:\/\/|\/)/i.test(value) ? value : ''
}
function coverStyle(tournament) { return { backgroundImage: `linear-gradient(180deg,rgba(0,66,40,.1),rgba(0,47,30,.45)),url(${tournament.coverUrl || defaultCover})` } }
function displayNumber(value) { return Number.isFinite(Number(value)) ? Number(value) : 0 }
function divisionLabel(tournament) { const divisions = Array.isArray(tournament.divisions) ? tournament.divisions : []; return tournament.divisionName || divisions[0]?.name || tournament.category || '竞赛组别待配置' }
function regionLabel(tournament) { return tournament.region || tournament.province || tournament.city || '地区待定' }
function formatDate(value, separator = '.') { if (!value) return '日期待定'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '日期待定'; return `${date.getFullYear()}${separator}${String(date.getMonth() + 1).padStart(2, '0')}${separator}${String(date.getDate()).padStart(2, '0')}` }
function dateRange(tournament) { return `${formatDate(tournament.startDate, '-')} 至 ${formatDate(tournament.endDate, '-')}` }
function progressOf(tournament) { const value = Number(tournament.scheduleProgress ?? tournament.progress ?? (tournament.status === 'completed' || tournament.status === 'finished' ? 100 : 0)); return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)) }
function progressColor(status) { return status === 'registering' ? '#f59b16' : status === 'draft' ? '#2778cc' : '#0a944b' }
function updatedAt(tournament) { return formatDate(tournament.updateTime || tournament.updatedAt || tournament.createTime) }
function statusLabel(status) { return ({ draft: '筹备中', registering: '报名中', upcoming: '即将开始', ongoing: '进行中', completed: '已结束', finished: '已结束' })[status] || '筹备中' }
function statusClass(status) { return `status-${status || 'draft'}` }

function applyVisualQaSnapshot() {
  if (window.__sxfVisualQaSnapshot?.tournament) {
    tournaments.value = [{
      ...window.__sxfVisualQaSnapshot.tournament,
      divisionName: window.__sxfVisualQaSnapshot.tournament.divisionName || 'U12',
      province: window.__sxfVisualQaSnapshot.tournament.province || '河南省',
      status: window.__sxfVisualQaSnapshot.tournament.status || 'ongoing',
      registeredTeams: window.__sxfVisualQaSnapshot.tournament.registeredTeams || 32,
      matchCount: window.__sxfVisualQaSnapshot.tournament.matchCount || 128,
      startDate: window.__sxfVisualQaSnapshot.tournament.startDate || '2026-04-12',
      endDate: window.__sxfVisualQaSnapshot.tournament.endDate || '2026-06-28',
      scheduleProgress: window.__sxfVisualQaSnapshot.tournament.scheduleProgress || 65,
      updateTime: window.__sxfVisualQaSnapshot.tournament.updateTime || '2026-05-12T10:25:00+08:00'
    }]
  }
}

if (isVisualQa) {
  applyVisualQaSnapshot()
  window.addEventListener('sxf-visual-qa-ready', applyVisualQaSnapshot)
} else {
  onMounted(loadTournaments)
}
onUnmounted(() => window.removeEventListener('sxf-visual-qa-ready', applyVisualQaSnapshot))
</script>

<style scoped>
.tournament-space{width:100%;min-height:calc(100vh - var(--admin-topbar-height));padding-bottom:38px;background:#f7f9f8}.space-hero{position:relative;height:332px;padding:58px clamp(74px,7.1vw,114px);overflow:hidden;color:#fff;background:linear-gradient(90deg,rgba(0,58,37,.96),rgba(0,60,38,.7) 48%,rgba(0,47,31,.08)),url('../../assets/images/tournament-space-emerald-field-v1.png') center/cover no-repeat}.space-hero:after{content:"";position:absolute;left:-3%;right:-3%;bottom:-43px;height:74px;border-radius:50% 50% 0 0;background:#f7f9f8}.hero-copy{position:relative;z-index:1}.hero-copy h1{margin:0;color:#fff;font-size:48px;line-height:1.25;font-weight:800;letter-spacing:2px}.hero-copy p{margin:12px 0 0;color:rgba(255,255,255,.92);font-size:21px;font-weight:500}.space-heading{position:absolute;z-index:2;left:clamp(74px,7.1vw,114px);bottom:51px;display:flex;align-items:center;gap:10px}.space-heading i{width:4px;height:24px;border-radius:3px;background:#25d9d1}.space-heading h2{margin:0;color:#fff;font-size:23px;font-weight:700}.tournament-grid{position:relative;z-index:3;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;width:calc(100% - clamp(148px,14.2vw,228px));min-height:470px;margin:-50px auto 0}.create-card,.tournament-card{height:470px;border:1px solid #dfe5e1;border-radius:13px;background:#fff;box-shadow:0 6px 18px rgba(28,55,40,.12)}.create-card{padding:12px;cursor:pointer}.create-border{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed #74c08e;border-radius:11px}.create-icon{display:grid;width:82px;height:82px;margin-bottom:20px;place-items:center;border-radius:50%;color:#07833f;font-size:43px;background:#e6f4e9}.create-card strong{color:#087b3d;font-size:22px}.create-card small{margin-top:15px;color:#7e8983;font-size:14px}.create-card:hover,.create-card:focus-visible{border-color:#4aac70;outline:none;box-shadow:0 10px 26px rgba(12,111,58,.18)}.tournament-card{overflow:hidden;cursor:pointer;transition:transform .18s,box-shadow .18s}.tournament-card:hover,.tournament-card:focus-visible{transform:translateY(-3px);outline:none;box-shadow:0 14px 30px rgba(12,91,49,.18)}.card-cover{position:relative;height:152px;display:flex;align-items:center;justify-content:center;background-position:center;background-size:cover}.status-pill{position:absolute;left:14px;top:14px;padding:6px 10px;border-radius:6px;color:#fff;font-size:14px;background:#168c45}.status-registering{background:#f59b16}.status-draft{background:#2778cc}.status-completed,.status-finished{background:#7d8782}.more-button{position:absolute;right:13px;top:12px;display:grid;width:38px;height:38px;padding:0;place-items:center;border:1px solid rgba(255,255,255,.55);border-radius:50%;color:#fff;font-size:23px;background:rgba(0,35,23,.55);cursor:pointer}.tournament-logo,.tournament-mark{width:88px;height:88px;object-fit:contain}.tournament-mark{display:grid;place-items:center;border:3px solid rgba(255,255,255,.8);border-radius:50%;color:#fff;font-size:47px;background:rgba(0,74,43,.65)}.card-body{padding:13px 14px 14px}.card-body h3{overflow:hidden;margin:0;color:#141b17;font-size:20px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.category-line{margin:6px 0 0;color:#68736d;font-size:13px}.card-metrics{display:flex;align-items:center;gap:9px;margin-top:15px;color:#34443b;font-size:13px}.card-metrics span,.date-line{display:flex;align-items:center;gap:6px}.card-metrics .el-icon,.date-line .el-icon{color:#118a47;font-size:17px}.card-metrics i{color:#a5ada8;font-style:normal}.date-line{margin-top:11px;color:#37453d;font-size:13px}.progress-heading{display:flex;justify-content:space-between;margin-top:17px;color:#334239;font-size:13px}.progress-heading span{color:#56635c}.card-body :deep(.el-progress){margin-top:7px}.updated-at{margin:13px 0 0;color:#8a948e;font-size:12px}.enter-button{width:100%;height:42px;margin-top:13px;border:0;border-radius:6px;color:#fff;font-size:16px;font-weight:700;background:linear-gradient(135deg,#078442,#04a457);cursor:pointer}.enter-button:hover{background:#06743b}.empty-note{width:calc(100% - clamp(148px,14.2vw,228px));margin:16px auto 0;padding:14px 18px;border:1px dashed #b9d7c3;border-radius:9px;color:#547060;text-align:center;background:#fff}.guidance-panel{display:flex;align-items:center;gap:18px;width:calc(100% - clamp(148px,14.2vw,228px));min-height:86px;margin:27px auto 0;padding:14px 20px;border:1px solid #c7ded0;border-radius:10px;color:#35463c;background:#f7fbf8}.guidance-icon{display:grid;width:54px;height:54px;flex:none;place-items:center;border-radius:50%;color:#fff;font-size:27px;background:linear-gradient(135deg,#0b8e48,#006f38)}.guidance-panel div{min-width:0}.guidance-panel strong{display:block;color:#1c2d23;font-size:17px}.guidance-panel p{margin:5px 0 0;color:#59675f;font-size:14px;line-height:1.55}@media(max-width:1280px){.space-hero{padding-inline:52px}.space-heading{left:52px}.tournament-grid,.empty-note,.guidance-panel{width:calc(100% - 104px)}}
.shared-pill{background:#087f43}.shared-rights{margin:12px 0 0;color:#4f6257;font-size:13px;line-height:1.6}
</style>
