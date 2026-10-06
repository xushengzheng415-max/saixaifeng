(function () {
  'use strict'
  var scriptUrl = document.currentScript && document.currentScript.src || location.href
  var workerUrl = new URL('./identity-photo-worker.js?v=20261001-smooth1', scriptUrl).href

  async function dimensions(file) {
    var bytes = await file.slice(0, 262144).arrayBuffer(), view = new DataView(bytes)
    var width = 0, height = 0, orientation = 1
    if (view.byteLength > 24 && view.getUint32(0) === 0x89504e47) return { width:view.getUint32(16), height:view.getUint32(20), orientation:1 }
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null
    for (var i = 2; i + 4 < view.byteLength;) {
      if (view.getUint8(i) !== 255) { i++; continue }
      var marker = view.getUint8(i + 1)
      if (marker === 0xd9 || marker === 0xda) break
      if (marker === 0xd8 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) { i += 2; continue }
      var length = view.getUint16(i + 2), end = i + 2 + length
      if (length < 2 || end > view.byteLength) break
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].indexOf(marker) >= 0 && length >= 7) { height = view.getUint16(i + 5); width = view.getUint16(i + 7) }
      if (marker === 0xe1 && length > 16 && view.getUint32(i + 4) === 0x45786966) {
        var tiff = i + 10, little = view.getUint16(tiff) === 0x4949
        var ifd = tiff + view.getUint32(tiff + 4, little)
        if (ifd + 2 < end) {
          var count = Math.min(view.getUint16(ifd, little), 128)
          for (var k = 0; k < count; k++) { var p = ifd + 2 + k * 12; if (p + 12 > end) break; if (view.getUint16(p, little) === 0x0112) { orientation = view.getUint16(p + 8, little); break } }
        }
      }
      i = end
    }
    if (!width || !height) return null
    return { width:orientation >= 5 && orientation <= 8 ? height : width, height:orientation >= 5 && orientation <= 8 ? width : height, orientation:orientation }
  }

  function watermark(canvas) {
    var x = canvas.getContext('2d'), w = canvas.width, h = canvas.height
    x.save(); x.translate(w / 2, h / 2); x.rotate(-Math.PI / 7); x.globalAlpha = .17; x.fillStyle = '#0b4c2f'
    x.font = 'bold ' + Math.max(16, Math.round(w * .035)) + 'px sans-serif'; x.textAlign = 'center'
    for (var y = -h; y <= h; y += Math.max(72, Math.round(h * .28))) x.fillText('赛小蜂足球 · 球员身份核验专用', 0, y, w * 1.3)
    x.restore(); x.save(); var strip = Math.max(24, Math.round(h * .07)); x.fillStyle = 'rgba(255,255,255,.76)'; x.fillRect(0,h-strip,w,strip)
    x.fillStyle = '#274235'; x.font = '600 ' + Math.max(11,Math.round(w*.018)) + 'px sans-serif'; x.textAlign='right'
    x.fillText('赛小蜂足球 · 仅用于球员登记核验',w-12,h-9);x.restore()
  }
  function canvasBlob(canvas, quality) {
    return new Promise(function(resolve,reject) { canvas.toBlob(function(blob) { if(blob) resolve(blob); else reject(new Error('照片处理失败，请重新选择')) },'image/jpeg',quality) })
  }
  async function mainThread(file, meta, cancelled) {
    await new Promise(function(resolve) { setTimeout(resolve,0) })
    var scale = meta ? Math.min(1,1600/Math.max(meta.width,meta.height)) : 1, bitmap, url
    if (window.createImageBitmap) {
      var options={imageOrientation:'from-image'}
      if(meta){options.resizeWidth=Math.max(1,Math.round(meta.width*scale));options.resizeHeight=Math.max(1,Math.round(meta.height*scale));options.resizeQuality='high'}
      bitmap=await window.createImageBitmap(file,options)
    } else {
      url=URL.createObjectURL(file)
      try { bitmap=await new Promise(function(resolve,reject){var img=new Image();img.onload=function(){resolve(img)};img.onerror=function(){reject(new Error('照片无法读取，请重新拍摄'))};img.src=url}) } finally { URL.revokeObjectURL(url) }
    }
    try {
      if(cancelled()) throw new Error('已取消')
      var width=bitmap.width||bitmap.naturalWidth,height=bitmap.height||bitmap.naturalHeight
      scale=Math.min(1,1600/Math.max(width,height));var original=document.createElement('canvas');original.width=Math.round(width*scale);original.height=Math.round(height*scale)
      var x=original.getContext('2d',{alpha:false});x.fillStyle='#fff';x.fillRect(0,0,original.width,original.height);x.drawImage(bitmap,0,0,original.width,original.height)
      var originalBlob=await canvasBlob(original,.86);if(originalBlob.size>1500000)originalBlob=await canvasBlob(original,.72)
      await new Promise(function(resolve){setTimeout(resolve,0)})
      if(cancelled()) throw new Error('已取消')
      scale=Math.min(1,1200/Math.max(original.width,original.height));var review=document.createElement('canvas');review.width=Math.round(original.width*scale);review.height=Math.round(original.height*scale)
      review.getContext('2d').drawImage(original,0,0,review.width,review.height);watermark(review);var reviewBlob=await canvasBlob(review,.82)
      return { original:originalBlob, review:reviewBlob, width:original.width, height:original.height, cropped:false, mode:'compatible' }
    } finally { if(bitmap&&bitmap.close)bitmap.close() }
  }

  function prepare(file) {
    var worker=null,timer=null,cancelled=false,cancelReject=null
    var promise=new Promise(function(resolve,reject) {
      cancelReject=reject
      dimensions(file).then(function(meta) {
        if(cancelled) return
        if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) return mainThread(file,meta,function(){return cancelled}).then(resolve,reject)
        function fallback(){if(worker)worker.terminate();worker=null;if(timer)clearTimeout(timer);if(!cancelled)mainThread(file,meta,function(){return cancelled}).then(resolve,reject)}
        try {
          worker=new Worker(workerUrl)
          worker.onmessage=function(event){if(timer)clearTimeout(timer);if(worker)worker.terminate();worker=null;if(cancelled)return;if(event.data.error){fallback();return}resolve(event.data)}
          worker.onerror=function(event){event.preventDefault();fallback()}
          timer=setTimeout(function(){if(worker)worker.terminate();worker=null;reject(new Error('照片处理超时，请重拍或选择较小照片'))},20000)
          worker.postMessage({file:file,dimensions:meta})
        } catch(error){fallback()}
      }).catch(reject)
    })
    promise.cancel=function(){cancelled=true;if(worker)worker.terminate();if(timer)clearTimeout(timer);var e=new Error('已取消');e.code='PHOTO_CANCELLED';cancelReject(e)}
    return promise
  }
  window.SxfIdentityPhoto={prepare:prepare}
})()
