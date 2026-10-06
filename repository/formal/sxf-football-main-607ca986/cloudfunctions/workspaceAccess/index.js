const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function currentUser() {
  const openId = String(cloud.getWXContext().OPENID || '')
  if (!openId) throw new Error('登录状态已失效，请重新登录')
  const result = await db.collection('users').where(_.or([{ openId }, { _openid: openId }])).limit(2).get()
  const users = result.data || []
  if (users.length !== 1) throw new Error(users.length > 1 ? '当前微信存在重复账号，请联系管理员处理' : '登录状态已失效，请重新登录')
  return { user: users[0], openId }
}

function maskedAccount(user) {
  const name = String(user.nickName || '当前账号').trim()
  return name ? name.slice(0, 16) : '当前账号'
}

async function accessState(identity, orgId) {
  if (!orgId) throw new Error('缺少需要访问的机构信息')
  const [organization, memberships, requests] = await Promise.all([
    db.collection('organizations').doc(orgId).get().catch(function() { return { data: null } }),
    db.collection('organization_memberships').where(_.or([{ orgId, userId: identity.user._id }, { orgId, memberUserId: identity.user._id }, { orgId, openId: identity.openId }])).limit(2).get(),
    db.collection('organization_access_requests').where({ orgId, userId: identity.user._id }).limit(2).get().catch(function() { return { data: [] } })
  ])
  if (!organization.data) throw new Error('目标机构不存在或已不可用')
  const member = (memberships.data || [])[0]
  const memberStatus = String((member && member.status) || '')
  const request = (requests.data || []).find(function(item) { return ['pending', 'rejected'].indexOf(String(item.status || 'pending')) >= 0 })
  const hasActiveMembership = ['active', 'accepted'].indexOf(memberStatus) >= 0
  return {
    success: true,
    orgId,
    organizationName: organization.data.name || organization.data.organizationName || '目标机构',
    accountText: maskedAccount(identity.user),
    status: hasActiveMembership ? 'active' : (request ? String(request.status || 'pending') : (member ? 'membership-disabled' : 'not-member')),
    canRequest: !hasActiveMembership && (!request || String(request.status || '') === 'rejected')
  }
}

exports.main = async function(event) {
  event = event || {}
  try {
    const identity = await currentUser()
    const orgId = String(event.orgId || '')
    const state = await accessState(identity, orgId)
    if (event.action !== 'request') return state
    if (!state.canRequest) return Object.assign(state, { success: false, message: '访问申请正在处理中或当前已具备访问关系' })
    const now = db.serverDate()
    await db.collection('organization_access_requests').add({ data: { orgId, userId: identity.user._id, openId: identity.openId, status: 'pending', source: 'mini_workspace_restricted', createTime: now, updateTime: now } })
    return Object.assign(state, { success: true, status: 'pending', canRequest: false })
  } catch (error) {
    return { success: false, message: error.message || '访问状态加载失败' }
  }
}
