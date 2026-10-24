'use strict'
const {circledMinutes}=require('./refereeReportNotes.cjs')
function dimensions(buffer){
 if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)}
 for(let p=2;p+9<buffer.length;){if(buffer[p]!==255){p++;continue}const code=buffer[p+1];if(code===0xd9||code===0xda)break;const length=buffer.readUInt16BE(p+2);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(code))return {height:buffer.readUInt16BE(p+5),width:buffer.readUInt16BE(p+7)};if(length<2)break;p+=2+length}
 throw new Error('无法读取报告尺寸')
}
function crop(buffer,region){
 const size=dimensions(buffer),left=Math.max(0,region.left),top=Math.max(0,region.top),width=Math.min(region.width,size.width-left),height=Math.min(region.height,size.height-top)
 if(width<20||height<8||width>size.width||height>size.height/4)throw new Error('局部范围不明确')
 const mime=buffer[0]===255?'jpeg':'png',svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}"><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="white"/><image href="data:image/${mime};base64,${buffer.toString('base64')}" width="${size.width}" height="${size.height}"/></svg>`
 return new (require('@resvg/resvg-js').Resvg)(svg,{fitTo:{mode:'zoom',value:Math.min(4,1400/width)}}).render().asPng().toString('base64')
}
function candidate(result){
 const rows=(result?.words_result || []).slice().sort((a,b)=>(a.location?.left || 0)-(b.location?.left || 0))
 const raw=rows.map(row=>String(row.words || '')).join(' '),minutes=circledMinutes(raw)
 return {raw,minutes,clear:minutes.length>0&&minutes.every(Number.isInteger)&&new Set(minutes).size===minutes.length}
}
function hasInteriorInk(image){
 const pixels=require('pngjs').PNG.sync.read(Buffer.from(image,'base64')),values=[]
 for(let y=Math.floor(pixels.height*.22);y<pixels.height*.78;y++)for(let x=Math.floor(pixels.width*.22);x<pixels.width*.78;x++){const i=(y*pixels.width+x)*4;values.push(pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722)}
 const sorted=values.slice().sort((a,b)=>a-b),background=sorted[Math.floor(sorted.length*.85)] || 255,threshold=Math.min(160,background-42)
 return values.filter(value=>value<threshold).length/Math.max(1,values.length)>.025
}
async function enhance(analysis,buffer,recognize,deadline=Date.now()+50000){
 const targets=Object.values(analysis.teams).flat().filter(row=>row.sourceRegion&&(!/^\d+(?:,\d+)*$/.test(row.goals))&&/[①-⑳❶-❿]/.test(Object.values(row.rawFields || {}).join(' '))).slice(0,8)
 for(let start=0;start<targets.length&&Date.now()<deadline-12000;start+=3)await Promise.all(targets.slice(start,start+3).map(async row=>{
  try{
   const image=crop(buffer,row.sourceRegion)
   const responses=await Promise.all([recognize('handwriting',image).catch(()=>null),recognize('accurate',image).catch(()=>null)])
   const candidates=responses.map(candidate),clear=candidates.filter(result=>result.clear),old=circledMinutes(['identity','on','off','goals','yellow','red'].map(key=>row.rawFields?.[key] || '').join(' '))
   row.goalFocusEvidence=candidates.map(result=>result.raw).filter(Boolean)
   if(!clear.length)return
   if(row.goalConflict&&clear.length<2)return
   const unique=[...new Set(clear.map(value=>value.minutes.join(',')))]
   if(unique.length!==1||clear[0].minutes.length<old.length){row.goals='?';row.reviewNotes=[...(row.reviewNotes || []),'局部进球分钟识别有冲突，请核对'];return}
   row.goals=unique[0];row.goalSource='focused_circled_minutes';row.rawFields.goalFocus=clear[0].raw
   row.reviewNotes=(row.reviewNotes || []).filter(note=>!/进球|圈号|跨栏|位置复核/.test(note))
   for(const field of ['on','off','yellow','red'])if(/[①-⑳❶-❿]/.test(row.rawFields?.[field] || ''))row[field]=''
  }catch(error){/* Keep unresolved evidence; never invent minutes or score. */}
 }))
 const marks=Object.values(analysis.teams).flat().filter(row=>row.markRegion&&(row.role==='unknown'||row.roleSource==='blank_as_substitute'))
 const ink=[]
 for(const row of marks){try{const image=crop(buffer,row.markRegion);if(hasInteriorInk(image)){if(row.role==='substitute'){row.role='unknown';row.reviewNotes=[...(row.reviewNotes || []),'勾号栏有笔迹，需确认首发或替补']}ink.push({row,image})}}catch(error){}}
 for(let start=0;start<Math.min(ink.length,6)&&Date.now()<deadline-12000;start+=3)await Promise.all(ink.slice(start,start+3).map(async({row,image})=>{
   if(row.role==='substitute'){row.role='unknown';row.reviewNotes=[...(row.reviewNotes || []),'勾号栏有笔迹，需确认首发或替补']}
   try{
    const result=await recognize('handwriting',image),mark=(result.words_result || []).map(item=>item.words || '').join('').trim()
    row.rawFields.markFocus=mark
    const role=/^[√✓✔Vv]+$/.test(mark)?'starter':/^[○〇◯Oo↑]+$/.test(mark)?'substitute':''
    if(role){row.role=role;row.roleSource='focused_mark';row.reviewNotes=(row.reviewNotes || []).filter(note=>!/首发.*替补|勾号栏/.test(note))}
   }catch(error){}
 }))
 const counts=Object.fromEntries(['home','away'].map(side=>[side,analysis.teams[side].reduce((sum,row)=>sum+(/^\d+(?:,\d+)*$/.test(row.goals)?row.goals.split(',').length:0),0)]))
 analysis.warnings=analysis.warnings.filter(warning=>!/比分与已解析进球次数不一致/.test(warning))
 if(analysis.score.home!=null&&(analysis.score.home!==counts.home||analysis.score.away!==counts.away))analysis.warnings.push('比分与进球次数不一致，请核对不清楚的分钟')
 analysis.analysisVersion='referee-report-analysis/4'
 return analysis
}
module.exports={enhance,crop,candidate,dimensions,hasInteriorInk}
