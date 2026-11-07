// 阵型模板唯一真源同步工具。
// 真源：shared/formation-templates.json
// 产物：web-admin-vue/src/data/formation-data.json（PC 现有结构，供 VisualLineupEditor 兜底）
//       cloudfunctions/webLoginApi/formation-templates.json（运营后台读写服务端副本）
//       cloudfunctions/getMiniWorkspace/formation-templates.json（小程序/阵容提交运行时副本）
// 校验：getMiniWorkspace 必须从副本派生槽位表，禁止再维护手写 LINEUP_FORMATION_SLOTS 字面量。
// 用法：node tools/sync-formation-templates.mjs          写回副本
//       node tools/sync-formation-templates.mjs --check  只校验，不一致时退出码 1
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'shared/formation-templates.json')
const serverPath = path.join(root, 'cloudfunctions/getMiniWorkspace/index.js')
const consumers = [
  {
    file: path.join(root, 'web-admin-vue/src/data/formation-data.json'),
    value: templates => legacyProjection(templates),
    text: templates => formatLegacy(legacyProjection(templates))
  },
  {
    file: path.join(root, 'cloudfunctions/webLoginApi/formation-templates.json'),
    value: templates => templates,
    text: canonicalCopy
  },
  {
    file: path.join(root, 'cloudfunctions/getMiniWorkspace/formation-templates.json'),
    value: templates => templates,
    text: canonicalCopy
  },
  {
    // 小程序本地兜底种子：含 retired 阵型，供弱网/接口失败时历史名单回看。
    file: path.join(root, 'miniprogram/utils/formation-data.js'),
    value: templates => miniProjection(templates),
    text: templates => formatMini(miniProjection(templates)),
    parse: text => JSON.parse(text.replace(/^[\s\S]*?module\.exports\s*=\s*/, ''))
  }
]

const check = process.argv.includes('--check')
const DF = new Set(['SW', 'LB', 'RB', 'CB', 'CB1', 'CB2', 'CB3', 'LWB', 'RWB', 'DF'])
const MF = new Set(['DM', 'CM', 'CM1', 'CM2', 'CM3', 'CM4', 'LM', 'RM', 'AM', 'MF'])

// 与 formationTemplates.cjs / 编辑器保持一致：粗角色码只用于 starters[].slotPosition，
// 细角色码（CB1/LM/ST…）仍保留在 positions[].role 作为历史契约。
export function deriveSlotRole(role) {
  const code = String(role || '').trim().toUpperCase()
  if (code === 'GK') return 'GK'
  if (DF.has(code) || /^(CB|LB|RB|LWB|RWB|SW)/.test(code)) return 'DF'
  if (MF.has(code) || /^(DM|CM|LM|RM|AM)/.test(code)) return 'MF'
  return 'FW'
}

function canonicalCopy(templates) {
  return JSON.stringify(templates, null, 2) + '\n'
}

// 保持 PC 现有 formation-data.json 的排版（每个点位一行），避免同步时产生整文件重排噪音。
function formatLegacy(projection) {
  const lines = ['{']
  const formats = Object.entries(projection)
  formats.forEach(([label, format], formatIndex) => {
    lines.push(`  ${JSON.stringify(label)}: {`)
    lines.push(`    "description": ${JSON.stringify(format.description)},`)
    lines.push('    "formations": {')
    const formations = Object.entries(format.formations)
    formations.forEach(([code, formation], formationIndex) => {
      lines.push(`      ${JSON.stringify(code)}: {`)
      lines.push(`        "name": ${JSON.stringify(formation.name)},`)
      lines.push(`        "description": ${JSON.stringify(formation.description)},`)
      lines.push('        "positions": [')
      formation.positions.forEach((position, positionIndex) => {
        const body = `{ "role": ${JSON.stringify(position.role)}, "label": ${JSON.stringify(position.label)}, "x": ${position.x}, "y": ${position.y} }`
        lines.push(`          ${body}${positionIndex === formation.positions.length - 1 ? '' : ','}`)
      })
      lines.push('        ]')
      lines.push(`      }${formationIndex === formations.length - 1 ? '' : ','}`)
    })
    lines.push('    }')
    lines.push(`  }${formatIndex === formats.length - 1 ? '' : ','}`)
  })
  lines.push('}')
  return lines.join('\n') + '\n'
}

function legacyProjection(templates) {
  const result = {}
  for (const format of Object.values(templates.formats)) {
    const formations = {}
    for (const code of format.active) {
      const template = format.templates[code]
      if (!template) continue
      formations[code] = {
        name: template.name,
        description: template.description || '',
        positions: template.positions.map(position => ({ role: position.role, label: position.label, x: position.x, y: position.y }))
      }
    }
    result[format.label] = { description: format.description || '', formations }
  }
  return result
}

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function validateCanonical(templates) {
  const sizes = Object.keys(templates.formats).map(Number).sort((a, b) => a - b)
  if (!sizes.length) return fail('阵型真源为空：shared/formation-templates.json')
  for (const size of sizes) {
    const format = templates.formats[size]
    if (format.playersOnField !== size) fail(`${format.label} 的 playersOnField 与人数制不一致`)
    const keys = Object.keys(format.templates)
    const declared = [...format.active, ...format.retired].sort()
    if (keys.length !== declared.length || keys.slice().sort().join('|') !== declared.join('|')) {
      fail(`${format.label} 的 active/retired 清单与 templates 键不一致`)
    }
    for (const code of format.active) {
      const template = format.templates[code]
      if (!template) { fail(`${format.label} ${code} 缺少模板定义`); continue }
      validateTemplate(format, code, template, 'active')
    }
    for (const code of format.retired) {
      const template = format.templates[code]
      if (!template) { fail(`${format.label} ${code} 缺少停用模板定义`); continue }
      validateTemplate(format, code, template, 'retired')
    }
  }
}

function validateTemplate(format, code, template, status) {
  const label = `${format.label} ${code}`
  if (template.status !== status) fail(`${label} 的 status 与清单不一致`)
  if (!Array.isArray(template.positions) || template.positions.length !== format.playersOnField) {
    fail(`${label} 点位数 ${template.positions ? template.positions.length : 0} 与 ${format.playersOnField} 人制不一致`)
    return
  }
  if (!Array.isArray(template.slotRoles) || template.slotRoles.length !== template.positions.length) {
    fail(`${label} 的 slotRoles 长度与点位不一致`)
    return
  }
  const roles = new Set()
  let goalkeeper = 0
  template.positions.forEach((position, index) => {
    const x = Number(position.x)
    const y = Number(position.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) fail(`${label} 第 ${index + 1} 个点位坐标超出 0-100`)
    if (!String(position.role || '').trim() || !String(position.label || '').trim()) fail(`${label} 第 ${index + 1} 个点位缺少角色码或中文名`)
    if (roles.has(position.role)) fail(`${label} 角色码重复：${position.role}`)
    roles.add(position.role)
    if (position.role === 'GK') goalkeeper += 1
    if (deriveSlotRole(position.role) !== template.slotRoles[index]) {
      fail(`${label} 第 ${index + 1} 个点位的粗角色码应为 ${deriveSlotRole(position.role)}，实际 ${template.slotRoles[index]}`)
    }
  })
  if (goalkeeper !== 1) fail(`${label} 必须且只能有 1 名守门员，实际 ${goalkeeper}`)
  const rows = String(code).split('-').map(Number)
  if (rows.some(row => !Number.isInteger(row) || row <= 0) || rows.reduce((sum, row) => sum + row, 0) + 1 !== format.playersOnField) {
    fail(`${label} 的阵型编号与 ${format.playersOnField} 人制不匹配（编号各行之和应等于场上人数 - 1）`)
  }
}

// 小程序本地兜底：保留现有 formation-data.js 的制式/阵型结构，附带 status 供 formation-rules 区分退役阵型。
function miniProjection(templates) {
  const result = {}
  for (const format of Object.values(templates.formats)) {
    const formations = {}
    for (const code of [...format.active, ...format.retired]) {
      const template = format.templates[code]
      if (!template) continue
      formations[code] = {
        name: template.name,
        description: template.description || '',
        status: template.status,
        positions: template.positions.map(position => ({
          role: position.role,
          label: position.label,
          x: position.x,
          y: position.y
        }))
      }
    }
    result[format.label] = { description: format.description || '', formations }
  }
  return result
}

function formatMini(projection) {
  return '// 由 tools/sync-formation-templates.mjs 从 shared/formation-templates.json 生成，请勿手工修改。\n'
    + '// 仅作小程序弱网/接口失败时的本地兜底；阵型清单与坐标以运营后台已发布模板为准。\n'
    + 'module.exports = ' + JSON.stringify(projection, null, 2) + '\n'
}

async function validateServerDerivation() {
  const source = await fs.readFile(serverPath, 'utf8')
  if (source.indexOf("require('./formation-templates.json')") < 0) {
    fail('getMiniWorkspace 未从 formation-templates.json 派生槽位表')
  }
  if (source.indexOf('const LINEUP_FORMATION_SLOTS = {') >= 0) {
    fail('getMiniWorkspace 仍维护手写 LINEUP_FORMATION_SLOTS 字面量，请改为由模板 slotRoles 派生')
  }
}

async function main() {
  const templates = JSON.parse(await fs.readFile(sourcePath, 'utf8'))
  validateCanonical(templates)
  await validateServerDerivation()
  for (const consumer of consumers) {
    const value = consumer.value(templates)
    const relative = path.relative(root, consumer.file).replace(/\\/g, '/')
    const actual = await fs.readFile(consumer.file, 'utf8').catch(() => null)
    let inSync = false
    if (actual != null) {
      try {
        const parsed = consumer.parse ? consumer.parse(actual) : JSON.parse(actual)
        inSync = JSON.stringify(parsed) === JSON.stringify(value)
      } catch { inSync = false }
    }
    if (inSync) continue
    if (check) fail(`阵型模板副本未同步：${relative}`)
    else {
      await fs.mkdir(path.dirname(consumer.file), { recursive: true })
      await fs.writeFile(consumer.file, consumer.text(templates))
    }
  }
  if (!process.exitCode) console.log(check ? 'PASS: 阵型模板真源、服务端角色序列与副本一致' : '阵型模板已同步')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
