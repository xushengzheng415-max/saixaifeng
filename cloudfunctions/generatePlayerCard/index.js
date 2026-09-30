'use strict'

// This legacy endpoint accepted a client-selected tier and could create a
// misleading gold or silver card. Current cards are served by the authorized
// webLoginApi player-card flow and the shared data-center score.
exports.main = async () => ({
  success:false,
  code:'PLAYER_CARD_LEGACY_DISABLED',
  error:'旧制卡入口已停用，请从球员资料页查看积分卡'
})
