const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

const OWNER_SETTING_ID = 'platform-owner'
const MAX_LIST_SIZE = 100

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

function safeTournament(tournament) {
  return {
    _id: tournament._id,
    name: tournament.name || '未命名赛事',
    coverImage: tournament.coverImage || tournament.cover || tournament.poster || '',
    organizerName: tournament.organizerName || tournament.organizer || tournament.organizationName || '',
    category: tournament.category || tournament.type || '',
    formatType: tournament.formatType || tournament.format || '',
    ageGroup: tournament.ageGroup || '',
    status: tournament.status || 'draft',
    isFeatured: tournament.isFeatured === true || tournament.featured === true,
    featuredSort: Number(tournament.featuredSort || tournament.sort || 0),
    createTime: tournament.createTime || tournament.createdAt || null
  }
}

function safeOrganizer(user) {
  return {
    _id: user._id,
    name: user.organizationName || user.organizerName || user.nickname || user.name || '未命名主办方',
    contact: user.contactName || user.nickname || user.name || '',
    phone: maskPhone(user.phone || user.phoneNumber),
    email: user.email || '',
    orgId: String(user.orgId || user.organizationId || '').trim(),
    isActive: user.status !== 'disabled' && user.isActive !== false,
    createTime: user.createTime || user.createdAt || null
  }
}

async function getOverview(db) {
  const [
    bannerResult,
    tournamentResult,
    organizerResult,
    bannerCount,
    tournamentCount,
    organizerCount,
    featuredCount
  ] = await Promise.all([
    db.collection('banners').limit(MAX_LIST_SIZE).get(),
    db.collection('tournaments').limit(MAX_LIST_SIZE).get(),
    db.collection('users').where({ role: 'organizer' }).limit(MAX_LIST_SIZE).get(),
    db.collection('banners').count(),
    db.collection('tournaments').count(),
    db.collection('users').where({ role: 'organizer' }).count(),
    db.collection('tournaments').where(db.command.or([
      { isFeatured: true },
      { featured: true }
    ])).count()
  ])

  const banners = (bannerResult.data || [])
    .map(safeBanner)
    .sort((a, b) => a.sort - b.sort)
  const tournaments = (tournamentResult.data || [])
    .map(safeTournament)
    .sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime))
  const organizers = (organizerResult.data || [])
    .map(safeOrganizer)
    .sort((a, b) => toTimestamp(b.createTime) - toTimestamp(a.createTime))

  return {
    success: true,
    data: {
      banners,
      tournaments,
      organizers,
      stats: {
        totalTournaments: tournamentCount.total || 0,
        featuredTournaments: featuredCount.total || 0,
        totalOrganizers: organizerCount.total || 0,
        bannerCount: bannerCount.total || 0
      }
    }
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
    return { success: false, error: `不支持的操作: ${action}` }
  } catch (error) {
    console.error('[manageTournamentCenterContent] error:', error)
    return { success: false, error: error.message || '赛事中心内容管理服务异常' }
  }
}
