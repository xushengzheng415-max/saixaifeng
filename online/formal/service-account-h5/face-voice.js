(function(root){
  var phrases=[['retry-mouth','再次张嘴'],['close-mouth','闭嘴'],['open-mouth','张嘴'],['retry-turn','未采集'],['return-front','回到正面'],['return-front','回正'],['slight-turn','轻微转头'],['good','正面不动'],['near','靠近'],['far','后退'],['center','中央'],['center','放入取景框'],['center','整张脸'],['dark','太暗'],['bright','太强'],['clear','清晰'],['single','一名球员'],['front','正视镜头'],['front','保持正面'],['comparing','正在比对'],['good','位置合适']]
  function create(){
    var audio=new Audio(),enabled=true,last='',lastAt=0,disposed=false,blocked=false,pending=null
    try{enabled=localStorage.getItem('sxf_face_voice')!=='off'}catch(_){}
    audio.preload='auto'
    function key(text,kind){if(kind==='success')return'passed';if(kind==='error')return'failed';if(text.indexOf('位置合适')>=0)return'good';for(var i=0;i<phrases.length;i++)if(text.indexOf(phrases[i][1])>=0)return phrases[i][0];return''}
    function say(text,kind,force){
      var id=key(text,kind),now=Date.now();if(disposed||!enabled||!id)return Promise.resolve()
      if((id==='return-front'||id==='retry-turn'||id==='open-mouth'||id==='close-mouth'||id==='retry-mouth')&&id!==last)force=true
      if(pending){clearTimeout(pending);pending=null}
      if(!force&&id===last&&now-lastAt<8000)return Promise.resolve()
      if(!force&&now-lastAt<2500&&kind!=='success'&&kind!=='error'){pending=setTimeout(function(){pending=null;say(text,kind,true)},2500-(now-lastAt));return Promise.resolve()}
      audio.pause();audio.src='./assets/face-voice/'+id+'.mp3';last=id;lastAt=now
      return Promise.resolve(audio.play()).then(function(){blocked=false},function(){blocked=true})
    }
    function stop(){if(pending){clearTimeout(pending);pending=null}audio.pause();try{audio.currentTime=0}catch(_){}last='';lastAt=0}
    return{say:say,enabled:function(){return enabled},blocked:function(){return blocked},toggle:function(){enabled=blocked?true:!enabled;try{localStorage.setItem('sxf_face_voice',enabled?'on':'off')}catch(_){}if(!enabled)stop();else say('请正视镜头','ready',true);return enabled},stop:stop,dispose:function(){disposed=true;stop();audio.removeAttribute('src');audio.load()}}
  }
  root.SxfFaceVoice={create:create}
})(window);
