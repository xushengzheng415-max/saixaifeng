export function knockoutCapacity(teamCount) {
  const count = Number(teamCount)
  return 2 ** Math.ceil(Math.log2(Number.isFinite(count) ? Math.min(128,Math.max(2,count)) : 2))
}

export function fillKnockoutSlots(teams, capacity = knockoutCapacity(teams.length)) {
  const slots = Array(capacity).fill(null)
  const pairs = capacity / 2
  teams.slice(0, capacity).forEach((team, index) => {
    slots[index < pairs ? index * 2 : (index - pairs) * 2 + 1] = team
  })
  return slots
}

export function knockoutColumns(capacity) {
  const half = capacity / 2
  const rounds = []
  for (let count = half / 2; count >= 2; count /= 2) {
    rounds.push({ key:`round-${count}`, title:count === 2 ? '半决赛' : count === 4 ? '四分之一决赛' : `${count * 2}强赛`, count })
  }
  return [
    { key:'left-seeds', title:'左半区签位', positions:Array.from({length:half},(_,i)=>i), count:half },
    ...rounds.map(round=>({...round,key:`left-${round.key}`})),
    { key:'final', title:'决赛', final:true },
    ...[...rounds].reverse().map(round=>({...round,key:`right-${round.key}`})),
    { key:'right-seeds', title:'右半区签位', positions:Array.from({length:half},(_,i)=>half+i), count:half }
  ]
}
