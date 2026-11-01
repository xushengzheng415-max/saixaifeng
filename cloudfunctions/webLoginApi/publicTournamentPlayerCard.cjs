'use strict'
const {readCards}=require('./playerCardReader.cjs')
const crypto=require('node:crypto')
async function hasEventDisplayGrant(db,player,tournamentId){
  const templateId=String(player.playerCardDisplayTemplateId||'')
  if(!templateId)return false
  const {document}=require('./playerCardReader.cjs')
  const template=await document(db,'player_card_templates',templateId)
  if(template?.status!=='published'||template.cardKind!=='progression'||template.published?.preload?.type!=='tournament'||String(template.published.preload.targetId)!==tournamentId||!template.setId)return false
  const grantId=crypto.createHash('sha256').update(JSON.stringify([String(player._id),templateId])).digest('hex')
  const [grant,set]=await Promise.all([document(db,'player_card_library',grantId),document(db,'player_card_sets',template.setId)])
  return Boolean(grant&&grant.status!=='revoked'&&String(grant.playerId)===String(player._id)&&String(grant.templateId)===templateId&&grant.grantSource==='platform_confirmed_award'&&grant.preload?.type==='tournament'&&String(grant.preload.targetId)===tournamentId&&set?.status==='published'&&set.kind==='progression'&&set.published?.preload?.type==='tournament'&&String(set.published.preload.targetId)===tournamentId&&Object.values(set.published.members||{}).some(member=>member.templateId===templateId))
}

function createPublicTournamentPlayerCard({cloud,handleFanRankings,readCardsForPlayer=readCards}) {
  return async event=>{
    const tournamentId=String(event.tournamentId||'').trim()
    const playerId=String(event.playerId||'').trim()
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(tournamentId)||!/^[a-zA-Z0-9_-]{1,128}$/.test(playerId))
      return {success:false,code:'PUBLIC_CARD_SCOPE_INVALID',error:'赛事或球员编号无效'}
    const rankings=await handleFanRankings({tournamentId,period:'week'})
    if(!rankings?.success)return {success:false,code:rankings?.code||'PUBLIC_CARD_SCOPE_UNAVAILABLE',error:rankings?.error||'公开赛事暂不可用'}
    const listed=(rankings.data?.players||[]).some(row=>String(row.playerId||'')===playerId)
    if(!listed)return {success:false,code:'PUBLIC_CARD_NOT_LISTED',error:'该球员不在公开赛事名单中'}
    const db=cloud.database()
    const response=await db.collection('players').doc(playerId).get()
    const player=Array.isArray(response.data)?response.data[0]:response.data
    if(!player||player.synthetic===true||player.isTest===true||player.syntheticDatasetId||player.syntheticKey||String(player.source||'').toLowerCase()==='synthetic')
      return {success:false,code:'PUBLIC_CARD_NOT_FOUND',error:'公开球员卡不存在'}
    // Only this public event's explicitly awarded progression display is visible.
    // Personal/honor cards and cards from other events retain the base-only rule.
    const eventDisplay=await hasEventDisplayGrant(db,player,tournamentId)
    const [card]=await readCardsForPlayer(cloud,db,[player],{legacyOnly:player.playerCardPublic!==true&&!eventDisplay&&!player.playerCardFileId&&!player.playerCardDynamic,restrictedAssets:true,baseOnly:player.playerCardPublic!==true&&!eventDisplay,dynamic:event.dynamicCardProtocol==='player-card-dynamic/1'})
    return {success:true,card:{playerId,status:card?.status||'unavailable',cardScene:card?.cardScene||null,cardUrl:card?.status==='ready'?card.cardUrl||'':'',
      cardId:card?.status==='ready'?card.cardId||'':'',templateId:card?.templateId||'',
      publishedVersion:Number(card?.publishedVersion||0),visualOnly:Boolean(card?.visualOnly),
      gradeStatus:card?.visualOnly?'unverified':''}}
  }
}
module.exports={createPublicTournamentPlayerCard}
