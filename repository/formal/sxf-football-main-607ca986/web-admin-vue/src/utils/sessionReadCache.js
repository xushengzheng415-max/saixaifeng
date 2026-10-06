// Tab-local response cache. Never persisted: tokens and player records stay in memory.
const registeredCaches = new Set()

export function clearSessionReadCaches(reason = 'session') {
  for (const cache of registeredCaches) cache.clear(reason)
}

export function stableReadKey(value) {
  const normalize = item => {
    if (Array.isArray(item)) return item.map(normalize)
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])]))
  }
  return JSON.stringify(normalize(JSON.parse(JSON.stringify(value))))
}

const accessFailure = value => /AUTH_REQUIRED|FORBIDDEN|UNAUTHORIZED|PERMISSION_DENIED|ACCESS_DENIED|SESSION_ACCOUNT_MISMATCH/.test(String(value?.code || ''))
const invalidated = () => Object.assign(new Error('数据或登录状态已更新，请重新加载'), { code: 'READ_CACHE_INVALIDATED' })

export function createSessionReadCache({ identity, now = Date.now, freshMs = 15000, staleMs = 60000, maxEntries = 80, maxBytes = 4 * 1024 * 1024, onChange = () => {} }) {
  const entries = new Map()
  const pending = new Map()
  let context = ''
  let epoch = 0
  let bytes = 0
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
  const notify = detail => { try { onChange(detail) } catch { /* A view listener cannot break a request. */ } }
  const remove = key => {
    const previous = entries.get(key)
    if (previous) bytes -= previous.bytes
    entries.delete(key)
  }
  function clear(reason = 'mutation', publish = true) {
    epoch++
    entries.clear()
    pending.clear()
    bytes = 0
    context = identity() || ''
    if (publish) notify({ reason, tags: ['players', 'teams', 'statistics', 'playerCards'] })
  }
  function synchronize() {
    const current = identity() || ''
    if (current !== context) clear('identity', false)
    return current
  }
  function store(key, value, tags) {
    const serialized = JSON.stringify(value)
    const size = serialized.length * 2
    remove(key)
    if (maxEntries <= 0 || maxBytes <= 0 || size > maxBytes) return
    while (entries.size >= maxEntries || bytes + size > maxBytes) remove(entries.keys().next().value)
    entries.set(key, { value: JSON.parse(serialized), serialized, at: now(), tags: [...tags], bytes: size })
    bytes += size
  }
  function load(key, loader, tags, background) {
    if (pending.has(key)) return pending.get(key)
    const requestContext = synchronize()
    const requestEpoch = epoch
    const old = entries.get(key)
    const promise = Promise.resolve().then(loader).then(result => {
      if (requestContext !== (identity() || '') || requestEpoch !== epoch) throw invalidated()
      if (result?.success === true && requestContext) {
        store(key, result, tags)
        if (background && old?.serialized !== JSON.stringify(result)) notify({ reason: 'refresh', tags: [...tags] })
      } else {
        remove(key)
        if (accessFailure(result)) clear('access')
        else if (background) notify({ reason: 'refresh-error', tags: [...tags] })
      }
      return result
    }).catch(error => {
      if (requestContext === (identity() || '') && requestEpoch === epoch) {
        if (accessFailure(error)) clear('access')
        else if (background) notify({ reason: 'refresh-error', tags: [...tags] })
      }
      throw error
    }).finally(() => {
      if (pending.get(key) === promise) pending.delete(key)
    })
    pending.set(key, promise)
    return promise
  }
  async function read(key, loader, { tags = [], bypass = false } = {}) {
    const current = synchronize()
    const cached = entries.get(key)
    const age = cached ? now() - cached.at : Infinity
    if (!bypass && current && cached && age >= 0 && age < staleMs) {
      entries.delete(key)
      entries.set(key, cached)
      if (age >= freshMs) load(key, loader, tags, true).catch(() => {})
      return clone(cached.value)
    }
    if (cached && (age < 0 || age >= staleMs)) remove(key)
    return clone(await load(key, loader, tags, false))
  }
  const cache = { read, clear, synchronize, generation: () => epoch, inspect: () => ({ entries: entries.size, bytes, pending: pending.size }), dispose: () => registeredCaches.delete(cache) }
  registeredCaches.add(cache)
  return cache
}
