export function readMinutes(value) {
  const text=String(value ?? '').trim().replace(/[′'’]/g,'')
  return /^\d{1,3}(?:\s*[,，;；、]\s*\d{1,3})*$/.test(text)?text.split(/[,，;；、]/).map(Number):[]
}
const active=row=>row?.playerId&&['starter','substitute'].includes(row.role)
const validTime=value=>value!==null&&value!==''&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=150
export const copyPairs=pairs=>(pairs || []).map(row=>({...row}))

// Only retain user-selected pairs that still match the roster marks. Ambiguous
// simultaneous replacements keep their known outgoing player and an empty inlet.
export function rebuildPairs(teams,previous=[]) {
  const result=[]
  for(const side of ['home','away']) {
    const rows=(teams?.[side] || []).filter(active)
    const times=[...new Set(rows.flatMap(row=>[...readMinutes(row.on),...readMinutes(row.off)]))].sort((a,b)=>a-b)
    for(const minute of times) {
      const incoming=rows.filter(row=>readMinutes(row.on).includes(minute)).map(row=>row.playerId)
      const outgoing=rows.filter(row=>readMinutes(row.off).includes(minute)).map(row=>row.playerId)
      const usedIn=new Set(),usedOut=new Set()
      for(const old of previous.filter(row=>row.side===side&&row.minute===minute)) {
        const inId=incoming.includes(old.inId)&&!usedIn.has(old.inId)?old.inId:''
        const outId=outgoing.includes(old.outId)&&!usedOut.has(old.outId)?old.outId:''
        if(!inId&&!outId)continue
        if(inId)usedIn.add(inId);if(outId)usedOut.add(outId)
        result.push({...old,side,minute,inId,outId})
      }
      const ins=incoming.filter(id=>!usedIn.has(id)),outs=outgoing.filter(id=>!usedOut.has(id))
      // Fill partial rows without assigning the same player to two replacements.
      const partial=result.filter(row=>row.side===side&&row.minute===minute)
      for(const row of partial){if(!row.inId&&ins.length===1)row.inId=ins.shift();if(!row.outId&&outs.length===1)row.outId=outs.shift()}
      const count=Math.max(ins.length,outs.length),unique=ins.length===1&&outs.length===1
      for(let i=0;i<count;i++)result.push({side,minute,outId:outs[i] || '',inId:unique?ins[0]:outs.length===0?ins[i] || '':''})
    }
  }
  return result
}

// Editing a replacement updates only marks represented by that edit. Unpaired
// OCR marks are preserved until the user explicitly fixes or deletes them.
export function syncPairMarks(teams,previous,next) {
  const find=(side,id)=>(teams?.[side] || []).find(row=>row.playerId===id)
  for(const old of previous || [])for(const [key,field] of [['inId','on'],['outId','off']]) {
    if(!old[key]||!validTime(old.minute))continue
    if(next.some(row=>row.side===old.side&&Number(row.minute)===Number(old.minute)&&row[key]===old[key]))continue
    const player=find(old.side,old[key]);if(player)player[field]=readMinutes(player[field]).filter(minute=>minute!==Number(old.minute)).join(',')
  }
  for(const row of next || [])for(const [key,field] of [['inId','on'],['outId','off']]) {
    if(!row[key]||!validTime(row.minute))continue
    const player=find(row.side,row[key]);if(!player)continue
    player[field]=[...new Set([...readMinutes(player[field]),Number(row.minute)])].sort((a,b)=>a-b).join(',')
  }
}
export function missingMarks(teams,pairs) {
  const missing=[]
  for(const side of ['home','away'])for(const player of (teams?.[side] || []).filter(active))for(const [field,key] of [['on','inId'],['off','outId']])for(const minute of readMinutes(player[field])) {
    if(!pairs.some(row=>row.side===side&&row.minute===minute&&row[key]===player.playerId))missing.push({side,playerId:player.playerId,name:player.name,number:player.number,minute,field})
  }
  return missing
}
