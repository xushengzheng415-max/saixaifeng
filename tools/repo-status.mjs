#!/usr/bin/env node
// repo-status.mjs —— 仓库巡检，一条命令看清各分支 ahead/behind、工作区脏文件、活跃 worktree 与线上部署
// 每天开工前跑一次：node tools/repo-status.mjs
// 只读，不会修改任何文件。

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd())

function run(cmd) {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).trim() }
  catch { return '' }
}

function countLines(s) { return s ? s.split('\n').filter(Boolean).length : 0 }

console.log(`\n🗂️  赛小蜂足球仓库巡检  ${new Date().toLocaleString('zh-CN')}`)
console.log('='.repeat(60))

// 1. 当前分支 & HEAD
const branch = run('git rev-parse --abbrev-ref HEAD')
const head = run('git log -1 --format="%h %ci %s"')
console.log(`\n📍 当前分支: ${branch}`)
console.log(`   HEAD: ${head}`)

// 2. 远端拉取
console.log('\n📥 git fetch github ...')
run('git fetch github --prune')

// 3. 核心分支 ahead/behind
console.log('\n🔀 核心分支 ahead/behind（ahead/behind 计数）')
for (const b of ['main', 'preview', 'codex/platform-ops', branch]) {
  const remote = `github/${b}`
  if (!run(`git rev-parse --verify ${remote}`)) continue
  const cnt = run(`git rev-list --left-right --count ${b}...${remote}`)
  if (!cnt) continue
  const [behind, ahead] = cnt.split('\t').map(Number)
  const flag = behind > 0 ? '⚠️' : ahead > 0 ? '🔸' : '✅'
  console.log(`   ${flag} ${b.padEnd(28)} ahead=${ahead}  behind=${behind}`)
}

// 4. 工作区状态
console.log('\n📁 工作区')
const porcelain = run('git status --porcelain')
const lines = porcelain.split('\n').filter(Boolean)
const staged = lines.filter(l => l[0] !== ' ').length
const modified = lines.filter(l => l[0] === ' ').length
const untracked = lines.filter(l => l.startsWith('??')).length
console.log(`   已暂存: ${staged}   已修改: ${modified}   未跟踪: ${untracked}`)
if (lines.length > 0) {
  const top = lines.slice(0, 15)
  for (const l of top) console.log('   ' + l)
  if (lines.length > 15) console.log(`   ... 还有 ${lines.length - 15} 项`)
} else {
  console.log('   ✅ 干净')
}

// 5. Worktree 列表
console.log('\n🌲 Worktrees')
const wtRaw = run('git worktree list --porcelain')
const items = []
let cur = {}
for (const line of wtRaw.split('\n')) {
  if (line.startsWith('worktree ')) {
    if (cur.path) items.push(cur)
    cur = { path: line.substring(9) }
  } else if (line.startsWith('branch ')) {
    cur.branch = line.substring(7)
  } else if (line.startsWith('HEAD ')) {
    cur.head = line.substring(5)
  }
}
if (cur.path) items.push(cur)
const self = ROOT
for (const it of items) {
  it.isSelf = it.path === self
  it.exists = fs.existsSync(it.path)
  if (it.exists && !it.isSelf) {
    try {
      const st = run(`git -C "${it.path}" status --porcelain`)
      it.dirty = countLines(st)
    } catch { it.dirty = '?' }
  } else {
    it.dirty = it.isSelf ? null : (it.exists ? 0 : 'missing')
  }
}
const valid = items.filter(i => i.exists && !i.isSelf)
const dirtyWt = valid.filter(i => i.dirty > 0)
const missingWt = items.filter(i => !i.exists)
console.log(`   总数: ${items.length}  有效: ${valid.length}  有改动: ${dirtyWt.length}  已丢失: ${missingWt.length}`)
for (const w of valid) {
  const flag = w.dirty > 0 ? '⚠️' : '✅'
  const br = (w.branch || '(detached)').replace(/refs\/heads\//, '')
  const rel = w.path.replace(ROOT, '.').replace(/\\/g, '/')
  console.log(`   ${flag} ${dirtyWt.includes(w) ? w.dirty + ' 改动'.padEnd(10) : ''.padEnd(10)} ${br.padEnd(30)} ${rel}`)
}
for (const w of missingWt) {
  const rel = w.path.replace(ROOT, '.').replace(/\\/g, '/')
  console.log(`   ❓ 丢失  ${rel}`)
}

// 6. 远端线上部署入口（只读）
console.log('\n🌐 线上部署（fetch HEAD 标签确认是否落后）')
const deployPaths = [
  { label: '正式 PC 后台', url: 'https://www.sxffootball.cn/admin/index.html' },
  { label: '测试 PC 后台', url: 'https://www.sxffootball.cn/preview/admin/index.html' },
]
try {
  const { execSync: es } = await import('node:child_process')
  for (const d of deployPaths) {
    const res = es(`curl -sI "${d.url}" 2>&1`, { timeout: 10000, encoding: 'utf8' })
    const match = res.match(/Last-Modified:\s*(.+)/i)
    const ctMatch = res.match(/content-type:\s*([\w\/\-]+)/i)
    if (match) {
      console.log(`   ✅ ${d.label}  Last-Modified: ${match[1].trim()}  (${(ctMatch?.[1] || 'unknown').trim()})`)
    } else {
      console.log(`   ⚠️  ${d.label}  无法获取 Last-Modified`)
    }
  }
} catch (e) {
  console.log('   ⚠️  线上入口不可达（离线或超时），跳过线上核验')
}

// 7. 总结
console.log('\n📊 总结')
const issues = []
if (behind) issues.push('main 落后 github/main')
const aheadBranches = ['main', 'preview'].filter(b => {
  const cnt = run(`git rev-list --left-right --count ${b}...github/${b}`)
  if (!cnt) return false
  return parseInt(cnt.split('\t')[0], 10) > 0
})
if (aheadBranches.length > 0) issues.push(`本地分支落后远端: ${aheadBranches.join(', ')}`)
if (dirtyWt.length > 0) issues.push(`${dirtyWt.length} 个 worktree 有未提交改动（已导出补丁到归档区）`)
if (untracked + modified + staged > 0) issues.push(`主工作区有 ${untracked + modified + staged} 项待处理`)
if (missingWt.length > 0) issues.push(`${missingWt.length} 个 worktree 目录已丢失（跑 git worktree prune）`)

if (issues.length === 0) {
  console.log('   🎉 一切正常，没有发现阻塞开工的问题。')
} else {
  for (const i of issues) console.log('   ⚠️  ' + i)
}

console.log('')
