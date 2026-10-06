const VALID_STATUSES = new Set(['ready', 'historical', 'unavailable', 'stale'])
const POLL_MS = 5 * 60 * 1000

export const CAPACITY_POLL_MS = POLL_MS

const text = value => typeof value === 'string' ? value : ''
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null
const rows = value => Array.isArray(value) ? value : []

/** Keep unavailable values unavailable; the monitor never substitutes demo values or zeroes. */
export function normalizeCapacitySnapshot(value) {
  if (!value || value.schemaVersion !== 1) throw new Error('监控数据格式暂不支持，请稍后重试')
  const normalizeRow = row => ({
    ...row,
    key: text(row?.key), label: text(row?.label), unit: text(row?.unit),
    value: finite(row?.value), source: text(row?.source), sampledAt: text(row?.sampledAt) || null,
    definition: text(row?.definition), error: text(row?.error),
    status: VALID_STATUSES.has(row?.status) ? row.status : 'unavailable'
  })
  return {
    schemaVersion: 1,
    generatedAt: text(value.generatedAt) || null,
    cache: {
      state: ['fresh', 'cached', 'stale'].includes(value.cache?.state) ? value.cache.state : 'stale',
      sampledAt: text(value.cache?.sampledAt) || null,
      expiresAt: text(value.cache?.expiresAt) || null,
      ttlSeconds: finite(value.cache?.ttlSeconds)
    },
    business: rows(value.business).filter(Boolean).map(normalizeRow),
    metrics: rows(value.metrics).filter(Boolean).map(normalizeRow),
    quotas: rows(value.quotas).filter(Boolean).map(row => ({
      ...normalizeRow(row), limit: finite(row.limit), used: finite(row.used)
    })),
    thresholds: {
      verifiedProductionSafeQps: finite(value.thresholds?.verifiedProductionSafeQps),
      verifiedAt: text(value.thresholds?.verifiedAt) || null,
      warningUtilizationPercent: finite(value.thresholds?.warningUtilizationPercent),
      note: text(value.thresholds?.note)
    },
    alerts: rows(value.alerts).filter(Boolean).map(row => ({
      key: text(row.key), severity: row.severity === 'warning' ? 'warning' : 'info', message: text(row.message)
    })),
    tests: rows(value.tests).filter(Boolean).map(row => ({
      id: text(row.id), title: text(row.title), type: text(row.type), verifiedAt: text(row.verifiedAt) || null,
      scope: text(row.scope), productionSafeQps: finite(row.productionSafeQps), summary: text(row.summary),
      limitations: rows(row.limitations).filter(item => typeof item === 'string')
    }))
  }
}

export function formatCapacityNumber(value) {
  return finite(value) === null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 3 })
}

export function formatCapacityTime(value) {
  if (!value) return '未采集'
  // The audit knows a date, not a collection clock time. Do not invent midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未采集' : date.toLocaleString('zh-CN', { hour12: false })
}

export function currentQuotaUsage(row, snapshotStale = false) {
  return row?.status === 'ready' && !snapshotStale ? finite(row.used) : null
}

export function quotaUtilization(row) {
  const used = currentQuotaUsage(row), limit = finite(row?.limit)
  return used === null || limit === null || limit <= 0 || used < 0 ? null : used / limit * 100
}

export function capacitySnapshotState(snapshot, now = Date.now()) {
  if (!snapshot) return { empty: true, stale: false, partial: false, ageSeconds: null }
  const sampledAt = Date.parse(snapshot.cache?.sampledAt || '')
  const expiresAt = Date.parse(snapshot.cache?.expiresAt || '')
  const allRows = [...snapshot.business, ...snapshot.metrics, ...snapshot.quotas]
  return {
    empty: allRows.length === 0 && snapshot.tests.length === 0,
    stale: snapshot.cache?.state === 'stale' || (Number.isFinite(expiresAt) && expiresAt <= now),
    partial: allRows.some(row => ['unavailable', 'stale'].includes(row.status)),
    ageSeconds: Number.isFinite(sampledAt) ? Math.max(0, Math.floor((now - sampledAt) / 1000)) : null
  }
}

/** A page-owned read controller: shares in-flight work, never persists tenant or identity data. */
export function createCapacityMonitor({ request, getIdentity, isVisible = () => true, onStateChange = () => {},
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, pollMs = POLL_MS }) {
  const state = { data: null, loading: false, error: '', accessDenied: false, lastLoadedAt: null, now: now() }
  let identity = getIdentity(), pending = null, timer = null, running = false, disposed = false, lastAttemptAt = null, blockedIdentity = null
  const publish = () => { state.now = now(); onStateChange({ ...state }) }
  const clear = message => { state.data = null; state.loading = false; state.lastLoadedAt = null; state.error = message || '' }
  const stopTimer = () => { if (timer !== null) clearTimer(timer); timer = null }

  function syncIdentity() {
    const current = getIdentity()
    if (current !== identity) {
      identity = current; pending = null; lastAttemptAt = null; blockedIdentity = null
      clear(current ? '平台登录身份已变更，请重新刷新' : '仅平台管理员可以查看容量与性能监控')
    }
    state.accessDenied = !current || blockedIdentity === current
    if (!current) { pending = null; clear('仅平台管理员可以查看容量与性能监控'); stopTimer() }
    publish()
    return current
  }

  function refresh() {
    if (disposed) return Promise.resolve(null)
    const requestedIdentity = syncIdentity()
    if (!requestedIdentity || state.accessDenied) return Promise.resolve(null)
    if (pending?.identity === requestedIdentity) return pending.promise
    stopTimer()
    state.loading = true; state.error = ''; lastAttemptAt = now(); publish()
    const job = { identity: requestedIdentity, promise: null }
    pending = job
    const canApply = () => !disposed && pending === job && getIdentity() === requestedIdentity
    job.promise = Promise.resolve().then(() => {
      if (!canApply()) return null
      return request()
    }).then(result => {
      if (!canApply()) { if (!disposed) syncIdentity(); return null }
      if (!result?.success) {
        const error = new Error(result?.error || result?.message || '监控数据暂时不可用')
        error.code = result?.code
        throw error
      }
      state.data = normalizeCapacitySnapshot(result.data)
      state.lastLoadedAt = new Date(now()).toISOString()
      return state.data
    }).catch(error => {
      if (!canApply()) { if (!disposed) syncIdentity(); return null }
      if (['AUTH_REQUIRED', 'CAPACITY_MONITOR_FORBIDDEN', 'PLATFORM_OWNER_REQUIRED', 'FORBIDDEN', 'SESSION_ACCOUNT_MISMATCH'].includes(error?.code)) {
        state.data = null; state.lastLoadedAt = null; state.accessDenied = true
        blockedIdentity = requestedIdentity
      }
      state.error = error?.message || '监控数据暂时不可用，请稍后重试'
      return null
    }).finally(() => {
      if (!disposed && pending === job) { pending = null; state.loading = false; publish(); schedule() }
    })
    return job.promise
  }

  function schedule() {
    stopTimer()
    if (!running || disposed || state.accessDenied || !isVisible() || !getIdentity()) return
    const remaining = lastAttemptAt === null ? pollMs : Math.max(0, pollMs - (now() - lastAttemptAt))
    timer = setTimer(() => {
      timer = null
      if (!running || disposed) return
      if (isVisible() && syncIdentity()) void refresh()
    }, remaining)
  }

  function notifyVisibility() {
    if (disposed) return
    syncIdentity()
    if (!isVisible()) { stopTimer(); return }
    if (running && getIdentity() && (lastAttemptAt === null || now() - lastAttemptAt >= pollMs)) {
      void refresh()
    } else schedule()
  }

  function notifyIdentityChange() {
    if (disposed) return
    syncIdentity()
    schedule()
  }

  function start() {
    if (disposed || running) return
    running = true
    if (isVisible() && syncIdentity()) void refresh()
  }

  function dispose() {
    disposed = true; running = false; stopTimer(); pending = null; clear(); publish()
  }

  return { refresh, start, dispose, notifyVisibility, notifyIdentityChange }
}
