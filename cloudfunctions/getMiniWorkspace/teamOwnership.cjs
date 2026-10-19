'use strict'
const text = value => String(value == null ? '' : value).trim()
function owns(team, user, openId, memberships = []) {
  const identities = new Set([user._id,user.uid,user.userId,user.phone,user.phoneNumber,user.openId,user.openid,user.wechatOpenId,user._openid,openId].filter(Boolean).map(text))
  const owners = [team.ownerId,team.ownerUserId,team.claimedByUserId].filter(Boolean).map(text)
  if (owners.length) return owners.every(id => identities.has(id))
  return memberships.some(row => text(row.teamId) === text(team._id) &&
    [row.userId,row.memberUserId,row.phone,row.phoneNumber].filter(Boolean).some(value => identities.has(text(value))) &&
    ['active','accepted','claimed'].includes(text(row.status || 'active').toLowerCase()) &&
    [].concat(row.roles || [],row.role || []).includes('owner'))
}
module.exports = { owns }
