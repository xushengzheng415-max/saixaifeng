'use strict'
self.onmessage=async function(event){
  var bitmap=null
  try {
    var file=event.data.file,meta=event.data.dimensions,options={imageOrientation:'from-image'}
    if(meta){var scale=Math.min(1,1600/Math.max(meta.width,meta.height));options.resizeWidth=Math.max(1,Math.round(meta.width*scale));options.resizeHeight=Math.max(1,Math.round(meta.height*scale));options.resizeQuality='high'}
    bitmap=await createImageBitmap(file,options)
    var width=bitmap.width,height=bitmap.height,ratio=Math.min(1,1600/Math.max(width,height))
    var original=new OffscreenCanvas(Math.round(width*ratio),Math.round(height*ratio)),x=original.getContext('2d',{alpha:false})
    x.fillStyle='#fff';x.fillRect(0,0,original.width,original.height);x.drawImage(bitmap,0,0,original.width,original.height);bitmap.close();bitmap=null
    var originalBlob=await original.convertToBlob({type:'image/jpeg',quality:.86})
    if(originalBlob.size>1500000)originalBlob=await original.convertToBlob({type:'image/jpeg',quality:.72})
    ratio=Math.min(1,1200/Math.max(original.width,original.height));var review=new OffscreenCanvas(Math.round(original.width*ratio),Math.round(original.height*ratio));x=review.getContext('2d');x.drawImage(original,0,0,review.width,review.height)
    var w=review.width,h=review.height;x.save();x.translate(w/2,h/2);x.rotate(-Math.PI/7);x.globalAlpha=.17;x.fillStyle='#0b4c2f';x.font='bold '+Math.max(16,Math.round(w*.035))+'px sans-serif';x.textAlign='center'
    for(var y=-h;y<=h;y+=Math.max(72,Math.round(h*.28)))x.fillText('赛小蜂足球 · 球员身份核验专用',0,y,w*1.3)
    x.restore();x.save();var strip=Math.max(24,Math.round(h*.07));x.fillStyle='rgba(255,255,255,.76)';x.fillRect(0,h-strip,w,strip);x.fillStyle='#274235';x.font='600 '+Math.max(11,Math.round(w*.018))+'px sans-serif';x.textAlign='right';x.fillText('赛小蜂足球 · 仅用于球员登记核验',w-12,h-9);x.restore()
    var reviewBlob=await review.convertToBlob({type:'image/jpeg',quality:.82})
    self.postMessage({original:originalBlob,review:reviewBlob,width:original.width,height:original.height,cropped:false,mode:'worker'})
  }catch(error){self.postMessage({error:String(error&&error.message||'照片处理失败')})}finally{if(bitmap)bitmap.close()}
}
