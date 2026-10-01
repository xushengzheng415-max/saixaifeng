<template>
  <div class="capacity-monitor" aria-live="polite">
    <el-alert v-if="state.accessDenied" title="仅平台管理员可以查看容量与性能监控" type="error" :closable="false" show-icon />
    <template v-else>
      <section class="monitor-intro">
        <div>
          <strong>平台数据与资源概况</strong>
          <p>汇总计数按需采样；页面可见时每 5 分钟刷新。实时云监控未接入的指标显示“—”。</p>
        </div>
        <el-tag type="info" effect="plain">平台内部</el-tag>
      </section>

      <el-alert v-if="state.error" :title="state.error" :description="snapshot ? '下方保留上次成功读取的快照，请结合采集时间判断。' : '没有可显示的监控快照，请使用顶部“刷新数据”重试。'" type="error" :closable="false" show-icon />
      <div v-if="state.loading && !snapshot" class="monitor-loading" role="status"><el-icon class="is-loading"><Loading /></el-icon>正在读取监控快照…</div>
      <el-empty v-else-if="!snapshot" description="暂无监控数据；未知数据不会显示为零" :image-size="88" />

      <template v-if="snapshot">
        <section class="snapshot-meta">
          <el-tag :type="health.stale ? 'warning' : 'success'" effect="light">{{ health.stale ? '快照已过期' : snapshot.cache.state === 'cached' ? '缓存快照' : '新采样快照' }}</el-tag>
          <span>汇总采样：{{ formatCapacityTime(snapshot.cache.sampledAt) }}</span>
          <span>读取时间：{{ formatCapacityTime(state.lastLoadedAt) }}</span>
          <span>缓存年龄：{{ cacheAge }}</span>
          <span>缓存有效期：{{ snapshot.cache.ttlSeconds === null ? '未提供' : `${snapshot.cache.ttlSeconds} 秒` }}</span>
        </section>
        <el-alert v-if="health.stale" title="部分数据已过期，不能用于判断当前负载" type="warning" :closable="false" show-icon />
        <el-alert v-else-if="health.partial" title="部分指标未接入或采集失败；已采集数据仍可查看" type="info" :closable="false" show-icon />
        <el-alert v-for="alert in snapshot.alerts" :key="alert.key" :title="alert.message" :type="alert.severity" :closable="false" show-icon />
        <el-empty v-if="health.empty" description="此快照尚未包含业务计数、指标或测试记录" :image-size="70" />

        <section class="monitor-panel">
          <div class="panel-heading"><h2>业务数据规模</h2><span>计数口径由服务端提供</span></div>
          <div v-if="snapshot.business.length" class="business-grid">
            <article v-for="row in snapshot.business" :key="row.key" class="business-card" :class="{ unavailable: row.value === null, stale: row.status === 'stale' }">
              <div class="card-heading"><h3>{{ row.label }}</h3><el-tag size="small" :type="statusType(row)">{{ statusLabel(row) }}</el-tag></div>
              <div class="business-value">{{ formatCapacityNumber(row.value) }}<small>{{ row.unit }}</small></div>
              <p class="definition">{{ row.definition || '口径待接入' }}</p>
              <p class="source">来源：{{ row.source || '未接入' }}</p>
              <p class="sample">采集：{{ formatCapacityTime(row.sampledAt) }}</p>
              <p v-if="row.error" class="row-error">{{ row.error }}</p>
            </article>
          </div>
          <el-empty v-else description="业务汇总尚未接入" :image-size="60" />
        </section>

        <section class="monitor-panel">
          <div class="panel-heading"><h2>请求与资源指标</h2><span>历史观测与当前采样分别标记</span></div>
          <el-table v-if="snapshot.metrics.length" :data="snapshot.metrics" row-key="key" class="metrics-table">
            <el-table-column prop="label" label="指标" min-width="170" />
            <el-table-column label="数值" min-width="130"><template #default="{ row }"><strong>{{ formatCapacityNumber(row.value) }}</strong><span class="metric-unit">{{ row.unit }}</span></template></el-table-column>
            <el-table-column label="状态" width="108"><template #default="{ row }"><el-tag size="small" :type="statusType(row)">{{ statusLabel(row) }}</el-tag></template></el-table-column>
            <el-table-column label="来源与采集时间" min-width="230"><template #default="{ row }"><div>{{ row.source || '未接入' }}</div><small class="sample">{{ formatCapacityTime(row.sampledAt) }}</small></template></el-table-column>
            <el-table-column label="观测范围与口径" min-width="260"><template #default="{ row }"><div>{{ row.definition || '口径待接入' }}</div><small v-if="row.window?.from || row.window?.to" class="sample">{{ formatCapacityTime(row.window?.from) }} 至 {{ formatCapacityTime(row.window?.to) }}</small><p v-if="row.error" class="row-error">{{ row.error }}</p></template></el-table-column>
          </el-table>
          <el-empty v-else description="请求与资源指标尚未接入" :image-size="60" />
        </section>

        <section class="monitor-panel">
          <div class="panel-heading"><h2>配额与预警</h2><span>套餐配额不等于经过验证的生产承载量</span></div>
          <div class="quota-grid">
            <article v-for="row in snapshot.quotas" :key="row.key" class="quota-card">
              <div class="card-heading"><h3>{{ row.label }}</h3><el-tag size="small" :type="statusType(row)">{{ statusLabel(row) }}</el-tag></div>
              <p class="quota-values">当前用量 <strong>{{ formatCapacityNumber(currentQuotaUsage(row, health.stale)) }}</strong><span> / 配额 {{ formatCapacityNumber(row.limit) }} {{ row.unit }}</span></p>
              <el-progress v-if="currentUtilization(row) !== null" :percentage="Math.min(100, currentUtilization(row))" :status="warningPercent !== null && currentUtilization(row) >= warningPercent ? 'warning' : undefined" :format="() => `${formatCapacityNumber(currentUtilization(row))}%`" />
              <p v-else class="sample">当前使用率未接入</p>
              <p class="definition">{{ row.definition || '口径待接入' }}</p>
              <p class="source">来源：{{ row.source || '未接入' }} · {{ formatCapacityTime(row.sampledAt) }}</p>
            </article>
            <article class="quota-card safety-card">
              <h3>已验证生产安全 QPS</h3>
              <div class="business-value">{{ formatCapacityNumber(snapshot.thresholds.verifiedProductionSafeQps) }}<small>QPS</small></div>
              <p v-if="snapshot.thresholds.verifiedProductionSafeQps === null" class="definition">尚无已验证的生产压测安全阈值</p>
              <p v-else class="sample">验证：{{ formatCapacityTime(snapshot.thresholds.verifiedAt) }}</p>
              <p class="definition">{{ snapshot.thresholds.note }}</p>
              <p class="sample">资源使用率预警参考：{{ warningPercent === null ? '未设置' : `${warningPercent}%` }}，不是安全 QPS。</p>
            </article>
          </div>
        </section>

        <section class="monitor-panel">
          <div class="panel-heading"><h2>性能验证记录</h2><span>仅查看结果；不会自动启动压测</span></div>
          <div v-if="snapshot.tests.length" class="test-list">
            <article v-for="test in snapshot.tests" :key="test.id" class="test-record">
              <div class="card-heading"><h3>{{ test.title }}</h3><el-tag size="small" type="info">{{ test.type === 'local_synthetic' ? '本地合成测试' : test.type === 'production_probe' ? '生产只读探测' : '类型待核验' }}</el-tag></div>
              <p class="sample">验证时间：{{ formatCapacityTime(test.verifiedAt) }}</p>
              <p><b>验证范围：</b>{{ test.scope || '未提供' }}</p>
              <p>{{ test.summary || '结果待接入' }}</p>
              <p class="sample">生产安全 QPS：{{ test.productionSafeQps === null ? '未验证' : formatCapacityNumber(test.productionSafeQps) }}</p>
              <ul v-if="test.limitations.length"><li v-for="(limitation, index) in test.limitations" :key="index">{{ limitation }}</li></ul>
            </article>
          </div>
          <el-empty v-else description="暂无可读取的性能验证记录" :image-size="60" />
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { callFunctionHTTP } from '@/utils/cloud'
import { getPlatformAuthToken, getPlatformSession, isPlatformSession } from '@/utils/platformSession'
import { capacitySnapshotState, createCapacityMonitor, currentQuotaUsage, formatCapacityNumber, formatCapacityTime, quotaUtilization } from '@/utils/capacityMonitor'

const state = ref({ data: null, loading: false, error: '', accessDenied: !isPlatformSession(), lastLoadedAt: null, now: Date.now() })
const clock = ref(Date.now())
const snapshot = computed(() => state.value.data)
const health = computed(() => capacitySnapshotState(snapshot.value, clock.value))
const loading = computed(() => state.value.loading)
const lastLoadedAt = computed(() => state.value.lastLoadedAt)
const warningPercent = computed(() => snapshot.value?.thresholds.warningUtilizationPercent ?? null)
const currentUtilization = row => health.value.stale ? null : quotaUtilization(row)
const cacheAge = computed(() => health.value.ageSeconds === null ? '未提供' : health.value.ageSeconds < 60 ? `${health.value.ageSeconds} 秒` : `${Math.floor(health.value.ageSeconds / 60)} 分钟`)
const statusLabel = row => ({ ready: '已采集', historical: '历史观测', unavailable: row.error ? '采集失败' : '未接入', stale: '已过期' }[row.status] || '未接入')
const statusType = row => ({ ready: 'success', historical: 'info', unavailable: row.error ? 'danger' : 'info', stale: 'warning' }[row.status] || 'info')

function sessionIdentity() {
  if (!isPlatformSession()) return null
  const session = getPlatformSession()
  return JSON.stringify([getPlatformAuthToken(), session?.userId || '', session?.loginAt || ''])
}

const controller = createCapacityMonitor({
  request: () => callFunctionHTTP('platformCapacityOverview', {}, 30000),
  getIdentity: sessionIdentity,
  isVisible: () => document.visibilityState === 'visible',
  onStateChange: value => { state.value = value; clock.value = value.now }
})
const refresh = () => controller.refresh()
const visibilityChanged = () => { clock.value = Date.now(); controller.notifyVisibility() }
const identityChanged = () => controller.notifyIdentityChange()
let clockTimer = null

onMounted(() => {
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('storage', identityChanged)
  // This timer only updates displayed cache age and checks the local session; it makes no API request.
  clockTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') { clock.value = Date.now(); controller.notifyIdentityChange() }
  }, 30000)
  controller.start()
})
onBeforeUnmount(() => {
  controller.dispose()
  if (clockTimer !== null) window.clearInterval(clockTimer)
  document.removeEventListener('visibilitychange', visibilityChanged)
  window.removeEventListener('storage', identityChanged)
})
defineExpose({ refresh, loading, lastLoadedAt })
</script>

<style scoped>
.capacity-monitor { display: grid; gap: 16px; min-width: 0; color: #263b32; }
.monitor-intro, .panel-heading, .card-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.monitor-intro strong { font-size: 18px; }
.monitor-intro p, .definition { color: #617369; line-height: 1.65; }
.monitor-intro p { margin: 8px 0 0; font-size: 13px; }
.snapshot-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 20px; font-size: 12px; color: #748179; }
.monitor-panel { min-width: 0; background: #fff; border: 1px solid #e5ede7; border-radius: 14px; padding: 22px; }
.panel-heading { margin-bottom: 18px; align-items: baseline; }
h2, h3, p { margin: 0; }
h2 { font-size: 16px; }
h3 { font-size: 14px; font-weight: 600; }
.card-heading h3 { min-width: 0; overflow-wrap: anywhere; }
.panel-heading > span { color: #7a887f; font-size: 12px; }
.business-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 14px; }
.business-card, .quota-card { min-width: 0; border: 1px solid #e8eee9; border-radius: 10px; padding: 18px; }
.business-value { font-size: 30px; font-weight: 700; line-height: 1.4; margin: 12px 0; color: #12683d; }
.business-value small { font-size: 12px; color: #6d7f73; font-weight: 400; margin-left: 8px; }
.unavailable .business-value { color: #88968e; }
.stale { background: #fffcf4; border-color: #eee3c4; }
.definition { font-size: 12px; margin-top: 8px; }
.source, .sample { color: #7a887f; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.source { margin-top: 10px; }
.row-error { color: #b1433b; font-size: 12px; line-height: 1.5; margin-top: 6px; }
.metric-unit { margin-left: 6px; font-size: 12px; color: #7a887f; }
.quota-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 14px; }
.quota-values { font-size: 13px; margin: 16px 0 10px; }
.quota-values strong { font-size: 20px; margin-left: 6px; }
.quota-values > span { color: #748179; }
.safety-card { background: #f7faf8; }
.test-list { display: grid; gap: 14px; }
.test-record { border: 1px solid #e8eee9; border-radius: 10px; padding: 18px; }
.test-record p { font-size: 13px; line-height: 1.7; margin-top: 8px; }
.test-record .sample { font-size: 12px; }
.test-record ul { padding-left: 18px; margin: 10px 0 0; font-size: 12px; color: #7a887f; line-height: 1.8; }
.monitor-loading { display: flex; justify-content: center; align-items: center; gap: 10px; padding: 60px 0; color: #748179; }
@media (max-width: 900px) {
  .monitor-panel { padding: 16px; }
  .monitor-intro, .panel-heading { align-items: flex-start; }
  .panel-heading { flex-direction: column; gap: 6px; }
}
</style>
