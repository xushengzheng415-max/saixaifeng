import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LOGO_MAX_EDGE,
  LOGO_PREVIEW_BOX,
  fitLogoEdge,
  logoPreviewScale,
  logoPreviewSize,
  logoUploadEdges
} from './logoImageSize.js'

test('队徽不超过上限时保持原图像素', () => {
  assert.deepEqual(fitLogoEdge(640, 480), { width: 640, height: 480, scale: 1 })
  assert.deepEqual(fitLogoEdge(120, 80), { width: 120, height: 80, scale: 1 })
  assert.deepEqual(fitLogoEdge(LOGO_MAX_EDGE, 1000), { width: LOGO_MAX_EDGE, height: 1000, scale: 1 })
})

test('超大原图只缩小最长边，不放大另一边', () => {
  const fitted = fitLogoEdge(4000, 2000, 2048)
  assert.equal(fitted.width, 2048)
  assert.equal(fitted.height, 1024)
  assert.ok(fitted.scale < 1)
  assert.ok(fitted.width <= 2048 && fitted.height <= 2048)
})

test('预览比例不会大于 1', () => {
  assert.equal(logoPreviewScale(80, LOGO_PREVIEW_BOX), 1)
  assert.equal(logoPreviewScale(200, 200), 1)
  assert.equal(logoPreviewScale(800, 200), 0.25)
  const small = logoPreviewSize(120, 90, 200)
  assert.deepEqual(small, { width: 120, height: 90, scale: 1 })
  const large = logoPreviewSize(800, 400, 200)
  assert.deepEqual(large, { width: 200, height: 100, scale: 0.25 })
  assert.ok(large.width <= 800 && large.height <= 400)
})

test('上传首选当前分辨率，失败后的备选都更小', () => {
  assert.deepEqual(logoUploadEdges(180, 180), [180])
  const edges = logoUploadEdges(2438, 2200)
  assert.equal(edges[0], 2438)
  assert.ok(edges.slice(1).every(edge => edge < edges[0]))
  assert.ok(!edges.includes(200))
  assert.ok(!edges.includes(128))
  assert.ok(!edges.includes(64))
})

test('超过上传上限时第一次就限制在上限内', () => {
  const edges = logoUploadEdges(9000, 3000, 4096)
  assert.equal(edges[0], 4096)
  assert.ok(edges.every(edge => edge <= 4096))
})
