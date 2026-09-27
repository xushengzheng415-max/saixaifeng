const text = value => String(value || '').trim().toLowerCase()

export function isPenaltyScored(event) {
  const type = text(event?.type)
  if (type === 'penalty_missed' || type === 'penalty_miss') return false
  if (event?.penaltyOutcome === 'missed' || event?.penaltyScored === false) return false
  return type === 'penalty' || type === 'penalty_scored' || event?.isPenalty === true && event?.penaltyOutcome === 'scored'
}

export function isPenaltyMissed(event) {
  const type = text(event?.type)
  return type === 'penalty_missed' || type === 'penalty_miss' || event?.penaltyOutcome === 'missed' || event?.penaltyScored === false
}

export function isOwnGoal(event) {
  return text(event?.type) === 'own_goal' || event?.goalType === 'own_goal'
}

export function isGoalEvent(event) {
  const type = text(event?.type)
  return type === 'goal' || type === 'score' || isPenaltyScored(event) || isOwnGoal(event)
}

// 射手榜不把乌龙球计入进球球员，但比赛事件、战报仍展示 OG。
export function isScorerGoalEvent(event) {
  return isGoalEvent(event) && !isOwnGoal(event)
}

export function goalEventTag(event) {
  if (isOwnGoal(event)) return 'OG'
  if (isPenaltyScored(event)) return 'P'
  return ''
}

export function goalEventLabel(event) {
  const tag = goalEventTag(event)
  if (tag === 'P') return '点球 P'
  if (tag === 'OG') return '乌龙球 OG'
  return '进球'
}

export function scorerDisplayName(event) {
  const name = String(event?.playerName || '球员未记录')
  const tag = goalEventTag(event)
  return tag ? `${name}（${tag}）` : name
}
