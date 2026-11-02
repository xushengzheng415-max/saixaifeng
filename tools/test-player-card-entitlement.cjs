const assert = require('node:assert/strict')
const { cardChangePermission, photoReplaceHoneyCost } = require('../cloudfunctions/webLoginApi/playerCards.cjs')

const player = { playerCardFileId:'saved-card', playerCardSourceFileId:'old-photo', playerCardTier:'gold' }
const portrait = { transparentFileId:'new-photo' }
const event = { mode:'portrait', tier:'gold', backgroundId:'silver' }
const level = (points, canReplacePhoto, canChangeBackground) => ({
  cardTier:'gold',
  playerCard:{
    points,
    canReplacePhoto,
    canChangeBackground: canChangeBackground === undefined ? canReplacePhoto : canChangeBackground
  }
})

const paidPhoto = cardChangePermission(level(99,false),player,portrait,{ ...event, backgroundId:'gold' })
assert.equal(paidPhoto.photoReplaceRequired, true)
assert.equal(paidPhoto.photoReplaceCost, photoReplaceHoneyCost())
assert.equal(paidPhoto.backgroundId, 'gold')
assert.equal(paidPhoto.code, undefined)
assert.equal(cardChangePermission(level(99,false),player,{transparentFileId:'old-photo'},event).code,'PLAYER_CARD_BACKGROUND_LOCKED')
// 会员叠加后服务端会把 canChangeBackground 置 true；未满 100 分仍不可免费换照片
assert.equal(cardChangePermission(level(99,false,true),player,{transparentFileId:'old-photo'},event).backgroundId,'silver')
const memberNewPhoto = cardChangePermission(level(99,false,true),player,portrait,{ ...event, backgroundId:'gold' })
assert.equal(memberNewPhoto.photoReplaceRequired, true)
assert.equal(memberNewPhoto.backgroundId, 'gold')
assert.equal(cardChangePermission(level(100,true),player,portrait,event).backgroundId,'silver')
assert.equal(cardChangePermission(level(100,true),player,portrait,{...event,tier:'silver'}).code,'PLAYER_CARD_TIER_CHANGED')
assert.equal(cardChangePermission(level(100,true),player,portrait,{...event,backgroundId:'custom'}).code,'PLAYER_CARD_BACKGROUND_INVALID')
assert.equal(cardChangePermission(level(100,true),player,portrait,{...event,sourceData:'forged'}).code,'PLAYER_CARD_SOURCE_LOCKED')
assert.equal(cardChangePermission({ cardTier:null, playerCard:{} },player,portrait,event).code,'PLAYER_CARD_TIER_UNVERIFIED')
assert.equal(cardChangePermission(level(0,false),{},portrait,{mode:'portrait',tier:'gold'}).backgroundId,'gold')
console.log('PASS: 99/100 分、会员换背景、付费换照片、背景与客户端伪造门禁')
