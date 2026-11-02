/**
 * 队徽裁剪 + 去背景（小程序统一入口）。
 *
 * 与 PC 端保持一致：选图后先裁成正方形，再用边缘连通算法去掉背景，
 * 同时上传「原图」和「透明图」两份。算法见 ./logo-cutout-core.js。
 *
 * 用法：
 *   logoCutout.process({ owner: this, canvasId: 'teamLogoCutout', filePath })
 *     .then(crest => logoCutout.uploadCrest({ path: crest.path, cutoutPath: crest.cutoutPath }))
 *
 * 页面/组件需要声明一个隐藏的 Canvas 2D 节点：
 *   <canvas type="2d" id="teamLogoCutout" class="logo-cutout-canvas"></canvas>
 */

var core = require('./logo-cutout-core')

var OUTPUT_SIZE = 600
// 背景像素占比太低说明没识别出背景（多数是满图logo或照片），保留原图。
var MIN_REMOVED_RATIO = 0.004
// 占比过高说明整张图几乎都是背景，去背会得到空图，同样保留原图。
var MAX_REMOVED_RATIO = 0.92

function imageInfo(src) {
  return new Promise(function(resolve, reject) {
    wx.getImageInfo({
      src: src,
      success: function(info) {
        if (!info || !info.width || !info.height) reject(new Error('无法读取队徽尺寸'))
        else resolve(info)
      },
      fail: function() { reject(new Error('无法读取队徽图片')) }
    })
  })
}

function queryCanvas(owner, canvasId) {
  return new Promise(function(resolve, reject) {
    var query = wx.createSelectorQuery()
    if (owner) query = query.in(owner)
    query.select('#' + canvasId).fields({ node: true, size: true }).exec(function(result) {
      var node = result && result[0] && result[0].node
      // 基础库不支持 Canvas 2D 时没有 node，交给调用方回退到原图上传。
      if (node) resolve(node)
      else reject(new Error('当前微信版本不支持队徽处理'))
    })
  })
}

function loadImage(canvas, src) {
  return new Promise(function(resolve, reject) {
    var image = canvas.createImage()
    image.onload = function() { resolve(image) }
    image.onerror = function() { reject(new Error('队徽图片加载失败')) }
    image.src = src
  })
}

// 预览窗口约 250px，把拖拽位移换算到原图后收敛在图片范围内。
function cropRect(info, crop) {
  var scale = Math.max(1, Number(crop && crop.scale || 1))
  var side = Math.max(1, Math.floor(Math.min(info.width, info.height) / scale))
  var shiftX = Math.floor(Number(crop && crop.offsetX || 0) * side / 250)
  var shiftY = Math.floor(Number(crop && crop.offsetY || 0) * side / 250)
  return {
    sx: Math.max(0, Math.min(info.width - side, Math.floor((info.width - side) / 2) - shiftX)),
    sy: Math.max(0, Math.min(info.height - side, Math.floor((info.height - side) / 2) - shiftY)),
    side: side
  }
}

function exportPng(canvas, size) {
  return new Promise(function(resolve, reject) {
    wx.canvasToTempFilePath({
      canvas: canvas,
      x: 0,
      y: 0,
      width: size,
      height: size,
      destWidth: size,
      destHeight: size,
      fileType: 'png',
      quality: 1,
      success: function(result) {
        if (result && result.tempFilePath) resolve(result.tempFilePath)
        else reject(new Error('队徽导出失败'))
      },
      fail: function() { reject(new Error('队徽导出失败')) }
    })
  })
}

/**
 * 裁剪 + 去背景。
 * @returns {Promise<{path:string, cutoutPath:string, cutout:boolean, ratio:number}>}
 *   path 为正方形原图（始终返回）；cutoutPath 仅在实际去掉背景时返回。
 */
function process(options) {
  var filePath = options && options.filePath
  if (!filePath) return Promise.reject(new Error('请先选择队徽图片'))
  return imageInfo(filePath).then(function(info) {
    return queryCanvas(options.owner, options.canvasId).then(function(canvas) {
      var rect = cropRect(info, options.crop)
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      var context = canvas.getContext('2d')
      context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
      // 先铺白底再绘制：与 PC 一致，避免源 PNG 的透明白在取像素时丢失 RGB。
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
      return loadImage(canvas, filePath).then(function(image) {
        context.drawImage(image, rect.sx, rect.sy, rect.side, rect.side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
        return exportPng(canvas, OUTPUT_SIZE).then(function(croppedPath) {
          var imageData = context.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
          var result = core.cutOutBackground(imageData.data, OUTPUT_SIZE, OUTPUT_SIZE)
          if (!result.removed || result.ratio < MIN_REMOVED_RATIO || result.ratio > MAX_REMOVED_RATIO) {
            return { path: croppedPath, cutoutPath: '', cutout: false, ratio: result.ratio }
          }
          context.putImageData(imageData, 0, 0)
          return exportPng(canvas, OUTPUT_SIZE).then(function(cutoutPath) {
            return { path: croppedPath, cutoutPath: cutoutPath, cutout: true, ratio: result.ratio }
          })
        })
      })
    })
  })
}

function uploadOne(filePath, cloudPath) {
  return new Promise(function(resolve, reject) {
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: function(result) {
        if (result && result.fileID) resolve(result.fileID)
        else reject(new Error('队徽上传失败'))
      },
      fail: function() { reject(new Error('队徽上传失败，请检查网络后重试')) }
    })
  })
}

/**
 * 上传原图与透明图。透明图失败不阻断创建，服务端 logo 会回退到原图。
 * 透明图与源图放在同一目录（沿用已确认可写的 team-logos/original/ 前缀），
 * 只靠文件名后缀区分，避免新增目录触发云存储写入权限差异。
 * @returns {Promise<{originalLogo:string, transparentLogo:string}>}
 */
function uploadCrest(options) {
  var requestId = (options && options.requestId) || String(Date.now())
  return uploadOne(options.path, 'team-logos/original/' + requestId + '.png').then(function(originalLogo) {
    if (!options.cutoutPath) return { originalLogo: originalLogo, transparentLogo: '' }
    return uploadOne(options.cutoutPath, 'team-logos/original/' + requestId + '-transparent.png')
      .then(function(transparentLogo) {
        return { originalLogo: originalLogo, transparentLogo: transparentLogo }
      })
      .catch(function() {
        return { originalLogo: originalLogo, transparentLogo: '' }
      })
  })
}

module.exports = {
  OUTPUT_SIZE: OUTPUT_SIZE,
  process: process,
  uploadCrest: uploadCrest
}
