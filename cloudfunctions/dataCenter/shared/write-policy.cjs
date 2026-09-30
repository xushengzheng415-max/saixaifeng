'use strict'
const COMPUTED_PLAYER_FIELDS = ['starts','appearances','goals','assists','yellowCards','redCards','minutesPlayed','matchAppearances','playTime']
function assertPlayerFactWrite(data = {}) {
  const fields = COMPUTED_PLAYER_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(data,field))
  if (fields.length) { const error = new Error('统计由比赛记录生成，请修订原始比赛记录'); error.code = 'COMPUTED_STATISTICS_READ_ONLY'; throw error }
}
module.exports = { COMPUTED_PLAYER_FIELDS, assertPlayerFactWrite }
