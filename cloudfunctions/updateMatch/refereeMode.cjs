// 裁判模式（standard / lightweight）唯一判定口径。
// 权威源：cloudfunctions/serviceMatchWorkflow/refereeMode.cjs。
// CloudBase 按函数目录独立打包，跨目录 require 在云端不可用，因此本目录保留同一份实现；
// 任何修改必须先改权威源，再同步到本文件，不得单独改动。
// 权威字段：tournaments.refereeMode（'standard' | 'lightweight'，默认 standard）。
// 兼容：历史 tournaments.lightweightMode === true 的赛事默认按 lightweight 执裁；不写回该字段。
// 轻量化只保留 1 名「记录员」，复用既有 fourthOfficial 岗位 id。
const REFEREE_MODE_STANDARD = 'standard'
const REFEREE_MODE_LIGHTWEIGHT = 'lightweight'
const RECORD_OFFICER_ROLE = 'fourthOfficial'
const RECORD_OFFICER_LABEL = '记录员'
const LIGHTWEIGHT_VERIFICATION_MODE = 'manual_lightweight'

const STANDARD_CREW_TEMPLATE = [
  { key:'mainReferee', label:'主裁判' },
  { key:'assistant1', label:'第一助理裁判' },
  { key:'assistant2', label:'第二助理裁判' },
  { key:'fourthOfficial', label:'第四官员' }
]
const SMALL_SIDED_CREW_TEMPLATE = [
  { key:'mainReferee', label:'主裁判' },
  { key:'secondReferee', label:'第二裁判' },
  { key:'thirdReferee', label:'第三裁判' },
  { key:'timekeeper', label:'计时员' }
]
const LIGHTWEIGHT_CREW_TEMPLATE = [{ key:RECORD_OFFICER_ROLE, label:RECORD_OFFICER_LABEL }]

function normalizeRefereeMode(value) {
  const text = String(value == null ? '' : value).trim().toLowerCase()
  if (text === REFEREE_MODE_LIGHTWEIGHT) return REFEREE_MODE_LIGHTWEIGHT
  if (text === REFEREE_MODE_STANDARD) return REFEREE_MODE_STANDARD
  return ''
}

function resolveRefereeMode(tournament) {
  const explicit = normalizeRefereeMode(tournament && tournament.refereeMode)
  if (explicit) return explicit
  if (tournament && tournament.lightweightMode === true) return REFEREE_MODE_LIGHTWEIGHT
  return REFEREE_MODE_STANDARD
}

function isLightweightRefereeMode(tournament) {
  return resolveRefereeMode(tournament) === REFEREE_MODE_LIGHTWEIGHT
}

function crewTemplate(tournament, format) {
  if (isLightweightRefereeMode(tournament)) return LIGHTWEIGHT_CREW_TEMPLATE.map(item => Object.assign({}, item))
  const template = /^(5|6)/.test(String(format || '')) ? SMALL_SIDED_CREW_TEMPLATE : STANDARD_CREW_TEMPLATE
  return template.map(item => Object.assign({}, item))
}

function operatorRoles(tournament) {
  return isLightweightRefereeMode(tournament) ? [RECORD_OFFICER_ROLE] : ['mainReferee']
}

function viewRoles(tournament) {
  return isLightweightRefereeMode(tournament)
    ? [RECORD_OFFICER_ROLE]
    : ['mainReferee', 'assistant1', 'assistant2', 'fourthOfficial']
}

function identityTaskRoles(tournament) {
  return isLightweightRefereeMode(tournament) ? [] : ['assistant1', 'assistant2', 'fourthOfficial']
}

function roleLabel(tournament, role, fallback) {
  const key = String(role || '')
  if (isLightweightRefereeMode(tournament) && key === RECORD_OFFICER_ROLE) return RECORD_OFFICER_LABEL
  return String(fallback || '')
}

function lineupVerificationMode(tournament) {
  return isLightweightRefereeMode(tournament) ? LIGHTWEIGHT_VERIFICATION_MODE : 'sequential'
}

module.exports = {
  REFEREE_MODE_STANDARD,
  REFEREE_MODE_LIGHTWEIGHT,
  RECORD_OFFICER_ROLE,
  RECORD_OFFICER_LABEL,
  LIGHTWEIGHT_VERIFICATION_MODE,
  normalizeRefereeMode,
  resolveRefereeMode,
  isLightweightRefereeMode,
  crewTemplate,
  operatorRoles,
  viewRoles,
  identityTaskRoles,
  roleLabel,
  lineupVerificationMode
}
