'use strict'
const COMPUTED_PLAYER_FIELDS = ['starts','appearances','goals','assists','yellowCards','redCards','minutesPlayed','matchAppearances','playTime']
function assertPlayerFactWrite(data = {}) {
  const fields = COMPUTED_PLAYER_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(data,field))
  if (fields.length) { const error = new Error('统计由比赛记录生成，请修订原始比赛记录'); error.code = 'COMPUTED_STATISTICS_READ_ONLY'; throw error }
}
function assertMatchRuleSnapshotWrite(data = {}) {
  if (Object.keys(data).some(field => /^(durationRulesSnapshot|rulesSnapshot)(\.|$)/.test(field))) {
    throw Object.assign(new Error('赛前规则快照由授权比赛工作流保存'),{code:'MATCH_RULE_SNAPSHOT_READ_ONLY'})
  }
}
module.exports = { COMPUTED_PLAYER_FIELDS, assertPlayerFactWrite, assertMatchRuleSnapshotWrite }
