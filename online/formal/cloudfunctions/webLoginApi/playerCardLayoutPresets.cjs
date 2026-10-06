const crypto=require('node:crypto')
const {document}=require('./playerCardSuite.cjs')
const COLLECTION='player_card_layout_presets'
function createPlayerCardLayoutPresets({cloud,normalizeLayout,normalizePhoto,normalizeBadges}) {
  const db=cloud.database()
  function idOf(value) { const id=String(value || '');if(!/^[a-f0-9]{32}$/.test(id)) throw new Error('排版编号无效，请重新选择');return id }
  async function list(event) {
    const cursor=event.cursor ? idOf(event.cursor) : '',keyword=String(event.keyword || '').trim().slice(0,30)
    let where=cursor ? {_id:db.command.gt(cursor)} : {}
    if(keyword) {
      const match={title:db.RegExp({regexp:keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),options:'i'})}
      where=cursor ? db.command.and([where,match]) : match
    }
    const page=(await db.collection(COLLECTION).where(where).orderBy('_id','asc').limit(25).get()).data || []
    return {success:true,presets:page.map(row=>({id:row._id,title:row.title})),nextCursor:page.length===25?String(page[page.length-1]._id):''}
  }
  async function get(event) {
    const row=await document(db,COLLECTION,idOf(event.presetId))
    if(!row) throw new Error('排版不存在，请刷新方案')
    return {success:true,preset:{id:row._id,title:row.title,layout:normalizeLayout(row.layout),photo:normalizePhoto(row.photo),badges:normalizeBadges(row.badges)}}
  }
  async function save(event,auth) {
    const title=String(event.title || '').trim()
    if(title.length<2 || title.length>30) throw new Error('排版名称须为 2–30 个字')
    const id=crypto.createHash('sha256').update(title.normalize('NFC').toLowerCase()).digest('hex').slice(0,32)
    const preset={title,layout:normalizeLayout(event.layout),photo:normalizePhoto(event.photo),badges:normalizeBadges(event.badges)}
    await db.runTransaction(async tx=>{
      const old=await document(tx,COLLECTION,id)
      if(old) throw Object.assign(new Error('已有同名排版，请使用其他名称'),{code:'CARD_LAYOUT_PRESET_EXISTS'})
      await tx.collection(COLLECTION).doc(id).set({data:{...preset,schemaVersion:'player-card-layout/1',createdAt:db.serverDate(),createdBy:auth.userId}})
    })
    return {success:true,preset:{id,...preset}}
  }
  return {list,get,save}
}
module.exports={createPlayerCardLayoutPresets,COLLECTION}
