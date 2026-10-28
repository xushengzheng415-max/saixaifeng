import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepo = path.resolve(path.dirname(scriptPath), '..')
const files = [
  ['docs/releases/player-card-fonts-stroke-20261028.md','发布记录/球员卡字体描边铜色渐变-20261028.md'],
  ['docs/releases/mini-1.2.23-upload-20261028.md','发布记录/小程序1.2.23上传与空球队身份修复-20261028.md'],
  ['docs/releases/home-client-two-download-options-20261028.md','发布记录/官网客户端下载双选项-20261028.md'],
  ['docs/releases/platform-zero-event-repair-20261028.md','发布记录/平台0比0无事件资料保存修复-20261028.md'],
  ['docs/releases/platform-ai-portrait-tool-20261028.md','发布记录/平台后台自主生成球衣照与模型联动-20261028.md'],
  ['docs/releases/android-pad-0.1.1-20261028.md','发布记录/安卓平板客户端0.1.1刷新修复-20261028.md'],
  ['docs/releases/android-platform-1.0.0-20261028.md','发布记录/平台运营中心安卓平板客户端-1.0.0-20261028.md'],
  ['docs/releases/platform-titlebar-wco-20261028.md','发布记录/平台桌面应用窗口标题条可读性修复-20261028.md'],
  ['docs/releases/platform-update-refresh-20261028.md','发布记录/平台运营中心更新可刷新-20261028.md'],
  ['docs/releases/android-platform-1.0.1-20261028.md','发布记录/平台运营中心安卓客户端1.0.1应用内更新-20261028.md'],
  ['docs/releases/ai-portrait-hd-chain-20261028.md','发布记录/AI形象照高清链路修复-20261028.md'],
  ['docs/releases/pad-compact-sidebar-preview-20261028.md','发布记录/平板收起侧栏与紧凑布局-20261028.md'],
  ['docs/handoffs/VALUATION_SNAPSHOT_TRIGGER_AUDIT_2026-10-28.md','研发交接/身价计算与快照缺失调查-20261028.md'],
  ['docs/handoffs/AI_PORTRAIT_DEMO_HANDOFF_2026-10-28.md','研发交接/AI形象照演示页交接-2026-10-28.md'],
  ['docs/handoffs/DISCOVER_PUBLIC_PLAYER_POOL_2026-10-28.md','研发交接/发现真实球员池与完整分页-20261028.md'],
  ['docs/releases/android-pad-0.1.0-20261028.md','发布记录/安卓平板客户端0.1.0-20261028.md'],
  ['android-pad/README.md','研发交接/安卓平板客户端首版-20261028.md'],
  ['docs/releases/registration-template-player-limit-20261028.md','发布记录/registration-template-player-limit-20261028.md'],
  ['docs/handoffs/DISCOVER_TRANSFER_REFERENCE_RESTORE_2026-10-28.md','研发交接/发现转会页按原图纠偏-20261028.md'],
  ['outputs/发现转会原图还原20261028/390宽-真实数据布局复核.png','原型资料/发现转会原图还原-390宽-20261028.png'],
  ['outputs/发现转会原图还原20261028/360宽-真实数据布局复核.png','原型资料/发现转会原图还原-360宽-20261028.png'],
  ['docs/releases/pad-phone-login-preview-20261028.md','发布记录/平板手机号验证码登录-20261028.md'],
  ['docs/releases/tablet-scroll-login-preview-20261028.md','发布记录/平板滚动遮挡与竖版登录修复-20261028.md'],
  ['docs/design/tablet-login-vertical-logo-20261028.png','设计规范/平板竖版LOGO登录排版-20261028.png'],
  ['docs/releases/tablet-landscape-preview-20261028.md','发布记录/vivo-Pad3-Pro横屏测试版-20261028.md'],
  ['docs/marketing/TEAM_LEADER_ONBOARDING_ANNOUNCEMENT_2026-10-28.md','项目规范/领队群入驻公告成稿-20261028.md'],
  ['docs/design/team-leader-onboarding-poster-20261028.png','设计规范/领队入驻竖版公告图-20261028.png'],
  ['docs/design/team-leader-onboarding-poster-20261028.html','设计规范/领队入驻竖版公告图源文件-20261028.html'],
  ['docs/design/team-leader-onboarding-poster-20261028-plain.png','设计规范/领队入驻竖版公告图-纯公告版-20261028.png'],
  ['docs/design/team-leader-onboarding-poster-20261028-plain.html','设计规范/领队入驻竖版公告图纯公告版源文件-20261028.html'],
  ['docs/design/team-leader-onboarding-poster-20261028-plain-qr.png','设计规范/领队入驻竖版公告图-纯公告带空白码位-20261028.png'],
  ['docs/design/team-leader-onboarding-poster-20261028-plain-qr.html','设计规范/领队入驻竖版公告图纯公告带空白码位源文件-20261028.html'],
  ['docs/handoffs/TABLET_LANDSCAPE_VIVO_PAD3_PRO_2026-10-28.md','研发交接/vivo-Pad3-Pro横屏后台适配-20261028.md'],
  ['docs/design/tablet-landscape-vivo-pad3-pro-20261028.png','设计规范/vivo-Pad3-Pro横屏后台样例-20261028.png'],
  ['docs/handoffs/PUBLIC_TRANSFER_MARKET_DECOMPOSITION_2026-10-27.md','研发交接/发现公开转会市场单页拆解-20261027.md'],
  ['产品设计/发现公开转会市场单页拆解20261027.zip','原型资料/发现公开转会市场单页拆解20261027.zip'],
  ['docs/HONEY_PAYMENT_ACCEPTANCE_HANDOFF_2026-10-28.md','研发交接/微信支付凭据验收与上线交接-20261028.md'],
  ['docs/HONEY_TOPUP_HANDOFF_2026-10-27.md','项目规范/蜂蜜积分与充值逻辑交接-2026-10-27.md'],
  ['docs/HONEY_TOPUP_IMPLEMENTATION_2026-10-27.md','项目规范/蜂蜜充值与微信支付实现说明-2026-10-27.md'],
  ['docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md','项目规范/个人蜂蜜与会员定价方案-2026-10-27.md'],
  ['docs/releases/home-client-download-20261027.md','发布记录/官网客户端下载入口-20261027.md'],
  ['docs/releases/windows-client-0.2.3-20261027.md','发布记录/Windows客户端-v0.2.3-20261027.md'],
  ['docs/releases/windows-client-0.2.2-20261027.md','发布记录/Windows客户端-v0.2.2-20261027.md'],
  ['desktop-windows/assets/brand-original-square.png','品牌素材/赛小蜂足球-方形原图.png'],
  ['docs/releases/windows-client-0.2.1-20261027.md','发布记录/Windows客户端-v0.2.1-20261027.md'],
  ['desktop-windows/assets/brand-original-vertical.png','品牌素材/赛小蜂足球-竖版原图.png'],
  ['docs/releases/windows-client-0.2.0-20261027.md','发布记录/Windows客户端-v0.2.0-20261027.md'],
  ['desktop-windows/assets/brand-preview.png','设计规范/Windows客户端应用图标-20261027.png'],
  ['docs/handoffs/WINDOWS_CLIENT_2026-10-27.md','研发交接/Windows客户端首版-2026-10-27.md'],
  ['docs/releases/team-invitation-poster-v2-20261026.md','发布记录/team-invitation-poster-v2-20261026.md'],
  ['docs/design/team-invitation-v2-assets-20261026.md','设计规范/team-invitation-v2-assets-20261026.md'],
  ['docs/handoffs/TRANSFER_CENTER_TRAE_HANDOFF_2026-10-26.md','研发交接/赛事转会中心Trae研发交接.md'],
  ['产品设计/赛事转会中心Trae研发交接.docx','研发交接/赛事转会中心Trae研发交接.docx'],
  ['产品设计/赛事转会中心Trae交接包-R2.zip','研发交接/赛事转会中心Trae交接包-R2.zip'],
  ['产品设计/转会中心原型图/融合评估R2/融合评估.md','原型资料/赛事转会原型融合评估-R2.md'],
  ['产品设计/转会中心原型图/融合评估R2/本轮范围清单.json','原型资料/赛事转会本轮范围-R2.json'],
  ['docs/handoffs/DISCOVER_LEVEL1_TRAE_HANDOFF_2026-10-26.md','项目规范/handoffs/发现一级页TRAE开发交接.md'],
  ['docs/DISCOVER_DATA_MODEL_2026-10-26.md','项目规范/发现一级页数据模型与集合设计.md'],
  ['产品设计/发现一级页TRAE开发交接.docx','研发交接/发现一级页TRAE开发交接.docx'],
  ['docs/releases/team-invitation-posters-20261026.md','发布记录/team-invitation-posters-20261026.md'],
  ['docs/handoffs/TEAM_ROSTER_MATERIALS_FLOW_2026-10-26.md','研发交接/TEAM_ROSTER_MATERIALS_FLOW_2026-10-26.md'],
  ['docs/handoffs/IDENTITY_PHOTO_AUTH_INTEGRATION_2026-10-26.md','研发交接/IDENTITY_PHOTO_AUTH_INTEGRATION_2026-10-26.md'],
  ['docs/handoffs/TRANSFER_CENTER_PROTOTYPES_R1_2026-10-26.md','研发交接/转会中心高保真原型-R1.md'],
  ['docs/handoffs/TRANSFER_CENTER_BACKEND_DEPLOY_2026-10-26.md','研发交接/转会中心后端部署技术文档.md'],
  ['产品设计/转会中心高保真原型-R1.zip','原型资料/转会中心高保真原型-R1.zip'],
  ['产品设计/转会中心原型图/创意图标/转会图标候选总览.png','原型资料/转会市场图标候选总览.png'],
  ['docs/DISCOVERY_TRANSFER_IMAGE_HANDOFF_20261026.md','项目规范/发现赛事与转会市场图稿交接.md'],
  ...['赛事转会市场-筛选入口版.png','球员筛选与查询结果.png','球员详情-租借买断.png','接收端-转会收件箱.png','接收端-买断报价详情.png','接收端-提交还价.png','接收端-待主办方审核.png'].map(name => ['docs/prototypes/discovery-transfer-20261026/' + name,'项目规范/prototypes/discovery-transfer-20261026/' + name]),
  ...['发现赛事页.png','赛事转会市场-成交卡片版.png','球员详情-租借转会入口.png','发起转会-报价草稿.png'].map(name => ['docs/prototypes/discovery-transfer-20261026/' + name,'项目规范/prototypes/discovery-transfer-20261026/' + name]),
  ['docs/releases/division-edit-before-schedule-20261026.md','发布记录/division-edit-before-schedule-20261026.md'],
  ['docs/releases/formal-pc-release-20261026.md','发布记录/formal-pc-release-20261026.md'],
  ['docs/TRANSFER_CENTER_PLAN_2026-10-26.md','项目规范/转会中心方案.md'],
  ['产品设计/赛小蜂足球转会中心方案.docx','项目规范/赛小蜂足球转会中心方案.docx'],
  ['docs/releases/shared-tournament-exit-20261026.md','发布记录/shared-tournament-exit-20261026.md'],
  ['docs/releases/transfer-center-backend-20261026.md','发布记录/transfer-center-backend-20261026.md'],
  ['docs/releases/transfer-showcase-v3-20261027.md','发布记录/transfer-showcase-v3-20261027.md'],
  ['docs/releases/transfer-showcase-v4-20261028.md','发布记录/transfer-showcase-v4-20261028.md'],
  ['docs/releases/team-owner-transfer-20261028.md','发布记录/team-owner-transfer-20261028.md'],
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
  ['docs/releases/marketing-selftest-20261024.md','发布记录/marketing-selftest-20261024.md'],
  ['docs/releases/self-register-team-next-20261025.md','发布记录/self-register-team-next-20261025.md'],
  ['docs/releases/valuation-register-layout-20261026.md','发布记录/valuation-register-layout-20261026.md'],
  ['docs/handoffs/SELF_TEST_MARKETING_TRAE_2026-10-24.md','研发交接/SELF_TEST_MARKETING_TRAE_2026-10-24.md'],
  ['docs/releases/numbering-standard-20261023.md','发布记录/numbering-standard-20261023.md'],
  ['docs/releases/tournament-data-parity-20261024.md','发布记录/tournament-data-parity-20261024.md'],
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
