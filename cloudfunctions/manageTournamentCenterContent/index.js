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
    teamCount: Number(relationCount || tournament.registeredTeams || tournament.approvedTeams || tournament.teamCount || 0),
    startDate: tournament.startDate || tournament.eventStartDate || null,
    endDate: tournament.endDate || tournament.eventEndDate || null,
    city: tournament.city || tournament.cityName || tournament.location || '',
    createTime: tournament.createTime || tournament.createdAt || null,
    updateTime: tournament.updateTime || tournament.updatedAt || null
  }
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
    isActive: user.status !== 'disabled' && user.isActive !== false,
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

  const referencedOrganizerIds = new Set()
  tournamentRows.forEach(item => {
    const userId = recordCreatorId(item)
    if (userId) referencedOrganizerIds.add(userId)
  })
  teamRows.forEach(item => {
    const userId = recordCreatorId(item)
    if (userId) referencedOrganizerIds.add(userId)
  })
  const accounts = userRows
    .filter(item => item.role === 'organizer' || referencedOrganizerIds.has(String(item._id)))
    .map(item => safeOrganizerAccount(item, tournamentRows, teamRows))
    .sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime))

  const teams = teamRows.map(team => {
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
      logo: team.logo || team.logoUrl || '',
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

  const supportRequests = assistanceRows.map(request => ({
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
    const result = await db.collection(collectionName).where(db.command.or(conditions)).count()
    return Number(result.total || 0)
  } catch (error) {
    throw new Error('无法核对账号关联数据：' + collectionName + '，已停止删除')
  }
}

async function accountDeletionInspection(db, user) {
  const specs = [
    ['organizations', '机构负责人关系', ['ownerId', 'creatorId', 'createdBy'], ['contactPhone', 'phone', 'phoneNumber']],
    ['organization_memberships', '机构成员关系', ['userId', 'memberUserId', 'ownerId'], ['phone', 'phoneNumber']],
    ['tournaments', '创建的赛事', ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'], ['creatorPhone', 'organizerPhone', 'ownerPhone']],
    ['teams', '创建或负责的球队', ['creatorId', 'ownerId', 'ownerUserId', 'userId', 'createdBy'], ['ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone']],
    ['team_memberships', '球队成员关系', ['userId', 'memberUserId', 'ownerId'], ['phone', 'phoneNumber']],
    ['players', '创建的球员资料', ['creatorId', 'userId', 'createdBy'], ['creatorPhone']],
    ['tournament_teams', '赛事报名与认领关系', ['creatorId', 'applicantUserId', 'claimedByUserId', 'userId', 'ownerId'], ['applicantPhone']],
    ['assistance_requests', '协助申请记录', ['targetUserId'], []]
  ]
  const counts = await Promise.all(specs.map(item => countUserReferences(db, item[0], user, item[2], item[3])))
  const dependencies = specs.map((item, index) => ({
    key: item[0],
    label: item[1],
    count: counts[index]
  })).filter(item => item.count > 0)
  return {
    canDelete: dependencies.length === 0,
    dependencies
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
  if (cleanText(event.confirmText, 10) !== '删除') throw new Error('请输入“删除”完成二次确认')
  const user = await loadOrganizerAccount(db, event)
  const inspection = await accountDeletionInspection(db, user)
  if (!inspection.canDelete) {
    const summary = inspection.dependencies.map(item => item.label + ' ' + item.count + ' 项').join('、')
    throw new Error('账号仍有关联数据，暂不能删除：' + summary)
  }

  const auditResult = await db.collection('account_identity_audit_logs').add({
    data: {
      action: 'organizer_account_delete',
      result: 'pending',
      actorType: 'platform_owner',
      actorId: actor._id,
      targetUserId: user._id,
      phoneHash: normalizePhone(user.phone || user.phoneNumber)
        ? crypto.createHash('sha256').update(normalizePhone(user.phone || user.phoneNumber)).digest('hex')
        : '',
      emailHash: user.email
        ? crypto.createHash('sha256').update(String(user.email).trim().toLowerCase()).digest('hex')
        : '',
      dependencySnapshot: inspection.dependencies,
      createTime: db.serverDate()
    }
  })

  try {
    const sessions = (await db.collection('auth_sessions').where({ userId: user._id }).limit(100).get()).data || []
    for (const session of sessions) {
      await db.collection('auth_sessions').doc(session._id).remove()
    }
    const removed = await db.collection('users').doc(user._id).remove()
    if (!removed.stats || removed.stats.removed !== 1) throw new Error('账号删除未成功，请刷新后重试')
    await db.collection('account_identity_audit_logs').doc(auditResult._id).update({
      data: {
        result: 'success',
        removedSessionCount: sessions.length,
        completedAt: db.serverDate()
      }
    })
    return { success: true, userId: user._id, removedSessionCount: sessions.length }
  } catch (error) {
    await db.collection('account_identity_audit_logs').doc(auditResult._id).update({
      data: { result: 'failed', errorCode: 'ACCOUNT_DELETE_FAILED', completedAt: db.serverDate() }
    }).catch(() => {})
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

exports.main = async event => {
  const db = cloud.database()
  try {
    const params = event || {}
    const user = await resolveCurrentUser(db, params)
    await requirePlatformOwner(db, user)

    const action = params.action || 'overview'
    if (action === 'overview') return await getOverview(db)
    if (action === 'saveBanner') return await saveBanner(db, params, user)
    if (action === 'deleteBanner') return await deleteBanner(db, params)
    if (action === 'setFeatured') return await setFeatured(db, params, user)
    if (action === 'inspectOrganizerAccountDeletion') return await inspectOrganizerAccountDeletion(db, params)
    if (action === 'deleteOrganizerAccount') return await deleteOrganizerAccount(db, params, user)
    return { success: false, error: `不支持的操作: ${action}` }
  } catch (error) {
    console.error('[manageTournamentCenterContent] error:', error)
    return { success: false, error: error.message || '赛事中心内容管理服务异常' }
  }
}
