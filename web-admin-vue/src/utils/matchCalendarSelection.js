export function firstUnfinishedMatchDate(days, matches, needsEntry) {
  const unfinishedDates = new Set(
    matches.filter(needsEntry).map(match => String(match.matchDate || '').slice(0, 10))
  )
  return days.find(day => unfinishedDates.has(day.date))?.date || days[0]?.date || ''
}
