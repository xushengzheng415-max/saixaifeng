'use strict'
const crypto=require('crypto')
const text=v=>String(v==null?'':v).trim()
const removed=p=>p.isDeleted===true||['deleted','archived','removed'].includes(text(p.status).toLowerCase())
function belongs(player,teamId){return !removed(player)&&String(player.teamId||player.teamCode||'')===String(teamId)}
function photo(player){const candidates=[player.photoFileID,player.photoFileId,player.photoUrl,player.photo,player.portraitFileId].map(text);return candidates.find(v=>v.startsWith('cloud://'))||candidates.find(Boolean)||''}
function references(player){
 const stablePhoto=[player.photoFileID,player.photoFileId,player.photoUrl,player.photo,player.portraitFileId].map(text).find(v=>v.startsWith('cloud://'))||''
 return {playerId:String(player._id),sourcePlayerId:String(player._id),sourceUpdatedAt:player.updateTime||player.updatedAt||null,photoFileId:stablePhoto,identityVerificationId:text(player.identityVerificationId),sourceIdentityStatus:text(player.identityStatus||player.verifyStatus||player.realNameStatus).toLowerCase()||'unknown',hasIdentityData:Boolean(player.identityVerificationId||player.identityDigest||player.identityNumberMasked||player.identityMasked||player.idCard||player.idNumber||player.idCardFront),referenceOnly:true}
}
function candidate(raw,formatted,teamId){
 const sourceIdentity=text(raw.identityStatus||raw.verifyStatus||raw.realNameStatus).toLowerCase()||'unknown'
 const linked=Boolean(raw.identityVerificationId)&&['verified','approved','complete'].includes(sourceIdentity)
 return {...formatted,photoUrl:photo(raw),rosterImportAllowed:belongs(raw,teamId),libraryIdentityStatus:sourceIdentity,hasLibraryIdentityData:references(raw).hasIdentityData,hasLibraryPhoto:Boolean(photo(raw)),statusText:linked&&formatted.identityStatus==='not_verified'?'已有核验资料，待本组审核':formatted.statusText}
}
async function resolvePhotos(cloud,players){
 const ids=[...new Set(players.filter(p=>p.rosterImportAllowed).map(p=>p.photoUrl).filter(v=>typeof v==='string'&&v.startsWith('cloud://')))]
 for(let i=0;i<ids.length;i+=50){
  try{const result=await cloud.getTempFileURL({fileList:ids.slice(i,i+50)}),urls=new Map((result.fileList||[]).filter(f=>f.tempFileURL).map(f=>[f.fileID,f.tempFileURL]));for(const p of players)if(urls.has(p.photoUrl))p.photoUrl=urls.get(p.photoUrl)}catch{for(const p of players)if(ids.slice(i,i+50).includes(p.photoUrl))p.photoLoadWarning=true}
 }
}
const one=result=>Array.isArray(result.data)?result.data[0]:result.data
const sameIds=(a,b)=>a.length===b.length&&a.map(String).sort().every((id,i)=>id===b.map(String).sort()[i])
async function persist(db,snapshot,registration){
 const id='roster-'+crypto.createHash('sha256').update([snapshot.tournamentId,snapshot.teamId,snapshot.divisionId,snapshot.version,[...snapshot.playerIds].sort().join(',')].join('|')).digest('hex').slice(0,40)
 return db.runTransaction(async tx=>{
  const relation=one(await tx.collection('tournament_teams').doc(registration._id).get())
  if(!relation||String(relation.teamId)!==snapshot.teamId||String(relation.tournamentId)!==snapshot.tournamentId||String(relation.divisionId||relation.division||'default')!==snapshot.divisionId||['removed','rejected','withdrawn','cancelled'].includes(text(relation.status)))throw Error('参赛关系已变化，请刷新名单')
  if(relation.rosterSnapshotId){
   const current=one(await tx.collection('roster_snapshots').doc(relation.rosterSnapshotId).get())
   if(current&&(String(current.teamId)!==snapshot.teamId||String(current.tournamentId)!==snapshot.tournamentId||String(current.divisionId||current.division||'')!==snapshot.divisionId))throw Error('名单组别关联异常，请先核对')
   if(current&&current.status==='submitted'&&sameIds(current.playerIds||[],snapshot.playerIds))return {snapshotId:String(current._id),idempotent:true}
   if(current&&['submitted','approved','locked'].includes(current.status))throw Error('当前名单已提交或锁定，请刷新后查看')
  }
  await tx.collection('roster_snapshots').doc(id).set({data:snapshot})
  await tx.collection('tournament_teams').doc(registration._id).update({data:{rosterSnapshotId:id,rosterStatus:'submitted',rosterPlayerCount:snapshot.playerIds.length,rosterSubmissionVersion:snapshot.version,updateTime:db.serverDate()}})
  return {snapshotId:id,idempotent:false}
 })
}
function reviewSummary(rows,formatted,context,tournament){
 const division=context.division||{},registration=context.registration||{},warnings=[]
 const limit=[division.rosterLimit,division.maxPlayersPerTeam,registration.maxPlayersPerTeam,tournament.maxPlayersPerTeam,tournament.maxPlayers].map(Number).find(n=>Number.isFinite(n)&&n>0)||null
 const deadline=division.registrationDeadline||tournament.registrationDeadline||tournament.signupDeadline
 const stamp=new Date(deadline&&typeof deadline==='object'?deadline.$date:deadline||0).getTime()
 if(limit&&rows.length>limit)warnings.push({code:'ROSTER_LIMIT_REVIEW',message:'名单人数超过配置上限，需主办方核对',limit,selected:rows.length})
 if(stamp&&Date.now()>stamp)warnings.push({code:'LATE_ROSTER_REVIEW',message:'报名截止后补交名单，需主办方核对'})
 const issues=formatted.filter(p=>p.profileStatus!=='complete').map(p=>({playerId:p.id,status:p.profileStatus,reason:p.statusText||'资料待核对'}))
 return {materialPendingCount:issues.filter(p=>p.status==='pending').length,materialExceptionCount:issues.filter(p=>p.status==='exception').length,issues,warnings}
}
module.exports={belongs,photo,references,candidate,reviewSummary,resolvePhotos,persist,sameIds}
