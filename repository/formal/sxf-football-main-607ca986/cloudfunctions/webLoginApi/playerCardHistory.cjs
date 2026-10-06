const crypto=require('node:crypto')
const RENDERS='player_card_renders'
function cardId(renderId,digest){return `pc_${crypto.createHash('sha256').update(`${String(renderId)}\u001f${String(digest||'')}`).digest('hex').slice(0,40)}`}
function historyId(value){return `history_${crypto.createHash('sha256').update(String(value||'')).digest('hex').slice(0,48)}`}
async function archiveCurrentRender(transaction,db,renderId,record){
  if(!record||record.status!=='ready'||!record.fileId)return ''
  const currentCardId=String(record.cardId||cardId(renderId,record.digest||record.fileId))
  const id=historyId(currentCardId)
  const { _id, ...snapshot }=record
  await transaction.collection(RENDERS).doc(id).set({data:{...snapshot,cardId:currentCardId,sourceRenderId:String(renderId),isSnapshot:true,
    snapshotOfVersion:Number(record.publishedVersion||0),archivedAt:db.serverDate()}})
  return currentCardId
}
module.exports={cardId,historyId,archiveCurrentRender}
