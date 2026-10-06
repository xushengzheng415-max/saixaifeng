'use strict'
const audit = require('./capacityAudit20261001.cjs')
const TTL_MS = 5 * 60 * 1000

const businessSpecs = [
  ['teams', '全平台球队资料', '支', 'teams', '所有球队资料数量；不等于公开球队或参赛关系。'],
  ['players', '全平台球员档案', '人', 'players', '独立球员文档数量；包括归档文档，不按姓名合并，也不返回档案内容。'],
  ['tournaments', '全平台赛事资料', '场', 'tournaments', '全部赛事文档数量；包括草稿，不等于公开赛事数量。'],
  ['matches', '全平台比赛资料', '场', 'matches', '全部比赛文档数量；包括未发布及历史资料。'],
  ['publicSnapshots', '已发布赛事快照版本', '条', 'publication_snapshots', 'football/tournament_center/published文档数；同一赛事的不同版本分别计数，不是去重赛事数。', { sportCode: 'football', type: 'tournament_center', status: 'published' }],
  ['publicNews', '已发布新闻记录', '条', 'tournament_news', 'status=published记录数；页面实际可见还受公开赛事和比赛关系约束。', { status: 'published' }]
]
const unavailable = (key, label, unit, source, definition) => ({ key, label, value: null, unit, status: 'unavailable', source, sampledAt: null, definition })

function buildAlerts(data) {
  const alerts = [
    { key: 'telemetry', severity: 'warning', message: '实时QPS、错误率、接口分位耗时及环境资源监控尚未接入；未知指标不能用于判断负载正常。' },
    { key: 'safeThreshold', severity: 'info', message: '尚无生产压测验证的安全阈值。500 QPS是历史套餐额度，不是安全并发人数。' },
    { key: 'historicalQuota', severity: 'info', message: '套餐与历史指标来自2026-10-01只读审计；请结合采集日期，不能当作当前实时使用率。' }
  ]
  for (const quota of data.quotas || []) {
    if (quota.status === 'ready' && Number.isFinite(quota.limit) && quota.limit > 0 && Number.isFinite(quota.used) && quota.used / quota.limit * 100 >= data.thresholds.warningUtilizationPercent) {
      alerts.push({ key: `quota:${quota.key}`, severity: 'warning', message: `${quota.label}使用比例已达到预警比例${data.thresholds.warningUtilizationPercent}%。预警比例不是压测安全阈值。` })
    }
  }
  if (data.business.some(row => row.status === 'stale')) alerts.push({ key: 'stale', severity: 'warning', message: '部分计数刷新失败，保留上次成功值；这些数值已标为过期。' })
  if (data.business.some(row => row.status === 'unavailable' && row.error)) alerts.push({ key: 'partial', severity: 'warning', message: '部分聚合计数读取失败；未接入或失败值显示为空，不显示为0。' })
  return alerts
}

function createCapacityMonitor({ cloud, authenticateWebSession, now = Date.now, memoryUsage = () => process.memoryUsage() }) {
  let cached = null, expires = 0, pending = null
  async function sample() {
    const started = now(), sampledAt = new Date(started).toISOString()
    const db = cloud.database(), previous = new Map((cached?.business || []).map(row => [row.key, row]))
    const business = new Array(businessSpecs.length)
    let next = 0
    // Counts only: no document get, no arbitrary client collection or filters.
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (;;) {
        const index = next++
        if (index >= businessSpecs.length) return
        const [key, label, unit, collection, definition, where] = businessSpecs[index]
        const row = { key, label, unit, source: `CloudBase ${collection}.count()（服务端聚合）`, definition }
        try {
          const query = where ? db.collection(collection).where(where) : db.collection(collection)
          const result = await query.count()
          if (!Number.isSafeInteger(result.total) || result.total < 0) throw new Error('invalid count')
          business[index] = { ...row, value: result.total, status: 'ready', sampledAt }
        } catch {
          const older = previous.get(key)
          business[index] = { ...row, value: older?.value ?? null, status: older?.value != null ? 'stale' : 'unavailable', sampledAt: older?.sampledAt || null, error: '聚合计数读取失败；请检查集合和只读访问，未回退全量扫描。' }
        }
      }
    }))
    business.push(unavailable('publicTeams', '公开球队去重数', '支', '未接入：公开发布关系的去重汇总', '全平台球队总数不能当作公开数量；当前没有低成本权威汇总，页面不会扫描球员或赛事快照。'))
    business.push(unavailable('publicPlayers', '公开球员去重数', '人', '未接入：公开发布关系的去重汇总', '只显示统计接入状态，不读取或返回球员个人资料。'))
    const memory = memoryUsage()
    const metrics = [
      unavailable('liveQps', '当前环境 QPS', '次/秒', '未接入：环境DescribeCurveData定期只读采集', '历史189峰值不能当作当前负载。'),
      unavailable('liveRequests', '当前请求量', '次', '未接入：环境或函数监控', '需明确统计窗口与端点，不能把监控刷新次数当作业务请求量。'),
      unavailable('p95', '读取接口 P95 耗时', 'ms', '未接入：脱敏逐请求日志或监控分位值', '三次探测不构成P95/P99分位统计。'),
      unavailable('errorRate', '读取接口错误率', '%', '未接入：同窗口请求与错误计数', '没有同窗口分母，未计算虚构的实时百分比。'),
      unavailable('environmentMemory', '环境实际内存占用', 'MB', '未接入：函数实例监控', '下方单进程RSS不等于环境总内存或所有实例用量。'),
      unavailable('environmentCpu', '环境 CPU 使用率', '%', '未接入：函数实例CPU监控', '配置CPU规格不等于当前CPU百分比。'),
      { key: 'sampleRss', label: '监控采样进程 RSS', value: +(memory.rss / 1048576).toFixed(2), unit: 'MB', status: 'ready', source: 'process.memoryUsage().rss', sampledAt, definition: '采样所在Node进程瞬时RSS，包含共享入口其他代码；不是环境总量或峰值，缓存命中不会重新采样。' },
      { key: 'sampleDuration', label: '监控聚合采样耗时', value: Math.max(0, now() - started), unit: 'ms', status: 'ready', source: '服务端本次聚合采样计时', sampledAt, definition: '仅六个count和组装时间；不含认证与网络，不代表球队/球员接口延迟。' },
      ...audit.metrics
    ]
    const data = { schemaVersion: 1, generatedAt: sampledAt, cache: { state: business.some(row => row.status === 'stale') ? 'stale' : 'fresh', sampledAt, expiresAt: new Date(started + TTL_MS).toISOString(), ttlSeconds: TTL_MS / 1000 }, business, metrics, quotas: audit.quotas, thresholds: { verifiedProductionSafeQps: null, verifiedAt: null, warningUtilizationPercent: 80, note: '80%是界面配额预警比例；尚无生产压测安全阈值，当前实时配额使用量未接入。' }, tests: audit.tests }
    data.alerts = buildAlerts(data)
    cached = data; expires = started + TTL_MS
    return data
  }
  return async function handle(event) {
    const auth = await authenticateWebSession(event)
    if (!auth.success) return auth
    if (auth.principalType !== 'platform_owner' || auth.user?.isPlatformOwner !== true) return { success: false, code: 'CAPACITY_MONITOR_FORBIDDEN', error: '仅平台负责人可查看容量与性能监控' }
    // Authenticate even on cache hits. Client refresh cannot bypass the TTL.
    if (cached && now() < expires) return { success: true, data: { ...cached, cache: { ...cached.cache, state: cached.cache.state === 'stale' ? 'stale' : 'cached' } } }
    if (!pending) pending = sample().finally(() => { pending = null })
    try { return { success: true, data: await pending } }
    catch { return { success: false, code: 'CAPACITY_MONITOR_UNAVAILABLE', error: '监控暂不可用，请稍后重试' } }
  }
}

module.exports = { createCapacityMonitor, buildAlerts, TTL_MS }
