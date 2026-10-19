'use strict'
const crypto=require('node:crypto')
const {document}=require('./playerCardReader.cjs')
const preload=require('./playerCardPreload.cjs')
const sourceReader=require('./playerCardSource.cjs')
const VERSION='player-card-dynamic/1'
const fonts=require('./player-card-font-manifest.json').filter(f=>/\.(otf|ttf)$/.test(f.name)).map(f=>({...f,family:f.name.startsWith('Anton')?'Anton':f.name.startsWith('MaShan')?'Ma Shan Zheng':'Noto Sans SC',weight:f.name.includes('Bold')?700:400}))
function values(player,snapshot){return {number:String(player.jerseyNumber??''),position:({GK:'守门员',DF:'后卫',MF:'中场',FW:'前锋'})[player.position]||String(player.position||snapshot.positionOverride||'—'),name:String(player.name||''),jerseyName:String(player.jerseyName||''),height:player.height==null||player.height===''?'':`身高 ${player.height}cm`,weight:player.weight==null||player.weight===''?'':`体重 ${player.weight}kg`,nationality:String(player.nationality||'')}}
async function descriptor(cloud,db,player,snapshot,grant,options={}){
 const base={protocolVersion:VERSION,playerId:String(player._id),playerName:String(player.name||''),templateId:snapshot.templateId,publishedVersion:Number(snapshot.version),cardDataVersion:Number(player.playerCardVersion||0),cardUrl:''}
 const source=grant?.portraitFileId?{fileId:grant.portraitFileId}:await sourceReader.resolveSource(db,player)
 if(!source?.fileId)return {...base,status:'unavailable',portraitStatus:'missing',reason:'球员照片待补充'}
 const team=player.teamId?await document(db,'teams',player.teamId):null
 const ids={background:snapshot.backgroundFileId,mask:snapshot.maskFileId,portrait:source.fileId,teamLogo:sourceReader.teamLogoFileId(team)}
 const urls=await (options.resolveUrls||require('./playerCardPreviewAssets.cjs').createAssetResolver(cloud))(Object.values(ids));const assets=Object.fromEntries(Object.entries(ids).map(([k,id])=>[k,urls.get(id)||'']))
 const missing=Object.keys(ids).filter(key=>(ids[key]||['background','mask','portrait'].includes(key))&&!assets[key]);if(missing.length)return {...base,status:'failed',portraitStatus:missing.includes('portrait')?'failed':'available',assetErrors:missing,reasonCode:'CARD_ASSET_URL_FAILED',reason:missing.map(key=>({background:'卡面背景',mask:'照片遮罩',portrait:'球员照片',teamLogo:'球队队徽'}[key])).join('、')+'地址读取失败，请重试预览'}
 const scene={libraryId:grant?crypto.createHash('sha256').update(JSON.stringify([String(player._id),String(snapshot.templateId)])).digest('hex'):'',libraryRevision:Number(grant?.revision||0),protocolVersion:VERSION,width:300,height:430,templateId:snapshot.templateId,publishedVersion:Number(snapshot.version),cardTypeId:snapshot.cardTypeId,stateId:preload.stateId(snapshot.cardTypeId,snapshot.preload,snapshot.preload?snapshot.templateId:undefined),assets,layout:snapshot.layout,photo:snapshot.photo||{x:150,y:35,scale:108},badges:snapshot.badges||{},crop:grant?.crop||player.playerCardCrop||{zoom:1,x:0,y:0},values:values(player,snapshot),fonts}
 const dataVersion=crypto.createHash('sha256').update(JSON.stringify([snapshot.templateId,snapshot.version,ids,scene.values,scene.crop,player.playerCardVersion||0,player.photoVersion||0,player.updateTime||player.updatedAt||null,team?.updateTime||team?.updatedAt||null,grant?.revision||0])).digest('hex')
 return {protocolVersion:VERSION,status:'ready',displayMode:'dynamic',playerId:String(player._id),playerName:String(player.name||''),portraitStatus:'available',cardId:`dynamic:${player._id}:${snapshot.templateId}:${snapshot.version}:${dataVersion}`,templateId:snapshot.templateId,publishedVersion:Number(snapshot.version),cardTypeId:snapshot.cardTypeId,cardDataVersion:Number(player.playerCardVersion||0),dataVersion,renderVersion:VERSION,cardUrl:'',cardScene:scene,portraitUrl:assets.portrait}
}
async function read(cloud,db,player,options={}){
 let snapshot,grant
 const score=options.score||await require('./data-center/service.cjs').createDataService(db).playerCardForAuthorizedPlayer(String(player._id))
 if(score.status==='test_data_excluded')return {playerId:String(player._id),status:'unavailable',gradeStatus:'test_data_excluded',reason:'测试资料不制作正式卡'}
 const selected=options.baseOnly?'':String(player.playerCardDisplayTemplateId||'')
 if(selected){const id=crypto.createHash('sha256').update(JSON.stringify([String(player._id),selected])).digest('hex');grant=await document(db,'player_card_library',id);const template=await document(db,'player_card_templates',selected);if(grant&&grant.status!=='revoked'&&template){const state=await document(db,'player_card_template_states',preload.stateId(template.tier,template.published?.preload,selected));if(state?.active)snapshot=await document(db,'player_card_template_versions',`${selected}_${state.active.version}`)}}
 if(!snapshot){grant=null;const chosen=player.playerCardBackgroundSelected===true || player.playerCardBackgroundId&&player.playerCardBackgroundId!==player.playerCardTier;const type=String(chosen?player.playerCardBackgroundId:score.tier||player.playerCardTier||player.playerCardBackgroundId||'');if(!['bronze','silver','gold'].includes(type))return null;const state=await document(db,'player_card_template_states',type);if(state?.active)snapshot=await document(db,'player_card_template_versions',`${state.active.templateId}_${state.active.version}`)}
 return snapshot?{...await descriptor(cloud,db,player,snapshot,grant),gradeStatus:score.status,tier:score.tier||null}:null
}
async function publish(cloud,db,row,revision,userId){
 if(Number(row.revision)!==Number(revision))throw new Error('草稿已更新，请重新预览')
 const scope=await preload.validatePreload(db,row.draft?.preload,document),version=Number(row.draftVersion||0)
 if(version<=Number(row.publishedVersion||0))throw new Error('没有待发布的草稿')
 if(scope.type!=='platform'){const target=await document(db,preload.COLLECTIONS[scope.type],scope.targetId);if(target&&(target.synthetic===true||target.isTest===true||target.syntheticDatasetId||target.syntheticKey||String(target.source||'').toLowerCase()==='synthetic'))throw new Error('测试范围不能发布正式球员卡')}
 const renderer=require('./playerCardRender.cjs');await renderer.ensureFonts()
 const [backgroundBuffer,maskBuffer]=await Promise.all([cloud.downloadFile({fileID:row.draft.backgroundFileId}),cloud.downloadFile({fileID:row.draft.maskFileId})])
 // Validate the same immutable assets/layout used by the operator's preview, without enumerating players.
 if(!backgroundBuffer.fileContent||!maskBuffer.fileContent||backgroundBuffer.fileContent.length>2*1024*1024||maskBuffer.fileContent.length>2*1024*1024)throw new Error('背景或遮罩无效或超过2MB')
 renderer.renderCard({backgroundBuffer:backgroundBuffer.fileContent,maskBuffer:maskBuffer.fileContent,template:row.draft,player:{name:'预览球员',jerseyNumber:'10',position:'FW'}})
 const key=preload.stateId(row.tier,scope,row.draft?.preload?row._id:undefined),snapshotId=`${row._id}_${version}`
 await db.runTransaction(async tx=>{
  const current=await document(tx,'player_card_templates',row._id),state=await document(tx,'player_card_template_states',key)
  if(!current||Number(current.revision)!==Number(revision))throw new Error('草稿已更新，请重新预览')
  if(state?.candidate)throw new Error('旧制卡任务尚未处理，请继续或退回后再发布动态版')
  if(await document(tx,'player_card_template_versions',snapshotId))throw new Error('此草稿已创建版本，请先处理原任务')
  await tx.collection('player_card_template_versions').doc(snapshotId).set({data:{...current.draft,templateId:row._id,version,cardTypeId:row.tier,displayMode:'dynamic',createAt:db.serverDate(),createdBy:userId}})
  await tx.collection('player_card_template_states').doc(key).set({data:{...(state||{}),tier:row.tier,preload:scope,revision:Number(state?.revision||0)+1,mutation:Number(state?.mutation||0),active:{templateId:row._id,version,displayMode:'dynamic'},candidate:null,activatedAt:db.serverDate(),activatedBy:userId}})
  await tx.collection('player_card_templates').doc(row._id).update({data:{published:db.command.set({...current.draft,displayMode:'dynamic'}),publishedVersion:version,status:'published',revision:Number(revision)+1,publishedAt:db.serverDate(),publishedBy:userId}})
 })
 return {success:true,status:'active',displayMode:'dynamic',templateId:row._id,publishedVersion:version}
}
async function restrictAssets(cloud,db,player,card){
 if(!card.cardScene)return card
 const scene=card.cardScene,key='projection_'+card.dataVersion,old=await document(db,'player_card_renders',key)
 let fileId=old?.fileId
 if(!fileId){
   const {PNG}=require('pngjs'),renderer=require('./playerCardRender.cjs'),bg=new PNG({width:300,height:430})
   const [mask,portrait]=await Promise.all([scene.assets.mask,scene.assets.portrait].map(url=>cloud.downloadFile({fileID:sourceReader.permanentFile(url)})))
   const png=PNG.sync.read(renderer.renderCard({backgroundBuffer:PNG.sync.write(bg),maskBuffer:mask.fileContent,portraitBuffer:portrait.fileContent,template:{photo:scene.photo,layout:{},badges:{}},crop:scene.crop,photoOnly:true,size:1}))
   for(let i=0;i<png.data.length;i+=4)if(png.data[i+3]===0)png.data[i]=png.data[i+1]=png.data[i+2]=0
   const file=await cloud.uploadFile({cloudPath:'restricted/player-cards/projections/'+key+'.png',fileContent:PNG.sync.write(png)})
   fileId=file.fileID
   await db.collection('player_card_renders').doc(key).set({data:{playerId:String(player._id),projectionOnly:true,fileId,dataVersion:card.dataVersion,generatedAt:db.serverDate()}})
 }
 const urls=await cloud.getTempFileURL({fileList:[fileId]}),portrait=urls.fileList?.find(f=>f.fileID===fileId)?.tempFileURL
 if(!portrait)throw new Error('公开球员卡素材暂不可读')
 return {...card,portraitUrl:portrait,cardScene:{...scene,portraitIsLayer:true,privacyProjection:'card-visible-pixels-only',assets:{...scene.assets,portrait}}}
}
async function exportCard(cloud,db,player,card,options={}){
 if(card?.status!=='ready'||!card.cardScene)throw new Error('球员卡暂不可导出')
 const size=options.size===1?1:3
 const scene=card.cardScene,grant=scene.libraryId?await document(db,'player_card_library',scene.libraryId):null;if(scene.libraryId&&(!grant||grant.status==='revoked'||String(grant.playerId)!==String(player._id)||String(grant.templateId)!==card.templateId||Number(grant.revision||0)!==Number(scene.libraryRevision)))throw new Error('卡库授权或调整已更新，请重新读取');const current=await document(db,'players',player._id),state=await document(db,'player_card_template_states',scene.stateId);if(!current||Number(current.playerCardVersion||0)!==card.cardDataVersion||state?.active?.templateId!==card.templateId||Number(state.active.version)!==card.publishedVersion)throw new Error('资料或模板已更新，请重新读取后导出');const key=(size===1?'dynamic_display_':'dynamic_export_')+crypto.createHash('sha256').update(card.dataVersion+VERSION+(size===1?':1':'')).digest('hex'),old=await document(db,'player_card_renders',key)
 let fileId=old?.fileId
 if(!fileId){const ids=['background','mask','portrait','teamLogo'].map(k=>sourceReader.permanentFile(scene.assets[k]));if(scene.portraitIsLayer){const source=grant?.portraitFileId?{fileId:grant.portraitFileId}:await sourceReader.resolveSource(db,player);ids[2]=source?.fileId||''}const buffers=await Promise.all(ids.map(id=>id?cloud.downloadFile({fileID:id}).then(r=>r.fileContent):null));const renderer=require('./playerCardRender.cjs');await renderer.ensureFonts();const png=renderer.renderCard({backgroundBuffer:buffers[0],maskBuffer:buffers[1],portraitBuffer:buffers[2],teamLogoBuffer:buffers[3],template:scene,player,crop:scene.crop,size});const result=await cloud.uploadFile({cloudPath:'restricted/player-cards/exports/'+key+'.png',fileContent:png});fileId=result.fileID;await db.collection('player_card_renders').doc(key).set({data:{playerId:String(player._id),templateId:card.templateId,publishedVersion:card.publishedVersion,dataVersion:card.dataVersion,fileId,status:'ready',exportOnly:true,generatedAt:db.serverDate()}})}
 const urls=await cloud.getTempFileURL({fileList:[fileId]});return {success:true,cardId:card.cardId,cardUrl:urls.fileList?.find(f=>f.fileID===fileId)?.tempFileURL||'',publishedVersion:card.publishedVersion,dataVersion:card.dataVersion}
}
module.exports={VERSION,read,descriptor,values,publish,exportCard,restrictAssets}
