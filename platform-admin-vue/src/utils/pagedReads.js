export async function readAllPages(loadPage, options = {}) {
  const rows = new Map()
  for (let skip = 0; ; skip += 1000) {
    const page = await loadPage({ ...options, skip, limit: 1000, throwOnError: true })
    page.forEach(row => rows.set(String(row._id), row))
    if (rows.size > 20000) throw new Error('数据范围过大，请缩小查询范围')
    if (page.length < 1000) return [...rows.values()]
    if (skip >= 20000) throw new Error('数据范围过大，请缩小查询范围')
  }
}
