export function newsKindForMatch(match) {
  return match?.resultStatus === 'approved' ? 'match' : 'flash'
}
