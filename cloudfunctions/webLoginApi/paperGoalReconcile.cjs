'use strict'
const text=value=>String(value ?? '').trim()
const live=row=>row.deleted!==true&&!['deleted','cancelled','canceled','void','superseded'].includes(text(row.status).toLowerCase())
const kind=row=>({score:'goal'}[text(row.type || row.eventType)] || text(row.type || row.eventType))
const plainGoal=row=>live(row)&&kind(row)==='goal'&&row.isPenalty!==true&&row.isOwnGoal!==true&&row.isShootout!==true
const key=row=>text(row.teamSide)+'|'+text(row.playerId)
const eventId=row=>text(row.eventId || row._id || row.id)
function prepare(existing,incoming,evidence,approved=false){
 const oldGroups=new Map(),newGroups=new Map()
 for(const row of existing.filter(plainGoal)){const id=key(row);if(!oldGroups.has(id))oldGroups.set(id,[]);oldGroups.get(id).push(row)}
 for(const row of incoming.filter(plainGoal)){const id=key(row);if(!newGroups.has(id))newGroups.set(id,[]);newGroups.get(id).push(row)}
 const conflicts=[]
 for(const [id,old] of oldGroups){
  const next=newGroups.get(id)
  if(!next || old.length!==next.length || old.some(row=>!eventId(row)))continue
  // Multiple changed goals with distinct assist evidence need the regular event editor.
  if(old.length>1&&old.some(row=>text(row.assistPlayerId || row.assistName)))continue
  const before=old.map(row=>Number(row.minute)).sort((a,b)=>a-b),after=next.map(row=>Number(row.minute)).sort((a,b)=>a-b)
  if(JSON.stringify(before)===JSON.stringify(after))continue
  conflicts.push({side:next[0].teamSide,playerId:next[0].playerId,playerName:next[0].playerName,number:next[0].playerNumber,oldMinutes:before,newMinutes:after,oldEventIds:old.map(eventId),newEventIds:next.map(eventId)})
 }
 if(conflicts.length&&!approved)return {conflicts,events:null}
 const replaced=new Set(conflicts.flatMap(row=>row.oldEventIds)),now=new Date().toISOString()
 const retained=existing.map(row=>replaced.has(eventId(row))?{...row,status:'superseded',revision:Number(row.revision || 0)+1,supersededAt:now,supersededByPaperReport:evidence.fileId}:row)
 const conflictKeys=new Set(conflicts.map(row=>row.side+'|'+row.playerId))
 const correctedIncoming=incoming.map(row=>plainGoal(row)&&conflictKeys.has(key(row))&&oldGroups.get(key(row))?.length===1?{...oldGroups.get(key(row))[0],...row}:row)
 const available=retained.map((row,index)=>({row,index})).filter(({row})=>live(row)),consumed=new Set(),added=[]
 const same=(a,b)=>kind(a)===kind(b)&&text(a.playerId)===text(b.playerId)&&text(a.teamSide)===text(b.teamSide)&&Number(a.minute)===Number(b.minute)&&((plainGoal(a)&&plainGoal(b))||text(a.outPlayerId || a.assistPlayerId)===text(b.outPlayerId || b.assistPlayerId))
 for(const row of correctedIncoming){const found=available.find(({row:old,index})=>!consumed.has(index)&&(eventId(old)===eventId(row)||same(old,row)));if(found)consumed.add(found.index);else added.push(row)}
 return {conflicts,events:[...retained,...added]}
}
module.exports={prepare}
