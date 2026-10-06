// 比赛时长：裁判页面计时优先，已完赛时可按正式比赛/组别规则计算。
export function resolveMatchDuration(match, context = {}) {
  const positive = value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null
  const finished = ['completed', 'finished', 'archived', 'ended'].includes(String(match.status || '').toLowerCase())
  const seconds = positive(match.refereeClockElapsedSeconds)
  if (seconds != null) {
    let elapsed = seconds
    if (!finished && match.refereeClockRunning && match.refereeClockStartedAt) {
      const startedAt = new Date(match.refereeClockStartedAt).getTime()
      if (Number.isFinite(startedAt)) elapsed += Math.max(0, ((context.now == null ? Date.now() : context.now) - startedAt) / 1000)
    }
    return elapsed / 60
  }
  if (!finished) return null
  for (const value of [match.totalMinutes, match.matchDuration, match.duration]) {
    const minutes = positive(value)
    if (minutes != null) return minutes
  }
  const division = context.division || {}, tournament = context.tournament || {}
  const sources = [match.rulesSnapshot, match, { ...(division.rulesSnapshot || {}), ...division }, { ...(tournament.rulesSnapshot || {}), ...tournament }]
  for (const rules of sources) {
    if (!rules) continue
    const minutes = positive(rules.matchMinutes)
    if (minutes == null) continue
    const count = rules.periodMode === 'halves' ? 2 : rules.periodMode === 'single' ? positive(rules.singlePeriodCount || rules.periodCount) : 1
    if (count != null) return minutes * count
  }
  return null
}

export function calculatePlayingMinutes(starterIds, timeline, duration) {
  const active = new Map(starterIds.map(id => [id, 0]))
  const minutes = new Map(), unknown = new Set()
  if (duration == null || !starterIds.length) return { minutes, unknown, available:false }
  const close = (id, minute) => { minutes.set(id, (minutes.get(id) || 0) + minute - active.get(id)); active.delete(id) }
  for (const event of timeline.slice().sort((a,b) => Number(a.minute) - Number(b.minute))) {
    const recorded = Number(event.minute)
    if (event.minute == null || event.minute === '' || !Number.isFinite(recorded) || recorded < 0) {
      if (event.id) unknown.add(event.id)
      if (event.out) unknown.add(event.out)
      continue
    }
    const minute = Math.min(recorded, duration)
    if (event.type === 'substitution') {
      if (event.out && active.has(event.out)) close(event.out, minute)
      else if (event.out) unknown.add(event.out)
      else if (!event.outName) active.forEach((_,id) => unknown.add(id))
      if (event.id && active.has(event.id)) unknown.add(event.id)
      else if (event.id) active.set(event.id, minute)
    } else if (event.id && active.has(event.id)) close(event.id, minute)
  }
  active.forEach((start,id) => minutes.set(id, (minutes.get(id) || 0) + duration - start))
  return { minutes, unknown, available:true }
}
