(function(root){
  function judge(result,width,height,quality){
    var box=result&&result.detection&&result.detection.box
    if(!box||!width||!height)return{ready:false,hint:'请将面部放入取景框'}
    var size=box.height/height,cx=(box.x+box.width/2)/width,cy=(box.y+box.height/2)/height
    if(size<.28)return{ready:false,hint:'请靠近一点'}
    if(size>.68||box.width/width>.70)return{ready:false,hint:'请后退一点'}
    if(Math.abs(cx-.5)>.12||Math.abs(cy-.5)>.15)return{ready:false,hint:'请将面部移到取景框中央'}
    if(box.x<0||box.y<0||box.x+box.width>width||box.y+box.height>height)return{ready:false,hint:'请保持整张脸在取景框内'}
    if(quality&&quality.light<45)return{ready:false,hint:'光线太暗，请面向光源'}
    if(quality&&quality.light>235)return{ready:false,hint:'光线太强，请避开直射光'}
    if(Number(result.detection.score||0)<.65)return{ready:false,hint:'请保持不动，让面部更清晰'}
    return{ready:true,hint:'位置合适，请正视镜头并保持不动'}
  }
  function inspect(result,frame){
    var box=result&&result.detection&&result.detection.box,quality=null
    if(box){var small=document.createElement('canvas');small.width=32;small.height=32;var ctx=small.getContext('2d');ctx.drawImage(frame,Math.max(0,box.x),Math.max(0,box.y),box.width,box.height,0,0,32,32);var pixels=ctx.getImageData(0,0,32,32).data,sum=0;for(var i=0;i<pixels.length;i+=4)sum+=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];quality={light:sum/1024}}
    return judge(result,frame.width,frame.height,quality)
  }
  root.SxfFaceGuide={judge:judge,inspect:inspect}
})(window);
