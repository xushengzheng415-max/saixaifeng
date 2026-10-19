'use strict'
const crypto=require('crypto')
const RIGHTS=['event.matches','event.teams','event.results']
const text=value=>String(value==null?'':value).trim()
async function doc(db,collection,id){const reply=await db.collection(collection).doc(text(id)).get();return Array.isArray(reply.data)?reply.data[0]:reply.data}
async function authenticate(db,event,session,user){
  const denied=()=>({success:false,code:'MINI_REPORT_SCOPE_DENIED',error:'裁判表识别授权已变化，请重新进入比赛'})
  if(session.source!=='mini_shared_operation' || session.allowedFunction!=='webLoginApi' || !['recognizeRefereeReport','confirmRefereeReport'].includes(event.action) || session.allowedAction!==event.action || text(session.targetMatchId)!==text(event.matchId) || !text(event.matchId) || text(session.tournamentId)!==text(event.staffTournamentId) || event.tournamentId && text(event.tournamentId)!==text(session.tournamentId))return denied()
  const [grant,tournament,match]=await Promise.all([doc(db,'tournament_staff_grants',session.grantId),doc(db,'tournaments',session.tournamentId),doc(db,'matches',event.matchId)])
  if(!user || text(user._id)!==text(session.userId) || !grant || grant.status!=='active' || text(grant.userId)!==text(user._id) || text(grant.orgId)!==text(session.activeOrgId) || text(grant.tournamentId)!==text(session.tournamentId) || RIGHTS.some(right=>!(grant.permissions || []).includes(right)) || !tournament || text(tournament.orgId || tournament.organizationId)!==text(grant.orgId) || !match || text(match.tournamentId)!==text(grant.tournamentId))return denied()
  if(match.deleted || match.isDeleted || ['cancelled','canceled','deleted','removed','replaced','superseded','void','ongoing','live','in_progress','playing','archived','postponed'].includes(text(match.status).toLowerCase()) || ['cancelled','canceled','removed','replaced','superseded','void'].includes(text(match.scheduleStatus).toLowerCase()))return {success:false,error:'当前比赛不能录入裁判表，请返回比赛列表'}
  return {success:true,session,user:{...user,orgId:text(grant.orgId),organizationConflict:false},userId:text(user._id),orgId:text(grant.orgId),miniPaper:true}
}
async function relayImport(db,cloud,identity,params){
  if(!identity.miniPaper || params.action!=='importPaperReport' || text(params.matchId)!==text(identity.session.targetMatchId))throw new Error('手机裁判表保存入口未授权')
  const match=await doc(db,'matches',params.matchId)
  const recordRevision=crypto.createHash('sha256').update(JSON.stringify([match.lineups || {},match.status,match.executionState,match.refereeRecordLocked,match.refereeRecord,Number(match.matchEventRevision || 0)])).digest('hex')
  const token=crypto.randomBytes(32).toString('hex')
  const session=await db.collection('auth_sessions').add({data:{userId:identity.userId,activeOrgId:identity.orgId,active:true,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+90000),source:'mini_shared_operation',tournamentId:text(match.tournamentId),grantId:identity.session.grantId,allowedFunction:'updateMatch',miniOperation:'paperImport',recordRevision,createTime:db.serverDate()}})
  try{return (await cloud.callFunction({name:'updateMatch',data:{...params,__authToken:token,__actorUserId:identity.userId,__actorOrgId:identity.orgId,__staffTournamentId:text(match.tournamentId)}})).result || {success:false,error:'裁判表未保存，请重试'}}
  finally{await db.collection('auth_sessions').doc(session._id).remove()}
}
module.exports={authenticate,relayImport,RIGHTS}
