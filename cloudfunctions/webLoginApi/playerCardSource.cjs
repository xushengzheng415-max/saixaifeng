const {permanentFile}=require('./playerCardReader.cjs')
function rosterSource(player) {
  for(const field of ['photoFileID','photoFileId','processedPhotoFileId','photoUrl','avatarUrl']){
    const fileId=permanentFile(player[field])
    if(fileId)return {fileId,type:'legacy_roster',field}
  }
  return null
}
async function resolveSource(db,player) {
  if(player.playerCardSourceFileId){
    const fileId=permanentFile(player.playerCardSourceFileId)
    return fileId?{fileId,type:player.playerCardSourceType||'standard_portrait',field:'playerCardSourceFileId'}:null
  }
  if(player.recentPortraitId){
    const portrait=await require('./playerCardSuite.cjs').document(db,'parent_portraits',player.recentPortraitId)
    const fileId=permanentFile(portrait?.transparentFileId)
    if(portrait?.status==='confirmed'&&fileId)return {fileId,type:'standard_portrait',field:'recentPortraitId'}
  }
  return rosterSource(player)
}
module.exports={permanentFile,rosterSource,resolveSource}
