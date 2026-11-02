'use strict'
// 队徽去背算法（小程序 utils/logo-cutout-core.js）回归测试。
// 规则与 PC 端 whiteBgRemover 一致：只移除与外边缘连通的背景，内部白色保留。
const assert = require('node:assert/strict')
const core = require('../miniprogram/utils/logo-cutout-core')

function canvasOf (width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) paint(x, y, (y * width + x) * 4, data)
  }
  return data
}
function fill (data, width, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 4
      data[i] = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = color.length > 3 ? color[3] : 255
    }
  }
}
function alphaAt (data, width, x, y) {
  return data[(y * width + x) * 4 + 3]
}

// 1. 白底 + 蓝色盾牌 + 盾牌内部白色：只去掉外部白底，内部白色必须保留
{
  const size = 24
  const data = canvasOf(size, size, (x, y, i, pixels) => {
    pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255
  })
  fill(data, size, 6, 6, 17, 17, [20, 90, 200, 255])
  fill(data, size, 10, 10, 13, 13, [255, 255, 255, 255])
  const result = core.cutOutBackground(data, size, size)
  assert.equal(result.background.isWhite, true, '白底图片按纯白推断背景')
  assert.equal(alphaAt(data, size, 0, 0), 0, '外部白底变透明')
  assert.equal(alphaAt(data, size, 7, 7), 255, '队徽主体保留不透明')
  assert.equal(alphaAt(data, size, 11, 11), 255, '被轮廓包住的内部白色必须保留')
  const expected = (size * size) - 12 * 12
  assert.equal(result.removed, expected, '只移除与边缘连通的白底像素')
  assert.ok(Math.abs(result.ratio - expected / (size * size)) < 1e-9)
}

// 2. 非白底（彩色）同样只去掉与外边缘连通的背景，内部撞色区域保留
{
  const size = 20
  const background = [20, 80, 140, 255]
  const data = canvasOf(size, size, (x, y, i, pixels) => {
    pixels[i] = background[0]; pixels[i + 1] = background[1]; pixels[i + 2] = background[2]; pixels[i + 3] = 255
  })
  fill(data, size, 5, 5, 14, 14, [250, 220, 40, 255])
  fill(data, size, 9, 9, 10, 10, background)
  const result = core.cutOutBackground(data, size, size)
  assert.equal(result.background.isWhite, false, '彩色背景按边缘中位数推断')
  assert.equal(result.background.r, 20)
  assert.equal(result.background.g, 80)
  assert.equal(result.background.b, 140)
  assert.equal(alphaAt(data, size, 0, 0), 0, '外部彩色背景变透明')
  assert.equal(alphaAt(data, size, 9, 9), 255, '被主体包住的同色区域不能当背景删掉')
  assert.equal(result.removed, (size * size) - 10 * 10, '只移除边缘连通背景')
}

// 3. 源 PNG 把内部白色存成 alpha=0 时，恢复内部白色、外部透明背景保持透明
{
  const size = 16
  const data = canvasOf(size, size, (x, y, i, pixels) => {
    pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 0
  })
  fill(data, size, 4, 4, 11, 11, [18, 120, 70, 255])
  fill(data, size, 7, 7, 8, 8, [255, 255, 255, 0])
  const restored = core.restoreEnclosedWhitePixels(data, size, size)
  assert.equal(restored, 4, '只恢复被轮廓包住的透明白像素')
  assert.equal(alphaAt(data, size, 7, 7), 255, '内部白色恢复为不透明')
  assert.equal(alphaAt(data, size, 0, 0), 0, '外部透明背景保持不变')
}

// 4. 整张纯白图：全部判为背景，由调用方按占比上限保留原图
{
  const size = 12
  const data = canvasOf(size, size, (x, y, i, pixels) => {
    pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255
  })
  const result = core.cutOutBackground(data, size, size)
  assert.equal(result.ratio, 1, '纯色图会全部判为背景，调用方需按占比拦截')
}

// 5. 满图队徽（只有很窄白边）时不能蔓延进主体：只有白边被去掉
{
  const size = 24
  const data = canvasOf(size, size, (x, y, i, pixels) => {
    const inside = x >= 4 && x <= 19 && y >= 4 && y <= 19
    const base = inside ? ((x + y) % 2 ? [200, 30, 40] : [30, 40, 200]) : [255, 255, 255]
    pixels[i] = base[0]
    pixels[i + 1] = base[1]
    pixels[i + 2] = base[2]
    pixels[i + 3] = 255
  })
  const result = core.cutOutBackground(data, size, size)
  assert.equal(result.removed, (size * size) - 16 * 16, '只去掉外圈白边，不蔓延进满图主体')
  assert.equal(alphaAt(data, size, 4, 4), 255, '主体像素保持不透明')
  assert.equal(alphaAt(data, size, 12, 12), 255, '主体中心保持不透明')
}

// 6. 小程序与 PC 的常量必须一致，避免两端效果分叉
const fs = require('node:fs')
const path = require('node:path')
const pc = fs.readFileSync(path.resolve(__dirname, '../web-admin-vue/src/utils/whiteBgRemover.js'), 'utf8')
assert.ok(pc.includes('options.threshold || 240') && pc.includes('options.tolerance || 60'), 'PC 端默认阈值/容差')
const mini = fs.readFileSync(path.resolve(__dirname, '../miniprogram/utils/logo-cutout-core.js'), 'utf8')
assert.ok(mini.includes('config.threshold || 240') && mini.includes('config.tolerance || 60'), '小程序端阈值/容差与 PC 对齐')
assert.ok(!/wx\./.test(fs.readFileSync(path.resolve(__dirname, '../miniprogram/utils/logo-cutout-core.js'), 'utf8')), 'core 不能依赖 wx，保证可单测')

console.log('PASS: 队徽去背算法（白底/彩色底/内部白色保护/透明白恢复/满图不误删）')
