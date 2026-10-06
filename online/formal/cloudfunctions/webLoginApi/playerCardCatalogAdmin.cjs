const suite = require('./playerCardSuite.cjs')
const preload = require('./playerCardPreload.cjs')
const {createDataService}=require('./data-center/service.cjs')
const {normalizeCrop}=require('./playerCards.cjs')
const history=require('./playerCardHistory.cjs')
const sourceTools=require('./playerCardSource.cjs')

const PAGE_SIZE = 100
const SCOPE_NAMES = { platform:'全平台', team:'球队', tournament:'赛事', player:'球员' }
function timestamp(value) { const n=new Date(value && value.$date ? value.$date : value || 0).getTime();return Number.isFinite(n)?n:0 }

function createPlayerCardCatalogAdmin({ cloud, authenticateWebSession, scoreForPlayer }) {
  const db=cloud.database()
  const batch=require('./playerCardCatalogBatch.cjs').createPlayerCardCatalogBatch({cloud,authenticateWebSession,scoreForPlayer})
  async function owner(event) {
    const auth=await authenticateWebSession(event)
    if(!auth.success)return auth
    if(auth.principalType!=='platform_owner'||auth.user?.isPlatformOwner!==true)return {success:false,code:'PLAYER_CARD_CATALOG_FORBIDDEN',error:'仅平台负责人可查看成卡库'}
    return auth
  }
  async function signedUrls(rows) {
    const ids=[...new Set(rows.flatMap(row=>[row.fileId,row.portraitFileId]).filter(value=>String(value||'').startsWith('cloud://')))], urls=new Map()
    for(let i=0;i<ids.length;i+=50){
      const result=await cloud.getTempFileURL({fileList:ids.slice(i,i+50)})
      for(const file of result.fileList||[])if(file.tempFileURL)urls.set(file.fileID,file.tempFileURL)
    }
    return urls
  }
  async function list(event) {
    const renders=await preload.readAll(db,suite.RENDERS,{})
    const players=await preload.readAll(db,'players',{})
    const teams=await preload.readAll(db,'teams',{})
    const tournaments=await preload.readAll(db,'tournaments',{})
    const rosterSnapshots=await preload.readAll(db,'roster_snapshots',{})
    const templates=await preload.readAll(db,suite.TEMPLATES,{})
    const versions=await preload.readAll(db,suite.VERSIONS,{})
    const grants=await preload.readAll(db,'player_card_library',{})
    const states=await preload.readAll(db,suite.STATES,{})
    const playerById=new Map(players.map(row=>[String(row._id),row]))
    const teamById=new Map(teams.map(row=>[String(row._id),row]))
    const tournamentById=new Map(tournaments.map(row=>[String(row._id),row]))
    const templateById=new Map(templates.map(row=>[String(row._id),row]))
    const versionById=new Map(versions.map(row=>[String(row._id),row]))
    const grantById=new Map(grants.map(row=>[`${row.playerId}\u001f${row.templateId}`,row]))
    const stateById=new Map(states.map(row=>[String(row._id),row]))
    const latestRosters=new Map()
    for(const roster of rosterSnapshots){
      if(!roster.tournamentId||!roster.teamId||!['approved','locked'].includes(String(roster.status||'')))continue
      const key=[roster.tournamentId,roster.teamId,roster.divisionId||roster.division||''].map(String).join('\u001f')
      const old=latestRosters.get(key)
      if(!old||Number(roster.version||0)>Number(old.version||0))latestRosters.set(key,roster)
    }
    const tournamentsByPlayer=new Map()
    for(const roster of latestRosters.values()){
      const ids=new Set((roster.playerIds||[]).filter(id=>typeof id==='string').map(String))
      for(const item of roster.players||[])if(item&&(item.playerId||item.id||item._id))ids.add(String(item.playerId||item.id||item._id))
      for(const id of ids){if(!tournamentsByPlayer.has(id))tournamentsByPlayer.set(id,new Set());tournamentsByPlayer.get(id).add(String(roster.tournamentId))}
    }
    const renderedFileKeys=new Set(), items=[]
    for(const render of renders){
      const playerId=String(render.playerId||''),templateId=String(render.templateId||''),player=playerById.get(playerId)
      if(!player)continue
      if(render.fileId)renderedFileKeys.add(`${playerId}\u001f${render.fileId}`)
      const tier=String(render.cardTypeId||'')
      const publishedVersion=Number(render.publishedVersion||0)
      const snapshot=versionById.get(suite.versionId(templateId,publishedVersion))
      const template=templateById.get(templateId)
      const scope=render.visualOnly&&render.tournamentId
        ? {type:'tournament',targetId:String(render.tournamentId),targetName:String(tournamentById.get(String(render.tournamentId))?.name||'')}
        : preload.normalizePreload(snapshot?.preload||template?.published?.preload||{type:'platform'})
      const grant=grantById.get(`${playerId}\u001f${templateId}`)
      const state=stateById.get(preload.stateId(tier,scope,templateId))||stateById.get(tier)
      const active=state?.active
      if(state?.candidate?.templateId===templateId&&Number(state.candidate.version)===publishedVersion)continue
      const versionCurrent=active?.templateId===templateId&&Number(active?.version)===publishedVersion
      const dataCurrent=Number(render.cardDataVersion||0)===Number(player.playerCardVersion||0)
      const libraryCurrent=!grant||Number(render.libraryRevision||0)===Number(grant.revision||0)
      const baseCurrent=Boolean(player.playerCardFileId)&&Number(player.playerCardVersion||0)===Number(render.cardDataVersion||0)
      const isCurrent=render.status==='ready'&&!render.isSnapshot&&versionCurrent&&dataCurrent&&libraryCurrent&&(render.visualOnly||grant||baseCurrent)
      const cardTeamId=scope.type==='team'?String(scope.targetId||''):String(player.teamId||'')
      const team=teamById.get(cardTeamId)
      const tournamentId=scope.type==='tournament'?String(scope.targetId||''):''
      const tournament=tournamentById.get(tournamentId)
      const provinceId=String(team?.provinceCode||team?.province||'')
      const provinceName=String(team?.provinceName||'')
      const cityName=String(team?.cityName||'')
      items.push({
        cardId:String(render.cardId||render._id),renderId:String(render._id),playerId,playerName:String(player.name||'球员'),teamId:cardTeamId,
        teamName:String(team?.name||team?.teamName||player.teamName||''),regionId:provinceId,regionName:provinceName||provinceId,tournamentId,
        tournamentName:String(tournament?.name||tournament?.title||scope.targetName||''),tournamentIds:[...new Set([...(tournamentsByPlayer.get(playerId)||[]),...(tournamentId?[tournamentId]:[])])],jerseyNumber:String(player.jerseyNumber||''),cardTypeId:tier,
        title:String(snapshot?.title||template?.published?.title||template?.draft?.title||`${tier}球员卡`),
        scopeType:scope.type,scopeName:SCOPE_NAMES[scope.type]||'全平台',scopeTargetId:scope.targetId||'',scopeTargetName:scope.targetName||'',
        templateId,publishedVersion,cardDataVersion:Number(render.cardDataVersion||0),libraryRevision:Number(render.libraryRevision||0),
        renderVersion:String(render.renderVersion||''),digest:String(render.digest||''),fileId:String(render.fileId),
        crop:grant?.crop||render.crop||player.playerCardCrop||{zoom:1,x:0,y:0},editRevision:Number(render.editRevision||0),
        generatedAt:render.generatedAt||null,status:String(render.status||'pending'),isCurrent:Boolean(isCurrent),isHistory:Boolean(render.isSnapshot),visualOnly:Boolean(render.visualOnly),gradeStatus:String(render.gradeStatus||''),
        canEdit:Boolean(template&&isCurrent&&!render.isSnapshot&&!render.visualOnly),source:render.visualOnly?'visual':grant?'preload':'base'
      })
    }
    for(const player of players){
      const playerId=String(player._id||''),fileId=String(player.playerCardFileId||'')
      if(!playerId||!fileId||renderedFileKeys.has(`${playerId}\u001f${fileId}`))continue
      const version=Number(player.playerCardVersion||0)
      const team=teamById.get(String(player.teamId||'')),provinceId=String(team?.provinceCode||team?.province||'')
      items.push({cardId:`base:${playerId}:${version}`,playerId,playerName:String(player.name||'球员'),teamId:String(player.teamId||''),
        teamName:String(team?.name||team?.teamName||player.teamName||''),regionId:provinceId,regionName:String(team?.provinceName||provinceId),tournamentId:'',tournamentName:'',tournamentIds:[...(tournamentsByPlayer.get(playerId)||[])],
        jerseyNumber:String(player.jerseyNumber||''),cardTypeId:String(player.playerCardBackgroundId||player.playerCardTier||''),
        title:'基础球员卡',scopeType:'platform',scopeName:'基础卡',scopeTargetId:'',scopeTargetName:'',templateId:String(player.playerCardTemplateId||''),
        publishedVersion:Number(player.playerCardTemplateVersion||0),cardDataVersion:version,libraryRevision:0,renderVersion:String(player.playerCardSchemaVersion||''),
        digest:'',fileId,generatedAt:player.playerCardUpdatedAt||null,status:'ready',isCurrent:true,canEdit:false,source:'legacy',scopeType:'base',scopeName:'基础卡'})
    }
    for(const grant of grants){
      const playerId=String(grant.playerId||''),fileId=String(grant.fileId||'')
      if(!playerId||!fileId||renderedFileKeys.has(`${playerId}\u001f${fileId}`))continue
      const player=playerById.get(playerId),template=templateById.get(String(grant.templateId||''))
      if(!player)continue
      const scope=preload.normalizePreload(grant.preload||template?.published?.preload||{type:'platform'})
      const cardTeamId=scope.type==='team'?String(scope.targetId||''):String(player.teamId||''),team=teamById.get(cardTeamId)
      const tournamentId=scope.type==='tournament'?String(scope.targetId||''):'',tournament=tournamentById.get(tournamentId)
      const provinceId=String(team?.provinceCode||team?.province||'')
      items.push({cardId:`library:${String(grant._id)}:${Number(grant.revision||0)}`,playerId,playerName:String(player.name||'球员'),
        teamId:cardTeamId,teamName:String(team?.name||team?.teamName||player.teamName||''),regionId:provinceId,regionName:String(team?.provinceName||provinceId),
        tournamentId,tournamentName:String(tournament?.name||tournament?.title||scope.targetName||''),tournamentIds:[...new Set([...(tournamentsByPlayer.get(playerId)||[]),...(tournamentId?[tournamentId]:[])])],jerseyNumber:String(player.jerseyNumber||''),cardTypeId:String(template?.tier||player.playerCardTier||''),
        title:String(template?.published?.title||template?.draft?.title||'专属球员卡'),scopeType:scope.type,scopeName:SCOPE_NAMES[scope.type]||'全平台',
        scopeTargetId:scope.targetId||'',scopeTargetName:scope.targetName||'',templateId:String(grant.templateId||''),publishedVersion:Number(grant.templateVersion||template?.publishedVersion||0),
        cardDataVersion:Number(player.playerCardVersion||0),libraryRevision:Number(grant.revision||0),renderVersion:suite.RENDER_VERSION,digest:'',fileId,
        generatedAt:grant.updatedAt||grant.grantedAt||null,status:'ready',isCurrent:true,isHistory:false,canEdit:false,source:'preload'})
    }
    const representedPlayers=new Set(items.map(row=>row.playerId))
    for(const player of players){
      const playerId=String(player._id||'')
      if(!playerId||representedPlayers.has(playerId))continue
      const teamId=String(player.teamId||''),team=teamById.get(teamId),provinceId=String(team?.provinceCode||team?.province||'')
      const portraitFileId=sourceTools.permanentFile(player.playerCardSourceFileId)||sourceTools.rosterSource(player)?.fileId||''
      const explicitTest=player.synthetic===true||player.isTest===true||Boolean(player.syntheticDatasetId||player.syntheticKey)||String(player.source||'').toLowerCase()==='synthetic'||
        team?.synthetic===true||team?.isTest===true||Boolean(team?.syntheticDatasetId||team?.syntheticKey)||String(team?.source||'').toLowerCase()==='synthetic'
      items.push({cardId:`unmade:${playerId}`,playerId,playerName:String(player.name||'球员'),teamId,
        teamName:String(team?.name||team?.teamName||player.teamName||''),regionId:provinceId,regionName:String(team?.provinceName||provinceId),
        tournamentId:'',tournamentName:'',tournamentIds:[...(tournamentsByPlayer.get(playerId)||[])],jerseyNumber:String(player.jerseyNumber||''),
        cardTypeId:String(player.playerCardBackgroundId||player.playerCardTier||''),title:explicitTest?'测试数据':'待制卡',scopeType:'unassigned',scopeName:explicitTest?'测试数据':'未制卡',
        scopeTargetId:'',scopeTargetName:'',templateId:'',publishedVersion:0,cardDataVersion:Number(player.playerCardVersion||0),
        libraryRevision:0,renderVersion:'',digest:'',fileId:'',portraitFileId,portraitStatus:portraitFileId?'available':player.recentPortraitId?'review':'missing',generatedAt:null,
        status:explicitTest?'excluded':'missing',isCurrent:false,isHistory:false,selectable:!explicitTest&&Boolean(portraitFileId||player.recentPortraitId),canEdit:false,source:explicitTest?'synthetic':'missing'})
    }
    const keyword=String(event.keyword||'').trim().toLocaleLowerCase()
    const tier=String(event.tier||'all'),scopeType=String(event.scopeType||'all'),versionFilter=String(event.versionFilter||'all')
    const regionId=String(event.regionId||'all'),teamId=String(event.teamId||'all'),tournamentId=String(event.tournamentId||'all'),cardStatus=String(event.cardStatus||'all')
    const optionsFrom=(key,labelKey)=>[...new Map(items.filter(row=>row[key]).map(row=>[String(row[key]),{id:String(row[key]),name:String(row[labelKey]||row[key])}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))
    const tournamentIds=new Set(items.flatMap(row=>row.tournamentIds||[]))
    const filters={regions:optionsFrom('regionId','regionName'),teams:optionsFrom('teamId','teamName'),tournaments:[...tournamentIds].map(id=>{const row=tournamentById.get(id);return {id,name:String(row?.name||row?.title||id)}}).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))}
    const cardedPlayers=new Set(items.filter(row=>row.status==='ready').map(row=>row.playerId)).size
    const missingPlayers=items.filter(row=>row.status==='missing').length
    const excludedPlayers=items.filter(row=>row.status==='excluded').length
    const noPhotoPlayers=items.filter(row=>row.status==='missing'&&row.portraitStatus==='missing').length
    const filtered=items.filter(row=>
      (tier==='all'||row.cardTypeId===tier)&&
      (scopeType==='all'||row.scopeType===scopeType)&&
      (versionFilter==='all'||(versionFilter==='current'?row.isCurrent:row.status==='ready'&&!row.isCurrent))&&
      (cardStatus==='all'||row.status===cardStatus)&&
      (regionId==='all'||row.regionId===regionId)&&
      (teamId==='all'||row.teamId===teamId)&&
      (tournamentId==='all'||(row.tournamentIds||[]).includes(tournamentId))&&
      (!keyword||[row.cardId,row.playerId,row.playerName,row.teamName,row.tournamentName,row.regionName,row.jerseyNumber,row.title,row.templateId].some(value=>String(value||'').toLocaleLowerCase().includes(keyword)))
    ).sort((a,b)=>timestamp(b.generatedAt)-timestamp(a.generatedAt)||b.cardId.localeCompare(a.cardId))
    if(event.action==='listPlayerCardCatalogTargets')return {success:true,targets:filtered.filter(row=>row.status==='missing'&&row.selectable).map(row=>({playerId:row.playerId,teamId:row.teamId,tournamentIds:row.tournamentIds||[]})),total:filtered.filter(row=>row.status==='missing'&&row.selectable).length,filters}
    const offset=Math.max(0,Math.min(100000,Number(event.offset)||0)),limit=Math.max(1,Math.min(PAGE_SIZE,Number(event.limit)||PAGE_SIZE))
    const page=filtered.slice(offset,offset+limit),urls=await signedUrls(page)
    return {success:true,cards:page.map(row=>({...row,cardUrl:urls.get(row.fileId)||'',portraitUrl:urls.get(row.portraitFileId)||''})),total:filtered.length,offset,limit,nextOffset:offset+page.length<filtered.length?offset+page.length:null,filters,coverage:{players:players.length,cardedPlayers,missingPlayers,excludedPlayers,noPhotoPlayers}}
  }
  async function get(event) {
    const auth=await owner(event)
    if(!auth.success)return auth
    const cardId=String(event.cardId||'')
    if(!cardId||cardId.length>256)return {success:false,code:'PLAYER_CARD_ID_INVALID',error:'成卡编号无效'}
    if(cardId.startsWith('base:')) {
      const match=cardId.match(/^base:([a-zA-Z0-9_-]{1,128}):(\d+)$/)
      if(!match)return {success:false,code:'PLAYER_CARD_ID_INVALID',error:'成卡编号无效'}
      const player=await suite.document(db,'players',match[1])
      if(!player||Number(player.playerCardVersion||0)!==Number(match[2])||!player.playerCardFileId)return {success:false,code:'PLAYER_CARD_NOT_FOUND',error:'成卡不存在或已更新'}
      const urls=await signedUrls([{fileId:String(player.playerCardFileId)}])
      return {success:true,card:{cardId,playerId:match[1],playerName:String(player.name||'球员'),cardUrl:urls.get(String(player.playerCardFileId))||'',fileId:String(player.playerCardFileId),source:'legacy',isCurrent:true}}
    }
    const libraryMatch=cardId.match(/^library:([a-f0-9]{64}):(\d+)$/)
    if(libraryMatch){
      const grant=await suite.document(db,'player_card_library',libraryMatch[1])
      if(!grant||Number(grant.revision||0)!==Number(libraryMatch[2])||!grant.fileId)return {success:false,code:'PLAYER_CARD_NOT_FOUND',error:'成卡已更新或不存在'}
      const player=await suite.document(db,'players',grant.playerId)
      if(!player)return {success:false,code:'PLAYER_CARD_NOT_FOUND',error:'球员资料不存在'}
      const urls=await signedUrls([{fileId:String(grant.fileId)}])
      return {success:true,card:{cardId,playerId:String(grant.playerId),playerName:String(player.name||'球员'),cardUrl:urls.get(String(grant.fileId))||'',fileId:String(grant.fileId),templateId:String(grant.templateId||''),source:'preload',status:'ready'}}
    }
    let render=await suite.document(db,suite.RENDERS,cardId)
    if(!render||String(render.cardId||render._id)!==cardId) {
      const result=await db.collection(suite.RENDERS).where({cardId}).limit(2).get()
      render=(result.data||[])[0]||null
    }
    if(!render||render.status!=='ready'||!render.fileId)return {success:false,code:'PLAYER_CARD_NOT_FOUND',error:'成卡不存在或已失效'}
    const [player]=await Promise.all([suite.document(db,'players',render.playerId)])
    if(!player)return {success:false,code:'PLAYER_CARD_NOT_FOUND',error:'球员资料不存在'}
    const urls=await signedUrls([{fileId:String(render.fileId)}])
    return {success:true,card:{cardId:String(render.cardId||render._id),renderId:String(render._id),playerId:String(render.playerId),playerName:String(player.name||'球员'),
      cardUrl:urls.get(String(render.fileId))||'',fileId:String(render.fileId),templateId:String(render.templateId||''),publishedVersion:Number(render.publishedVersion||0),
      cardDataVersion:Number(render.cardDataVersion||0),renderVersion:String(render.renderVersion||''),generatedAt:render.generatedAt||null,status:'ready'}}
  }
  async function editContext(event) {
    const cardId=String(event.cardId||'')
    let render=await suite.document(db,suite.RENDERS,cardId)
    if(!render||String(render.cardId||render._id)!==cardId){const found=await db.collection(suite.RENDERS).where({cardId}).limit(2).get();render=(found.data||[])[0]||null}
    if(!render||render.status!=='ready'||render.isSnapshot)return {error:'历史版本只读或成卡不存在',code:'PLAYER_CARD_VERSION_READONLY'}
    const renderId=suite.renderId(render.playerId,render.templateId,render.publishedVersion)
    if(String(render._id)!==renderId)return {error:'历史版本只读',code:'PLAYER_CARD_VERSION_READONLY'}
    const [player,snapshot]=await Promise.all([
      suite.document(db,'players',render.playerId),
      suite.document(db,suite.VERSIONS,suite.versionId(render.templateId,render.publishedVersion))
    ])
    if(!player||!snapshot)return {error:'球员或模板版本不存在',code:'PLAYER_CARD_NOT_FOUND'}
    if(Number(render.cardDataVersion||0)!==Number(player.playerCardVersion||0))return {error:'球员资料已更新，请刷新卡库',code:'PLAYER_CARD_CATALOG_CONFLICT'}
    const score=scoreForPlayer?await scoreForPlayer(String(player._id)):await createDataService(db).playerCardForAuthorizedPlayer(player._id)
    if(score?.status!=='ready')return {error:'球员卡等级尚未核定，暂不能编辑',code:'PLAYER_CARD_TIER_UNVERIFIED'}
    const scope=snapshot.preload?preload.normalizePreload(snapshot.preload):{type:'platform',targetId:'',targetName:''}
    const active=await suite.activeTemplate(db,render.cardTypeId,scope,render.templateId)
    if(!active||Number(active.version)!==Number(render.publishedVersion))return {error:'当前只允许编辑活动版本',code:'PLAYER_CARD_VERSION_READONLY'}
    const isPreload=Boolean(snapshot.preload),library=require('./playerCardLibrary.cjs')
    const grant=isPreload?await suite.document(db,'player_card_library',library.libraryId(player._id,render.templateId)):null
    if(isPreload&&(!grant||Number(grant.revision||0)!==Number(render.libraryRevision||0)))return {error:'球员卡已更新，请刷新后再编辑',code:'PLAYER_CARD_LIBRARY_CONFLICT'}
    const source=await require('./playerCardSource.cjs').resolveSource(db,player)
    const portraitFileId=grant?.portraitFileId&&!score.canReplacePhoto?grant.portraitFileId:(source?.fileId||'')
    if(!portraitFileId)return {error:'球员暂无可用头像',code:'PLAYER_CARD_PORTRAIT_REQUIRED'}
    return {cardId,renderId,render,player,snapshot,score,scope,grant,portraitFileId,crop:grant?.crop||render.crop||player.playerCardCrop||{zoom:1,x:0,y:0},isPreload}
  }
  async function preview(event) {
    const auth=await owner(event);if(!auth.success)return auth
    const context=await editContext(event)
    if(context.error)return {success:false,code:context.code,error:context.error}
    const crop=normalizeCrop(event.crop||context.crop)
    const result=await suite.renderPlayer(cloud,db,context.player,context.snapshot,context.score,{portraitFileId:context.portraitFileId,crop})
    const file=await cloud.uploadFile({cloudPath:`restricted/player-card-catalog-previews/${Date.now()}-${Math.random().toString(16).slice(2)}.png`,fileContent:result.png})
    const urls=await cloud.getTempFileURL({fileList:[file.fileID]}),imageUrl=(urls.fileList||[]).find(item=>item.fileID===file.fileID)?.tempFileURL||''
    if(!imageUrl)throw new Error('成卡预览暂不可用，请重试')
    return {success:true,imageUrl,cardId:context.cardId,editRevision:Number(context.render.editRevision||0),crop}
  }
  async function save(event) {
    const auth=await owner(event);if(!auth.success)return auth
    const context=await editContext(event)
    if(context.error)return {success:false,code:context.code,error:context.error}
    const expected=Number(event.expectedEditRevision||0)
    if(expected!==Number(context.render.editRevision||0))return {success:false,code:'PLAYER_CARD_CATALOG_CONFLICT',error:'成卡已更新，请刷新后再编辑'}
    const crop=normalizeCrop(event.crop||context.crop)
    const generated=await suite.generate(cloud,db,context.player,context.snapshot,context.score,{portraitFileId:context.portraitFileId,crop})
    const cardId=history.cardId(context.renderId,generated.digest),editRevision=expected+1
    try {
      await db.runTransaction(async tx=>{
        const current=await suite.document(tx,suite.RENDERS,context.renderId),player=await suite.document(tx,'players',context.player._id)
        if(!current||String(current.cardId||current._id)!==String(context.render.cardId||context.render._id)||Number(current.editRevision||0)!==expected||
          !player||Number(player.playerCardVersion||0)!==Number(context.player.playerCardVersion||0))throw Object.assign(new Error('成卡或球员资料已更新，请刷新后重试'),{code:'PLAYER_CARD_CATALOG_CONFLICT'})
        const stateKey=context.snapshot.preload?preload.stateId(context.render.cardTypeId,context.scope,context.render.templateId):String(context.render.cardTypeId)
        const state=await suite.document(tx,suite.STATES,stateKey)
        if(!state?.active||state.active.templateId!==context.render.templateId||Number(state.active.version)!==Number(context.render.publishedVersion))throw Object.assign(new Error('模板版本已更新，请重新加载'),{code:'PLAYER_CARD_TEMPLATE_CHANGED'})
        if(context.isPreload){
          const library=require('./playerCardLibrary.cjs'),libraryId=library.libraryId(context.player._id,context.render.templateId)
          const grant=await suite.document(tx,'player_card_library',libraryId)
          if(!grant||Number(grant.revision||0)!==Number(context.grant.revision||0))throw Object.assign(new Error('球员卡已更新，请刷新后重试'),{code:'PLAYER_CARD_LIBRARY_CONFLICT'})
          await tx.collection('player_card_library').doc(libraryId).update({data:{fileId:generated.fileId,crop,revision:Number(grant.revision||0)+1,updatedAt:db.serverDate()}})
        } else {
          if(String(player.playerCardFileId||'')!==String(context.render.fileId||''))throw Object.assign(new Error('基础卡已更新，请刷新后重试'),{code:'PLAYER_CARD_CATALOG_CONFLICT'})
          await tx.collection('players').doc(String(context.player._id)).update({data:{playerCardFileId:generated.fileId,playerCardCrop:db.command.set(crop),playerCardUpdatedAt:db.serverDate()}})
        }
        await history.archiveCurrentRender(tx,db,context.renderId,current)
        await tx.collection(suite.RENDERS).doc(context.renderId).update({data:{cardId,fileId:generated.fileId,digest:generated.digest,crop,editRevision,
          ...(context.isPreload?{libraryRevision:Number(context.grant.revision||0)+1}:{}),renderVersion:suite.RENDER_VERSION,status:'ready',generatedAt:db.serverDate()}})
        await tx.collection(suite.STATES).doc(stateKey).update({data:{mutation:Number(state.mutation||0)+1,updatedAt:db.serverDate()}})
      })
      return {success:true,cardId,renderId:context.renderId,editRevision}
    } catch(error) { await cloud.deleteFile({fileList:[generated.fileId]}).catch(()=>{});throw error }
  }
  return async event=>{
    try {
      const auth=await owner(event)
      if(!auth.success)return auth
      if(event.action==='listPlayerCardCatalog')return await list(event)
      if(event.action==='getPlayerCardCatalogCard')return await get(event)
      if(event.action==='previewPlayerCardCatalogCard')return await preview(event)
      if(event.action==='savePlayerCardCatalogCard')return await save(event)
      if(['listPlayerCardCatalogTemplates','startPlayerCardCatalogBatch','advancePlayerCardCatalogBatch','getPlayerCardCatalogBatchStatus','retryPlayerCardCatalogBatch'].includes(event.action))return await batch(event)
      return {success:false,code:'PLAYER_CARD_CATALOG_ACTION_INVALID',error:'未知成卡库操作'}
    } catch(error) {
      return {success:false,code:error.code||'PLAYER_CARD_CATALOG_ERROR',error:error.message||'成卡库读取失败，请重试'}
    }
  }
}

module.exports={createPlayerCardCatalogAdmin,PAGE_SIZE}
