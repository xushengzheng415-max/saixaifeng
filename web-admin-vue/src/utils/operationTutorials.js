// Only public tutorial metadata belongs here. Never put account or tournament data in player URLs.
export function bilibiliVideo(value, part = 1) {
  let bvid = String(value || '').trim()
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) {
    try {
      const url = new URL(bvid)
      if (url.protocol !== 'https:' || !['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname)) return null
      bvid = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10})\/?$/)?.[1] || ''
    } catch { return null }
  }
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) return null
  const p = Number.isInteger(Number(part)) && Number(part) > 0 ? Number(part) : 1
  const params = new URLSearchParams({ bvid, p: String(p), autoplay: '0', danmaku: '0', poster: '1' })
  return { bvid, embedUrl: `https://player.bilibili.com/player.html?${params}`, watchUrl: `https://www.bilibili.com/video/${bvid}/?p=${p}` }
}

export function tutorialForPath(path = '') {
  if (/\/tournaments\/create\/?$/.test(path)) return 'create'
  if (/\/(news|news-center)(\/|$)/.test(path)) return 'news'
  if (/\/(results|review|archive)(\/|$)/.test(path)) return 'results'
  if (/\/(draw|draw-groups)(\/|$)/.test(path)) return 'draw'
  if (/\/(divisions|division|competition)(\/|$)/.test(path)) return 'divisions'
  if (/\/(registrations|registration|teams|team)(\/|$)/.test(path)) return 'registration'
  if (/\/(referees|referee)(\/|$)/.test(path)) return 'referees'
  if (/\/(matches|match)(\/|$)/.test(path)) return 'matches'
  return ''
}
