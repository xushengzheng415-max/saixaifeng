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
function teamLogoFileId(team) {
  for (const field of ['logoTransparent','logoFileId','logoFileID','teamLogoFileId','teamLogoFileID','logo','logoUrl','teamLogo']) {
    const value=team?.[field]
    const candidates=value&&typeof value==='object'?[value.fileID,value.fileId,value.url,value.tempFileURL]:[value]
    for(const candidate of candidates){const fileId=permanentFile(candidate);if(fileId)return fileId}
  }
  return ''
}
function rosterSource(player) {
  for(const field of ['photoFileID','photoFileId','processedPhotoFileId','photoUrl','avatarUrl']){
    const value=player?.[field]
    const candidates=value&&typeof value==='object'?[value.fileID,value.fileId,value.url,value.tempFileURL]:[value]
    for(const candidate of candidates){
      const fileId=permanentFile(candidate)
      if(fileId)return {fileId,type:'legacy_roster',field}
    }
  }
  return null
}
async function resolveSource(db,player) {
  if(player.playerCardSourceFileId){
    const fileId=permanentFile(player.playerCardSourceFileId)
    if(fileId)return {fileId,type:player.playerCardSourceType||'standard_portrait',field:'playerCardSourceFileId'}
  }
  if(player.recentPortraitId){
    const portrait=await require('./playerCardSuite.cjs').document(db,'parent_portraits',player.recentPortraitId)
    const fileId=permanentFile(portrait?.transparentFileId)
    if(portrait?.status==='confirmed'&&fileId)return {fileId,type:'standard_portrait',field:'recentPortraitId'}
  }
  return rosterSource(player)
}
module.exports={permanentFile,teamLogoFileId,rosterSource,resolveSource}
