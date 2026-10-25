const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')
const customerProfiles = require('./customerProfile.cjs')
const platformArchive = require('./platformArchive.cjs')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

const OWNER_SETTING_ID = 'platform-owner'
const PAGE_SIZE = 100
const MAX_LIST_SIZE = 5000

function firstRecord(data) {
  if (Array.isArray(data)) return data[0] || null
  return data || null
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength)
}

function maskPhone(phone) {
  const value = String(phone || '').replace(/\D/g, '')
  if (value.length !== 11) return value
  return `${value.slice(0, 3)}****${value.slice(-4)}`
}

function normalizePhone(phone) {
  const value = String(phone || '').replace(/\D/g, '')
  return value.length === 11 ? value : ''
}

function firstText(record, fields) {
  for (const field of fields) {
    const value = cleanText(record && record[field], 300)
    if (value) return value
  }
  return ''
}

function recordOrgId(record) {
  return firstText(record, ['orgId', 'organizationId', 'organization_id'])
}

function recordCreatorId(record) {
  return firstText(record, ['creatorId', 'organizerId', 'ownerId', 'ownerUserId', 'userId', 'createdBy'])
}

async function loadAll(db, collectionName, maxRows = MAX_LIST_SIZE) {
  const rows = []
  for (let skip = 0; skip < maxRows; skip += PAGE_SIZE) {
    const result = await db.collection(collectionName).skip(skip).limit(PAGE_SIZE).get()
    const page = result.data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function loadAllOptional(db, collectionName, maxRows = MAX_LIST_SIZE) {
  try {
    return await loadAll(db, collectionName, maxRows)
  } catch (error) {
    console.warn(`[manageTournamentCenterContent] optional collection unavailable: ${collectionName}`)
    return []
  }
}

function toTimestamp(value) {
  if (!value) return 0
  const raw = value && typeof value === 'object' && value.$date ? value.$date : value
  const timestamp = new Date(raw).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

async function resolveCurrentUser(db, event) {
  const authToken = String(event.__authToken || '').trim()
  if (!authToken) throw new Error('网页登录会话已失效，请重新登录')

  const sessionsResult = await db.collection('auth_sessions').where({
    tokenHash: hashSessionToken(authToken),
    active: true,
    expiresAt: db.command.gt(new Date())
  }).limit(2).get()
  const sessions = sessionsResult.data || []
  if (sessions.length !== 1) throw new Error('网页登录会话已失效，请重新登录')

  if (sessions[0].principalType === 'platform_owner' && sessions[0].channel === 'platform_password') {
    return { _id: 'platform-owner', nickname: '平台负责人', role: 'platform_owner', isPlatformOwner: true }
  }

  const userResult = await db.collection('users').doc(sessions[0].userId).get()
  const user = firstRecord(userResult.data)
  if (!user) throw new Error('当前登录账号不存在，请重新登录')
  return user
}

async function getOwnerSetting(db) {
  try {
    const result = await db.collection('platform_settings').doc(OWNER_SETTING_ID).get()
    return firstRecord(result.data)
  } catch (error) {
    return null
  }
}

async function requirePlatformOwner(db, user) {
  const [setting, flaggedResult] = await Promise.all([
    getOwnerSetting(db),
    db.collection('users').where({ isPlatformOwner: true }).limit(2).get()
  ])
  const flaggedOwners = flaggedResult.data || []
  if (flaggedOwners.length > 1) throw new Error('检测到多个平台负责人账号，请先处理账号配置')

  const configuredOwnerId = cleanText(process.env.PLATFORM_OWNER_USER_ID, 128)
  const ownerUserId = (setting && setting.ownerUserId) ||
    (flaggedOwners[0] && flaggedOwners[0]._id) ||
    configuredOwnerId
  const isOwner = Boolean(user.isPlatformOwner === true) ||
    Boolean(ownerUserId && String(ownerUserId) === String(user._id))
  if (!isOwner) throw new Error('仅平台负责人可以管理赛事中心内容')
}

function safeBanner(banner) {
  return {
    _id: banner._id,
    title: banner.title || '',
    imageUrl: banner.imageUrl || banner.image || '',
    link: banner.link || '',
    sort: Number(banner.sort || 0),
    isActive: banner.isActive !== false && banner.status !== 'inactive',
    storageType: banner.storageType || '',
    createTime: banner.createTime || banner.createdAt || null,
    updateTime: banner.updateTime || banner.updatedAt || null
  }
}

function safeTournament(tournament, context = {}) {
  const orgId = recordOrgId(tournament)
  const creatorId = recordCreatorId(tournament)
  const organization = context.organizationsById && context.organizationsById.get(orgId)
  const creator = context.usersById && context.usersById.get(creatorId)
  const relationCount = context.tournamentTeamCounts && context.tournamentTeamCounts.get(String(tournament._id))
  return {
    _id: tournament._id, ...platformArchive.archiveFields(tournament),
    name: tournament.name || '未命名赛事',
    coverImage: tournament.coverImage || tournament.cover || tournament.poster || '',
    organizerName: tournament.organizerName || tournament.organizer || tournament.organizationName ||
      (organization && (organization.name || organization.organizationName)) ||
      (creator && (creator.organizationName || creator.nickname || creator.name)) || '',
    organizerUserId: creatorId,
    orgId,
    creatorName: (creator && (creator.contactName || creator.nickname || creator.name)) || '',
    creatorPhone: normalizePhone(creator && (creator.phone || creator.phoneNumber)),
    creatorEmail: (creator && creator.email) || '',
    category: tournament.category || tournament.type || '',
    formatType: tournament.formatType || tournament.format || '',
    ageGroup: tournament.ageGroup || '',
    status: tournament.status || 'draft',
    isFeatured: tournament.isFeatured === true || tournament.featured === true,
    featuredSort: Number(tournament.featuredSort || tournament.sort || 0),
    publicStatus: cleanText(tournament.publicStatus, 40),
    publicVersion: Number(tournament.publicVersion || 0),
    teamCount: Number(relationCount || tournament.registeredTeams || tournament.approvedTeams || tournament.teamCount || 0),
    startDate: tournament.startDate || tournament.eventStartDate || null,
    endDate: tournament.endDate || tournament.eventEndDate || null,
    city: tournament.city || tournament.cityName || tournament.location || '',
    createTime: tournament.createTime || tournament.createdAt || null,
    updateTime: tournament.updateTime || tournament.updatedAt || null
  }
}

async function getStartedTournamentIds(db, event) {
  const tournamentIds = Array.from(new Set((Array.isArray(event.tournamentIds) ? event.tournamentIds : [])
    .map(value => cleanText(value, 128))
    .filter(Boolean)))
  if (tournamentIds.length > 100) {
    return { success: false, error: '一次最多刷新 100 场赛事，请分批重试' }
  }
  if (!tournamentIds.length) return { success: true, data: { startedTournamentIds: [] } }

  const startedStatuses = ['ongoing', 'live', 'finished', 'completed', 'ended']
  const startedFlags = await Promise.all(tournamentIds.map(async tournamentId => {
    const result = await db.collection('matches')
      .where({ tournamentId, status: db.command.in(startedStatuses) })
      .field({ _id: true })
      .limit(1)
      .get()
    return (result.data || []).length ? tournamentId : ''
  }))
  return { success: true, data: { startedTournamentIds: startedFlags.filter(Boolean) } }
}

function safeOrganizer(user) {
  return {
    _id: user._id,
    name: user.organizationName || user.organizerName || user.nickname || user.name || '未命名主办方',
    contact: user.contactName || user.nickname || user.name || '',
    phone: normalizePhone(user.phone || user.phoneNumber),
    phoneMasked: maskPhone(user.phone || user.phoneNumber),
    email: user.email || '',
    orgId: String(user.orgId || user.organizationId || '').trim(),
    isActive: user.status !== 'disabled' && user.isActive !== false,
    createTime: user.createTime || user.createdAt || null
  }
}

function safeOrganizerAccount(user, tournamentRows, teamRows) {
  const userId = String(user._id || '')
  return {
    ...customerProfiles.accountSummary(user),
    _id: userId,
    name: user.contactName || user.nickname || user.userName || user.name || maskPhone(user.phone || user.phoneNumber) || '未命名账号',
    phone: normalizePhone(user.phone || user.phoneNumber),
    email: cleanText(user.email, 160),
    orgId: recordOrgId(user),
    role: cleanText(user.role, 40) || 'organizer',
    pcAccountStatus: cleanText(user.pcAccountStatus, 30) || 'active',
    isActive: user.status !== 'disabled' && user.isActive !== false && user.pcAccountStatus !== 'cancelled',
    tournamentCount: tournamentRows.filter(item => recordCreatorId(item) === userId).length,
    teamCount: teamRows.filter(item => recordCreatorId(item) === userId).length,
    createTime: user.createTime || user.createdAt || null,
    lastLoginTime: user.lastLoginTime || user.lastLoginAt || null
  }
}

const ORG_IDENTITY_LABELS = { school: '学校', enterprise: '企业', association: '协会', event_company: '赛事公司' }
const ORG_VOLUME_LABELS = { under_10: '年办赛 10 场以内', '10_30': '年办赛 10-30 场', '30_50': '年办赛 30-50 场', over_50: '年办赛 50 场以上' }
const ORG_AUDIENCE_LABELS = { youth: '青少年赛事为主', adult: '成人赛事为主' }
const ORG_IDENTITIES = Object.keys(ORG_IDENTITY_LABELS)
const ORG_VOLUMES = Object.keys(ORG_VOLUME_LABELS)
const ORG_AUDIENCES = Object.keys(ORG_AUDIENCE_LABELS)
const TEST_ORGANIZER_NAME = /(测试|演示|demo|test|示例)/i
// 人工跟进结果，只用于平台运营的客户管理，不参与账号、权限或业务数据判断。
const ORGANIZER_FOLLOW_UP_STATUSES = { not_contacted: '未联系', contacted: '已联系待回复', interested: '有意向待落地', started: '已开始办赛', not_needed: '明确不需要', invalid: '号码无效' }
// 使用阶段只按赛事状态自动判定：有未结束赛事=正在办赛，仅有已结束赛事=已办赛，无赛事或仅草稿=未开始使用。
const STAGE_ACTIVE_STATUSES = ['ongoing', 'live', 'registering', 'published']
const STAGE_FINISHED_STATUSES = ['ended', 'completed', 'finished']
const MATCH_FINISHED_STATUSES = ['completed', 'finished', 'ended']
const ORGANIZER_STAGE_STATUSES = { hosting: '正在办赛', hosted: '已办赛', not_started: '未开始使用' }

function organizerUsageStage(tournamentStatuses) {
  const statuses = (Array.isArray(tournamentStatuses) ? tournamentStatuses : []).map(value => String(value || '').toLowerCase())
  if (statuses.some(status => STAGE_ACTIVE_STATUSES.includes(status))) return { stage: 'hosting', label: ORGANIZER_STAGE_STATUSES.hosting }
  if (statuses.some(status => STAGE_FINISHED_STATUSES.includes(status))) return { stage: 'hosted', label: ORGANIZER_STAGE_STATUSES.hosted }
  return { stage: 'not_started', label: ORGANIZER_STAGE_STATUSES.not_started }
}

// 赛事状态常停在“进行中”，但比赛已经全部打完。这里补一层比赛记录校验，避免使用阶段长期误判为正在办赛。
async function loadTournamentMatchProgress(db, tournamentIds) {
  const progress = new Map()
  const ids = Array.from(new Set((Array.isArray(tournamentIds) ? tournamentIds : []).map(value => cleanText(value, 128)).filter(Boolean)))
  for (let offset = 0; offset < ids.length; offset += 40) {
    const batch = ids.slice(offset, offset + 40)
    try {
      for (let skip = 0; skip < 2000; skip += 200) {
        const result = await db.collection('matches')
          .where({ tournamentId: db.command.in(batch) })
          .field({ tournamentId: true, status: true })
          .skip(skip)
          .limit(200)
          .get()
        const rows = result.data || []
        rows.forEach(row => {
          const tournamentId = cleanText(row.tournamentId, 128)
          if (!tournamentId) return
          const item = progress.get(tournamentId) || { total: 0, finished: 0 }
          item.total += 1
          if (MATCH_FINISHED_STATUSES.includes(cleanText(row.status, 40).toLowerCase())) item.finished += 1
          progress.set(tournamentId, item)
        })
        if (rows.length < 200) break
      }
    } catch (error) {
      console.warn('[manageTournamentCenterContent] 比赛进度读取失败:', error && error.message)
    }
  }
  return progress
}

// 登记资料来自主办方三步问答（organizations.customerProfile），只用于经营分析，不参与权限判断。
function organizerProfile(organization) {
  const profile = organization && organization.customerProfile
  if (!profile || typeof profile !== 'object') return null
  const identity = ORG_IDENTITIES.includes(profile.identity) ? profile.identity : ''
  const annualEventVolume = ORG_VOLUMES.includes(profile.annualEventVolume) ? profile.annualEventVolume : ''
  const primaryAudience = ORG_AUDIENCES.includes(profile.primaryAudience) ? profile.primaryAudience : ''
  if (!identity && !annualEventVolume && !primaryAudience) return null
  return {
    identity,
    identityLabel: ORG_IDENTITY_LABELS[identity] || '机构类型待补充',
    annualEventVolume,
    annualEventVolumeLabel: ORG_VOLUME_LABELS[annualEventVolume] || '办赛量待补充',
    primaryAudienceLabel: ORG_AUDIENCE_LABELS[primaryAudience] || ''
  }
}

// 意向分层只依据已产生的注册/办赛事实，不推断未采集的值。
// A：已有赛事且有球队实际报名；B：已建赛事/球队或已填办赛需求；C：仅注册；D：测试或无法联系。
function organizerIntent(target) {
  const registeredTournamentCount = Number(target.registeredTournamentCount || 0)
  const tournamentCount = Number(target.tournamentCount || 0)
  const teamCount = Number(target.teamCount || 0)
  if (TEST_ORGANIZER_NAME.test(String(target.name || ''))) {
    return { level: 'D', label: '疑似无效', reason: '名称含测试/演示标记', rank: 0 }
  }
  if (registeredTournamentCount > 0) {
    return { level: 'A', label: '已有报名球队', reason: `${registeredTournamentCount} 场赛事已有报名球队`, rank: 300 + Math.min(registeredTournamentCount, 99) }
  }
  if (tournamentCount > 0) {
    return { level: 'B', label: '有明确需求', reason: `已建 ${tournamentCount} 场赛事，尚无球队报名`, rank: 200 }
  }
  if (teamCount > 0) {
    return { level: 'B', label: '有明确需求', reason: `已建 ${teamCount} 支球队，尚未创建赛事`, rank: 190 }
  }
  if (target.hasProfile) {
    return { level: 'B', label: '有明确需求', reason: '已填写办赛需求，尚未创建赛事', rank: 180 }
  }
  if (!target.phone) {
    return { level: 'D', label: '疑似无效', reason: '缺少可联系手机号', rank: 10 }
  }
  return { level: 'C', label: '仅注册了解', reason: '仅注册，无机构资料与业务动作', rank: 100 }
}

async function getOverview(db) {
  const [bannerRows, tournamentRows, userRows, organizationRows, teamRows, tournamentTeamRows, assistanceRows, followUpRows] = await Promise.all([
    loadAllOptional(db, 'banners', 1000),
    loadAll(db, 'tournaments'),
    loadAll(db, 'users'),
    loadAllOptional(db, 'organizations'),
    loadAllOptional(db, 'teams'),
    loadAllOptional(db, 'tournament_teams'),
    loadAllOptional(db, 'assistance_requests', 1000),
    loadAllOptional(db, 'organizer_follow_ups', 5000)
  ])

  // 平台演示/测试数据不进入运营名录、列表与统计；数据仍保留在库中，不删除。
  const isTestDataName = value => TEST_ORGANIZER_NAME.test(cleanText(value, 200))
  const testOrganizationIds = new Set(organizationRows
    .filter(row => isTestDataName(row.name) || isTestDataName(row.organizationName))
    .map(row => String(row._id)))
  const testUserIds = new Set(userRows
    .filter(row => isTestDataName(row.organizationName) || isTestDataName(row.organizerName) || isTestDataName(row.nickname) || isTestDataName(row.name) || testOrganizationIds.has(recordOrgId(row)))
    .map(row => String(row._id)))
  const isTestOwned = record => testOrganizationIds.has(recordOrgId(record)) || testUserIds.has(recordCreatorId(record))
  const visibleTournamentRows = tournamentRows.filter(row => !isTestOwned(row))
  const visibleTeamRows = teamRows.filter(row => !isTestOwned(row))
  // 主办方只认实际建过赛事的账号：仅在小程序建球队的球队用户不进入主办方名录与统计。
  const tournamentOwnerUserIds = new Set(visibleTournamentRows.map(row => recordCreatorId(row)).filter(Boolean))
  const tournamentOwnerOrgIds = new Set(visibleTournamentRows.map(row => recordOrgId(row)).filter(Boolean))

  // 旧版 Word 导入把限时 URL 写进 logo/logoUrl，同时保留了永久 cloud 文件 ID。
  // 每次读取时从永久 ID 换取新地址，避免 URL 到期后在长期球队列表显示破图。
  const logoFileIdOf = team => [
    team.logoFileID, team.logoFileId, team.logoCloudFileId,
    team.logoTransparentFileId, team.logo, team.logoUrl
  ].map(value => String(value || '').trim()).find(value => value.startsWith('cloud://')) || ''
  const logoFileIds = [...new Set(visibleTeamRows.map(logoFileIdOf).filter(Boolean))]
  const logoUrls = new Map()
  for (let offset = 0; offset < logoFileIds.length; offset += 50) {
    try {
      const result = await cloud.getTempFileURL({ fileList: logoFileIds.slice(offset, offset + 50) })
      ;(result.fileList || []).forEach(item => {
        const fileId = String(item.fileID || item.fileId || '').trim()
        const url = String(item.tempFileURL || item.tempFileUrl || '').trim()
        if (fileId && /^https?:\/\//i.test(url)) logoUrls.set(fileId, url)
      })
    } catch (error) {
      console.warn('[manageTournamentCenterContent] 球队队徽地址刷新失败:', error && error.message)
    }
  }

  const usersById = new Map(userRows.map(item => [String(item._id), item]))
  const organizationsById = new Map(organizationRows.map(item => [String(item._id), item]))
  const followUpByOrganizer = new Map(followUpRows.map(item => [String(item.organizerId || ''), item]))
  const usersPerOrg = new Map()
  userRows.forEach(item => {
    const orgId = recordOrgId(item)
    if (!orgId) return
    usersPerOrg.set(orgId, (usersPerOrg.get(orgId) || 0) + 1)
  })
  const tournamentTeamCounts = new Map()
  tournamentTeamRows.forEach(item => {
    const tournamentId = cleanText(item.tournamentId, 128)
    if (!tournamentId) return
    const status = cleanText(item.status, 40) || 'approved'
    if (['rejected', 'withdrawn', 'cancelled', 'deleted'].includes(status)) return
    tournamentTeamCounts.set(tournamentId, (tournamentTeamCounts.get(tournamentId) || 0) + 1)
  })

  const banners = bannerRows
    .map(safeBanner)
    .sort((a, b) => a.sort - b.sort)
  const tournaments = visibleTournamentRows
    .map(item => safeTournament(item, { usersById, organizationsById, tournamentTeamCounts }))
    .sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime))

  const activeTournamentIds = tournaments
    .filter(item => STAGE_ACTIVE_STATUSES.includes(String(item.status || '').toLowerCase()))
    .map(item => String(item._id))
  const matchProgress = await loadTournamentMatchProgress(db, activeTournamentIds)
  const effectiveTournamentStatus = new Map()
  tournaments.forEach(item => {
    const id = String(item._id)
    const status = String(item.status || '').toLowerCase()
    const progress = matchProgress.get(id)
    const allMatchesFinished = Boolean(progress && progress.total > 0 && progress.finished === progress.total)
    effectiveTournamentStatus.set(id, allMatchesFinished && !STAGE_FINISHED_STATUSES.includes(status) ? 'ended' : status)
  })

  const organizerMap = new Map()
  function ensureOrganizer(record = {}, fallback = {}) {
    const orgId = recordOrgId(record) || cleanText(fallback.orgId, 128)
    const userId = recordCreatorId(record) || cleanText(fallback.userId, 128)
    const user = usersById.get(userId) || fallback.user || {}
    const organization = organizationsById.get(orgId) || fallback.organization || {}
    const key = orgId ? `org:${orgId}` : (userId ? `user:${userId}` : '')
    if (!key) return null
    if (!organizerMap.has(key)) {
      const phone = normalizePhone(firstText(user, ['phone', 'phoneNumber']) || firstText(organization, ['contactPhone', 'phone', 'phoneNumber']))
      organizerMap.set(key, {
        _id: key,
        userId,
        orgId,
        name: firstText(organization, ['name', 'organizationName']) || firstText(user, ['organizationName', 'organizerName']) || firstText(record, ['organizerName', 'organizer', 'organizationName']) || firstText(user, ['nickname', 'name']) || '未命名主办方',
        contact: firstText(organization, ['contactName', 'managerName']) || firstText(user, ['contactName', 'nickname', 'name']) || '未填写',
        phone,
        phoneMasked: maskPhone(phone),
        email: firstText(user, ['email']) || firstText(organization, ['email', 'contactEmail']),
        latestNotice: user.lastPlatformNotice && typeof user.lastPlatformNotice === 'object'
          ? user.lastPlatformNotice
          : null,
        isActive: user.status !== 'disabled' && user.isActive !== false,
        createTime: user.createTime || user.createdAt || organization.createTime || organization.createdAt || null,
        lastLoginTime: user.lastLoginTime || user.lastLoginAt || null,
        tournamentIds: [],
        teamIds: [],
        supportCount: 0,
        activeSupportCount: 0
      })
    }
    return organizerMap.get(key)
  }

  userRows.filter(user => !testUserIds.has(String(user._id)) && (user.role === 'organizer' || recordOrgId(user))).forEach(user => {
    ensureOrganizer(user, { user, userId: String(user._id) })
  })
  visibleTournamentRows.forEach(tournament => {
    const organizer = ensureOrganizer(tournament)
    if (organizer && !organizer.tournamentIds.includes(String(tournament._id))) organizer.tournamentIds.push(String(tournament._id))
  })
  visibleTeamRows.forEach(team => {
    const organizer = ensureOrganizer(team)
    if (organizer && !organizer.teamIds.includes(String(team._id))) organizer.teamIds.push(String(team._id))
  })
  assistanceRows.forEach(request => {
    const targetUserId = cleanText(request.targetUserId, 128)
    if (!targetUserId || testUserIds.has(targetUserId)) return
    const targetUser = usersById.get(targetUserId)
    const organizer = ensureOrganizer(targetUser || {}, { user: targetUser || {}, userId: targetUserId })
    if (!organizer) return
    organizer.supportCount += 1
    if (['pending', 'active'].includes(request.status)) organizer.activeSupportCount += 1
  })

  const organizers = Array.from(organizerMap.values()).map(item => {
    const organizerTournaments = tournaments.filter(tournament => item.tournamentIds.includes(String(tournament._id)))
    const profile = organizerProfile(organizationsById.get(item.orgId))
    const registeredTournamentCount = organizerTournaments
      .filter(tournament => (tournamentTeamCounts.get(String(tournament._id)) || 0) > 0).length
    const tournamentCount = item.tournamentIds.length
    const teamCount = item.teamIds.length
    const intent = organizerIntent({
      name: item.name, phone: item.phone, hasProfile: Boolean(profile),
      tournamentCount, teamCount, registeredTournamentCount
    })
    const targetUser = usersById.get(item.userId) || null
    const followUp = followUpByOrganizer.get(item._id) || null
    const usageStage = organizerUsageStage(organizerTournaments.map(tournament => effectiveTournamentStatus.get(String(tournament._id)) || tournament.status))
    const stageOverride = followUp ? cleanText(followUp.stageOverride, 40) : ''
    const finalStage = ORGANIZER_STAGE_STATUSES[stageOverride] ? stageOverride : usageStage.stage
    const archived = Boolean(targetUser && targetUser.organizerArchived === true)
    const canManageAccount = Boolean(targetUser) && targetUser.isPlatformOwner !== true
    const deletable = canManageAccount && tournamentCount === 0 && teamCount === 0 && item.supportCount === 0 &&
      (!item.orgId || (usersPerOrg.get(item.orgId) || 0) <= 1)
    return {
      ...item,
      accountProfiles: userRows.filter(user => String(user._id) === item.userId || (item.orgId && recordOrgId(user) === item.orgId)).map(customerProfiles.accountSummary),
      tournamentCount,
      teamCount,
      registeredTournamentCount,
      orgProfile: profile,
      intentLevel: intent.level,
      intentLabel: intent.label,
      intentReason: intent.reason,
      intentRank: intent.rank,
      latestTournament: organizerTournaments[0] || null,
      hasContact: Boolean(item.phone || item.email),
      followUpStatus: followUp ? cleanText(followUp.status, 40) : '',
      followUpStatusLabel: (followUp && ORGANIZER_FOLLOW_UP_STATUSES[cleanText(followUp.status, 40)]) || '未跟进',
      followUpNote: followUp ? cleanText(followUp.note, 500) : '',
      followUpUpdatedAt: followUp ? followUp.updateTime : null,
      usageStage: finalStage,
      usageStageLabel: ORGANIZER_STAGE_STATUSES[finalStage] || usageStage.label,
      usageStageAuto: usageStage.stage,
      usageStageAutoLabel: usageStage.label,
      usageStageIsManual: Boolean(ORGANIZER_STAGE_STATUSES[stageOverride]),
      archived,
      deletable
    }
  }).filter(item => item.tournamentIds.length > 0 && !isTestDataName(item.name) && !testUserIds.has(String(item.userId)) && !testOrganizationIds.has(item.orgId)).sort((a, b) => {
    const latestA = toTimestamp(a.latestTournament && a.latestTournament.createTime) || toTimestamp(a.createTime)
    const latestB = toTimestamp(b.latestTournament && b.latestTournament.createTime) || toTimestamp(b.createTime)
    return latestB - latestA
  })

  const accounts = userRows
    .filter(item => !testUserIds.has(String(item._id)) &&
      (tournamentOwnerUserIds.has(String(item._id)) || tournamentOwnerOrgIds.has(recordOrgId(item))) &&
      String(item.role || '').toLowerCase() === 'organizer' && String(item.pcAccountStatus || '').toLowerCase() !== 'cancelled')
    .map(item => safeOrganizerAccount(item, visibleTournamentRows, visibleTeamRows))
    .sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime))

  const teams = visibleTeamRows.map(team => {
    const logoFileId = logoFileIdOf(team)
    const fallbackLogo = [team.logo, team.logoUrl, team.logoTransparentUrl]
      .map(value => String(value || '').trim())
      .find(value => /^https?:\/\//i.test(value)) || ''
    const orgId = recordOrgId(team)
    const creatorId = recordCreatorId(team)
    const organization = organizationsById.get(orgId)
    const creator = usersById.get(creatorId)
    const tournamentCount = new Set(tournamentTeamRows
      .filter(relation => String(relation.teamId || '') === String(team._id))
      .map(relation => String(relation.tournamentId || ''))
      .filter(Boolean)).size
    return {
      _id: team._id, ...platformArchive.archiveFields(team),
      name: team.name || team.teamName || '未命名球队',
      logo: logoFileId ? (logoUrls.get(logoFileId) || '') : fallbackLogo,
      logoUnavailable: Boolean(logoFileId && !logoUrls.has(logoFileId)),
      city: team.city || team.cityName || team.region || '',
      contact: team.contactName || team.managerName || '',
      phone: normalizePhone(team.contactPhone || team.managerPhone || team.ownerPhone),
      orgId,
      organizerUserId: creatorId,
      organizerName: (organization && (organization.name || organization.organizationName)) ||
        (creator && (creator.organizationName || creator.nickname || creator.name)) || '',
      creatorName: (creator && (creator.contactName || creator.nickname || creator.name)) || '',
      playerCount: Number(team.playerCount || 0),
      tournamentCount,
      createTime: team.createTime || team.createdAt || null
    }
  }).sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime))

  const supportRequests = assistanceRows
    .filter(request => (request.helperUserId || request.targetUserId) &&
      !testUserIds.has(cleanText(request.targetUserId, 128)) && !testUserIds.has(cleanText(request.helperUserId, 128)))
    .map(request => ({
    _id: request._id,
    status: request.status || 'pending',
    targetUserId: request.targetUserId || '',
    targetName: request.targetName || '',
    targetPhoneMasked: request.targetPhoneMasked || '',
    reason: request.reason || '',
    createTime: request.createTime || null,
    grantExpiresAt: request.grantExpiresAt || null
  })).sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime)).slice(0, 50)

  return {
    success: true,
    data: {
      banners,
      tournaments,
      organizers,
      accounts,
      teams,
      supportRequests,
      stats: {
        totalTournaments: visibleTournamentRows.length,
        featuredTournaments: tournaments.filter(item => item.isFeatured).length,
        totalOrganizers: organizers.length,
        totalTeams: visibleTeamRows.length,
        bannerCount: bannerRows.length,
        activeSupportCount: supportRequests.filter(item => ['pending', 'active'].includes(item.status)).length,
        missingContactCount: organizers.filter(item => !item.hasContact).length,
        leadCount: organizers.filter(item => ['A', 'B'].includes(item.intentLevel)).length
      }
    }
  }
}

async function sendOrganizerNotice(db, event, actor) {
  const recipientUserId = cleanText(event.recipientUserId, 128)
  const title = cleanText(event.title, 80)
  const body = String(event.body || '').trim().slice(0, 2000)
  if (!recipientUserId) return { success: false, error: '请选择接收主办方' }
  if (!title || !body) return { success: false, error: '请填写通知标题和内容' }

  let recipient
  try {
    const found = await db.collection('users').doc(recipientUserId).get()
    recipient = firstRecord(found.data)
  } catch (error) {
    recipient = null
  }
  if (!recipient || recipient.status === 'disabled' || recipient.pcAccountStatus === 'cancelled') {
    return { success: false, error: '主办方账号不存在或已停用' }
  }
  const role = cleanText(recipient.role, 40).toLowerCase()
  if (role !== 'organizer' && !recordOrgId(recipient)) {
    return { success: false, error: '接收账号不是有效主办方账号' }
  }

  const linkPath = '/tournament-space?openContactInfo=profile'
  const noticeId = crypto.randomBytes(16).toString('hex')
  const now = db.serverDate()
  const latestNotice = { messageId: noticeId, title, readAt: null, createTime: now, linkPath }
  await db.collection('platform_inbox_messages').doc(noticeId).set({
    data: {
      recipientUserId,
      recipientOrgId: recordOrgId(recipient),
      title,
      body,
      linkPath,
      linkLabel: '完善联系方式',
      readAt: null,
      createdBy: String(actor && actor._id || 'platform-owner'),
      createTime: now
    }
  })
  try {
    await db.collection('users').doc(recipientUserId).update({
      data: { lastPlatformNotice: latestNotice, updateTime: now }
    })
  } catch (error) {
    console.warn('[manageTournamentCenterContent] 最近站内信状态回写失败:', error && error.message)
  }
  return { success: true, message: '站内信已发送', data: { messageId: noticeId, recipientUserId, linkPath, readAt: null } }
}

function userReferenceConditions(user, idFields, phoneFields = []) {
  const conditions = []
  const userId = cleanText(user && user._id, 128)
  const phone = normalizePhone(user && (user.phone || user.phoneNumber))
  idFields.forEach(field => {
    if (userId) conditions.push({ [field]: userId })
  })
  phoneFields.forEach(field => {
    if (phone) conditions.push({ [field]: phone })
  })
  return conditions
}

async function countUserReferences(db, collectionName, user, idFields, phoneFields = []) {
  const conditions = userReferenceConditions(user, idFields, phoneFields)
  if (!conditions.length) return 0
  try {
    if (collectionName === 'assistance_requests') {
      const rows = await loadAll(db, collectionName, 1000)
      const userId = cleanText(user && user._id, 128)
      return rows.filter(item => cleanText(item.targetUserId, 128) === userId).length
    }
    const where = conditions.length === 1 ? conditions[0] : db.command.or(conditions)
    const result = await db.collection(collectionName).where(where).limit(100).get()
    return (result.data || []).length
  } catch (error) {
    throw new Error('无法核对账号关联数据：' + collectionName + '，已停止删除')
  }
}

async function accountDeletionInspection(db, user) {
  const specs = [
    ['organizations', '机构', ['ownerId', 'creatorId', 'createdBy'], ['contactPhone', 'phone', 'phoneNumber']],
    ['organization_memberships', '机构成员关系', ['userId', 'memberUserId', 'ownerId'], ['phone', 'phoneNumber']],
    ['tournaments', '创建的赛事', ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'], ['creatorPhone', 'organizerPhone', 'ownerPhone']],
    ['teams', '创建或负责的球队', ['creatorId', 'ownerId', 'ownerUserId', 'userId', 'createdBy'], ['ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone']],
    ['team_memberships', '球队成员关系', ['userId', 'memberUserId', 'ownerId'], ['phone', 'phoneNumber']],
    ['players', '球员资料', ['creatorId', 'userId', 'createdBy'], ['creatorPhone']],
    ['tournament_teams', '赛事报名与认领关系', ['creatorId', 'applicantUserId', 'claimedByUserId', 'userId', 'ownerId'], ['applicantPhone']]
  ]
  const counts = await Promise.all(specs.map(item => countUserReferences(db, item[0], user, item[2], item[3])))
  const references = specs.map((item, index) => ({ key: item[0], label: item[1], count: counts[index] })).filter(item => item.count > 0)
  const dependencies = references.filter(item => item.key === 'tournaments')
  return {
    canDelete: dependencies.length === 0,
    dependencies,
    preservedData: references.filter(item => item.key !== 'tournaments')
  }
}
async function loadOrganizerAccount(db, event) {
  const userId = cleanText(event.userId || event.id, 128)
  if (!userId || userId === 'platform-owner') throw new Error('缺少有效的主办方账号ID')
  const result = await db.collection('users').doc(userId).get()
  const user = firstRecord(result.data)
  if (!user) throw new Error('主办方账号不存在或已删除')
  if (user.isPlatformOwner === true) throw new Error('平台负责人账号不能在此删除')
  if (String(user.role || '').toLowerCase() !== 'organizer') throw new Error('该账号不是主办方账号')
  if (String(user.pcAccountStatus || '').toLowerCase() === 'cancelled') throw new Error('PC账号已注销')
  return user
}

async function inspectOrganizerAccountDeletion(db, event) {
  const user = await loadOrganizerAccount(db, event)
  const inspection = await accountDeletionInspection(db, user)
  return {
    success: true,
    account: safeOrganizerAccount(user, [], []),
    ...inspection
  }
}

async function deleteOrganizerAccount(db, event, actor) {
  if (cleanText(event.confirmText, 10) !== '注销PC') throw new Error('请输入“注销PC”完成二次确认')
  const user = await loadOrganizerAccount(db, event)
  const inspection = await accountDeletionInspection(db, user)
  if (!inspection.canDelete) throw new Error('该账号仍有创建的赛事，请先处理赛事后再注销PC账号')

  const auditResult = await db.collection('account_identity_audit_logs').add({ data: {
    action: 'organizer_pc_account_unlink', result: 'pending', actorType: 'platform_owner', actorId: actor._id,
    targetUserId: user._id,
    phoneHash: normalizePhone(user.phone || user.phoneNumber) ? crypto.createHash('sha256').update(normalizePhone(user.phone || user.phoneNumber)).digest('hex') : '',
    preservedData: inspection.preservedData,
    createTime: db.serverDate()
  } })

  try {
    const [sessionResult, bindingResult, gateResult] = await Promise.all([
      db.collection('auth_sessions').where({ userId: user._id }).limit(100).get(),
      db.collection('service_account_bindings').where({ userId: user._id }).limit(100).get(),
      db.collection('service_follow_gates').where({ purpose: 'organizer_pc_bind', userId: user._id }).limit(100).get()
    ])
    const sessions = sessionResult.data || []
    for (const session of sessions) await db.collection('auth_sessions').doc(session._id).remove()
    for (const binding of bindingResult.data || []) {
      await db.collection('service_account_bindings').doc(binding._id).update({ data: { organizerPcBound: false, pcUnboundAt: db.serverDate(), updateTime: db.serverDate() } })
    }
    for (const gate of gateResult.data || []) {
      await db.collection('service_follow_gates').doc(gate._id).update({ data: { subscribed: false, status: 'pc_unbound', updateTime: db.serverDate() } })
    }
    await db.collection('users').doc(user._id).update({ data: {
      wechatOpenId: '', pcAccountStatus: 'cancelled', pcLoginEnabled: false, pcServiceRebindRequired: true,
      pcAccountCancelledAt: db.serverDate(), pcAccountCancelledBy: actor._id, lastPcLogoutAt: db.serverDate(), updateTime: db.serverDate()
    } })
    await db.collection('account_identity_audit_logs').doc(auditResult._id).update({ data: {
      result: 'success', removedSessionCount: sessions.length, preservedMiniProgramAccount: true, completedAt: db.serverDate()
    } })
    return { success: true, userId: user._id, removedSessionCount: sessions.length, preservedMiniProgramAccount: true }
  } catch (error) {
    await db.collection('account_identity_audit_logs').doc(auditResult._id).update({ data: { result: 'failed', errorCode: 'PC_ACCOUNT_UNLINK_FAILED', completedAt: db.serverDate() } }).catch(() => {})
    throw error
  }
}
async function saveOrganizerFollowUp(db, event, actor) {
  const organizerId = cleanText(event.organizerId, 160)
  if (!organizerId || !/^(org|user):/.test(organizerId)) throw new Error('主办方标识格式不正确')
  const status = cleanText(event.status, 40)
  if (status && !ORGANIZER_FOLLOW_UP_STATUSES[status]) throw new Error('请选择有效的跟进结果')
  const note = cleanText(event.note, 500)
  const data = {
    organizerId,
    status,
    note,
    updatedBy: actor._id,
    updatedByName: cleanText(actor.nickname, 60),
    updateTime: db.serverDate()
  }
  const existing = await db.collection('organizer_follow_ups').where({ organizerId }).limit(1).get()
  const row = firstRecord(existing.data)
  if (row) await db.collection('organizer_follow_ups').doc(row._id).update({ data })
  else await db.collection('organizer_follow_ups').add({ data: { ...data, createTime: db.serverDate() } })
  return { success: true, organizerId, status, statusLabel: ORGANIZER_FOLLOW_UP_STATUSES[status] || '未跟进', note }
}

// 使用阶段默认按赛事数据自动判定，这里只保存人工覆盖；传空值表示恢复自动判定。
async function saveOrganizerStageOverride(db, event, actor) {
  const organizerId = cleanText(event.organizerId, 160)
  if (!organizerId || !/^(org|user):/.test(organizerId)) throw new Error('主办方标识格式不正确')
  const stage = cleanText(event.stage, 40)
  if (stage && !ORGANIZER_STAGE_STATUSES[stage]) throw new Error('请选择有效的使用阶段')
  const existing = await db.collection('organizer_follow_ups').where({ organizerId }).limit(1).get()
  const row = firstRecord(existing.data)
  const data = {
    stageOverride: stage,
    stageOverrideUpdatedBy: actor._id,
    stageOverrideUpdatedByName: cleanText(actor.nickname, 60),
    stageOverrideUpdateTime: db.serverDate()
  }
  if (row) {
    await db.collection('organizer_follow_ups').doc(row._id).update({ data })
  } else {
    await db.collection('organizer_follow_ups').add({ data: {
      organizerId,
      status: '',
      note: '',
      ...data,
      updateTime: db.serverDate(),
      createTime: db.serverDate()
    } })
  }
  return { success: true, organizerId, stage, stageLabel: ORGANIZER_STAGE_STATUSES[stage] || '', manual: Boolean(stage) }
}

// 移出常用名录只影响平台名录展示，账号、权限和业务数据全部保留，可随时恢复。
async function setOrganizerAccountArchived(db, event, actor) {
  const userId = cleanText(event.userId, 128)
  if (!userId) throw new Error('该主办方没有可移出名录的登录账号')
  const user = firstRecord((await db.collection('users').doc(userId).get()).data)
  if (!user) throw new Error('账号不存在或已删除')
  if (user.isPlatformOwner === true) throw new Error('平台负责人账号不能移出常用名录')
  const archived = event.archived === true
  await db.collection('users').doc(userId).update({ data: {
    organizerArchived: archived,
    organizerArchivedAt: archived ? db.serverDate() : null,
    organizerArchivedBy: actor._id,
    updateTime: db.serverDate()
  } })
  await db.collection('account_identity_audit_logs').add({ data: {
    action: archived ? 'organizer_account_archived' : 'organizer_account_restored',
    result: 'success',
    actorType: 'platform_owner',
    actorId: actor._id,
    targetUserId: userId,
    organizerId: cleanText(event.organizerId, 160),
    createTime: db.serverDate()
  } }).catch(() => {})
  return { success: true, userId, archived }
}

// 彻底删除只允许无赛事、无球队、无协助记录的空账号；业务数据存在时一律拦截，避免产生无归属数据。
async function purgeOrganizerAccount(db, event, actor) {
  const _ = db.command
  const userId = cleanText(event.userId, 128)
  if (!userId) throw new Error('该主办方没有可删除的登录账号')
  const user = firstRecord((await db.collection('users').doc(userId).get()).data)
  if (!user) throw new Error('账号不存在或已删除')
  if (user.isPlatformOwner === true) throw new Error('平台负责人账号不能删除')
  if (String(user.role || '').toLowerCase() !== 'organizer' && !recordOrgId(user)) throw new Error('该账号不是主办方账号')
  const phone = normalizePhone(user.phone || user.phoneNumber)
  if (!phone) throw new Error('该账号缺少手机号，请先核实身份')
  if (cleanText(event.confirmText, 40) !== phone) throw new Error('请输入该账号手机号完成二次确认')

  const orgId = recordOrgId(user)
  let organization = null
  if (orgId) {
    organization = firstRecord((await db.collection('organizations').doc(orgId).get()).data)
    const ownerIds = ['creatorId', 'ownerId', 'createdBy'].map(key => String((organization && organization[key]) || '')).filter(Boolean)
    if (organization && !ownerIds.includes(userId)) throw new Error('该机构不属于当前账号，不能删除')
    const orgUsers = await db.collection('users').where(_.or([{ orgId }, { organizationId: orgId }])).limit(100).get()
    if ((orgUsers.data || []).filter(row => String(row._id) !== userId).length) throw new Error('该机构下还有其他账号，请先在账号页处理')
    const orgTournaments = await db.collection('tournaments').where(_.or([{ orgId }, { organizationId: orgId }])).limit(1).get()
    if ((orgTournaments.data || []).length) throw new Error('该机构名下仍有赛事，不能彻底删除')
    const orgTeams = await db.collection('teams').where(_.or([{ orgId }, { organizationId: orgId }])).limit(1).get()
    if ((orgTeams.data || []).length) throw new Error('该机构名下仍有球队，不能彻底删除')
  }

  const inspection = await accountDeletionInspection(db, user)
  const ownOrganization = Boolean(orgId && organization && ['creatorId', 'ownerId', 'createdBy'].some(key => String(organization[key] || '') === userId))
  const blocking = [...inspection.dependencies, ...inspection.preservedData]
    .filter(item => item.count > 0 && !(item.key === 'organizations' && ownOrganization))
  if (blocking.length) {
    throw new Error(`该账号仍有关联${blocking.map(item => ` ${item.label} ${item.count} 条`).join('、')}，不能彻底删除`)
  }
  const supports = await db.collection('assistance_requests').where({ targetUserId: userId }).limit(1).get()
  if ((supports.data || []).length) throw new Error('该账号仍有协助记录，不能彻底删除')

  const organizerId = cleanText(event.organizerId, 160)
  const audit = await db.collection('account_identity_audit_logs').add({ data: {
    action: 'organizer_account_purged',
    result: 'pending',
    actorType: 'platform_owner',
    actorId: actor._id,
    targetUserId: userId,
    organizerId,
    phoneHash: crypto.createHash('sha256').update(phone).digest('hex'),
    snapshot: {
      name: cleanText(user.name || user.nickname, 60),
      phoneMasked: maskPhone(phone),
      orgId,
      createTime: user.createTime || user.createdAt || null
    },
    createTime: db.serverDate()
  } })
  try {
    const [sessionResult, bindingResult, gateResult, followUpResult] = await Promise.all([
      db.collection('auth_sessions').where({ userId }).limit(100).get(),
      db.collection('service_account_bindings').where({ userId }).limit(100).get(),
      db.collection('service_follow_gates').where({ userId }).limit(100).get(),
      db.collection('organizer_follow_ups').where({ organizerId }).limit(10).get()
    ])
    for (const row of sessionResult.data || []) await db.collection('auth_sessions').doc(row._id).remove()
    for (const row of bindingResult.data || []) await db.collection('service_account_bindings').doc(row._id).remove()
    for (const row of gateResult.data || []) await db.collection('service_follow_gates').doc(row._id).remove()
    for (const row of followUpResult.data || []) await db.collection('organizer_follow_ups').doc(row._id).remove()
    await db.collection('users').doc(userId).remove()
    if (orgId && organization) await db.collection('organizations').doc(orgId).remove()
    await db.collection('account_identity_audit_logs').doc(audit._id).update({ data: { result: 'success', completedAt: db.serverDate() } })
    return { success: true, userId, orgId, removedOrganization: Boolean(orgId && organization) }
  } catch (error) {
    await db.collection('account_identity_audit_logs').doc(audit._id).update({ data: { result: 'failed', completedAt: db.serverDate() } }).catch(() => {})
    throw error
  }
}

function validateBannerImage(imageUrl) {
  if (!imageUrl) throw new Error('请上传轮播图片')
  if (
    !imageUrl.startsWith('cloud://') &&
    !imageUrl.startsWith('https://') &&
    !imageUrl.startsWith('http://')
  ) {
    throw new Error('轮播图片地址格式不正确')
  }
}

function validateBannerLink(link) {
  if (!link) return
  if (
    !link.startsWith('/') &&
    !link.startsWith('#/') &&
    !link.startsWith('https://') &&
    !link.startsWith('http://')
  ) {
    throw new Error('轮播链接必须是站内路径或 HTTP(S) 地址')
  }
}

async function saveBanner(db, event, user) {
  const bannerId = cleanText(event.bannerId || event.id || event._id, 128)
  const imageUrl = cleanText(event.imageUrl || event.image, 1000)
  const link = cleanText(event.link, 500)
  validateBannerImage(imageUrl)
  validateBannerLink(link)

  const data = {
    title: cleanText(event.title, 80),
    imageUrl,
    image: imageUrl,
    link,
    sort: Math.max(0, Math.min(999, Number(event.sort) || 0)),
    isActive: event.isActive !== false,
    status: event.isActive === false ? 'inactive' : 'active',
    storageType: cleanText(event.storageType, 20),
    updatedBy: user._id,
    updateTime: db.serverDate(),
    updatedAt: db.serverDate()
  }

  if (bannerId) {
    await db.collection('banners').doc(bannerId).update({ data })
    return { success: true, bannerId }
  }

  data.createdBy = user._id
  data.createTime = db.serverDate()
  data.createdAt = db.serverDate()
  const result = await db.collection('banners').add({ data })
  return { success: true, bannerId: result._id }
}

async function deleteBanner(db, event) {
  const bannerId = cleanText(event.bannerId || event.id || event._id, 128)
  if (!bannerId) throw new Error('缺少轮播图 ID')
  await db.collection('banners').doc(bannerId).remove()
  return { success: true }
}

async function setFeatured(db, event, user) {
  const tournamentId = cleanText(event.tournamentId || event.id || event._id, 128)
  if (!tournamentId) throw new Error('缺少赛事 ID')
  const enabled = event.enabled === true
  await db.collection('tournaments').doc(tournamentId).update({
    data: {
      isFeatured: enabled,
      featured: enabled,
      featuredSort: Math.max(0, Math.min(999, Number(event.sort) || 0)),
      featuredUpdatedBy: user._id,
      featuredUpdatedAt: db.serverDate()
    }
  })
  return { success: true }
}

function publicHttpsImage(value) {
  const image = cleanText(value, 1000)
  return image.startsWith('https://') ? image : ''
}

function publicMatchTimestamp(match) {
  const direct = toTimestamp(match && match.matchTime)
  if (direct) return direct
  const parsed = Date.parse([
    match && (match.matchDate || match.date),
    match && (match.startTime || match.time)
  ].filter(Boolean).join(' '))
  return Number.isFinite(parsed) ? parsed : 0
}

async function ensurePlatformContentAudit(db) {
  try {
    await db.collection('platform_content_audit_logs').limit(1).get()
  } catch (error) {
    try {
      await db.createCollection('platform_content_audit_logs')
    } catch (createError) {
      if (!/exist/i.test(String(createError && createError.message || ''))) throw createError
    }
  }
}

async function ensurePublicationSnapshots(db) {
  try {
    await db.collection('publication_snapshots').limit(1).get()
  } catch (error) {
    try {
      await db.createCollection('publication_snapshots')
    } catch (createError) {
      if (!/exist/i.test(String(createError && createError.message || ''))) throw createError
    }
  }
}

async function publishTournamentCenter(db, event, user) {
  const tournamentId = cleanText(event.tournamentId || event.id || event._id, 128)
  if (!tournamentId) throw new Error('缺少赛事 ID')
  const tournament = firstRecord((await db.collection('tournaments').doc(tournamentId).get()).data)
  if (!tournament) throw new Error('赛事不存在')
  const tournamentStatus = cleanText(tournament.status, 40).toLowerCase()
  if (['draft', 'cancelled'].includes(tournamentStatus)) throw new Error('草稿或已取消赛事不能发布到公共赛事中心')
  await Promise.all([ensurePublicationSnapshots(db), ensurePlatformContentAudit(db)])

  const [allRelations, allMatches, allDivisions, allTeams, oldSnapshots] = await Promise.all([
    loadAllOptional(db, 'tournament_teams', 5000),
    loadAllOptional(db, 'matches', 5000),
    loadAllOptional(db, 'divisions', 1000),
    loadAllOptional(db, 'teams', 5000),
    loadAllOptional(db, 'publication_snapshots', 2000)
  ])
  const relations = allRelations.filter(item => cleanText(item.tournamentId, 128) === tournamentId)
  const matches = allMatches.filter(item => {
    if (cleanText(item.tournamentId, 128) !== tournamentId) return false
    const status = cleanText(item.status, 40).toLowerCase()
    return item.schedulePublished === true || item.published === true || ['ongoing', 'completed', 'finished', 'ended'].includes(status)
  })
  const divisionMap = new Map(allDivisions.filter(item => cleanText(item.tournamentId, 128) === tournamentId).map(item => [String(item._id), item]))
  const teamMap = new Map()
  relations.forEach(item => {
    ;[item._id, item.teamId].filter(Boolean).forEach(id => teamMap.set(String(id), item))
  })
  allTeams.forEach(item => {
    const id = String(item._id || '')
    if (id && teamMap.has(id)) teamMap.set(id, { ...teamMap.get(id), ...item })
  })
  const approvedTeams = relations.filter(item => ['approved', 'confirmed', 'active'].includes(cleanText(item.status, 40).toLowerCase()))
  const tournamentPayload = {
    id: tournamentId,
    name: firstText(tournament, ['name', 'tournamentName']) || '未命名赛事',
    status: tournamentStatus || 'published',
    startDate: firstText(tournament, ['startDate', 'beginDate']).slice(0, 30),
    endDate: firstText(tournament, ['endDate', 'finishDate']).slice(0, 30),
    city: firstText(tournament, ['city', 'cityName', 'location']).slice(0, 80),
    venue: firstText(tournament, ['venue', 'field', 'address']).slice(0, 100),
    category: firstText(tournament, ['category', 'type']).slice(0, 40),
    formatType: firstText(tournament, ['formatType', 'tournamentType']).slice(0, 40),
    logo: publicHttpsImage(firstText(tournament, ['logoTransparentUrl', 'logoUrl', 'logo'])),
    cover: publicHttpsImage(firstText(tournament, ['coverImage', 'cover', 'bannerImage', 'poster'])),
    featuredSort: Math.max(0, Math.min(999, Number(event.sort == null ? tournament.featuredSort : event.sort) || 0)),
    teamCount: approvedTeams.length,
    matchCount: matches.length,
    completedMatchCount: matches.filter(item => ['completed', 'finished', 'ended'].includes(cleanText(item.status, 40).toLowerCase())).length
  }
  const matchPayload = matches.map(item => {
    const home = teamMap.get(String(item.homeTeamId || '')) || {}
    const away = teamMap.get(String(item.awayTeamId || '')) || {}
    const division = divisionMap.get(String(item.divisionId || '')) || {}
    const status = cleanText(item.status, 40).toLowerCase()
    return {
      id: String(item._id || ''),
      tournamentId,
      tournamentName: tournamentPayload.name,
      divisionName: (firstText(item, ['divisionName']) || firstText(division, ['name', 'divisionName'])).slice(0, 60),
      round: firstText(item, ['roundName', 'round', 'stageName', 'phase']).slice(0, 60),
      status: status === 'ongoing' ? 'ongoing' : (['completed', 'finished', 'ended'].includes(status) ? 'finished' : 'upcoming'),
      matchDate: firstText(item, ['matchDate', 'date']).slice(0, 30),
      matchTime: firstText(item, ['startTime', 'time', 'matchTime']).slice(0, 40),
      timestamp: publicMatchTimestamp(item),
      venue: firstText(item, ['venue', 'field', 'location']).slice(0, 100),
      homeName: (firstText(item, ['homeTeamName']) || firstText(home, ['teamName', 'name']) || '主队待定').slice(0, 80),
      awayName: (firstText(item, ['awayTeamName']) || firstText(away, ['teamName', 'name']) || '客队待定').slice(0, 80),
      homeLogo: publicHttpsImage(firstText(home, ['logoTransparentUrl', 'logoUrl', 'logo'])),
      awayLogo: publicHttpsImage(firstText(away, ['logoTransparentUrl', 'logoUrl', 'logo'])),
      homeScore: Number.isFinite(Number(item.homeScore)) ? Number(item.homeScore) : null,
      awayScore: Number.isFinite(Number(item.awayScore)) ? Number(item.awayScore) : null
    }
  }).sort((left, right) => left.timestamp - right.timestamp)
  const versions = oldSnapshots.filter(item => cleanText(item.tournamentId, 128) === tournamentId && item.type === 'tournament_center')
  const version = versions.reduce((max, item) => Math.max(max, Number(item.version || 0)), 0) + 1
  const snapshot = await db.collection('publication_snapshots').add({
    data: {
      sportCode: 'football',
      type: 'tournament_center',
      status: 'published',
      tournamentId,
      orgId: recordOrgId(tournament),
      version,
      payload: { tournament: tournamentPayload, matches: matchPayload },
      publishedBy: user._id,
      publishedByName: cleanText(user.nickname || user.userName || '平台负责人', 80),
      publishedAt: db.serverDate(),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  await db.collection('tournaments').doc(tournamentId).update({
    data: {
      isFeatured: true,
      featured: true,
      featuredSort: tournamentPayload.featuredSort,
      publicStatus: 'published',
      publicSnapshotId: snapshot._id,
      publicVersion: version,
      publicPublishedAt: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  await db.collection('platform_content_audit_logs').add({
    data: {
      action: 'publish_tournament_center',
      actorId: user._id,
      tournamentId,
      snapshotId: snapshot._id,
      version,
      publicFieldSet: ['tournament', 'published_matches', 'public_team_names', 'public_team_logos', 'approved_scores'],
      createTime: db.serverDate()
    }
  })
  return { success: true, snapshotId: snapshot._id, version, tournament: tournamentPayload, matchCount: matchPayload.length }
}

async function revokeTournamentCenter(db, event, user) {
  const tournamentId = cleanText(event.tournamentId || event.id || event._id, 128)
  if (!tournamentId) throw new Error('缺少赛事 ID')
  await Promise.all([ensurePublicationSnapshots(db), ensurePlatformContentAudit(db)])
  const rows = (await db.collection('publication_snapshots').where({ sportCode: 'football', type: 'tournament_center', tournamentId, status: 'published' }).limit(100).get()).data || []
  for (const item of rows) {
    await db.collection('publication_snapshots').doc(item._id).update({
      data: { status: 'revoked', revokedAt: db.serverDate(), revokedBy: user._id, updateTime: db.serverDate() }
    })
  }
  await db.collection('tournaments').doc(tournamentId).update({
    data: { publicStatus: 'revoked', publicSnapshotId: '', publicRevokedAt: db.serverDate(), updateTime: db.serverDate() }
  })
  await db.collection('platform_content_audit_logs').add({
    data: { action: 'revoke_tournament_center', actorId: user._id, tournamentId, revokedSnapshots: rows.length, createTime: db.serverDate() }
  })
  return { success: true, revokedSnapshots: rows.length }
}

// ---------- 服务号「我的」页反馈管理（列表 + 状态流转，仅平台负责人） ----------
const FEEDBACK_STATUSES = ['pending', 'processing', 'done']
const FEEDBACK_TYPE_LABELS = { data_error: '数据问题', binding: '绑定问题', feature: '功能建议', other: '其他' }

function feedbackStatusOf(value) {
  const status = cleanText(value, 20)
  return FEEDBACK_STATUSES.includes(status) ? status : ''
}

function feedbackRow(row) {
  const type = FEEDBACK_TYPE_LABELS[String(row.type || '')] ? String(row.type) : 'other'
  return {
    feedbackId: String(row._id || ''),
    type,
    typeLabel: FEEDBACK_TYPE_LABELS[type],
    content: String(row.content || ''),
    contact: String(row.contact || ''),
    phoneMasked: String(row.phoneMasked || ''),
    userId: String(row.userId || ''),
    source: String(row.source || ''),
    status: feedbackStatusOf(row.status) || 'pending',
    note: String(row.note || ''),
    handledBy: String(row.handledBy || ''),
    serviceAccountOpenId: String(row.serviceAccountOpenId || ''),
    reply: String(row.reply || ''),
    replyAt: row.replyAt || null,
    replyBy: String(row.replyBy || ''),
    createTime: row.createTime || null,
    firstHandledAt: row.firstHandledAt || null,
    handledAt: row.handledAt || null
  }
}

async function listServiceFeedback(db, params) {
  const collection = db.collection('service_feedback')
  const where = {}
  const status = feedbackStatusOf(params.status)
  if (status) where.status = status
  const type = cleanText(params.type, 20)
  if (FEEDBACK_TYPE_LABELS[type]) where.type = type
  const contact = normalizePhone(params.contact)
  if (contact) where.contact = contact
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(50, Math.max(10, Number(params.pageSize) || 20))
  const base = Object.keys(where).length ? collection.where(where) : collection
  const counted = await base.count()
  const total = counted.total || 0
  const listed = await base.orderBy('createTime', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  const counts = { pending: 0, processing: 0, done: 0 }
  await Promise.all(FEEDBACK_STATUSES.map(async item => {
    const result = await collection.where({ status: item }).count()
    counts[item] = result.total || 0
  }))
  counts.all = FEEDBACK_STATUSES.reduce((sum, item) => sum + counts[item], 0)
  return { success: true, rows: (listed.data || []).map(feedbackRow), total, page, pageSize, counts }
}

async function updateServiceFeedback(db, params, user) {
  const feedbackId = cleanText(params.feedbackId, 64)
  const status = feedbackStatusOf(params.status)
  if (!feedbackId) return { success: false, error: '请选择要处理的反馈' }
  if (!status) return { success: false, error: '处理状态不正确' }
  let existing = null
  try { existing = firstRecord((await db.collection('service_feedback').doc(feedbackId).get()).data) } catch (error) { existing = null }
  if (!existing) return { success: false, error: '反馈不存在或已删除' }
  const note = cleanText(params.note, 500)
  const patch = { status, note, handledBy: cleanText(user._id, 64), handledAt: db.serverDate(), updateTime: db.serverDate() }
  if (!existing.firstHandledAt && status !== 'pending') patch.firstHandledAt = db.serverDate()
  await db.collection('service_feedback').doc(feedbackId).update({ data: patch })
  await db.collection('platform_content_audit_logs').add({
    data: { action: 'service_feedback_status', actorId: user._id, feedbackId, fromStatus: String(existing.status || 'pending'), toStatus: status, createTime: db.serverDate() }
  })
  return { success: true, feedbackId, status }
}

// ---------- 服务号模板消息：反馈回复通知 ----------
const SERVICE_ACCOUNT_CONFIG = {
  appId: process.env.SERVICE_ACCOUNT_APP_ID || '',
  appSecret: process.env.SERVICE_ACCOUNT_APP_SECRET || '',
  replyTemplateId: process.env.SERVICE_FEEDBACK_REPLY_TEMPLATE_ID || '',
  bridgeUrl: process.env.SXF_FOOTBALL_WECHAT_BRIDGE_URL || '',
  bridgeSecret: process.env.SXF_FOOTBALL_WECHAT_BRIDGE_SECRET || ''
}

function saHttpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, response => {
      let body = ''
      response.on('data', chunk => { body += chunk })
      response.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve(null) } })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('微信接口超时')))
  })
}

function saHttpsPost(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const target = new URL(url)
    const req = https.request({
      hostname: target.hostname, port: 443, path: target.pathname + target.search, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }
    }, response => {
      let result = ''
      response.on('data', chunk => { result += chunk })
      response.on('end', () => { try { resolve(JSON.parse(result)) } catch { resolve(null) } })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('微信接口超时')))
    req.write(body); req.end()
  })
}

async function saBridgePost(action, payload) {
  const baseUrl = String(SERVICE_ACCOUNT_CONFIG.bridgeUrl || '').replace(/\/+$/, '')
  if (!baseUrl || !SERVICE_ACCOUNT_CONFIG.bridgeSecret) throw new Error('服务号固定出口中转尚未配置')
  const body = JSON.stringify(payload || {})
  const timestamp = Date.now()
  const nonce = crypto.randomBytes(16).toString('hex')
  const signature = crypto.createHmac('sha256', SERVICE_ACCOUNT_CONFIG.bridgeSecret).update(`${timestamp}\n${nonce}\n${body}`).digest('hex')
  const target = new URL(baseUrl + '/' + action)
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: target.hostname, port: 443, path: target.pathname + target.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Sxf-Timestamp': String(timestamp), 'X-Sxf-Nonce': nonce, 'X-Sxf-Signature': signature }
    }, response => {
      let result = ''
      response.on('data', chunk => { result += chunk })
      response.on('end', () => {
        try {
          const parsed = JSON.parse(result)
          if (response.statusCode < 200 || response.statusCode >= 300 || parsed.success !== true) return reject(new Error(parsed.message || '服务号固定出口中转请求失败'))
          resolve(parsed)
        } catch (error) { reject(error) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error('服务号固定出口中转超时')))
    req.write(body); req.end()
  })
}

async function getServiceAccountAccessToken(db) {
  const cached = await db.collection('service_account_tokens').where({
    appId: SERVICE_ACCOUNT_CONFIG.appId,
    expiresAt: db.command.gt(new Date(Date.now() + 2 * 60 * 1000))
  }).limit(1).get()
  if (cached.data && cached.data[0]) return cached.data[0].accessToken
  const url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
    encodeURIComponent(SERVICE_ACCOUNT_CONFIG.appId) + '&secret=' + encodeURIComponent(SERVICE_ACCOUNT_CONFIG.appSecret)
  let result
  if (SERVICE_ACCOUNT_CONFIG.bridgeUrl && SERVICE_ACCOUNT_CONFIG.bridgeSecret) {
    result = (await saBridgePost('token', { grant_type: 'client_credential', appid: SERVICE_ACCOUNT_CONFIG.appId, secret: SERVICE_ACCOUNT_CONFIG.appSecret })).data
  } else {
    result = await saHttpsGet(url)
  }
  if (!result || !result.access_token) throw new Error('获取服务号 access_token 失败')
  const old = await db.collection('service_account_tokens').where({ appId: SERVICE_ACCOUNT_CONFIG.appId }).limit(10).get()
  for (const item of old.data || []) await db.collection('service_account_tokens').doc(item._id).remove()
  await db.collection('service_account_tokens').add({
    data: { appId: SERVICE_ACCOUNT_CONFIG.appId, accessToken: result.access_token, expiresAt: new Date(Date.now() + Number(result.expires_in || 7200) * 1000), createTime: db.serverDate() }
  })
  return result.access_token
}

async function sendFeedbackReplyTemplate(cloud, openId, feedback) {
  if (!openId) return { skipped: true, reason: '用户未绑定服务号' }
  try {
    const result = await cloud.callFunction({
      name: 'sendRefereeTemplateMessages',
      data: {
        action: 'feedbackReply',
        openId,
        type: String(feedback.type || 'other'),
        reply: String(feedback.reply || '')
      }
    })
    const r = result.result || {}
    if (r.success) return { success: true, msgid: r.msgid }
    return { success: false, errcode: r.errcode, errmsg: r.errmsg || r.error || '推送失败' }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function serviceFeedbackReply(db, params, user) {
  const feedbackId = cleanText(params.feedbackId, 64)
  const reply = cleanText(params.reply, 500)
  if (!feedbackId) return { success: false, error: '请选择要回复的反馈' }
  if (!reply) return { success: false, error: '回复内容不能为空' }
  let existing = null
  try { existing = firstRecord((await db.collection('service_feedback').doc(feedbackId).get()).data) } catch { existing = null }
  if (!existing) return { success: false, error: '反馈不存在或已删除' }
  const patch = {
    reply,
    replyAt: db.serverDate(),
    replyBy: cleanText(user._id, 64),
    status: 'done',
    updateTime: db.serverDate()
  }
  if (!existing.firstHandledAt) patch.firstHandledAt = db.serverDate()
  await db.collection('service_feedback').doc(feedbackId).update({ data: patch })
  await db.collection('platform_content_audit_logs').add({
    data: { action: 'service_feedback_reply', actorId: user._id, feedbackId, createTime: db.serverDate() }
  })
  let notify = { skipped: true, reason: '未尝试推送' }
  const openId = String(existing.serviceAccountOpenId || '')
  if (openId) {
    try {
      notify = await sendFeedbackReplyTemplate(cloud, openId, { ...existing, reply })
    } catch (error) {
      notify = { success: false, error: error.message }
      console.warn('[manageTournamentCenterContent] feedback reply notify failed:', error.message)
    }
  }
  return { success: true, feedbackId, reply, replyAt: new Date(), notify }
}

exports.main = async event => {
  const db = cloud.database()
  try {
    const params = event || {}
    const user = await resolveCurrentUser(db, params)
    await requirePlatformOwner(db, user)

    const action = params.action || 'overview'
    if (action === 'overview') return await getOverview(db)
    if (action === 'getCustomerProfile') return await customerProfiles.getCustomerProfile(db, params)
    if (action === 'setCustomerAssetArchive') return await platformArchive.setCustomerAssetArchive(db, params, user)
    if (action === 'refreshTournamentStatuses') return await getStartedTournamentIds(db, params)
    if (action === 'sendOrganizerNotice') return await sendOrganizerNotice(db, params, user)
    if (action === 'saveBanner') return await saveBanner(db, params, user)
    if (action === 'deleteBanner') return await deleteBanner(db, params)
    if (action === 'setFeatured') return await setFeatured(db, params, user)
    if (action === 'publishTournamentCenter') return await publishTournamentCenter(db, params, user)
    if (action === 'revokeTournamentCenter') return await revokeTournamentCenter(db, params, user)
    if (action === 'inspectOrganizerAccountDeletion') return await inspectOrganizerAccountDeletion(db, params)
    if (action === 'deleteOrganizerAccount') return await deleteOrganizerAccount(db, params, user)
    if (action === 'saveOrganizerFollowUp') return await saveOrganizerFollowUp(db, params, user)
    if (action === 'saveOrganizerStageOverride') return await saveOrganizerStageOverride(db, params, user)
    if (action === 'setOrganizerAccountArchived') return await setOrganizerAccountArchived(db, params, user)
    if (action === 'purgeOrganizerAccount') return await purgeOrganizerAccount(db, params, user)
    if (action === 'serviceFeedbackList') return await listServiceFeedback(db, params)
    if (action === 'serviceFeedbackUpdate') return await updateServiceFeedback(db, params, user)
    if (action === 'serviceFeedbackReply') return await serviceFeedbackReply(db, params, user)
    return { success: false, error: `不支持的操作: ${action}` }
  } catch (error) {
    console.error('[manageTournamentCenterContent] error:', error)
    return { success: false, error: error.message || '赛事中心内容管理服务异常' }
  }
}
