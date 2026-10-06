'use strict'
const crypto = require('node:crypto')
const { readAll } = require('./shared/reader.cjs')
const { error } = require('./shared/service.cjs')
const id = value => String(value || '').trim()
const first = result => Array.isArray(result.data) ? result.data[0] : result.data

async function authenticate(cloud, db, event) {
  let user
  if (event.__authToken) {
    const tokenHash = crypto.createHash('sha256').update(String(event.__authToken)).digest('hex')
    const sessions = (await db.collection('auth_sessions').where({ tokenHash, active:true, expiresAt:db.command.gt(new Date()) }).limit(2).get()).data || []
    if (sessions.length !== 1) throw error('AUTH_REQUIRED','登录已失效，请重新登录')
    const session = sessions[0]
    if (session.principalType === 'platform_owner' && session.channel === 'platform_password') user = { _id:'platform-owner', isPlatformOwner:true }
    else user = first(await db.collection('users').doc(session.userId).get())
  } else {
    const openId = id(cloud.getWXContext()?.OPENID)
    if (!openId) throw error('AUTH_REQUIRED','请先登录')
    const rows = (await db.collection('users').where(db.command.or([{ openId },{ openid:openId },{ _openid:openId }])).limit(2).get()).data || []
    if (rows.length !== 1) throw error('AUTH_REQUIRED','账号身份异常，请重新登录')
    user = rows[0]
  }
  if (!user || (event.__actorUserId && id(event.__actorUserId) !== id(user._id))) throw error('AUTH_REQUIRED','账号身份校验失败')
  const orgId = id(user.orgId || user.organizationId)
  const configuredOwner = id(process.env.PLATFORM_OWNER_USER_ID)
  let platformOwner = user.isPlatformOwner === true || (configuredOwner && configuredOwner === id(user._id))
  if (!platformOwner) {
    const settings = await readAll(db,'platform_settings',{ _id:'platform-owner' })
    platformOwner = settings.some(row => id(row.ownerUserId) === id(user._id))
  }
  if (!platformOwner && (!orgId || user.organizationConflict)) throw error('ORG_REQUIRED','请先确认所属机构')
  if (event.__actorOrgId && id(event.__actorOrgId) !== orgId) throw error('DATA_FORBIDDEN','机构身份校验失败')
  const owned = async collection => {
    const rows = [...await readAll(db,collection,{ orgId }), ...await readAll(db,collection,{ organizationId:orgId })]
    return [...new Map(rows.filter(row => {
      const ids = [...new Set([id(row.orgId),id(row.organizationId),id(row.organization_id)].filter(Boolean))]
      return ids.length === 1 && ids[0] === orgId
    }).map(row => [id(row._id),row])).values()]
  }
  const teams = platformOwner ? [] : await owned('teams')
  const tournaments = platformOwner ? [] : await owned('tournaments')
  const memberships = platformOwner ? [] : [...await readAll(db,'organization_memberships',{userId:id(user._id)}),...await readAll(db,'organization_memberships',{memberUserId:id(user._id)})]
  const active = memberships.filter(row => id(row.orgId || row.organizationId) === orgId && ['active','accepted','claimed'].includes(id(row.status || 'active')))
  const manageAll = active.some(row => (row.permissions || []).some(permission => ['team.manage','event.manage'].includes(permission)) || (Array.isArray(row.roles) ? row.roles : [row.role]).some(role => ['owner','admin','organizer'].includes(role)))
  const manageTeamIds = teams.filter(row => manageAll || [row.ownerId,row.creatorId,row.managerUserId].filter(Boolean).map(String).includes(id(user._id))).map(row => id(row._id))
  return { userId:id(user._id), orgId, platformOwner:Boolean(platformOwner), teamIds:teams.map(row => id(row._id)), manageTeamIds, tournamentIds:tournaments.map(row => id(row._id)) }
}
module.exports = { authenticate }
