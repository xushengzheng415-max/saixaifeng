'use strict'
const crypto=require('crypto')
const {revision}=require('./sharedRecording.cjs')
const text=value=>String(value==null?'':value).trim()
const available=['scheduled','pending','upcoming','checked_in','not_started','','finished','completed']
async function run(context){
  const {db,cloud,identity,event,grant,match,relay,doc,authorized}=context
  for(const right of ['event.teams','event.results'])await authorized(db,identity,event,right)
  if(!available.includes(text(match.status)) || match.refereeRecordLocked || match.refereeRecord || match.refereeReport || match.refereeSubmittedAt || match.refereeReportSubmittedAt || match.executionState==='recording')throw new Error('裁判已接管或比赛记录已锁定，不能覆盖')
  if(!match.homeTeamId || !match.awayTeamId)throw new Error('请先确认本场双方球队')
  if(event.operation==='reportTicket'){
    const path='match-reports/'+match._id+'/mini-'+crypto.randomBytes(20).toString('hex')+'.jpg'
    const row=await db.collection('match_report_imports').add({data:{tournamentId:grant.id,matchId:match._id,userId:identity.user._id,orgId:grant.orgId,path,status:'awaiting_upload',recordRevision:revision(match),revision:Number(match.matchEventRevision || 0),expiresAt:new Date(Date.now()+86400000),createTime:db.serverDate()}})
    return {success:true,id:row._id,path,maxBytes:3*1024*1024}
  }
  const draft=await doc(db,'match_report_imports',event.draftId)
  const expires=draft && new Date(draft.expiresAt && draft.expiresAt.$date || draft.expiresAt).getTime()
  if(!draft || text(draft.userId)!==text(identity.user._id) || text(draft.orgId)!==text(grant.orgId) || text(draft.matchId)!==text(match._id) || text(draft.tournamentId)!==text(grant.id) || !Number.isFinite(expires) || expires<Date.now())throw new Error('识别草稿已失效，请重新上传')
  if(event.operation==='recognizeReport'){
    const fileId=text(event.fileId)
    if(draft.status==='confirmed' || !fileId.startsWith('cloud://') || !fileId.endsWith('/'+draft.path) || fileId.includes('?') || fileId.includes('..'))throw new Error('照片不属于本场识别任务，请重新上传')
    if(text(draft.recordRevision)!==revision(match))throw new Error('比赛或阵容已变化，请重新识别')
    const result=await relay(db,cloud,identity,grant,'webLoginApi',{action:'recognizeRefereeReport',matchId:match._id,fileId,blankRoleAsBench:event.blankRoleAsBench===true,circledGoals:event.circledGoals===true})
    for(const right of ['event.matches','event.teams','event.results'])await authorized(db,identity,event,right)
    const fresh=await doc(db,'matches',match._id)
    if(!fresh || revision(fresh)!==draft.recordRevision || Number(result.data && result.data.expectedEventRevision)!==draft.revision)throw new Error('比赛已变化，请重新打开核对')
    await db.collection('match_report_imports').doc(draft._id).update({data:{status:'recognized',fileId,recognition:result.data,updateTime:db.serverDate()}})
    return result
  }
  if(event.operation==='confirmReport'){
    if(draft.status==='confirmed')return {success:true,alreadyImported:true,message:'这张裁判表已录入'}
    if(draft.status!=='recognized' || !draft.recognition || !draft.fileId)throw new Error('请先上传并识别裁判表')
    const recognized=draft.recognition
    if((match.paperReportImports || []).some(row=>row.imageHash===recognized.evidence.imageHash))return {success:true,alreadyImported:true,message:'这张裁判表已录入'}
    if(text(draft.recordRevision)!==revision(match))throw new Error('比赛或阵容已变化，请重新识别核对')
    const result=await relay(db,cloud,identity,grant,'webLoginApi',{action:'confirmRefereeReport',matchId:match._id,teams:event.teams,score:event.score,substitutions:event.substitutions,evidence:recognized.evidence,proof:recognized.proof,expectedEventRevision:draft.revision})
    await db.collection('match_report_imports').doc(draft._id).update({data:{status:'confirmed',confirmedBy:identity.user._id,confirmedAt:db.serverDate()}})
    return {...result,message:result.alreadyImported?'这张裁判表已录入':'阵容、事件和赛果已保存'}
  }
  throw new Error('裁判表操作无效')
}
module.exports={run}
