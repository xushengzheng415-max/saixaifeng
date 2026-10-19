'use strict'

// Display only. Membership permissions and ownership are never inferred from names.
function formatMember(item, user, ownerIds, maskPhone) {
  user = user || {}
  const userId = String(item.userId || item.memberUserId || item.ownerId || '')
  const owner = ownerIds.includes(userId)
  const roles = (Array.isArray(item.roles) ? item.roles : (item.role ? [item.role] : [])).map(String)
  const coach = roles.some(role => /coach|教练/i.test(role))
  const manager = owner || roles.some(role => /^(owner|team_manager|manager|admin|team_leader|leader|负责人|管理员|领队)$/i.test(role))
  const active = ['accepted', 'active', 'claimed'].includes(String(item.status || 'active').toLowerCase())
  return {
    id: String(item._id || 'owner:' + userId), userId,
    name: String(user.realName || user.name || user.nickname || user.nickName || user.userName || item.name || item.memberName || '未命名成员'),
    avatar: String(user.avatarUrl || user.avatar || user.headimgurl || item.avatarUrl || ''),
    phoneMasked: maskPhone(String(user.phone || user.phoneNumber || item.phone || '')),
    roles, kind: coach ? 'coach' : (roles.some(role => /doctor|medic|队医/.test(role)) ? 'doctor' : roles.some(role => /leader|领队/.test(role)) ? 'leader' : manager ? 'manager' : 'other'),
    accountTypeText: owner ? '主账户' : '',
    roleText: (owner ? ['负责人'] : []).concat(roles.map(role => roleLabels[role]).filter(Boolean)).filter((label,index,list) => list.indexOf(label) === index).join(' / ') || (manager ? '管理员' : '成员'),
    statusText: active ? '已加入' : '待确认', pending: !active
  }
}
const roleLabels = { head_coach:'主教练',coach:'教练',assistant_coach:'助理教练',assistant:'助理教练',team_leader:'领队',leader:'领队',doctor:'队医',medic:'队医',liaison:'联络员',manager:'管理员' }
function withStaff(members, staffRows, users, maskPhone) {
  const phone = value => String(value || '').replace(/\D/g, '')
  const userMap = new Map(users.map(user => [String(user._id),user]))
  const result = members.map(row => ({...row,roles:[...(row.roles || [])],staffIds:[],linkedPlayerIds:[]}))
  const staffGroups = new Map()
  for (const staff of staffRows) {
    if (staff.deleted || staff.isDeleted || staff.archived || staff.isArchived || ['deleted','archived','revoked','inactive'].includes(String(staff.status || '').toLowerCase())) continue
    const token = String(staff.type || staff.roleType || staff.position || staff.role || '').toLowerCase()
    const label = roleLabels[token] || String(staff.roleLabel || staff.role || '工作人员')
    const id = String(staff.userId || staff.linkedUserId || staff.memberUserId || '')
    const contact = phone(staff.phone || staff.phoneNumber)
    const candidates = result.filter(row => {
      const user = userMap.get(row.userId) || {}
      return id ? row.userId === id : contact && contact === phone(user.phone || user.phoneNumber)
    })
    let target = candidates.length === 1 ? candidates[0] : null
    // Legacy repeated imports are projected by the explicit contact identifier;
    // conflicting names stay separate and no account or record is merged/written.
    const groupKey = id ? 'user:' + id : contact ? 'phone:' + contact : 'staff:' + staff._id
    const name = String(staff.name || staff.coachName || staff.memberName || '').trim()
    if (!target) {
      const previous = staffGroups.get(groupKey)
      if (previous && previous.name === name) target = previous
    }
    if (!target) {
      target = {id:'staff:' + staff._id,userId:'',name:name || '姓名待补充',avatar:String(staff.photoUrl || staff.photoFileID || staff.photoFileId || staff.photo || staff.avatarUrl || ''),phoneMasked:maskPhone(contact),roles:[],staffIds:[],linkedPlayerIds:[],roleText:'',kind:'other',statusText:'已登记',pending:false,staffOnly:true,accountTypeText:''}
      result.push(target)
      staffGroups.set(groupKey,target)
    }
    target.staffIds.push(String(staff._id))
    const linkedPlayerId = typeof staff.linkedPlayerId === 'string' ? staff.linkedPlayerId.trim() : ''
    if (linkedPlayerId && !target.linkedPlayerIds.includes(linkedPlayerId)) target.linkedPlayerIds.push(linkedPlayerId)
    if (!target.roles.includes(token)) target.roles.push(token)
    const labels = target.roleText ? target.roleText.split(' / ') : []
    if (!labels.includes(label)) labels.push(label)
    target.roleText = labels.join(' / ')
    const roles = target.roles
    target.kind = roles.some(value => /coach|教练/.test(value)) ? 'coach' : roles.some(value => /doctor|medic|队医/.test(value)) ? 'doctor' : roles.some(value => /leader|领队/.test(value)) ? 'leader' : target.kind
  }
  return result.map(row => ({...row,linkedPlayerId:row.linkedPlayerIds.length === 1 ? row.linkedPlayerIds[0] : '',playerLinkState:row.linkedPlayerIds.length > 1 ? 'conflict' : row.linkedPlayerIds.length === 1 ? 'linked' : 'missing'}))
}
module.exports = { formatMember, withStaff }
