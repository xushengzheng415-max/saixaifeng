// 旧版首发阵容入口适配器。
// 正式写入必须统一经过 serviceMatchWorkflow 的球队认领、赛事请求、
// 已确认名单和首发人数校验，不能再由兼容函数直接更新 matches。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function fail(message, code) {
  return {
    code: -1,
    success: false,
    message: message || '首发阵容提交失败',
    error: code || 'LINEUP_SUBMIT_FAILED'
  }
}

function getPlayerId(player) {
  if (!player || typeof player !== 'object') return ''
  return String(player.playerId || player._id || player.id || '')
}

function collectStarterIds(lineupData) {
  const positions = Array.isArray(lineupData && lineupData.positions)
    ? lineupData.positions
    : []
  return positions.map(getPlayerId).filter(Boolean)
}

exports.main = async function(event) {
  event = event || {}
  const matchId = String(event.matchId || '')
  const lineupField = String(event.lineupField || '')
  const lineupData = event.lineupData

  if (!matchId || !lineupData || typeof lineupData !== 'object') {
    return fail('缺少比赛和阵容参数', 'INVALID_LINEUP_PARAMS')
  }

  if (lineupField !== 'homeLineup' && lineupField !== 'awayLineup') {
    return fail('不支持的阵容字段', 'INVALID_LINEUP_FIELD')
  }

  const selectedPlayerIds = collectStarterIds(lineupData)
  if (selectedPlayerIds.length === 0) {
    return fail('请先选择首发球员', 'STARTERS_REQUIRED')
  }

  try {
    const result = await cloud.callFunction({
      name: 'serviceMatchWorkflow',
      data: {
        action: 'submitLineupLegacy',
        matchId,
        lineupField,
        selectedPlayerIds
      }
    })
    const response = result && result.result
    if (!response || response.success === false) {
      return fail(
        (response && response.message) || '首发阵容提交失败',
        (response && response.code) || 'LINEUP_SUBMIT_FAILED'
      )
    }

    return {
      code: 0,
      success: true,
      message: response.message || '首发阵容提交成功',
      data: response.data || {}
    }
  } catch (error) {
    console.error('[updateMatchLineup] adapter failed:', error)
    return fail(error.message, error.code)
  }
}
