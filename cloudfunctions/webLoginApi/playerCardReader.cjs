const crypto = require('node:crypto')
const TYPES = ['bronze', 'silver', 'gold']
const RENDER_VERSION = 'resvg/2'
const dataOf = result => Array.isArray(result?.data) ? result.data[0] : result?.data
async function document(db, collection, id) {
  try { return dataOf(await db.collection(collection).doc(String(id)).get()) || null }
  catch (error) {
    if (/document.*(not exist|does not exist)|DOCUMENT_NOT_EXIST/i.test(String(error.message || error.errMsg || error.code || ''))) return null
    throw error
  }
}
async function readCards(cloud, db, players, options = {}) {
  const states = new Map()
  const rows = await Promise.all(players.map(async player => {
    const playerId = String(player._id || player.id || '')
    const cardTypeId = String(player.playerCardBackgroundId || player.playerCardTier || '')
    const base = { protocolVersion:'player-card/4', playerId, cardTypeId, status:'unavailable', cardId:'', cardUrl:'', fileId:'', templateId:'', publishedVersion:0, cardDataVersion:Number(player.playerCardVersion || 0), renderVersion:'' }
    async function selectedCard() {
      const templateId=String(player.playerCardDisplayTemplateId||'')
      if(options.baseOnly||!templateId)return null
      const grantId=crypto.createHash('sha256').update(JSON.stringify([playerId,templateId])).digest('hex')
      const [grant,template]=await Promise.all([document(db,'player_card_library',grantId),document(db,'player_card_templates',templateId)])
      const tier=String(template?.tier||'')
      if(!grant||grant.status==='revoked'||String(grant.playerId||'')!==playerId||String(grant.templateId||'')!==templateId||!TYPES.includes(tier))return null
      const stateId=`${tier}_preload_${crypto.createHash('sha256').update(templateId).digest('hex').slice(0,32)}`
      const state=await document(db,'player_card_template_states',stateId)
      const active=state?.active
      if(!active||String(active.templateId)!==templateId)return null
      const render=await document(db,'player_card_renders',`${playerId}_${templateId}_${active.version}`)
      if(!render||render.status!=='ready'||!render.fileId||render.renderVersion!==RENDER_VERSION||
        Number(render.cardDataVersion)!==base.cardDataVersion||Number(render.libraryRevision||0)!==Number(grant.revision||0))return null
      return {...base,status:'ready',cardTypeId:tier,cardId:String(render.cardId||render._id),
        fileId:String(render.fileId),templateId,publishedVersion:Number(active.version),
        renderVersion:render.renderVersion,selectedDisplay:true}
    }
    const selected=await selectedCard()
    if(selected)return selected
    // A visual card can be issued from an approved roster while competitive
    // points are still being checked. It never assigns a playerCardTier.
    async function visualCard() {
      const visual = await document(db, 'player_card_renders', `visual_${playerId}`)
      if (!visual?.visualOnly || visual.status !== 'ready' || !visual.fileId || Number(visual.cardDataVersion) !== base.cardDataVersion) return null
      return { ...base, status:'ready', cardTypeId:String(visual.cardTypeId || 'bronze'), cardId:String(visual.cardId || visual._id), fileId:String(visual.fileId), templateId:String(visual.templateId || ''), publishedVersion:Number(visual.publishedVersion || 0), renderVersion:String(visual.renderVersion || ''), gradeStatus:'unverified', visualOnly:true }
    }
    if (!TYPES.includes(cardTypeId)) return await visualCard() || base
    if (!states.has(cardTypeId)) states.set(cardTypeId, document(db,'player_card_template_states',cardTypeId))
    const state = await states.get(cardTypeId)
    if (!state?.active) return await visualCard() || base
    Object.assign(base,{templateId:state.active.templateId,publishedVersion:Number(state.active.version)})
    if (!player.playerCardFileId) return await visualCard() || base
    const render = await document(db,'player_card_renders',`${playerId}_${base.templateId}_${base.publishedVersion}`)
    if (!render || render.renderVersion!==RENDER_VERSION || Number(render.cardDataVersion) !== base.cardDataVersion) return await visualCard() || {...base,status:'pending'}
    if (render.status !== 'ready' || !render.fileId) return await visualCard() || {...base,status:render.status === 'failed' ? 'failed' : 'pending'}
    return {...base,status:'ready',cardId:String(render.cardId||render._id||`${playerId}_${base.templateId}_${base.publishedVersion}`),fileId:render.fileId,renderVersion:render.renderVersion || ''}
  }))
  const ids = [...new Set(rows.filter(row=>row.status==='ready').map(row=>row.fileId))]
  const urls = new Map()
  for (let start=0;start<ids.length;start+=50) {
    const result = await cloud.getTempFileURL({fileList:ids.slice(start,start+50)})
    for (const file of result.fileList || []) if (file.tempFileURL) urls.set(file.fileID,file.tempFileURL)
  }
  const latestStates = new Map()
  for(const type of new Set(rows.filter(row=>row.status==='ready'&&!row.visualOnly&&!row.selectedDisplay).map(row=>row.cardTypeId)))latestStates.set(type,await document(db,'player_card_template_states',type))
  return rows.map(row => {
    if(row.status!=='ready')return row
    if(row.visualOnly||row.selectedDisplay)return {...row,status:urls.has(row.fileId)?'ready':'failed',cardUrl:urls.get(row.fileId)||''}
    const active=latestStates.get(row.cardTypeId)?.active
    if(!active || active.templateId!==row.templateId || Number(active.version)!==row.publishedVersion)return {...row,status:'pending',fileId:'',cardUrl:'',templateId:active?.templateId||'',publishedVersion:Number(active?.version||0)}
    return {...row,status:urls.has(row.fileId)?'ready':'failed',cardUrl:urls.get(row.fileId)||''}
  })
}
module.exports = { document, readCards, TYPES, RENDER_VERSION }
