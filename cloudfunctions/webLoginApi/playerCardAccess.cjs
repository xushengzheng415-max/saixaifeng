const { document, readCards } = require('./playerCardReader.cjs')
function createPlayerCardAccess({ cloud, authenticateWebSession, buildOrganizerScope, organizerRecordAllowed }) {
  return async event => {
    try {
      const auth = await authenticateWebSession(event)
      if (!auth.success) return auth
      if(event.action==='getPlayerCardById') {
        const cardId=String(event.cardId||'').trim()
        if(!cardId||cardId.length>256)return {success:false,code:'PLAYER_CARD_ID_INVALID',error:'成卡编号无效'}
        const db=cloud.database(),legacy=cardId.match(/^base:([a-zA-Z0-9_-]{1,128}):(\d+)$/),libraryMatch=cardId.match(/^library:([a-f0-9]{64}):(\d+)$/)
        let render=null,playerId=''
        if(legacy)playerId=legacy[1]
        else if(libraryMatch){
          const grant=await document(db,'player_card_library',libraryMatch[1])
          if(grant&&Number(grant.revision||0)===Number(libraryMatch[2])&&grant.fileId){playerId=String(grant.playerId||'');render={_id:cardId,cardId,playerId,fileId:grant.fileId,status:'ready',templateId:String(grant.templateId||''),publishedVersion:Number(grant.templateVersion||0)}}
        } else {
          render=await document(db,'player_card_renders',cardId)
          if(!render||String(render.cardId||render._id)!==cardId){const found=await db.collection('player_card_renders').where({cardId}).limit(2).get();render=(found.data||[])[0]||null}
          playerId=String(render?.playerId||'')
        }
        if(!playerId)return {success:false,code:'PLAYER_CARD_NOT_FOUND',error:'成卡不存在或已失效'}
        const result=await db.collection('players').doc(playerId).get(),player=Array.isArray(result.data)?result.data[0]:result.data
        if(!player)return {success:false,code:'PLAYER_CARD_NOT_FOUND',error:'球员资料不存在'}
        const owner=auth.principalType==='platform_owner'&&auth.user?.isPlatformOwner===true
        const related=[player.linkedUserId,player.playerUserId,player.guardianUserId].some(key=>key&&String(key)===String(auth.userId))
        if(!owner&&!related){const scope=await buildOrganizerScope(db,auth.user);if(!organizerRecordAllowed('players',player,scope))return {success:false,code:'PLAYER_CARD_FORBIDDEN',error:'无权查看此成卡'}}
        if(legacy){if(Number(player.playerCardVersion||0)!==Number(legacy[2])||!player.playerCardFileId)return {success:false,code:'PLAYER_CARD_NOT_FOUND',error:'成卡已更新或不存在'};render={_id:cardId,playerId,fileId:player.playerCardFileId,status:'ready',cardDataVersion:Number(player.playerCardVersion||0),publishedVersion:Number(player.playerCardTemplateVersion||0),templateId:String(player.playerCardTemplateId||'')}}
        if(!render||render.status!=='ready'||!render.fileId)return {success:false,code:'PLAYER_CARD_NOT_READY',error:'成卡正在更新或暂不可用'}
        const files=await cloud.getTempFileURL({fileList:[render.fileId]}),url=(files.fileList||[]).find(file=>file.fileID===render.fileId)?.tempFileURL||''
        return {success:true,card:{cardId:String(render.cardId||render._id),playerId,cardUrl:url,status:url?'ready':'load_failed',templateId:String(render.templateId||''),publishedVersion:Number(render.publishedVersion||0),cardDataVersion:Number(render.cardDataVersion||0),renderVersion:String(render.renderVersion||'')}}
      }
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
  for(const row of rows){const card=byId.get(String(row.playerId));row.cardStatus=card?.status||'unavailable';row.cardUrl=card?.cardUrl||'';row.cardId=card?.cardId||'';row.templateId=card?.templateId||'';row.publishedVersion=card?.publishedVersion||0}
  return rows
}
module.exports = { createPlayerCardAccess, attachPublicPlayerCards }
