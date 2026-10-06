'use strict'
const { performance } = require('node:perf_hooks')

function mockDatabase(tables, { cap = Infinity, latencyMs = 0, fail = '' } = {}) {
  const stats = { operations: 0, rows: 0, bytes: 0, active: 0, maxActive: 0, byCollection: {}, writes: 0 }
  const command = { in: values => ({ op: 'in', values }), gt: value => ({ op: 'gt', value }), or: clauses => ({ op: 'or', clauses }), and: clauses => ({ op: 'and', clauses }) }
  function matches(row, where) {
    if (where.op === 'or') return where.clauses.some(clause => matches(row, clause))
    if (where.op === 'and') return where.clauses.every(clause => matches(row, clause))
    return Object.entries(where).every(([field, value]) => {
      if (value && value.op === 'in') return Array.isArray(row[field]) ? row[field].some(item => value.values.includes(item)) : value.values.includes(row[field])
      if (value && value.op === 'gt') return row[field] > value.value
      if (value instanceof RegExp) return typeof row[field] === 'string' && value.test(row[field])
      return row[field] === value
    })
  }
  const db = { command, stats, tables, RegExp: ({ regexp, options }) => new RegExp(regexp, options), serverDate: () => new Date(), collection(name) {
    let where = {}, orders = [], maximum = Infinity, offset = 0, fields = null
    const query = {
      where(value) { where = value; return query },
      orderBy(field, direction) { orders.push([field, direction]); return query },
      limit(value) { maximum = Math.min(value, cap); return query },
      skip(value) { offset = value; return query },
      field(value) { fields = value; return query },
      async get() {
        stats.operations++; stats.active++; stats.maxActive = Math.max(stats.maxActive, stats.active)
        stats.byCollection[name] = (stats.byCollection[name] || 0) + 1
        try {
          if (latencyMs) await new Promise(resolve => setTimeout(resolve, latencyMs))
          if (name === fail) throw new Error('synthetic database unavailable')
          let rows = (tables[name] || []).filter(row => matches(row, where))
          if (orders.length) rows.sort((a, b) => {
            for (const [field, direction] of orders) {
              const delta = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0
              if (delta) return delta * (direction === 'desc' ? -1 : 1)
            }
            return 0
          })
          rows = rows.slice(offset, offset + maximum).map(row => fields ? Object.fromEntries(Object.keys(fields).filter(key => fields[key] && Object.hasOwn(row, key)).map(key => [key, row[key]])) : { ...row })
          stats.rows += rows.length; stats.bytes += Buffer.byteLength(JSON.stringify(rows))
          return { data: rows }
        } finally { stats.active-- }
      },
      async count() { return { total: (tables[name] || []).filter(row => matches(row, where)).length } },
      doc(id) { return {
        async get() { return { data: (tables[name] || []).find(row => row._id === id) || null } },
        async update() { stats.writes++; throw new Error('writes disabled in performance harness') }
      } }
    }
    return query
  } }
  return db
}

async function measure(run, db) {
  const cpu = process.cpuUsage(), heap = process.memoryUsage().heapUsed, start = performance.now()
  const result = await run()
  const used = process.cpuUsage(cpu)
  return { result, metrics: { ...db.stats, wallMs: +(performance.now() - start).toFixed(2), cpuMs: +((used.user + used.system) / 1000).toFixed(2), heapDeltaBytes: process.memoryUsage().heapUsed - heap, responseBytes: Buffer.byteLength(JSON.stringify(result)) } }
}
module.exports = { mockDatabase, measure }
