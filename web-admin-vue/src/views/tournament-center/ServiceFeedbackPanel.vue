<template>
  <section class="feedback-panel">
    <div class="fb-stats">
      <button v-for="item in statusTabs" :key="item.key" type="button" :class="{ active: filters.status === item.key }" @click="selectStatus(item.key)">
        <strong>{{ item.value }}</strong>
        <span>{{ item.label }}</span>
      </button>
    </div>

    <div class="fb-toolbar">
      <el-select v-model="filters.type" clearable placeholder="全部类型" class="fb-type" @change="reload">
        <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-input v-model.trim="contactKeyword" clearable placeholder="按反馈人微信号精确查找" class="fb-contact" @keyup.enter="reload">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-button type="primary" @click="reload">查询</el-button>
      <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      <span class="fb-total">共 {{ total }} 条</span>
    </div>

    <el-table v-loading="loading" :data="rows" row-key="feedbackId" class="fb-table">
      <el-table-column label="提交时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column label="类型" width="110">
        <template #default="{ row }"><el-tag :type="typeTag(row.type)" effect="plain">{{ row.typeLabel }}</el-tag></template>
      </el-table-column>
      <el-table-column label="反馈内容" min-width="330">
        <template #default="{ row }"><p class="fb-content" :title="row.content">{{ row.content }}</p></template>
      </el-table-column>
      <el-table-column label="反馈人联系方式" width="180">
        <template #default="{ row }">
          <button v-if="row.contact" class="fb-phone" type="button" @click="copyText(row.contact)">{{ row.contact }} <el-icon><CopyDocument /></el-icon></button>
          <span v-else class="fb-muted">{{ row.phoneMasked || '未留手机号' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="105">
        <template #default="{ row }"><el-tag :type="statusTag(row.status)">{{ statusText(row.status) }}</el-tag></template>
      </el-table-column>
      <el-table-column label="处理备注" min-width="170">
        <template #default="{ row }"><span class="fb-note">{{ row.note || '—' }}</span></template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }"><el-button link type="primary" @click="openHandle(row)">处理</el-button></template>
      </el-table-column>
      <template #empty><el-empty description="暂无反馈" :image-size="80" /></template>
    </el-table>

    <div v-if="total > pageSize" class="fb-pager">
      <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" background @current-change="load" />
    </div>

    <el-drawer v-model="drawerVisible" title="处理反馈" size="min(560px, 92vw)">
      <template v-if="current">
        <div class="fb-detail-head">
          <el-tag :type="typeTag(current.type)" effect="plain">{{ current.typeLabel }}</el-tag>
          <el-tag :type="statusTag(current.status)">{{ statusText(current.status) }}</el-tag>
          <small>{{ formatTime(current.createTime) }}</small>
        </div>
        <div class="fb-detail-block">
          <small>反馈内容</small>
          <p>{{ current.content }}</p>
        </div>
        <el-descriptions :column="1" border size="small" class="fb-detail-meta">
          <el-descriptions-item label="反馈人微信号">{{ current.contact || '未填写' }}（手机号 {{ current.phoneMasked || '未绑定' }}）</el-descriptions-item>
          <el-descriptions-item label="提交来源">{{ current.source || '—' }}</el-descriptions-item>
          <el-descriptions-item label="账号标识">{{ current.userId || '—' }}</el-descriptions-item>
          <el-descriptions-item label="首次处理">{{ formatTime(current.firstHandledAt) }}</el-descriptions-item>
        </el-descriptions>
        <el-form label-position="top" class="fb-form">
          <el-form-item label="处理状态">
            <el-radio-group v-model="form.status">
              <el-radio-button v-for="item in handleStatus" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="处理备注（仅内部可见，不发给用户）">
            <el-input v-model.trim="form.note" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="例如：已核对比赛记录并补录助攻，已电话联系反馈人" />
          </el-form-item>
        </el-form>
        <p class="fb-hint">状态变更会记入平台内容审计日志，便于回溯处理过程。</p>
      </template>
      <template #footer>
        <el-button @click="drawerVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitHandle">保存处理结果</el-button>
      </template>
    </el-drawer>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Refresh, Search } from '@element-plus/icons-vue'
import { callFunction } from '@/utils/cloud'

const typeOptions = [
  { value: 'data_error', label: '数据问题' },
  { value: 'binding', label: '绑定问题' },
  { value: 'feature', label: '功能建议' },
  { value: 'other', label: '其他' }
]
const handleStatus = [
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'done', label: '已处理' }
]

const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const counts = reactive({ all: 0, pending: 0, processing: 0, done: 0 })
const filters = reactive({ status: '', type: '' })
const contactKeyword = ref('')
const drawerVisible = ref(false)
const current = ref(null)
const form = reactive({ status: 'processing', note: '' })

const statusTabs = computed(() => [
  { key: '', label: '全部', value: counts.all },
  { key: 'pending', label: '待处理', value: counts.pending },
  { key: 'processing', label: '处理中', value: counts.processing },
  { key: 'done', label: '已处理', value: counts.done }
])

const statusText = value => (handleStatus.find(item => item.value === value)?.label || '待处理')
const statusTag = value => ({ pending: 'warning', processing: 'primary', done: 'success' }[value] || 'info')
const typeTag = value => ({ data_error: 'danger', binding: 'warning', feature: 'success' }[value] || 'info')

function dateOf(value) {
  if (!value) return null
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}
const formatTime = value => {
  const date = dateOf(value)
  return date ? date.toLocaleString('zh-CN', { hour12: false }) : '—'
}

async function call(action, payload) {
  const result = await callFunction('manageTournamentCenterContent', { action, ...payload })
  if (!result?.success) throw new Error(result?.error || result?.message || '反馈服务暂时不可用')
  return result
}

async function load() {
  loading.value = true
  try {
    const result = await call('serviceFeedbackList', {
      status: filters.status,
      type: filters.type,
      contact: contactKeyword.value,
      page: page.value,
      pageSize
    })
    rows.value = result.rows || []
    total.value = result.total || 0
    Object.assign(counts, result.counts || {})
  } catch (error) {
    ElMessage.error(error.message || '反馈加载失败')
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function selectStatus(key) {
  filters.status = key
  reload()
}

function openHandle(row) {
  current.value = row
  form.status = row.status === 'done' ? 'done' : row.status === 'processing' ? 'processing' : 'processing'
  form.note = row.note || ''
  drawerVisible.value = true
}

async function submitHandle() {
  if (!current.value || saving.value) return
  saving.value = true
  try {
    await call('serviceFeedbackUpdate', {
      feedbackId: current.value.feedbackId,
      status: form.status,
      note: form.note
    })
    ElMessage.success('处理结果已保存')
    drawerVisible.value = false
    await load()
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function copyText(value) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(String(value))
    ElMessage.success('手机号已复制')
  } catch {
    ElMessage.warning('复制失败，请手动复制')
  }
}

onMounted(load)
</script>

<style scoped>
.feedback-panel{display:flex;flex-direction:column;gap:0;background:#fff;border-radius:15px;overflow:hidden}
.fb-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:18px 20px;border-bottom:1px solid #eef2ef}
.fb-stats button{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border:1px solid #e3eae5;border-radius:12px;background:#fafcfb;text-align:left;cursor:pointer;transition:.15s}
.fb-stats button:hover{border-color:#b9d8c7;background:#f4faf6}
.fb-stats button.active{border-color:#198754;background:#f0f9f3;box-shadow:0 6px 16px #1987541f}
.fb-stats strong{font-size:22px;color:#17211b;line-height:1.1}
.fb-stats span{font-size:12px;color:#7b8a80}
.fb-toolbar{display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid #eef2ef;flex-wrap:wrap}
.fb-type{width:140px}
.fb-contact{width:250px}
.fb-total{margin-left:auto;color:#7b8a80;font-size:12px}
.fb-table{width:100%}
.fb-content{margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#2a3830;font-size:13px;line-height:1.55}
.fb-phone{display:inline-flex;align-items:center;gap:4px;padding:0;border:0;background:transparent;color:#176d43;font-size:13px;cursor:pointer}
.fb-muted{color:#93a099;font-size:12px}
.fb-note{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#5d6b62;font-size:12px}
.fb-pager{display:flex;justify-content:flex-end;padding:14px 20px}
.fb-detail-head{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.fb-detail-head small{color:#8b978f;font-size:12px}
.fb-detail-block{padding:14px 16px;border:1px solid #e8efea;border-radius:12px;background:#fafcfb}
.fb-detail-block small{color:#8b978f;font-size:12px}
.fb-detail-block p{margin:8px 0 0;color:#25322b;font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.fb-detail-meta{margin-top:16px}
.fb-form{margin-top:20px}
.fb-hint{margin:0;color:#8b978f;font-size:12px}
@media(max-width:760px){.fb-stats{grid-template-columns:repeat(2,1fr)}.fb-contact{width:100%}.fb-total{margin-left:0}}
</style>
