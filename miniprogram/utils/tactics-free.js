'use strict'
var MAX_TOKENS=44
function number(value){var n=String(value==null?'':value).trim();if(!/^[1-9]\d?$/.test(n))throw Error('号码需为1–99');return n}
function point(v){var x=Number(v&&v.x),y=Number(v&&v.y);if(!isFinite(x)||!isFinite(y))throw Error('球场坐标无效');return {x:Math.round(Math.max(2,Math.min(98,x))*100)/100,y:Math.round(Math.max(2,Math.min(98,y))*100)/100}}
function normalize(data){
 if(!Array.isArray(data.tokens)||data.tokens.length>MAX_TOKENS)throw Error('号码数量超过44个')
 var players={},ids={},numbers={},counts={ours:0,rival:0}
 var tokens=data.tokens.map(function(t){var id=String(t.id||'');if(!/^[a-zA-Z0-9_-]{1,50}$/.test(id)||ids[id])throw Error('号码标记重复或无效');ids[id]=true;if(t.side!=='ours'&&t.side!=='rival')throw Error('请选择我方或对方');if(++counts[t.side]>22)throw Error('每方最多22个号码');var n=number(t.number),key=t.side+':'+n;if(numbers[key])throw Error('同一方号码不能重复');numbers[key]=true;var temporaryName=typeof t.temporaryName==='string'?t.temporaryName.trim():'';if(temporaryName&&(temporaryName.length>30||t.side!=='ours'||t.playerId))throw Error('临时球员姓名或关联无效');var playerId=String(t.playerId||'');if(playerId&&(!/^[a-zA-Z0-9_-]{1,100}$/.test(playerId)||t.side!=='ours'))throw Error('本方球员关联无效');if(playerId&&players[playerId])throw Error('同一球员不能重复上场');if(playerId)players[playerId]=true;return Object.assign({id:id,side:t.side,number:n},playerId?{playerId:playerId,playerName:String(t.playerName||'').slice(0,30)}:temporaryName?{temporaryName:temporaryName}:{},point(t))})
 var trails=data.trails||[];if(!Array.isArray(trails)||trails.length>30)throw Error('最多保存30条轨迹');trails=trails.map(function(t){if(['red','blue'].indexOf(t.color)<0||!Array.isArray(t.points)||t.points.length<2||t.points.length>80)throw Error('轨迹格式无效');return {color:t.color,points:t.points.map(point)}})
 return {boardMode:'free',tokens:tokens,ball:point(data.ball||{x:50,y:50}),trails:trails}
}
function seed(count){
 count=Number(count);if([5,7,8,9,11].indexOf(count)<0)count=11
 var tokens=[];['ours','rival'].forEach(function(side){for(var i=0;i<count;i++){var x=i===0?7:18+Math.floor((i-1)/3)*9,y=i===0?50:18+((i-1)%3)*32;tokens.push({id:side+'-'+(i+1),side:side,number:String(i+1),x:side==='ours'?x:100-x,y:y})}})
 return {boardMode:'free',tokens:tokens,ball:{x:50,y:50},trails:[]}
}
function flip(data){return {tokens:data.tokens.map(function(t){return Object.assign({},t,{x:100-t.x,y:100-t.y})}),ball:{x:100-data.ball.x,y:100-data.ball.y},trails:(data.trails||[]).map(function(t){return {color:t.color,points:t.points.map(function(p){return {x:100-p.x,y:100-p.y}})}})}}
module.exports={MAX_TOKENS:MAX_TOKENS,number:number,point:point,normalize:normalize,seed:seed,flip:flip}
