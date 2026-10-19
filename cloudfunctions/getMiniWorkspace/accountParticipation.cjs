'use strict'
const { readByIds } = require('./data-center/reader.cjs')
const { decorateTournament } = require('./data-center/lifecycle.cjs')
const hidden = new Set(['cancelled','canceled','withdrawn','rejected','replaced','invite_cancelled','removed','deleted'])
const text = value => String(value == null ? '' : value)
const sources = { synthetic:true,isTest:true,syntheticDatasetId:true,syntheticKey:true,source:true,originType:true,dataKind:true }
const priority = { approved:90,confirmed:90,active:90,locked:90,accepted:80,claimed:80,pending:60 }
async function load(db, authorizedEntries, formatTournament, divisionIdFor) {
  try {
    const { synthetic } = await import('./data-center/statistics.mjs')
    const teams = new Map((authorizedEntries || []).filter(row => row.type === 'team' && row.id && row.workspaceId && !synthetic(row)).map(row => [text(row.id),row]))
    const registrations = await readByIds(db,'tournament_teams','teamId',[...teams.keys()],{ fields:{teamId:true,tournamentId:true,divisionId:true,division:true,divisionName:true,status:true,...sources} })
    const active = registrations.filter(row => teams.has(text(row.teamId)) && row.tournamentId && !hidden.has(text(row.status).toLowerCase()) && !synthetic(row))
    const tournaments = await readByIds(db,'tournaments','_id',active.map(row => row.tournamentId),{ fields:{name:true,tournamentName:true,status:true,startDate:true,endDate:true,startTime:true,endTime:true,formatType:true,format:true,competitionFormat:true,logo:true,logoUrl:true,logoFileId:true,logoFileID:true,logoTransparentUrl:true,logoTransparentFileId:true,deleted:true,isDeleted:true,...sources} })
    const events = new Map(tournaments.filter(row => !row.deleted && !row.isDeleted && !hidden.has(text(row.status).toLowerCase()) && !synthetic(row)).map(row => [text(row._id),row]))
    const divisionIds = active.map(row => divisionIdFor(row)).filter(id => id && id !== 'default')
    const divisions = await readByIds(db,'divisions','_id',divisionIds,{ fields:{tournamentId:true,name:true,divisionName:true} })
    const divisionMap = new Map(divisions.map(row => [text(row._id),row]))
    const result = new Map()
    for (const registration of active) {
      const team = teams.get(text(registration.teamId)), tournament = events.get(text(registration.tournamentId))
      if (!tournament) continue
      const divisionId = divisionIdFor(registration)
      const division = divisionMap.get(divisionId)
      const divisionName = text(registration.divisionName || (division && text(division.tournamentId) === text(tournament._id) ? division.name || division.divisionName : ''))
      const lifecycle = decorateTournament(tournament)
      const event = formatTournament({...lifecycle,workspaceRelation:'participating'})
      event.statusText = lifecycle.statusText
      const key = 'participating:' + event.id + ':' + team.id + ':' + (divisionId || 'default')
      const status = text(registration.status).toLowerCase(), existing = result.get(key)
      if (existing && (priority[existing.registrationStatus] || 0) >= (priority[status] || 0)) continue
      result.set(key,{key,id:event.id,type:'tournament',name:event.name,logo:event.logo,status:event.status,statusText:event.statusText,dateText:event.dateText,
        workspaceId:team.workspaceId,teamId:team.id,teamName:team.name,divisionId,divisionName,registrationStatus:status,
        isParticipating:true,isHosted:false,isShared:false,relation:'participating',actionText:'参赛事项'})
    }
    return { state:'ready',entries:[...result.values()],error:'' }
  } catch (error) {
    return { state:'failed',entries:[],error:'参赛记录读取失败，请重试' }
  }
}
module.exports = { load }
