const tiers = ['bronze', 'silver', 'gold']
const labels = { bronze: '铜卡', silver: '银卡', gold: '金卡', single: '单卡' }

export function legacyProjectTiles(templates) {
  const groups = new Map()
  for (const item of templates) {
    const scope = item.preload || { type: 'platform' }
    const stem = item.title?.replace(/铜卡|银卡|金卡|bronze|silver|gold/gi, '').trim()
    // Only combine an unambiguous, complete named trio in the same scope.
    const key = `${scope.type}:${scope.targetId || ''}:${stem}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.values()].flatMap(items => {
    const complete = ['platform', 'tournament'].includes(items[0].preload?.type || 'platform') && items.length === 3 && tiers.every(tier => items.filter(x => x.tier === tier).length === 1)
    return (complete ? [items] : items.map(item => [item])).map(members => {
      const first = members[0]
      const kind = ['team', 'player'].includes(first.preload?.type) ? 'honor' : 'progression'
      const keys = kind === 'progression' ? tiers : ['single']
      return {
        id: members.map(x => x.id).join(':'), kind,
        title: complete ? `${first.title.replace(/铜卡|银卡|金卡/gi, '').trim()}金银铜套系` : first.title,
        preload: first.preload,
        importTemplateIds: members.map(x => x.id),
        styles: keys.map(key => ({ key, backgroundUrl: members.find(x => kind === 'honor' || x.tier === key)?.backgroundUrl || '' })),
      }
    })
  })
}

export function nextMaterialStep(styles = []) {
  const missing = styles.filter(x => !x.backgroundUrl).map(x => labels[x.key] || x.key)
  return missing.length ? `待补${missing.join('、')}背景` : '下一步：核对遮罩与排版'
}
