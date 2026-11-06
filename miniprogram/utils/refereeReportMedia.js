var MAX_BYTES=3*1024*1024
function imageInfo(path,platform){return new Promise(function(resolve,reject){platform.getImageInfo({src:path,success:resolve,fail:function(){reject(new Error('图片无法读取，请重新选择'))}})})}
function fileSize(path,platform){return new Promise(function(resolve,reject){platform.getFileSystemManager().getFileInfo({filePath:path,success:function(result){resolve(result.size)},fail:function(){reject(new Error('图片大小未读取，请重新选择'))}})})}
async function prepare(file,platform){
 platform=platform || wx
 var info=await imageInfo(file.tempFilePath,platform),path=file.tempFilePath,size=file.size || await fileSize(path,platform)
 if(!(info.width>0&&info.height>0))throw new Error('图片尺寸未读取，请重新选择')
 if(!['jpg','jpeg','png'].includes(String(info.type || '').toLowerCase()))throw new Error('请选择JPG或PNG原图')
 // Keep ordinary originals untouched. Large camera photos retain table detail.
 if(size>MAX_BYTES){
  var longest=Math.max(info.width,info.height),shortest=Math.min(info.width,info.height),target=Math.min(longest,Math.max(2400,900*longest/shortest))
  for(var quality of [86,72,58]){
   var options={src:file.tempFilePath,quality:quality}
   if(info.width>=info.height)options.compressedWidth=target;else options.compressedHeight=target
   path=await new Promise(function(resolve,reject){platform.compressImage(Object.assign({},options,{success:function(result){resolve(result.tempFilePath)},fail:function(){reject(new Error('图片过大，请选择3MB以内的原图'))}}))})
   size=await fileSize(path,platform)
   if(size<=MAX_BYTES)break
  }
  if(size>MAX_BYTES)throw new Error('图片超过3MB，请裁掉纸张外的空白后重选')
  info=await imageInfo(path,platform)
 }
 return {tempFilePath:path,size:size,width:info.width,height:info.height,lowResolution:Math.min(info.width,info.height)<900}
}
module.exports={prepare:prepare}
