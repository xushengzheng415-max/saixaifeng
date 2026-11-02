'use strict'
const cloud = require('wx-server-sdk')
const { authenticate } = require('./identity.cjs')
const { createDataService, error } = require('./shared/service.cjs')
const { requestTransfer, acceptTransfer, listTransfers } = require('./transfers.cjs')
const transferCenter = require('./transfer/index.cjs')
const { COLLECTIONS: TRANSFER_COLLECTIONS } = require('./transfer/rules.cjs')
cloud.init({ env:cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  try {
    // 转会公开展示端（发现页「转会」分栏）：游客也能看的只读投影。
    // 成交金额按成人／青少年分级：成人只回格式化 priceText，青少年不公开，接口不下发 amountFen；
    // 不返回报价单、合同、审核记录与任何联系方式。
    if (event.action === 'transferShowcase') return await require('./transfer/showcase.cjs').handle(db, event)
    const actor = await authenticate(cloud,db,event)
    if (['numberingRules','assignBusinessNumber'].includes(event.action)) {
      const numbering = require('./shared/numbering.cjs')
      numbering.owner(actor)
      return event.action === 'numberingRules' ? numbering.rules() : await numbering.assign(db, actor, event)
    }
    const service = createDataService(db)
    if (['hubCatalog','hubPlayerProfile','hubTeamProfile'].includes(event.action)) {
      const hub = require('./shared/hub.cjs').createHubService(db,service)
      if (event.action === 'hubCatalog') return await hub.catalog(actor,event)
      if (event.action === 'hubPlayerProfile') return await hub.playerProfile(actor,event)
      return await hub.teamProfile(actor,event)
    }
    if (event.action === 'inspectDuration') return await require('./durationVerification.cjs').inspectDuration(db,actor,event)
    if (event.action === 'verifyDuration') return await require('./durationVerification.cjs').verifyDuration(db,actor,event)
    // 转会中心：独立领域路由。球队侧只认本人管理的球队，主办侧只认赛事范围，
    // 赛事子账号必须显式持有 event.transfer 才能办理审核；不再走下面的 staff 数据读取门禁。
    if (transferCenter.ACTIONS.includes(event.action)) return await transferCenter.handle(db, actor, event)
    if (actor.staff) {
      const tournamentId = String(actor.tournamentIds[0] || '')
      const requested = String(event.scope && event.scope.tournamentId || event.tournamentId || '')
      // 生涯口径：授权赛事范围由查询层统一收窄，不再限定单一赛事。
      const careerView = event.action === 'playerDetail' && event.career === true
      if (event.action !== 'catalog' && !careerView && requested !== tournamentId) throw error('DATA_FORBIDDEN','只能查看获授权赛事的数据')
      if (!['catalog','query','quality','tournamentStatistics','playerDetail'].includes(event.action)) throw error('DATA_FORBIDDEN','当前操作未授权')
    }
    if (event.action === 'initializeCollections') {
      if (!actor.platformOwner) throw error('DATA_FORBIDDEN','仅平台负责人可初始化数据中心')
      const items = []
      // 转会中心集合与既有球员关系集合一并登记，便于平台负责人在首次部署后一次性建集合。
      const names = ['player_team_memberships','player_transfers','player_valuations', ...Object.values(TRANSFER_COLLECTIONS)]
      for (const name of [...new Set(names)]) {
        try { await db.createCollection(name); items.push({ name, status:'created' }) }
        catch (failure) {
          if (/already exist|已存在|DATABASE_COLLECTION_EXIST/i.test(String(failure.errMsg || failure.message || ''))) items.push({ name, status:'exists' })
          else throw failure
        }
      }
      return { success:true, items }
    }
    if (event.action === 'catalog') {
      const result = await service.catalog(actor)
      return actor.staff ? { ...result, players:[] } : result
    }
    if (event.action === 'playerDetail') {
      const playerId = String(event.playerId || '')
      if (!playerId) throw error('DATA_SCOPE_INVALID','缺少球员信息')
      const statistics = await service.query(actor,{...(event.scope || {}),playerId,mode:'official'},{careerView:event.career === true})
      const card = actor.staff || statistics.playerCard?.scope === 'career' ? statistics.playerCard : await service.playerCardForAuthorizedPlayer(playerId)
      const {metrics,...playerCard} = card || {}
      return {success:true,statistics,playerCard,valuation:statistics.valuation || null}
    }
    if (event.action === 'playerCard') {
      const playerId = String(event.playerId || '')
      await service.query(actor, { playerId, mode:'official' })
      const { metrics, ...playerCard } = await service.playerCardForAuthorizedPlayer(playerId)
      return { success:true, playerCard }
    }
    if (['query','quality','playerCareer','teamHistory','tournamentStatistics','platformStatistics'].includes(event.action)) {
      if (event.action === 'platformStatistics' && !actor.platformOwner) throw error('DATA_FORBIDDEN','仅平台负责人可查看全平台统计')
      return await service.query(actor,event.scope || event)
    }
    if (event.action === 'requestTransfer') return await requestTransfer(db,actor,event)
    if (event.action === 'acceptTransfer') return await acceptTransfer(db,actor,event)
    if (event.action === 'listTransfers') return await listTransfers(db,actor)
    if (['listPenalties','createPenalty','reviewPenalty','revokePenalty','blacklist'].includes(event.action)) {
      const penalties = require('./penalties.cjs')
      // 主办方账号只能看到本机构赛事，平台负责人可跨赛事审核与查看黑名单。
      if (event.action === 'listPenalties') return await penalties.listPenalties(db,actor,event)
      if (event.action === 'createPenalty') return await penalties.createPenalty(db,actor,event)
      if (event.action === 'reviewPenalty') return await penalties.reviewPenalty(db,actor,event)
      if (event.action === 'revokePenalty') return await penalties.revokePenalty(db,actor,event)
      return await penalties.blacklist(db,actor)
    }
    throw error('DATA_ACTION_INVALID','数据操作不存在')
  } catch (error) {
    console.error('[dataCenter]', error.code || 'DATA_ERROR', error.collection || '')
    return { success:false, code:error.code || 'DATA_ERROR', error:error.message || '数据加载失败，请重试' }
  }
}
