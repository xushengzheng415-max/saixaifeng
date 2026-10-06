import { onMounted, onUnmounted } from 'vue'

export function useReadCacheRefresh({ tags, refresh, clear = () => {}, onError = () => {} }) {
  let timer = null
  let active = false
  function changed(event) {
    if (!active) return
    const detail = event.detail || {}
    const boundary = ['identity', 'session', 'access'].includes(detail.reason)
    if (!boundary && !(detail.tags || []).some(tag => tags.includes(tag))) return
    if (boundary) clear()
    if (['session', 'access', 'refresh-error'].includes(detail.reason)) {
      if (detail.reason !== 'session') onError()
      return
    }
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (active) Promise.resolve().then(refresh).catch(onError)
    }, 0)
  }
  onMounted(() => {
    active = true
    window.addEventListener('sxf-read-cache-change', changed)
  })
  onUnmounted(() => {
    active = false
    if (timer !== null) clearTimeout(timer)
    window.removeEventListener('sxf-read-cache-change', changed)
  })
}
