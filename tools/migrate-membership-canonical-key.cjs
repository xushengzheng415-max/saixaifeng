'use strict'
/*
 * 阶段 1：会员主键回填 / 回滚脚本（默认 dry-run，不写库）。
 *
 * 目标：
 *   历史 member_subscriptions(_id = 服务号 officialOpenId) → 复制一份
 *   member_subscriptions(_id = 'u:' + users._id)，并带 migration 标记。
 *   历史文档保持原样，旧端继续可读；新端优先读主键文档。
 *
 * 用法（由 Codex 在本机执行，本轮不执行生产迁移）：
 *   node tools/migrate-membership-canonical-key.cjs             # dry-run，只输出计划
 *   node tools/migrate-membership-canonical-key.cjs --apply     # 复制回填
 *   node tools/migrate-membership-canonical-key.cjs --rollback  # 只删带 migration 标记的主键文档
 *
 * 需要 TCB_ENV_ID（或 TENCENTCLOUD_ENV_ID）与 @cloudbase/node-sdk 的运行凭据。
 * 回填只复制、不修改历史文档；回滚只删除 migration === MARK 且带 migratedFrom 的 canonical 文档，
 * 因此不会误删线上按新主键正常写入的会员订阅。
 */
const path = require('path')

const account = require(path.resolve(__dirname, '..', 'cloudfunctions', 'webLoginApi', 'membershipAccount.cjs'))
const COLLECTION = account.SUB_COLLECTION
const MARK = 'stage1-canonical-key'
const PAGE_SIZE = 100
const MAX_ROWS = 50000

function text(value) { return String(value == null ? '' : value).trim() }

async function readAllSubscriptions(db) {
  const rows = []
  let after = ''
  for (;;) {
    const where = after ? { _id: db.command.gt(after) } : {}
    const page = (await db.collection(COLLECTION).where(where).orderBy('_id', 'asc').limit(PAGE_SIZE).get()).data || []
    if (!page.length) break
    rows.push(...page)
    after = String(page[page.length - 1]._id || '')
    if (rows.length > MAX_ROWS) throw new Error('会员订阅超过 ' + MAX_ROWS + ' 条，请分批处理')
    if (!after) break
  }
  return rows
}

// 只读计划：逐条判断是「可复制」「已有主键」「无法解析用户」。
async function plan(db) {
  const rows = await readAllSubscriptions(db)
  const items = []
  for (const row of rows) {
    const legacyId = text(row && row._id)
    if (!legacyId || legacyId.startsWith(account.CANONICAL_PREFIX)) continue
    const openId = text(row.openId) || text(row.officialOpenId) || legacyId
    const identity = await account.resolveIdentity(db, { userId: text(row.userId), openId })
    if (!identity.userId) {
      items.push({ legacyId, openId, action: 'skip-no-user', reason: '缺少 users._id 归属，需人工核对绑定关系' })
      continue
    }
    const canonicalId = account.canonicalSubscriptionId(identity.userId)
    const existing = await account.__internals.docValue(db, COLLECTION, canonicalId)
    items.push({
      legacyId, openId, userId: identity.userId, canonicalId,
      action: existing ? 'skip-existing' : 'copy'
    })
  }
  return items
}

async function apply(db) {
  const items = await plan(db)
  const applied = []
  for (const item of items) {
    if (item.action !== 'copy') continue
    const legacy = await account.__internals.docValue(db, COLLECTION, item.legacyId)
    if (!legacy) continue
    const data = Object.assign({}, legacy, {
      userId: item.userId,
      openId: item.openId,
      officialOpenId: item.openId,
      migration: MARK,
      migratedFrom: item.legacyId,
      migratedAt: new Date()
    })
    delete data._id
    await db.collection(COLLECTION).doc(item.canonicalId).set({ data })
    applied.push({ legacyId: item.legacyId, canonicalId: item.canonicalId })
  }
  return { items, applied }
}

async function rollback(db) {
  const rows = await readAllSubscriptions(db)
  const removed = []
  for (const row of rows) {
    const id = text(row && row._id)
    if (!id.startsWith(account.CANONICAL_PREFIX)) continue
    if (text(row.migration) !== MARK || !text(row.migratedFrom)) continue
    await db.collection(COLLECTION).doc(id).remove()
    removed.push({ canonicalId: id, migratedFrom: text(row.migratedFrom) })
  }
  return { removed }
}

function summarize(items) {
  const counts = {}
  for (const item of items) counts[item.action] = (counts[item.action] || 0) + 1
  return counts
}

async function main() {
  const argv = process.argv.slice(2)
  const applyFlag = argv.includes('--apply')
  const rollbackFlag = argv.includes('--rollback')
  if (applyFlag && rollbackFlag) {
    console.error('--apply 与 --rollback 不能同时使用')
    process.exit(1)
  }
  let sdk
  try { sdk = require('@cloudbase/node-sdk') } catch (error) {
    console.error('缺少 @cloudbase/node-sdk，请先在本机安装依赖并配置云开发凭据')
    process.exit(1)
  }
  const envId = process.env.TCB_ENV_ID || process.env.TENCENTCLOUD_ENV_ID
  if (!envId) {
    console.error('缺少 TCB_ENV_ID（或 TENCENTCLOUD_ENV_ID）')
    process.exit(1)
  }
  const cloud = sdk.init({ env: envId })
  const db = cloud.database()

  if (rollbackFlag) {
    const result = await rollback(db)
    console.log(JSON.stringify({ mode: 'rollback', removed: result.removed, count: result.removed.length }, null, 2))
    return
  }
  if (applyFlag) {
    const result = await apply(db)
    console.log(JSON.stringify({ mode: 'apply', summary: summarize(result.items), applied: result.applied, count: result.applied.length }, null, 2))
    return
  }
  const items = await plan(db)
  console.log(JSON.stringify({ mode: 'dry-run', summary: summarize(items), items }, null, 2))
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && error.stack || error)
    process.exit(1)
  })
}

module.exports = { MARK, COLLECTION, readAllSubscriptions, plan, apply, rollback }
