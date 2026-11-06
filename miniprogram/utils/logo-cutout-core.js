/**
 * 队徽去背景算法（纯像素处理，不依赖 wx / DOM，可在 Node 中单测）。
 *
 * 与 PC 端 web-admin-vue/src/utils/whiteBgRemover.js 保持同一套规则：
 * 1. 先恢复被队徽轮廓包住、但源 PNG 存成 alpha=0 的内部白色；
 * 2. 用四边样本推断背景色（白底图片按纯白处理）；
 * 3. 只把与图片外边缘连通的背景像素设为透明，队徽内部白色不会被误删。
 */

function isWhite(r, g, b, threshold) {
  var limit = threshold || 240
  return r >= limit && g >= limit && b >= limit
}

function colorDistance(r, g, b, background) {
  var dr = r - background.r
  var dg = g - background.g
  var db = b - background.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function collectEdgeColors(data, width, height) {
  var colors = []
  var step = Math.max(1, Math.floor(Math.max(width, height) / 64))
  function add(x, y) {
    var index = (y * width + x) * 4
    if (data[index + 3] === 0) return
    colors.push({ r: data[index], g: data[index + 1], b: data[index + 2] })
  }
  var x, y
  for (x = 0; x < width; x += step) {
    add(x, 0)
    add(x, height - 1)
  }
  for (y = 0; y < height; y += step) {
    add(0, y)
    add(width - 1, y)
  }
  add(0, 0)
  add(width - 1, 0)
  add(0, height - 1)
  add(width - 1, height - 1)
  return colors
}

function inferBackgroundColor(edgeColors, threshold) {
  if (!edgeColors.length) return { r: 255, g: 255, b: 255, isWhite: true }
  // 白底图片最常见，也最容易因为抗锯齿出现 235~255 的近白像素。
  var whiteCount = 0
  var i
  for (i = 0; i < edgeColors.length; i += 1) {
    if (isWhite(edgeColors[i].r, edgeColors[i].g, edgeColors[i].b, threshold - 8)) whiteCount += 1
  }
  if (whiteCount >= Math.max(4, Math.ceil(edgeColors.length * 0.2))) {
    return { r: 255, g: 255, b: 255, isWhite: true }
  }
  // 非白底按边缘样本的中位数估算；后续仍然只处理与边缘连通的区域。
  function median(key) {
    var values = edgeColors.map(function(color) { return color[key] }).sort(function(a, b) { return a - b })
    return values[Math.floor(values.length / 2)]
  }
  return { r: median('r'), g: median('g'), b: median('b'), isWhite: false }
}

function isBackgroundPixel(data, pixelIndex, background, tolerance) {
  var index = pixelIndex * 4
  if (data[index + 3] === 0) return true
  return colorDistance(data[index], data[index + 1], data[index + 2], background) <= tolerance
}

function pushEdges(stack, width, height) {
  var x, y
  for (x = 0; x < width; x += 1) {
    stack.push(0 * width + x)
    stack.push((height - 1) * width + x)
  }
  for (y = 1; y < height - 1; y += 1) {
    stack.push(y * width + 0)
    stack.push(y * width + width - 1)
  }
}

// 四邻域泛洪：只标记与外边缘连通的背景，避免内部白色在斜角相碰时被误判。
function findConnectedBackground(data, width, height, background, tolerance) {
  var total = width * height
  var visited = new Uint8Array(total)
  var backgroundMask = new Uint8Array(total)
  var stack = []
  pushEdges(stack, width, height)
  while (stack.length) {
    var pixelIndex = stack.pop()
    if (visited[pixelIndex]) continue
    visited[pixelIndex] = 1
    if (!isBackgroundPixel(data, pixelIndex, background, tolerance)) continue
    backgroundMask[pixelIndex] = 1
    var x = pixelIndex % width
    var y = Math.floor(pixelIndex / width)
    if (x > 0) stack.push(pixelIndex - 1)
    if (x < width - 1) stack.push(pixelIndex + 1)
    if (y > 0) stack.push(pixelIndex - width)
    if (y < height - 1) stack.push(pixelIndex + width)
  }
  return backgroundMask
}

function findConnectedTransparent(data, width, height, alphaThreshold) {
  var limit = typeof alphaThreshold === 'number' ? alphaThreshold : 8
  var total = width * height
  var visited = new Uint8Array(total)
  var stack = []
  pushEdges(stack, width, height)
  while (stack.length) {
    var pixelIndex = stack.pop()
    if (visited[pixelIndex]) continue
    visited[pixelIndex] = 1
    if (data[pixelIndex * 4 + 3] > limit) continue
    var x = pixelIndex % width
    var y = Math.floor(pixelIndex / width)
    if (x > 0) stack.push(pixelIndex - 1)
    if (x < width - 1) stack.push(pixelIndex + 1)
    if (y > 0) stack.push(pixelIndex - width)
    if (y < height - 1) stack.push(pixelIndex + width)
  }
  return visited
}

/**
 * 修复部分 PNG 队徽把内部白色保存成 alpha=0 的情况。
 * 只有被轮廓包住、且 RGB 仍是白色的透明区域才恢复为不透明白色。
 */
function restoreEnclosedWhitePixels(data, width, height, options) {
  var config = options || {}
  var threshold = config.threshold || 240
  var edgeTransparent = findConnectedTransparent(data, width, height, config.alphaThreshold || 8)
  var restored = 0
  var total = width * height
  for (var pixelIndex = 0; pixelIndex < total; pixelIndex += 1) {
    var offset = pixelIndex * 4
    if (edgeTransparent[pixelIndex] || data[offset + 3] >= 255) continue
    if (isWhite(data[offset], data[offset + 1], data[offset + 2], threshold)) {
      data[offset + 3] = 255
      restored += 1
    }
  }
  return restored
}

/**
 * 去背景主入口：直接改写传入的像素数组（RGBA）。
 * @returns {{removed:number, ratio:number, background:Object, restored:number}}
 */
function cutOutBackground(data, width, height, options) {
  var config = options || {}
  var threshold = config.threshold || 240
  var tolerance = config.tolerance || 60
  var restored = restoreEnclosedWhitePixels(data, width, height, { threshold: threshold })
  var background = inferBackgroundColor(collectEdgeColors(data, width, height), threshold)
  var mask = findConnectedBackground(data, width, height, background, tolerance)
  var total = width * height
  var removed = 0
  for (var pixelIndex = 0; pixelIndex < total; pixelIndex += 1) {
    if (!mask[pixelIndex]) continue
    data[pixelIndex * 4 + 3] = 0
    removed += 1
  }
  return { removed: removed, ratio: total ? removed / total : 0, background: background, restored: restored }
}

module.exports = {
  isWhite: isWhite,
  colorDistance: colorDistance,
  collectEdgeColors: collectEdgeColors,
  inferBackgroundColor: inferBackgroundColor,
  findConnectedBackground: findConnectedBackground,
  restoreEnclosedWhitePixels: restoreEnclosedWhitePixels,
  cutOutBackground: cutOutBackground
}
