export function readMinutes(value){const t=String(value??'').trim().replace(/[′'’]/g,'');return /^\d{1,3}(?:\s*[,，;；、]\s*\d{1,3})*$/.test(t)?t.split(/[,，;；、]/).map(Number):[]}
const ids=(row,key)=>Array.isArray(row[key+'Ids'])?row[key+'Ids']:(row[key+'Id']?[row[key+'Id']]:[])
const validMinute=m=>m!==null&&m!==''&&Number.isInteger(Number(m))&&Number(m)>=0&&Number(m)<=150
const marked=row=>row?.playerId&&!['absent','skip'].includes(row.role)
export const copyPairs=rows=>(rows || []).map(row=>({...row,inIds:[...ids(row,'in')],outIds:[...ids(row,'out')]}))
export function mergeGroups(rows){
  const groups=[],byKey=new Map()
  for(const row of copyPairs(rows)){
    if(!validMinute(row.minute)){groups.push(row);continue}
    const key=`${row.side}|${row.minute}`
    if(!byKey.has(key)){byKey.set(key,row);groups.push(row)}else{const old=byKey.get(key);old.inIds=[...new Set([...old.inIds,...row.inIds])];old.outIds=[...new Set([...old.outIds,...row.outIds])]}
  }
  return groups.sort((a,b)=>(Number(a.minute)||0)-(Number(b.minute)||0))
}
export function rebuildPairs(teams,previous=[]){
  const groups=[]
  for(const side of ['home','away']){
    const rows=(teams?.[side] || []).filter(marked)
    for(const minute of [...new Set(rows.flatMap(row=>[...readMinutes(row.on),...readMinutes(row.off)]))].sort((a,b)=>a-b))groups.push({side,minute,inIds:rows.filter(row=>readMinutes(row.on).includes(minute)).map(row=>row.playerId),outIds:rows.filter(row=>readMinutes(row.off).includes(minute)).map(row=>row.playerId)})
  }
  return mergeGroups(groups)
}
function marks(rows){return copyPairs(rows).flatMap(row=>['in','out'].flatMap(key=>ids(row,key).map(id=>({side:row.side,minute:row.minute,id,field:key==='in'?'on':'off'}))))}
export function syncPairMarks(teams,previous,next){
  const before=marks(previous),after=marks(next),find=mark=>(teams?.[mark.side] || []).find(row=>row.playerId===mark.id)
  for(const old of before){if(!validMinute(old.minute)||after.some(mark=>mark.side===old.side&&mark.id===old.id&&mark.field===old.field&&mark.minute===old.minute))continue;const row=find(old);if(row)row[old.field]=readMinutes(row[old.field]).filter(m=>m!==old.minute).join(',')}
  for(const mark of after){if(!validMinute(mark.minute))continue;const row=find(mark);if(row)row[mark.field]=[...new Set([...readMinutes(row[mark.field]),Number(mark.minute)])].sort((a,b)=>a-b).join(',')}
}
export function missingMarks(teams,groups){const all=marks(groups),missing=[];for(const side of ['home','away'])for(const row of (teams?.[side] || []).filter(marked))for(const field of ['on','off'])for(const minute of readMinutes(row[field]))if(!all.some(m=>m.side===side&&m.id===row.playerId&&m.field===field&&m.minute===minute))missing.push({side,playerId:row.playerId,name:row.name,number:row.number,field,minute});return missing}
const sameSet=(a,b)=>a.length===b.length&&a.slice().sort().every((id,i)=>id===b.slice().sort()[i])
export function draftBatchEvents(groups,existing=[],halfMinutes){
  const result=[]
  for(const [i,row] of mergeGroups(groups).entries()){
    const old=existing.filter(e=>e.type==='substitution'&&e.teamSide===row.side&&Number(e.minute)===row.minute)
    if(old.length){const ins=[...new Set(old.map(e=>e.inPlayerId || e.playerId))],outs=[...new Set(old.map(e=>e.outPlayerId || e.assistPlayerId))];if(sameSet(ins,row.inIds)&&sameSet(outs,row.outIds))continue;throw new Error(`${row.minute}′已有不同的换人记录，请先核对比赛事件`)}
    const ins=row.inIds.slice().sort(),outs=row.outIds.slice().sort()
    // Compatibility slots have no replacement attribution. The shared state
    // machine counts each incoming player and one window for the entire batch.
    for(let j=0;j<ins.length;j++)result.push({eventId:`draft-group-${i}-${j}`,type:'substitution',teamSide:row.side,minute:row.minute,playerId:ins[j],outPlayerId:outs[j],assistPlayerId:outs[j],substitutionBatchId:`draft-batch-${i}`,substitutionPairing:'unordered_batch',substitutionPeriod:halfMinutes===row.minute?'halftime':undefined})
  }
  return result
}
export function groupedTimeline(events){
  const result=[],seen=new Map()
  for(const event of events){
    if(event.type!=='substitution'||event.substitutionPairing!=='unordered_batch'||!event.substitutionBatchId){result.push(event);continue}
    const key=[event.substitutionBatchId,event.teamSide,event.minute,event.substitutionPeriod || ''].join('|')
    if(!seen.has(key)){const row={...event,batchEventIds:[],batchIn:[],batchOut:[]};seen.set(key,row);result.push(row)}
    const row=seen.get(key);row.batchEventIds.push(event.eventId);row.batchIn.push(event.playerName);row.batchOut.push(event.assistName)
    row.playerName=[...new Set(row.batchIn)].join('、');row.assistName=[...new Set(row.batchOut)].join('、')
  }
  return result
}
