import assert from 'node:assert/strict'
import { findVisiblePixelBounds } from '../web-admin-vue/src/utils/imageBounds.js'

function pixels(width, height, visible) {
  const data = new Uint8ClampedArray(width * height * 4)
  visible.forEach(([x, y, alpha = 255]) => { data[(y * width + x) * 4 + 3] = alpha })
  return data
}

assert.deepEqual(
  findVisiblePixelBounds(pixels(5, 4, [[1, 1], [3, 2]]), 5, 4),
  { x:1, y:1, width:3, height:2 }
)
assert.deepEqual(
  findVisiblePixelBounds(pixels(2, 2, [[0, 0], [1, 0], [0, 1], [1, 1]]), 2, 2),
  { x:0, y:0, width:2, height:2 }
)
assert.equal(findVisiblePixelBounds(pixels(3, 3, [[1, 1, 8]]), 3, 3, 12), null)
assert.equal(findVisiblePixelBounds(new Uint8ClampedArray(), 0, 0), null)

console.log('visible pixel bounds normalization: PASS')
