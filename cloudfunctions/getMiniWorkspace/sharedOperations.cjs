'use strict'
const crypto = require('crypto')
const shared = require('./sharedEvents.cjs')
const str = value => String(value == null ? '' : value).trim()
const MODULES = { registration:'event.registration', teams:'event.teams', matches:'event.matches', results:'event.results', referees:'event.referees' }
const missing = error => /collection(?: does)? not exist|ns does not exist|namespace_not_found|collection_not_exist/i.test(str(error.message) + ' ' + str(error.code))
async function rows(db, collection, where, optional=false) {
  const all=[]
  for(let offset=0;;offset+=100) {
    let page
    try { page=(await db.collection(collection).where(where).skip(offset).limit(100).get()).data || [] }
    catch(error) { if(optional && missing(error)) return []; throw error }
    all.push(...page)
    if(all.length>5000) throw new Error('赛事数据较多，请在 PC 查看完整资料')
    if(page.length<100) return all
  }
}
async function doc(db,collection,id) {
  if(!str(id)) return null
  try {
    const reply=await db.collection(collection).doc(str(id)).get()
    return Array.isArray(reply.data) ? reply.data[0] || null : reply.data || null
  } catch(error) {
    const code=str(error.code || error.errCode),message=str(error.message || error.errMsg)
    if(/^(?:DATABASE_)?DOCUMENT_(?:NOT_EXIST|NOT_FOUND)$/i.test(code) || /(?:^|\s)document(?:\s+with\s+_id\s+\S+)?\s+(?:does not exist|not exist|not found)/i.test(message)) return null
    throw error
  }
}
async function authorized(db,identity,event,right) {
  const grant=(await shared.list(db,identity.user._id)).find(item=>item.id===str(event.tournamentId))
  if(!grant || !grant.permissions.includes(right)) throw new Error('该赛事未授权此操作，或授权已停用，请返回赛事列表')
  return grant
}
async function related(db,collection,id,tournamentId) {
  const item=await doc(db,collection,id)
  if(!item || str(item.tournamentId)!==tournamentId) throw new Error('记录不存在或不属于当前赛事')
  return item
}
async function currentGrant(tx,identity,grant,right) {
  const row=await doc(tx,'tournament_staff_grants',grant.grantId),event=await doc(tx,'tournaments',grant.id)
  if(!row || row.status!=='active' || str(row.userId)!==str(identity.user._id) || str(row.tournamentId)!==grant.id || str(row.orgId)!==grant.orgId || !(row.permissions || []).includes(right) || !event || str(event.orgId || event.organizationId)!==grant.orgId) throw new Error('赛事授权已变化，请返回赛事列表')
}
function participantIds(registration,snapshots) {
  const getId=item=>str(typeof item==='string'?item:item.playerId || item._id || item.id)
  return new Set([].concat(registration.players || [],registration.playerIds || [],...snapshots.map(row=>[].concat(row.players || [],row.playerIds || []))).map(getId).filter(Boolean))
}
function refereeIds(match) {
  const values=[match.refereeId,match.operationRefereeId,match.refereeRecordKeeperId]
  Object.values(match.refereeCrew || {}).forEach(item=>values.push(typeof item==='string'?item:item && (item._id || item.refereeId || item.id)))
  return [...new Set(values.map(str).filter(Boolean))]
}
function statusLabel(value) {
  return ({approved:'已通过',pending:'待审核',submitted:'待审核',rejected:'已驳回',returned:'已退回',confirmed:'已确认',invited:'待认领',pending_claim:'待认领',active:'有效',completed:'已结束',finished:'已结束',ongoing:'进行中',live:'进行中',in_progress:'进行中',playing:'进行中',cancelled:'已取消',withdrawn:'已退出',under_review:'待核查',archived:'已归档'})[str(value)] || str(value) || '待确认'
}
function matchView(item,teams) {
  const home=teams.get(str(item.homeTeamId)) || {}, away=teams.get(str(item.awayTeamId)) || {}
  const started=!['pending','upcoming','scheduled',''].includes(str(item.status))
  const recordLocked=Boolean(item.refereeRecordLocked || item.refereeRecord || item.refereeReport || item.refereeReportSubmittedAt || item.executionState==='recording' || ['draft','submitted','approved','archived'].includes(str(item.refereeReportStatus)) || ['under_review','returned','archived'].includes(str(item.refereeReviewStatus)))
  return {id:str(item._id),name:(home.name || item.homeTeamName || '主队')+' VS '+(away.name || item.awayTeamName || '客队'),
    homeTeamId:str(item.homeTeamId),awayTeamId:str(item.awayTeamId),homeName:home.name || item.homeTeamName || '主队',awayName:away.name || item.awayTeamName || '客队',
    homeLogo:str(home.logoTransparent || home.logoUrl || home.logo),awayLogo:str(away.logoTransparent || away.logoUrl || away.logo),
    date:str(item.matchDate || item.date).slice(0,10),time:str(item.matchTime || item.time || item.startTime).slice(0,5),venue:str(item.venue || item.location),
    recordLocked,status:['scheduled','pending','upcoming','checked_in','not_started',''].includes(str(item.status)) ? '待开始' : statusLabel(item.status),score:started && item.homeScore!=null && item.awayScore!=null ? item.homeScore+' : '+item.awayScore : '— : —',
    reviewStatus:statusLabel(item.refereeReviewStatus),canReview:item.refereeReviewStatus==='under_review' && Boolean(item.refereeRecordLocked && item.refereeRecord),
    canEdit:!recordLocked && !['completed','finished','archived'].includes(str(item.status)),canSupplement:!recordLocked && ['completed','finished'].includes(str(item.status)),
    revision:Number(item.matchEventRevision || 0),recordRevision:require('./sharedRecording.cjs').revision(item)}
}
function reviewRevision(match) { return crypto.createHash('sha256').update(JSON.stringify([match.refereeReviewStatus,match.refereeRecordLocked,match.refereeRecord,match.matchEventRevision,match.events,match.homeScore,match.awayScore])).digest('hex') }
async function media(cloud,items) {
  const ids=[...new Set(items.flatMap(item=>[item.logo,item.homeLogo,item.awayLogo,item.photoUrl]).filter(value=>str(value).startsWith('cloud://')))]
  if(!ids.length) return items
  const urls=new Map()
  for(let i=0;i<ids.length;i+=50) {
    const response=await cloud.getTempFileURL({fileList:ids.slice(i,i+50)})
    ;(response.fileList || []).forEach(item=>{if(item.tempFileURL) urls.set(item.fileID,item.tempFileURL)})
  }
  return items.map(item=>{const value={...item}; for(const key of ['logo','homeLogo','awayLogo','photoUrl']) if(str(value[key]).startsWith('cloud://')) value[key]=urls.get(value[key]) || ''; return value})
}
async function teamMap(db,registrations) {
  const map=new Map()
  for(const id of [...new Set(registrations.map(item=>str(item.teamId)).filter(Boolean))]) {
    const item=await doc(db,'teams',id)
    if(item) map.set(id,item)
  }
  return map
}
// The channel token remains server-side, lasts at most 90 seconds and is removed
// after the existing PC service completes. It never grants new module rights.
async function relay(db,cloud,identity,grant,name,params) {
  const token=crypto.randomBytes(32).toString('hex')
  const session=await db.collection('auth_sessions').add({data:{userId:identity.user._id,activeOrgId:grant.orgId,active:true,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+90000),source:'mini_shared_operation',tournamentId:grant.id,grantId:grant.grantId,allowedFunction:name,miniOperation:str(params.miniOperation),recordRevision:str(params.miniRecordRevision),createTime:db.serverDate()}})
  try {
    const response=await cloud.callFunction({name,data:{...params,tournamentId:grant.id,__staffTournamentId:grant.id,__actorUserId:identity.user._id,__actorOrgId:grant.orgId,__authToken:token}})
    const result=response.result || {}
    if(!result.success) throw new Error(result.message || result.error || '操作失败，请刷新后重试')
    delete result.__notificationRelay
    return result
  } finally { await db.collection('auth_sessions').doc(session._id).remove().catch(()=>{}) }
}
async function run(db,cloud,identity,event,formatPlayer) {
  const mode=str(event.mode), operation=str(event.operation || 'list'), right=MODULES[mode]
  if(!right) throw new Error('手机未开放此模块')
  const grant=await authorized(db,identity,event,right), tournamentId=grant.id
  if(operation==='list') {
    const registrations=(await rows(db,'tournament_teams',{tournamentId})).filter(row=>!['removed','deleted','replaced','invite_cancelled'].includes(str(row.status))), teams=await teamMap(db,registrations)
    let items=[]
    if(mode==='teams') items=[...teams.values()].map(item=>({id:str(item._id),name:str(item.name || item.teamName),logo:str(item.logoTransparent || item.logoUrl || item.logo),status:'查看资料',detail:str(item.cityName || item.city),description:str(item.description),shortName:str(item.shortName),teamCode:str(item.teamCode || item.code)}))
    if(mode==='registration') items=registrations.map(item=>({id:str(item._id),name:str((teams.get(str(item.teamId)) || {}).name || item.teamName) || '球队资料待补齐',status:statusLabel(item.status),detail:str(item.divisionName),missingTeam:!teams.has(str(item.teamId)),canReview:teams.has(str(item.teamId)) && str(item.status)==='pending'}))
    if(mode==='matches' || mode==='results') items=(await rows(db,'matches',{tournamentId})).filter(row=>row.deleted!==true && row.isDeleted!==true && !['removed','deleted'].includes(str(row.status))).map(item=>matchView(item,teams)).sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time))
    if(mode==='referees') {
      const direct=await rows(db,'referees',{tournamentId},true), relations=await rows(db,'tournament_referees',{tournamentId},true)
      const records=new Map(direct.map(item=>[str(item._id),{item,relation:null,assigned:false}]))
      for(const relation of relations) { const id=str(relation.refereeId); if(id && !records.has(id)) { const item=await doc(db,'referees',id); if(item) records.set(id,{item,relation}) } }
      for(const match of await rows(db,'matches',{tournamentId})) for(const id of refereeIds(match)) {if(records.has(id)){records.get(id).assigned=true;continue} const item=await doc(db,'referees',id);if(item)records.set(id,{item,relation:null,assigned:true})}
      items=[...records.values()].map(({item,relation,assigned})=>({id:str(item._id),name:str(item.name || item.realName),status:statusLabel(item.status),detail:item.temporaryReferee ? '赛事临时裁判' : '持证裁判',availability:str((relation || item).availabilityStatus),canConfirm:item.temporaryReferee===true && item.temporaryClaimStatus==='claimed_pending_review' && item.wechatBound===true,canManage:Boolean(relation || item.eventScoped===true || assigned || str(item.tournamentId)===tournamentId),relationId:str(relation && relation._id)}))
    }
    const missingTeams=[...new Set(registrations.map(item=>str(item.teamId)).filter(id=>id && !teams.has(id)))]
    return {success:true,items:await media(cloud,items),warning:mode==='registration' && missingTeams.length ? '部分球队资料已删除，请主办方在 PC 补齐关联；其他报名可继续查看。' : ''}
  }
  if(mode==='teams' && ['detail','players','playerDetail'].includes(operation)) {
    const registrations=(await rows(db,'tournament_teams',{tournamentId,teamId:str(event.teamId || event.id)})).filter(row=>!['removed','deleted','replaced','invite_cancelled'].includes(str(row.status)))
    if(!registrations.length) throw new Error('球队不属于当前赛事')
    const team=await doc(db,'teams',event.teamId || event.id)
    if(!team) throw new Error('球队资料不存在')
    if(operation!=='detail') {
      const snapshots=await rows(db,'roster_snapshots',{tournamentId,teamId:str(team._id)},true)
      const eligible=new Set(registrations.flatMap(row=>[...participantIds(row,snapshots)]))
      const archived=new Map()
      snapshots.forEach(row=>(row.players || []).forEach(player=>{const id=str(player.playerId || player._id || player.id);if(id)archived.set(id,player)}))
      registrations.forEach(row=>(row.players || []).forEach(player=>{if(typeof player==='object'){const id=str(player.playerId || player._id || player.id);if(id && !archived.has(id))archived.set(id,player)}}))
      const source=new Map()
      ;(await rows(db,'players',{teamId:str(team._id)})).filter(player=>eligible.has(str(player._id)) || [player.tournamentId,player.registrationTournamentId,player.sourceTournamentId].some(id=>str(id)===tournamentId)).forEach(player=>source.set(str(player._id),player))
      archived.forEach((player,id)=>source.set(id,{...(source.get(id) || {}),...player,_id:id}))
      let players=[...source.values()].map(player=>({id:str(player._id),name:str(player.name || player.playerName),birthDate:str(player.birthDate || player.birthday),photoUrl:str(player.photoUrl || player.photo || player.photoFileID || player.photoFileId),jerseyNumber:str(player.jerseyNumber),jerseyName:str(player.jerseyName),position:str(player.position),height:player.height ?? null,weight:player.weight ?? null,gender:str(player.gender),strongFoot:str(player.strongFoot),nationality:str(player.nationality),identityStatus:str(player.identityVerificationStatus || player.identityStatus),portraitStatus:str(player.photoProcessingStatus)}))
      players=players.map(player=>{const formatted=formatPlayer ? formatPlayer({...player,_id:player.id}) : {};return {...player,profileStatus:formatted.profileStatus || 'pending',statusText:formatted.statusText || '待核对',profileStatusText:formatted.statusText || '待核对'}})
      players=await media(cloud,players)
      const teamView=(await media(cloud,[{id:str(team._id),name:str(team.name || team.teamName),logo:str(team.logoTransparent || team.logoUrl || team.logo),code:str(team.teamCode || team.code)}]))[0]
      if(operation==='playerDetail') {
        const player=players.find(player=>player.id===str(event.playerId))
        if(!player) throw new Error('球员不属于本赛事参赛名单')
        return {success:true,player,team:teamView,canManage:false}
      }
      return {success:true,players,team:teamView,canManage:false,counts:{}}
    }
    return {success:true,item:{id:str(team._id),name:str(team.name),shortName:str(team.shortName),teamCode:str(team.teamCode || team.code),city:str(team.cityName || team.city),description:str(team.description),contactName:str(team.contactName),phoneMasked:str(team.contactPhone).replace(/^(\d{3})\d+(\d{4})$/,'$1****$2')}}
  }
  if(mode==='registration' && operation==='detail') {
    const item=await related(db,'tournament_teams',event.id,tournamentId)
    const snapshots=await rows(db,'roster_snapshots',{tournamentId,teamId:str(item.teamId)},true)
    const team=await doc(db,'teams',item.teamId),canReviewPlayers=grant.permissions.includes('event.teams')
    const eligible=participantIds(item,snapshots)
    const players=canReviewPlayers ? (await rows(db,'players',{teamId:str(item.teamId)})).filter(player=>eligible.has(str(player._id)) || [player.tournamentId,player.registrationTournamentId,player.sourceTournamentId].some(id=>str(id)===tournamentId)).map(player=>({id:str(player._id),name:str(player.name),jerseyNumber:str(player.jerseyNumber),birthDate:str(player.birthDate || player.birthday),qualification:str(player.identityVerificationStatus || '待核对'),status:player.organizerReviewStatus==='approved'?'已审核':'未审核',canApprove:player.organizerReviewStatus!=='approved'})) : []
    return {success:true,item:{id:str(item._id),name:str(item.teamName || team && team.name) || '球队资料待补齐',status:statusLabel(item.status),detail:str(item.divisionName),reason:!team ? '球队资料已删除，请主办方在 PC 补齐后再审核。' : str(item.reviewReason),canReview:Boolean(team) && str(item.status)==='pending',canReviewPlayers:Boolean(team) && canReviewPlayers,players,rosters:snapshots.map(row=>({id:str(row._id),status:statusLabel(row.status),players:(row.players || []).map(player=>({id:str(player.playerId || player._id || player.id),name:str(player.name || player.playerName),jerseyNumber:str(player.jerseyNumber),qualification:str(player.status || player.identityVerificationStatus)}))}))}}
  }
  if(mode==='registration' && operation==='approvePlayer') {
    await authorized(db,identity,event,'event.teams')
    const item=await related(db,'tournament_teams',event.id,tournamentId)
    const player=await doc(db,'players',event.playerId)
    if(!player || str(player.teamId)!==str(item.teamId)) throw new Error('球员不属于本报名球队')
    const snapshots=await rows(db,'roster_snapshots',{tournamentId,teamId:str(item.teamId)},true)
    if(!participantIds(item,snapshots).has(str(player._id)) && ![player.tournamentId,player.registrationTournamentId,player.sourceTournamentId].some(id=>str(id)===tournamentId)) throw new Error('球员未关联本赛事报名资料，不能审核俱乐部私有球员')
    return relay(db,cloud,identity,grant,'organizerClaimInvite',{action:'approveTournamentPlayer',teamId:str(item.teamId),divisionId:str(item.divisionId || 'default'),playerId:str(event.playerId)})
  }
  if(mode==='registration' && operation==='review') {
    const item=await related(db,'tournament_teams',event.id,tournamentId)
    if(!await doc(db,'teams',item.teamId)) throw new Error('球队资料已删除，请主办方在 PC 补齐后再审核')
    if(!['pending','submitted'].includes(str(item.status))) throw new Error('报名状态已变更，请刷新后审核')
    if(!['approved','rejected'].includes(str(event.decision))) throw new Error('审核决定无效')
    if(event.decision==='rejected' && !str(event.reason)) throw new Error('请填写驳回原因')
    return relay(db,cloud,identity,grant,'tournamentRegistrationFlow',{action:'reviewRegistration',registrationId:str(event.id),decision:event.decision,reason:str(event.reason).slice(0,300)})
  }
  if(mode==='registration' && operation==='source') {
    await authorized(db,identity,event,'event.teams')
    const item=await related(db,'tournament_teams',event.id,tournamentId)
    return relay(db,cloud,identity,grant,'organizerClaimInvite',{action:'getTeamRegistrationSource',teamId:str(item.teamId),divisionId:str(item.divisionId || 'default')})
  }
  if(mode==='referees') {
    if(operation==='invite') return relay(db,cloud,identity,grant,'tournamentRegistrationFlow',{action:'createRefereeFollowInvite',previewMode:false})
    if(operation==='add') return relay(db,cloud,identity,grant,'tournamentRegistrationFlow',{action:'createTemporaryRefereeClaim',name:str(event.name),phone:str(event.phone),reason:str(event.reason)})
    const referee=await doc(db,'referees',event.id)
    if(operation==='confirm') {
      if(!referee || str(referee.tournamentId)!==tournamentId) throw new Error('裁判不属于当前赛事')
      return relay(db,cloud,identity,grant,'tournamentRegistrationFlow',{action:'reviewTemporaryRefereeClaim',refereeId:str(event.id)})
    }
    if(operation==='availability') {
      if(!['available','unavailable'].includes(str(event.value))) throw new Error('可用状态无效')
      const relations=await rows(db,'tournament_referees',{tournamentId,refereeId:str(event.id)},true)
      const target=relations[0] || (referee && referee.eventScoped===true && str(referee.tournamentId)===tournamentId ? referee : null)
      if(!target) {
        const assigned=(await rows(db,'matches',{tournamentId})).find(match=>refereeIds(match).includes(str(event.id)))
        if(!referee || str(referee.tournamentId)!==tournamentId && !assigned) throw new Error('该裁判没有本赛事管理关系，不能修改全平台资格')
        const id=crypto.createHash('sha256').update(tournamentId+':'+event.id).digest('hex')
        await db.runTransaction(async tx=>{await currentGrant(tx,identity,grant,right);if(assigned){const match=await doc(tx,'matches',assigned._id);if(!match || !refereeIds(match).includes(str(event.id)))throw new Error('裁判指派已变化，请刷新')}await tx.collection('tournament_referees').doc(id).set({data:{tournamentId,orgId:grant.orgId,refereeId:str(event.id),availabilityStatus:event.value,updatedBy:identity.user._id,updateTime:db.serverDate()}})})
        return {success:true,message:'本赛事裁判可用状态已更新'}
      }
      const collection=relations.length ? 'tournament_referees' : 'referees'
      await db.runTransaction(async tx=>{await currentGrant(tx,identity,grant,right); const fresh=await doc(tx,collection,target._id); if(!fresh || str(fresh.tournamentId)!==tournamentId) throw new Error('赛事关系已变化，请刷新'); await tx.collection(collection).doc(target._id).update({data:{availabilityStatus:event.value,updateTime:db.serverDate()}}); await tx.collection('registration_audit_logs').add({data:{action:'mini_shared_referee_availability',tournamentId,actorUserId:identity.user._id,refereeId:str(event.id),value:event.value,createTime:db.serverDate()}})})
      return {success:true,message:'裁判可用状态已更新'}
    }
  }
  if(mode==='matches' || mode==='results') {
    const match=await related(db,'matches',event.id,tournamentId)
    if(mode==='matches' && ['lineup','start','finish','reportTicket','recognizeReport','confirmReport'].includes(operation)) return require('./sharedRecording.cjs').run({db,cloud,identity,event,grant,match,relay,rows,doc,authorized})
    if(operation==='detail') {
      const registrations=await rows(db,'tournament_teams',{tournamentId}), teams=await teamMap(db,registrations)
      const view=matchView(match,teams)
      const sources=[]
      const lineup=match.lineup || match.lineups || {}
      for(const side of ['home','away']) { const body=lineup[side] || {}; for(const player of [].concat(body.starters || [],body.substitutes || [])) sources.push({...player,teamSide:side,teamId:side==='home' ? match.homeTeamId : match.awayTeamId}) }
      const snapshots=await rows(db,'match_lineup_snapshots',{matchId:str(match._id)},true)
      for(const snapshot of snapshots) {
        if(str(snapshot.tournamentId)!==tournamentId || ![str(match.homeTeamId),str(match.awayTeamId)].includes(str(snapshot.teamId))) continue
        const side=str(snapshot.teamId)===str(match.homeTeamId) ? 'home' : 'away'
        for(const player of [].concat(snapshot.starters || [],snapshot.substitutes || [],snapshot.players || [])) sources.push({...player,teamSide:side,teamId:snapshot.teamId})
      }
      const players=mode==='matches' ? await require('./sharedRecording.cjs').pool(db,match,rows,doc) : []
      return {success:true,item:{...view,players,rawStatus:str(match.status),lineups:match.lineups || {},reviewRevision:reviewRevision(match),report:str(match.refereeRecord && (match.refereeRecord.reportText || match.refereeRecord.report) || match.refereeReport),events:(match.events || []).map(row=>({id:str(row.eventId || row._id),type:str(row.type),minute:row.minute,playerName:str(row.playerName),teamName:str(row.teamName),outPlayerName:str(row.outPlayerName || row.assistName)}))}}
    }
    if(mode==='matches' && operation==='save') {
      const data={matchDate:str(event.date),matchTime:str(event.time),venue:str(event.venue).slice(0,100)}
      if(!/^\d{4}-\d{2}-\d{2}$/.test(data.matchDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.matchTime) || !data.venue) throw new Error('请填写有效日期、时间和场地')
      if(match.refereeRecordLocked || ['completed','finished','archived'].includes(str(match.status))) throw new Error('比赛已结束或裁判记录已锁定，不能修改基本信息')
      return relay(db,cloud,identity,grant,'updateMatch',{matchId:match._id,data,miniOperation:'save'})
    }
    if(mode==='matches' && operation==='addEvent') {
      if(match.refereeRecordLocked || !['ongoing','live','completed','finished'].includes(str(match.status))) throw new Error('请先选择首发并开始比赛；裁判已接管的比赛不可录入')
      if(Number(event.revision)!==Number(match.matchEventRevision || 0)) throw new Error('比赛事件已变化，请重新打开比赛')
      const detail=await run(db,cloud,identity,{...event,operation:'detail'}), player=detail.item.players.find(row=>row.id===str(event.playerId))
      if(!player) throw new Error('请从本场已保存阵容中选择球员')
      const type=str(event.type)
      if(!['goal','own_goal','yellow_card','red_card','penalty_scored','penalty_missed','substitution'].includes(type)) throw new Error('比赛事件类型无效')
      const minute=Number(event.minute)
      if(!Number.isInteger(minute) || minute<0 || minute>180) throw new Error('请填写 0 至 180 的比赛分钟')
      const added={eventId:crypto.randomBytes(16).toString('hex'),type,minute,playerId:player.id,playerName:player.name,playerNumber:player.jerseyNumber,teamId:player.teamId,teamSide:player.teamSide,teamName:player.teamSide==='home' ? detail.item.homeName : detail.item.awayName}
      if(type==='substitution') { const out=detail.item.players.find(row=>row.id===str(event.outPlayerId) && row.teamId===player.teamId && row.id!==player.id); if(!out) throw new Error('请在同队阵容中选择换下球员'); Object.assign(added,{inPlayerId:player.id,outPlayerId:out.id,assistPlayerId:out.id,assistName:out.name,assistNumber:out.jerseyNumber}) }
      return relay(db,cloud,identity,grant,'updateMatch',{matchId:match._id,miniOperation:'events',expectedEventRevision:Number(event.revision),data:{events:(match.events || []).concat([added])}})
    }
    if(mode==='results' && operation==='review') {
      if(!['archive','return'].includes(str(event.decision))) throw new Error('核查决定无效')
      const reason=str(event.reason).slice(0,300)
      if(event.decision==='return' && !reason) throw new Error('请填写退回原因')
      await db.runTransaction(async tx=>{
        await currentGrant(tx,identity,grant,right)
        const fresh=await related(tx,'matches',match._id,tournamentId)
        if(reviewRevision(fresh)!==str(event.reviewRevision)) throw new Error('裁判记录已更新，请刷新后核查')
        if(!fresh.refereeRecordLocked || !fresh.refereeRecord || fresh.refereeReviewStatus!=='under_review') throw new Error('裁判记录不在待核查状态')
        const record={...fresh.refereeRecord}, now=new Date(), actor=str(identity.user.nickname || identity.user.nickName || identity.user._id)
        const state=event.decision==='archive' ? 'archived' : 'returned'
        const update={refereeReviewStatus:state,refereeRecord:record,refereeWorkflowLogs:(fresh.refereeWorkflowLogs || []).slice(-100).concat([{action:state==='archived' ? 'archive_referee_record' : 'return_referee_record',actorUserId:identity.user._id,actor,at:now,detail:{reason,fields:['event_player']}}])}
        record.reviewStatus=state
        if(state==='archived') {record.archivedAt=now;record.archivedBy=actor;update.refereeRecordArchivedAt=db.serverDate()}
        else { const request={reason,fields:['event_player'],returnedAt:now,returnedBy:actor,returnedByUserId:identity.user._id}; record.returnRequest=request;update.returnRequest=request }
        await tx.collection('matches').doc(match._id).update({data:update})
      })
      if(event.decision==='archive') { try {await relay(db,cloud,identity,grant,'resultCenter',{action:'resolvePairingSources'})} catch(error) {return {success:true,message:'赛果已归档；淘汰赛站位同步失败，请在 PC 重试'}} }
      return {success:true,message:event.decision==='archive' ? '赛果已确认归档' : '已退回裁判限定修正'}
    }
  }
  throw new Error('手机未开放此操作')
}
module.exports={run}
