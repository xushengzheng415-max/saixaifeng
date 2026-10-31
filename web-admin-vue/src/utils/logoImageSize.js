/**
 * 队徽尺寸策略：保留原图像素，只在超过上限时缩小，预览不放大。
 *
 * 上传弹窗里曾经把队徽先压到 500px、进裁剪器前再压到 200px，
 * 再由裁剪框倍数放大。这里只描述目标边长，不负责绘制。
 */

export const LOGO_MAX_EDGE = 2048
export const LOGO_UPLOAD_MAX_EDGE = 4096
export const LOGO_PREVIEW_BOX = 200
export const LOGO_SAFE_PADDING = 0.08
export const LOGO_UPLOAD_FALLBACK_EDGES = [2048, 1536, 1024, 768, 512]

function positiveInt(value, fallback = 1) {
  const rounded = Math.round(Number(value))
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback
}

/**
 * 把原图装进最长边上限。已经更小的图 scale 为 1，不会被放大。
 */
export function fitLogoEdge(width, height, maxEdge = LOGO_MAX_EDGE) {
  const srcW = positiveInt(width)
  const srcH = positiveInt(height)
  const limit = positiveInt(maxEdge, LOGO_MAX_EDGE)
  const longest = Math.max(srcW, srcH)
  if (longest <= limit) return { width: srcW, height: srcH, scale: 1 }
  const scale = limit / longest
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
    scale
  }
}

/**
 * 预览框里的显示比例。返回值不会大于 1，低分辨率原图按像素 1:1 显示。
 */
export function logoPreviewScale(imageEdge, boxPx = LOGO_PREVIEW_BOX) {
  const edge = positiveInt(imageEdge)
  const box = positiveInt(boxPx, LOGO_PREVIEW_BOX)
  return Math.min(1, box / edge)
}

export function logoPreviewSize(width, height, boxPx = LOGO_PREVIEW_BOX) {
  const srcW = positiveInt(width)
  const srcH = positiveInt(height)
  const scale = logoPreviewScale(Math.max(srcW, srcH), boxPx)
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
    scale
  }
}

/**
 * 上传尝试的最长边。第一次使用当前图（不超过上传上限），失败后再逐级缩小。
 * 不会把已经很小的队徽再压到 200px 以下作为首选。
 */
export function logoUploadEdges(width, height, maxEdge = LOGO_UPLOAD_MAX_EDGE) {
  const longest = positiveInt(Math.max(positiveInt(width), positiveInt(height)))
  const first = Math.min(longest, positiveInt(maxEdge, LOGO_UPLOAD_MAX_EDGE))
  const fallbacks = LOGO_UPLOAD_FALLBACK_EDGES.filter(edge => edge < first)
  return [first, ...fallbacks]
}
