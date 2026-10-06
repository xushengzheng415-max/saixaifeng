'use strict'

function nameKey(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase()
}

function importError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function jerseyNumber(value) {
  const normalized = String(value == null ? '' : value).replace(/\D/g, '')
  return /^\d{1,3}$/.test(normalized) ? String(Number(normalized)) : ''
}

function staffRoleLabel(person) {
  if (person.roleType === 'head_coach') return '主教练'
  if (person.roleType === 'team_leader') return '领队'
  if (person.roleType === 'doctor') return '队医'
  return String(person.roleLabel || '工作人员').trim() || '工作人员'
}

function identityKey(value) {
  const normalized = String(value || '').toUpperCase().replace(/[^0-9X]/g, '').slice(0, 18)
  return /^\d{17}[0-9X]$/.test(normalized) ? normalized : ''
}

function mergeMissing(target, source, fields) {
  for (const field of fields) {
    if ((target[field] == null || target[field] === '') && source[field] != null && source[field] !== '') target[field] = source[field]
  }
}

function dedupeImportedPlayerRows(rows, teamName) {
  const uniqueRows = []
  const rowsByIdentity = new Map()
  let duplicateCount = 0
  for (const source of Array.isArray(rows) ? rows : []) {
    const row = Object.assign({}, source || {})
    const identityNumber = identityKey(row.identityNumber)
    const existing = identityNumber ? rowsByIdentity.get(identityNumber) : null
    if (!existing) {
      uniqueRows.push(row)
      if (identityNumber) rowsByIdentity.set(identityNumber, row)
      continue
    }
    if (!nameKey(row.name) || nameKey(row.name) !== nameKey(existing.name)) {
      throw importError('IMPORT_DUPLICATE_PERSON_NAME_MISMATCH', `${teamName || '当前球队'} 的重复身份证号对应不同姓名，请核对后重试`)
    }
    mergeMissing(existing, row, ['jerseyNumber','jerseyName','birthDate','gender','nativePlace','photoFileId','photoProcessingStatus'])
    duplicateCount += 1
  }
  return { rows:uniqueRows, duplicateCount }
}

function registerImportedPlayerIdentity(options) {
  const teamName = String(options.teamName || '').trim() || '当前球队'
  const playerName = String(options.playerName || '').trim()
  const identityNumber = String(options.identityNumber || '').trim()
  const playerJerseyNumber = jerseyNumber(options.playerJerseyNumber)
  const staff = Array.isArray(options.staff) ? options.staff : []
  const batchIdentities = options.batchIdentities
  const dualRoleIdentities = options.dualRoleIdentities

  if (!batchIdentities.has(identityNumber)) {
    batchIdentities.add(identityNumber)
    return { dualRoleType:'', linkedStaff:null }
  }

  const linkedStaff = staff.find(person => ['team_leader','head_coach','doctor'].includes(person.roleType) && String(person.identityNumber || '') === identityNumber)
  if (!linkedStaff) {
    throw importError('IMPORT_IDENTITY_DUPLICATED', `${teamName} 存在重复身份证号，请核对人员资料`)
  }
  if (!playerJerseyNumber) {
    throw importError('IMPORT_DUAL_ROLE_JERSEY_REQUIRED', `${teamName} 的${staffRoleLabel(linkedStaff)}与球员身份证号相同，但未填写有效球衣号码`)
  }
  if (!nameKey(playerName) || nameKey(playerName) !== nameKey(linkedStaff.name)) {
    throw importError('IMPORT_DUAL_ROLE_NAME_MISMATCH', `${teamName} 的工作人员兼球员身份证号相同，但姓名不一致，请统一后重试`)
  }
  if (dualRoleIdentities.has(identityNumber)) {
    throw importError('IMPORT_IDENTITY_DUPLICATED', `${teamName} 的主教练兼球员被重复填写，请只保留一个球员栏位`)
  }

  dualRoleIdentities.add(identityNumber)
  const dualRoleType = `${linkedStaff.roleType}_player`
  const dualRoleLabel = `${staffRoleLabel(linkedStaff)}兼球员`
  linkedStaff.jerseyNumber = playerJerseyNumber
  linkedStaff.dualRoleType = dualRoleType
  linkedStaff.dualRoleLabel = dualRoleLabel
  return { dualRoleType, dualRoleLabel, linkedStaff }
}

module.exports = { dedupeImportedPlayerRows, jerseyNumber, nameKey, registerImportedPlayerIdentity }
