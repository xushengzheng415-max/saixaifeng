'use strict'
/**
 * 转会中心 action 路由（方案 V1.1）。
 *
 * 所有转会 action 统一用 `transfer` 前缀，避免与 dataCenter 既有的
 * `playerDetail`、`query`、`requestTransfer` 等动作冲突；页面只登记这里列出的名称。
 *
 * 赛事子账号（actor.staff）的边界：
 * - 只能办理主办审核类动作，并且必须显式持有 event.transfer 授权；
 * - 不能代替球队发起、还价、撤回、签约、续约或查看市场，避免赛事权限被放大成球队管理权；
 * - 球员本人应答续约按自然人关联校验，不受赛事子账号标记影响。
 * 平台负责人动作（到期任务、合同期限核定）由服务层自行校验 platformOwner。
 */
const service = require('./service.cjs')
const staffPolicy = require('../staffPolicy.cjs')
const { error } = require('../shared/service.cjs')
const { id } = require('./rules.cjs')

const ROUTES = Object.freeze({
  transferMarket: 'market',
  transferPlayerDetail: 'playerDetail',
  transferMyRequests: 'myRequests',
  transferRequestDetail: 'requestDetail',
  transferInitiate: 'initiate',
  transferSubmitOffer: 'submitOffer',
  transferAcceptOffer: 'acceptOffer',
  transferRejectOffer: 'rejectOffer',
  transferCounterOffer: 'counterOffer',
  transferWithdraw: 'withdraw',
  transferReview: 'review',
  transferSignFreeAgent: 'signFreeAgent',
  transferContracts: 'contracts',
  transferTeamRenewals: 'teamRenewals',
  transferPlayerRenewals: 'playerRenewals',
  transferCreateRenewal: 'createRenewal',
  transferRespondRenewal: 'respondRenewal',
  transferConfirmContractTerm: 'confirmContractTerm',
  transferWindowGet: 'windowGet',
  transferWindowSave: 'saveWindow',
  transferAdminRequests: 'adminRequests',
  transferAdminRecord: 'adminRecord',
  transferExpireDue: 'expireDue'
})

const ACTIONS = Object.freeze(Object.keys(ROUTES))

// 统一响应信封：各端不再自行拼装版本与服务器时间。
// 页面据此判断契约版本、以服务端时间为准展示冷却／窗口状态，避免用本机时钟推断。
const SCHEMA_VERSION = 1
function withEnvelope(result) {
  if (!result || typeof result !== 'object') return result
  return { schemaVersion: SCHEMA_VERSION, serverNow: new Date().toISOString(), ...result }
}

// 赛事子账号可办理的主办审核动作，需同时具备 event.transfer。
const STAFF_REVIEW_ACTIONS = Object.freeze([
  'transferReview', 'transferAdminRequests', 'transferAdminRecord', 'transferWindowGet', 'transferWindowSave'
])
// 球员本人动作：以自然人关联账号判定，不要求赛事权限。
const STAFF_SELF_ACTIONS = Object.freeze(['transferPlayerRenewals', 'transferRespondRenewal'])

async function assertStaffTransferRight(db, actor, event) {
  const requested = id(event.tournamentId || (event.scope && event.scope.tournamentId))
  const tournaments = Array.isArray(actor.tournamentIds) ? actor.tournamentIds.map(id).filter(Boolean) : []
  const tournamentId = requested || tournaments[0] || ''
  if (!tournamentId || !tournaments.includes(tournamentId)) throw error('DATA_FORBIDDEN', '只能办理获授权赛事的转会事务')
  if (!(await staffPolicy.hasRight(db, actor.userId, actor.orgId, tournamentId, 'event.transfer'))) {
    throw error('DATA_FORBIDDEN', '当前赛事没有转会权限')
  }
  return tournamentId
}

async function handle(db, actor, event = {}) {
  const action = id(event.action)
  const handler = ROUTES[action]
  if (!handler) throw error('DATA_ACTION_INVALID', '数据操作不存在')
  if (actor.staff) {
    if (!STAFF_REVIEW_ACTIONS.includes(action) && !STAFF_SELF_ACTIONS.includes(action)) {
      throw error('DATA_FORBIDDEN', '赛事子账号不能代为办理球队转会事务')
    }
    if (STAFF_REVIEW_ACTIONS.includes(action)) await assertStaffTransferRight(db, actor, event)
  }
  return withEnvelope(await service[handler](db, actor, event))
}

module.exports = { ACTIONS, ROUTES, STAFF_REVIEW_ACTIONS, STAFF_SELF_ACTIONS, SCHEMA_VERSION, handle }
