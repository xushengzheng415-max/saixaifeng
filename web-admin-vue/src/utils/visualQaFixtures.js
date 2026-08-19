const QA_SESSION_KEY = 'sxfVisualQa'

const ids = {
  tournament: 'qa-tournament-2026',
  divisionU8: 'qa-division-u8',
  divisionU16: 'qa-division-u16',
  matchU8: 'qa-match-u8-012',
  matchU16: 'qa-match-u16-013',
  homeU8: 'qa-team-kaifeng',
  awayU8: 'qa-team-xinxiang',
  homeU16: 'qa-team-zhengzhou',
  awayU16: 'qa-team-luoyang'
}

const referees = [
  { _id: 'qa-ref-1', name: '张伟', phone: '13811111234', level: '国家级', qualification: '足球国家级裁判员', status: 'approved', auditStatus: 'approved', orgId: 'qa-org', tournamentId: ids.tournament },
  { _id: 'qa-ref-2', name: '李明', phone: '13922225678', level: '一级', qualification: '中国足协一级裁判员', status: 'approved', auditStatus: 'approved', orgId: 'qa-org', tournamentId: ids.tournament },
  { _id: 'qa-ref-3', name: '王强', phone: '13733332468', level: '国家二级', qualification: '中国足协二级裁判员', status: 'approved', auditStatus: 'approved', availabilityStatus: 'available', orgId: 'qa-org', tournamentId: ids.tournament },
  { _id: 'qa-ref-4', name: '陈磊', phone: '13544449753', level: '国家二级', qualification: '中国足协二级裁判员', status: 'approved', auditStatus: 'approved', availabilityStatus: 'available', orgId: 'qa-org', tournamentId: ids.tournament },
  { _id: 'qa-ref-5', name: '刘洋', phone: '13655551357', level: '一级', qualification: '中国足协一级裁判员', status: 'pending', auditStatus: 'pending', orgId: 'qa-org', tournamentId: ids.tournament }
]

const refereeCrew = {
  mainReferee: { _id: 'qa-ref-1', name: '张伟', phone: '13811111234' },
  assistant1: { _id: 'qa-ref-2', name: '李明', phone: '13922225678' },
  assistant2: { _id: 'qa-ref-3', name: '王强', phone: '13733332468' },
  fourthOfficial: { _id: 'qa-ref-4', name: '陈磊', phone: '13544449753' }
}

const divisions = [
  { _id: ids.divisionU8, id: ids.divisionU8, tournamentId: ids.tournament, name: 'U8组', mode: 'simple', formatType: '八人制小组联赛', matchFormat: '8side', ruleStatus: 'finalized', ruleProgress: 100, rulesLocked: true, rulesVersion: 'V1.0' },
  { _id: 'qa-division-u10', id: 'qa-division-u10', tournamentId: ids.tournament, name: 'U10组', mode: 'simple', formatType: '八人制淘汰赛', ruleStatus: 'configuring', ruleProgress: 66 },
  { _id: 'qa-division-u12', id: 'qa-division-u12', tournamentId: ids.tournament, name: 'U12组', mode: 'simple', formatType: '八人制混合赛', ruleStatus: 'draft', ruleProgress: 0 },
  { _id: 'qa-division-u14', id: 'qa-division-u14', tournamentId: ids.tournament, name: 'U14组', mode: 'professional', formatType: '十一人制联赛', ruleStatus: 'configuring', ruleProgress: 48 },
  { _id: ids.divisionU16, id: ids.divisionU16, tournamentId: ids.tournament, name: 'U16组', mode: 'professional', professionalMode: true, formatType: '十一人制混合赛', matchFormat: '11side', ruleStatus: 'finalized', ruleProgress: 100, rulesLocked: true, rulesVersion: 'V2.1' }
]

const scheduleDivisionMeta = [
  { id: ids.divisionU8, name: 'U8组', tournamentType: 'tournament', teamCount: 8, scheduleProgress: 100, rulesLocked: true, drawCompleted: true, venueConfigured: true },
  { id: 'qa-division-u10', name: 'U10组', tournamentType: 'tournament', teamCount: 8, scheduleProgress: 100, rulesLocked: true, drawCompleted: true, venueConfigured: true },
  { id: 'qa-division-u12', name: 'U12组', tournamentType: 'cup', teamCount: 8, scheduleProgress: 80, rulesLocked: true, drawCompleted: true, venueConfigured: true },
  { id: 'qa-division-u14', name: 'U14组', tournamentType: 'league', teamCount: 8, scheduleProgress: 100, rulesLocked: true, drawCompleted: true, venueConfigured: false },
  { id: ids.divisionU16, name: 'U16组', tournamentType: 'hybrid', teamCount: 6, scheduleProgress: 40, rulesLocked: true, drawCompleted: false, venueConfigured: false }
]

scheduleDivisionMeta.forEach(meta => {
  const division = divisions.find(item => item._id === meta.id)
  if (division) Object.assign(division, meta)
})

const tournament = {
  _id: ids.tournament,
  name: '2026河南青少年足球冠军联赛',
  orgId: 'qa-org',
  creatorId: 'qa-user',
  province: '河南省',
  city: '郑州市',
  location: '郑州市足球训练中心',
  startDate: '2026-07-20',
  endDate: '2026-08-18',
  registrationDeadline: '2026-07-15',
  status: 'ongoing',
  rosterLocked: false,
  divisions,
  professionalDrawConfigs: {
    [ids.divisionU16]: {
      setupSavedAt: '2026-07-26T09:00:00+08:00',
      poolValidated: true,
      screenSavedAt: '2026-07-26T10:00:00+08:00',
      seedLimit: 8,
      seedTeamIds: [ids.homeU16, ids.awayU16, 'qa-team-pro-01', 'qa-team-pro-02', 'qa-team-pro-03', 'qa-team-pro-04', 'qa-team-pro-05', 'qa-team-pro-06'],
      setup: {
        mode: 'group',
        groupCount: 8,
        teamsPerGroup: 4,
        seedCount: 8,
        distribution: 'one-per-group',
        avoidSameRegion: true,
        avoidSameOrganization: true,
        advancePerGroup: 1
      },
      screen: {
        content: 'drawing',
        showTournament: true,
        showCrest: true,
        showProgress: true,
        showRules: true,
        theme: 'emerald',
        layout: 'center',
        animation: 'flip',
        duration: '2',
        music: false,
        sound: true
      }
    }
  }
}

const teams = [
  { _id: ids.homeU8, teamCode: ids.homeU8, orgId: 'qa-org', name: '开封少年队', city: '开封', logo: '/admin/logo-saixiaofeng.png', contactName: '赵教练', contactPhone: '13800001111' },
  { _id: ids.awayU8, teamCode: ids.awayU8, orgId: 'qa-org', name: '新乡未来', city: '新乡', logo: '/admin/organization-logo-placeholder.svg', contactName: '孙教练', contactPhone: '13800002222' },
  { _id: ids.homeU16, teamCode: ids.homeU16, orgId: 'qa-org', name: '郑州劲风U16', city: '郑州', logo: '/admin/logo-saixiaofeng.png', contactName: '王教练', contactPhone: '13800003333' },
  { _id: ids.awayU16, teamCode: ids.awayU16, orgId: 'qa-org', name: '洛阳龙门U16', city: '洛阳', logo: '/admin/organization-logo-placeholder.svg', contactName: '陈教练', contactPhone: '13800004444' }
]

const professionalTeamNames = ['安阳星火', '焦作山阳', '许昌未来', '周口先锋', '开封少年', '信阳绿茵', '南阳卧龙', '商丘雄鹰', '濮阳龙乡', '漯河竞技', '平顶山逐梦', '鹤壁朝歌', '三门峡天鹅', '驻马店驿城', '济源王屋', '新乡未来U16', '郑州启航', '洛阳青训', '安阳少年', '焦作竞技', '许昌飞翼', '周口绿城', '开封荣耀', '信阳星锐', '南阳雄狮', '商丘未来', '濮阳少年', '漯河先锋', '平顶山劲旅', '鹤壁新星']
professionalTeamNames.forEach((name, index) => {
  const sequence = String(index + 1).padStart(2, '0')
  teams.push({ _id: `qa-team-pro-${sequence}`, teamCode: `226${String.fromCharCode(65 + (index % 8))}${sequence}112`, orgId: 'qa-org', name, city: name.slice(0, 2), logo: index % 3 === 0 ? '/admin/logo-saixiaofeng.png' : '/admin/organization-logo-placeholder.svg', contactName: `教练${sequence}`, contactPhone: `1380000${String(500 + index).padStart(4, '0')}` })
})

const tournamentTeams = teams.map((team, index) => ({
  _id: `qa-registration-${index + 1}`,
  tournamentId: ids.tournament,
  divisionId: index < 2 ? ids.divisionU8 : ids.divisionU16,
  divisionName: index < 2 ? 'U8组' : 'U16组',
  teamId: team._id,
  teamName: team.name,
  teamLogo: team.logo,
  status: index === 1 ? 'pending' : 'approved',
  claimStatus: index === 3 ? 'pending_claim' : 'claimed',
  contactName: team.contactName,
  contactPhone: team.contactPhone,
  rosterCount: index < 2 ? 16 : 22,
  profileCompleteCount: index < 2 ? 14 : 20,
  avoidText: index >= 2 && (index - 2) % 6 === 0 ? '同地区2队' : index >= 2 && (index - 2) % 11 === 0 ? '同机构2队' : '无',
  createTime: `2026-07-${String(8 + index).padStart(2, '0')}T09:00:00+08:00`
}))

const players = Array.from({ length: 24 }, (_, index) => ({
  _id: `qa-player-${index + 1}`,
  teamId: ids.homeU16,
  teamCode: ids.homeU16,
  name: ['刘洋', '张昊', '王磊', '陈凯', '李强', '徐浩', '赵晨', '孙博'][index % 8] + (index > 7 ? index + 1 : ''),
  jerseyNumber: index + 1,
  position: ['GK', 'DF', 'MF', 'FW'][index % 4],
  profileStatus: index === 3 ? 'exception' : index === 8 ? 'pending' : 'complete',
  idCardStatus: index === 3 ? 'failed' : 'verified',
  photoStatus: index === 8 ? 'pending' : 'approved'
}))

const matches = [
  { _id: ids.matchU8, tournamentId: ids.tournament, divisionId: ids.divisionU8, divisionName: 'U8组', matchFormat: '8side', matchSequence: 'U8-012', matchDate: '2026-07-28', matchTime: '16:30', venue: '2号场', status: 'completed', homeTeamId: ids.homeU8, awayTeamId: ids.awayU8, homeTeamName: '开封少年队', awayTeamName: '新乡未来', homeScore: 2, awayScore: 1, refereeCrew, refereeRecordLocked: true, refereeReviewStatus: 'under_review', refereeSubmittedAt: '2026-07-28T17:05:00+08:00', organizerSupplementFiles: [{ name: '红牌情况补充说明.pdf', size: 524288, sizeText: '512 KB', fileId: 'qa-file-supplement' }], organizerSupplementUpdatedAt: '2026-07-28T18:20:00+08:00' },
  { _id: ids.matchU16, tournamentId: ids.tournament, divisionId: ids.divisionU16, divisionName: 'U16组', matchFormat: '11side', matchSequence: 'U16-013', matchDate: '2026-07-29', matchTime: '10:30', venue: '1号场', status: 'completed', homeTeamId: ids.homeU16, awayTeamId: ids.awayU16, homeTeamName: '郑州劲风U16', awayTeamName: '洛阳龙门U16', homeScore: 2, awayScore: 1, refereeCrew, refereeName: '张伟', refereeRecordKeeperId: 'qa-ref-4', operationRefereeId: 'qa-ref-4', refereeRecordLocked: true, refereeReviewStatus: 'under_review', refereeSubmittedAt: '2026-07-29T11:15:00+08:00' },
  { _id: 'qa-match-upcoming', tournamentId: ids.tournament, divisionId: ids.divisionU16, divisionName: 'U16组', matchFormat: '11side', matchSequence: 'U16-014', matchDate: '2026-07-30', matchTime: '15:00', venue: '2号场', status: 'scheduled', homeTeamName: '开封竞技U16', awayTeamName: '新乡未来U16', refereeCrew: {} }
]

const scheduleMatchTargets = [
  { divisionId: ids.divisionU8, divisionName: 'U8组', count: 16, published: 16, conflicts: 0 },
  { divisionId: 'qa-division-u10', divisionName: 'U10组', count: 16, published: 16, conflicts: 0 },
  { divisionId: 'qa-division-u12', divisionName: 'U12组', count: 19, published: 12, conflicts: 2 },
  { divisionId: 'qa-division-u14', divisionName: 'U14组', count: 28, published: 18, conflicts: 0 },
  { divisionId: ids.divisionU16, divisionName: 'U16组', count: 13, published: 2, conflicts: 1 }
]

scheduleMatchTargets.forEach((target, targetIndex) => {
  const existing = matches.filter(match => match.divisionId === target.divisionId)
  existing.forEach((match, index) => {
    match.divisionName = target.divisionName
    match.schedulePublished = index < target.published
    match.published = index < target.published
    match.hasConflict = index < target.conflicts
  })
  for (let index = existing.length; index < target.count; index += 1) {
    const sequence = index + 1
    const dayOffset = Math.floor(index / 4)
    const matchDate = `2026-07-${String(20 + dayOffset).padStart(2, '0')}`
    const matchTime = ['09:00', '10:30', '14:00', '16:30'][index % 4]
    const isConflict = index < target.conflicts
    matches.push({
      _id: `qa-schedule-${target.divisionId}-${sequence}`,
      tournamentId: ids.tournament,
      divisionId: target.divisionId,
      divisionName: target.divisionName,
      matchSequence: `${target.divisionName.replace('组', '')}-${String(sequence).padStart(3, '0')}`,
      matchDate,
      matchTime,
      venue: `${(index % 3) + 1}号场地`,
      phase: targetIndex === 2 ? 'cup' : targetIndex === 3 ? 'league' : targetIndex === 4 ? 'group' : 'tournament',
      round: Math.floor(index / 4) + 1,
      roundName: `第 ${Math.floor(index / 4) + 1} 轮`,
      status: 'scheduled',
      homeTeamId: `qa-schedule-team-${targetIndex}-${(index * 2) % 8}`,
      awayTeamId: `qa-schedule-team-${targetIndex}-${(index * 2 + 1) % 8}`,
      homeTeamName: `${target.divisionName}球队${String((index * 2) % 8 + 1).padStart(2, '0')}`,
      awayTeamName: `${target.divisionName}球队${String((index * 2 + 1) % 8 + 1).padStart(2, '0')}`,
      schedulePublished: index < target.published,
      published: index < target.published,
      hasConflict: isConflict,
      scheduleConflict: isConflict,
      conflictStatus: isConflict ? 'conflict' : ''
    })
  }
})

const signatureSet = {
  mainReferee: { name: '张伟', signedAt: '2026-07-29T13:20:00+08:00' },
  homeTeam: { name: '郑州劲风U16', signedAt: '2026-07-29T13:21:00+08:00' },
  awayTeam: { name: '洛阳龙门U16', signedAt: '2026-07-29T13:22:00+08:00' }
}

matches.forEach(match => {
  match.refereeRecord = {
    submittedAt: match.refereeSubmittedAt,
    matchSheet: 'qa-match-sheet',
    signatureSheet: 'qa-signature-sheet',
    crew: refereeCrew,
    report: { fairPlay: '良好', description: '比赛正常完成，双方队员遵守规则，无重大异常。' },
    signatures: signatureSet,
    lineups: { home: { starters: Array(match.matchFormat === '8side' ? 8 : 11), substitutes: Array(6) }, away: { starters: Array(match.matchFormat === '8side' ? 8 : 11), substitutes: Array(6) } }
  }
})

const events = [
  { _id: 'qa-event-1', eventId: 'qa-event-1', matchId: ids.matchU16, minute: 12, type: 'goal', teamSide: 'home', teamName: '郑州劲风U16', playerName: '10号 刘洋', score: '1 : 0' },
  { _id: 'qa-event-2', eventId: 'qa-event-2', matchId: ids.matchU16, minute: 28, type: 'yellow_card', teamSide: 'away', teamName: '洛阳龙门U16', playerName: '8号 李强', score: '1 : 0' },
  { _id: 'qa-event-3', eventId: 'qa-event-3', matchId: ids.matchU16, minute: 36, type: 'substitution', teamSide: 'home', teamName: '郑州劲风U16', playerName: '15号 徐浩 / 7号 张昊', score: '1 : 0' },
  { _id: 'qa-event-4', eventId: 'qa-event-4', matchId: ids.matchU16, minute: 41, type: 'goal', teamSide: 'away', teamName: '洛阳龙门U16', playerName: '11号 陈凯', score: '1 : 1' },
  { _id: 'qa-event-5', eventId: 'qa-event-5', matchId: ids.matchU16, minute: 58, type: 'goal', teamSide: 'home', teamName: '郑州劲风U16', playerName: '9号 王磊', score: '2 : 1' },
  { _id: 'qa-event-u8-1', eventId: 'qa-event-u8-1', matchId: ids.matchU8, minute: 18, type: 'yellow_card', teamSide: 'away', teamName: '新乡未来', playerName: '球员待补充', score: '0 : 0' },
  { _id: 'qa-event-u8-2', eventId: 'qa-event-u8-2', matchId: ids.matchU8, minute: 28, type: 'goal', teamSide: 'home', teamName: '开封少年队', playerName: '张昊', score: '2 : 1' }
]

const tournamentGroups = [
  { _id: 'qa-group-a', tournamentId: ids.tournament, divisionId: ids.divisionU16, name: 'A组', groupName: 'A组', teams: [ids.homeU16, ids.awayU16] },
  { _id: 'qa-group-b', tournamentId: ids.tournament, divisionId: ids.divisionU16, name: 'B组', groupName: 'B组', teams: [ids.homeU8, ids.awayU8] }
]

const rosterChanges = [
  { _id: 'qa-change-1', requestNo: 'RQ20260729001', tournamentId: ids.tournament, divisionId: ids.divisionU16, teamId: ids.homeU16, teamName: '郑州劲风U16', outPlayerName: '赵晨', inPlayerName: '周航', reason: 'injury', reasonText: '伤病替换', status: 'pending', applyTime: '2026-07-29T09:10:00+08:00' },
  { _id: 'qa-change-2', requestNo: 'RQ20260728002', tournamentId: ids.tournament, divisionId: ids.divisionU16, teamId: ids.awayU16, teamName: '洛阳龙门U16', outPlayerName: '孙博', inPlayerName: '高远', reason: 'profile_error', reasonText: '资料纠错', status: 'approved', reviewerName: '赛事管理员', applyTime: '2026-07-28T14:30:00+08:00' }
]

const store = {
  tournaments: [tournament],
  divisions,
  teams,
  tournament_teams: tournamentTeams,
  players,
  player_library: players,
  coaches: [{ _id: 'qa-coach-1', teamId: ids.homeU16, name: '王教练', phone: '13800003333', role: '主教练' }],
  matches,
  match_events: events,
  referees,
  users: referees,
  tournament_groups: tournamentGroups,
  tournament_bracket: [],
  tournament_league_tables: []
}

export function visualQaActive() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  const hashQuery = window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?') + 1) : ''
  if (new URLSearchParams(hashQuery).get('visualQa') === '1' || window.location.href.includes('visualQa=1')) {
    sessionStorage.setItem(QA_SESSION_KEY, '1')
    localStorage.setItem(QA_SESSION_KEY, '1')
  }
  return sessionStorage.getItem(QA_SESSION_KEY) === '1' || localStorage.getItem(QA_SESSION_KEY) === '1'
}

function matchesWhere(record, where = {}) {
  return Object.entries(where || {}).every(([key, value]) => value == null || value === '' || record[key] === value)
}

function rosterRows() {
  return players.slice(0, 22).map((player, index) => ({ ...player, id: player._id, snapshotId: `qa-snapshot-${index + 1}`, teamId: ids.homeU16, teamName: '郑州劲风U16', divisionId: ids.divisionU16, divisionName: 'U16组' }))
}

function rosterExceptionResult(action) {
  if (action === 'listRoster') {
    return { success: true, rows: rosterRows(), tournament, relation: tournamentTeams.find(item => item.teamId === ids.homeU16), snapshot: { _id: 'qa-roster-snapshot', status: 'submitted', submittedAt: '2026-07-29T08:30:00+08:00' } }
  }
  if (action === 'list') {
    const rows = rosterRows().filter(row => row.profileStatus !== 'complete')
    return { success: true, rows, counts: { exception: 1, pending: 1, affectedRosters: 1 }, tournament, divisions }
  }
  return { success: true, message: '本地验收：操作已记录，不会写入云端。' }
}

export function handleVisualQaHttp(action, data = {}) {
  if (!visualQaActive()) return { handled: false }
  if (action === 'dbQuery') {
    const rows = store[data.collection] || []
    if (data.operation === 'list') return { handled: true, result: { success: true, data: rows.filter(row => matchesWhere(row, data.where)).slice(data.skip || 0, (data.skip || 0) + (data.limit || 100)) } }
    if (data.operation === 'get') return { handled: true, result: { success: true, data: rows.find(row => row._id === data.id) || null } }
    if (data.operation === 'count') return { handled: true, result: { success: true, total: rows.filter(row => matchesWhere(row, data.where)).length } }
    if (data.operation === 'update') { const row = rows.find(item => item._id === data.id); if (row) Object.assign(row, data.data || {}); return { handled: true, result: { success: true } } }
    if (data.operation === 'add') { const row = { _id: `qa-${data.collection}-${Date.now()}`, ...(data.data || {}) }; rows.push(row); return { handled: true, result: { success: true, _id: row._id } } }
    if (data.operation === 'delete') { const index = rows.findIndex(item => item._id === data.id); if (index >= 0) rows.splice(index, 1); return { handled: true, result: { success: true } } }
  }
  if (action === 'rosterExceptionBoard') return { handled: true, result: rosterExceptionResult(data.rosterAction) }
  if (action === 'reviewRefereeRecord') {
    const match = matches.find(item => item._id === data.matchId)
    if (match && data.reviewOperation === 'archive') { match.refereeReviewStatus = 'archived'; match.refereeArchivedAt = new Date().toISOString() }
    if (match && data.reviewOperation === 'return') match.refereeReviewStatus = 'returned'
    return { handled: true, result: { success: true, message: data.reviewOperation === 'archive' ? '本地验收：赛果已归档。' : '本地验收：已退回限时修正。' } }
  }
  if (action === 'callFunction') {
    if (data.functionName === 'updateMatch') {
      const match = matches.find(item => item._id === data.functionParams?.matchId)
      if (match) Object.assign(match, data.functionParams?.data || {})
      return { handled: true, result: { success: true, message: '本地验收：比赛信息已更新。' } }
    }
    if (data.functionName === 'reviewRosterChange') {
      const operation = data.functionParams?.action
      if (operation === 'getList') return { handled: true, result: { success: true, data: rosterChanges } }
      const request = rosterChanges.find(item => item._id === data.functionParams?.requestId)
      if (request) Object.assign(request, { status: operation === 'approve' ? 'approved' : 'rejected', reviewerName: data.functionParams?.reviewerName || '本地验收管理员' })
      return { handled: true, result: { success: true, message: '本地验收：审核结果已更新。' } }
    }
    if (data.functionName === 'generateSchedule') return { handled: true, result: { success: true, matches } }
    return { handled: true, result: { success: true, message: '本地验收：动作已完成，不会写入云端。' } }
  }
  return { handled: false }
}

export const visualQaIds = ids

export function getVisualQaSnapshot() {
  return { tournament, divisions, tournamentTeams, teams, players, matches, referees }
}
