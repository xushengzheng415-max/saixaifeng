// Browser-only repository. No transport or production credentials belong here.
import { calculateMatchEventScore } from '../../../cloudfunctions/dataCenter/shared/match-events.mjs'
import standings from '../../../cloudfunctions/dataCenter/shared/standings.cjs'
export const DEMO_ORG_ID = 'demo-organization'
export function createDemoWorkspace() {
  let sequence = 0
  const tables = {}
  const clone = value => JSON.parse(JSON.stringify(value))
  const rows = name => tables[name] ||= []
  const fail = message => { throw new Error(message) }
  const success = data => ({ success: true, data: clone(data) })
  function add(collection, data) {
    const record = { ...clone(data), _id: `demo-${collection}-${++sequence}`, orgId: DEMO_ORG_ID, synthetic: true, isTest: true, source: 'browser_demo', createTime: new Date().toISOString() }
    rows(collection).push(record)
    if (collection === 'tournaments') {
      const divisions = record.divisions?.length ? record.divisions : (record.regulationDivisionSuggestions?.length ? [] : [{ name:record.divisionName || '默认组别', tournamentType:record.tournamentType, matchFormat:record.matchFormat, maxTeams:record.maxTeams, maxPlayersPerTeam:record.maxPlayersPerTeam, rules:record.rules || {} }])
      record.divisions = divisions.map(division => {
        const id = String(division.id || '').startsWith('demo-') ? division.id : `demo-division-${++sequence}`
        const row = { ...division, id, _id:id, tournamentId:record._id, orgId:DEMO_ORG_ID, synthetic:true }
        rows('divisions').push(row)
        return clone(row)
      })
      record.defaultDivisionId = record.divisions[0]?.id || 'default'
      for (const referee of rows('referees').filter(row => !row.tournamentId)) add('referees', { ...referee, tournamentId:record._id })
    }
    if (collection === 'divisions') {
      const tournament = rows('tournaments').find(row => row._id === record.tournamentId)
      if (tournament) {
        tournament.divisions ||= []
        tournament.divisions.push({ ...clone(record), id:record._id })
        if (tournament.divisions.length === 1) tournament.defaultDivisionId = record._id
      }
    }
    return record
  }
  function get(collection, id) {
    return rows(collection).find(row => String(row._id) === String(id)) || fail('演示空间中没有这条记录，请返回赛事空间')
  }
  function match(row, where = {}) {
    return Object.entries(where).every(([key, expected]) => {
      // Existing pages use the logged-in org in their query. Only this local repository is searched.
      if (['orgId', 'organizationId', 'creatorId', 'ownerId', 'userId'].includes(key)) return true
      const value = key.split('.').reduce((item, part) => item?.[part], row)
      if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
        if ('$in' in expected) return expected.$in.includes(value)
        if ('$ne' in expected) return value !== expected.$ne
        if ('$eq' in expected) return value === expected.$eq
        if ('$exists' in expected) return (value !== undefined) === expected.$exists
        if ('$regex' in expected) return new RegExp(expected.$regex, expected.$options || '').test(String(value || ''))
        fail(`演示查询暂不支持条件：${key}`)
      }
      return Array.isArray(value) ? value.includes(expected) : value === expected
    })
  }
  function update(collection, id, data = {}) {
    const row = get(collection, id)
    Object.assign(row, clone(data), { _id: row._id, orgId: DEMO_ORG_ID, synthetic: true, isTest: true, source: 'browser_demo', updateTime: new Date().toISOString() })
    return row
  }
  function remove(collection, id) {
    get(collection, id)
    tables[collection] = rows(collection).filter(row => row._id !== id)
  }
  function query(params) {
    const { collection, operation, id, data = {} } = params
    if (operation === 'list' || operation === 'count') {
      const list = rows(collection).filter(row => match(row, params.where))
      for (const [key, direction] of Object.entries(params.orderBy || {}).reverse()) list.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'zh') * (direction === 'desc' ? -1 : 1))
      return operation === 'count' ? { success: true, total: list.length } : success(list.slice(params.skip || 0, (params.skip || 0) + (params.limit || 100)))
    }
    if (operation === 'get') return success(get(collection, id))
    if (operation === 'add') { const row = add(collection, data); return { ...success(row), id: row._id, _id: row._id } }
    if (operation === 'update') return success(update(collection, id, data))
    if (['delete', 'deleteDivision', 'deleteTournamentWorkspace'].includes(operation)) {
      remove(collection, id)
      if (operation === 'deleteTournamentWorkspace') for (const name of Object.keys(tables)) tables[name] = rows(name).filter(row => row.tournamentId !== id)
      return success({ removed: 1 })
    }
    const operations = {
      confirmDivisionRules: { ...data, rulesLocked: true, ruleStatus: 'finalized', rulesVersion: 'demo-v1' },
      reviseDivisionRules: { rulesLocked: false, ruleStatus: 'draft' },
      renameDivision: data,
      assignTournamentTeamDivision: data,
      upgradeDivisionToProfessional: { ...data, mode: 'professional', professionalMode: true },
      confirmCompetitionPlan: { ...data, competitionPlanConfirmed: true }
    }
    if (operations[operation]) return success(update(collection, id, operations[operation]))
    return fail('这项操作尚未接入模拟，不会调用真实接口')
  }
  function registration(params) {
    const { action, tournamentId, divisionId = 'default' } = params
    if (action === 'addSyntheticTeams') {
      get('tournaments', tournamentId)
      const additions = (params.teamIds || []).filter(teamId => !rows('tournament_teams').some(row => row.tournamentId === tournamentId && row.divisionId === divisionId && row.teamId === teamId))
      for (const teamId of additions) {
        const team = get('teams', teamId)
        const players = rows('players').filter(player => player.teamId === teamId)
        const registration = add('tournament_teams', { tournamentId, divisionId, teamId, teamName: team.name, name: team.name, status: 'approved', participationStatus: 'confirmed', claimStatus: 'claimed', claimed: true, players: clone(players), playerIds: players.map(player => player._id), playerCount: players.length })
        add('roster_snapshots', { tournamentId, divisionId, teamId, registrationId: registration._id, status: 'approved', players: clone(players) })
      }
      return { success: true, addedCount: additions.length, message: '虚拟球队已添加' }
    }
    if (action === 'reviewRegistration') return success(update('tournament_teams', params.registrationId, { status: params.decision, participationStatus: params.decision === 'approved' ? 'confirmed' : params.decision }))
    if (action === 'setDivisionRegistration') return success(update('divisions', divisionId, { registrationEnabled: params.enabled }))
    if (action === 'createTemporaryRefereeClaim') {
      const row = add('referees', { tournamentId, name: params.name, status: 'approved', canOperate: true, level: '虚拟裁判' })
      return success({ refereeId: row._id })
    }
    if (action === 'reviewTemporaryRefereeClaim') return success(update('referees', params.refereeId, { status: 'approved', canOperate: true }))
    return fail('演示模式不发送真实邀请或通知，请直接使用虚拟球队和裁判')
  }
  function schedule(params) {
    const { action, tournamentId, divisionId } = params
    const tournament = get('tournaments', tournamentId)
    const selected = row => row.tournamentId === tournamentId && (!divisionId || row.divisionId === divisionId)
    if (action === 'saveDraft') return success(update('tournaments', tournamentId, { scheduleConfig: params.scheduleConfig }))
    if (action === 'resetPairings') { tables.matches = rows('matches').filter(row => !selected(row)); return success({}) }
    if (['publishSchedule', 'publishRegulations'].includes(action)) {
      if (action === 'publishSchedule') rows('matches').filter(selected).forEach(row => { row.schedulePublished = true })
      else if (divisionId) update('divisions', divisionId, { regulationsPublished: true })
      return { success: true, publicationId: `demo-publication-${++sequence}`, version: 'demo-v1', matchCount: rows('matches').filter(selected).length }
    }
    if (action === 'generatePairings') {
      if (rows('matches').some(selected)) return fail('已有模拟对阵，请先重置对阵')
      const teams = rows('tournament_teams').filter(selected)
      if (teams.length < 2) return fail('请先添加至少两支虚拟球队')
      // Simple round-robin rehearsal only; professional draw stays in its existing page logic.
      for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) add('matches', { tournamentId, divisionId: divisionId || 'default', divisionName: params.divisionName || '', groupName:'', homeTeamId: teams[a].teamId, awayTeamId: teams[b].teamId, homeTeamName: teams[a].teamName, awayTeamName: teams[b].teamName, status: 'scheduled', stage: 'league', round: a + 1, homeScore: null, awayScore: null, matchEventRevision: 0, events: [] })
      return { success: true, matchCount: rows('matches').filter(selected).length }
    }
    if (action === 'scheduleExistingPairings') {
      const list = rows('matches').filter(row => selected(row) && (!params.divisionIds || params.divisionIds.includes(row.divisionId)))
      if (!list.length) return fail('请先在抽签分组中生成对阵')
      const config = params.scheduleConfig || {}
      const date = config.startDate || tournament.startDate || new Date().toISOString().slice(0, 10)
      list.forEach((row, index) => Object.assign(row, { matchDate: date, matchTime: `${String(9 + Math.floor(index / Math.max(1, (config.venues || []).length))).padStart(2, '0')}:00`, venue: (config.venues || [])[index % Math.max(1, (config.venues || []).length)] || '模拟球场' }))
      update('tournaments', tournamentId, { scheduleGenerated: true, scheduleConfig: config })
      return { success: true, matchCount: list.length, scheduleEngineVersion: 'browser-demo' }
    }
    return fail('这项赛程操作尚未接入模拟，不会调用真实接口')
  }
  function request(action, params = {}) {
    if (action === 'dbQuery') return query(params)
    if (action === 'callFunction') return request(params.functionName, params.functionParams)
    if (action === 'webBatchUpdate' || action === 'deleteRecord') return query({ ...params, operation: params.action })
    if (action === 'tournamentRegistrationFlow') return registration(params)
    if (action === 'generateSchedule') return schedule(params)
    if (action === 'updateMatch') {
      const row = get('matches', params.matchId)
      if (params.expectedEventRevision !== undefined && params.expectedEventRevision !== (row.matchEventRevision || 0)) return fail('模拟比赛已更新，请刷新后重试')
      if (params.action && !['finishOrganizerMatch', 'forfeitMatch'].includes(params.action)) return fail('这项比赛操作尚未接入模拟')
      const data = { ...(params.data || {}) }
      if (Array.isArray(data.events)) {
        const score = calculateMatchEventScore({ ...row, events: data.events })
        Object.assign(data, { homeScore: score.home, awayScore: score.away, matchEventRevision: (row.matchEventRevision || 0) + 1 })
      }
      if (params.action === 'finishOrganizerMatch') {
        const score = calculateMatchEventScore(row)
        Object.assign(data, { status: 'finished', homeScore: score?.home ?? data.homeScore, awayScore: score?.away ?? data.awayScore })
      }
      if (params.action === 'forfeitMatch') Object.assign(data, { status: 'finished', resultType: 'forfeit', homeScore: data.forfeitTeamId === row.homeTeamId ? 0 : 3, awayScore: data.forfeitTeamId === row.awayTeamId ? 0 : 3 })
      return success(update('matches', params.matchId, data))
    }
    if (action === 'tournamentStaffAccess') {
      if (['scope', 'mine', 'invitations'].includes(params.action)) return { success: true, isOwner: true, isStaff: false, activeOrgId: DEMO_ORG_ID, grants: [], invitations: [] }
      return fail('演示模式不修改真实账号授权')
    }
    if (action === 'onboardingWorkspace' && params.action === 'organizerInboxList') return success({ messages: [], unreadCount: 0 })
    if (action === 'onboardingWorkspace' && params.action === 'state') return { success: true, organization: { id: DEMO_ORG_ID, name: '模拟机构', capabilities: ['event'] }, requiresOnboarding: false }
    if (action === 'uploadFile' && params.action === 'uploadBase64') return { success: true, fileID: params.base64Data, tempUrl: params.base64Data }
    if (action === 'uploadImage') return { success: true, fileID: params.base64Data, fileId: params.base64Data, url: params.base64Data }
    if (action === 'uploadFile' && params.action === 'getTempFileURL') return { success: true, url: String(params.fileID || '').startsWith('data:') ? params.fileID : '' }
    if (action === 'getSignatureStatus') return { success: true, signatures: [], data: {} }
    if (action === 'resultCenter') {
      const tournament = get('tournaments', params.tournamentId)
      const divisions = rows('divisions').filter(row => row.tournamentId === tournament._id)
      const matches = rows('matches').filter(row => row.tournamentId === tournament._id).map(row => ({ ...clone(row), id: row._id, divisionName:row.divisionName || '', groupName:row.groupName || '', scoreReady: Number.isFinite(row.homeScore) && Number.isFinite(row.awayScore), resultStatus: ['finished', 'completed'].includes(row.status) ? 'approved' : 'not_submitted', standingsEligible: ['league','group','round_robin'].includes(row.stage), yellowHome:0, yellowAway:0, redHome:0, redAway:0 }))
      const tables = standings.buildStandings(matches, Object.fromEntries(divisions.map(row => [row._id, row])))
      if (params.action === 'publishStandings') {
        if (!tables.some(table => table.officialMatchCount)) return fail('请先完成模拟比赛')
        add('publication_snapshots', { tournamentId:tournament._id, divisionId:params.divisionId, type:'standings', version:1, standings:tables })
        return { success:true, message:'模拟积分榜已发布' }
      }
      if (!['dashboard', 'teamData'].includes(params.action)) return fail('这项成绩操作尚未接入模拟')
      return { success:true, tournament:{ ...clone(tournament), id:tournament._id }, divisions:divisions.map(row => ({ ...clone(row), id:row._id })), matches, events:matches.flatMap(row => row.events || []), standings:tables, knockout:[], publications:clone(rows('publication_snapshots').filter(row => row.tournamentId === tournament._id)), generatedAt:new Date().toISOString() }
    }
    if (action === 'getPlayers') return { ...success(rows('players')), players: clone(rows('players')) }
    if (action === 'deleteTeam') { remove('teams', params.teamId); tables.players = rows('players').filter(row => row.teamId !== params.teamId); return success({}) }
    return fail('这项操作尚未接入模拟，不会调用真实接口')
  }
  for (const ageGroup of ['成人', 'U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'open']) {
    for (let index = 1; index <= (ageGroup === 'open' ? 8 : 4); index++) {
      const label = ageGroup === 'open' ? '青少年' : ageGroup
      const team = add('teams', { name: `模拟${label}球队${index}`, teamName: `模拟${label}球队${index}`, ageGroup, status: 'active', playerCount: ageGroup === 'open' ? 12 : 18 })
      for (let number = 1; number <= team.playerCount; number++) add('players', { teamId: team._id, name: `虚拟球员${index}-${number}`, realName: `虚拟球员${index}-${number}`, jerseyNumber: number, number, ageGroup, gender: '男', birthDate: ageGroup === '成人' ? '1996-01-01' : ageGroup === 'open' ? '2014-01-01' : `${2026 - Number(ageGroup.slice(1))}-01-01`, status: 'active', position: number === 1 ? '门将' : '前锋' })
    }
  }
  for (let index = 1; index <= 8; index++) add('referees', { name: `虚拟裁判${index}`, status: 'approved', auditStatus: 'approved', canOperate: true, availabilityStatus: 'available', level: '一级' })
  return {
    request,
    snapshot: () => clone({ sequence, tables }),
    restore(value) { sequence = value.sequence; for (const name of Object.keys(tables)) delete tables[name]; Object.assign(tables, clone(value.tables)) }
  }
}
