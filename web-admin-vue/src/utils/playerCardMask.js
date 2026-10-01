const cache = new Map()

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (/^https?:\/\//i.test(src)) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('卡面素材无法读取'))
    image.src = src
  })
}

export function renderMaskedCardLayers(backgroundSrc, maskSrc) {
  if (!backgroundSrc || !maskSrc) return Promise.resolve('')
  const cacheable = !backgroundSrc.startsWith('data:') && !maskSrc.startsWith('data:')
  const key = `${backgroundSrc}|${maskSrc}`
  if (cacheable && cache.has(key)) return cache.get(key)
  const pending = Promise.all([loadImage(backgroundSrc), loadImage(maskSrc)]).then(([background, mask]) => {
    if (background.naturalWidth !== 300 || background.naturalHeight !== 430 || mask.naturalWidth !== 300 || mask.naturalHeight !== 430) {
      throw new Error('背景和遮罩都须为 300 × 430')
    }
    const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 430
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(background, 0, 0)
    const foreground = context.getImageData(0, 0, 300, 430)
    context.clearRect(0, 0, 300, 430)
    context.drawImage(mask, 0, 0)
    const maskPixels = context.getImageData(0, 0, 300, 430)
    const pixels = maskPixels.data
    for (let i = 0; i < foreground.data.length; i += 4) {
      const luminance = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255
      foreground.data[i + 3] = Math.round(foreground.data[i + 3] * (1 - luminance) * pixels[i + 3] / 255)
      pixels[i + 3] = Math.round(luminance * pixels[i + 3])
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255
    }
    context.putImageData(maskPixels, 0, 0)
    const portraitMaskUrl = canvas.toDataURL('image/png')
    context.clearRect(0, 0, 300, 430)
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
