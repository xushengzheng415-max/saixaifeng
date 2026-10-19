'use strict'
const { decorateTournament } = require('./data-center/lifecycle.cjs')
const { owns } = require('./teamOwnership.cjs')
const text = value => String(value == null ? '' : value)
const active = row => !['deleted', 'archived', 'removed'].includes(text(row.status).toLowerCase())
const orgId = row => text(row.orgId || row.organizationId || row.organization_id)
function logo(row, currentTeam = false) {
  // PC updates logoUrl/logo; historical file aliases must not override the current team crest.
  if (currentTeam) {
    const current = text(row.logoUrl || row.logo || row.teamLogo).trim()
    if (current) return current
  }
  return text(row.logoTransparentFileId || row.logoTransparentUrl || row.logoFileID || row.logoFileId ||
    row.logoCloudFileId || row.logoUrl || row.logo || row.teamLogo)
}
function teamMetadata(team) {
  const city=text(team.city || team.cityName).trim(), age=text(team.ageGroup || team.divisionName).trim()
  const founded=text(team.foundedYear || team.establishedYear || team.establishedDate).match(/^(\d{4})(?:\D|$)/)
  return [...new Set([city,age,founded ? founded[1]+'年成立' : ''].filter(Boolean))].slice(0,3)
}
function eventMetadata(event) {
  const date=value=>{const source=value instanceof Date?value.toISOString():value && value.$date?value.$date:value;const match=text(source).match(/^(\d{4}-\d{2}-\d{2})/);return match?match[1]:''}
  const range=event.dateText || [...new Set([date(event.startDate),date(event.endDate)].filter(Boolean))].join(' — ')
  return [text(range),text(event.location || event.city || event.venue)].filter(Boolean).slice(0,2)
}

// A homepage entry grants no extra access. Its destination is an already verified workspace.
async function list(user, workspaces, catalog, sharedTournaments, readHosted) {
  const { synthetic } = await import('./data-center/statistics.mjs')
  const entries = new Map()
  for (const team of catalog.teams || []) {
    if (!active(team) || synthetic(team)) continue
    const id = text(team._id)
    const scope = workspaces.find(space => space.type === 'team' && text(space.teamId) === id &&
      (space.permissions || []).some(right => right === 'team.view' || right === 'team.manage')) ||
      workspaces.find(space => space.type === 'organization' && orgId(space) === orgId(team) &&
        (space.permissions || []).some(right => right === 'team.view' || right === 'team.manage'))
    if (!id || !scope) continue
    const isOwner = owns(team,user,catalog.openId,catalog.teamMemberships)
    entries.set('team:' + id, { key:'team:' + id, id, type:'team', workspaceId:scope.id,
      name:text(team.name || team.teamName) || '未命名球队', logo:logo(team, true), coverUrl:text(team.coverUrl || team.coverImage),
      metaLines:teamMetadata(team),
      badgeText:isOwner ? '' : '管理员', isShared:false, statusText:'', actionText:'进入球队' })
  }
  const organizers = workspaces.filter(space => space.type === 'organization' &&
    (space.permissions || []).includes('event.manage'))
  const hostedGroups = await Promise.all(organizers.map(async space => ({ space, rows:await readHosted(space) })))
  for (const { space, rows } of hostedGroups) for (const row of rows) {
    if (!active(row) || synthetic(row) || orgId(row) !== orgId(space) || !row._id) continue
    const event = decorateTournament(row), id = text(row._id)
    entries.set('tournament:' + id, { key:'tournament:' + id, id, type:'tournament', workspaceId:space.id,
      name:text(event.name || event.tournamentName) || '未命名赛事', logo:logo(event), coverUrl:text(event.coverUrl || event.coverImage),
      metaLines:eventMetadata(event),
      badgeText:'', isShared:false, statusText:text(event.statusText), actionText:'进入赛事' })
  }
  for (const event of sharedTournaments) {
    if (synthetic(event)) continue
    const id = text(event.id), scope = workspaces.find(space => space.type === 'tournament_shared' && text(space.tournamentId) === id)
    if (!id || !scope || entries.has('tournament:' + id)) continue
    entries.set('tournament:' + id, { key:'tournament:' + id, id, type:'tournament', workspaceId:scope.id,
      name:text(event.name), logo:logo(event), coverUrl:text(event.coverUrl || event.coverImage), metaLines:eventMetadata(event), badgeText:'共享', isShared:true, statusText:text(event.statusText), actionText:'进入赛事' })
  }
  return [...entries.values()].sort((a,b) => (a.type === b.type ? 0 : a.type === 'tournament' ? -1 : 1))
}
async function resolveMedia(entries, cloud) {
  const ids = [...new Set(entries.flatMap(row => [row.logo, row.coverUrl]).filter(value => /^cloud:\/\//.test(value)))]
  const urls = new Map()
  for (let start=0; start<ids.length; start+=50) {
    try {
      const response = await cloud.getTempFileURL({ fileList:ids.slice(start,start+50) })
      for (const file of response.fileList || []) if (file.tempFileURL) urls.set(file.fileID,file.tempFileURL)
    } catch (_) { /* Media failure must not block access to the workspace. */ }
  }
  const resolve = value => /^cloud:\/\//.test(value) ? urls.get(value) || '' : /^https?:\/\//.test(value) ? value : ''
  return entries.map(row => ({ ...row, logo:resolve(row.logo), coverUrl:resolve(row.coverUrl) }))
}
async function withTeamCounts(db,entries,catalog) {
  const ids=entries.filter(row=>row.type==='team').map(row=>row.id)
  if (!ids.length) return entries
  const { readByIds }=require('./data-center/reader.cjs')
  const { synthetic }=await import('./data-center/statistics.mjs')
  const aliases=new Map(ids.map(id=>[id,id])), conflicts=new Set(), ambiguousTeams=new Set()
  for (const team of catalog.teams || []) {
    if (!ids.includes(text(team._id)) || !team.teamCode) continue
    const code=text(team.teamCode)
    if (aliases.has(code) && aliases.get(code)!==text(team._id)) { conflicts.add(code);ambiguousTeams.add(aliases.get(code));ambiguousTeams.add(text(team._id)) }
    else aliases.set(code,text(team._id))
  }
  for (const code of conflicts) aliases.delete(code)
  const fields={teamId:true,teamCode:true,status:true,synthetic:true,isTest:true,syntheticDatasetId:true,syntheticKey:true,source:true,originType:true,dataKind:true}
  try {
    const groups=await Promise.all([readByIds(db,'players','teamId',ids,{fields}),readByIds(db,'players','teamCode',[...aliases.keys()],{fields})])
    const players=new Map(groups.flat().map(row=>[text(row._id),row])),counts=new Map(ids.map(id=>[id,0]))
    for (const player of players.values()) {
      if (synthetic(player) || ['archived','deleted'].includes(text(player.status).toLowerCase())) continue
      const id=player.teamId ? text(player.teamId) : aliases.get(text(player.teamCode))
      if (counts.has(id)) counts.set(id,counts.get(id)+1)
    }
    return entries.map(row=>row.type==='team'?{...row,playerCount:ambiguousTeams.has(row.id)?null:counts.get(row.id),playerCountState:ambiguousTeams.has(row.id)?'failed':'ready'}:row)
  } catch (_) {
    return entries.map(row=>row.type==='team'?{...row,playerCount:null,playerCountState:'failed'}:row)
  }
}
module.exports = { list, resolveMedia, withTeamCounts }
