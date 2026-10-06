// Keep these labels in the same order as the organizer tournament sidebar.
// "全部权限" selects this fixed set; future modules require a new grant.
export const TOURNAMENT_SIDEBAR_RIGHTS = Object.freeze([
  { key: 'event.dashboard', label: '赛事主控制台', suffix: '' },
  { key: 'event.competition', label: '竞赛管理', suffix: '/competition' },
  { key: 'event.registration', label: '报名管理', suffix: '/registration' },
  { key: 'event.teams', label: '球队管理', suffix: '/teams' },
  { key: 'event.draw', label: '抽签与分组', suffix: '/draw' },
  { key: 'event.matches', label: '比赛管理', suffix: '/matches' },
  { key: 'event.results', label: '赛果管理', suffix: '/results' },
  { key: 'event.news', label: '新闻中心', suffix: '/news' },
  { key: 'event.referees', label: '裁判管理', suffix: '/referees' },
  { key: 'event.settings', label: '赛事设置', suffix: '/edit' }
])

export const TOURNAMENT_SIDEBAR_KEYS = Object.freeze(TOURNAMENT_SIDEBAR_RIGHTS.map(item => item.key))

export function visibleSidebarKeys(permissions = []) {
  const values = new Set(permissions)
  if (values.has('result.supplement')) values.add('event.results')
  if (values.has('news.edit') || values.has('news.publish')) values.add('event.news')
  return values
}

export function invitationLandingPath(scope, path, prompted = false) {
  if (!scope?.success || !Array.isArray(scope.invitations) || !scope.invitations.length) return ''
  if (path === '/service-account-binding') return '/tournament-staff'
  if (!prompted && ['/', '/tournament-space', '/organization-onboarding'].includes(path)) return '/tournament-staff'
  return ''
}

export function sidebarRightForRoute(path) {
  const remainder = String(path || '').replace(/^\/tournaments\/[^/]+/, '')
  if (!remainder) return 'event.dashboard'
  if (/^\/competition(?:\/|$)/.test(remainder)) return 'event.competition'
  if (/^\/(?:registration|claim-reviews|signups)(?:\/|$)/.test(remainder)) return 'event.registration'
  if (/^\/(?:teams|players|roster-changes|roster-exceptions)(?:\/|$)/.test(remainder)) return 'event.teams'
  if (/^\/(?:draw|pairings)(?:\/|$)/.test(remainder)) return 'event.draw'
  if (/^\/(?:matches|schedule)(?:\/|$)/.test(remainder)) return 'event.matches'
  if (/^\/results(?:\/|$)/.test(remainder)) return 'event.results'
  if (/^\/news(?:\/|$)/.test(remainder)) return 'event.news'
  if (/^\/referees(?:\/|$)/.test(remainder)) return 'event.referees'
  if (/^\/edit(?:\/|$)/.test(remainder)) return 'event.settings'
  if (/^\/match\/[^/]+\/(?:post-match|review|archive)(?:\/|$)/.test(remainder)) return 'event.results'
  if (/^\/match\/[^/]+(?:\/|$)/.test(remainder)) return 'event.matches'
  if (/^\/staff-results(?:\/|$)/.test(remainder)) return 'event.results'
  return ''
}
