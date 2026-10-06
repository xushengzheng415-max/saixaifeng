'use strict'
const { readAll, DataReadError } = require('./data-center/reader.cjs')

async function related(db, specifications) {
  const output = specifications.map(() => new Map())
  const jobs = []
  specifications.forEach((spec, group) => {
    const ids = [...new Set((spec.ids || []).filter(Boolean).map(String))]
    for (let index = 0; index < ids.length; index += 50) jobs.push({ spec, group, ids: ids.slice(index, index + 50) })
  })
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    for (;;) {
      const job = jobs[next++]
      if (!job) return
      const condition = { ...(job.spec.where || {}), [job.spec.field]: db.command.in(job.ids) }
      const rows = await readAll(db, job.spec.collection, condition, { fields: job.spec.fields })
      rows.forEach(row => output[job.group].set(String(row._id), row))
      if (output[job.group].size > 20000) throw new DataReadError('DATA_SCOPE_TOO_LARGE', job.spec.collection, '公开数据范围过大，请缩小查询范围')
    }
  }))
  return output.map(rows => [...rows.values()].sort((a, b) => String(a._id).localeCompare(String(b._id))))
}

module.exports = { related }
