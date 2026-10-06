const DETAIL_NUMBER_FIELDS = [
  'teamLeaderLimit', 'coachLimit', 'doctorLimit', 'registrationFeePerPerson',
  'disciplineDepositPerTeam', 'depositRefundWorkdays', 'eligibilityComplaintDeadlineRound',
  'matchBallSize', 'lineupSubmissionMinutes', 'minimumPlayersToContinue',
  'firstHalfSubstitutionWindows', 'secondHalfSubstitutionWindows', 'halftimeSubstitutionWindows',
  'concussionSubstitutionLimit', 'benchTotalLimit', 'benchPlayerLimit', 'benchOfficialLimit',
  'jerseyNumberMin', 'jerseyNumberMax', 'stoppagePauseMinutes', 'stoppagePausePeriods',
  'stoppageDecisionHours', 'severeMisconductBanMonths'
]

const DETAIL_BOOLEAN_FIELDS = [
  'officialsCanPlay', 'forfeitDepositDeduction', 'foreignPlayersAllowed',
  'professionalPlayersAllowed', 'femaleAdultAgeException', 'ageByYearOnly',
  'blacklistCheckRequired', 'teamKitPhotoRequired', 'unlimitedPlayersPerWindow',
  'substitutionReentryForbidden', 'keepHigherLiveScore', 'opponentConcussionSubstitution',
  'twoKitsRequired', 'captainArmbandRequired', 'shinGuardsRequired', 'metalStudsForbidden',
  'jerseyModificationForbidden', 'benchKitContrastRequired', 'resumeRemainingTimePreferred',
  'resumeStatePreserved', 'withdrawalVoidsResults', 'fairPlayDisqualification',
  'cardsCarryToNextStage', 'teamOfficialsDiscipline'
]

const DETAIL_TEXT_FIELDS = ['eligibilityViolationScore', 'terminationForfeitScore']
const TOP_LEVEL_NUMBER_FIELDS = [
  'expectedTeams', 'groupCount', 'teamsPerGroup', 'advancePerGroup', 'knockoutSize',
  'matchMinutes', 'breakMinutes', 'substitutionLimit', 'substitutionWindows',
  'yellowCardSuspension', 'redCardSuspension', 'winPoints', 'drawPoints',
  'lossPoints', 'penaltyWinPoints', 'penaltyLossPoints', 'rosterLimit', 'minimumRoster'
]
const TOP_LEVEL_BOOLEAN_FIELDS = [
  'substitutionReentryAllowed', 'identityDocumentRequired', 'insuranceRequired',
  'waiverRequired', 'singleDivisionOnly'
]
const TOP_LEVEL_TEXT_FIELDS = [
  'birthDateStart', 'birthDateEnd', 'eligibilityNotes', 'matchFormat', 'formatType',
  'groupCycle', 'periodMode', 'drawResolution'
]

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase()
}

export function normalizeRecognizedGender(value) {
  const normalized = cleanName(value)
  if (['male', 'man', 'men', '男', '男子', '男子组'].includes(normalized)) return '男子组'
  if (['female', 'woman', 'women', '女', '女子', '女子组'].includes(normalized)) return '女子组'
  return '混合组'
}

export function normalizeRecognizedRegulationDetails(source = {}) {
  const result = {}
  DETAIL_NUMBER_FIELDS.forEach(field => {
    if (source[field] == null || source[field] === '') return
    const value = Number(source[field])
    if (Number.isFinite(value)) result[field] = value
  })
  DETAIL_BOOLEAN_FIELDS.forEach(field => {
    if (typeof source[field] === 'boolean') result[field] = source[field]
  })
  DETAIL_TEXT_FIELDS.forEach(field => {
    const value = String(source[field] || '').trim()
    if (value) result[field] = value.slice(0, 7)
  })
  return result
}

export function recognizedDivisionRulePayload(source = {}, sharedDetails = {}) {
  const result = {
    regulationDetails: {
      ...normalizeRecognizedRegulationDetails(sharedDetails),
      ...normalizeRecognizedRegulationDetails(source.regulationDetails || {})
    }
  }
  TOP_LEVEL_NUMBER_FIELDS.forEach(field => {
    if (source[field] == null || source[field] === '') return
    const value = Number(source[field])
    if (Number.isFinite(value)) result[field] = value
  })
  TOP_LEVEL_BOOLEAN_FIELDS.forEach(field => {
    if (typeof source[field] === 'boolean') result[field] = source[field]
  })
  TOP_LEVEL_TEXT_FIELDS.forEach(field => {
    const value = String(source[field] || '').trim()
    if (value) result[field] = value
  })
  if (result.drawResolution) {
    result.drawResolution = ['penalties', 'penalty_shootout', 'shootout'].includes(result.drawResolution.toLowerCase()) ? 'penalties' : 'draw'
  }
  if (result.matchFormat) {
    const normalized = result.matchFormat.toLowerCase().replace(/人制$/, 'side')
    if (['5side', '7side', '8side', '9side', '11side'].includes(normalized)) {
      result.matchFormat = normalized
      result.playersOnField = Number(normalized.replace('side', ''))
    }
    else delete result.matchFormat
  }
  if (Number(result.substitutionWindows || source.substitutionWindows || 0) > 0 ||
      source.substitutionReentryAllowed === false ||
      result.regulationDetails.substitutionReentryForbidden === true) {
    result.substitutionMode = 'limited'
  }
  if (result.formatType && !['cup', 'tournament', 'league', 'hybrid'].includes(result.formatType)) delete result.formatType
  if (result.groupCycle && !['single', 'double'].includes(result.groupCycle)) delete result.groupCycle
  if (result.periodMode === 'quarters') result.periodMode = 'single'
  if (result.periodMode && !['halves', 'single'].includes(result.periodMode)) delete result.periodMode
  return result
}

export function findRecognizedDivision(divisions, currentDivision) {
  const rows = Array.isArray(divisions) ? divisions : []
  const currentName = cleanName(currentDivision && (currentDivision.name || currentDivision.divisionName))
  const exact = rows.find(item => cleanName(item && item.name) === currentName)
  if (exact) return exact
  const ageGroup = cleanName(currentDivision && currentDivision.ageGroup)
  const gender = cleanName(currentDivision && currentDivision.gender)
  const candidates = rows.filter(item => {
    if (ageGroup && cleanName(item && item.ageGroup) !== ageGroup) return false
    if (gender && item && item.gender && cleanName(item.gender) !== gender) return false
    return Boolean(ageGroup)
  })
  return candidates.length === 1 ? candidates[0] : null
}
