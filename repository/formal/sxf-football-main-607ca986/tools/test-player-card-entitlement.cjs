const assert = require('node:assert/strict')
const { cardChangePermission } = require('../cloudfunctions/webLoginApi/playerCards.cjs')

const player = { playerCardFileId:'saved-card', playerCardSourceFileId:'old-photo', playerCardTier:'gold' }
const portrait = { transparentFileId:'new-photo' }
const event = { mode:'portrait', tier:'gold', backgroundId:'silver' }
const level = (points, can) => ({ cardTier:'gold', playerCard:{ points, canReplacePhoto:can, canChangeBackground:can } })

assert.equal(cardChangePermission(level(99,false),player,portrait,event).code,'PLAYER_CARD_PHOTO_LOCKED')
assert.equal(cardChangePermission(level(99,false),player,{transparentFileId:'old-photo'},event).code,'PLAYER_CARD_BACKGROUND_LOCKED')
assert.equal(cardChangePermission(level(100,true),player,portrait,event).backgroundId,'silver')
assert.equal(cardChangePermission(level(100,true),player,portrait,{...event,tier:'silver'}).code,'PLAYER_CARD_TIER_CHANGED')
assert.equal(cardChangePermission(level(100,true),player,portrait,{...event,backgroundId:'custom'}).code,'PLAYER_CARD_BACKGROUND_INVALID')
assert.equal(cardChangePermission(level(100,true),player,portrait,{...event,sourceData:'forged'}).code,'PLAYER_CARD_SOURCE_LOCKED')
assert.equal(cardChangePermission({ cardTier:null, playerCard:{} },player,portrait,event).code,'PLAYER_CARD_TIER_UNVERIFIED')
assert.equal(cardChangePermission(level(0,false),{},portrait,{mode:'portrait',tier:'gold'}).backgroundId,'gold')
console.log('PASS: 99/100 分、旧金卡、照片、背景与客户端伪造门禁')
