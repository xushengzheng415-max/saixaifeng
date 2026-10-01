const { document, readCards } = require('./playerCardReader.cjs')
function createPlayerCardAccess({ cloud, authenticateWebSession, buildOrganizerScope, organizerRecordAllowed }) {
  return async event => {
    try {
      const auth = await authenticateWebSession(event)
      if (!auth.success) return auth
      const ids=[...new Set((event.action==='getPlayerCardsForViewer'?(Array.isArray(event.playerIds)?event.playerIds:[]):[event.playerId]).map(id=>String(id||'').trim()))]
      if (!ids.length || ids.length>100 || ids.some(id=>!/^[a-zA-Z0-9_-]{1,128}$/.test(id)))return {success:false,error:'球员编号无效或数量过多',code:'PLAYER_CARD_ID_INVALID'}
      const db=cloud.database(),sources=new Map()
      for(let start=0;start<ids.length;start+=50){const page=await db.collection('players').where({_id:db.command.in(ids.slice(start,start+50))}).limit(50).get();for(const player of page.data||[])sources.set(String(player._id),player)}
      const owner=auth.principalType==='platform_owner'&&auth.user?.isPlatformOwner===true
      let scope=null
      const allowed=[],denied=new Map()
      for(const id of ids){
        const player=sources.get(id)
        if(!player){denied.set(id,{playerId:id,status:'unavailable',cardUrl:''});continue}
        const related=[player.linkedUserId,player.playerUserId,player.guardianUserId].some(key=>key&&String(key)===String(auth.userId))
        if(!owner&&!related){scope=scope||await buildOrganizerScope(db,auth.user);if(!organizerRecordAllowed('players',player,scope)){denied.set(id,{playerId:id,status:'forbidden',cardUrl:''});continue}}
        allowed.push(player)
      }
      const cards=await readCards(cloud,db,allowed),byId=new Map(cards.map(card=>[card.playerId,card]))
      const result=ids.map(id=>byId.get(id)||denied.get(id))
      return event.action==='getPlayerCardsForViewer'?{success:true,cards:result}:{success:true,...result[0]}

    } catch (error) { return {success:false,code:'PLAYER_CARD_READ_FAILED',error:'球员卡读取失败，请重试'} }
  }
}
async function attachPublicPlayerCards(cloud,db,rows) {
  const ids=[...new Set(rows.map(row=>String(row.playerId||'')).filter(Boolean))]
  const sources=new Map()
  for(let start=0;start<ids.length;start+=50){const result=await db.collection('players').where({_id:db.command.in(ids.slice(start,start+50))}).limit(100).get();for(const player of result.data||[])sources.set(String(player._id),player)}
  const allowed=rows.filter(row=>sources.get(String(row.playerId))?.playerCardPublic===true)
  const cards=await readCards(cloud,db,allowed.map(row=>sources.get(String(row.playerId))))
  const byId=new Map(cards.map(card=>[card.playerId,card]))
  for(const row of rows){const card=byId.get(String(row.playerId));row.cardStatus=card?.status||'unavailable';row.cardUrl=card?.cardUrl||'';row.templateId=card?.templateId||'';row.publishedVersion=card?.publishedVersion||0}
  return rows
}
module.exports = { createPlayerCardAccess, attachPublicPlayerCards }
