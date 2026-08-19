<template>
  <section v-loading="loading" class="division-create" aria-labelledby="division-create-title">
    <header class="context-bar">
      <div class="tournament-context-copy">
        <img v-if="tournamentLogo" class="tournament-context-logo" :src="tournamentLogo" :alt="`${tournament.name} Logo`" />
        <span v-else class="tournament-context-logo context-mark"><el-icon><Trophy /></el-icon></span>
        <h1>{{ tournament.name || '赛事竞赛管理' }}</h1>
        <span class="header-chip">{{ existingCount + 1 }} 个组别</span>
        <span class="status-chip">{{ tournamentStatus }}</span>
        <span class="header-meta"><el-icon><Calendar /></el-icon>{{ dateRange }}</span>
        <span class="header-meta"><el-icon><Location /></el-icon>{{ tournament.region || tournament.location || '地区待定' }}</span>
      </div>
      <el-button plain :icon="Back" @click="router.push('/tournament-space')">退出赛事空间</el-button>
    </header>

    <div class="page-heading">
      <div><h2 id="division-create-title">竞赛管理 / 添加组别</h2><p>创建赛事下的新组别，完成后进入赛制设置。</p></div>
      <el-button plain :icon="Back" @click="goBack">返回组别管理</el-button>
    </div>

    <main class="create-grid">
      <section class="form-panel" aria-label="组别基础信息">
        <div class="panel-heading"><div><h2>基础信息</h2><p>组别创建后可继续设置赛制和竞赛规则。</p></div><span class="step-badge">步骤 1 / 2</span></div>
        <el-form label-position="top" class="division-form">
          <div class="two-columns">
            <el-form-item label="组别名称" required><el-input v-model="form.name" maxlength="24" placeholder="例如：U16 男子组" /></el-form-item>
            <el-form-item label="组别简称"><el-input v-model="form.shortName" maxlength="12" placeholder="例如：U16" /></el-form-item>
          </div>
          <div class="two-columns">
            <el-form-item label="年龄组" required><el-select v-model="form.ageGroup" style="width:100%"><el-option v-for="item in ageOptions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
            <el-form-item label="参赛性别" required><el-radio-group v-model="form.gender"><el-radio-button label="男子组" /><el-radio-button label="女子组" /><el-radio-button label="混合组" /></el-radio-group></el-form-item>
          </div>
          <div class="two-columns">
            <el-form-item label="预计参赛球队"><el-input-number v-model="form.expectedTeams" :min="2" :max="128" controls-position="right" style="width:100%" /></el-form-item>
            <el-form-item label="展示排序"><el-input-number v-model="form.displayOrder" :min="1" :max="999" controls-position="right" style="width:100%" /></el-form-item>
          </div>
        </el-form>

        <div class="mode-section"><div class="mode-title"><div><h2>选择运行模式</h2><p>可依据赛事执行复杂度选择，创建后进入对应规则设置。</p></div><el-button text type="primary" @click="openModeComparison">查看模式区别</el-button></div>
          <div class="mode-cards">
            <button class="mode-card" :class="{ selected: form.mode === 'simple' }" type="button" @click="form.mode = 'simple'"><span class="mode-icon green"><el-icon><Lightning /></el-icon></span><span><strong>简易模式</strong><small>适合快速建赛与基础赛制配置</small></span><el-icon class="choice"><CircleCheckFilled v-if="form.mode === 'simple'" /><CircleCheck v-else /></el-icon></button>
            <button class="mode-card" :class="{ selected: form.mode === 'professional' }" type="button" @click="form.mode = 'professional'"><span class="mode-icon orange"><el-icon><Medal /></el-icon></span><span><strong>专业模式</strong><small>覆盖资格、执行、积分与晋级规则</small></span><el-icon class="choice"><CircleCheckFilled v-if="form.mode === 'professional'" /><CircleCheck v-else /></el-icon></button>
          </div>
        </div>
      </section>

      <aside class="preview-column" aria-label="组别创建预览"><section class="preview-card"><p class="preview-label">创建预览</p><div class="preview-name"><span><el-icon><UserFilled /></el-icon></span><div><h2>{{ previewName }}</h2><p>{{ form.ageGroup }} · {{ form.gender }}</p></div></div><dl><div><dt>预计球队</dt><dd>{{ form.expectedTeams }} 支</dd></div><div><dt>运行模式</dt><dd :class="form.mode">{{ form.mode === 'professional' ? '专业模式' : '简易模式' }}</dd></div><div><dt>当前状态</dt><dd class="draft">待配置规则</dd></div></dl></section><section class="hint-card"><el-icon><InfoFilled /></el-icon><p>创建后不会自动发布或覆盖已有组别；需在下一步完成赛制与规则定版。</p></section></aside>
    </main>

    <footer class="action-bar"><span>当前赛事已有 {{ existingCount }} 个组别</span><div><el-button @click="goBack">取消</el-button><el-button type="primary" :loading="saving" :disabled="!canManage || (isUpgradeFlow && form.mode !== 'professional')" @click="createDivision">{{ isUpgradeFlow ? '确认升级并进入正式名单' : '创建并进入赛制设置' }} <el-icon><ArrowRight /></el-icon></el-button></div></footer>
    <el-alert v-if="!canManage" class="permission-alert" type="warning" show-icon :closable="false" title="你只有查看该赛事的权限，不能创建竞赛组别。" />
    <div v-if="comparisonVisible || forceModeComparison" class="mode-comparison-overlay" role="dialog" aria-modal="true" aria-labelledby="mode-comparison-title">
      <section class="mode-comparison-dialog"><button type="button" class="comparison-close" aria-label="关闭模式对比" @click="closeModeComparison">×</button><div class="comparison-heading"><h2 id="mode-comparison-title">组别运行模式对比</h2><p>按组别选择，运行模式将在赛制与赛程确认后锁定</p></div>
      <div class="comparison-grid">
        <article class="comparison-card simple">
          <h3>简易模式 <span>免费</span></h3><h4>球队级赛事管理</h4>
          <ul><li><el-icon><UserFilled /></el-icon>参赛球队管理</li><li><el-icon><Calendar /></el-icon>抽签与赛程</li><li><el-icon><CircleCheck /></el-icon>录入最终比分</li><li><el-icon><Trophy /></el-icon>赛果与球队排名</li><li><el-icon><InfoFilled /></el-icon>不统计球员个人数据</li></ul>
          <el-button plain @click="selectModeFromComparison('simple')">使用简易模式</el-button>
        </article>
        <article class="comparison-card professional">
          <h3><span class="pro-mark">PRO</span> 专业模式</h3><h4>球员级赛事管理</h4>
          <ul><li><el-icon><UserFilled /></el-icon>球员名单与资格核验</li><li><el-icon><Calendar /></el-icon>首发替补与阵容</li><li><el-icon><Medal /></el-icon>进球红黄牌换人事件</li><li><el-icon><Trophy /></el-icon>球员出场与个人统计</li><li><el-icon><CircleCheck /></el-icon>官方电子比赛记录</li><li><el-icon><Lightning /></el-icon>自动积分晋级与赛事档案</li></ul>
          <el-button type="warning" @click="selectModeFromComparison('professional')">为{{ comparisonDivisionLabel }}开通专业版</el-button>
        </article>
      </div>
      <p class="comparison-lock-note">运行模式按竞赛组别确定；赛制与赛程确认后不可更改。</p>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Back, Calendar, CircleCheck, CircleCheckFilled, InfoFilled, Lightning, Location, Medal, Trophy, UserFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { addRecord, queryById, queryList, upgradeDivisionToProfessional } from '../../utils/cloud'
import { permissions } from '../../utils/permissions'
import { getVisualQaSnapshot, visualQaActive } from '../../utils/visualQaFixtures'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id || '')
const qaSnapshot = import.meta.env.DEV && visualQaActive() ? getVisualQaSnapshot() : null
const forceModeComparison = import.meta.env.DEV && window.location.href.includes('view=mode-compare')
const loading = ref(false)
const saving = ref(false)
const comparisonVisible = ref(route.query.view === 'mode-compare' || (import.meta.env.DEV && window.location.href.includes('view=mode-compare')))
const tournament = ref(qaSnapshot?.tournament || {})
const existingCount = ref(qaSnapshot ? 4 : 0)
const requestedDivisionId = String(route.query.divisionId || new URLSearchParams(String(window.location.hash || '').split('?')[1] || '').get('divisionId') || '')
const isUpgradeFlow = computed(() => Boolean(requestedDivisionId))
const form = reactive(qaSnapshot
  ? { name: 'U16组', shortName: 'U16', ageGroup: 'U16', gender: '混合组', expectedTeams: 16, displayOrder: 5, mode: 'simple' }
  : { name: '', shortName: '', ageGroup: 'U16', gender: '男子组', expectedTeams: 16, displayOrder: 1, mode: 'simple' })
const ageOptions = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', '成人组']
const canManage = computed(() => permissions.tournament.manage(tournament.value))
const previewName = computed(() => form.name.trim() || `${form.ageGroup} ${form.gender}`)
const comparisonDivisionLabel = computed(() => {
  if (requestedDivisionId && qaSnapshot) {
    const current = (qaSnapshot.divisions || []).find(item => String(item._id || item.id) === requestedDivisionId)
    if (current) return String(current.shortName || current.name || current.ageGroup || form.shortName || form.name || form.ageGroup)
  }
  return String(form.shortName || form.name || form.ageGroup)
})
const tournamentLogo = computed(() => tournament.value.logoTransparentUrl || tournament.value.logoUrl || tournament.value.logo || '')
const tournamentStatus = computed(() => ({ draft: '筹备中', registering: '报名中', upcoming: '即将开始', ongoing: '进行中', completed: '已结束', finished: '已结束' })[tournament.value.status] || '筹备中')
const dateRange = computed(() => tournament.value.startDate && tournament.value.endDate ? `${formatDate(tournament.value.startDate)}—${formatDate(tournament.value.endDate)}` : '日期待定')

function goBack() { router.push(`/tournaments/${id}/competition`) }
function openModeComparison() { comparisonVisible.value = true; router.replace({ query: { ...route.query, view: 'mode-compare' } }) }
function closeModeComparison() { comparisonVisible.value = false; const query = { ...route.query }; delete query.view; router.replace({ query }) }
function selectModeFromComparison(mode) { form.mode = mode; closeModeComparison() }
function formatDate(value) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '日期待定' : `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, '0')}.${String(parsed.getDate()).padStart(2, '0')}` }
function applyDivisionDraft(division) {
  if (!division) return
  form.name = String(division.name || division.divisionName || form.name)
  form.shortName = String(division.shortName || division.name || form.shortName).slice(0, 12)
  form.ageGroup = String(division.ageGroup || form.ageGroup)
  form.gender = String(division.gender || form.gender)
  form.expectedTeams = Number(division.expectedTeams || division.maxTeams || form.expectedTeams)
  form.displayOrder = Number(division.displayOrder || form.displayOrder)
  form.mode = division.mode === 'professional' || division.isProfessional === true ? 'professional' : 'simple'
}

watch(() => route.query.view, (view) => { comparisonVisible.value = view === 'mode-compare' })

async function loadPage() {
  if (qaSnapshot) return
  loading.value = true
  try {
    const [currentTournament, divisions, requestedDivision] = await Promise.all([
      queryById('tournaments', id),
      queryList('divisions', { where: { tournamentId: id }, orderBy: { createTime: 'asc' }, silent: true }),
      requestedDivisionId ? queryById('divisions', requestedDivisionId) : Promise.resolve(null)
    ])
    tournament.value = Array.isArray(currentTournament) ? currentTournament[0] || {} : currentTournament || {}
    existingCount.value = Array.isArray(divisions) ? divisions.length : 0
    form.displayOrder = existingCount.value + 1
    applyDivisionDraft(Array.isArray(requestedDivision) ? requestedDivision[0] : requestedDivision)
  } finally { loading.value = false }
}

async function createDivision() {
  if (!canManage.value || saving.value) return
  if (!form.name.trim()) { ElMessage.warning('请填写组别名称'); return }
  if (isUpgradeFlow.value) {
    if (form.mode !== 'professional') { ElMessage.warning('请先选择专业模式'); return }
    saving.value = true
    try {
      const result = await upgradeDivisionToProfessional(requestedDivisionId, { tournamentId: id })
      if (!result?.success) throw new Error(result?.error || '升级专业版失败')
      const pendingCount = Array.isArray(result.pendingRosterTeamIds) ? result.pendingRosterTeamIds.length : 0
      ElMessage.success(`已在原竞赛组别上开通专业版，${pendingCount} 支球队进入正式名单待办`)
      router.push({ path: `/tournaments/${id}/teams`, query: { divisionId: requestedDivisionId, mode: 'professional', tab: 'roster' } })
    } catch (error) { ElMessage.error(error.message || '升级专业版失败，请稍后重试') } finally { saving.value = false }
    return
  }
  saving.value = true
  try {
    const result = await addRecord('divisions', {
      tournamentId: id,
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      ageGroup: form.ageGroup,
      gender: form.gender,
      expectedTeams: Number(form.expectedTeams),
      displayOrder: Number(form.displayOrder),
      mode: form.mode,
      isProfessional: form.mode === 'professional',
      ruleStatus: 'draft',
      ruleProgress: 0,
      rulesVersion: '暂未定版',
      createTime: new Date(),
      updateTime: new Date()
    })
    const divisionId = String(result._id || '')
    ElMessage.success('组别已创建，请继续设置赛制')
    router.push({ path: `/tournaments/${id}/competition/rules`, query: { divisionId, step: 'format' } })
  } catch (error) { ElMessage.error(error.message || '创建组别失败，请稍后重试') } finally { saving.value = false }
}

onMounted(() => {
  if (requestedDivisionId && qaSnapshot) applyDivisionDraft((qaSnapshot.divisions || []).find(item => String(item._id || item.id) === requestedDivisionId))
  if (route.query.view === 'mode-compare' || (import.meta.env.DEV && window.location.href.includes('view=mode-compare'))) comparisonVisible.value = true
  loadPage()
})
</script>

<style scoped>
.division-create { width:100%; max-width:var(--admin-content-max-width); margin:0 auto; padding-bottom:104px; color:#1d2a22; }.context-bar { display:flex; align-items:center; justify-content:space-between; min-height:74px; margin:0 calc(var(--admin-content-gutter-x) * -1); padding:0 var(--admin-content-gutter-x); border-bottom:1px solid #e5ebe7; background:#fff; }.tournament-context-copy { display:flex; min-width:0; align-items:center; gap:12px; }.tournament-context-logo { width:46px; height:46px; flex:0 0 46px; object-fit:contain; }.context-mark { display:grid; place-items:center; color:#087542; background:transparent; font-size:22px; }.tournament-context-copy h1 { overflow:hidden; margin:0 6px 0 0; color:#17241d; font-size:23px; text-overflow:ellipsis; white-space:nowrap; }.header-chip,.status-chip { padding:4px 8px; border:1px solid #bce0ff; border-radius:4px; color:#1375da; font-size:13px; white-space:nowrap; }.status-chip { border-color:#bde6ca; color:#21844d; background:#f2fbf5; }.header-meta { display:inline-flex; align-items:center; gap:5px; margin-left:5px; color:#5e6c64; font-size:13px; white-space:nowrap; }.page-heading { display:flex; align-items:flex-end; justify-content:space-between; margin:24px 0 20px; }.page-heading h2 { margin:0; color:#17241d; font-size:26px; }.page-heading p { margin:7px 0 0; color:#718077; font-size:14px; }.create-grid { display:grid; grid-template-columns:minmax(600px,1.7fr) minmax(310px,.75fr); gap:24px; }.form-panel,.preview-card,.hint-card { border:1px solid #e1e9e3; border-radius:12px; background:#fff; box-shadow:0 7px 24px rgba(28,56,38,.045); }.form-panel { padding:28px 32px; }.panel-heading,.mode-title { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }.panel-heading h2,.mode-title h2 { margin:0; font-size:19px; }.panel-heading p,.mode-title p { margin:8px 0 0; color:#78857d; font-size:13px; }.step-badge { padding:5px 10px; border-radius:99px; color:#147543; background:#edf8f0; font-size:12px; }.division-form { margin-top:24px; }.two-columns { display:grid; grid-template-columns:1fr 1fr; gap:20px; }.mode-section { margin-top:6px; padding-top:26px; border-top:1px solid #edf1ee; }.mode-cards { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px; }.mode-card { display:flex; align-items:center; gap:12px; width:100%; padding:16px; border:1px solid #dce6df; border-radius:10px; color:inherit; text-align:left; background:#fff; cursor:pointer; transition:.18s ease; }.mode-card:hover,.mode-card.selected { border-color:#26a867; background:#f6fcf8; box-shadow:0 0 0 3px rgba(29,158,88,.09); }.mode-icon { display:grid; width:37px; height:37px; place-items:center; border-radius:10px; font-size:19px; }.mode-icon.green { color:#07884a; background:#e9f8ed; }.mode-icon.orange { color:#e9830b; background:#fff2df; }.mode-card span:nth-child(2) { min-width:0; flex:1; }.mode-card strong,.mode-card small { display:block; }.mode-card strong { font-size:14px; }.mode-card small { overflow:hidden; margin-top:5px; color:#7a877f; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }.choice { color:#0b9a52; font-size:19px; }.preview-column { display:flex; flex-direction:column; gap:16px; }.preview-card { padding:25px; }.preview-label { margin:0 0 22px; color:#7c897f; font-size:13px; }.preview-name { display:flex; gap:13px; align-items:center; padding-bottom:22px; border-bottom:1px solid #edf1ee; }.preview-name>span { display:grid; width:46px; height:46px; place-items:center; color:#087c42; background:transparent; font-size:23px; }.preview-name h2 { margin:0; font-size:22px; }.preview-name p { margin:5px 0 0; color:#76847b; font-size:13px; }.preview-card dl { margin:18px 0 0; }.preview-card dl>div { display:flex; justify-content:space-between; padding:10px 0; }.preview-card dt { color:#7b887f; font-size:13px; }.preview-card dd { margin:0; color:#2c3c32; font-weight:600; font-size:13px; }.preview-card dd.simple { color:#17814a; }.preview-card dd.professional { color:#d97400; }.preview-card dd.draft { color:#ae7218; }.hint-card { display:flex; gap:10px; padding:16px; color:#65766b; background:#fbfdfb; font-size:13px; line-height:1.65; }.hint-card .el-icon { flex:0 0 auto; margin-top:3px; color:#1b9755; font-size:17px; }.hint-card p { margin:0; }.action-bar { position:fixed; z-index:10; right:0; bottom:0; left:var(--admin-sidebar-width, 0px); display:flex; min-height:82px; align-items:center; justify-content:space-between; padding:17px 28px; border-top:1px solid #e3eae5; background:rgba(255,255,255,.98); box-shadow:0 -7px 22px rgba(28,52,37,.04); }.action-bar>span { color:#3f4e45; font-size:14px; }.action-bar>div { display:flex; gap:10px; }.action-bar :deep(.el-button--primary) { min-width:360px; min-height:54px; font-size:17px; }.permission-alert { margin-top:16px; } @media (max-width:1120px) { .header-meta { display:none; }.create-grid { grid-template-columns:1fr; }.preview-column { display:grid; grid-template-columns:1fr 1fr; }.action-bar { padding-inline:24px; } } @media (max-width:720px) { .context-bar { align-items:flex-start; }.context-bar>.el-button { margin-top:10px; }.two-columns,.mode-cards,.preview-column { grid-template-columns:1fr; }.form-panel { padding:22px; }.action-bar { left:0; padding:14px 18px; }.action-bar>span { display:none; } }
.division-create{box-sizing:border-box;padding:0 var(--admin-content-gutter-x) 104px}.division-create :deep(.el-button--primary){border-color:#087d47;background:#087d47}.division-create :deep(.el-button--primary:hover){border-color:#056a3a;background:#056a3a}.mode-comparison-overlay{position:fixed;z-index:2100;inset:0;display:grid;place-items:center;padding:36px;background:rgba(10,25,17,.62)}.mode-comparison-dialog{position:relative;box-sizing:border-box;width:min(830px,100%);max-height:calc(100vh - 72px);overflow:auto;padding:24px 34px 22px;border-radius:10px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.32)}.comparison-close{position:absolute;top:13px;right:18px;width:30px;height:30px;border:0;border-radius:50%;color:#6b776f;background:transparent;font-size:27px;line-height:26px;cursor:pointer}.comparison-close:hover{color:#1c3024;background:#edf3ee}.comparison-heading { text-align:center; }.comparison-heading h2 { margin:0; color:#151c18; font-size:27px; }.comparison-heading p { margin:8px 0 0; color:#66736c; font-size:14px; }.comparison-grid { display:grid; grid-template-columns:1fr 1fr; gap:26px; margin-top:15px; }.comparison-card { display:flex; min-height:455px; flex-direction:column; padding:25px 38px 30px; border:1px solid #b8d5c2; border-radius:9px; background:linear-gradient(180deg,#fff,#f8fcf9); }.comparison-card.professional { border:1px solid #e0ae31; color:#fff; background:linear-gradient(145deg,#003c2b,#00593a 62%,#003f2e); box-shadow:inset 0 0 50px rgba(0,25,16,.25); }.comparison-card h3 { margin:0; color:#163d29; text-align:center; font-size:25px; }.comparison-card h3>span:not(.pro-mark) { margin-left:8px; padding:3px 8px; border:1px solid #55a775; border-radius:5px; color:#078442; font-size:13px; }.comparison-card.professional h3,.comparison-card.professional h4 { color:#f7c740; }.pro-mark { display:inline-grid; place-items:center; width:48px; height:38px; margin-right:9px; border:2px solid #f0bc32; border-radius:5px; font-size:15px; }.comparison-card h4 { margin:13px 0 11px; color:#17231c; text-align:center; font-size:18px; }.comparison-card ul { flex:1; margin:8px 0 20px; padding:0; list-style:none; }.comparison-card li { display:flex; align-items:center; gap:12px; min-height:37px; color:#31513f; font-size:14px; }.comparison-card.professional li { color:#fff; }.comparison-card li .el-icon { color:#087c43; font-size:18px; }.comparison-card.professional li .el-icon { color:#f4bf30; }.comparison-card :deep(.el-button) { width:100%; min-height:51px; font-size:16px; }.comparison-card.professional :deep(.el-button--warning) { border-color:#f3c554; color:#4b3600; background:linear-gradient(180deg,#ffdc77,#eeb63d); }.comparison-lock-note { margin:20px 0 0; color:#6c756f; text-align:center; font-size:13px; letter-spacing:.08em; }
</style>
