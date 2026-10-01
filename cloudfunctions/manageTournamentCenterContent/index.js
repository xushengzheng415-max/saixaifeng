const cloud = require('wx-server-sdk')
const crypto = require('crypto')

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
    _id: tournament._id,
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

async function getOverview(db) {
  const [bannerRows, tournamentRows, userRows, organizationRows, teamRows, tournamentTeamRows, assistanceRows] = await Promise.all([
    loadAllOptional(db, 'banners', 1000),
    loadAll(db, 'tournaments'),
    loadAll(db, 'users'),
    loadAllOptional(db, 'organizations'),
    loadAllOptional(db, 'teams'),
    loadAllOptional(db, 'tournament_teams'),
    loadAllOptional(db, 'assistance_requests', 1000)
  ])

  // 旧版 Word 导入把限时 URL 写进 logo/logoUrl，同时保留了永久 cloud 文件 ID。
  // 每次读取时从永久 ID 换取新地址，避免 URL 到期后在长期球队列表显示破图。
  const logoFileIdOf = team => [
    team.logoFileID, team.logoFileId, team.logoCloudFileId,
    team.logoTransparentFileId, team.logo, team.logoUrl
  ].map(value => String(value || '').trim()).find(value => value.startsWith('cloud://')) || ''
  const logoFileIds = [...new Set(teamRows.map(logoFileIdOf).filter(Boolean))]
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
  const tournaments = tournamentRows
    .map(item => safeTournament(item, { usersById, organizationsById, tournamentTeamCounts }))
    .sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime))

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

  userRows.filter(user => user.role === 'organizer' || recordOrgId(user)).forEach(user => {
    ensureOrganizer(user, { user, userId: String(user._id) })
  })
  tournamentRows.forEach(tournament => {
    const organizer = ensureOrganizer(tournament)
    if (organizer && !organizer.tournamentIds.includes(String(tournament._id))) organizer.tournamentIds.push(String(tournament._id))
  })
  teamRows.forEach(team => {
    const organizer = ensureOrganizer(team)
    if (organizer && !organizer.teamIds.includes(String(team._id))) organizer.teamIds.push(String(team._id))
  })
  assistanceRows.forEach(request => {
    const targetUserId = cleanText(request.targetUserId, 128)
    if (!targetUserId) return
    const targetUser = usersById.get(targetUserId)
    const organizer = ensureOrganizer(targetUser || {}, { user: targetUser || {}, userId: targetUserId })
    if (!organizer) return
    organizer.supportCount += 1
    if (['pending', 'active'].includes(request.status)) organizer.activeSupportCount += 1
  })

  const organizers = Array.from(organizerMap.values()).map(item => {
    const organizerTournaments = tournaments.filter(tournament => item.tournamentIds.includes(String(tournament._id)))
    return {
      ...item,
      tournamentCount: item.tournamentIds.length,
      teamCount: item.teamIds.length,
      latestTournament: organizerTournaments[0] || null,
      hasContact: Boolean(item.phone || item.email)
    }
  }).sort((a, b) => {
    const latestA = toTimestamp(a.latestTournament && a.latestTournament.createTime) || toTimestamp(a.createTime)
    const latestB = toTimestamp(b.latestTournament && b.latestTournament.createTime) || toTimestamp(b.createTime)
    return latestB - latestA
  })

  const accounts = userRows
    .filter(item => String(item.role || '').toLowerCase() === 'organizer' && String(item.pcAccountStatus || '').toLowerCase() !== 'cancelled')
    .map(item => safeOrganizerAccount(item, tournamentRows, teamRows))
    .sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime))

  const teams = teamRows.map(team => {
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
      _id: team._id,
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

  const supportRequests = assistanceRows.filter(request => request.helperUserId || request.targetUserId).map(request => ({
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
        totalTournaments: tournamentRows.length,
        featuredTournaments: tournaments.filter(item => item.isFeatured).length,
        totalOrganizers: organizers.length,
        totalTeams: teamRows.length,
        bannerCount: bannerRows.length,
        activeSupportCount: supportRequests.filter(item => ['pending', 'active'].includes(item.status)).length,
        missingContactCount: organizers.filter(item => !item.hasContact).length
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

exports.main = async event => {
  const db = cloud.database()
  try {
    const params = event || {}
    const user = await resolveCurrentUser(db, params)
    await requirePlatformOwner(db, user)

    const action = params.action || 'overview'
    if (action === 'overview') return await getOverview(db)
    if (action === 'refreshTournamentStatuses') return await getStartedTournamentIds(db, params)
    if (action === 'sendOrganizerNotice') return await sendOrganizerNotice(db, params, user)
    if (action === 'saveBanner') return await saveBanner(db, params, user)
    if (action === 'deleteBanner') return await deleteBanner(db, params)
    if (action === 'setFeatured') return await setFeatured(db, params, user)
    if (action === 'publishTournamentCenter') return await publishTournamentCenter(db, params, user)
    if (action === 'revokeTournamentCenter') return await revokeTournamentCenter(db, params, user)
    if (action === 'inspectOrganizerAccountDeletion') return await inspectOrganizerAccountDeletion(db, params)
    if (action === 'deleteOrganizerAccount') return await deleteOrganizerAccount(db, params, user)
    return { success: false, error: `不支持的操作: ${action}` }
  } catch (error) {
    console.error('[manageTournamentCenterContent] error:', error)
    return { success: false, error: error.message || '赛事中心内容管理服务异常' }
  }
}
