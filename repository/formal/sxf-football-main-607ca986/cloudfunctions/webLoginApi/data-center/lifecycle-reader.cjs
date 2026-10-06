const { readByIds } = require('./reader.cjs')
const { decorateTournament } = require('./lifecycle.cjs')

// 只补正已获授权响应中的赛事字段；不扩大列表、不返回新增私密资料。
async function decorateLifecycleResult(db, result, options = {}) {
  if (!result || result.success === false) return result
  const targets = []
  const seen = new Set()
  function add(row) {
    if (!row || typeof row !== 'object' || seen.has(row)) return
    const id = String(row._id || row.id || row.tournamentId || '')
    if (!id) return
    seen.add(row)
    targets.push({ row, id })
  }
  function walk(value) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(walk); return }
    Object.keys(value).forEach(key => {
      if (key === 'tournaments' && Array.isArray(value[key])) value[key].forEach(add)
      else if (key === 'tournament') add(value[key])
      else walk(value[key])
    })
  }
  walk(result)
  if ((options.collection === 'tournaments' && ['get', 'list'].includes(options.operation)) || options.functionName === 'getTournaments' || options.name === 'getTournaments') {
    if (Array.isArray(result.data)) result.data.forEach(add)
    else add(result.data)
  }
  if (!targets.length) return result
  const ids = [...new Set(targets.map(item => item.id))]
  const records = await readByIds(db, 'tournaments', '_id', ids, { maxRows: 2000 })
  const matches = await readByIds(db, 'matches', 'tournamentId', ids, { maxRows: 20000 })
  const current = new Map(records.map(row => [String(row._id), row]))
  const grouped = new Map(ids.map(id => [id, []]))
  matches.forEach(row => { const group = grouped.get(String(row.tournamentId)); if (group) group.push(row) })
  targets.forEach(({ row, id }) => {
    const record = current.get(id)
    // 不存在的旧公开快照不冒充仍在进行的真实赛事。
    if (!record) { Object.assign(row, { status: 'unknown', statusText: '状态待确认', displayStatus: 'unknown' }); return }
    const resolved = decorateTournament(Object.assign({}, record, { matchesComplete: true }), undefined, grouped.get(id))
    Object.assign(row, { storedStatus: record.status || '', status: resolved.status, displayStatus: resolved.displayStatus, statusText: resolved.statusText, statusVersion: resolved.statusVersion })
  })
  return result
}
module.exports = { decorateLifecycleResult }
