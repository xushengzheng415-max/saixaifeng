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
 const {cardWidth:width,cardHeight:height,columnGap:gap,rowGap:rowGap}=geometry
 const byId=new Map(rows.map(row=>[row.id,row])),parents=id=>edges.filter(edge=>edge.to===id&&edge.type==='match_winner').sort((a,b)=>a.side==='home'?-1:1)
 let cycle=false
 function treeSize(id,seen=new Set()) {if(seen.has(id)){cycle=true;return 0}const next=new Set(seen);next.add(id);return 1+parents(id).reduce((sum,edge)=>sum+treeSize(edge.from,next),0)}
 const terminal=rows.filter(row=>parents(row.id).length&&!edges.some(edge=>edge.from===row.id&&edge.type==='match_winner'))
 terminal.sort((a,b)=>Number(/^(?:总)?决赛$/.test(String(b.roundName)))-Number(/^(?:总)?决赛$/.test(String(a.roundName)))||treeSize(b.id)-treeSize(a.id)||number(a)-number(b))
 const primary=terminal[0] || rows.slice().sort((a,b)=>number(a)-number(b))[0]
 function levels(id,seen=new Set()){if(seen.has(id)){cycle=true;return 0}const next=new Set(seen);next.add(id);return parents(id).length?1+Math.max(...parents(id).map(edge=>levels(edge.from,next))):0}
 function leafCount(id,seen=new Set()){if(seen.has(id))return 1;const next=new Set(seen);next.add(id);const list=parents(id);return list.length?list.reduce((sum,edge)=>sum+leafCount(edge.from,next),0):1}
 const depth=Math.max(0,levels(primary.id)),centerX=geometry.padding+depth*(width+gap),mainParents=parents(primary.id)
 const sideLeaves=Math.max(1,...mainParents.map(edge=>leafCount(edge.from))),step=height+rowGap
 const treeHeight=Math.max(step,sideLeaves*step),nodes=[],positions=new Map()
 function add(row,x,y,half=''){if(positions.has(row.id))return;const node={row,x,y,width,height,half};nodes.push(node);positions.set(row.id,node)}
 function place(id,side,distance,top,span,seen=new Set()){
  if(seen.has(id)){cycle=true;return}const row=byId.get(id);if(!row)return
  const next=new Set(seen);next.add(id)
  const x=centerX+(side==='left'?-1:1)*distance*(width+gap)
  add(row,x,geometry.headerSpace+top+span/2-height/2,side==='left'?'上半区':'下半区')
  const list=parents(id),total=list.reduce((sum,edge)=>sum+leafCount(edge.from),0);let offset=top
  for(const edge of list){const size=span*leafCount(edge.from)/Math.max(1,total);place(edge.from,side,distance+1,offset,size,next);offset+=size}
 }
 add(primary,centerX,geometry.headerSpace+treeHeight/2-height/2)
 mainParents.forEach((edge,index)=>place(edge.from,index===0?'left':'right',1,0,treeHeight))
 // Consolation matches remain in the same source component, below the title match.
 let nextY=geometry.headerSpace+treeHeight+34
 for(const row of rows.filter(row=>!positions.has(row.id)).sort((a,b)=>number(a)-number(b))){add(row,centerX,nextY);nextY+=height+rowGap}
 const paths=edges.flatMap(edge=>{
  const from=positions.get(edge.from),to=positions.get(edge.to);if(!from||!to)return []
  let x1,x2,y1,y2,d
  if(from.x!==to.x){const right=from.x<to.x;x1=from.x+(right?width:0);x2=to.x+(right?0:width);y1=from.y+height/2;y2=to.y+(edge.side==='home'?geometry.homeAnchor:geometry.awayAnchor);const middle=(x1+x2)/2;d=`M${x1},${y1} H${middle} V${y2} H${x2}`}
  else{x1=from.x+width/2;x2=to.x+(edge.side==='home'?width*.28:width*.72);y1=from.y+height;y2=to.y;d=`M${x1},${y1} V${(y1+y2)/2} H${x2} V${y2}`}
  return [{...edge,d}]
 })
 const championship=rows.some(row=>/^(?:总)?决赛$/.test(String(row.roundName))&&row.reviewStage==='knockout')
 const first=rows.filter(row=>!edges.some(edge=>edge.to===row.id)).sort((a,b)=>number(a)-number(b))[0]
 const title=championship?'争冠晋级图':String(first?.roundName || primary.roundName || '淘汰赛').replace(/交叉.*$/,'')+'晋级图'
 return {id:primary.id,templateId:template.id,templateVersion:BRACKET_TEMPLATE_VERSION,championship,title,nodes,paths,columns:[],width:(depth*2+1)*(width+gap)-gap+geometry.padding*2,height:Math.max(...nodes.map(node=>node.y+height))+geometry.padding+22,cycle}
}
