'use strict'

// 赛程阶段次序：小组赛 + 淘汰赛/排位赛 的统一口径。
//
// 数值大小既表示「先后顺序」，也被正式引擎当作硬顺序屏障使用
// （低阶段未踢完，高阶段不允许开赛），因此顺序必须与真实赛制一致：
//
//   小组赛 / 联赛轮次        20
//   前期淘汰轮（1/8、1/4）   30
//   低段排位赛（5–8 名段）   40   ← 小组赛结束后先打，再打半决赛
//   半决赛 / 冠军线交叉赛    50
//   三四名决赛               60   ← 必须在决赛之前
//   决赛                     70
//
// 关键点：
// 1. 阶段名优先于 phase 字段判定。「5–8名排位赛」既是排位赛，也必须在小组赛
//    全部结束后才开踢，不能用 phase==='placement' 一刀切。
// 2. 名次段取「起点」而不是「名次号」。历史实现取到的是名次号（3、5、7），
//    导致三四名赛(3)被判成低段、七八名赛(7)被判成更低段，于是出现
//    「决赛早于三四名赛」「七八名赛排在小组赛之前」这类次序错误。
// 3. 演示端（web-admin-vue/src/utils/demoWorkspace.mjs）与正式引擎
//    （cloudfunctions/generateSchedule/scheduler.js）共用本模块，避免各写一套。
//
// 官方赛制参考：FIBA/世界杯等赛会制均为「小组赛 → 半决赛 → 三四名决赛 → 决赛」，
// 小组赛后为 1/4 决赛时则「小组赛 → 1/4 决赛 → 半决赛 → 三四名 → 决赛」。

var EARLY = 20
var ROUND = 30
var PLACEMENT = 40
var SEMI = 50
var THIRD = 60
var FINAL = 70
var ORDER = { EARLY: EARLY, ROUND: ROUND, PLACEMENT: PLACEMENT, SEMI: SEMI, THIRD: THIRD, FINAL: FINAL }

var FINAL_STAGE = {}
FINAL_STAGE[SEMI] = true
FINAL_STAGE[THIRD] = true
FINAL_STAGE[FINAL] = true

var CN_DIGITS = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

// 中文数字转阿拉伯数字，覆盖「一」到「九十九」（轮次编号足够）
function cnToNumber(text) {
  var total = 0
  var section = 0
  for (var i = 0; i < String(text || '').length; i++) {
    var ch = String(text)[i]
    if (ch === '十') { total += (section || 1) * 10; section = 0; continue }
    var digit = CN_DIGITS[ch]
    if (digit != null) section = digit
  }
  return total + section
}

function nameOf(match) {
  return String(match && match.roundName || '')
}

function rangeTextOf(match) {
  return String((match && (match.rankRange || match.finalRankRange)) || '') + ' ' + nameOf(match)
}

// 名次段起点：'5–8名' → 5；'三、四名决赛' → 3；无数字名次段 → 0
function placementLowOf(text) {
  var source = String(text || '')
  var numeric = source.match(/(\d+)\s*[–—\-~至]\s*\d+\s*名/)
  if (numeric) return Number(numeric[1])
  var cn = source.match(/([零一二三四五六七八九十])\s*[、，]?\s*[零一二三四五六七八九十]?\s*名/)
  if (cn) {
    var digit = CN_DIGITS[cn[1]]
    return digit == null ? 0 : digit
  }
  return 0
}

// 结构化轮次号：优先取字段，其次解析「第三轮」/「第3轮」
function roundNumberOf(match) {
  var direct = Number(match && (match.round || match.roundIndex || match.roundNo) || 0)
  if (direct > 0) return direct
  var matched = nameOf(match).match(/^第\s*([零一二三四五六七八九十百\d]+)\s*轮/)
  if (!matched) return 0
  return /^\d+$/.test(matched[1]) ? Number(matched[1]) : cnToNumber(matched[1])
}

// 三四名决赛：中文（三四名赛/三、四名决赛）与阿拉伯（3–4名排位赛）都要认
function isThirdPlaceName(name) {
  var source = String(name || '')
  return /三四名|三、四名/.test(source) || /^\s*3\s*[–—\-~]\s*4\s*名/.test(source)
}

// 决赛：排除带前缀轮次的「1/4决赛」「1/8决赛」以及排位/交叉/半决赛命名
function isFinalName(name) {
  var source = String(name || '')
  if (!/决赛/.test(source)) return false
  return !/半决赛|三、四名|三四名|排位|交叉|淘汰赛|\d+\s*\/\s*\d+决赛/.test(source)
}

// 排位赛命名：显式「排位」，或「五六名赛」「七、八名赛」这类名次段称谓
function isPlacementName(name) {
  var source = String(name || '')
  if (/排位|placement/i.test(source)) return true
  return /^[零一二三四五六七八九十][、，]?[零一二三四五六七八九十]?名/.test(source) || /名次/.test(source)
}

function rankOfPlacement(match) {
  var name = nameOf(match)
  if (isThirdPlaceName(name)) return THIRD
  if (isFinalName(name)) return FINAL
  var low = placementLowOf(rangeTextOf(match))
  if (low >= 5) return PLACEMENT
  if (low >= 1) return SEMI
  return PLACEMENT
}

// 阶段档位：数值越小越先打
function stageRankOf(match) {
  var name = nameOf(match)
  if (isThirdPlaceName(name)) return THIRD
  if (isFinalName(name)) return FINAL
  if (/半决赛/.test(name)) return SEMI
  // 交叉赛/淘汰赛：低名次段（5–8 名）属于排位赛，冠军线则等同半决赛
  if (/淘汰赛/.test(name)) return placementLowOf(rangeTextOf(match)) >= 5 ? PLACEMENT : SEMI
  if (isPlacementName(name)) return rankOfPlacement(match)
  if (/1\/\d+决赛/.test(name)) return ROUND
  var phase = String(match && (match.phase || match.scheduleType || match.stage) || '').toLowerCase()
  if (phase === 'league') return EARLY
  if (phase === 'third') return THIRD
  if (phase === 'final') return FINAL
  if (phase === 'placement') return rankOfPlacement(match)
  if (match && match.isCritical === true) return SEMI
  return EARLY
}

// 排序键：档位 → 轮次 → 场序；同档位内轮次小的先打（如第一轮 → 第二轮）
function stageSortKey(match) {
  var rank = stageRankOf(match)
  return {
    rank: rank,
    round: roundNumberOf(match),
    matchNo: Number(match && (match.matchNo || match.matchIndex) || 0)
  }
}

function compareStage(left, right) {
  var a = stageSortKey(left)
  var b = stageSortKey(right)
  if (a.rank !== b.rank) return a.rank - b.rank
  if (a.round !== b.round) return a.round - b.round
  return a.matchNo - b.matchNo
}

// 决赛阶段（半决赛/三四名/决赛）：用于「独占时段」判定
function isFinalStage(match) {
  return FINAL_STAGE[stageRankOf(match)] === true
}

// 粗阶段：用于页面的「第X阶段」编号。半决赛、三四名决赛与决赛同属决赛阶段
// （内部先后由 stageRankOf 保证），与既有赛程阶段编号口径保持一致。
function coarseRankOf(match) {
  var rank = stageRankOf(match)
  if (rank === SEMI || rank === THIRD || rank === FINAL) return FINAL
  if (rank === PLACEMENT) return ROUND
  return rank
}

module.exports = {
  ORDER: ORDER,
  EARLY: EARLY,
  ROUND: ROUND,
  PLACEMENT: PLACEMENT,
  SEMI: SEMI,
  THIRD: THIRD,
  FINAL: FINAL,
  cnToNumber: cnToNumber,
  placementLowOf: placementLowOf,
  roundNumberOf: roundNumberOf,
  stageRankOf: stageRankOf,
  coarseRankOf: coarseRankOf,
  stageSortKey: stageSortKey,
  compareStage: compareStage,
  isFinalStage: isFinalStage,
  isThirdPlaceName: isThirdPlaceName,
  isFinalName: isFinalName
}
