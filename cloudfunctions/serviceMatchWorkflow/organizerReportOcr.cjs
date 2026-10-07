'use strict'
const crypto=require('crypto')
const str=value=>String(value==null?'':value).trim()
async function run(db,event,callOcr,toRows,parsePlayers) {
  const token=str(event.__authToken)
  if(!token) throw new Error('识别授权已失效')
  const sessions=(await db.collection('auth_sessions').where({tokenHash:crypto.createHash('sha256').update(token).digest('hex'),active:true,expiresAt:db.command.gt(new Date())}).limit(2).get()).data || []
  const session=sessions[0]
  if(sessions.length!==1 || session.source!=='mini_shared_operation' || session.allowedFunction!=='serviceMatchWorkflow' || session.miniOperation!=='recognizeReport' || str(session.tournamentId)!==str(event.tournamentId)) throw new Error('识别请求无权访问此赛事')
  const grants=(await db.collection('tournament_staff_grants').where({userId:session.userId,orgId:session.activeOrgId,tournamentId:session.tournamentId,status:'active'}).limit(20).get()).data || []
  if(!grants.some(item=>(item.permissions || []).includes('event.matches'))) throw new Error('比赛录入授权已停用')
  const response=await db.collection('matches').doc(str(event.matchId)).get(), match=Array.isArray(response.data)?response.data[0]:response.data
  if(!match || str(match.tournamentId)!==str(session.tournamentId)) throw new Error('比赛不属于当前赛事')
  const image=str(event.imageBase64)
  if(image.length<200 || image.length>8*1024*1024 || !/^[A-Za-z0-9+/=]+$/.test(image)) throw new Error('请上传 6 MB 以内的清晰裁判表照片')
  const engines=await Promise.allSettled([callOcr('GeneralAccurateOCR',{ImageBase64:image}),callOcr('GeneralHandwritingOCR',{ImageBase64:image,EnableWordPolygon:false,EnableDetectText:true})])
  const replies=engines.filter(item=>item.status==='fulfilled').map(item=>item.value)
  if(!replies.length) throw engines[0].reason
  const result=replies[0], rows=[...new Map(replies.flatMap(reply=>toRows(reply.TextDetections)).map(row=>[row.text,row])).values()],lines=rows.map(row=>row.text), candidates=[]
  lines.slice(0,Math.max(8,Math.ceil(lines.length/3))).forEach(line=>{
    const labelled=line.match(/(?:比分|赛果|结果).*?(\d{1,2})\s*[:：比\-]\s*(\d{1,2})/)
    const plain=line.match(/^\s*(\d{1,2})\s*[:：比\-]\s*(\d{1,2})\s*$/)
    const value=labelled || plain
    if(value) candidates.push({homeScore:Number(value[1]),awayScore:Number(value[2]),source:line})
  })
  const unique=[...new Map(candidates.map(item=>[item.homeScore+':'+item.awayScore,item])).values()]
  const events=[]
  rows.forEach(row=>{
    const type=/换人|替换|换下|换上/.test(row.text)?'substitution':/乌龙/.test(row.text)?'own_goal':/红牌/.test(row.text)?'red_card':/黄牌/.test(row.text)?'yellow_card':/点球.*(?:未进|罚失)/.test(row.text)?'penalty_missed':/点球/.test(row.text)?'penalty_scored':/进球|得分/.test(row.text)?'goal':''
    if(!type) return
    const minute=row.text.match(/(\d{1,3})\s*(?:分钟|分|['′’])/),extra=row.text.match(/(\d{1,3})\s*\+\s*(\d{1,2})\s*(?:分钟|分|['′’])/)
    const number=row.text.match(/(\d{1,3})\s*号/)
    events.push({type,minute:extra?Number(extra[1])+Number(extra[2]):minute?Number(minute[1]):null,jerseyNumber:number?number[1]:'',sideHint:/主队/.test(row.text)?'home':/客队/.test(row.text)?'away':'',rawText:row.text,confidence:row.confidence})
  })
  return {success:true,message:'识别完成，请核对后确认',data:{homeScore:unique.length===1?unique[0].homeScore:null,awayScore:unique.length===1?unique[0].awayScore:null,scoreCandidates:unique,events,candidatePlayers:parsePlayers(rows,'unknown'),rawLines:lines.slice(0,160),warnings:['识别结果未入库；必须核对球队、首发、比分和每条事件。'].concat(unique.length===1?[]:['上方比分未唯一识别，请对照照片填写。']),requestId:result.RequestId || ''}}
}
module.exports={run}
