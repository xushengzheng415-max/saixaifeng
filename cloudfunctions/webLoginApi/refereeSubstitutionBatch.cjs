const crypto=require('crypto')
const text=v=>String(v || '')
const list=(row,key)=>Array.isArray(row[key+'Ids'])?row[key+'Ids'].map(text):(row[key+'Id']?[text(row[key+'Id'])]:[])
const sameSet=(a,b)=>a.length===b.length&&a.slice().sort().every((id,i)=>id===b.slice().sort()[i])
function buildEntries(substitutions,players,match,evidence){
  if(!Array.isArray(substitutions)||substitutions.length>100)throw new Error('换人组数不正确')
  const groups=new Map()
  for(const row of substitutions){
    if(!['home','away'].includes(row.side)||!Number.isInteger(row.minute)||row.minute<0||row.minute>150)throw new Error('请核对换人球队及分钟')
    const ins=list(row,'in'),outs=list(row,'out')
    if(ins.length>100||outs.length>100||new Set(ins).size!==ins.length||new Set(outs).size!==outs.length)throw new Error('同组换人不能重复选择球员')
    const key=`${row.side}|${row.minute}`
    if(!groups.has(key))groups.set(key,{side:row.side,minute:row.minute,inIds:new Set(),outIds:new Set()})
    const group=groups.get(key);ins.forEach(id=>group.inIds.add(id));outs.forEach(id=>group.outIds.add(id))
  }
  const result=[]
  for(const group of groups.values()){
    const ins=[...group.inIds].sort(),outs=[...group.outIds].sort(),available=players[group.side]
    if(!ins.length||ins.length!==outs.length)throw new Error(`${group.minute}分钟换下${outs.length}人、换上${ins.length}人，请补齐本组球员`)
    if(ins.some(id=>outs.includes(id)))throw new Error(`${group.minute}分钟同一球员不能同时换上和换下`)
    if([...ins,...outs].some(id=>!available?.has(id)))throw new Error('换人球员不属于本场已确认名单')
    const old=(match.events || []).filter(e=>e.type==='substitution'&&e.teamSide===group.side&&Number(e.minute)===group.minute)
    if(old.length){const oldIns=[...new Set(old.map(e=>text(e.inPlayerId || e.playerId)))],oldOuts=[...new Set(old.map(e=>text(e.outPlayerId || e.assistPlayerId)))];if(sameSet(ins,oldIns)&&sameSet(outs,oldOuts))continue;throw new Error(`${group.minute}分钟已有不同的换人记录，请先核对比赛事件`)}
    const batchId='paper-batch-'+crypto.createHash('sha256').update(`${evidence.imageHash}|${group.side}|${group.minute}`).digest('hex').slice(0,24)
    for(let i=0;i<ins.length;i++){
      const incoming=available.get(ins[i]),outgoing=available.get(outs[i])
      // These are compatibility slots, not claims about who replaced whom.
      // Membership and batch ID define the unordered group; no pairing is inferred.
      result.push({eventId:'paper-'+crypto.createHash('sha256').update(`${batchId}|${ins[i]}|${outs[i]}`).digest('hex').slice(0,24),type:'substitution',minute:group.minute,teamSide:group.side,teamId:match[group.side+'TeamId'],playerId:incoming.playerId,playerName:incoming.name,outPlayerId:outgoing.playerId,assistPlayerId:outgoing.playerId,assistName:outgoing.name,substitutionBatchId:batchId,substitutionBatchSize:ins.length,substitutionPairing:'unordered_batch',substitutionPeriod:group.minute===evidence.timing?.halfMinutes?'halftime':undefined,source:'organizer_paper_report',evidenceFileId:evidence.fileId})
    }
  }
  return result
}
module.exports={buildEntries}
