var FIELDS=['on','off','goals','yellow','red']
var ROLES=[{id:'unknown',name:'待确认'},{id:'starter',name:'首发'},{id:'substitute',name:'替补'},{id:'absent',name:'不出场'}]
function minutes(value){var text=String(value==null?'':value).trim().replace(/[′'’]/g,'');if(!text)return [];if(!/^\d{1,3}(?:\s*[,，;；、]\s*\d{1,3})*$/.test(text))throw new Error('事件分钟不清楚，请对照原图修改');var values=text.split(/[,，;；、]/).map(Number);if(values.some(function(n){return n>150}))throw new Error('事件分钟须在0至150之间');if(new Set(values).size!==values.length)throw new Error('同项分钟重复，请核对');return values}
function fingerprint(row){return JSON.stringify([row.playerId,row.role].concat(FIELDS.map(function(key){return String(row[key] || '').trim()}),[!!row.captain,!!row.goalkeeper]))}
function lineupFingerprint(row){return JSON.stringify([row.playerId,row.role,!!row.captain,!!row.goalkeeper])}
function prepare(data,players){
  var teams={home:[],away:[]}
  ;['home','away'].forEach(function(side){teams[side]=((data.teams || {})[side] || []).map(function(row,index){
    var numbers=[row.number].concat(row.numberCandidates || []).filter(function(number){return /^\d{1,3}$/.test(String(number))}).map(function(number){return String(Number(number))})
    var candidates=[row.name].concat(row.nameCandidates || []).map(function(name){return String(name || '').replace(/\s/g,'')})
    var own=(players || []).filter(function(player){return player.teamSide===side && /^\d{1,3}$/.test(String(player.jerseyNumber)) && numbers.indexOf(String(Number(player.jerseyNumber)))>=0})
    var pairs=own.filter(function(player){return candidates.indexOf(String(player.name || '').replace(/\s/g,''))>=0}),exact=pairs.length===1
    var notes=(row.reviewNotes || []).filter(function(note){return !(exact&&note==='姓名与号码需核对')});if(!exact)notes.push(own.length===1?'号码对应姓名不同，请选择并核对':'请从本队正式名单选择球员')
    return Object.assign({},row,{key:side+'-'+index,originalNumber:row.number,originalName:row.name || '',playerId:exact?pairs[0].id:'',number:exact?String(pairs[0].jerseyNumber):row.number,name:exact?pairs[0].name:row.name || '',identityNeedsReview:!exact || row.role==='unknown',reviewNotes:notes,reviewConfirmedFingerprint:'',lineupConfirmedFingerprint:''})
  })})
  return teams
}
function checkRow(row,lineupOnly){
  if(row.role==='absent' || row.role==='skip')return
  if(!row.playerId)throw new Error('请选择本队名单球员')
  if(['starter','substitute'].indexOf(row.role)<0)throw new Error('请确认首发或替补')
  if(!lineupOnly)FIELDS.forEach(function(key){minutes(row[key])})
}
function needsReview(row){return row.role!=='absent' && row.role!=='skip' && (!!(row.reviewNotes || []).length || !row.playerId || row.role==='unknown' || !!row.reviewConfirmedFingerprint) && row.reviewConfirmedFingerprint!==fingerprint(row)}
function needsLineupReview(row){return row.role!=='absent' && row.role!=='skip' && (!!row.identityNeedsReview || !row.playerId || row.role==='unknown') && row.lineupConfirmedFingerprint!==lineupFingerprint(row)}
function groups(teams){
  var output=[]
  ;['home','away'].forEach(function(side){var rows=(teams[side] || []).filter(function(row){return row.playerId && ['starter','substitute'].indexOf(row.role)>=0}),byMinute={}
    rows.forEach(function(row){['on','off'].forEach(function(field){var values;try{values=minutes(row[field])}catch(error){return}values.forEach(function(minute){var group=byMinute[minute] || (byMinute[minute]={side:side,minute:minute,inIds:[],outIds:[],inNames:[],outNames:[]});var incoming=field==='on';group[incoming?'inIds':'outIds'].push(row.playerId);group[incoming?'inNames':'outNames'].push(row.name || row.originalName)})})})
    Object.keys(byMinute).forEach(function(key){var group=byMinute[key];group.key=side+'-'+key;group.inText=group.inNames.join('、') || '待补齐';group.outText=group.outNames.join('、') || '待补齐';group.warning=group.inIds.length!==group.outIds.length;output.push(group)})
  });return output.sort(function(a,b){return a.minute-b.minute})
}
function payload(teams,score,lineupOnly,playersOnField){
  var starters={home:[],away:[]},bench={home:[],away:[]}
  ;['home','away'].forEach(function(side){var seen=[];(teams[side] || []).forEach(function(row){checkRow(row,lineupOnly);if(['absent','skip'].indexOf(row.role)>=0)return;if(lineupOnly?needsLineupReview(row):needsReview(row))throw new Error((row.number || '—')+'号还有待核对内容');if(seen.indexOf(row.playerId)>=0)throw new Error('同队球员重复，请核对名单');seen.push(row.playerId);(row.role==='starter'?starters:bench)[side].push(row.playerId)})})
  if(playersOnField>0)['home','away'].forEach(function(side){if(starters[side].length>playersOnField)throw new Error((side==='home'?'主队':'客队')+'首发超过'+playersOnField+'人，请调整冲突项')})
  if(lineupOnly)return {starters:starters,bench:bench}
  var values=[score.home,score.away];if(values.some(function(value){return !/^\d{1,2}$/.test(String(value).trim())}))throw new Error('请核对双方0至99的比分')
  var substitutions=groups(teams);substitutions.forEach(function(group){if(group.warning || !group.inIds.length)throw new Error(group.minute+'分钟换上、换下人数不一致');if(group.inIds.some(function(id){return group.outIds.indexOf(id)>=0}))throw new Error(group.minute+'分钟同一球员不能同时换上换下')})
  return {teams:teams,score:{home:Number(values[0]),away:Number(values[1])},substitutions:substitutions.map(function(row){return {side:row.side,minute:row.minute,inIds:row.inIds,outIds:row.outIds}})}
}
module.exports={FIELDS:FIELDS,ROLES:ROLES,minutes:minutes,fingerprint:fingerprint,lineupFingerprint:lineupFingerprint,prepare:prepare,checkRow:checkRow,needsReview:needsReview,needsLineupReview:needsLineupReview,groups:groups,payload:payload}
