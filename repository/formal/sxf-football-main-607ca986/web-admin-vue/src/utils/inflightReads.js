// Share only running reads. A completed request is never an authorization cache.
export function createInflightReads() {
  const pending = new Map()
  return function share(key, load) {
    if (pending.has(key)) return pending.get(key)
    const promise = Promise.resolve().then(load).finally(() => {
      if (pending.get(key) === promise) pending.delete(key)
    })
    pending.set(key, promise)
    return promise
  }
}
