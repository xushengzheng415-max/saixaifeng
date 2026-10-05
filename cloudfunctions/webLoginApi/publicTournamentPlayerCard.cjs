'use strict'
const {readCards}=require('./playerCardReader.cjs')

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
    const [card]=await readCardsForPlayer(cloud,db,[player])
    return {success:true,card:{playerId,status:card?.status||'unavailable',cardUrl:card?.status==='ready'?card.cardUrl||'':'',
      cardId:card?.status==='ready'?card.cardId||'':'',templateId:card?.templateId||'',
      publishedVersion:Number(card?.publishedVersion||0),visualOnly:Boolean(card?.visualOnly),
      gradeStatus:card?.visualOnly?'unverified':''}}
  }
}
module.exports={createPublicTournamentPlayerCard}
