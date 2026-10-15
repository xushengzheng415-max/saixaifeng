const files = new Set(['NotoSansSC-Regular.otf', 'NotoSansSC-Bold.otf', 'MaShanZheng-Regular.ttf', 'Anton-Regular.ttf'])
function walk(value, visit) {
  if (!value || typeof value !== 'object') return
  visit(value)
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'cardScene') continue
    if (Array.isArray(nested)) nested.forEach(row => walk(row, visit))
    else if (nested && typeof nested === 'object') walk(nested, visit)
  }
}
export function localizeCardFonts(value, origin, base = '/') {
  walk(value, row => {
    if (row.cardScene?.fonts) row.cardScene.fonts = row.cardScene.fonts.map(font => files.has(font.name) ? {
      ...font, url: new URL(`${base}fonts/player-card/${font.name}`, origin).href
    } : font)
  })
  return value
}
export function translateCardErrors(value) {
  walk(value, row => {
    if (typeof row.cardError === 'string' && /network|font/i.test(row.cardError)) row.cardError = '字体加载失败，请重试预览'
  })
  return value
}
