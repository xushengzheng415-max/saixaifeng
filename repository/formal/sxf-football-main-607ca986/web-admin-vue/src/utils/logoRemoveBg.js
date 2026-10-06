/**
 * 队徽/Logo 抠图 - 通过云函数调用百度智能云商品分割 API
 * 复用球员头像抠图的百度 AI 方案，适用于上线环境
 * 优先使用百度 AI，失败时回退到 Canvas 方案
 */

import { callFunction } from './cloud'
import { restoreEnclosedWhitePixels } from './whiteBgRemover'

/**
 * 压缩图片（百度 API 对图片大小有限制）
 * @param {File} file - 原文件
 * @param {number} maxWidth - 最大宽度
 * @param {number} quality - 压缩质量 0-1
 * @returns {Promise<Blob>}
 */
function compressImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let width = img.width
      let height = img.height

      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('图片压缩失败'))
          }
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }

    img.src = url
  })
}

/**
 * 将 File/Blob 转为 Base64（去掉 data: 前缀）
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 将原图和百度返回的 mask 合成透明背景图
 * 百度商品分割返回的是二值掩码 PNG（白色=前景，黑色=背景）
 * @param {string} originalDataUrl - 原图 data URL
 * @param {string} maskBase64 - 掩码图片 Base64 字符串
 * @param {number} origWidth - 原图宽度
 * @param {number} origHeight - 原图高度
 * @returns {Promise<string>} 合成后的透明背景图 data URL
 */
function composeMaskToTransparent(originalDataUrl, maskBase64, origWidth, origHeight) {
  return new Promise((resolve, reject) => {
    const origImg = new Image()
    const maskImg = new Image()

    let loaded = 0
    const tryCompose = () => {
      loaded++
      if (loaded < 2) return

      const canvas = document.createElement('canvas')
      canvas.width = origWidth
      canvas.height = origHeight
      const ctx = canvas.getContext('2d')

      // 画原图
      ctx.drawImage(origImg, 0, 0, origWidth, origHeight)

      // 获取原图像素
      const imgData = ctx.getImageData(0, 0, origWidth, origHeight)
      const data = imgData.data

      // 画 mask 到临时 canvas，获取掩码像素
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = origWidth
      maskCanvas.height = origHeight
      const maskCtx = maskCanvas.getContext('2d')
      maskCtx.drawImage(maskImg, 0, 0, origWidth, origHeight)
      const maskData = maskCtx.getImageData(0, 0, origWidth, origHeight).data

      // 根据 mask 设置 alpha：白色(前景)保留，黑色(背景)透明
      for (let i = 0; i < data.length; i += 4) {
        const m = maskData[i]  // mask 是黑白图，R=G=B
        data[i + 3] = m < 128 ? 0 : data[i + 3]
      }

      ctx.putImageData(imgData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    origImg.onload = tryCompose
    maskImg.onload = tryCompose
    origImg.onerror = () => reject(new Error('原图加载失败'))
    maskImg.onerror = () => reject(new Error('Mask 图片加载失败'))

    origImg.src = originalDataUrl
    maskImg.src = 'data:image/png;base64,' + maskBase64
  })
}

/**
 * Canvas 备用方案：去除白色背景
 * 注意：此方案会误删队徽内部的白色元素
 */
function removeWhiteBackgroundCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      const threshold = 250
      const tolerance = 20

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        const isWhite = r > threshold && g > threshold && b > threshold
        const isNearWhite = Math.abs(r - g) < tolerance &&
                           Math.abs(g - b) < tolerance &&
                           Math.abs(r - b) < tolerance &&
                           r > 230 && g > 230 && b > 230

        if (isWhite || isNearWhite) {
          const distToWhite = Math.sqrt(
            (255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2
          )
          if (distToWhite < 30) {
            const alpha = Math.min(255, (distToWhite / 30) * 255)
            data[i + 3] = Math.floor(alpha)
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }

    img.src = url
  })
}

/**
 * 统一队徽尺寸：居中裁剪为正方形 + 缩放到目标尺寸
 */
export function resizeLogoToSquare(file, targetSize = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = targetSize
      canvas.height = targetSize
      const ctx = canvas.getContext('2d')
      const srcSize = Math.min(img.width, img.height)
      const srcX = (img.width - srcSize) / 2
      const srcY = (img.height - srcSize) / 2
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, targetSize, targetSize)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas 导出失败'))
      }, 'image/png')
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }

    img.src = url
  })
}

/**
 * 智能队徽抠图 - 针对 Logo 优化
 * 算法：检测四角背景主色 → 从边缘泛洪标记背景 → 保留主体
 * 不会误删 Logo 内部的白色元素
 * 完全本地处理，无 API 限制
 */
function removeLogoBackgroundCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const w = canvas.width
      const h = canvas.height

      // 部分 PNG 会把队徽内部白色保存成 alpha=0；先恢复被轮廓包住的白色，
      // 再执行外边缘背景泛洪，避免旧上传入口继续丢失内部白色。
      restoreEnclosedWhitePixels(data, w, h)

      // 取四角像素颜色（假设四角都是背景）
      function getPixel(x, y) {
        const i = (y * w + x) * 4
        return [data[i], data[i+1], data[i+2]]
      }

      // 颜色欧氏距离
      function dist(c1, c2) {
        return Math.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2 + (c1[2]-c2[2])**2)
      }

      // 四角平均颜色作为背景色
      const c1 = getPixel(0, 0)
      const c2 = getPixel(w-1, 0)
      const c3 = getPixel(0, h-1)
      const c4 = getPixel(w-1, h-1)
      const bgColor = [
        Math.round((c1[0]+c2[0]+c3[0]+c4[0])/4),
        Math.round((c1[1]+c2[1]+c3[1]+c4[1])/4),
        Math.round((c1[2]+c2[2]+c3[2]+c4[2])/4)
      ]

      // 从四边泛洪，标记背景像素
      const visited = new Uint8Array(w * h)
      const isBg = new Uint8Array(w * h)
      const stack = []

      // 收集边缘像素，如果与背景色接近则加入泛洪起点
      const edgePixels = []
      for (let x = 0; x < w; x += Math.max(1, Math.floor(w/50))) {
        edgePixels.push([x, 0])
        edgePixels.push([x, h-1])
      }
      for (let y = 0; y < h; y += Math.max(1, Math.floor(h/50))) {
        edgePixels.push([0, y])
        edgePixels.push([w-1, y])
      }

      for (const [x, y] of edgePixels) {
        const c = getPixel(x, y)
        if (dist(c, bgColor) < 60) {
          stack.push(y * w + x)
        }
      }

      // 执行泛洪
      while (stack.length > 0) {
        const idx = stack.pop()
        if (visited[idx]) continue
        visited[idx] = 1

        const y = Math.floor(idx / w)
        const x = idx % w
        const c = getPixel(x, y)

        if (dist(c, bgColor) < 60) {
          isBg[idx] = 1
          // 四邻域扩散
          if (x > 0) stack.push(idx - 1)
          if (x < w-1) stack.push(idx + 1)
          if (y > 0) stack.push(idx - w)
          if (y < h-1) stack.push(idx + w)
        }
      }

      // 应用透明度
      let transparentCount = 0
      for (let i = 0; i < w * h; i++) {
        if (isBg[i]) {
          data[i * 4 + 3] = 0
          transparentCount++
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }

    img.src = url
  })
}

/**
 * 队徽抠图主入口
 * 队徽不使用百度 body_seg（只能识别人体），直接用智能 Canvas 算法
 * @param {File} imageFile - 图片文件
 * @returns {Promise<{success: boolean, data?: string, method?: string, warning?: string}>}
 */
export async function removeLogoBackground(imageFile) {
  try {

    const result = await removeLogoBackgroundCanvas(imageFile)

    return {
      success: true,
      data: result,
      method: 'canvas',
      warning: '使用智能去背算法（基于背景色检测），如效果不佳可手动调整'
    }
  } catch (err) {
    console.error('[LogoRemoveBg] 队徽抠图失败:', err.message)
    return {
      success: false,
      message: err.message || '队徽抠图失败'
    }
  }
}

/**
 * 获取图片尺寸
 */
function getImageSize(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('获取图片尺寸失败'))
    }
    img.src = url
  })
}

/**
 * File/Blob 转 data URL
 */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 测试百度 AI 抠图服务
 */
export async function testLogoRemoveBg() {
  try {
    const result = await callFunction('baiduRemoveBg', {
      action: 'test'
    })
    if (result.success) {
      return {
        success: true,
        message: '百度 AI 抠图服务正常',
        method: 'baidu'
      }
    } else {
      return {
        success: true,
        message: '百度 AI 服务不可用，将使用 Canvas 方案',
        method: 'canvas'
      }
    }
  } catch (err) {
    return {
      success: true,
      message: '百度 AI 服务不可用，将使用 Canvas 方案',
      method: 'canvas'
    }
  }
}
