'use strict'
const {readByIds}=require('./data-center/reader.cjs')
const recording=require('./sharedRecording.cjs')
const text=value=>String(value==null?'':value).trim()
async function read(context,reader,exporter){
  const {db,cloud,identity,event,grant,match,rows,doc,authorized}=context
  if(!['home','away'].includes(event.side))throw new Error('请选择本场主队或客队')
  const rules=await recording.lineupRules(context)
  if(event.rulesOnly===true)return {success:true,rules,cards:[]}
  const own=await recording.pool(db,match,rows,doc,{side:event.side})
  const requested=event.playerIds==null?own.map(player=>player.id):event.playerIds
  if(!Array.isArray(requested)||requested.length>50||requested.some(id=>!own.some(player=>player.id===text(id))))throw new Error('球员不属于本场已授权名单')
  const ids=[...new Set(requested.map(text))]
  const imageFallback=event.operation==='lineupCardImage'
  const mobilePreview=event.mobilePreview===true
  if(imageFallback && (!ids.length || ids.length>6))throw new Error('每次最多加载六张完整卡')
  if(!(grant.permissions || []).includes('event.teams'))return {success:true,rules,cards:ids.map(playerId=>({playerId,status:'forbidden',cardUrl:'',portraitUrl:''}))}
  const profiles=await readByIds(db,'players','_id',ids)
  let cards,warning=''
  try{
    cards=await (reader || require('./playerCardReader.cjs').readCards)(cloud,db,profiles,{dynamic:true,restrictedAssets:!imageFallback && !mobilePreview})
    if(imageFallback){
      // Keep one player's asset failure from discarding the other visible cards.
      const rendered=[]
      for(let start=0;start<cards.length;start+=3)rendered.push(...await Promise.all(cards.slice(start,start+3).map(async card=>{
        if(!card.cardScene)return card
        try{
          const player=profiles.find(profile=>text(profile._id)===text(card.playerId))
          const image=await (exporter || require('./playerCardDynamic.cjs').exportCard)(cloud,db,player,card,{size:1})
          if(!image.cardUrl)throw new Error('完整卡未生成，请重试')
          return {...card,...image,cardScene:null,portraitUrl:''}
        }catch(error){return {playerId:card.playerId,status:'failed',cardScene:null,cardUrl:'',portraitUrl:''}}
      })))
      cards=rendered
    }
  }
  catch(error){cards=ids.map(playerId=>({playerId,status:'failed',cardUrl:'',portraitUrl:''}));warning='球员卡暂未加载，可按号码选择'}
  // Recheck revocation after rendering/signing, and return only display metadata.
  await authorized(db,identity,event,'event.matches');await authorized(db,identity,event,'event.teams')
  const byId=new Map(cards.map(card=>[text(card.playerId),card]))
  return {success:true,rules,warning,cards:ids.map(playerId=>{
    const card=byId.get(playerId)
    if(!card)return {playerId,status:'unavailable',cardUrl:'',portraitUrl:''}
    const needsImage=!imageFallback && mobilePreview && !!card.cardScene
    return {playerId,status:card.status,needsImage,cardScene:needsImage?null:card.cardScene || null,cardUrl:card.cardUrl || '',portraitUrl:needsImage?'':card.portraitUrl || '',templateId:card.templateId || '',publishedVersion:card.publishedVersion ?? null,cardDataVersion:card.cardDataVersion ?? null,dataVersion:card.dataVersion || ''}
  })}
}
module.exports={read}
