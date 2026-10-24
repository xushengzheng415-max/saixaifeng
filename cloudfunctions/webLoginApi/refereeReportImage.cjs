'use strict'
const {dimensions}=require('./refereeGoalFocus.cjs')
function normalize(buffer,table){
 const size=dimensions(buffer)
 if(Math.min(size.width,size.height)>=900)return null
 const tables=(table.tables_result || []).filter(row=>(row.body || []).some(cell=>/队员|球员|姓名/.test(String(cell.words || ''))))
 const points=tables.flatMap(row=>row.table_location || [])
 if(points.length<4||points.some(p=>p.x<0||p.y<0||p.x>size.width+5||p.y>size.height+5))return null
 const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))-8)),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))-8))
 const width=Math.min(size.width-left,Math.ceil(Math.max(...points.map(p=>p.x))-left+8)),height=Math.min(size.height-top,Math.ceil(Math.max(...points.map(p=>p.y))-top+8))
 if(width<size.width*.3||height<80)return null
 const scale=Math.min(4,1600/width),mime=buffer[0]===255?'jpeg':'png'
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}"><image href="data:image/${mime};base64,${buffer.toString('base64')}" width="${size.width}" height="${size.height}"/></svg>`
 const output=new(require('@resvg/resvg-js').Resvg)(svg,{fitTo:{mode:'zoom',value:scale}}).render().asPng()
 if(output.length>3*1024*1024)return null
 return {buffer:output,transform:{left,top,width,height,scale,sourceWidth:size.width,sourceHeight:size.height}}
}
function validMinutes(value){return /^\d+(?:,\d+)*$/.test(String(value || ''))}
function retainClearGoals(before,after){
 for(const side of ['home','away'])for(const row of after.teams[side]){
  const numbers=new Set(row.numberCandidates || [row.number]),names=new Set(row.nameCandidates || [row.name])
  const old=before.teams[side].filter(candidate=>(candidate.numberCandidates || [candidate.number]).some(value=>numbers.has(value))&&(candidate.nameCandidates || [candidate.name]).some(value=>names.has(value)))
  if(old.length!==1)continue
  const previous=old[0]
  row.numberCandidates=[...new Set([...(row.numberCandidates||[row.number]),...(previous.numberCandidates||[previous.number])].filter(Boolean))]
  row.nameCandidates=[...new Set([...(row.nameCandidates||[row.name]),...(previous.nameCandidates||[previous.name])].filter(Boolean))]
  if(previous.role==='starter'&&row.roleSource==='blank_as_substitute'){
    row.role='starter';row.roleSource='retained_same_row_mark';row.reviewNotes=[...new Set([...(row.reviewNotes||[]),'分区复识别未读清勾号，请对照切片核对'])]
  }else if(previous.role==='unknown'&&row.roleSource==='blank_as_substitute'){
    row.role='unknown';row.reviewNotes=[...new Set([...(row.reviewNotes||[]),'首发标记仍不清楚，请对照切片核对'])]
  }else if(['starter','substitute'].includes(previous.role)&&['starter','substitute'].includes(row.role)&&previous.role!==row.role&&previous.roleSource!=='blank_as_substitute'){
    row.role='unknown';row.reviewNotes=[...new Set([...(row.reviewNotes||[]),'两次首发替补标记不同，请对照切片核对'])]
  }
  if(!validMinutes(previous.goals))continue
  if(!validMinutes(row.goals)||row.goals.split(',').every(value=>old[0].goals.split(',').includes(value))){row.goals=old[0].goals;row.goalSource='retained_same_row';row.reviewNotes=(row.reviewNotes || []).filter(note=>!/进球|圈号|分钟/.test(note))}
  else if(row.goals!==old[0].goals){row.goals='?';row.goalConflict=true;row.reviewNotes.push('两次进球分钟识别不同，请核对')}
 }
 return after
}
function uploadedRegions(analysis,size,transform){
 const scale=transform?Number(transform.scale):1,offsetX=transform?Number(transform.left):0,offsetY=transform?Number(transform.top):0
 const valid=Number.isFinite(scale)&&scale>0&&Number.isFinite(offsetX)&&Number.isFinite(offsetY)&&size.width>0&&size.height>0
 function map(rect){
  if(!valid||!rect||!['left','top','width','height'].every(key=>Number.isFinite(rect[key]))||rect.width<=0||rect.height<=0)return null
  const left=Math.max(0,Math.floor(offsetX+rect.left/scale)),top=Math.max(0,Math.floor(offsetY+rect.top/scale))
  const right=Math.min(size.width,Math.ceil(offsetX+(rect.left+rect.width)/scale)),bottom=Math.min(size.height,Math.ceil(offsetY+(rect.top+rect.height)/scale))
  return right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null
 }
 function polygon(points){if(!valid||!Array.isArray(points)||points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;return points.map(p=>({x:Math.max(0,Math.min(size.width,offsetX+p.x/scale)),y:Math.max(0,Math.min(size.height,offsetY+p.y/scale))}))}
 for(const side of ['home','away'])for(const row of analysis.teams[side] || []){for(const key of ['reviewRegion','reviewHeaderRegion','sourceRegion','markRegion'])row[key]=map(row[key]);row.reviewPolygon=polygon(row.reviewPolygon);row.reviewHeaderPolygon=polygon(row.reviewHeaderPolygon)}
 return analysis
}
function teamCrops(buffer,table,analysis){
 const size=dimensions(buffer),panels=require('./refereeReportPanels.cjs'),output=[]
 for(const entry of table.tables_result || []){
  const cells=(entry.body||[]).map(c=>({...c,r:Number(Array.isArray(c.row_start)?c.row_start[0]:c.row_start),c:Number(Array.isArray(c.col_start)?c.col_start[0]:c.col_start),ce:Number(c.col_end),text:String(c.words||'')})),headers=panels.headers(cells)
  if(headers.length!==2)continue
  for(const [index,header] of headers.entries()){
   const side=header.teamSide || (index?'away':'home'),rows=analysis.teams[side]||[]
   if(!header.inferredHeader&&/^(?:队员姓名|球员姓名|姓名)$/.test(String(header.text).replace(/\s/g,''))&&rows.length&&!rows.some(row=>!row.number||!row.name))continue
   const serial=cells.filter(c=>c.c===header.panelStart&&c.r>header.r&&/^\d{1,2}$/.test(c.text.trim())),last=Math.max(...serial.map(c=>c.r),header.r)
   const own=cells.filter(c=>c.r>=header.r&&c.r<=last&&c.c>=header.panelStart&&c.ce<=header.panelEnd&&c.cell_location?.length===4)
   const leftCells=own.filter(c=>c.c===header.panelStart).sort((a,b)=>a.r-b.r),rightCells=own.filter(c=>c.ce===header.panelEnd).sort((a,b)=>b.r-a.r)
   if(!leftCells.length||!rightCells.length)continue
   const polygon=leftCells.flatMap(c=>[c.cell_location[0],c.cell_location[3]]).concat(rightCells.flatMap(c=>[c.cell_location[2],c.cell_location[1]]))
   const left=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p.x))-2)),top=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p.y))-2)),right=Math.min(size.width,Math.ceil(Math.max(...polygon.map(p=>p.x))+2)),bottom=Math.min(size.height,Math.ceil(Math.max(...polygon.map(p=>p.y))+2)),width=right-left,height=bottom-top
   if(width<50||height<80)continue
   const scale=Math.min(4,1200/width),mime=buffer[0]===255?'jpeg':'png',points=polygon.map(p=>p.x+','+p.y).join(' ')
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${width} ${height}"><defs><clipPath id="team"><polygon points="${points}"/></clipPath></defs><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="white"/><image clip-path="url(#team)" href="data:image/${mime};base64,${buffer.toString('base64')}" width="${size.width}" height="${size.height}"/></svg>`
   const image=new(require('@resvg/resvg-js').Resvg)(svg,{fitTo:{mode:'zoom',value:scale}}).render().asPng()
   if(image.length<=3*1024*1024)output.push({side,buffer:image,transform:{left,top,width,height,scale,sourceWidth:size.width,sourceHeight:size.height}})
  }
 }
 return output
}
module.exports={normalize,retainClearGoals,uploadedRegions,teamCrops}
