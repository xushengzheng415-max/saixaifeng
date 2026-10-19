// Only adapts resource loading. Card layout stays in the shared renderer.
var downloads=new Map(),fonts=new Map(),queue=[],active=0
function failure(stage){var error=new Error(stage==='font'?'字体未加载，请重试':'卡片素材未加载，请重试');error.stage=stage;return error}
function pump(){while(active<4&&queue.length){active++;var task=queue.shift();task().then(function(){active--;pump()},function(){active--;pump()})}}
function download(url){
  if(!/^https:\/\//.test(url || ''))return Promise.reject(failure('image'))
  var previous=downloads.get(url)
  if(previous&&previous.expires>Date.now())return previous.promise
  var promise=new Promise(function(resolve,reject){queue.push(function(){return new Promise(function(done){wx.downloadFile({url:url,timeout:12000,success:function(result){if(result.statusCode===200&&result.tempFilePath)resolve(result.tempFilePath);else reject(failure('image'));done()},fail:function(){reject(failure('image'));done()}})})});pump()})
  promise=promise.catch(function(error){downloads.delete(url);throw error})
  downloads.set(url,{promise:promise,expires:Date.now()+8*60*1000})
  if(downloads.size>64)downloads.delete(downloads.keys().next().value)
  return promise
}
function requiredFonts(scene){
  var names={sans:'Noto Sans SC',brush:'Ma Shan Zheng',sport:'Anton'},wanted=[]
  Object.keys(scene.layout || {}).forEach(function(key){var style=scene.layout[key];if(!style || (style.hidden&&key!=='position') || !scene.values || !scene.values[key])return;var family=names[style.font] || names.sans,weight=Number(style.weight)||600;var candidates=(scene.fonts || []).filter(function(font){return font.family===family}).sort(function(a,b){return Math.abs(a.weight-weight)-Math.abs(b.weight-weight)});if(candidates[0]&&wanted.indexOf(candidates[0])<0)wanted.push(candidates[0])})
  return wanted
}
function loadFont(font,httpsNative){
  var key=font.url+'|'+font.family+'|'+font.weight+'|'+(httpsNative?'native-https':'data-url')
  if(fonts.has(key))return fonts.get(key)
  // Native Canvas receives the HTTPS font directly. Large Chinese font data
  // URLs can fail on phones even when the simulator accepts them.
  var promise=httpsNative?new Promise(function(resolve,reject){
    if(!/^https:\/\/[^"\s]+$/.test(font.url||''))return reject(failure('font'))
    var finished=false,timer=setTimeout(function(){done(false)},6000)
    function done(ok){if(finished)return;finished=true;clearTimeout(timer);if(ok)resolve();else reject(failure('font'))}
    try{wx.loadFontFace({global:true,scopes:['native'],family:font.family,source:'url("'+font.url+'")',desc:{weight:String(font.weight||400)},success:function(){done(true)},fail:function(){done(false)}})}catch{done(false)}
  }):download(font.url).then(function(path){return new Promise(function(resolve,reject){wx.getFileSystemManager().readFile({filePath:path,encoding:'base64',success:function(result){resolve('url("data:font/'+(/\.otf$/i.test(font.name)?'otf':'ttf')+';base64,'+result.data+'")')},fail:function(){reject(failure('font'))}})})}).then(function(source){return new Promise(function(resolve,reject){wx.loadFontFace({global:true,scopes:['native'],family:font.family,source:source,desc:{weight:String(font.weight||400)},success:resolve,fail:function(){reject(failure('font'))}})})})
  promise=promise.catch(function(){fonts.delete(key);throw failure('font')});fonts.set(key,promise);return promise
}
function loadFonts(scene,options){return Promise.all(requiredFonts(scene).map(function(font){return loadFont(font,!!(options&&options.httpsNative))}))}
function image(canvas,url){return download(url).then(function(path){return new Promise(function(resolve,reject){var value=canvas.createImage();value.onload=function(){resolve(value)};value.onerror=function(){reject(failure('image'))};value.src=path})})}
module.exports={loadFonts:loadFonts,image:image,requiredFonts:requiredFonts}
