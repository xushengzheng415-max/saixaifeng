import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepo = path.resolve(path.dirname(scriptPath), '..')
const files = [
  ['docs/releases/platform-zero-event-repair-20261028.md','发布记录/平台0比0无事件资料保存修复-20261028.md'],
  ['docs/DATA_CENTER_STANDARD_PROPOSAL_2026-09-29.md','DATA_CENTER_STANDARD_PROPOSAL_2026-09-29.md'],
  ...['README.md','CONTRACT.md','INTEGRATION.md','RELEASE.md','AUTO_SYNC.md','PLAYER_CARD_POINTS.md','DATA_HUB_FOUNDATION.md','DATA_HUB_INDEX_PLAN.json','NUMBERING_RULES.md'].map(name => ['docs/data-center/' + name,'data-center/' + name]),
  ['docs/PLATFORM_OPS_RELEASE.md','平台运营中心独立发布.md'],
  ['docs/PRODUCT_RULES.md','完整产品规则.md'],
  ['docs/ADR.md','产品与技术决策.md'],
  ['docs/CURRENT_STATUS.md','当前实施状态.md'],
  ...[
    'README.md', 'PLAYER_CARD_INTEGRATION.md', 'PLAYER_CARD_EDITOR_HANDOFF.md',
    'PLAYER_CARD_TEXT_STYLES.md', 'PLAYER_CARD_TEMPLATE_LIBRARY.md',
    'PLAYER_REGISTRATION_EVENT_IDENTITY_STANDARD.md', 'SHARED_TOURNAMENT_ACCESS.md',
    'TEAM_ROSTER_POSTER_STANDARD.md', 'PREVIEW_RELEASE_WORKFLOW.md',
    'ICON_SYSTEM.md', 'ICON_ASSET_CATALOG.md', 'UI_DELIVERY.md',
    'WECHAT_SERVICE_MENU.md', 'WECHAT_NOTIFICATION_TEMPLATE_CATALOG.md',
    'BRACKET_TEMPLATES.md', 'tournament-center-prd.md', 'tournament-center-architecture.md',
    'TEAM_PLAYER_READ_PERFORMANCE_2026-10-01.md', 'PLATFORM_CAPACITY_MONITOR_2026-10-01.md',
    'PLAYER_REGISTRATION_HANDOFF_2026-10-17.md', 'PLAYER_JOIN_REVIEW_HANDOFF_2026-10-19.md',
    '足球竞赛日程导出交接文档.md'
  ].map(name => ['docs/' + name, '项目规范/' + name]),
  ...['PLAYER_CARD_WORKFLOWS.md','PLAYER_CARD_UNIFY_HANDOFF.md'].map(name => ['docs/data-center/' + name, 'data-center/' + name]),
  ['AGENTS.md','项目规范/项目开发规则.md'],
  ['docs/releases/platform-data-hub-20261023.md','发布记录/platform-data-hub-20261023.md'],
  ['docs/releases/numbering-standard-20261023.md','发布记录/numbering-standard-20261023.md'],
  ['cloudfunctions/dataCenter/shared/numbering-regions.json','data-center/NUMBERING_REGIONS.json'],
  ['docs/data-center/history/球队编号规则-旧草案.md','data-center/history/球队编号规则-旧草案.md'],
  ['docs/data-center/history/球员编号规则-旧草案.md','data-center/history/球员编号规则-旧草案.md']
]
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
async function optionalRead(file) { try { return await fs.readFile(file) } catch (error) { if (error.code === 'ENOENT') return null; throw error } }
function within(root, relative) {
  const target = path.resolve(root,relative)
  const remainder = path.relative(root,target)
  if (remainder.startsWith('..') || path.isAbsolute(remainder)) throw new Error('同步路径越界')
  return target
}
async function atomicWrite(file,bytes) {
  await fs.mkdir(path.dirname(file),{recursive:true})
  const temporary = file + '.sync-' + crypto.randomUUID()
  await fs.writeFile(temporary,bytes)
  await fs.rename(temporary,file)
}

export async function synchronize({ repoRoot = defaultRepo, vaultRoot = 'E:/Documents/LLM-Wiki-Knowledge-Base', stateRoot, check = false, bootstrap = false } = {}) {
  repoRoot = await fs.realpath(repoRoot)
  vaultRoot = await fs.realpath(vaultRoot)
  const destination = within(vaultRoot,'01_Raw/01_赛小蜂足球/小程序与PC/数据中心')
  stateRoot = stateRoot || within(repoRoot,'.local-data-center-sync')
  const stateFile = path.join(stateRoot,'state.json')
  const rawState = await optionalRead(stateFile)
  const state = rawState ? JSON.parse(rawState.toString('utf8')) : {version:1,files:{}}
  const jobs = []
  for (const [sourceRelative,targetRelative] of files) {
    const source = within(repoRoot,sourceRelative)
    const bytes = await fs.readFile(source)
    if (!bytes.length) throw new Error('规范文档为空，等待保存完成：' + sourceRelative)
    jobs.push({source:sourceRelative,target:targetRelative,bytes})
  }
  const rules = await fs.readFile(within(repoRoot,'docs/PRODUCT_RULES.md'),'utf8')
  const heading = /^### 数据统一基准[^\n]*$/m.exec(rules)
  if (!heading) throw new Error('产品规则缺少数据统一基准章节，停止同步')
  const remainder = rules.slice(heading.index)
  const nextHeading = /^#{1,3} /m.exec(remainder.slice(heading[0].length))
  const dataRules = nextHeading ? remainder.slice(0,heading[0].length + nextHeading.index).trim() : remainder.trim()
  jobs.push({source:'docs/PRODUCT_RULES.md#数据统一基准',target:'PRODUCT_RULES.md',bytes:Buffer.from('# 数据板块有效产品边界\n\n本页由正式项目的数据规则章节生成。完整产品规则以正式项目 docs/PRODUCT_RULES.md 为准。\n\n' + dataRules + '\n','utf8')})

  const conflicts = [], changed = []
  // Preflight all targets before writing any of them. Manual Obsidian changes
  // remain intact; automatic synchronization never resolves conflicts by force.
  for (const job of jobs) {
    job.sourceHash = hash(job.bytes)
    job.targetPath = within(destination,job.target)
    job.previous = await optionalRead(job.targetPath)
    job.targetHash = job.previous ? hash(job.previous) : null
    const previous = state.files[job.target]
    if (job.targetHash === job.sourceHash) continue
    if (job.previous && ((!previous && !bootstrap) || (previous && job.targetHash !== previous.targetHash))) conflicts.push(job.target)
    else changed.push(job)
  }
  const result = {status:conflicts.length ? 'conflict' : changed.length ? 'pending' : 'current',changed:changed.map(job => job.target),conflicts,destination}
  if (check) return result
  if (conflicts.length) {
    const failed = {...state,status:'conflict',lastCheckedAt:new Date().toISOString(),conflicts}
    await atomicWrite(stateFile,Buffer.from(JSON.stringify(failed,null,2)))
    return result
  }
  const stamp = new Date().toISOString().replace(/[:.]/g,'-') + '-' + crypto.randomUUID().slice(0,8)
  const backupRoot = within(vaultRoot,'_Backups/数据规范自动同步/' + stamp)
  for (const job of changed) {
    if (job.previous) await atomicWrite(within(backupRoot,job.target),job.previous)
    await atomicWrite(job.targetPath,job.bytes)
    if (hash(await fs.readFile(job.targetPath)) !== job.sourceHash) throw new Error('同步后校验失败：' + job.target)
  }
  const manifest = Object.fromEntries(jobs.map(job => [job.target,{source:job.source,sourceHash:job.sourceHash,targetHash:job.sourceHash}]))
  const now = new Date().toISOString()
  const nextState = {version:1,status:'current',repoRoot,vaultRoot,destination,files:manifest,lastCheckedAt:now,lastSyncedAt:changed.length ? now : state.lastSyncedAt || now,lastChanged:changed.map(job => job.target),conflicts:[]}
  await atomicWrite(stateFile,Buffer.from(JSON.stringify(nextState,null,2)))
  if (changed.length) {
    const logFile = within(vaultRoot,'00_Index/变更日志.md')
    const existing = await optionalRead(logFile)
    if (existing) {
      const entry = '\n\n### 足球数据规范自动同步 ' + now + '\n\n- 更新：' + changed.map(job => '`' + job.target + '`').join('、') + '。\n- 已备份旧镜像并逐字节校验；仅同步规范，不代表代码发布或数据库迁移。\n'
      await atomicWrite(within(backupRoot,'00_Index/变更日志.md'),existing)
      await atomicWrite(logFile,Buffer.concat([existing,Buffer.from(entry)]))
    }
  }
  return {...result,status:'current',lastSyncedAt:nextState.lastSyncedAt,backup:changed.some(job => job.previous) ? backupRoot : null}
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const args = process.argv.slice(2)
  const argument = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
  try {
    const result = await synchronize({repoRoot:argument('--repo'),vaultRoot:argument('--vault'),stateRoot:argument('--state'),check:args.includes('--check'),bootstrap:args.includes('--bootstrap')})
    if (!args.includes('--quiet') || result.changed.length || result.conflicts.length) console.log(JSON.stringify(result))
    if (result.status !== 'current') process.exitCode = 1
  } catch (error) {
    console.error('知识库同步失败：' + error.message)
    const stateRoot = argument('--state') || path.join(argument('--repo') || defaultRepo,'.local-data-center-sync')
    await fs.mkdir(stateRoot,{recursive:true})
    await atomicWrite(path.join(stateRoot,'error.json'),Buffer.from(JSON.stringify({status:'failed',message:error.message,checkedAt:new Date().toISOString()})))
    process.exitCode = 1
  }
}
