<template>
  <section class="ai-portrait">
    <div class="filters">
      <el-button :loading="loading" @click="loadModels">刷新模型配置</el-button>
      <span class="source">服务号 H5「我的」→ AI 形象照演示；模型上下架与客户自选在这里控制</span>
    </div>
    <div v-if="error" class="error" role="alert">{{ error }} <el-button link @click="loadModels">重试</el-button></div>

    <template v-else>
      <div class="model-grid">
        <article v-for="item in models" :key="item.key" class="model-card" :class="{ off: !item.enabled }">
          <header>
            <div>
              <strong>{{ item.label }}</strong>
              <small>{{ item.vendor }} · {{ item.model }}</small>
            </div>
            <el-switch :model-value="item.enabled" @update:model-value="value => setEnabled(item, value)" />
          </header>
          <p>{{ item.desc }}</p>
          <div class="tags">
            <el-tag size="small" type="info">{{ item.tag }}</el-tag>
            <el-tag v-if="item.ready" size="small" type="success">凭据已配置</el-tag>
            <el-tag v-else size="small" type="warning">未开通（缺服务端 Key）</el-tag>
            <el-tag v-if="item.key === defaultModel" size="small" type="danger">默认模型</el-tag>
          </div>
          <footer>
            <el-button size="small" :disabled="item.key === defaultModel || !item.enabled" @click="setDefault(item)">设为默认</el-button>
            <span class="state">{{ item.enabled ? '客户可见' : '已下架' }}</span>
          </footer>
        </article>
      </div>

      <section class="block">
        <h2>对外规则</h2>
        <div class="rule-row">
          <span>允许客户自己选模型</span>
          <el-switch v-model="allowUserChoice" />
          <small>关闭后只使用默认模型，H5 第 04 步不再展示模型卡片</small>
        </div>
        <p class="boundary">这里只控制「哪些模型能出图、谁说了算」，不含价格与扣费规则：收费口径尚未确认，页面不写死任何价格。</p>
        <div class="actions">
          <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
          <el-button :disabled="saving" @click="resetLocal">撤销改动</el-button>
          <span v-if="savedAt" class="saved">已保存 {{ savedAt }}</span>
        </div>
      </section>

      <section class="block">
        <h2>后端使用数据 <small>按北京时间切天，单位是生成请求</small></h2>
        <div class="usage-tools">
          <el-select v-model="days" style="width:130px" @change="loadUsage">
            <el-option label="今天" :value="1" />
            <el-option label="近 7 天" :value="7" />
            <el-option label="近 30 天" :value="30" />
          </el-select>
          <el-button :loading="usageLoading" @click="loadUsage">刷新用量</el-button>
          <span class="source">统计从接入记录起算，不含照片、人脸与手机号</span>
        </div>
        <div v-if="usageError" class="error" role="alert">{{ usageError }} <el-button link @click="loadUsage">重试</el-button></div>
        <div v-else-if="!usage.available" class="empty">{{ usage.note || '还没有产生生成记录' }}</div>
        <template v-else>
          <div class="metrics">
            <div class="metric"><strong>{{ usage.totals.requests }}</strong><span>生成请求</span></div>
            <div class="metric"><strong>{{ usage.totals.success }}</strong><span>成功</span></div>
            <div class="metric"><strong>{{ usage.totals.failed }}</strong><span>失败</span></div>
            <div class="metric"><strong>{{ usage.totals.successRate }}%</strong><span>成功率</span></div>
            <div class="metric"><strong>{{ seconds(usage.totals.avgDurationMs) }}</strong><span>成功平均耗时</span></div>
            <div class="metric"><strong>{{ usage.totals.images }}</strong><span>出图张数</span></div>
          </div>
          <p class="boundary">
            区间 {{ usage.sinceDay }} 起，共 {{ usage.days }} 天；请求失败也计入请求数。
            <template v-if="usage.truncated">超过 {{ usage.limit }} 条，只统计最近 {{ usage.limit }} 条（已如实标记，不是全量）。</template>
            统计单位是生成请求，不是独立用户数。
          </p>
          <div class="details">
            <section class="block inner">
              <h3>按模型</h3>
              <el-table :data="usage.byModel" size="small" empty-text="区间内没有请求">
                <el-table-column prop="label" label="模型" min-width="140" />
                <el-table-column prop="requests" label="请求" width="70" />
                <el-table-column prop="success" label="成功" width="70" />
                <el-table-column prop="failed" label="失败" width="70" />
                <el-table-column label="成功率" width="86"><template #default="{ row }">{{ row.successRate }}%</template></el-table-column>
                <el-table-column label="平均耗时" width="96"><template #default="{ row }">{{ seconds(row.avgDurationMs) }}</template></el-table-column>
              </el-table>
            </section>
            <section class="block inner">
              <h3>按天</h3>
              <el-table :data="usage.byDay" size="small" empty-text="区间内没有请求">
                <el-table-column prop="day" label="日期" width="120" />
                <el-table-column prop="requests" label="请求" width="70" />
                <el-table-column prop="success" label="成功" width="70" />
                <el-table-column prop="failed" label="失败" width="70" />
                <el-table-column label="成功率" width="86"><template #default="{ row }">{{ row.successRate }}%</template></el-table-column>
              </el-table>
            </section>
          </div>
          <section class="block inner">
            <h3>最近 20 条</h3>
            <el-table :data="usage.recent" size="small" empty-text="没有记录">
              <el-table-column prop="time" label="时间" width="140" />
              <el-table-column prop="model" label="模型" min-width="130" />
              <el-table-column label="模式" width="100"><template #default="{ row }">{{ modeText(row.mode) }}</template></el-table-column>
              <el-table-column prop="pose" label="姿势" width="110" />
              <el-table-column label="球衣" width="110"><template #default="{ row }">{{ jerseyText(row.jerseyMode) }}</template></el-table-column>
              <el-table-column label="结果" width="90"><template #default="{ row }"><el-tag size="small" :type="row.success ? 'success' : 'danger'">{{ row.success ? '成功' : '失败' }}</el-tag></template></el-table-column>
              <el-table-column label="耗时" width="90"><template #default="{ row }">{{ seconds(row.durationMs) }}</template></el-table-column>
              <el-table-column prop="error" label="失败原因" min-width="180" />
            </el-table>
          </section>
        </template>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { callFunction } from '@/utils/cloud'

const models = ref([])
const defaultModel = ref('')
const allowUserChoice = ref(true)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const savedAt = ref('')
const days = ref(7)
const usageLoading = ref(false)
const usageError = ref('')
const usage = ref({ available: false, note: '', days: 7, totals: { requests: 0, success: 0, failed: 0, successRate: 0, images: 0, avgDurationMs: 0 }, byModel: [], byDay: [], recent: [] })

const hasModelData = computed(() => models.value.length > 0)

function applyModels(reply) {
  models.value = (reply.models || []).map(item => ({ ...item }))
  defaultModel.value = (reply.setting && reply.setting.defaultModel) || ''
  allowUserChoice.value = !(reply.setting && reply.setting.allowUserChoice === false)
}

async function loadModels() {
  loading.value = true
  error.value = ''
  try {
    const reply = await callFunction('platformOwner', { action: 'getAiPortraitModels' })
    if (!reply || reply.success !== true) throw new Error((reply && reply.error) || '读取模型配置失败')
    applyModels(reply)
  } catch (failure) {
    error.value = failure && failure.message ? failure.message : '读取模型配置失败'
  } finally {
    loading.value = false
  }
}

function setEnabled(item, value) {
  if (!value && item.key === defaultModel.value) {
    ElMessage.warning('默认模型不能直接下架，请先把别的模型设为默认')
    return
  }
  if (!value && enabledCount.value <= 1) {
    ElMessage.warning('至少要保留一个可出图的模型')
    return
  }
  item.enabled = value
}

function setDefault(item) {
  if (!item.enabled) {
    ElMessage.warning('已下架的模型不能设为默认')
    return
  }
  defaultModel.value = item.key
}

const enabledCount = computed(() => models.value.filter(item => item.enabled).length)

function resetLocal() {
  loadModels()
  savedAt.value = ''
}

async function save() {
  if (!hasModelData.value) return
  saving.value = true
  try {
    const settings = {}
    models.value.forEach(item => { settings[item.key] = { enabled: Boolean(item.enabled) } })
    const reply = await callFunction('platformOwner', {
      action: 'saveAiPortraitModels',
      setting: { models: settings, defaultModel: defaultModel.value, allowUserChoice: allowUserChoice.value }
    })
    if (!reply || reply.success !== true) throw new Error((reply && reply.error) || '保存失败')
    applyModels(reply)
    savedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    if (Array.isArray(reply.warnings) && reply.warnings.length) reply.warnings.forEach(text => ElMessage.warning(text))
    else ElMessage.success('模型配置已保存，H5 下次刷新即生效')
  } catch (failure) {
    ElMessage.error((failure && failure.message) || '保存失败')
  } finally {
    saving.value = false
  }
}

async function loadUsage() {
  usageLoading.value = true
  usageError.value = ''
  try {
    const reply = await callFunction('platformOwner', { action: 'getAiPortraitUsage', days: days.value })
    if (!reply || reply.success !== true) throw new Error((reply && reply.error) || '读取用量失败')
    usage.value = {
      available: reply.available !== false,
      note: reply.note || '',
      days: reply.days || days.value,
      sinceDay: reply.sinceDay || '',
      limit: reply.limit || 2000,
      truncated: reply.truncated === true,
      totals: reply.totals || { requests: 0, success: 0, failed: 0, successRate: 0, images: 0, avgDurationMs: 0 },
      byModel: reply.byModel || [],
      byDay: reply.byDay || [],
      recent: reply.recent || []
    }
  } catch (failure) {
    usageError.value = (failure && failure.message) || '读取用量失败'
  } finally {
    usageLoading.value = false
  }
}

function seconds(ms) {
  const value = Number(ms || 0)
  if (!value) return '—'
  return value >= 1000 ? (value / 1000).toFixed(1) + ' 秒' : value + ' 毫秒'
}

function modeText(mode) {
  return { reference: '参考图', text2image: '文生图' }[mode] || '—'
}

function jerseyText(mode) {
  return { reference: '球衣参考图', preset: '纯色样板', color: '取色', none: '无球衣' }[mode] || '—'
}

function refresh() {
  return Promise.all([loadModels(), loadUsage()])
}

onMounted(refresh)
defineExpose({ refresh, loading })
</script>

<style scoped>
.ai-portrait{color:#26392d}
.filters{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.source{color:#6f8174;font-size:12px}
.model-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:16px}
.model-card{display:flex;flex-direction:column;gap:10px;padding:17px;background:#fff;border:1px solid #e0e9e2;border-radius:8px}
.model-card.off{background:#f7faf8;border-style:dashed}
.model-card header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.model-card header strong{display:block;font-size:15px}
.model-card header small{display:block;margin-top:3px;color:#718275;font-size:11px;word-break:break-all}
.model-card p{margin:0;color:#54695b;font-size:12px;line-height:1.6}
.model-card .tags{display:flex;flex-wrap:wrap;gap:6px}
.model-card footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:6px;border-top:1px solid #eef4ef}
.model-card .state{color:#718275;font-size:12px}
.block{background:#fff;border:1px solid #e0e9e2;border-radius:8px;padding:18px;margin:14px 0}
.block h2{font-size:16px;margin:0 0 15px}
.block h2 small{font-size:11px;color:#708274;font-weight:400;margin-left:6px}
.block h3{font-size:14px;margin:0 0 12px}
.block.inner{margin:14px 0 0;background:#fbfdfb}
.rule-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:14px}
.rule-row small{color:#718275;font-size:12px}
.boundary{font-size:12px;color:#718275;line-height:1.6;margin:12px 0}
.actions{display:flex;align-items:center;gap:10px;margin-top:6px}
.saved{color:#3f7d52;font-size:12px}
.usage-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.metric{display:flex;flex-direction:column;gap:6px;padding:16px;background:#fbfdfb;border:1px solid #e6eee8;border-radius:8px}
.metric strong{font-size:24px}
.metric span{font-size:12px;color:#5e7365}
.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.empty,.error{padding:26px 12px;color:#66786b;text-align:center}
.error{color:#b93d38}
@media(max-width:1100px){.details{grid-template-columns:1fr}}
</style>
