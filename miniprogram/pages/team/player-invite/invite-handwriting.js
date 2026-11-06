var core=require('./invite-handwriting-core')
var glyphs=Object.assign({},core.glyphs),pending={}
var base='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/football/public-assets/team-invite-handwriting-v1/'
function bucketFor(char){return (char.codePointAt(0)>>>8).toString(16)}
function loadBucket(api,bucket){
  if(pending[bucket])return pending[bucket]
  pending[bucket]=new Promise(function(resolve,reject){
    var done=false,timer=setTimeout(function(){finish(new Error('手写素材下载超时，请重试'))},15000)
    function finish(error){if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve()}
    try{api.cloud.downloadFile({fileID:base+'glyphs-'+bucket+'.json',success:function(file){api.getFileSystemManager().readFile({filePath:file.tempFilePath,encoding:'utf8',success:function(result){try{var data=JSON.parse(result.data);if(data.units!==core.units || !data.glyphs)throw Error('invalid');Object.assign(glyphs,data.glyphs);finish()}catch(error){finish(new Error('手写素材无效，请重试'))}},fail:function(){finish(new Error('手写素材读取失败，请重试'))}})},fail:function(){finish(new Error('手写素材下载失败，请重试'))}})}catch(error){finish(new Error('手写素材暂不可用，请重试'))}
  }).catch(function(error){delete pending[bucket];throw error})
  return pending[bucket]
}
function load(api,name){
  var chars=Array.from(String(name || '')),buckets=[]
  chars.forEach(function(char){if(!glyphs[String(char.codePointAt(0))] && buckets.indexOf(bucketFor(char))<0)buckets.push(bucketFor(char))})
  return Promise.all(buckets.map(function(bucket){return loadBucket(api,bucket)})).then(function(){if(chars.some(function(char){return !glyphs[String(char.codePointAt(0))]}))throw new Error('署名含不支持的字符，请填写姓名');return {units:core.units,glyphs:glyphs}})
}
function drawText(context,text,x,y,size,maxWidth,data){
  var chars=Array.from(String(text || '')),rows=chars.map(function(char){var row=data.glyphs[String(char.codePointAt(0))];if(!row)throw Error('缺少手写字形');return row})
  var width=rows.reduce(function(sum,row){return sum+row[0]},0),scale=Math.min(size/data.units,maxWidth/Math.max(width,1)),offset=-width*scale/2
  rows.forEach(function(row){context.save();context.translate(x+offset,y);context.scale(scale,-scale);context.beginPath();row[1].forEach(function(op){if(op[0]===0)context.moveTo(op[1],op[2]);else if(op[0]===1)context.lineTo(op[1],op[2]);else if(op[0]===2)context.bezierCurveTo(op[1],op[2],op[3],op[4],op[5],op[6]);else context.closePath()});context.fill();context.restore();offset+=row[0]*scale})
}
module.exports={quotes:core.quotes,load:load,drawText:drawText}
