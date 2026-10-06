// Keep calendar context separate from the match's business division.
export function matchListQuery(query = {}) {
  const result = {}
  if (typeof query.listDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.listDate)) result.date = query.listDate
  const division = typeof query.listDivision === 'string' ? query.listDivision : 'all'
  if (division !== 'all') result.divisionId = division
  if (['settings', 'imports', 'workbench'].includes(query.listView)) result.view = query.listView
  return result
}
export function matchSourceQuery(query = {}) {
  return Object.fromEntries(['listDate', 'listDivision', 'listView'].filter(key => typeof query[key] === 'string').map(key => [key, query[key]]))
}
