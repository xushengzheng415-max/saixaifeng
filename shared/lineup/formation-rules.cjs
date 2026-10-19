var data=require('./formation-data.json')
var aliases={8:{'3-3-2':'3-3-1','4-2-2':'3-2-2','4-3-1':'4-2-1','1-3-3-1':'1-3-2-1'}}
function normalizeId(count,id){return (aliases[count] || {})[id] || id}
function formationsFor(count){var source=(data[count+'人制'] || {}).formations || {};return Object.keys(source).filter(function(id){var p=source[id].positions || [];return p.length===Number(count)&&p.filter(function(row){return row.role==='GK'}).length===1}).map(function(id){return {id:id,label:id,name:source[id].name,positions:source[id].positions}})}
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
module.exports={formationsFor:formationsFor,formationFor:formationFor,normalizeId:normalizeId,validate:validate,idOf:idOf}
