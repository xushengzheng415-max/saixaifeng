const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return ''
}

async function resolveOwner(team) {
  const directPhone = firstNonEmpty(
    team.ownerPhone,
    team.creatorPhone,
    team.contactPhone,
    team.phoneNumber,
    team.phone,
    team.coachPhone
  )
  if (directPhone) return { phone: directPhone, source: 'direct' }

  if (team.creatorId) {
    const byId = await db.collection('users').where({ _id: team.creatorId }).limit(1).get()
    if (byId.data && byId.data.length > 0) {
      const user = byId.data[0]
      const phone = firstNonEmpty(user.phoneNumber, user.phone)
      if (phone) return { phone: phone, creatorId: user._id, source: 'creatorId' }
    }
  }

  const openId = firstNonEmpty(team.openId, team.wechatOpenId, team._openid)
  if (openId) {
    const byOpenId = await db.collection('users').where(
      _.or([{ openId: openId }, { wechatOpenId: openId }])
    ).limit(1).get()
    if (byOpenId.data && byOpenId.data.length > 0) {
      const user = byOpenId.data[0]
      const phone = firstNonEmpty(user.phoneNumber, user.phone)
      if (phone) return { phone: phone, creatorId: team.creatorId || user._id, openId: openId, source: 'openId' }
    }
  }

  return { phone: '', source: 'none' }
}

exports.main = async (event = {}) => {
  const pageSize = Math.min(Number(event.pageSize) || 200, 500)
  const maxPages = Math.max(Number(event.maxPages) || 9999, 1)
  const dryRun = !!event.dryRun

  let pageIndex = Number(event.pageIndex) || 0
  let scanned = 0
  let updated = 0
  const patches = []

  while (pageIndex < maxPages) {
    const res = await db.collection('teams')
      .skip(pageIndex * pageSize)
      .limit(pageSize)
      .get()

    const teams = res.data || []
    if (teams.length === 0) break

    scanned += teams.length

    for (const team of teams) {
      const resolved = await resolveOwner(team)
      const ownerPhone = resolved.phone
      const nextCreatorId = firstNonEmpty(team.creatorId, resolved.creatorId)
      const nextOpenId = firstNonEmpty(team.openId, team.wechatOpenId, resolved.openId)
      const patch = {}

      if (ownerPhone && team.ownerPhone !== ownerPhone) patch.ownerPhone = ownerPhone
      if (ownerPhone && team.creatorPhone !== ownerPhone) patch.creatorPhone = ownerPhone
      if (ownerPhone && team.contactPhone !== ownerPhone) patch.contactPhone = ownerPhone
      if (ownerPhone && team.phoneNumber !== ownerPhone) patch.phoneNumber = ownerPhone
      if (ownerPhone && team.phone !== ownerPhone) patch.phone = ownerPhone
      if (nextCreatorId && team.creatorId !== nextCreatorId) patch.creatorId = nextCreatorId
      if (nextOpenId && team.openId !== nextOpenId) patch.openId = nextOpenId
      if (nextOpenId && team.wechatOpenId !== nextOpenId) patch.wechatOpenId = nextOpenId
      if (ownerPhone && team.claimStatus !== 'claimed') patch.claimStatus = 'claimed'
      if (!ownerPhone && !team.claimStatus) patch.claimStatus = 'unclaimed'

      if (Object.keys(patch).length > 0) {
        patch.updateTime = db.serverDate()
        if (!dryRun) {
          await db.collection('teams').doc(team._id).update({ data: patch })
        }
        updated += 1
        patches.push({ id: team._id, patch })
      }
    }

    pageIndex += 1
  }

  return { success: true, dryRun, scanned, updated, patches }
}