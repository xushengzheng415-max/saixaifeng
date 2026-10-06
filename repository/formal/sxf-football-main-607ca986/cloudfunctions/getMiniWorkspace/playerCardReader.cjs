const TYPES = ['bronze', 'silver', 'gold']
const RENDER_VERSION = 'resvg/2'
const PREFIX = 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/'
const BUCKET = '636c-cloud1-7g8ckb3c7815a011-1419431905'
function permanentFile(value) {
  const text=String(value||'').trim()
  if(text.startsWith(PREFIX))return text
  try {
    const url=new URL(text)
    if(url.protocol!=='https:'||![`${BUCKET}.tcb.qcloud.la`,`${BUCKET}.cos.ap-shanghai.myqcloud.com`].includes(url.hostname))return ''
    const key=decodeURIComponent(url.pathname.replace(/^\//,''))
    if(!key||key.includes('..')||key.includes('\\'))return ''
    return PREFIX+key
  }catch{return ''}
}
const dataOf = result => Array.isArray(result?.data) ? result.data[0] : result?.data
async function document(db, collection, id) {
  try { return dataOf(await db.collection(collection).doc(String(id)).get()) || null }
  catch (error) {
    if (/document.*(not exist|does not exist)|DOCUMENT_NOT_EXIST/i.test(String(error.message || error.errMsg || error.code || ''))) return null
    throw error
  }
}
async function readCards(cloud, db, players) {
  const states = new Map()
  const rows = await Promise.all(players.map(async player => {
    const playerId = String(player._id || player.id || '')
    const cardTypeId = String(player.playerCardBackgroundId || player.playerCardTier || '')
    let portraitFileId=''
    if(player.recentPortraitId){
      const portrait=await document(db,'parent_portraits',String(player.recentPortraitId))
      if(portrait?.status==='confirmed')portraitFileId=permanentFile(portrait.transparentFileId)
    }
    for(const field of ['playerCardSourceFileId','photoFileID','photoFileId','processedPhotoFileId','photoUrl','avatarUrl'])if(!portraitFileId)portraitFileId=permanentFile(player[field])
    const base = { protocolVersion:'player-card/4', playerId, playerName:String(player.name||''), cardTypeId, status:'unavailable', cardUrl:'', fileId:'', templateId:'', publishedVersion:0, cardDataVersion:Number(player.playerCardVersion || 0), renderVersion:'',portraitFileId,portraitUrl:'',portraitStatus:portraitFileId?'pending':'missing' }
    if (!TYPES.includes(cardTypeId)) return base
    if (!states.has(cardTypeId)) states.set(cardTypeId, document(db,'player_card_template_states',cardTypeId))
    const state = await states.get(cardTypeId)
    if (!state?.active) return base
    Object.assign(base,{templateId:state.active.templateId,publishedVersion:Number(state.active.version)})
    if (!player.playerCardFileId) return base
    const render = await document(db,'player_card_renders',`${playerId}_${base.templateId}_${base.publishedVersion}`)
    if (!render || render.renderVersion!==RENDER_VERSION || Number(render.cardDataVersion) !== base.cardDataVersion) return {...base,status:'pending'}
    if (render.status !== 'ready' || !render.fileId) return {...base,status:render.status === 'failed' ? 'failed' : 'pending'}
    return {...base,status:'ready',fileId:render.fileId,renderVersion:render.renderVersion || ''}
  }))
  const ids = [...new Set([...rows.filter(row=>row.status==='ready').map(row=>row.fileId),...rows.map(row=>row.portraitFileId).filter(Boolean)])]
  const urls = new Map()
  for (let start=0;start<ids.length;start+=50) {
    const result = await cloud.getTempFileURL({fileList:ids.slice(start,start+50)})
    for (const file of result.fileList || []) if (file.tempFileURL) urls.set(file.fileID,file.tempFileURL)
  }
  const latestStates = new Map()
  for(const type of new Set(rows.filter(row=>row.status==='ready').map(row=>row.cardTypeId)))latestStates.set(type,await document(db,'player_card_template_states',type))
  return rows.map(row => {
    row={...row,portraitUrl:urls.get(row.portraitFileId)||'',portraitStatus:row.portraitFileId?(urls.has(row.portraitFileId)?'ready':'failed'):'missing'}
    if(row.status!=='ready')return row
    const active=latestStates.get(row.cardTypeId)?.active
    if(!active || active.templateId!==row.templateId || Number(active.version)!==row.publishedVersion)return {...row,status:'pending',fileId:'',cardUrl:'',templateId:active?.templateId||'',publishedVersion:Number(active?.version||0)}
    return {...row,status:urls.has(row.fileId)?'ready':'failed',cardUrl:urls.get(row.fileId)||''}
  })
}
module.exports = { document, readCards, TYPES, RENDER_VERSION, permanentFile }
