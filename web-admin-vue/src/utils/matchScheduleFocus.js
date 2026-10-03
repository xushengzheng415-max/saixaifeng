// Rows arrive in date/time order. Keep the selected calendar day when it has
// an unstarted match; otherwise resume at the earliest unstarted match.
export function findWorkbenchFocusMatch(rows, selectedDate, stateOf) {
  const unstarted = rows.filter(match => match.matchDate && match.matchTime && !['postponed','cancelled','canceled'].includes(String(match.status || '').toLowerCase()) && stateOf(match).key === 'scheduled')
  return unstarted.find(match => match.matchDate === selectedDate) || unstarted[0] || null
}
