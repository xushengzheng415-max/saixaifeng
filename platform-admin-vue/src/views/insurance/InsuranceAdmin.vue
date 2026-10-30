<template>
  <section class="insurance-admin">
    <div class="toolbar">
      <el-select v-model="days" style="width:130px" @change="loadOverview">
        <el-option label="今天" :value="1" />
        <el-option label="近 7 天" :value="7" />
        <el-option label="近 30 天" :value="30" />
        <el-option label="近 90 天" :value="90" />
      </el-select>
      <el-button :loading="overviewLoading || listLoading || linkLoading" @click="refreshAll">刷新数据</el-button>
      <span class="source">口径：已上传保单凭证；外链点击只算投保引导，不算成交</span>
    </div>

    <div v-if="error" class="error" role="alert">{{ error }} <el-button link @click="refreshAll">重试</el-button></div>

    <template v-else>
      <section class="block link-block">
        <h2>投保引导链接 <small>配置后「我的」参赛证可点开；留空则不展示购买按钮</small></h2>
        <div class="link-form">
          <el-input v-model.trim="linkForm.purchaseUrl" clearable placeholder="https://… 保险购买外链" />
          <el-input v-model.trim="linkForm.purchaseLabel" maxlength="20" show-word-limit placeholder="按钮文案，如：去购买保险" style="max-width:220px" />
          <el-button type="primary" :loading="linkSaving" @click="saveLink">保存链接</el-button>
        </div>
        <p class="hint">外链不经平台收款。保存后立即对服务号「我的」生效；成交仍以球员/监护人上传保单为准。</p>
        <p v-if="linkMeta" class="hint">{{ linkMeta }}</p>
      </section>

      <div class="stat-grid">
        <article class="stat-card">
          <small>期间已交保单</small>
          <strong>{{ overview.totals ? overview.totals.submitted : 0 }}<em>份</em></strong>
          <span>含自动核对与待人工核对</span>
        </article>
        <article class="stat-card">
          <small>自动核对通过</small>
          <strong>{{ overview.totals ? overview.totals.autoMatched : 0 }}<em>份</em></strong>
          <span>姓名与保障期文字核对一致</span>
        </article>
        <article class="stat-card" :class="{ warn: overview.totals && overview.totals.manualReview }">
          <small>待人工核对</small>
          <strong>{{ overview.totals ? overview.totals.manualReview : 0 }}<em>份</em></strong>
          <span>姓名/保障期不清或有缺口</span>
        </article>
        <article class="stat-card">
          <small>投保引导点击</small>
          <strong>{{ overview.totals ? overview.totals.clickouts : 0 }}<em>次</em></strong>
          <span>外链意向，不是已购人数</span>
        </article>
      </div>

      <p class="hint">{{ overview.note }}</p>
      <p v-if="overview.truncated" class="hint warn">{{ overview.truncatedNote }}</p>
      <p v-else-if="overview.available === false" class="hint">{{ overview.emptyNote || '暂无保险材料' }}</p>

      <section class="block">
        <h2>险种分布 <small>来自保单 OCR 文本，未识别记为「未识别险种」</small></h2>
        <div v-if="overview.byProductType && overview.byProductType.length" class="chip-list">
          <span v-for="item in overview.byProductType" :key="item.productType" class="chip">
            {{ item.productType }} · {{ item.count }}
          </span>
        </div>
        <p v-else class="hint">期间尚无已识别险种</p>
      </section>

      <section class="block">
        <h2>赛事分布 <small>按提交份数 Top 20</small></h2>
        <el-table v-if="overview.byTournament && overview.byTournament.length" :data="overview.byTournament" size="small">
          <el-table-column prop="tournamentName" label="赛事" min-width="260" />
          <el-table-column prop="count" label="已交保单" width="120" align="center" />
        </el-table>
        <p v-else class="hint">期间暂无赛事分布</p>
      </section>

      <section class="block">
        <h2>保单提交明细 <small>共 {{ list.total }} 份</small></h2>
        <div class="order-tools">
          <el-select v-model="status" style="width:150px" @change="loadList(1)">
            <el-option label="全部状态" value="all" />
            <el-option label="已核对" value="auto_matched" />
            <el-option label="待人工核对" value="manual_review" />
            <el-option label="已提交" value="submitted" />
          </el-select>
          <el-input v-model.trim="keyword" clearable placeholder="搜索球员 / 赛事 / 保单号 / 险种" style="width:280px" @keyup.enter="loadList(1)" @clear="loadList(1)" />
          <el-button :loading="listLoading" @click="loadList(1)">查询</el-button>
        </div>
        <p v-if="list.truncated" class="hint warn">{{ list.truncatedNote }}</p>
        <el-table v-loading="listLoading" :data="list.rows || []" size="small" row-key="id">
          <el-table-column label="球员" min-width="140">
            <template #default="{ row }">
              <strong>{{ row.playerName }}</strong>
              <small class="sub mono">{{ row.playerId }}</small>
            </template>
          </el-table-column>
          <el-table-column prop="tournamentName" label="赛事" min-width="200" show-overflow-tooltip />
          <el-table-column prop="productType" label="险种" min-width="140" show-overflow-tooltip />
          <el-table-column prop="policyNo" label="保单号" min-width="140" show-overflow-tooltip />
          <el-table-column label="保障期" min-width="180">
            <template #default="{ row }">{{ coverText(row) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" effect="plain">{{ row.statusLabel }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="提交时间" width="160">
            <template #default="{ row }">{{ formatTime(row.submittedAt) }}</template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            background
            layout="prev, pager, next"
            :total="list.total || 0"
            :page-size="pageSize"
            :current-page="page"
            @current-change="loadList"
          />
        </div>
      </section>
    </template>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { callFunction } from '@/utils/cloud'

const days = ref(30)
const status = ref('all')
const keyword = ref('')
const page = ref(1)
const pageSize = 20
const overviewLoading = ref(false)
const listLoading = ref(false)
const linkLoading = ref(false)
const linkSaving = ref(false)
const error = ref('')
const overview = reactive({ totals: null, byProductType: [], byTournament: [], note: '', truncated: false, truncatedNote: '', available: true, emptyNote: '' })
const list = reactive({ rows: [], total: 0, truncated: false, truncatedNote: '', available: true, note: '' })
const linkForm = reactive({ purchaseUrl: '', purchaseLabel: '去购买保险' })
const linkMeta = ref('')

function statusType(value) {
  if (value === 'auto_matched') return 'success'
  if (value === 'manual_review') return 'warning'
  return 'info'
}
function coverText(row) {
  if (row.coverStart && row.coverEnd) return `${row.coverStart} — ${row.coverEnd}`
  return row.coverStart || row.coverEnd || '—'
}
function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value && value.$date ? value.$date : value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function loadLink() {
  linkLoading.value = true
  try {
    const reply = await callFunction('platformOwner', { action: 'insurancePurchaseLinkGet' })
    if (!reply || reply.success === false) throw new Error((reply && reply.error) || '读取投保链接失败')
    linkForm.purchaseUrl = reply.purchaseUrl || ''
    linkForm.purchaseLabel = reply.purchaseLabel || '去购买保险'
    linkMeta.value = reply.updatedByName
      ? `最近保存：${reply.updatedByName}`
      : (reply.purchaseUrl ? '已配置外链' : '尚未配置外链')
  } catch (err) {
    error.value = err.message || '读取投保链接失败'
  } finally {
    linkLoading.value = false
  }
}

async function saveLink() {
  linkSaving.value = true
  try {
    const reply = await callFunction('platformOwner', {
      action: 'insurancePurchaseLinkSave',
      purchaseUrl: linkForm.purchaseUrl,
      purchaseLabel: linkForm.purchaseLabel
    })
    if (!reply || reply.success === false) throw new Error((reply && reply.error) || '保存失败')
    ElMessage.success(reply.purchaseUrl ? '投保引导链接已保存' : '已关闭投保引导按钮')
    linkMeta.value = reply.updatedText ? `最近保存：${reply.updatedText}` : linkMeta.value
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    linkSaving.value = false
  }
}

async function loadOverview() {
  overviewLoading.value = true
  error.value = ''
  try {
    const reply = await callFunction('platformOwner', { action: 'insuranceOverview', days: days.value })
    if (!reply || reply.success === false) throw new Error((reply && reply.error) || '读取保险统计失败')
    overview.totals = reply.totals || { submitted: 0, autoMatched: 0, manualReview: 0, clickouts: 0 }
    overview.byProductType = reply.byProductType || []
    overview.byTournament = reply.byTournament || []
    overview.note = reply.note || ''
    overview.truncated = !!reply.truncated
    overview.truncatedNote = reply.truncatedNote || ''
    overview.available = reply.available !== false
    overview.emptyNote = reply.emptyNote || ''
    if (reply.purchaseLink) {
      linkForm.purchaseUrl = reply.purchaseLink.purchaseUrl || linkForm.purchaseUrl
      linkForm.purchaseLabel = reply.purchaseLink.purchaseLabel || linkForm.purchaseLabel
    }
  } catch (err) {
    error.value = err.message || '读取保险统计失败'
  } finally {
    overviewLoading.value = false
  }
}

async function loadList(nextPage = page.value) {
  page.value = nextPage
  listLoading.value = true
  try {
    const reply = await callFunction('platformOwner', {
      action: 'insuranceSubmissionList',
      page: page.value,
      pageSize,
      status: status.value,
      keyword: keyword.value
    })
    if (!reply || reply.success === false) throw new Error((reply && reply.error) || '读取保单明细失败')
    list.rows = reply.rows || []
    list.total = reply.total || 0
    list.truncated = !!reply.truncated
    list.truncatedNote = reply.truncatedNote || ''
    list.available = reply.available !== false
    list.note = reply.note || ''
  } catch (err) {
    ElMessage.error(err.message || '读取保单明细失败')
  } finally {
    listLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadLink(), loadOverview(), loadList(1)])
}

defineExpose({ refresh: refreshAll })

onMounted(refreshAll)
</script>

<style scoped>
.insurance-admin{display:grid;gap:18px}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.source,.hint,.sub{color:#6b7280;font-size:12px}
.hint.warn,.error{color:#b45309}
.error{padding:10px 12px;border-radius:10px;background:#fff7ed}
.stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.stat-card{padding:14px 16px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;display:grid;gap:6px}
.stat-card small{color:#6b7280}
.stat-card strong{font-size:28px;line-height:1.1}
.stat-card em{font-style:normal;font-size:14px;margin-left:4px;color:#6b7280}
.stat-card.warn{border-color:#fdba74;background:#fff7ed}
.block{padding:16px;border:1px solid #e5e7eb;border-radius:14px;background:#fff;display:grid;gap:12px}
.block h2{margin:0;font-size:16px;display:flex;gap:8px;align-items:baseline}
.block h2 small{font-weight:400;color:#6b7280}
.link-form,.order-tools,.pager{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.chip-list{display:flex;flex-wrap:wrap;gap:8px}
.chip{padding:6px 10px;border-radius:999px;background:#f3f4f6;font-size:12px}
.sub{display:block}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (max-width:1100px){.stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
