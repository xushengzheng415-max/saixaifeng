const text = value => String(value == null ? '' : value)
const phone = value => text(value).replace(/\D/g, '')

// 前端仅控制入口；保存仍由服务端重新校验会话、赛事和机构范围。
export function canAssignTeamAccounts({ tournamentId, tournament = {}, scope, user = {}, demo = false }) {
  if (!tournamentId) return false
  if (demo) return true
  if (tournament.orgId) {
    const orgId = text(scope?.activeOrgId || user.orgId || user.organizationId || user.organization_id)
    if (!orgId || orgId !== text(tournament.orgId)) return false
    if (scope?.isStaff && !scope?.isOwner) {
      return (scope.grants || []).some(grant => text(grant.tournamentId) === text(tournamentId)
        && text(grant.orgId) === orgId && grant.status === 'active')
    }
    return true
  }
  return Boolean(user._id) && [tournament.creatorId, tournament.organizerId, tournament.ownerId, tournament.userId]
    .filter(Boolean).map(text).includes(text(user._id))
}

// 主账号由现有工作人员承接时保留该工作人员行；不能因其资料未填手机号重复补行。
export function teamStaffDisplayRows(rows, owner) {
  if (!owner) return rows
  const ownerStaffId = text(owner.staffId || (text(owner.role).startsWith('staff:') ? text(owner.role).slice(6) : ''))
  const ownerPhone = phone(owner.phone)
  if (rows.some(row => ownerStaffId && text(row._id || row.id) === ownerStaffId
    || ownerPhone && phone(row.phone || row.phoneNumber) === ownerPhone)) return rows
  return [{ _id:'team-account-holder', _accountHolderRow:true, name:owner.name || '未命名',
    phone:owner.phone || '', role:'账号持有人', roleLabel:owner.roleLabel || '', accountType:owner.accountType }, ...rows]
}

export function teamStaffPhone(row, account) {
  return phone(account?.phone || row.phone || row.phoneNumber)
}
