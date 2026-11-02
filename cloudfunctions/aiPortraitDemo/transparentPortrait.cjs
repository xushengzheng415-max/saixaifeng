'use strict'
const jpeg = require('jpeg-js')
const { PNG } = require('pngjs')

function alphaAt(mask, x, y) {
  const fx = Math.max(0, Math.min(mask.width - 1, x))
  const fy = Math.max(0, Math.min(mask.height - 1, y))
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const x1 = Math.min(mask.width - 1, x0 + 1), y1 = Math.min(mask.height - 1, y0 + 1)
  const dx = fx - x0, dy = fy - y0
  const a = (xx, yy) => mask.data[(yy * mask.width + xx) * 4 + 3]
  return Math.round((a(x0, y0) * (1 - dx) + a(x1, y0) * dx) * (1 - dy) +
    (a(x0, y1) * (1 - dx) + a(x1, y1) * dx) * dy)
}

function refineMask(mask) {
  // Segmentation foreground includes a small margin of the white studio backdrop.
  // Contract only the matte by two mask pixels; never shrink/resample the portrait RGB.
  const data = Buffer.from(mask.data)
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    let alpha = 255
    for (let yy = Math.max(0, y - 2); yy <= Math.min(mask.height - 1, y + 2); yy++) {
      for (let xx = Math.max(0, x - 2); xx <= Math.min(mask.width - 1, x + 2); xx++) {
        alpha = Math.min(alpha, mask.data[(yy * mask.width + xx) * 4 + 3])
      }
    }
    data[(y * mask.width + x) * 4 + 3] = alpha
  }
  return { width: mask.width, height: mask.height, data }
}

function applyMask(original, mask) {
  let clear = 0, solid = 0
  for (let i = 3; i < mask.data.length; i += 4) {
    if (mask.data[i] === 0) clear++
    if (mask.data[i] > 240) solid++
  }
  if (clear < mask.width * mask.height * 0.01 || solid < mask.width * mask.height * 0.03) {
    throw new Error('人像分割未得到有效透明通道，请重新生成')
  }
  // Keep original 2K RGB pixels. Resize only the segmentation alpha channel.
  const data = Buffer.from(original.data)
  for (let y = 0; y < original.height; y++) {
    for (let x = 0; x < original.width; x++) {
      const i = (y * original.width + x) * 4
      const a = alphaAt(mask, (x + 0.5) * mask.width / original.width - 0.5,
        (y + 0.5) * mask.height / original.height - 0.5)
      data[i + 3] = a
      if (!a) data.fill(0, i, i + 3)
    }
  }
  return { width: original.width, height: original.height, data }
}

async function render(buffer, mime, app, decodeImage, sampleBilinear) {
  const original = decodeImage(buffer, mime)
  const scale = Math.min(1, 1024 / Math.max(original.width, original.height))
  const width = Math.max(1, Math.round(original.width * scale))
  const height = Math.max(1, Math.round(original.height * scale))
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    sampleBilinear(original.data, original.width, original.height,
      (x + 0.5) / scale - 0.5, (y + 0.5) / scale - 0.5, data, (y * width + x) * 4)
  }
  // Only the segmentation request uses a small JPEG; output pixels remain 2K.
  const preview = jpeg.encode({ data, width, height }, 92).data
  const response = await app.callFunction({ name: 'baiduRemoveBg', data: {
    action: 'removeBackground', imageBase64: Buffer.from(preview).toString('base64')
  } })
  const result = response && response.result
  if (!result || !result.success || !result.data || result.type || Number(result.personNum) > 1) {
    throw new Error('人像抠图未完成，请重新生成；不会返回白底图片')
  }
  const png = Buffer.from(String(result.data).replace(/^data:image\/png;base64,/, ''), 'base64')
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('人像分割结果不是透明 PNG，请重新生成')
  }
  const mask = PNG.sync.read(png)
  const output = applyMask(original, refineMask(mask))
  const encoded = PNG.sync.write(output, { deflateLevel: 9, filterType: -1 })
  const inline = 'data:image/png;base64,' + encoded.toString('base64')
  // Return this field once; duplicating it as image AND images breaks HTTP's 6MB limit.
  if (inline.length > 5500000) throw new Error('透明图片超过传输上限，请重新生成')
  return { inline, composed: false, width: output.width, height: output.height,
    segmentationWidth: mask.width, segmentationHeight: mask.height }
}
module.exports = { render, applyMask, alphaAt, refineMask }
