var data=require('./formation-data')
var aliases={8:{'3-3-2':'3-3-1','4-2-2':'3-2-2','4-3-1':'4-2-1','1-3-3-1':'1-3-2-1'}}
function normalizeId(count,id){return (aliases[count] || {})[id] || id}

// 统一站位基准：门将居中贴后场；其余按阵型 id 的每排人数（4-2-3-1 → 4/2/3/1）
// 由后场向前场等分纵向层次，每排横向居中均分。formation-data 只保留角色、位置名称
// 和顺序，坐标统一在这里计算，避免每套阵型各写一份手写坐标互相不一致。
// x = 距本方球门的纵深（0 本方球门，100 对方球门），门将 10；后防线 30、中场 55、锋线 80。
var GK_DEPTH=10,BACK_DEPTH=30,MID_DEPTH=55,FRONT_DEPTH=80
function bandOf(role){return role==='GK'?'GK':(/^(CB|LB|RB|DF)/.test(role)||/WB$/.test(role)||role==='SW')?'DF':/^(ST|CF|FW|LW|RW)/.test(role)?'FW':'MF'}
// 阵型 id 的各排人数之和必须等于门将以外的位置数，否则视为不可解析。
function rowSizes(id,outfieldCount){var parts=String(id || '').split('-'),sizes=[],total=0;for(var i=0;i<parts.length;i++){var value=Number(parts[i]);if(!isFinite(value)||value<1||Math.floor(value)!==value)return null;sizes.push(value);total+=value}return total===outfieldCount?sizes:null}
// id 与人数对不上时退回「后卫/中场/前锋」三档，同样是等分，不再使用手写坐标。
function bandSizes(outfield){var counts={DF:0,MF:0,FW:0};outfield.forEach(function(p){var band=bandOf(p.role);if(!counts[band])counts[band]=0;counts[band]=counts[band]+1});return ['DF','MF','FW'].map(function(band){return counts[band]}).filter(function(size){return size>0})}
function rowDepth(index,rowCount){if(rowCount<=1)return MID_DEPTH;return BACK_DEPTH-(BACK_DEPTH-FRONT_DEPTH)*index/(rowCount-1)}
function rowLateral(index,size){return size<=1?50:100*(index+0.5)/size}
function regularPositions(id,positions){
  var list=positions || []
  if(!list.length)return []
  if(String(id || '').indexOf('layout-')===0)return list
  var gk=null,outfield=[]
  list.forEach(function(p){if(!gk && p.role==='GK'){gk=p}else{outfield.push(p)}})
  if(!gk)return list
  var sizes=rowSizes(id,outfield.length) || bandSizes(outfield),points={},cursor=0
  points[gk.role]={x:GK_DEPTH,y:50}
  sizes.forEach(function(size,rowIndex){
    var x=rowDepth(rowIndex,sizes.length)
    for(var i=0;i<size;i++){var p=outfield[cursor];cursor=cursor+1;if(p)points[p.role]={x:x,y:rowLateral(i,size)}}
  })
  return list.map(function(p){
    var point=points[p.role],copy={}
    for(var key in p)copy[key]=p[key]
    if(point){copy.x=point.x;copy.y=point.y}
    return copy
  })
}
function formationsFor(count){var source=(data[count+'人制'] || {}).formations || {};return Object.keys(source).filter(function(id){var p=source[id].positions || [];return p.length===Number(count)&&p.filter(function(row){return row.role==='GK'}).length===1}).map(function(id){return {id:id,label:id,name:source[id].name,positions:regularPositions(id,source[id].positions)}})}
function formationFor(count,id){id=normalizeId(count,id);return formationsFor(count).filter(function(row){return row.id===id})[0] || null}
function idOf(row){return String(row && (row.playerId || row.id || row._id) || '')}
function validate(count,layout,ids){
 var formation=formationFor(count,layout && layout.formation)
 if(!formation)throw new Error('阵型不属于本场人数，请重新选择')
 var entries=layout.positions || [],roles=formation.positions.map(function(row){return row.role}),seenRoles=[],seenPlayers=[],byId={}
 if(!Array.isArray(entries)||entries.length!==Number(count))throw new Error('请补齐首发位置')
 entries.forEach(function(entry){var id=idOf(entry),role=String(entry.role || '');if(ids.indexOf(id)<0||roles.indexOf(role)<0||seenRoles.indexOf(role)>=0||seenPlayers.indexOf(id)>=0)throw new Error('首发位置与球员不一致，请重新排阵');seenRoles.push(role);seenPlayers.push(id);byId[id]=role})
 return {formation:formation.id,roles:byId}
}
module.exports={formationsFor:formationsFor,formationFor:formationFor,normalizeId:normalizeId,validate:validate,idOf:idOf,regularPositions:regularPositions}
