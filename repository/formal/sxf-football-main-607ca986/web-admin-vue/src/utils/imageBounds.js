export function findVisiblePixelBounds(data, width, height, alphaThreshold = 12) {
  const safeWidth = Number(width || 0)
  const safeHeight = Number(height || 0)
  if (!data || safeWidth <= 0 || safeHeight <= 0 || data.length < safeWidth * safeHeight * 4) return null

  let minX = safeWidth
  let minY = safeHeight
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const alpha = data[(y * safeWidth + x) * 4 + 3]
      if (alpha <= alphaThreshold) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x:minX, y:minY, width:maxX - minX + 1, height:maxY - minY + 1 }
}
