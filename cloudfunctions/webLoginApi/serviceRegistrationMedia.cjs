'use strict'
const crypto=require('node:crypto')
const suite=require('./playerCardSuite.cjs')
const {createDataService}=require('./data-center/service.cjs')
const text=v=>String(v==null?'':v).trim()
const error=(code,message)=>{throw Object.assign(new Error(message),{code})}
const owner=(p,s)=>[p.linkedUserId,p.playerUserId,p.guardianUserId].map(text).includes(text(s.userId))
async function upload(cloud,db,loaded,event,trustedAsset) {
  const {session,gate}=loaded
  if(!session.phoneVerified||gate.purpose!=='player_invite_entry')error('PLAYER_AUTH_REQUIRED','请先验证登记手机号')
  let raw,originalId=''
  if(trustedAsset && trustedAsset.fileID && Buffer.isBuffer(trustedAsset.bytes)){
    originalId=trustedAsset.fileID
    raw=trustedAsset.bytes
  } else if(event.keepExisting===true){
    const choice=session.playerRegistrationChoice
    if(choice?.mode!=='claim')error('PLAYER_PHOTO_INVALID','请先选择待认领球员')
    const player=await suite.document(db,'players',choice.playerId)
    if(!player||(text(player.teamId)?text(player.teamId)!==text(gate.teamId):text(player.teamCode)!==text(gate.teamId)))error('PLAYER_PHOTO_INVALID','球员档案已变化，请重新选择')
    const source=await require('./playerCardSource.cjs').resolveSource(db,player)
    originalId=text(source?.fileId||player.playerCardSourceFileId||player.photoUrl||player.photoFileId||player.photoFileID||player.photo)
    if(!originalId.startsWith('cloud://'))error('PLAYER_PHOTO_INVALID','原形象照无法读取，请重新上传')
    raw=(await cloud.downloadFile({fileID:originalId})).fileContent
  } else {
    const match=text(event.base64Data).match(/^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/)
    if(!match)error('PHOTO_INVALID','请上传JPG或PNG图片')
    raw=Buffer.from(match[2],'base64')
  }
  if(!raw?.length||raw.length>4*1024*1024)error('PHOTO_TOO_LARGE','照片不能为空或超过4MB')
  const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if(!png&&!(raw[0]===255&&raw[1]===216))error('PHOTO_INVALID','图片无法识别，请换一张')
  const id=crypto.randomBytes(16).toString('hex'),prefix='restricted/service-player-portraits/'+crypto.createHash('sha256').update(text(session._id)).digest('hex').slice(0,24)+'/'+id
  if(!originalId)originalId=(await cloud.uploadFile({cloudPath:prefix+'/original.'+(png?'png':'jpg'),fileContent:raw})).fileID
  let cutout=raw
  const existingTransparent=png&&require('./playerCardRender.cjs').isTransparentPng(raw)
  if(!existingTransparent){
    // A full-resolution phone image can produce a foreground response above the
    // existing Baidu adapter's 4MB limit. Normalize without cropping the person.
    const {Resvg}=require('@resvg/resvg-js')
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="white"/><image width="800" height="800" preserveAspectRatio="xMidYMid meet" href="data:image/'+(png?'png':'jpeg')+';base64,'+raw.toString('base64')+'"/></svg>'
    const normalized=new Resvg(svg).render().asPng()
    const result=await cloud.callFunction({name:'baiduRemoveBg',data:{action:'removeBackground',imageBase64:normalized.toString('base64')}})
    if(!result.result?.success||!result.result.data)error('PORTRAIT_PROCESSING_FAILED','未能完成抠图，请换清晰单人照重试')
    cutout=Buffer.from(text(result.result.data).replace(/^data:image\/png;base64,/,''),'base64')
  }
  if(!cutout.length||cutout.length>8*1024*1024||!require('./playerCardRender.cjs').isTransparentPng(cutout))error('PORTRAIT_PROCESSING_FAILED','抠图结果无效，请重新拍摄')
  const fileId=existingTransparent?originalId:(await cloud.uploadFile({cloudPath:prefix+'/transparent.png',fileContent:cutout})).fileID
  // 来源标记只做事实记录：AI 定妆照入库时带上 aiRequestId，可与蜂蜜流水 refId（ai-portrait:<requestId>）互查；
  // 自己拍照/上传的路径不传，保持原结构不变。
  const portraitSource=text(event.portraitSource),aiRequestId=text(event.aiRequestId)
  const portrait={id,fileId,originalId,processingStatus:'ready',provider:existingTransparent?'transparent_original':'baiduRemoveBg',createdAt:new Date()}
  if(portraitSource)portrait.source=portraitSource
  if(aiRequestId)portrait.aiRequestId=aiRequestId
  await db.runTransaction(async tx=>{
    const current=await suite.document(tx,'service_entry_sessions',session._id)
    if(!current?.active||text(current.userId)!==text(session.userId))error('ENTRY_SESSION_INVALID','登记会话已变化，请重新进入')
    await tx.collection('service_entry_sessions').doc(session._id).update({data:{playerRegistrationPortraits:db.command.set([...(current.playerRegistrationPortraits||[]).slice(-5),portrait])}})
  })
  return {success:true,portraitId:id,fileID:fileId,transparentPreview:'data:image/png;base64,'+cutout.toString('base64'),processingStatus:'ready'}
}
async function card(cloud,db,loaded,event) {
  if(event.draft===true)return draftCard(cloud,db,loaded,event)
  const {session,gate}=loaded
  if(!session.phoneVerified||gate.purpose!=='player_invite_entry'||!session.registeredPlayerId)error('PLAYER_CARD_AUTH_REQUIRED','请先完成球员登记')
  const player=await suite.document(db,'players',session.registeredPlayerId)
  if(!player||!owner(player,session)||text(player.teamId)!==text(gate.teamId)||['archived','deleted'].includes(text(player.status)))error('PLAYER_CARD_FORBIDDEN','球员关联已变化，请重新进入')
  const crop=event.crop?require('./playerCards.cjs').normalizeCrop(event.crop):(player.playerCardCrop||{zoom:1,x:0,y:0})
  const score=await createDataService(db).playerCardForAuthorizedPlayer(player._id)
  if(score?.status!=='ready'||!score.tier)error('PLAYER_CARD_PENDING','资料已保存，球员卡数据待核定，请稍后重试')
  // 登记链路固定用平台基础等级卡（金/银/铜）：新登记球员尚未进入赛事正式名单，
  // 赛事定向预装卡只在球员卡库按名单资格读取，不在这里替换基础卡。
  const cardContext=await require('./registrationCardContext.cjs').base(db,score.tier)
  const template=cardContext.template
  if(!template)error('PLAYER_CARD_TEMPLATE_UNAVAILABLE','资料已保存，球员卡模板暂不可用，请稍后重试')
  const source=await require('./playerCardSource.cjs').resolveSource(db,player)
  if(!source?.fileId)error('PLAYER_CARD_PORTRAIT_REQUIRED','请先完成形象照抠图')
  if(event.save===true){
    if(text(event.expectedTemplateId)!==text(template.templateId)||Number(event.expectedTemplateVersion)!==Number(template.version))error('PLAYER_CARD_TEMPLATE_CHANGED','卡片模板已更新，请重新预览')
    const expectedVersion=Number(event.expectedVersion)
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion!==Number(player.playerCardVersion||0))error('PLAYER_CARD_CONFLICT','球员卡已更新，请重新预览')
    await db.runTransaction(async tx=>{
      const current=await suite.document(tx,'players',player._id),state=await suite.document(tx,suite.STATES,cardContext.stateId)
      if(!owner(current||{},session)||text(current?.teamId)!==text(gate.teamId)||Number(current?.playerCardVersion||0)!==expectedVersion||text(current?.playerCardSourceFileId||current?.photoUrl)!==text(player.playerCardSourceFileId||player.photoUrl))error('PLAYER_CARD_CONFLICT','球员卡已变化，请重新预览')
      if(text(state?.active?.templateId)!==text(template.templateId)||Number(state?.active?.version)!==Number(template.version))error('PLAYER_CARD_TEMPLATE_CHANGED','卡片模板已更新，请重新预览')
      await tx.collection('players').doc(player._id).update({data:{playerCardDynamic:true,playerCardCrop:db.command.set(crop),playerCardSourceFileId:source.fileId,playerCardSourceType:'standard_portrait',playerCardVersion:expectedVersion+1,playerCardSchemaVersion:'player-card/5',playerCardUpdatedBy:text(session.userId),playerCardUpdatedAt:db.serverDate()}})
    })
    return {success:true,version:expectedVersion+1}
  }
  const rendered=await suite.renderPlayer(cloud,db,player,template,score,{portraitFileId:source.fileId,crop})
  const sceneResult=event.editorScene===true?await require('./playerCardDynamic.cjs').descriptor(cloud,db,{...player,playerCardSourceFileId:source.fileId,playerCardCrop:crop},{...template,cardTypeId:template.cardTypeId||score.tier},null):null
  return {success:true,imageData:'data:image/png;base64,'+rendered.png.toString('base64'),cardScene:sceneResult?.cardScene,templateId:template.templateId,templateVersion:template.version,version:Number(player.playerCardVersion||0),crop}
}
async function draftCard(cloud,db,loaded,event) {
  const {session,gate}=loaded
  if(!session.phoneVerified||gate.purpose!=='player_invite_entry')error('PLAYER_AUTH_REQUIRED','请先验证登记手机号')
  const invocation=await cloud.callFunction({name:'getMiniWorkspace',data:{...event,action:'servicePlayerRegistration',operation:'preview'}})
  const result=invocation?.result
  if(!result?.success||!result.registrationDraft)error(result?.code||'PLAYER_CARD_DRAFT_INVALID',result?.message||'请先补齐球员资料')
  const draft=result.registrationDraft,service=createDataService(db)
  const cached=session.playerRegistrationCardDraft
  const reuseScore=event.confirm!==true&&event.refreshScore!==true&&cached?.fingerprint===draft.fingerprint&&new Date(cached.expiresAt).getTime()>Date.now()
  const score=reuseScore?{status:'ready',tier:cached.tier,scoreVersion:cached.scoreVersion}:draft.existing?await service.playerCardForAuthorizedPlayer(draft.player._id):await service.playerCardForAuthorizedRegistrationDraft(draft.player)
  if(score?.status!=='ready'||!score.tier)error('PLAYER_CARD_PENDING','球员卡数据待核定，请稍后重试')
  // 登记预览同 card()：尚未进入赛事正式名单，固定平台基础等级卡（金/银/铜）。
  const cardContext=await require('./registrationCardContext.cjs').base(db,score.tier)
  const template=cardContext.template
  if(!template)error('PLAYER_CARD_TEMPLATE_UNAVAILABLE','球员卡模板暂不可用，请稍后重试')
  const crop=require('./playerCards.cjs').normalizeCrop(event.crop||draft.crop||{zoom:1,x:0,y:0})
  if(event.confirm===true) {
    const previous=session.playerRegistrationCardDraft
    const recovering=event.restore===true&&previous?.confirmed===true&&JSON.stringify(previous.crop)===JSON.stringify(crop)
    if(event.restore===true&&!recovering)error('PLAYER_CARD_PREVIEW_CHANGED','确认内容已变化，请重新生成后确认')
    if(!previous||!previous.renderRequest||previous.renderRequest!==session.playerRegistrationCardRenderRequest||previous.token!==text(event.previewToken)||previous.fingerprint!==draft.fingerprint||previous.tier!==score.tier||new Date(previous.expiresAt).getTime()<=Date.now()&&!recovering)error('PLAYER_CARD_PREVIEW_CHANGED','预览已变化，请重新生成后确认')
    if(previous.templateId!==template.templateId||Number(previous.templateVersion)!==Number(template.version))error('PLAYER_CARD_TEMPLATE_CHANGED','模板已更新，请重新生成后确认')
    const rendered=await suite.renderPlayer(cloud,db,draft.player,template,score,{portraitFileId:draft.portraitFileId,crop})
    await db.runTransaction(async tx=>{
      const current=await suite.document(tx,'service_entry_sessions',session._id)
      if(!current?.active||text(current.userId)!==text(session.userId)||current.playerRegistrationCardRenderRequest!==previous.renderRequest||current.playerRegistrationCardDraft?.token!==previous.token||current.playerRegistrationChoice?.nonce!==draft.choiceToken)error('PLAYER_CARD_PREVIEW_CHANGED','预览已变化，请重新生成后确认')
      const state=await suite.document(tx,suite.STATES,cardContext.stateId)
      if(state?.active?.templateId!==template.templateId||Number(state?.active?.version)!==Number(template.version))error('PLAYER_CARD_TEMPLATE_CHANGED','模板已更新，请重新生成后确认')
      await tx.collection('service_entry_sessions').doc(session._id).update({data:{playerRegistrationCardDraft:db.command.set({...previous,crop,confirmed:true,...(recovering?{expiresAt:new Date(Date.now()+15*60000)}:{})})}})
    })
    return {success:true,confirmed:true,previewToken:previous.token,crop,imageData:'data:image/png;base64,'+rendered.png.toString('base64')}
  }
  const renderRequest=crypto.randomBytes(16).toString('hex')
  await db.runTransaction(async tx=>{
    const current=await suite.document(tx,'service_entry_sessions',session._id)
    if(!current?.active||text(current.userId)!==text(session.userId)||current.playerRegistrationChoice?.nonce!==draft.choiceToken||current.playerRegistrationReceipt?.choiceToken===draft.choiceToken)error('PLAYER_CARD_PREVIEW_CHANGED','登记对象已变化，请重新进入')
    await tx.collection('service_entry_sessions').doc(session._id).update({data:{playerRegistrationCardRenderRequest:renderRequest,...(current.playerRegistrationCardDraft?{playerRegistrationCardDraft:db.command.set({...current.playerRegistrationCardDraft,confirmed:false})}:{})}})
  })
  const rendered=event.editorScene===true?null:await suite.renderPlayer(cloud,db,draft.player,template,score,{portraitFileId:draft.portraitFileId,crop})
  const record={token:crypto.randomBytes(20).toString('hex'),renderRequest,fingerprint:draft.fingerprint,choiceToken:draft.choiceToken,portraitId:draft.portraitId,crop,tier:score.tier,scoreVersion:String(score.scoreVersion||''),templateId:template.templateId,templateVersion:template.version,templateStateId:cardContext.stateId,templateSetId:text(template.setId),cardTournamentId:cardContext.tournamentId,registrationIds:cardContext.registrationIds||[],confirmed:false,expiresAt:new Date(Date.now()+15*60000)}
  await db.runTransaction(async tx=>{
    const current=await suite.document(tx,'service_entry_sessions',session._id)
    if(!current?.active||text(current.userId)!==text(session.userId)||current.playerRegistrationChoice?.nonce!==draft.choiceToken||current.playerRegistrationCardRenderRequest!==renderRequest||current.playerRegistrationReceipt?.choiceToken===draft.choiceToken)error('PLAYER_CARD_PREVIEW_CHANGED','登记对象或预览已变化，请重新生成')
    await tx.collection('service_entry_sessions').doc(session._id).update({data:{playerRegistrationCardDraft:db.command.set(record)}})
  })
  let cardScene
  if(event.editorScene===true){
    const sceneResult=await require('./playerCardDynamic.cjs').descriptor(cloud,db,{...draft.player,playerCardSourceFileId:draft.portraitFileId,playerCardSourceType:'standard_portrait',playerCardCrop:crop},{...template,cardTypeId:template.cardTypeId||score.tier},null)
    if(sceneResult.status!=='ready'||!sceneResult.cardScene)error('PLAYER_CARD_ASSET_FAILED',sceneResult.reason||'卡面素材读取失败，请重试')
    cardScene=sceneResult.cardScene
  }
  return {success:true,draft:true,imageData:rendered?'data:image/png;base64,'+rendered.png.toString('base64'):'',previewToken:record.token,templateId:template.templateId,templateVersion:template.version,cardTournamentId:cardContext.tournamentId,tournamentName:cardContext.tournamentName,cardScene,crop}
}
module.exports={upload,card,draftCard}
