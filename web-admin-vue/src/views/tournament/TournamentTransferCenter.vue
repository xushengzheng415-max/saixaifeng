<template>
  <div class="transfer-center-page" v-loading="initialLoading">
    <header class="page-header">
      <div>
        <p class="eyebrow">赛事转会中心</p>
        <h1>转会审核</h1>
        <p class="subtitle">{{ contextText }}</p>
      </div>
      <div class="header-actions">
        <el-button plain @click="backToTournamentSpace">
          <el-icon><ArrowLeft /></el-icon>返回赛事空间
        </el-button>
        <el-button plain :loading="windowLoading || listLoading" @click="reloadAll">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canConfigure" type="primary" plain @click="openWindowDialog">
          <el-icon><Setting /></el-icon>窗口管理
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="permissionError"
      :title="permissionError"
      description="当前账号没有该赛事的转会审核权限。请确认赛事归属，或由赛事负责人授予转会权限后重试。"
      type="error"
      show-icon
      :closable="false"
      class="blocking-alert"
    >
      <div class="alert-actions">
        <el-button link type="primary" @click="reloadAll">重新加载</el-button>
        <el-button link @click="backToTournamentSpace">返回赛事空间</el-button>
      </div>
    </el-alert>

    <template v-else>
      <section v-if="!windowView.configured" class="window-card" :class="`window-${windowView.tone}`">
        <div class="window-state">
          <span class="window-dot"></span>
          <div>
            <strong>{{ windowView.stateText }}</strong>
            <small>{{ windowView.rangeText }}</small>
          </div>
        </div>
        <div class="window-meta">
          <span>赛季：{{ windowView.seasonText }}</span>
          <span v-if="windowView.updatedText">最近修改：{{ windowView.updatedText }}</span>
        </div>
      </section>
      <el-alert
        v-if="windowNotice"
        :title="windowNotice"
        type="warning"
        show-icon
        :closable="false"
        class="window-notice"
      >
        <el-button link type="primary" @click="loadWindow">重新读取窗口</el-button>
      </el-alert>
      <p v-if="!windowView.configured && windowView.notes.length" class="window-note">{{ windowView.notes.join('；') }}</p>

      <section class="table-card">
        <el-tabs v-model="activeTab" class="transfer-tabs" @tab-change="handleTabChange">
          <el-tab-pane :label="tabLabelOf('待审核', tabCounts.pending)" name="pending" />
          <el-tab-pane :label="tabLabelOf('已审核', tabCounts.reviewed)" name="reviewed" />
          <el-tab-pane :label="tabLabelOf('全部', tabCounts.all)" name="all" />
        </el-tabs>

        <div class="filter-bar">
          <el-input
            v-model="filters.playerId"
            class="filter-keyword"
            placeholder="球员编号（精确匹配）"
            clearable
            @keyup.enter="applyFilters"
            @clear="applyFilters"
          />
          <el-select
            v-model="filters.teamId"
            class="filter-team"
            placeholder="球队"
            clearable
            filterable
            :disabled="teamOptionsUnavailable || teamsLoading"
          >
            <el-option v-for="team in teamOptions" :key="team.id" :label="team.name" :value="team.id" />
          </el-select>
          <el-select v-model="filters.type" class="filter-type" placeholder="方式" clearable>
            <el-option label="正式转会" value="permanent" />
            <el-option label="租借" value="loan" />
            <el-option label="租借转永久" value="loan_permanent" />
            <el-option label="租借续租" value="loan_renewal" />
          </el-select>
          <div class="filter-range">
            <el-date-picker v-model="filters.dateFrom" class="filter-date" type="date" placeholder="提交日期起" />
            <span class="filter-dash">—</span>
            <el-date-picker v-model="filters.dateTo" class="filter-date" type="date" placeholder="提交日期止" />
          </div>
          <div class="filter-actions">
            <el-button type="primary" plain :loading="listLoading" @click="applyFilters">查询</el-button>
            <el-button plain @click="resetFilters">重置</el-button>
          </div>
        </div>
        <p class="filter-note">
          球队、方式与日期筛选作用于转会单；自由球员签约记录在已审核与全部标签中始终显示。
          <span v-if="teamOptionsUnavailable">球队列表暂不可读，可按球员编号或方式查询。</span>
        </p>
        <p v-if="listNotice" class="filter-note">{{ listNotice }}</p>

        <el-alert
          v-if="listError"
          :title="listError"
          type="error"
          show-icon
          :closable="false"
          class="list-error"
        >
          <el-button link type="primary" @click="loadList">重新加载</el-button>
        </el-alert>

        <template v-else>
          <el-table v-if="rows.length" :data="rows" row-key="id" class="transfer-table">
            <el-table-column label="球员" :min-width="tableMode === 'tiny' ? 110 : (tableMode === 'compact' ? 120 : 130)">
              <template #default="{ row }">
                <strong class="cell-main">{{ row.playerName }}</strong>
                <small class="cell-sub">{{ row.playerId ? `编号 ${row.playerId}` : '编号待核对' }}</small>
                <small v-if="tableMode !== 'full'" class="cell-sub">{{ row.submittedText }}</small>
              </template>
            </el-table-column>
            <el-table-column label="原队 → 目标队" :min-width="tableMode === 'tiny' ? 150 : (tableMode === 'compact' ? 160 : 180)">
              <template #default="{ row }">
                <span class="cell-route">{{ row.routeText }}</span>
                <small v-if="tableMode === 'tiny'" class="cell-sub">{{ row.typeText }}</small>
              </template>
            </el-table-column>
            <el-table-column v-if="tableMode !== 'tiny'" prop="typeText" label="方式" :width="tableMode === 'compact' ? 95 : 110" />
            <el-table-column prop="amountText" label="金额" class-name="amount-cell" :width="tableMode === 'tiny' ? 108 : (tableMode === 'compact' ? 105 : 120)" align="right" />
            <el-table-column v-if="tableMode === 'full'" prop="progressText" label="轮次" width="85" />
            <el-table-column label="状态" :width="tableMode === 'tiny' ? 104 : (tableMode === 'compact' ? 125 : 135)">
              <template #default="{ row }">
                <el-tag :type="row.statusTone" effect="light" size="small">{{ row.statusText }}</el-tag>
                <small v-if="row.waitingText" class="cell-sub">{{ row.waitingText }}</small>
              </template>
            </el-table-column>
            <el-table-column v-if="tableMode === 'full'" prop="submittedText" label="提交时间" width="145" />
            <el-table-column label="操作" :width="tableMode === 'tiny' ? 90 : (tableMode === 'compact' ? 95 : 110)" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openRecord(row)">{{ row.actionText }}</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else-if="!listLoading" :description="emptyText" />
          <div v-if="total > 0" class="pagination-wrapper">
            <el-pagination
              v-model:current-page="page"
              :page-size="pageSize"
              :total="total"
              layout="total, prev, pager, next"
              @current-change="handlePageChange"
            />
          </div>
        </template>
      </section>
    </template>

    <!-- PC02 审核抽屉 / PC04 只读记录 -->
    <el-drawer v-model="drawerVisible" class="transfer-drawer" size="720px" :with-header="true" @closed="resetDrawer">
      <template #header>
        <div class="drawer-heading">
          <p class="eyebrow">{{ detail && detail.kind === 'free_agent' ? '自由球员签约' : '赛事转会' }}</p>
          <h2>{{ drawerTitle }}</h2>
          <p v-if="detail" class="drawer-subtitle">{{ detail.routeText }} · {{ detail.typeText }}</p>
        </div>
      </template>

      <div class="record-body" v-loading="recordLoading">
        <el-alert
          v-if="recordError"
          :title="recordError"
          type="error"
          show-icon
          :closable="false"
        >
          <el-button link type="primary" @click="reloadRecord">重新加载</el-button>
        </el-alert>

        <template v-else-if="detail">
          <div class="record-status" :class="`tone-${detail.statusTone}`">
            <div>
              <strong>{{ detail.playerName }}</strong>
              <small>球员编号 {{ detail.playerId || '—' }}</small>
            </div>
            <el-tag :type="detail.statusTone" effect="light">{{ detail.statusText }}</el-tag>
          </div>
          <el-alert
            v-if="detail.reviewBlockedText"
            :title="detail.reviewBlockedText"
            :type="detail.canReview ? 'info' : 'warning'"
            :closable="false"
            show-icon
          />

          <section class="record-section">
            <h3>球员与双方球队</h3>
            <dl class="record-grid">
              <div><dt>球员</dt><dd>{{ detail.playerName }}</dd></div>
              <div><dt>球员编号</dt><dd>{{ detail.playerId || '—' }}</dd></div>
              <div><dt>原球队</dt><dd>{{ detail.fromTeamName }}</dd></div>
              <div><dt>目标球队</dt><dd>{{ detail.toTeamName }}</dd></div>
              <div><dt>赛季</dt><dd>{{ detail.seasonText }}</dd></div>
              <div v-if="detail.kind === 'free_agent'"><dt>完成时间</dt><dd>{{ detail.completedText }}</dd></div>
            </dl>
          </section>

          <section class="record-section">
            <h3>{{ detail.kind === 'free_agent' ? '签约说明' : '最终条款' }}</h3>
            <p v-if="detail.termsNote" class="muted">{{ detail.termsNote }}</p>
            <dl class="record-grid">
              <div v-for="row in detail.termsRows" :key="row.key"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
            </dl>
          </section>

          <section v-if="detail.kind === 'request'" class="record-section">
            <h3>双方确认</h3>
            <dl class="record-grid">
              <div v-for="row in detail.confirmations" :key="row.key"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
            </dl>
          </section>

          <section v-if="detail.kind === 'free_agent'" class="record-section">
            <h3>参考身价与签约规则</h3>
            <p class="valuation-line">
              <strong>{{ detail.valuationText }}</strong>
              <span>{{ detail.valuationNote }}</span>
            </p>
            <dl class="record-grid">
              <div v-for="row in detail.policyRows" :key="row.key"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
              <div><dt>合同</dt><dd>{{ detail.contractText }}</dd></div>
            </dl>
          </section>

          <section v-if="detail.review" class="record-section">
            <h3>审核决定</h3>
            <p class="review-line">
              <el-tag :type="detail.review.tone" effect="light">{{ detail.review.decisionText }}</el-tag>
              <span>{{ detail.review.atText }} · {{ detail.review.reviewerText }}</span>
            </p>
            <p v-if="detail.review.versionText" class="muted">{{ detail.review.versionText }}</p>
            <p class="review-reason">理由：{{ detail.review.reasonText }}</p>
          </section>

          <section v-if="detail.handover" class="record-section">
            <h3>生效与交接</h3>
            <p class="handover-line" :class="{ done: detail.handover.done }">
              {{ detail.handover.statusText }} · {{ detail.handover.completedText }}
            </p>
            <p class="muted mono">{{ detail.handover.contractText }}</p>
            <p v-if="detail.handover.loanText" class="muted mono">{{ detail.handover.loanText }}</p>
            <p v-if="detail.handover.membershipText" class="muted mono">{{ detail.handover.membershipText }}</p>
          </section>

          <section v-if="detail.offers.length" class="record-section">
            <h3>报价历史</h3>
            <el-table :data="detail.offers" size="small" class="offer-table">
              <el-table-column prop="versionText" label="版本" width="70" />
              <el-table-column prop="byText" label="提交方" width="100" />
              <el-table-column prop="amountText" label="金额" width="130" align="right" />
              <el-table-column prop="summaryText" label="方式与期限" min-width="180" />
              <el-table-column prop="timeText" label="时间" width="150" />
            </el-table>
          </section>

          <section v-if="detail.events.length" class="record-section">
            <h3>操作日志</h3>
            <ol class="event-list">
              <li v-for="event in detail.events" :key="event.seq">
                <span class="event-time">{{ event.timeText }}</span>
                <div>
                  <strong>{{ event.actionText }}</strong>
                  <small>{{ event.actorText }} · {{ event.transitionText }}</small>
                  <p v-if="event.detailText !== '—'">{{ event.detailText }}</p>
                </div>
              </li>
            </ol>
          </section>

          <section v-if="detail.canReview" class="record-section reject-section">
            <h3>拒绝理由</h3>
            <el-input
              v-model="rejectReason"
              type="textarea"
              :rows="3"
              maxlength="200"
              show-word-limit
              placeholder="拒绝时必填，2 至 200 字"
            />
            <p v-if="reviewError" class="field-error">{{ reviewError }}</p>
          </section>

          <p v-for="note in detail.notes" :key="note" class="record-note">{{ note }}</p>
        </template>
      </div>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="drawerVisible = false">{{ detail && detail.canReview ? '取消' : '关闭' }}</el-button>
          <template v-if="detail && detail.canReview">
            <el-button type="danger" plain :loading="rejecting" :disabled="submitting" @click="rejectTransfer">拒绝</el-button>
            <el-button type="primary" :loading="approving" :disabled="submitting" @click="approveTransfer">确认转会</el-button>
          </template>
        </div>
      </template>
    </el-drawer>

    <!-- PC03 窗口配置 -->
    <el-dialog v-model="windowDialogVisible" title="转会窗口" width="560px" :close-on-click-modal="false">
      <div class="window-dialog">
        <p class="muted">赛事：{{ tournamentName || '当前赛事' }}</p>
        <div class="window-current">
          <el-tag :type="windowTagType" effect="light">{{ windowView.stateText }}</el-tag>
          <span>{{ windowView.rangeText }}</span>
        </div>
        <el-form label-position="top" class="window-form" @submit.prevent>
          <el-form-item label="赛季标识">
            <el-input v-model="windowForm.seasonKey" maxlength="40" show-word-limit placeholder="例如 2026秋季赛" />
          </el-form-item>
          <el-form-item label="窗口开始时间（北京时间）">
            <el-date-picker v-model="windowForm.openFrom" type="datetime" placeholder="选择开始时间" style="width: 100%" />
          </el-form-item>
          <el-form-item label="窗口结束时间（北京时间）">
            <el-date-picker v-model="windowForm.openTo" type="datetime" placeholder="选择结束时间" style="width: 100%" />
          </el-form-item>
        </el-form>
        <p v-if="windowError" class="field-error">{{ windowError }}</p>
        <p v-if="windowView.updatedText" class="muted">
          最近修改：{{ windowView.updatedText }}
          <span v-if="windowView.updatedBy"> · 操作人编号 {{ windowView.updatedBy }}</span>
        </p>
        <p v-for="note in windowView.notes" :key="note" class="muted">{{ note }}</p>
      </div>
      <template #footer>
        <el-button @click="windowDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="windowSaving" @click="saveWindow">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Refresh, Setting } from '@element-plus/icons-vue'
import { callFunction, queryList } from '../../utils/cloud'
import {
  dateRangePayloadOf,
  emptyTextOf,
  errorTextOf,
  isForbiddenError,
  recordViewOf,
  reviewSummaryTextOf,
  rowOf,
  tabCountsOf,
  tabLabelOf,
  windowFormIssue,
  windowFormOf,
  windowSavePayload,
  windowViewOf
} from '../../utils/transferCenterView'

const route = useRoute()
const router = useRouter()

const initialLoading = ref(true)
const windowLoading = ref(false)
const listLoading = ref(false)
const teamsLoading = ref(false)
const windowNotice = ref('')
const permissionError = ref('')
const listError = ref('')
const listNotice = ref('')

const tournamentName = ref('')
const windowRaw = ref({})
const windowView = ref(windowViewOf({}))
const canConfigure = ref(false)

const activeTab = ref('pending')
const tabCounts = ref(tabCountsOf(null))
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = ref(emptyFilters())
const teamOptions = ref([])
const teamOptionsUnavailable = ref(false)
// 列表列宽按视口分三档：宽屏完整展示；中屏收起“轮次/提交时间”（提交时间并入球员列）；
// 窄屏再收起“方式”（并入球队列），避免表格横向滚动或被右侧固定操作列遮挡。
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)
const tableMode = computed(() => {
  if (viewportWidth.value > 1360) return 'full'
  if (viewportWidth.value > 1100) return 'compact'
  return 'tiny'
})
function syncViewportWidth() { viewportWidth.value = window.innerWidth }
if (typeof window !== 'undefined') window.addEventListener('resize', syncViewportWidth)
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', syncViewportWidth)
})

const drawerVisible = ref(false)
const recordLoading = ref(false)
const recordError = ref('')
const detail = ref(null)
const currentRecordId = ref('')
const rejectReason = ref('')
const reviewError = ref('')
const approving = ref(false)
const rejecting = ref(false)

const windowDialogVisible = ref(false)
const windowForm = ref({ seasonKey: '', openFrom: null, openTo: null, version: 0 })
const windowError = ref('')
const windowSaving = ref(false)

const tournamentId = computed(() => String(route.params.id || ''))
const submitting = computed(() => approving.value || rejecting.value)
const drawerTitle = computed(() => {
  if (!detail.value) return '转会记录'
  return detail.value.canReview ? '转会审核' : '转会记录'
})
const contextText = computed(() => {
  const name = tournamentName.value || '当前赛事'
  return `${name} · 赛季 ${windowView.value.seasonText} · ${windowView.value.stateText}`
})
const emptyText = computed(() => (listError.value ? '转会记录未加载' : emptyTextOf(activeTab.value)))
const windowTagType = computed(() => {
  if (windowView.value.state === 'open') return 'success'
  if (windowView.value.state === 'scheduled') return 'warning'
  return 'info'
})

let listSeq = 0
let recordSeq = 0

function emptyFilters() {
  return { playerId: '', teamId: '', type: '', dateFrom: null, dateTo: null }
}

// 云函数业务错误以 {success:false, code, error} 返回；统一转成可显示的 Error，保留 code。
async function api(data) {
  const reply = await callFunction('dataCenter', data, 30000)
  if (!reply || reply.success === false) {
    const failure = new Error((reply && (reply.error || reply.message)) || '数据操作失败，请重试')
    failure.code = (reply && reply.code) || ''
    throw failure
  }
  return reply
}

async function loadWindow() {
  windowLoading.value = true
  windowNotice.value = ''
  try {
    const reply = await api({ action: 'transferWindowGet', tournamentId: tournamentId.value })
    windowRaw.value = reply.window || {}
    windowView.value = windowViewOf(reply)
    canConfigure.value = Boolean(reply.canConfigure)
    tournamentName.value = String((reply.tournament && reply.tournament.name) || '')
  } catch (error) {
    if (isForbiddenError(error)) permissionError.value = '无转会管理权限'
    else windowNotice.value = '转会窗口状态未加载，可稍后重试'
  } finally {
    windowLoading.value = false
  }
}

async function loadTeams() {
  teamsLoading.value = true
  teamOptionsUnavailable.value = false
  try {
    const relations = await queryList('tournament_teams', {
      where: { tournamentId: tournamentId.value },
      orderBy: { createTime: 'desc' },
      limit: 500,
      throwOnError: true,
      silent: true
    })
    const inactive = ['deleted', 'rejected', 'cancelled', 'withdrawn', 'removed', 'replaced']
    const teamIds = [...new Set((Array.isArray(relations) ? relations : [])
      .filter(row => !inactive.includes(String(row.status || '')))
      .map(row => String(row.teamId || ''))
      .filter(Boolean))]
    const teams = teamIds.length
      ? await queryList('teams', { where: { _id: { $in: teamIds } }, limit: 500, throwOnError: true, silent: true })
      : []
    teamOptions.value = (Array.isArray(teams) ? teams : [])
      .map(team => ({ id: String(team._id || ''), name: String(team.name || team.teamName || '') || '未命名球队' }))
      .filter(team => team.id)
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  } catch (error) {
    teamOptions.value = []
    teamOptionsUnavailable.value = true
  } finally {
    teamsLoading.value = false
  }
}

async function loadList() {
  const seq = ++listSeq
  const requestedTournamentId = tournamentId.value
  listLoading.value = true
  listError.value = ''
  try {
    const params = {
      action: 'transferAdminRequests',
      tournamentId: requestedTournamentId,
      tab: activeTab.value,
      page: page.value,
      pageSize: pageSize.value
    }
    const keyword = String(filters.value.playerId || '').trim()
    if (keyword) params.playerId = keyword
    if (filters.value.teamId) params.teamId = String(filters.value.teamId)
    if (filters.value.type) params.type = String(filters.value.type)
    const range = dateRangePayloadOf(filters.value.dateFrom, filters.value.dateTo)
    if (range.dateFrom) params.dateFrom = range.dateFrom
    if (range.dateTo) params.dateTo = range.dateTo
    const reply = await api(params)
    if (seq !== listSeq || requestedTournamentId !== tournamentId.value) return
    rows.value = (Array.isArray(reply.items) ? reply.items : []).map(rowOf)
    total.value = Number(reply.total || 0)
    tabCounts.value = tabCountsOf(reply.totals)
    // 服务端在两个集合都不可读时会明确标注；此处如实提示，不把“集合未建立”说成“暂无转会”。
    listNotice.value = reply.requestsState === 'not_recorded' || reply.recordsState === 'not_recorded'
      ? '转会记录集合尚未建立，当前按空记录展示。'
      : ''
  } catch (error) {
    if (seq !== listSeq) return
    rows.value = []
    total.value = 0
    tabCounts.value = tabCountsOf(null)
    listNotice.value = ''
    if (isForbiddenError(error)) permissionError.value = '无转会管理权限'
    else listError.value = '转会记录未加载'
  } finally {
    if (seq === listSeq) listLoading.value = false
  }
}

async function reloadAll() {
  permissionError.value = ''
  listError.value = ''
  await loadWindow()
  if (permissionError.value) return
  await Promise.all([loadList(), loadTeams()])
}

function applyFilters() {
  page.value = 1
  loadList()
}

function resetFilters() {
  filters.value = emptyFilters()
  page.value = 1
  loadList()
}

function handleTabChange() {
  page.value = 1
  loadList()
}

function handlePageChange(value) {
  page.value = value
  loadList()
}

function backToTournamentSpace() {
  router.push('/tournament-space')
}

async function openRecord(row) {
  drawerVisible.value = true
  detail.value = null
  recordError.value = ''
  currentRecordId.value = String(row.id || '')
  rejectReason.value = ''
  reviewError.value = ''
  await loadRecord(currentRecordId.value)
}

async function loadRecord(recordId) {
  const targetId = String(recordId || currentRecordId.value || '')
  if (!targetId) return
  const seq = ++recordSeq
  currentRecordId.value = targetId
  recordLoading.value = true
  recordError.value = ''
  try {
    const reply = await api({ action: 'transferAdminRecord', requestId: targetId })
    if (seq !== recordSeq || !drawerVisible.value) return
    detail.value = recordViewOf(reply)
  } catch (error) {
    if (seq !== recordSeq) return
    detail.value = null
    recordError.value = isForbiddenError(error) ? '无记录访问权限' : '转会记录未加载'
  } finally {
    if (seq === recordSeq) recordLoading.value = false
  }
}

function reloadRecord() {
  loadRecord(currentRecordId.value)
}

function resetDrawer() {
  recordSeq += 1
  detail.value = null
  recordError.value = ''
  currentRecordId.value = ''
  rejectReason.value = ''
  reviewError.value = ''
}

// 审核失败一律回读服务端最新状态：版本冲突、已被他人处理与网络中断都先看真实结果，
// 不重复批准、不按本地缓存猜测成功。
async function refreshAfterReviewFailure(error) {
  const message = errorTextOf(error)
  reviewError.value = message
  ElMessage.error(message)
  await loadRecord(currentRecordId.value)
}

async function approveTransfer() {
  if (!detail.value || !detail.value.canReview || submitting.value) return
  try {
    await ElMessageBox.confirm(
      `${reviewSummaryTextOf(detail.value)}\n\n确认后将立即完成归属交接，金额线下交付，平台不收款。`,
      '确认转会',
      { confirmButtonText: '确认转会', cancelButtonText: '取消', type: 'warning' }
    )
  } catch (_) {
    return
  }
  approving.value = true
  reviewError.value = ''
  try {
    const reply = await api({
      action: 'transferReview',
      requestId: detail.value.id,
      decision: 'approve',
      expectedOfferVersion: detail.value.agreedVersion
    })
    const handoverDone = reply && reply.handover && reply.handover.status === 'done'
    ElMessage.success(handoverDone ? '转会已完成，归属交接已记录' : '审核已通过，请刷新核对交接状态')
    await Promise.all([loadList(), loadRecord(detail.value.id)])
  } catch (error) {
    await refreshAfterReviewFailure(error)
  } finally {
    approving.value = false
  }
}

async function rejectTransfer() {
  if (!detail.value || !detail.value.canReview || submitting.value) return
  const note = String(rejectReason.value || '').trim()
  if (note.length < 2 || note.length > 200) {
    reviewError.value = '拒绝须填写 2 至 200 字的理由'
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认拒绝“${detail.value.playerName}”的这笔转会吗？\n理由：${note}\n\n拒绝只保存审核结果，不修改球队归属。`,
      '拒绝转会',
      { confirmButtonText: '确认拒绝', cancelButtonText: '取消', type: 'warning' }
    )
  } catch (_) {
    return
  }
  rejecting.value = true
  reviewError.value = ''
  try {
    await api({
      action: 'transferReview',
      requestId: detail.value.id,
      decision: 'reject',
      expectedOfferVersion: detail.value.agreedVersion,
      reason: note
    })
    ElMessage.success('已拒绝该笔转会，球队归属未改动')
    await Promise.all([loadList(), loadRecord(detail.value.id)])
  } catch (error) {
    await refreshAfterReviewFailure(error)
  } finally {
    rejecting.value = false
  }
}

function openWindowDialog() {
  windowForm.value = windowFormOf(windowRaw.value)
  windowError.value = ''
  windowDialogVisible.value = true
}

async function saveWindow() {
  if (windowSaving.value) return
  const issue = windowFormIssue(windowForm.value)
  if (issue) {
    windowError.value = issue
    return
  }
  windowSaving.value = true
  windowError.value = ''
  try {
    await api(windowSavePayload(tournamentId.value, windowForm.value))
    ElMessage.success('窗口设置已保存')
    await loadWindow()
    windowForm.value = windowFormOf(windowRaw.value)
    await loadList()
  } catch (error) {
    windowError.value = errorTextOf(error)
    if (String(error.code || '') === 'TRANSFER_WINDOW_STALE') {
      await loadWindow()
      windowForm.value = windowFormOf(windowRaw.value)
    }
  } finally {
    windowSaving.value = false
  }
}

function resetForTournamentChange() {
  windowRaw.value = {}
  windowView.value = windowViewOf({})
  tournamentName.value = ''
  canConfigure.value = false
  windowNotice.value = ''
  permissionError.value = ''
  listError.value = ''
  listNotice.value = ''
  activeTab.value = 'pending'
  tabCounts.value = tabCountsOf(null)
  filters.value = emptyFilters()
  teamOptions.value = []
  teamOptionsUnavailable.value = false
  rows.value = []
  total.value = 0
  page.value = 1
  drawerVisible.value = false
  resetDrawer()
}

watch(tournamentId, async () => {
  resetForTournamentChange()
  initialLoading.value = true
  await reloadAll()
  initialLoading.value = false
})

onMounted(async () => {
  await reloadAll()
  initialLoading.value = false
})
</script>

<style scoped>
.transfer-center-page { min-height: 100%; padding: 28px 32px 48px; background: #f4f7f5; color: #17221a; }
.page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
.eyebrow { margin: 0 0 8px; color: #16834b; font-size: 13px; font-weight: 700; letter-spacing: .04em; }
h1 { margin: 0; font-size: 28px; line-height: 1.25; }
.subtitle { margin: 10px 0 0; color: #69766d; font-size: 14px; }
.header-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
.blocking-alert, .window-notice, .list-error { margin-bottom: 16px; }
.alert-actions { display: flex; gap: 8px; margin-top: 6px; }

.window-card { display: flex; justify-content: space-between; gap: 18px; align-items: center; margin-bottom: 12px; padding: 18px 20px; border: 1px solid #e0e9e2; border-radius: 16px; background: #fff; box-shadow: 0 8px 22px rgba(36, 82, 52, .06); }
.window-state { display: flex; gap: 12px; align-items: center; min-width: 0; }
.window-state strong { display: block; font-size: 16px; }
.window-state small { display: block; margin-top: 3px; color: #6b776e; font-size: 13px; }
.window-dot { width: 10px; height: 10px; border-radius: 50%; background: #9aa69d; flex: 0 0 10px; }
.window-open .window-dot { background: #1f9d55; }
.window-open { border-left: 4px solid #1f9d55; }
.window-scheduled { border-left: 4px solid #d69a2d; }
.window-scheduled .window-dot { background: #d69a2d; }
.window-closed { border-left: 4px solid #8b958e; }
.window-meta { display: flex; flex-wrap: wrap; gap: 8px 18px; justify-content: flex-end; color: #6b776e; font-size: 13px; }
.window-note { margin: 0 0 16px; color: #7a867d; font-size: 12px; }

.table-card { padding: 20px; border: 1px solid #e0e9e2; border-radius: 16px; background: #fff; box-shadow: 0 8px 22px rgba(36, 82, 52, .06); }
.transfer-tabs { margin-top: -8px; }
/* 筛选控件统一进网格：宽屏一行对齐，窗口变窄按列折行，不会出现半个控件换行。 */
.filter-bar {
  display: grid;
  /* 日期区间占两列，查询/重置按内容宽度贴行尾，其余控件按比例分宽。 */
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, .85fr) minmax(0, 1.05fr) minmax(0, 1.05fr) max-content;
  gap: 10px;
  align-items: center;
  padding: 4px 0 10px;
}
.filter-range { display: flex; grid-column: span 2; gap: 6px; align-items: center; min-width: 0; }
.filter-actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
.filter-dash { color: #8b958e; font-size: 12px; }
.filter-keyword, .filter-team, .filter-type { width: 100%; min-width: 0; }
.filter-range .filter-date { flex: 1 1 0; width: auto; min-width: 0; }
.filter-note { margin: 0 0 12px; color: #7a867d; font-size: 12px; line-height: 1.6; }
.transfer-table { width: 100%; }
/* 金额不折行：窄屏列变窄时保持单行右对齐，避免“¥”和数字被拆成两行。 */
.transfer-table :deep(.amount-cell .cell) { white-space: nowrap; }
.cell-main { display: block; color: #24352a; font-size: 14px; }
.cell-sub { display: block; margin-top: 2px; color: #8b958e; font-size: 12px; }
.cell-route { color: #43564a; font-size: 13px; }
.pagination-wrapper { display: flex; justify-content: flex-end; padding-top: 16px; }

.drawer-heading h2 { margin: 2px 0 0; font-size: 20px; }
.drawer-heading .eyebrow { margin-bottom: 2px; }
.drawer-subtitle { margin: 6px 0 0; color: #69766d; font-size: 13px; }
.record-body { min-height: 220px; }
.record-status { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 14px; padding: 14px 16px; border: 1px solid #e0e9e2; border-radius: 12px; background: #fbfdfb; }
.record-status strong { display: block; font-size: 17px; }
.record-status small { display: block; margin-top: 3px; color: #7a867d; font-size: 12px; }
.tone-success { border-left: 4px solid #1f9d55; }
.tone-warning { border-left: 4px solid #d69a2d; }
.tone-danger { border-left: 4px solid #c94a43; }
.tone-primary { border-left: 4px solid #2f6fa8; }
.tone-info { border-left: 4px solid #8b958e; }
.record-section { margin-top: 18px; padding-top: 16px; border-top: 1px solid #edf1ee; }
.record-section h3 { margin: 0 0 10px; font-size: 15px; }
.record-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; margin: 0; }
.record-grid dt { color: #7a867d; font-size: 12px; }
.record-grid dd { margin: 3px 0 0; color: #24352a; font-size: 14px; word-break: break-all; }
.valuation-line { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; margin: 0 0 12px; }
.valuation-line strong { font-size: 20px; color: #12653a; }
.valuation-line span { color: #7a867d; font-size: 12px; }
.review-line { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 0 0 8px; color: #69766d; font-size: 13px; }
.review-reason { margin: 6px 0 0; color: #43564a; font-size: 13px; line-height: 1.6; word-break: break-word; }
.handover-line { margin: 0 0 8px; color: #b36b16; font-size: 14px; }
.handover-line.done { color: #16834b; }
.offer-table { width: 100%; }
.event-list { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.event-list li { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f2; }
.event-list li:last-child { border-bottom: 0; }
.event-time { color: #8b958e; font-size: 12px; }
.event-list strong { display: block; color: #24352a; font-size: 13px; }
.event-list small { display: block; margin-top: 2px; color: #7a867d; font-size: 12px; }
.event-list p { margin: 4px 0 0; color: #56645a; font-size: 12px; line-height: 1.6; word-break: break-word; }
.reject-section .el-input { margin-top: 2px; }
.field-error { margin: 6px 0 0; color: #c94a43; font-size: 12px; }
.record-note { margin: 10px 0 0; color: #8b958e; font-size: 12px; line-height: 1.6; }
.muted { color: #7a867d; font-size: 12px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break: break-all; }
.drawer-footer { display: flex; justify-content: flex-end; gap: 8px; }

.window-dialog .muted { margin: 0 0 8px; line-height: 1.7; }
.window-current { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin-bottom: 14px; color: #43564a; font-size: 13px; }
.window-form { margin-bottom: 4px; }

@media (max-width: 1100px) {
  /* 窄屏改成两列：筛选控件保持整宽折行，查询/重置落在下一行左侧。 */
  .filter-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .filter-type { grid-column: span 2; }
  .filter-actions { grid-column: span 2; justify-content: flex-start; }
  .window-card { align-items: flex-start; }
  .window-meta { justify-content: flex-start; }
}
@media (max-width: 760px) {
  .transfer-center-page { padding: 20px 14px 32px; }
  .page-header { display: block; }
  .header-actions { justify-content: flex-start; margin-top: 14px; }
  .window-card { display: block; }
  .window-meta { margin-top: 10px; }
  .record-grid { grid-template-columns: 1fr; }
  .event-list li { grid-template-columns: 1fr; gap: 4px; }
}
</style>
