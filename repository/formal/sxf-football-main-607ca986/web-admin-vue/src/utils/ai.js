import { callFunction } from './cloud'

/**
 * 生成赛事战报
 * @param {Object} matchData 比赛数据
 * @returns {Promise<Object>}
 */
export async function generateMatchReport(matchData) {
  return callFunction('generateContent', {
    type: 'matchReport',
    data: matchData
  })
}

/**
 * 生成球员分析
 * @param {Object} playerData 球员数据
 * @returns {Promise<Object>}
 */
export async function generatePlayerAnalysis(playerData) {
  return callFunction('generateContent', {
    type: 'playerAnalysis',
    data: playerData
  })
}

/**
 * 生成赛事介绍
 * @param {Object} tournamentData 赛事数据
 * @returns {Promise<Object>}
 */
export async function generateTournamentIntro(tournamentData) {
  return callFunction('generateContent', {
    type: 'tournamentIntro',
    data: tournamentData
  })
}

/**
 * 自定义 AI 生成
 * @param {string} prompt 提示词
 * @param {string} contentType 内容类型
 * @returns {Promise<Object>}
 */
export async function generateCustomContent(prompt, contentType = 'general') {
  return callFunction('generateContent', {
    type: 'custom',
    data: {
      prompt,
      contentType
    }
  })
}
