/**
 * 本地"抠白"算法 - 适用于队徽/Logo去白底
 * 将图片中接近白色的像素设置为透明
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

/**
 * 判断像素是否接近纯色背景（适用于非白色背景）
 * @param {Uint8ClampedArray} data - 图像数据
 * @param {number} x - 像素x坐标
 * @param {number} y - 像素y坐标
 * @param {number} width - 图片宽度
 * @param {number} sampleSize - 采样边缘区域大小
 * @returns {boolean}
 */
function isBackgroundColor(data, x, y, width, sampleSize = 10) {
  // 采样边缘像素作为背景色参考
  const edgePixels = []
  
  // 只检查图片边缘的像素（假设边缘都是背景）
  if (x < sampleSize || y < sampleSize || 
      x >= width - sampleSize || y >= data.length / (width * 4) - sampleSize) {
    return false // 这是边缘像素本身，不在此判断
  }
  
  // 简化版：直接检查是否接近白色
  const idx = (y * width + x) * 4
  const r = data[idx]
  const g = data[idx + 1]
  const b = data[idx + 2]
  
  return isWhite(r, g, b, 240)
}

/**
 * 去除白色背景（主算法）
 * @param {File} file - 图片文件
 * @param {Object} options - 配置选项
 * @param {number} options.threshold - 白色阈值 (0-255，默认240)
 * @param {boolean} options.preserveEdges - 是否保留边缘检测（避免误删白色Logo元素）
 * @returns {Promise<Object>} { success: boolean, data: base64, warning: string }
 */
export function removeWhiteBackground(file, options = {}) {
  const threshold = options.threshold || 240
  const preserveEdges = options.preserveEdges !== false
  
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
        
        // 绘制原图
        ctx.drawImage(img, 0, 0)
        
        // 获取像素数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        
        let transparentCount = 0
        const totalPixels = canvas.width * canvas.height
        
        // 算法1：简单抠白（适用于纯白背景）
        // 将接近白色的像素设置为透明
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          
          if (isWhite(r, g, b, threshold)) {
            data[i + 3] = 0 // 设置为透明
            transparentCount++
          }
        }
        
        // 检查透明像素占比
        const transparentRatio = transparentCount / totalPixels
        
        // 如果透明像素太少（< 5%），说明可能不是白底图片
        // 回退到边缘检测算法
        if (transparentRatio < 0.05) {
          console.warn('[WhiteBg] 白色像素占比过低，可能不是白底图片')
          
          // 回退：使用边缘检测，采样四角颜色作为背景色
          const topLeft = getPixelColor(data, 0, 0, canvas.width)
          const topRight = getPixelColor(data, canvas.width - 1, 0, canvas.width)
          const bottomLeft = getPixelColor(data, 0, canvas.height - 1, canvas.width)
          const bottomRight = getPixelColor(data, canvas.width - 1, canvas.height - 1, canvas.width)
          
          // 使用四角色彩平均值作为背景色
          const bgR = Math.round((topLeft.r + topRight.r + bottomLeft.r + bottomRight.r) / 4)
          const bgG = Math.round((topLeft.g + topRight.g + bottomLeft.g + bottomRight.g) / 4)
          const bgB = Math.round((topLeft.b + topRight.b + bottomLeft.b + bottomRight.b) / 4)
          
          console.log(`[WhiteBg] 背景色采样: RGB(${bgR}, ${bgG}, ${bgB})`)
          
          // 重新处理：将接近背景色的像素设置为透明
          const tolerance = 30 // 颜色容差
          let newTransparentCount = 0
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            
            // 恢复不透明（重置）
            data[i + 3] = 255
            
            // 检查是否接近背景色
            if (Math.abs(r - bgR) <= tolerance && 
                Math.abs(g - bgG) <= tolerance && 
                Math.abs(b - bgB) <= tolerance) {
              data[i + 3] = 0
              newTransparentCount++
            }
          }
          
          transparentCount = newTransparentCount
        }
        
        // 将处理后的数据写回Canvas
        ctx.putImageData(imageData, 0, 0)
        
        // 输出为 PNG base64
        const base64 = canvas.toDataURL('image/png')
        
        const result = {
          success: true,
          data: base64,
          method: 'whiteBg',
          warning: transparentCount === 0 ? '未检测到白色背景，可能无法完全去背' : ''
        }
        
        console.log(`[WhiteBg] 处理完成，透明像素占比: ${(transparentCount / totalPixels * 100).toFixed(1)}%`)
        
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
 * 获取指定坐标的像素颜色
 */
function getPixelColor(data, x, y, width) {
  const idx = (y * width + x) * 4
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2]
  }
}

/**
 * 简化版：只去除纯白背景（适用于标准白底Logo）
 * @param {File} file - 图片文件
 * @param {number} threshold - 白色阈值 (0-255)
 * @returns {Promise<string>} base64 data URL
 */
export function removeWhiteBgSimple(file, threshold = 240) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    img.onload = () => {
      URL.revokeObjectURL(url)
      
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      canvas.width = img.width
      canvas.height = img.height
      
      ctx.drawImage(img, 0, 0)
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      
      // 将接近白色的像素设置为透明
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        
        if (r >= threshold && g >= threshold && b >= threshold) {
          data[i + 3] = 0 // 透明
        }
      }
      
      ctx.putImageData(imageData, 0, 0)
      
      const base64 = canvas.toDataURL('image/png')
      resolve(base64)
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    
    img.src = url
  })
}
