'use strict'
const text=value=>String(value==null?'':value).trim()
const circle=/[①-⑳❶-❿]/
const fieldNames={on:'换上',off:'换下',goals:'进球',yellow:'黄牌',red:'红牌',starter:'首发',substitute:'替补',identity:'身份'}
function explicitEvents(value){
  const result=[]
  const patterns=[['on',/(?:↑|换上|上场)\s*[:：]?\s*(\d{1,3})(?:[′'’]|分(?:钟)?)?/g],['on',/(\d{1,3})\s*(?:[′'’]|分(?:钟)?)?\s*(?:↑|换上|上场)/g],['off',/(?:↓|换下|下场)\s*[:：]?\s*(\d{1,3})(?:[′'’]|分(?:钟)?)?/g],['off',/(\d{1,3})\s*(?:[′'’]|分(?:钟)?)?\s*(?:↓|换下|下场)/g],['goals',/(?:进球|射入)\s*[:：]?\s*(\d{1,3})\s*(?:[′'’]|分(?:钟)?)/g],['yellow',/(?:黄牌|警告)\s*[:：]?\s*(\d{1,3})\s*(?:[′'’]|分(?:钟)?)/g],['red',/(?:红牌|罚下)\s*[:：]?\s*(\d{1,3})\s*(?:[′'’]|分(?:钟)?)/g]]
  for(const [field,pattern] of patterns)for(const match of value.matchAll(pattern)){
    // In a note like “29′换上55号”, 55 is a jersey number, not a minute.
    if(/^\s*号/.test(value.slice(match.index+match[0].length)))continue
    const minute=Number(match[1]);if(minute<=150&&!result.some(row=>row.field===field&&row.minute===minute))result.push({field,minute})
  }
  return result
}
function apply(row,candidates,sourceField){
  row.reviewNotes=row.reviewNotes || []
  for(const field of [...new Set(candidates.map(item=>item.field))]){
    const values=candidates.filter(item=>item.field===field).map(item=>item.minute)
    const current=text(row[field])
    if(current && /^\d+(?:,\d+)*$/.test(current) && current!==values.join(',')){
      row.reviewNotes.push(`${fieldNames[field]}原栏与旁注不一致，请确认`);row[field]='?'
    }else row[field]=[...new Set(values)].join(',')
  }
  if(sourceField && candidates.length && !candidates.some(item=>item.field===sourceField) && ['on','off','goals','yellow','red'].includes(sourceField))row[sourceField]=''
}
function circledMinutes(value){
  value=String(value || '').replace(/[（(](\d{1,2})[)）](?=\s*\d)/g,(full,n)=>Number(n)>0&&Number(n)<=20?String.fromCodePoint(0x2460+Number(n)-1):full)
  const groups=[],pattern=/[①-⑳❶-❿]\s*([^①-⑳❶-❿]*)/g
  for(const match of String(value || '').matchAll(pattern)){
    const candidate=match[1].trim().match(/^(\d{1,3})\s*(?:[′'’\-—_.。．、，,;；]*|分(?:钟)?)\s*$/)
    groups.push(candidate&&Number(candidate[1])<=150?Number(candidate[1]):null)
  }
  return groups
}
function enrich(teams,accurate,handwriting,options={}){
  const annotations=[],seen=new Set()
  const add=(value,row,side)=>{const content=text(value);const key=[side,row?.number,content].join('|');if(!content || seen.has(key))return;seen.add(key);annotations.push({text:[side==='home'?'主队':side==='away'?'客队':'',row?.number?row.number+'号':'',content].filter(Boolean).join(' · ')})}
  for(const side of ['home','away'])for(const row of teams[side]){
    for(const [field,raw] of Object.entries(row.rawFields || {})){
      if(circle.test(text(raw)) || /[↑↓]|换上|换下|进球|红牌|黄牌/.test(text(raw))){
        add(fieldNames[field]+'栏：'+text(raw),row,side)
        const candidates=explicitEvents(text(raw));apply(row,candidates,field)
        if(row.role==='unknown' && field==='starter' && /^[√✓✔Vv]/.test(text(raw)) && !/[○〇◯Oo]/.test(text(raw))){row.role='starter';row.reviewNotes.push('首发标记与旁注连写，请核对')}
        if(row.role==='unknown' && field==='substitute' && /^[○〇◯Oo]/.test(text(raw)) && !/[√✓✔Vv]/.test(text(raw))){row.role='substitute';row.reviewNotes.push('替补标记与旁注连写，请核对')}
      }
    }
    if(options.circledGoals===true){
      const raw=row.rawFields || {},textSource=['identity','on','off','goals','yellow','red'].map(key=>text(raw[key])).join(' ')
      const minutes=circledMinutes(textSource)
      if(minutes.length){
        // The circles are reading separators only. They are never result fields.
        row.goals=minutes.every(Number.isInteger)?minutes.join(','):'?'
        for(const field of ['on','off','yellow','red'])if(text(raw[field])&&!explicitEvents(text(raw[field])).length)row[field]=''
        row.reviewNotes=(row.reviewNotes || []).filter(note=>!/圈号或括号序号|无法确定分钟|缺少位置复核/.test(note))
        if(minutes.some(value=>value==null))row.reviewNotes.push('部分进球分钟不清楚，请对照原图填写')
        add('进球原文：'+textSource,row,side)
      }
    }
  }
  const rawLines=[...new Set([...(accurate.words_result || []),...(handwriting?.words_result || [])].map(row=>text(row.words)).filter(Boolean))]
  for(const line of rawLines){
    if(!(/[①-⑳❶-❿↑↓]|换上|换下|进球|红牌|黄牌|首发|替补/.test(line) && /\d|[①-⑳❶-❿↑↓]/.test(line)))continue
    const side=/主队/.test(line)&&!/客队/.test(line)?'home':/客队/.test(line)&&!/主队/.test(line)?'away':''
    const number=line.match(/(?:^|[^\d])(\d{1,3})\s*号/)
    const eligible=side?[side]:['home','away']
    let candidates=number?eligible.flatMap(value=>teams[value].filter(row=>String(row.number)===number[1]).map(row=>({side:value,row}))):[]
    if(!candidates.length && side && number){
      const name=line.match(/\d{1,3}\s*号\s*([\p{Script=Han}·]{2,8}?)(?=\s|首发|替补|换上|换下|进球|黄牌|红牌|$)/u)
      if(name){const row={number:number[1],name:name[1],role:/首发/.test(line)&&!/替补/.test(line)?'starter':/替补/.test(line)&&!/首发/.test(line)?'substitute':'unknown',on:'',off:'',goals:'',yellow:'',red:'',captain:false,goalkeeper:false,rawFields:{note:line},reviewNotes:['从整页文字提取，请核对球员和阵容']};teams[side].push(row);candidates=[{side,row}]}
    }
    if(candidates.length===1){const target=candidates[0];add(line,target.row,target.side);apply(target.row,explicitEvents(line))}
    else if(!/[①-⑳❶-❿]/.test(line))add(line,null,side)
  }
  return {annotations,rawLines}
}
module.exports={enrich,explicitEvents,circledMinutes}
