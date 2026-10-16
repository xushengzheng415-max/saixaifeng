import { resolveBracketTemplate, BRACKET_TEMPLATE_VERSION } from './bracketTemplates'
const text=value=>String(value ?? '').trim()
const number=row=>Number(row.matchNo) || Number.MAX_SAFE_INTEGER
export const activeBracketMatch=row=>!['cancelled','canceled','deleted','removed','replaced','superseded'].includes(text(row.matchStatus || row.status).toLowerCase())
const sameDivision=(a,b)=>text(a.divisionId)===text(b.divisionId)
function sourceMatch(source,row,rows){
  if(!['match_winner','match_loser'].includes(source?.type))return null
  const candidates=rows.filter(item=>sameDivision(item,row)&&(source.matchId?item.id===source.matchId:source.matchNo&&text(item.matchNo)===text(source.matchNo)))
  return candidates.length===1?candidates[0]:null
}
export function officialWinner(row){
 if(row.resultStatus!=='approved')return ''
 if(row.winnerTeamId&&[row.homeTeamId,row.awayTeamId].includes(row.winnerTeamId))return row.winnerTeamId
 if(row.homeScore==null||row.awayScore==null||row.homeScore===row.awayScore)return ''
 return row.homeScore>row.awayScore?row.homeTeamId:row.awayTeamId
}
export function bracketGroups(input=[],templateId='auto'){
 const rows=input.filter(activeBracketMatch),divisions=new Map()
 for(const row of rows){const id=text(row.divisionId);if(!divisions.has(id))divisions.set(id,{id,name:row.divisionName || '未分组别',rows:[]});divisions.get(id).rows.push(row)}
 return [...divisions.values()].map(division=>{
  const edges=[],issues=[]
  for(const row of division.rows)for(const side of ['home','away']){
   const source=row[side+'Source'];if(!['match_winner','match_loser'].includes(source?.type))continue
   const parent=sourceMatch(source,row,division.rows)
   if(!parent){issues.push('场序'+(row.matchNo || '—')+'：'+(source.matchNo?'场序'+source.matchNo:'来源比赛')+'未唯一关联');continue}
   if(parent.id===row.id){issues.push('场序'+row.matchNo+'晋级来源指向自身');continue}
   edges.push({from:parent.id,to:row.id,side,type:source.type})
  }
  const pending=new Set(division.rows.map(row=>row.id)),components=[]
  while(pending.size){
   const ids=new Set(),queue=[pending.values().next().value]
   while(queue.length){const id=queue.shift();if(ids.has(id))continue;ids.add(id);pending.delete(id);for(const edge of edges)if(edge.from===id||edge.to===id)queue.push(edge.from===id?edge.to:edge.from)}
   components.push(layout(division.rows.filter(row=>ids.has(row.id)),edges.filter(edge=>ids.has(edge.from)&&ids.has(edge.to)),templateId))
  }
  components.sort((a,b)=>Number(b.championship)-Number(a.championship)||number(a.nodes[0].row)-number(b.nodes[0].row))
  return {...division,components,issues:[...new Set(issues)]}
 })
}
function layout(rows,edges,templateId){
 const template=resolveBracketTemplate(rows,templateId),geometry=template.geometry
 const depths=new Map(),cycles=new Set()
 function depth(id,seen=new Set()){
  if(depths.has(id))return depths.get(id)
  if(seen.has(id)){cycles.add(id);return 0}
  const next=new Set(seen);next.add(id)
  const parents=edges.filter(edge=>edge.to===id)
  const value=parents.length?Math.min(rows.length,Math.max(...parents.map(edge=>depth(edge.from,next)))+1):0
  depths.set(id,value);return value
 }
 for(const row of rows)depth(row.id)
 const championship=rows.some(row=>/^(?:总)?决赛$/.test(text(row.roundName))&&row.reviewStage==='knockout')
 const final=rows.find(row=>/^(?:总)?决赛$/.test(text(row.roundName))&&row.reviewStage==='knockout')
 const roots=rows.filter(row=>!edges.some(edge=>edge.to===row.id)).sort((a,b)=>number(a)-number(b)),rootOrder=[]
 function leaves(id,seen=new Set()){if(seen.has(id))return;seen.add(id);const parents=edges.filter(edge=>edge.to===id&&edge.type==='match_winner').sort((a,b)=>a.side==='home'?-1:1);if(!parents.length){if(!rootOrder.includes(id))rootOrder.push(id)}else for(const edge of parents)leaves(edge.from,seen)}
 if(final)leaves(final.id)
 for(const root of roots)if(!rootOrder.includes(root.id))rootOrder.push(root.id)
 const {cardWidth:width,columnGap:gapX,cardHeight:height,rowGap:gapY}=geometry,positions=new Map(),nodes=[],columns=[]
 const maximum=Math.max(...depths.values(),0)
 for(let level=0;level<=maximum;level++){
  const batch=rows.filter(row=>depths.get(row.id)===level)
  const desired=row=>{const parents=edges.filter(edge=>edge.to===row.id).map(edge=>positions.get(edge.from)).filter(Boolean);return parents.length?parents.reduce((sum,node)=>sum+node.y,0)/parents.length:Math.max(0,rootOrder.indexOf(row.id))*(height+gapY)+geometry.headerSpace}
  batch.sort((a,b)=>desired(a)-desired(b)||Number(b.reviewStage==='knockout')-Number(a.reviewStage==='knockout')||number(a)-number(b))
  let bottom=0
  for(const row of batch){const y=Math.max(desired(row),bottom+geometry.headerSpace),rootIndex=rootOrder.indexOf(row.id),node={row,x:level*(width+gapX)+geometry.padding,y,width,height,half:championship&&level===0&&rootOrder.length>1?(rootIndex<Math.ceil(rootOrder.length/2)?'上半区':'下半区'):''};positions.set(row.id,node);nodes.push(node);bottom=y+height+gapY-geometry.headerSpace}
  columns.push({x:level*(width+gapX)+geometry.padding,label:level===0?template.firstColumn:level===maximum?template.lastColumn:template.middleColumn})
 }
 const paths=edges.flatMap(edge=>{const from=positions.get(edge.from),to=positions.get(edge.to);if(!from||!to||to.x<=from.x)return[];const x1=from.x+width,y1=from.y+height/2,x2=to.x,y2=to.y+(edge.side==='home'?geometry.homeAnchor:geometry.awayAnchor),middle=x1+gapX*(edge.type==='match_loser'?.65:.4);return [{...edge,d:`M${x1},${y1} H${middle} V${y2} H${x2}`,labelX:middle+4,labelY:y2-7}]})
 const label=roots.map(row=>text(row.roundName)).find(Boolean) || text(rows[0]?.roundName) || '淘汰赛'
 return {id:rows[0].id,templateId:template.id,templateVersion:BRACKET_TEMPLATE_VERSION,championship,title:championship?'争冠签表':label.replace(/交叉.*$/,'')+'签表',nodes,paths,columns,width:(maximum+1)*(width+gapX)-gapX+geometry.padding*2,height:Math.max(...nodes.map(node=>node.y+height),220)+24,cycle:cycles.size>0}
}
