'use strict'
const cloud = require('wx-server-sdk')
const { authenticate } = require('./identity.cjs')
const { createDataService, error } = require('./shared/service.cjs')
const { requestTransfer, acceptTransfer, listTransfers } = require('./transfers.cjs')
cloud.init({ env:cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  try {
    const actor = await authenticate(cloud,db,event)
    const service = createDataService(db)
    if (actor.staff) {
      const tournamentId = String(actor.tournamentIds[0] || '')
      const requested = String(event.scope && event.scope.tournamentId || event.tournamentId || '')
      if (event.action !== 'catalog' && requested !== tournamentId) throw error('DATA_FORBIDDEN','只能查看获授权赛事的数据')
      if (!['catalog','query','quality','tournamentStatistics'].includes(event.action)) throw error('DATA_FORBIDDEN','当前操作未授权')
    }
    if (event.action === 'initializeCollections') {
      if (!actor.platformOwner) throw error('DATA_FORBIDDEN','仅平台负责人可初始化数据中心')
      const items = []
      for (const name of ['player_team_memberships','player_transfers']) {
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
    throw error('DATA_ACTION_INVALID','数据操作不存在')
  } catch (error) {
    console.error('[dataCenter]', error.code || 'DATA_ERROR', error.collection || '')
    return { success:false, code:error.code || 'DATA_ERROR', error:error.message || '数据加载失败，请重试' }
  }
}
