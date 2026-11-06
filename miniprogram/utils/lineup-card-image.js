// Batch visible-card requests by the authorized match scope. No completed private-card cache.
var jobs=new Map(),waiting=[],active=0,timer=null,started=new Set(),running=new Map()
function keyFor(context,playerId){return [context.tournamentId,context.matchId,context.side,playerId,context.templateId,context.publishedVersion,context.cardDataVersion,context.dataVersion,context.requestVersion].join('|')}
function scopeFor(context){return [context.tournamentId,context.matchId,context.side].join('|')}
function schedule(){if(timer!==null)return;timer=setTimeout(function(){timer=null;pump()},0)}
function settle(job,error,card){jobs.delete(job.key);if(error)job.reject(error);else job.resolve(card)}
function pump(){
 while(active<2&&waiting.length){
  var first=waiting.shift(),batch=[first],limit=started.has(first.scope)?6:3
  started.add(first.scope)
  for(var i=0;i<waiting.length&&batch.length<limit;){if(waiting[i].scope===first.scope)batch.push(waiting.splice(i,1)[0]);else i++}
  send(batch)
 }
}
function send(batch){
 active++;var context=batch[0].context,scope=batch[0].scope;running.set(scope,(running.get(scope)||0)+1)
 wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'sharedEventOperation',tournamentId:context.tournamentId,mode:'matches',operation:'lineupCardImage',id:context.matchId,side:context.side,playerIds:batch.map(function(job){return job.playerId})}}).then(function(reply){
  var result=reply.result || {};if(!result.success)throw new Error('完整卡未加载，请重试')
  batch.forEach(function(job){var card=(result.cards || []).find(function(row){return row.playerId===job.playerId});if(card)settle(job,null,Object.assign({},card,{tournamentId:context.tournamentId,matchId:context.matchId,side:context.side,requestVersion:context.requestVersion||0}));else settle(job,new Error('完整卡未加载，请重试'))})
 }).catch(function(error){batch.forEach(function(job){settle(job,error)})}).finally(function(){active--;running.set(scope,running.get(scope)-1);if(!running.get(scope)&&!waiting.some(function(job){return job.scope===scope})){running.delete(scope);started.delete(scope)}pump()})
}
function read(context,playerId){
 var key=keyFor(context,playerId)
 if(jobs.has(key))return jobs.get(key)
 var promise=new Promise(function(resolve,reject){waiting.push({key:key,scope:scopeFor(context),context:context,playerId:playerId,resolve:resolve,reject:reject})})
 jobs.set(key,promise);schedule();return promise
}
module.exports={read:read}
