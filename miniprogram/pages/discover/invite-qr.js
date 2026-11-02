// pages/discover/invite-qr.js
// 纯 JS QR 编码（字节模式，纠错等级 M，版本 1~10），用于邀约海报的 H5 报名二维码。
// 约束：
// 1. 不引入第三方依赖，也不调用生成小程序码的云函数（海报按 2026-11-02 口径只放 H5 报名二维码）；
// 2. 只做编码，不发起网络请求、不读写页面 data；
// 3. 输出为布尔矩阵，调用方按 modules 逐格描边即可，缩放不影响可扫性。

// 每个版本两组（L / M）分组表：每组是 [块数, 块总码字数, 块数据码字数] 的序列。
// 数据取自 QR 规范 RS 分组表（版本 1~10）。
var BLOCK_TABLE = {
  1: [[1, 26, 19], [1, 26, 16]],
  2: [[1, 44, 34], [1, 44, 28]],
  3: [[1, 70, 55], [1, 70, 44]],
  4: [[1, 100, 80], [2, 50, 32]],
  5: [[1, 134, 108], [2, 67, 43]],
  6: [[2, 86, 68], [4, 43, 27]],
  7: [[2, 98, 78], [4, 49, 31]],
  8: [[2, 121, 97], [2, 60, 38, 2, 61, 39]],
  9: [[2, 146, 116], [3, 58, 36, 2, 59, 37]],
  10: [[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44]]
}

// 纠错等级 M 对应索引 1（0=L, 1=M）
var ECC_INDEX = 1
var ECC_BITS = 0 // M = 00

// 对齐图形中心坐标（版本 1 无对齐图形）
var ALIGN_POSITIONS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50]
}

var MAX_VERSION = 10

// GF(256) 指数/对数表（本原多项式 0x11d）
var GF_EXP = []
var GF_LOG = []
;(function buildGalois() {
  var x = 1
  for (var i = 0; i < 255; i += 1) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (var j = 255; j < 512; j += 1) GF_EXP[j] = GF_EXP[j - 255]
})()

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

// 生成多项式（首项系数固定为 1，其余为返回数组）
function rsGenerator(degree) {
  var poly = [1]
  for (var i = 0; i < degree; i += 1) {
    var next = []
    for (var j = 0; j < poly.length + 1; j += 1) next[j] = 0
    for (var k = 0; k < poly.length; k += 1) {
      next[k] ^= poly[k]
      next[k + 1] ^= gfMul(poly[k], GF_EXP[i])
    }
    poly = next
  }
  return poly
}

function rsRemainder(data, degree) {
  var gen = rsGenerator(degree)
  var result = []
  for (var i = 0; i < degree; i += 1) result[i] = 0
  for (var d = 0; d < data.length; d += 1) {
    var factor = data[d] ^ result[0]
    result.shift()
    result.push(0)
    for (var g = 0; g < degree; g += 1) {
      result[g] ^= gfMul(gen[g + 1], factor)
    }
  }
  return result
}

function utf8Bytes(value) {
  var str = value == null ? '' : String(value)
  var bytes = []
  for (var i = 0; i < str.length; i += 1) {
    var code = str.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code >= 0xd800 && code <= 0xdbff) {
      var next = str.charCodeAt(i + 1)
      var merged = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
      bytes.push(0xf0 | (merged >> 18), 0x80 | ((merged >> 12) & 0x3f), 0x80 | ((merged >> 6) & 0x3f), 0x80 | (merged & 0x3f))
      i += 1
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return bytes
}

function dataCodewordsOf(version) {
  var groups = BLOCK_TABLE[version][ECC_INDEX]
  var total = 0
  for (var i = 0; i < groups.length; i += 3) total += groups[i] * groups[i + 2]
  return total
}

function pickVersion(byteLength) {
  for (var v = 1; v <= MAX_VERSION; v += 1) {
    var countBits = v < 10 ? 8 : 16
    var capacityBits = dataCodewordsOf(v) * 8
    if (4 + countBits + byteLength * 8 <= capacityBits) return v
  }
  return null
}

function buildCodewords(version, bytes) {
  var countBits = version < 10 ? 8 : 16
  var totalBits = dataCodewordsOf(version) * 8
  var bits = []
  var i
  function pushBits(value, length) {
    for (var b = length - 1; b >= 0; b -= 1) bits.push((value >> b) & 1)
  }
  pushBits(4, 4) // 字节模式 0100
  pushBits(bytes.length, countBits)
  for (i = 0; i < bytes.length; i += 1) pushBits(bytes[i], 8)

  var remaining = totalBits - bits.length
  var terminator = Math.min(4, remaining)
  for (i = 0; i < terminator; i += 1) bits.push(0)
  if (remaining > terminator) {
    var padToByte = (8 - (bits.length % 8)) % 8
    for (i = 0; i < padToByte; i += 1) bits.push(0)
  }
  var padBytes = [0xec, 0x11]
  var padIndex = 0
  while (bits.length < totalBits) {
    pushBits(padBytes[padIndex % 2], 8)
    padIndex += 1
  }

  var words = []
  for (i = 0; i < bits.length; i += 8) {
    var value = 0
    for (var b = 0; b < 8; b += 1) value = (value << 1) | (bits[i + b] || 0)
    words.push(value)
  }

  // 分块 + 纠错 + 交织
  var groups = BLOCK_TABLE[version][ECC_INDEX]
  var blocks = []
  var offset = 0
  for (i = 0; i < groups.length; i += 3) {
    var blockCount = groups[i]
    var totalCw = groups[i + 1]
    var dataCw = groups[i + 2]
    for (var c = 0; c < blockCount; c += 1) {
      var dataWords = words.slice(offset, offset + dataCw)
      offset += dataCw
      var eccWords = rsRemainder(dataWords, totalCw - dataCw)
      blocks.push({ data: dataWords, ecc: eccWords })
    }
  }

  var maxData = 0
  for (i = 0; i < blocks.length; i += 1) maxData = Math.max(maxData, blocks[i].data.length)

  var result = []
  for (var d = 0; d < maxData; d += 1) {
    for (i = 0; i < blocks.length; i += 1) {
      if (d < blocks[i].data.length) result.push(blocks[i].data[d])
    }
  }
  var eccLength = blocks.length ? blocks[0].ecc.length : 0
  for (var e = 0; e < eccLength; e += 1) {
    for (i = 0; i < blocks.length; i += 1) result.push(blocks[i].ecc[e])
  }
  return result
}

function bchFormat(data) {
  var value = data << 10
  var generator = 0x537
  var degree = 10
  var temp = value
  for (var i = 31; i >= degree; i -= 1) {
    if ((temp >> i) & 1) temp ^= generator << (i - degree)
  }
  return (value | temp) ^ 0x5412
}

function bchVersion(version) {
  var value = version << 12
  var generator = 0x1f25
  var degree = 12
  var temp = value
  for (var i = 31; i >= degree; i -= 1) {
    if ((temp >> i) & 1) temp ^= generator << (i - degree)
  }
  return value | temp
}

function maskPredicate(pattern, row, col) {
  var product = row * col
  switch (pattern) {
    case 0: return (row + col) % 2 === 0
    case 1: return row % 2 === 0
    case 2: return col % 3 === 0
    case 3: return (row + col) % 3 === 0
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5: return product % 2 + product % 3 === 0
    case 6: return (product % 2 + product % 3) % 2 === 0
    case 7: return ((row + col) % 2 + product % 3) % 2 === 0
    default: return false
  }
}

function createGrid(size) {
  var grid = []
  for (var r = 0; r < size; r += 1) {
    var row = []
    for (var c = 0; c < size; c += 1) row.push(null)
    grid.push(row)
  }
  return grid
}

function placeFinder(grid, row, col) {
  for (var r = -1; r <= 7; r += 1) {
    for (var c = -1; c <= 7; c += 1) {
      var targetRow = row + r
      var targetCol = col + c
      if (targetRow < 0 || targetRow >= grid.length || targetCol < 0 || targetCol >= grid.length) continue
      var inRange = r >= 0 && r <= 6 && c >= 0 && c <= 6
      var dark = false
      if (inRange) {
        dark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      }
      grid[targetRow][targetCol] = dark
    }
  }
}

function placeAlignment(grid, centerRow, centerCol) {
  for (var r = -2; r <= 2; r += 1) {
    for (var c = -2; c <= 2; c += 1) {
      var dark = Math.max(Math.abs(r), Math.abs(c)) !== 1
      grid[centerRow + r][centerCol + c] = dark
    }
  }
}

function fillFunctionPatterns(grid, version) {
  var size = grid.length
  placeFinder(grid, 0, 0)
  placeFinder(grid, size - 7, 0)
  placeFinder(grid, 0, size - 7)

  // 定向（timing）图形
  for (var i = 8; i < size - 8; i += 1) {
    grid[i][6] = i % 2 === 0
    grid[6][i] = i % 2 === 0
  }

  // 对齐图形
  var positions = ALIGN_POSITIONS[version] || []
  var last = positions.length - 1
  for (var a = 0; a < positions.length; a += 1) {
    for (var b = 0; b < positions.length; b += 1) {
      var row = positions[a]
      var col = positions[b]
      var nearFinder = (a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)
      if (nearFinder) continue
      placeAlignment(grid, row, col)
    }
  }

  // 固定暗点
  grid[size - 8][8] = true
  // 预留格式信息区（先占位，稍后写入）
  for (var k = 0; k < 9; k += 1) {
    if (grid[8][k] === null) grid[8][k] = false
    if (grid[k][8] === null) grid[k][8] = false
  }
  for (var m = 0; m < 8; m += 1) {
    if (grid[8][size - 1 - m] === null) grid[8][size - 1 - m] = false
    if (grid[size - 1 - m][8] === null) grid[size - 1 - m][8] = false
  }
  // 版本信息区（版本 >= 7）
  if (version >= 7) {
    for (var x = 0; x < 6; x += 1) {
      for (var y = 0; y < 3; y += 1) {
        if (grid[size - 11 + y][x] === null) grid[size - 11 + y][x] = false
        if (grid[x][size - 11 + y] === null) grid[x][size - 11 + y] = false
      }
    }
  }
}

function placeData(grid, codewords, mask) {
  var size = grid.length
  var byteIndex = 0
  var bitIndex = 7
  var inc = -1
  var row = size - 1

  for (var col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1
    while (true) {
      for (var c = 0; c < 2; c += 1) {
        var targetCol = col - c
        if (grid[row][targetCol] !== null) continue
        var dark = false
        if (byteIndex < codewords.length) {
          dark = ((codewords[byteIndex] >> bitIndex) & 1) === 1
        }
        if (maskPredicate(mask, row, targetCol)) dark = !dark
        grid[row][targetCol] = dark
        bitIndex -= 1
        if (bitIndex === -1) {
          byteIndex += 1
          bitIndex = 7
        }
      }
      row += inc
      if (row < 0 || row >= size) {
        row -= inc
        inc = -inc
        break
      }
    }
  }
}

function writeFormatAndVersion(grid, version, mask) {
  var size = grid.length
  var format = bchFormat((ECC_BITS << 3) | mask)
  var i
  for (i = 0; i < 15; i += 1) {
    var mod = ((format >> i) & 1) === 1
    if (i < 6) grid[i][8] = mod
    else if (i < 8) grid[i + 1][8] = mod
    else grid[size - 15 + i][8] = mod
  }
  for (i = 0; i < 15; i += 1) {
    var modH = ((format >> i) & 1) === 1
    if (i < 8) grid[8][size - i - 1] = modH
    else if (i < 9) grid[8][15 - i - 1 + 1] = modH
    else grid[8][15 - i - 1] = modH
  }
  grid[size - 8][8] = true

  if (version >= 7) {
    var versionBits = bchVersion(version)
    for (i = 0; i < 18; i += 1) {
      var modV = ((versionBits >> i) & 1) === 1
      grid[Math.floor(i / 3)][i % 3 + size - 11] = modV
      grid[i % 3 + size - 11][Math.floor(i / 3)] = modV
    }
  }
}

function penaltyScore(grid) {
  var size = grid.length
  var score = 0
  var r
  var c

  // 规则 1：行/列连续同色 >= 5
  for (r = 0; r < size; r += 1) {
    var runRow = 1
    var runCol = 1
    for (c = 1; c < size; c += 1) {
      if (grid[r][c] === grid[r][c - 1]) runRow += 1
      else { if (runRow >= 5) score += 3 + (runRow - 5); runRow = 1 }
      if (grid[c][r] === grid[c - 1][r]) runCol += 1
      else { if (runCol >= 5) score += 3 + (runCol - 5); runCol = 1 }
    }
    if (runRow >= 5) score += 3 + (runRow - 5)
    if (runCol >= 5) score += 3 + (runCol - 5)
  }

  // 规则 2：2x2 同色块
  for (r = 0; r < size - 1; r += 1) {
    for (c = 0; c < size - 1; c += 1) {
      var v = grid[r][c]
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3
    }
  }

  // 规则 3：形如 1:1:3:1:1 且两侧留白
  var patternA = [true, false, true, true, true, false, true, false, false, false, false]
  var patternB = [false, false, false, false, true, false, true, true, true, false, true]
  function matches(getter, start) {
    var a = true
    var b = true
    for (var k = 0; k < 11; k += 1) {
      var value = getter(start + k)
      if (value !== patternA[k]) a = false
      if (value !== patternB[k]) b = false
    }
    return a || b
  }
  for (r = 0; r < size; r += 1) {
    for (c = 0; c <= size - 11; c += 1) {
      if (matches(function (index) { return grid[r][index] }, c)) score += 40
      if (matches(function (index) { return grid[index][r] }, c)) score += 40
    }
  }

  // 规则 4：暗色比例偏离 50%
  var dark = 0
  for (r = 0; r < size; r += 1) {
    for (c = 0; c < size; c += 1) if (grid[r][c]) dark += 1
  }
  var ratio = dark / (size * size) * 100
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10

  return score
}

function buildMaskedGrid(version, codewords, mask) {
  var grid = createGrid(17 + version * 4)
  fillFunctionPatterns(grid, version)
  placeData(grid, codewords, mask)
  writeFormatAndVersion(grid, version, mask)
  return grid
}

// 对外入口：返回 { version, mask, size, modules: [[bool]] }；文本过长或非法时返回 null
function buildMatrix(value, options) {
  var bytes = utf8Bytes(value)
  if (!bytes.length) return null
  var version = options && options.version ? Number(options.version) : pickVersion(bytes.length)
  if (!version || version < 1 || version > MAX_VERSION) return null
  if (bytes.length > dataCodewordsOf(version)) return null
  var codewords = buildCodewords(version, bytes)
  var forcedMask = options && options.mask !== undefined && options.mask !== null ? Number(options.mask) : null

  var best = null
  var masks = forcedMask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [forcedMask]
  for (var i = 0; i < masks.length; i += 1) {
    var grid = buildMaskedGrid(version, codewords, masks[i])
    var score = forcedMask === null ? penaltyScore(grid) : 0
    if (!best || score < best.score) best = { score: score, mask: masks[i], grid: grid }
  }
  if (!best) return null

  var modules = []
  for (var r = 0; r < best.grid.length; r += 1) {
    var row = []
    for (var c = 0; c < best.grid.length; c += 1) row.push(best.grid[r][c] === true)
    modules.push(row)
  }
  return { version: version, mask: best.mask, size: modules.length, modules: modules }
}

module.exports = { buildMatrix: buildMatrix, pickVersion: pickVersion }
