// 裁判模式（standard / lightweight）前端只读映射。
// 权威判定在后端：cloudfunctions/serviceMatchWorkflow/refereeMode.cjs（及 updateMatch 同源副本）。
// 本文件只供 PC 页面渲染与表单回显，所有页面必须复用此文件，禁止在页面内另写一套规则。
export const REFEREE_MODE_STANDARD = 'standard'
export const REFEREE_MODE_LIGHTWEIGHT = 'lightweight'
export const RECORD_OFFICER_ROLE = 'fourthOfficial'
export const RECORD_OFFICER_LABEL = '记录员'

const STANDARD_CREW = [
  { key: 'mainReferee', label: '主裁判' },
  { key: 'assistant1', label: '第一助理裁判' },
  { key: 'assistant2', label: '第二助理裁判' },
  { key: 'fourthOfficial', label: '第四官员' }
]
const SMALL_SIDED_CREW = [
  { key: 'mainReferee', label: '主裁判' },
  { key: 'secondReferee', label: '第二裁判' },
  { key: 'thirdReferee', label: '第三裁判' },
  { key: 'timekeeper', label: '计时员' }
]
const LIGHTWEIGHT_CREW = [{ key: RECORD_OFFICER_ROLE, label: RECORD_OFFICER_LABEL }]

export function resolveRefereeMode(record) {
  const explicit = String(record && record.refereeMode || '').trim().toLowerCase()
  if (explicit === REFEREE_MODE_LIGHTWEIGHT || explicit === REFEREE_MODE_STANDARD) return explicit
  return record && record.lightweightMode === true ? REFEREE_MODE_LIGHTWEIGHT : REFEREE_MODE_STANDARD
}

export function isLightweightReferee(record) {
  return resolveRefereeMode(record) === REFEREE_MODE_LIGHTWEIGHT
}

export function crewRoles(record, format) {
  if (isLightweightReferee(record)) return LIGHTWEIGHT_CREW.map(item => ({ ...item }))
  const template = /^(5|6)/.test(String(format || '')) ? SMALL_SIDED_CREW : STANDARD_CREW
  return template.map(item => ({ ...item }))
}
