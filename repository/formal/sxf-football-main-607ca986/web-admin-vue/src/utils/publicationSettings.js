// 正式竞赛文件（竞赛日程）的场地与赛期口径。
//
// 规则：优先使用真实比赛结果；比赛尚未编排时，退回赛程设置里已保存的赛期、比赛日与场地清单。
// 任何情况下都不为具体比赛编造日期、时间或场地——未排场次仍由调用方显示“待定”。
const COLLATOR = new Intl.Collator('zh-CN', { numeric: true })

function cleanText(value) {
  return String(value === null || value === undefined ? '' : value).trim()
}

/** 场地名规范化：去空白、去空值、去重，并按中文+数字自然序排列。 */
export function normalizePublicationVenues(values) {
  const list = Array.isArray(values) ? values : [values]
  return [...new Set(list.map(cleanText).filter(Boolean))].sort((a, b) => COLLATOR.compare(a, b))
}

/** 从赛程设置里提取该赛事已保存的赛期、比赛日与场地清单。 */
export function buildPublicationSettings(config) {
  const source = config || {}
  const resources = Array.isArray(source.venueResources) ? source.venueResources : []
  const configuredVenues = normalizePublicationVenues([
    ...resources.map(resource => (resource ? resource.name ?? resource.venue ?? '' : '')),
    ...(Array.isArray(source.venues) ? source.venues : [])
  ])
  const startDate = cleanText(source.startDate)
  const endDate = cleanText(source.endDate)
  return {
    period: startDate && endDate ? `${startDate}—${endDate}` : '',
    matchDays: Array.isArray(source.matchDays) && source.matchDays.length ? source.matchDays.join('、') : '',
    venues: configuredVenues
  }
}

/** 竞赛文件表头上的“比赛周期 / 比赛日”一行；没有配置时返回空串，不显示占位。 */
export function buildPublicationSettingsText(settings) {
  const value = settings || {}
  return [
    value.period ? `比赛周期：${value.period}` : '',
    value.matchDays ? `比赛日：${value.matchDays}` : ''
  ].filter(Boolean).join('　·　')
}

/** 场地取真实比赛结果，其次取已保存的赛程设置。 */
export function resolvePublicationVenues(matchVenues, configuredVenues) {
  const real = normalizePublicationVenues(matchVenues)
  if (real.length) return real
  return normalizePublicationVenues(configuredVenues)
}

/** 竞赛文件里的场地摘要；两处都没有才显示“场地待定”。 */
export function summarizePublicationVenues(matchVenues, configuredVenues) {
  const venues = resolvePublicationVenues(matchVenues, configuredVenues)
  return venues.length ? venues.join('、') : '场地待定'
}

/** 该组别赛程的排定情况：日期、时间、场地三者齐全才算已排，其余计入待排。 */
export function summarizeSchedulePlacement(matches) {
  const list = Array.isArray(matches) ? matches : []
  const arranged = list.filter(match => Boolean(
    match && cleanText(match.matchDate) && cleanText(match.matchTime) && cleanText(match.venue)
  )).length
  return { total: list.length, arranged, pending: list.length - arranged }
}
