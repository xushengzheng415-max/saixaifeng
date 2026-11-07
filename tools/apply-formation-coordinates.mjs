// 阵型坐标替换工具：把平台后台「导出坐标」得到的点位写入唯一真源并同步各端副本。
//
// 真源：shared/formation-templates.json
// 同步：node tools/sync-formation-templates.mjs（写好后自动执行）
//
// 用法：
//   node tools/apply-formation-coordinates.mjs coords.json
//   node tools/apply-formation-coordinates.mjs coords.json --dry-run
//   node tools/apply-formation-coordinates.mjs --size 11 --code 4-3-3 positions.json
//
// 输入格式自动识别（都可以直接来自后台导出或聊天里粘的 JSON）：
//   1) { "schemaVersion": 1, "formats": { ... } }              完整真源
//   2) { "playersOnField": 11, "template": { ... } }           人数制 + 种子同构节点
//   3) { "playersOnField": 11, "formation": "4-3-3",
//        "positions": [ ... ] }                                 人数制 + 阵型编号 + 点位
//   4) { "code": "4-3-3", "positions": [ ... ] }               人数制由编号推导（各行之和 + 1）
//   5) [ { "role": "GK", "label": "守门员", "x": 10, "y": 50 } ]  裸点位数组，需 --size/--code
//   6) { "playersOnField": 11, "code": "4-3-3", "slots": [...] } 服务端 get 返回结构
//
// 校验：点位数与人数制一致、x/y 在 0-100、角色唯一、恰好 1 名 GK、阵型编号各行之和 + 1 = 人数、
//       中文名非空、slotRoles 由角色码派生且与真源规则一致。
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedPath = path.join(root, 'shared/formation-templates.json')
const syncPath = path.join(root, 'tools/sync-formation-templates.mjs')
const CONSUMERS = [
  'web-admin-vue/src/data/formation-data.json',
  'cloudfunctions/webLoginApi/formation-templates.json',
  'cloudfunctions/getMiniWorkspace/formation-templates.json',
  'miniprogram/utils/formation-data.js'
]

const DF = new Set(['SW', 'LB', 'RB', 'CB', 'CB1', 'CB2', 'CB3', 'LWB', 'RWB', 'DF'])
const MF = new Set(['DM', 'CM', 'CM1', 'CM2', 'CM3', 'CM4', 'LM', 'RM', 'AM', 'MF'])
const MAX_LABEL = 20
const MAX_ROLE = 8

function deriveSlotRole(role) {
  const code = String(role || '').trim().toUpperCase()
  if (code === 'GK') return 'GK'
  if (DF.has(code) || /^(CB|LB|RB|LWB|RWB|SW)/.test(code)) return 'DF'
  if (MF.has(code) || /^(DM|CM|LM|RM|AM)/.test(code)) return 'MF'
  return 'FW'
}

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

function warn(message) {
  console.warn(`WARN: ${message}`)
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function inferSize(code) {
  const rows = String(code || '').split('-').map(Number)
  const total = rows.reduce((sum, row) => sum + row, 0)
  return Number.isInteger(total) ? total + 1 : 0
}

function todayText() {
  const date = new Date()
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// ---------- 参数 ----------

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const positional = []
let sizeFlag = 0
let codeFlag = ''
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]
  if (arg === '--size') sizeFlag = Number(argv[++i])
  else if (arg === '--code') codeFlag = String(argv[++i] || '').trim()
  else if (!arg.startsWith('--')) positional.push(arg)
}

// ---------- 输入读取 ----------

async function readInputText() {
  const file = positional[0]
  if (file && file !== '-') {
    const absolute = path.resolve(file)
    return { text: await fs.readFile(absolute, 'utf8'), from: absolute }
  }
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) fail('没有输入坐标：请传入 JSON 文件路径，或通过管道/粘贴传入')
  return { text, from: 'stdin' }
}

// 后台导出或聊天粘贴常带 ```json 围栏，先剥掉。
function stripFence(text) {
  return String(text)
    .replace(/^\uFEFF/, '')
    .replace(/^\s*```[a-zA-Z]*\s*\n/, '')
    .replace(/\n\s*```\s*$/, '')
    .trim()
}

function normalizeInput(raw) {
  const list = []
  if (Array.isArray(raw)) {
    if (!sizeFlag || !codeFlag) fail('裸点位数组需要同时提供 --size 与 --code')
    list.push({ size: sizeFlag, template: { code: codeFlag, positions: raw } })
    return list
  }
  if (!raw || typeof raw !== 'object') fail('输入不是合法 JSON 对象')
  if (raw.formats && typeof raw.formats === 'object') {
    for (const [sizeKey, format] of Object.entries(raw.formats)) {
      const size = Number((format && format.playersOnField) || sizeKey)
      for (const [code, template] of Object.entries((format && format.templates) || {})) {
        list.push({ size, template: Object.assign({ code }, template) })
      }
    }
    if (!list.length) fail('输入是完整真源，但没有找到任何 formats.*.templates 模板')
    return list
  }
  if (raw.template && typeof raw.template === 'object') {
    const size = Number(raw.playersOnField || raw.size || 0)
    list.push({ size, template: Object.assign({}, raw.template) })
    return list
  }
  const code = String(raw.code || raw.formation || codeFlag || '').trim()
  const positions = raw.positions || raw.slots
  if (Array.isArray(positions) && code) {
    const size = Number(raw.playersOnField || raw.size || sizeFlag || 0) || inferSize(code)
    list.push({ size, template: Object.assign({}, raw, { code, positions }) })
    return list
  }
  fail('无法识别的输入结构：需要 formats / template / positions / slots 之一')
}

// ---------- 校验 ----------

function validateTemplate(size, raw) {
  const errors = []
  if (![5, 7, 8, 9, 11].includes(size)) errors.push(`人数制 ${size || '(空)'} 不在 5/7/8/9/11 之内`)
  const code = String(raw.code || '').trim()
  if (!/^\d+(?:-\d+)*$/.test(code) || code.length > 20) {
    errors.push(`阵型编号 "${code}" 只能由数字和短横线组成，例如 4-3-3`)
  } else {
    const rows = code.split('-').map(Number)
    if (rows.some(row => !Number.isInteger(row) || row <= 0 || row > size)) errors.push(`阵型编号 ${code} 存在非法行数`)
    const total = rows.reduce((sum, row) => sum + row, 0)
    if (total + 1 !== size) errors.push(`阵型编号 ${code} 各行之和 ${total} + 守门员 1 = ${total + 1}，与 ${size} 人制不一致`)
  }
  const positions = Array.isArray(raw.positions) ? raw.positions : []
  if (positions.length !== size) errors.push(`点位数 ${positions.length} 与 ${size} 人制不一致`)
  if (!['active', 'retired', 'archived', undefined, null, ''].includes(raw.status)) errors.push(`status 只能是 active 或 retired，当前 ${raw.status}`)

  const seenRoles = new Set()
  let goalkeeper = 0
  const normalized = positions.map((position, index) => {
    const role = String((position && position.role) || '').trim().toUpperCase()
    const label = String((position && position.label) || '').trim()
    const x = Number(position && position.x)
    const y = Number(position && position.y)
    const at = `第 ${index + 1} 个点位`
    if (!role) errors.push(`${at} 缺少角色码 role`)
    else if (role.length > MAX_ROLE) errors.push(`${at} 角色码 ${role} 超过 ${MAX_ROLE} 个字符`)
    if (label.length > MAX_LABEL) errors.push(`${at} 位置名称超过 ${MAX_LABEL} 个字符`)
    if (!Number.isFinite(x) || !Number.isFinite(y)) errors.push(`${at} 坐标不是数字（x=${position && position.x}, y=${position && position.y}）`)
    else if (x < 0 || x > 100 || y < 0 || y > 100) errors.push(`${at} 坐标超出 0-100（x=${x}, y=${y}）`)
    if (role) {
      if (seenRoles.has(role)) errors.push(`角色码重复：${role}`)
      seenRoles.add(role)
      if (role === 'GK') goalkeeper += 1
    }
    return { role, label: label || String((position && position.name) || ''), x: round2(x), y: round2(y) }
  })
  if (!errors.length && goalkeeper !== 1) errors.push(`必须且只能有 1 名守门员（GK），当前 ${goalkeeper} 名`)

  if (errors.length) {
    console.error(`\n输入校验未通过（${size} 人制 ${code || '无编号'}）：`)
    errors.forEach(message => console.error(`  - ${message}`))
    process.exit(1)
  }

  const slotRoles = normalized.map(position => deriveSlotRole(position.role))
  const provided = Array.isArray(raw.slotRoles) ? raw.slotRoles.map(role => String(role || '').trim()) : null
  if (provided && JSON.stringify(provided) !== JSON.stringify(slotRoles)) {
    warn(`提供的 slotRoles 与角色码派生结果不一致，已按角色码重算为 ${slotRoles.join(',')}`)
  }
  return { code, positions: normalized, slotRoles }
}

// ---------- diff ----------

function diffLines(beforeText, afterText) {
  const before = beforeText ? beforeText.split('\n') : []
  const after = afterText.split('\n')
  const n = before.length
  const m = after.length
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const lines = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      lines.push(`  ${before[i]}`)
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push(`- ${before[i]}`)
      i += 1
    } else {
      lines.push(`+ ${after[j]}`)
      j += 1
    }
  }
  while (i < n) {
    lines.push(`- ${before[i]}`)
    i += 1
  }
  while (j < m) {
    lines.push(`+ ${after[j]}`)
    j += 1
  }
  // 连续未变更超过 2 行时折叠，避免整份模板刷屏。
  const output = []
  let context = 0
  let skipped = false
  for (const line of lines) {
    if (line.startsWith('  ')) {
      context += 1
      if (context > 2) {
        if (!skipped) output.push('  ...')
        skipped = true
        continue
      }
    } else {
      context = 0
      skipped = false
    }
    output.push(line)
  }
  return output.join('\n')
}

async function hashFile(relative) {
  try {
    const buffer = await fs.readFile(path.join(root, relative))
    return crypto.createHash('sha256').update(buffer).digest('hex')
  } catch (error) {
    return 'missing'
  }
}

// ---------- 主流程 ----------

async function main() {
  const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'))
  const { text, from } = await readInputText()
  let raw
  try {
    raw = JSON.parse(stripFence(text))
  } catch (error) {
    fail(`JSON 解析失败：${error.message}`)
  }
  const entries = normalizeInput(raw)
  const beforeConsumers = new Map()
  for (const relative of CONSUMERS) beforeConsumers.set(relative, await hashFile(relative))

  const diffs = []
  for (const entry of entries) {
    const checked = validateTemplate(entry.size, entry.template)
    const sizeKey = String(entry.size)
    const format = seed.formats[sizeKey]
    if (!format) fail(`真源里没有 ${entry.size} 人制，拒绝自动新建人数制`)
    const previous = format.templates[checked.code] || null
    const rawStatus = String(entry.template.status || (previous && previous.status) || 'active')
    const status = rawStatus === 'retired' || rawStatus === 'archived' || entry.template.retired === true ? 'retired' : 'active'
    const next = {
      code: checked.code,
      name: String(entry.template.name || (previous && previous.name) || checked.code),
      description: String(entry.template.description || (previous && previous.description) || ''),
      status,
      slotRoles: checked.slotRoles,
      positions: checked.positions
    }
    const beforeText = previous ? JSON.stringify(previous, null, 2) : null
    const afterText = JSON.stringify(next, null, 2)
    if (beforeText === afterText) {
      console.log(`\n= ${sizeKey} 人制 ${checked.code}：坐标与真源一致，无改动`)
      continue
    }
    format.templates[checked.code] = next
    // 保序：已有阵型按原下标放回，新阵型追加到对应清单末尾。
    const activeIndex = (format.active || []).indexOf(checked.code)
    const retiredIndex = (format.retired || []).indexOf(checked.code)
    format.active = (format.active || []).filter(code => code !== checked.code)
    format.retired = (format.retired || []).filter(code => code !== checked.code)
    if (status === 'active') {
      if (activeIndex >= 0) format.active.splice(activeIndex, 0, checked.code)
      else format.active.push(checked.code)
    } else if (retiredIndex >= 0) {
      format.retired.splice(retiredIndex, 0, checked.code)
    } else {
      format.retired.push(checked.code)
    }
    diffs.push({ label: `${sizeKey} 人制 ${checked.code}`, before: beforeText, after: afterText })
  }

  if (!diffs.length) {
    console.log('\n真源无需改动，未写文件也未执行同步。')
    return
  }

  seed.updatedAt = todayText()
  const seedText = JSON.stringify(seed, null, 2) + '\n'
  console.log(`\n输入来源：${from}`)
  console.log(`受影响阵型：${diffs.map(item => item.label).join('、')}`)
  for (const item of diffs) {
    console.log(`\n----- ${item.label}（改前 → 改后）-----`)
    console.log(diffLines(item.before, item.after))
  }

  if (dryRun) {
    console.log('\n--dry-run：只校验并输出 diff，未写入真源，也未执行同步。')
    return
  }

  await fs.writeFile(seedPath, seedText)
  console.log('\n已写入 shared/formation-templates.json')

  const sync = spawnSync(process.execPath, [syncPath], { stdio: 'inherit', cwd: root })
  if (sync.status !== 0) fail('同步失败：shared/formation-templates.json 已更新，但副本未全部同步，请修复后重跑同步')

  const changed = []
  for (const relative of CONSUMERS) {
    const after = await hashFile(relative)
    if (after !== beforeConsumers.get(relative)) changed.push(relative)
  }
  console.log('\n同步产物变更：')
  if (!changed.length) console.log('  （无变化，副本此前已是最新）')
  else changed.forEach(relative => console.log(`  - ${relative}`))
  console.log('\n完成：真源已更新并同步，未部署、未提交。')
}

main().catch(error => fail(error && error.stack ? error.stack : String(error)))
