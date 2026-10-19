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
export function bracketGroups(input=[],templateId='auto',availableWidth=1400){
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
   components.push(layout(division.rows.filter(row=>ids.has(row.id)),edges.filter(edge=>ids.has(edge.from)&&ids.has(edge.to)),templateId,availableWidth))
  }
  components.sort((a,b)=>Number(b.championship)-Number(a.championship)||number(a.nodes[0].row)-number(b.nodes[0].row))
  return {...division,components,issues:[...new Set(issues)]}
 })
}
function layout(rows,edges,templateId,availableWidth){
 const template=resolveBracketTemplate(rows,templateId),geometry=template.geometry
 const {cardHeight:height,rowGap}=geometry
 const byId=new Map(rows.map(row=>[row.id,row]))
 const incoming=(id,side)=>edges.find(edge=>edge.to===id&&edge.side===side&&edge.type==='match_winner')
 const parents=id=>edges.filter(edge=>edge.to===id&&edge.type==='match_winner')
 let cycle=false
 function levels(id,seen=new Set()){
  if(seen.has(id)){cycle=true;return 0}const next=new Set(seen);next.add(id)
  return 1+Math.max(0,...parents(id).map(edge=>levels(edge.from,next)))
 }
 const terminal=rows.filter(row=>!edges.some(edge=>edge.from===row.id&&edge.type==='match_winner'))
 terminal.sort((a,b)=>Number(/^(?:总)?决赛$/.test(text(b.roundName)))-Number(/^(?:总)?决赛$/.test(text(a.roundName)))||levels(b.id)-levels(a.id)||number(a)-number(b))
 const primary=terminal[0] || rows.slice().sort((a,b)=>number(a)-number(b))[0]
 const depth=levels(primary.id),columns=depth*2+1
 const gap=availableWidth<1200?24:geometry.columnGap
 const width=Math.max(144,Math.min(geometry.cardWidth,Math.floor((availableWidth-geometry.padding*2-gap*(columns-1))/columns)))
 const centerX=geometry.padding+depth*(width+gap)
 const nodes=[],paths=[],positions=new Map(),used=new Set()
 const add=(row,side,kind,x,y,half='',label='')=>{
  const node={id:row.id+'|'+kind+'|'+side,row,side,kind,x,y,width,height,half,label}
  nodes.push(node);if(kind==='winner')positions.set(row.id,node)
  return node
 }
 function join(from,to,direction,type='match_winner'){
  const right=direction==='left',x1=from.x+(right?width:0),x2=to.x+(right?0:width)
  const y1=from.y+height/2,y2=to.y+height/2,middle=x1+(right?gap/2:-gap/2)
  paths.push({type,d:`M${x1},${y1} H${middle} V${y2} H${x2}`})
 }
 // Each input team is its own strip. A match produces one winner strip.
 // Independent left/right cursors keep leaf rows evenly spaced at any depth.
 const cursors={left:geometry.headerSpace,right:geometry.headerSpace}
 function input(row,side,direction,distance,seen=new Set()){
  const edge=incoming(row.id,side),predecessor=edge&&byId.get(edge.from)
  const x=centerX+(direction==='left'?-1:1)*distance*(width+gap)
  const half=direction==='left'?'上半区':'下半区'
  if(predecessor&&!seen.has(predecessor.id))return branch(predecessor,direction,distance,seen)
  if(predecessor)cycle=true
  const y=cursors[direction];cursors[direction]+=height+rowGap
  return add(row,side,'team',x,y,half)
 }
 function branch(row,direction,distance,seen=new Set()){
  const next=new Set(seen);next.add(row.id);used.add(row.id)
  const home=input(row,'home',direction,distance+1,next),away=input(row,'away',direction,distance+1,next)
  const x=centerX+(direction==='left'?-1:1)*distance*(width+gap)
  const node=add(row,'','winner',x,(home.y+away.y)/2,direction==='left'?'上半区':'下半区')
  join(home,node,direction);join(away,node,direction)
  cursors[direction]+=rowGap
  return node
 }
 used.add(primary.id)
 const left=input(primary,'home','left',1,new Set([primary.id]))
 const right=input(primary,'away','right',1,new Set([primary.id]))
 // Align the two halves by their own centre, including asymmetrical/byes trees.
 const midpoint=Math.max(left.y,right.y)
 for(const half of ['上半区','下半区']){
  const root=half==='上半区'?left:right,delta=midpoint-root.y
  if(delta){for(const node of nodes)if(node.half===half)node.y+=delta}
 }
 // Rebuild paths after alignment so they always meet strip centres.
 paths.length=0
 for(const node of nodes.filter(node=>node.kind==='winner')){
  for(const side of ['home','away']){
   const edge=incoming(node.row.id,side)
   const child=edge?positions.get(edge.from):nodes.find(item=>item.row.id===node.row.id&&item.kind==='team'&&item.side===side)
   if(child)join(child,node,node.half==='上半区'?'left':'right')
  }
 }
 const championship=/^(?:总)?决赛$/.test(text(primary.roundName))
 const final=add(primary,'','winner',centerX,midpoint,'',championship?'冠军':text(primary.roundName || primary.phaseLabel || '晋级'))
 join(left,final,'left');join(right,final,'right')
 const bottom=Math.max(...nodes.map(node=>node.y+height))
 let nextY=bottom+100
 const extraRows=rows.filter(row=>!used.has(row.id)).sort((a,b)=>number(a)-number(b))
 for(const row of extraRows){
  const home=add(row,'home','team',centerX-width-gap,nextY,'')
  const away=add(row,'away','team',centerX+width+gap,nextY,'')
  const result=add(row,'','winner',centerX,nextY,'',text(row.roundName || row.phaseLabel || '排位赛'))
  join(home,result,'left','match_loser');join(away,result,'right','match_loser')
  nextY+=height+70
 }
 const first=rows.filter(row=>!edges.some(edge=>edge.to===row.id)).sort((a,b)=>number(a)-number(b))[0]
 const title=championship?'争冠晋级图':text(first?.roundName || primary.roundName || '淘汰赛').replace(/交叉.*$/,'')+'晋级图'
 return {id:primary.id,templateId:template.id,templateVersion:BRACKET_TEMPLATE_VERSION,championship,title,nodes,paths,columns:[],width:(depth*2+1)*(width+gap)-gap+geometry.padding*2,height:Math.max(...nodes.map(node=>node.y+height))+geometry.padding,cycle}
}
