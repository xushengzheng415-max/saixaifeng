const ACCOUNT_PERMISSION_SOURCES = new Set([
  'organizer_claimant',
  'organizer_claimant_bind'
])

const ACCOUNT_PERMISSION_TYPES = new Set([
  'team_owner',
  'owner_assigned'
])

export function isAccountPermissionRecord(record = {}) {
  const source = String(record.source || '').trim().toLowerCase()
  const permissionSource = String(record.permissionSource || '').trim().toLowerCase()
  return ACCOUNT_PERMISSION_SOURCES.has(source) || ACCOUNT_PERMISSION_TYPES.has(permissionSource)
}

export function actualStaffRecords(records = []) {
  return (Array.isArray(records) ? records : []).filter(record => !isAccountPermissionRecord(record))
}
