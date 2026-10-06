export function sortPlayerTableRows(rows, prop, order, valueFor) {
  if (!prop || !order) return rows
  const direction = order === 'descending' ? -1 : 1
  return rows.map((row, index) => ({ row, index, value: valueFor(row, prop) })).sort((left, right) => {
    const leftMissing = left.value == null || left.value === '' || Number.isNaN(left.value)
    const rightMissing = right.value == null || right.value === '' || Number.isNaN(right.value)
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1
    if (leftMissing) return left.index - right.index
    const comparison = typeof left.value === 'number' && typeof right.value === 'number'
      ? left.value - right.value
      : String(left.value).localeCompare(String(right.value), 'zh-CN', { numeric: true })
    return comparison * direction || left.index - right.index
  }).map(item => item.row)
}
