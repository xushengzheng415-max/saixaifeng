/**
 * 本地队徽去背景算法。
 *
 * 不能把所有白色像素都当作背景：队徽里的文字、盾牌和高光经常也是白色。
 * 这里从图片外边缘开始泛洪，只移除与外边缘连通、且颜色接近背景色的像素，
 * 因此被队徽轮廓包住的内部白色会保留下来。
 */

/**
 * 判断像素是否接近白色
 * @param {number} r - 红色通道 (0-255)
 * @param {number} g - 绿色通道 (0-255)
 * @param {number} b - 蓝色通道 (0-255)
 * @param {number} threshold - 白色阈值 (0-255，默认240，越大越严格)
 * @returns {boolean}
 */
function isWhite(r, g, b, threshold = 240) {
  return r >= threshold && g >= threshold && b >= threshold
}

function colorDistance(r, g, b, background) {
  const dr = r - background.r
  const dg = g - background.g
  const db = b - background.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function collectEdgeColors(data, width, height) {
  const colors = []
  const step = Math.max(1, Math.floor(Math.max(width, height) / 64))
  const add = (x, y) => {
    const index = (y * width + x) * 4
    if (data[index + 3] === 0) return
    colors.push({ r: data[index], g: data[index + 1], b: data[index + 2] })
  }

  for (let x = 0; x < width; x += step) {
    add(x, 0)
    add(x, height - 1)
  }
  for (let y = 0; y < height; y += step) {
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
  // 只要边缘有足够多的近白样本，就以纯白为背景参考色。
  const whiteCount = edgeColors.filter(color => isWhite(color.r, color.g, color.b, threshold - 8)).length
  if (whiteCount >= Math.max(4, Math.ceil(edgeColors.length * 0.2))) {
    return { r: 255, g: 255, b: 255, isWhite: true }
  }

  // 非白底也按边缘样本估算背景色；后续仍然只处理与边缘连通的区域。
  const sorted = key => edgeColors.map(color => color[key]).sort((a, b) => a - b)
  const median = values => values[Math.floor(values.length / 2)]
  return {
    r: median(sorted('r')),
    g: median(sorted('g')),
    b: median(sorted('b')),
    isWhite: false
  }
}

function isBackgroundPixel(data, pixelIndex, background, tolerance) {
  const index = pixelIndex * 4
  if (data[index + 3] === 0) return true
  return colorDistance(data[index], data[index + 1], data[index + 2], background) <= tolerance
}

/**
 * 标记与图片外边缘连通的背景像素。
 * 使用四邻域连接，避免内部白色仅在斜角相碰时被误判为外部背景。
 */
function findConnectedBackground(data, width, height, background, tolerance) {
  const totalPixels = width * height
  const visited = new Uint8Array(totalPixels)
  const backgroundMask = new Uint8Array(totalPixels)
  const stack = []
  const push = (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y < height) stack.push(y * width + x)
  }

  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y)
    push(width - 1, y)
  }

  while (stack.length) {
    const pixelIndex = stack.pop()
    if (visited[pixelIndex]) continue
    visited[pixelIndex] = 1
    if (!isBackgroundPixel(data, pixelIndex, background, tolerance)) continue

    backgroundMask[pixelIndex] = 1
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    push(x - 1, y)
    push(x + 1, y)
    push(x, y - 1)
    push(x, y + 1)
  }

  return backgroundMask
}

function findConnectedTransparent(data, width, height, alphaThreshold = 8) {
  const totalPixels = width * height
  const visited = new Uint8Array(totalPixels)
  const stack = []
  const push = (x, y) => {
    if (x >= 0 && x < width && y >= 0 && y < height) stack.push(y * width + x)
  }

  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    push(0, y)
    push(width - 1, y)
  }

  while (stack.length) {
    const pixelIndex = stack.pop()
    if (visited[pixelIndex]) continue
    visited[pixelIndex] = 1
    if (data[pixelIndex * 4 + 3] > alphaThreshold) continue

    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    push(x - 1, y)
    push(x + 1, y)
    push(x, y - 1)
    push(x, y + 1)
  }

  return visited
}

/**
 * 修复部分 PNG 队徽把内部白色保存成 alpha=0 的情况。
 * 只有被队徽轮廓包住、且 RGB 仍然是白色的透明区域才恢复为不透明白色；
 * 与图片边缘连通的透明背景保持透明。
 */
export function restoreEnclosedWhitePixels(data, width, height, options = {}) {
  const threshold = options.threshold || 240
  const edgeTransparent = findConnectedTransparent(data, width, height, options.alphaThreshold || 8)
  let restoredCount = 0

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    const offset = pixelIndex * 4
    if (edgeTransparent[pixelIndex] || data[offset + 3] >= 255) continue
    if (isWhite(data[offset], data[offset + 1], data[offset + 2], threshold)) {
      data[offset + 3] = 255
      restoredCount += 1
    }
  }

  return restoredCount
}

/**
 * 去除白色背景（主算法）
 * @param {File} file - 图片文件
 * @param {Object} options - 配置选项
 * @param {number} options.threshold - 白色阈值 (0-255，默认240)
 * @param {number} options.tolerance - 背景色容差，默认 60
 * @returns {Promise<Object>} { success: boolean, data: base64, warning: string }
 */
export function removeWhiteBackground(file, options = {}) {
  const threshold = options.threshold || 240
  const tolerance = options.tolerance || 60
  
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    img.onload = () => {
      URL.revokeObjectURL(url)
      
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        canvas.width = img.width
        canvas.height = img.height
        
        // 先铺白底再绘制，避免透明 PNG 中的白色像素在 Canvas 预乘后丢失 RGB；
        // 后续只移除与外边缘连通的白底，内部白色会保留。
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        
        // 获取像素数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        const restoredWhiteCount = restoreEnclosedWhitePixels(data, canvas.width, canvas.height, { threshold })
        const edgeColors = collectEdgeColors(data, canvas.width, canvas.height)
        const background = inferBackgroundColor(edgeColors, threshold)
        const backgroundMask = findConnectedBackground(
          data,
          canvas.width,
          canvas.height,
          background,
          tolerance
        )

        let transparentCount = 0
        const totalPixels = canvas.width * canvas.height
        for (let pixelIndex = 0; pixelIndex < totalPixels; pixelIndex += 1) {
          if (backgroundMask[pixelIndex]) {
            data[pixelIndex * 4 + 3] = 0
            transparentCount += 1
          }
        }
        
        // 将处理后的数据写回Canvas
        ctx.putImageData(imageData, 0, 0)
        
        // 输出为 PNG base64
        const base64 = canvas.toDataURL('image/png')
        
        const result = {
          success: true,
          data: base64,
          method: 'whiteBg',
          restoredWhiteCount,
          warning: transparentCount === 0 ? '未检测到与外边缘连通的背景，已保留原图' : ''
        }
        
        console.log(`[WhiteBg] 处理完成，外边缘背景透明像素占比: ${(transparentCount / totalPixels * 100).toFixed(1)}%`)
        
        resolve(result)
        
      } catch (err) {
        console.error('[WhiteBg] 处理失败:', err)
        resolve({
          success: false,
          message: err.message || '本地抠白算法失败'
        })
      }
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({
        success: false,
        message: '图片加载失败'
      })
    }
    
    img.src = url
  })
}

/**
 * 兼容旧调用方的简化入口。
 * 同样使用“外边缘连通区域”规则，避免旧入口再次误删内部白色。
 * @param {File} file - 图片文件
 * @param {number} threshold - 白色阈值 (0-255)
 * @returns {Promise<string>} base64 data URL
 */
export function removeWhiteBgSimple(file, threshold = 240) {
  return removeWhiteBackground(file, { threshold }).then(result => {
    if (result.success && result.data) return result.data
    throw new Error(result.message || '图片去背景失败')
  })
}
