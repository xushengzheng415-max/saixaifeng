'use strict'
const { createDataService } = require('./data-center/service.cjs')
const { readPlayerSupportTotals, EMPTY_SUPPORT_VERSION } = require('./data-center/support.cjs')

async function applyPlayerCardScores(players,career,supportTotals){
  const {createPlayerCardSnapshot}=await import('./data-center/statistics.mjs')
  for(const player of players){
    const playerId=String(player.playerId||''),rows=(career.players||[]).filter(row=>row.playerId===playerId)
    const support=supportTotals instanceof Map?(supportTotals.get(playerId)||{drops:0,status:'complete',dataVersion:EMPTY_SUPPORT_VERSION}):{drops:null,status:'unverified',dataVersion:null}
    const complete=career.coverage?.playerCardComplete?.[playerId]??career.coverage?.cardScoreScopeComplete
    const {card,total}=createPlayerCardSnapshot(rows,{playerId,fullCareer:true,identityVerified:rows.length>0,testIdentity:false,matchCount:career.summary?.matchCount||0,metricVersion:career.metricVersion,dataVersion:career.dataVersion,mode:'official',coverageStatus:complete?'complete':'partial',supportDrops:support.drops,supportCoverageStatus:support.status,supportDataVersion:support.dataVersion,issues:career.issues||[]})
    player.playerCard=card
    const ready=card.status==='ready'
    player.cardTier=ready?card.tier:null;player.cardPoints=ready?card.points:null;player.cardScoreVersion=card.scoreVersion
    player.careerMetrics=ready?Object.fromEntries(['appearances','starts','minutesPlayed','goals','assists'].map(field=>[field,total.metrics[field]??null])):null
    player.careerPoints=ready?card.careerPoints:null;player.supportDrops=ready?card.supportDrops:null;player.supportPoints=ready?card.supportPoints:null
  }
  return players
}

async function enrichFanPlayerCards(db, players) {
  for (const player of players) { player.cardTier = null; player.cardPoints = null; player.cardScoreVersion = null; player.careerMetrics = null; player.careerPoints = null; player.supportDrops = null; player.supportPoints = null }
  if (!players.some(player => player.playerId)) return players
  try {
    const [career, supportTotals] = await Promise.all([
      createDataService(db).query({ platformOwner:true, teamIds:[], tournamentIds:[] }, { mode:'official' }),
      readPlayerSupportTotals(db)
    ])
    return applyPlayerCardScores(players, career, supportTotals)
  } catch (error) {
    console.warn('[fanPlayerCardScores]', error.code || 'DATA_READ_FAILED')
    return players
  }
}

function officialMatchIds(career) {
  return new Set((career.teams || []).flatMap(row => row.matchIds || []).map(String).filter(Boolean))
}

async function loadOfficialFanScope(db) {
  const [career, supportTotals] = await Promise.all([
    createDataService(db).query({ platformOwner:true, teamIds:[], tournamentIds:[] }, { mode:'official' }),
    readPlayerSupportTotals(db)
  ])
  return { career, supportTotals, matchIds:officialMatchIds(career) }
}

module.exports = { enrichFanPlayerCards, applyPlayerCardScores, officialMatchIds, loadOfficialFanScope }
