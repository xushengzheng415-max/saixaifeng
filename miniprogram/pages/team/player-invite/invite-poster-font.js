var base='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/football/public-assets/team-invite-v2/'
var fallback='KaiTi, STKaiti, serif'
function loadFont(api) {
  if (!api.loadFontFace || !api.cloud || !api.cloud.getTempFileURL) return Promise.resolve(fallback)
  return new Promise(function(resolve) {
    var done=false,timer=setTimeout(function(){finish(fallback)},15000)
    function finish(font){if(done)return;done=true;clearTimeout(timer);resolve(font)}
    function attempt(urls,index){
      if(done)return
      if(index>=urls.length)return finish(fallback)
      var settled=false,limit=setTimeout(function(){next()},5000)
      function next(){if(settled)return;settled=true;clearTimeout(limit);attempt(urls,index+1)}
      try{api.loadFontFace({global:true,family:'SxfInviteHand',source:'url("'+urls[index]+'")',scopes:['native','webview'],success:function(){if(settled)return;settled=true;clearTimeout(limit);finish('SxfInviteHand')},fail:next})}catch(error){next()}
    }
    try{api.cloud.getTempFileURL({fileList:[base+'handwriting-common.woff2',base+'handwriting-common.ttf'],success:function(result){var urls=(result.fileList || []).filter(function(file){return file.tempFileURL && (!file.status || file.status===0)}).map(function(file){return file.tempFileURL});attempt(urls,0)},fail:function(){finish(fallback)}})}catch(error){finish(fallback)}
  })
}
module.exports={loadFont:loadFont}
