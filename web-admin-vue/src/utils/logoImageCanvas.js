/**
 * 队徽画布处理：1:1 复制像素；只有超过上限时才高质量缩小。
 */
import { LOGO_MAX_EDGE, LOGO_SAFE_PADDING, fitLogoEdge } from './logoImageSize.js'

function smoothingFor(ctx, sourceWidth, sourceHeight, destWidth, destHeight) {
  const shrinking = destWidth < sourceWidth || destHeight < sourceHeight
  ctx.imageSmoothingEnabled = shrinking
  if (shrinking) ctx.imageSmoothingQuality = 'high'
}

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = typeof src === 'string' ? '' : URL.createObjectURL(src)
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error('图片加载失败'))
    }
    img.src = objectUrl || src
  })
}

export function paintFittedImage(img, maxEdge = LOGO_MAX_EDGE, { matte = false } = {}) {
  const sourceWidth = img.naturalWidth || img.width
  const sourceHeight = img.naturalHeight || img.height
  const fitted = fitLogoEdge(sourceWidth, sourceHeight, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = fitted.width
  canvas.height = fitted.height
  const ctx = canvas.getContext('2d')
  smoothingFor(ctx, sourceWidth, sourceHeight, fitted.width, fitted.height)
  if (matte) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0, fitted.width, fitted.height)
  return canvas
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('图片导出失败'))
    }, 'image/png')
  })
}

export async function fileFittedToEdge(file, maxEdge = LOGO_MAX_EDGE, options = {}) {
  const img = await loadImageElement(file)
  const canvas = paintFittedImage(img, maxEdge, options)
  const blob = await canvasToPngBlob(canvas)
  const name = String(file.name || 'logo.png').replace(/\.[^.]+$/, '.png')
  return new File([blob], name, { type: 'image/png', lastModified: Date.now() })
}

export function readImageSize(src) {
  return loadImageElement(src).then(img => ({
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height
  }))
}

/**
 * 把 data URL 限制在最长边以内。已经更小则原样返回，避免再编码一次。
 */
export async function limitDataUrlToEdge(dataUrl, maxEdge) {
  const img = await loadImageElement(dataUrl)
  const sourceWidth = img.naturalWidth || img.width
  const sourceHeight = img.naturalHeight || img.height
  const fitted = fitLogoEdge(sourceWidth, sourceHeight, maxEdge)
  if (fitted.scale === 1 && fitted.width === sourceWidth && fitted.height === sourceHeight) return dataUrl
  const canvas = paintFittedImage(img, maxEdge, { matte: false })
  return canvas.toDataURL('image/png')
}

export function addTransparentSafeArea(source, paddingRatio = LOGO_SAFE_PADDING) {
  return loadImageElement(source).then(image => {
    const longestSide = Math.max(image.width, image.height)
    const canvasSide = Math.max(1, Math.ceil(longestSide / (1 - paddingRatio * 2)))
    const canvas = document.createElement('canvas')
    canvas.width = canvasSide
    canvas.height = canvasSide
    const context = canvas.getContext('2d')
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvasSide, canvasSide)
    context.drawImage(
      image,
      Math.round((canvasSide - image.width) / 2),
      Math.round((canvasSide - image.height) / 2)
    )
    return canvas.toDataURL('image/png')
  })
}
