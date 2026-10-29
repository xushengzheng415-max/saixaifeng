const cache = new Map()

const WIDTH = 300
const HEIGHT = 430

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = src
  })
}

function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error('读取超时')), milliseconds))
  ])
}

async function decodeBlob(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch (error) {
      // 部分浏览器不支持该图片格式的 ImageBitmap，退回普通图片解码。
    }
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    return await loadImageElement(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// 用 fetch 读取素材再解码，避免 <img crossOrigin> 在部分存储域名或重定向下被判为读取失败，
// 同时把 HTTP 状态带进错误提示，方便区分“文件不存在”和“文件损坏”。
async function loadLayer(src, label) {
  const attempt = async () => {
    const response = await fetch(src, { mode: 'cors', credentials: 'omit' })
    if (!response.ok) throw Object.assign(new Error(`${label}读取失败（HTTP ${response.status}）`), { retryable: response.status >= 500 })
    return response.blob()
  }
  let blob
  try {
    blob = await withTimeout(attempt(), 20000)
  } catch (error) {
    if (error && error.retryable) {
      await new Promise(resolve => setTimeout(resolve, 300))
      blob = await withTimeout(attempt(), 20000).catch(() => { throw new Error(`${label}读取失败，请稍后重试`) })
    } else if (/超时/.test(error?.message || '')) {
      throw new Error(`${label}读取超时，请检查网络后重试`)
    } else if (/Failed to fetch|NetworkError|跨域/i.test(error?.message || '')) {
      throw new Error(`${label}读取被拦截，请重新上传素材后再试`)
    } else {
      throw error
    }
  }
  try {
    return await decodeBlob(blob)
  } catch (error) {
    throw new Error(`${label}不是可识别的 PNG 图片，请重新上传`)
  }
}

function loadImage(src, label) {
  return /^data:/i.test(src) ? loadImageElement(src).catch(() => { throw new Error(`${label}不是可识别的 PNG 图片，请重新上传`) }) : loadLayer(src, label)
}

export function renderMaskedCardLayers(backgroundSrc, maskSrc) {
  if (!backgroundSrc || !maskSrc) return Promise.resolve('')
  const cacheable = !backgroundSrc.startsWith('data:') && !maskSrc.startsWith('data:')
  const key = `${backgroundSrc}|${maskSrc}`
  if (cacheable && cache.has(key)) return cache.get(key)
  const pending = Promise.all([loadImage(backgroundSrc, '背景图'), loadImage(maskSrc, '遮罩')]).then(([background, mask]) => {
    if (background.width !== WIDTH || background.height !== HEIGHT || mask.width !== WIDTH || mask.height !== HEIGHT) {
      throw new Error(`背景和遮罩都须为 300 × 430（当前背景 ${background.width}×${background.height}，遮罩 ${mask.width}×${mask.height}）`)
    }
    const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(background, 0, 0)
    const foreground = context.getImageData(0, 0, WIDTH, HEIGHT)
    context.clearRect(0, 0, WIDTH, HEIGHT)
    context.drawImage(mask, 0, 0)
    const maskPixels = context.getImageData(0, 0, WIDTH, HEIGHT)
    const pixels = maskPixels.data
    for (let i = 0; i < foreground.data.length; i += 4) {
      const luminance = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255
      foreground.data[i + 3] = Math.round(foreground.data[i + 3] * (1 - luminance) * pixels[i + 3] / 255)
      pixels[i + 3] = Math.round(luminance * pixels[i + 3])
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255
    }
    context.putImageData(maskPixels, 0, 0)
    const portraitMaskUrl = canvas.toDataURL('image/png')
    context.clearRect(0, 0, WIDTH, HEIGHT)
    context.putImageData(foreground, 0, 0)
    return { foreground:canvas, portraitMaskUrl }
  }).catch(error => {
    if (cacheable) cache.delete(key)
    if (error?.name === 'SecurityError') throw new Error('图片地址不允许预览，请重新上传背景和遮罩 PNG')
    throw error
  })
  if (cacheable) {
    cache.set(key, pending)
    while (cache.size > 12) cache.delete(cache.keys().next().value)
  }
  return pending
}

export function renderMaskedCardForeground(backgroundSrc, maskSrc) {
  return renderMaskedCardLayers(backgroundSrc,maskSrc).then(result=>result?.foreground || '')
}
