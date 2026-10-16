'use strict'
const crypto=require('node:crypto'),{readAll}=require('./reader.cjs')
const text=v=>String(v??'').trim(),hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})}
const fields=['appearances','starts','minutesPlayed','goals','supportDrops','missing_match','other']
async function document(db,id){try{const r=await db.collection('platform_settings').doc(id).get();return Array.isArray(r.data)?r.data[0]:r.data}catch(e){if(/document.*(not exist|does not exist)|DOCUMENT_NOT_EXIST/i.test(e.message||''))return null;throw e}}
function playerAccess(actor,playerId){if(!actor?.actorId||(!actor.platformOwner&&actor.playerId!==playerId))fail('POINTS_APPEAL_FORBIDDEN','无权查看或申诉该球员积分')}
const dto=row=>({id:row._id,playerId:row.playerId,playerName:row.playerName,teamName:row.teamName,matchId:row.matchId,matchName:row.matchName,metric:row.metric,reason:row.reason,expected:row.expected,status:row.status,submittedAt:row.submittedAt,reply:row.reply||'',resolution:row.resolution||'',resolvedAt:row.resolvedAt||null,revision:row.revision})
async function submit(db,actor,event,ledger,player){
  const playerId=text(player._id||player.id);playerAccess(actor,playerId)
  if(ledger.playerId!==playerId||ledger.status!=='ready')fail('POINTS_APPEAL_LEDGER_REQUIRED','积分明细未就绪，请重新加载')
  const metric=text(event.metric),reason=text(event.reason),requestId=text(event.requestId),matchId=text(event.matchId),expected=text(event.expected).slice(0,120)
  if(!fields.includes(metric)||reason.length<4||reason.length>1000||!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId))fail('POINTS_APPEAL_INPUT','请选择积分项目并填写至少4字的说明')
  const match=ledger.rows.find(row=>row.matchId===matchId)
  if(matchId&&!match)fail('POINTS_APPEAL_MATCH_FORBIDDEN','该场未在当前个人明细中，请选择“遗漏比赛”并描述比赛')
  const matchName=match?.matchName||text(event.matchDescription).slice(0,120)||(metric==='supportDrops'?'应援积分':'职业生涯积分')
  const actorHash=hash(actor.actorId),id='points-appeal-'+hash([actorHash,requestId]),activeId='points-appeal-active-'+hash([playerId,matchId||matchName,metric]),fingerprint=hash([playerId,matchId,matchName,metric,reason,expected])
  let reply
  await db.runTransaction(async tx=>{
    const old=await document(tx,id)
    if(old){if(old.requestDigest!==fingerprint)fail('POINTS_APPEAL_CONFLICT','提交内容已变化，请重新提交');reply={success:true,appeal:dto(old),duplicate:true};return}
    const active=await document(tx,activeId),pending=active?.appealId?await document(tx,active.appealId):null
    if(pending?.status==='pending'){reply={success:true,appeal:dto(pending),duplicate:true};return}
    const row={recordType:'player_points_appeal',playerId,playerName:text(player.name),teamName:text(player.teamName),matchId,matchName,metric,reason,expected,status:'pending',submittedAt:new Date().toISOString(),submittedBy:actorHash,channel:text(actor.channel),ledgerRevision:ledger.revision,viewedRevision:text(event.ledgerRevision),pointsAtSubmission:ledger.points,requestDigest:fingerprint,activeId,revision:1}
    await tx.collection('platform_settings').doc(id).set({data:row});await tx.collection('platform_settings').doc(activeId).set({data:{recordType:'player_points_appeal_active',appealId:id}});reply={success:true,appeal:dto({_id:id,...row}),duplicate:false}
  });return reply
}
async function list(db,actor,event={}){
  const playerId=text(actor.platformOwner?event.playerId:actor.playerId);if(!actor.platformOwner)playerAccess(actor,playerId)
  if(actor.platformOwner&&!actor.actorId)fail('POINTS_APPEAL_FORBIDDEN','请重新登录')
  const status=text(event.status);if(status&&!['pending','resolved','rejected'].includes(status))fail('POINTS_APPEAL_INPUT','申诉状态无效')
  let rows=await readAll(db,'platform_settings',{recordType:'player_points_appeal',...(playerId?{playerId}:{}),...(status?{status}:{})});const cursor=text(event.cursor),keyword=text(event.keyword).slice(0,80).toLocaleLowerCase();if(keyword)rows=rows.filter(row=>[row.playerName,row.teamName,row.matchName,row.reason].some(value=>text(value).toLocaleLowerCase().includes(keyword)))
  const sorted=rows.sort((a,b)=>text(b.submittedAt).localeCompare(text(a.submittedAt))||text(b._id).localeCompare(text(a._id))),start=cursor?sorted.findIndex(row=>row._id===cursor)+1:0
  if(cursor&&!start)fail('POINTS_APPEAL_CURSOR','列表已变化，请重新加载')
  const page=sorted.slice(start,start+50);return {success:true,appeals:page.map(dto),total:rows.length,nextCursor:start+page.length<sorted.length?page.at(-1)._id:''}
}
async function resolve(db,actor,event,loadLedger){
  if(!actor?.platformOwner||!actor.actorId)fail('POINTS_APPEAL_FORBIDDEN','仅平台负责人可处理申诉')
  const id=text(event.appealId),reply=text(event.reply),resolution=text(event.resolution)
  if(!id.startsWith('points-appeal-')||reply.length<4||reply.length>1000||!['corrected','confirmed','rejected'].includes(resolution))fail('POINTS_APPEAL_INPUT','请选择处理结果并填写回复')
  let updatedLedger=null
  if(resolution==='corrected'){const old=await document(db,id);if(!old||old.recordType!=='player_points_appeal')fail('POINTS_APPEAL_NOT_FOUND','申诉不存在');updatedLedger=loadLedger?await loadLedger(old.playerId):null;if(!updatedLedger||updatedLedger.revision===old.ledgerRevision)fail('POINTS_APPEAL_BASIS_REQUIRED','请先补录依据并重算，再确认已更正')}
  await db.runTransaction(async tx=>{const old=await document(tx,id);if(!old||old.recordType!=='player_points_appeal')fail('POINTS_APPEAL_NOT_FOUND','申诉不存在');if(old.status!=='pending'||Number(event.revision)!==old.revision)fail('POINTS_APPEAL_CONFLICT','该申诉已处理，请刷新');const active=await document(tx,old.activeId);await tx.collection('platform_settings').doc(id).update({data:{status:resolution==='rejected'?'rejected':'resolved',reply,resolution,resolvedAt:new Date().toISOString(),resolvedBy:hash(actor.actorId),...(updatedLedger?{ledgerRevisionAfter:updatedLedger.revision,pointsAfter:updatedLedger.points}:{}),revision:old.revision+1}});if(active?.appealId===id)await tx.collection('platform_settings').doc(old.activeId).set({data:{recordType:'player_points_appeal_active',appealId:''}})});return {success:true}
}
module.exports={submit,list,resolve,fields}
