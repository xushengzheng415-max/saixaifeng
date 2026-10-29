'use strict'
const assert=require('node:assert/strict'),Module=require('node:module')
const target=require.resolve('../cloudfunctions/webLoginApi/serviceRegistrationMedia.cjs')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')
const rows={service_entry_sessions:{s:{active:true,userId:'user'}},players:{p:{_id:'p',teamId:'t',linkedUserId:'user',playerCardSourceFileId:'cloud://fixture/cutout.png',playerCardVersion:0}},player_card_template_states:{bronze:{active:{templateId:'template',version:3}}}}
let baidu=0,rendered=0,shouldFail=false,lastRender
const db={command:{set:v=>v},collection:n=>({doc:k=>({async update({data}){Object.assign(rows[n][k],data)}})}),runTransaction:fn=>fn(db),serverDate:()=>new Date()}
const suite={STATES:'player_card_template_states',document:async(_,c,k)=>rows[c]?.[k],activeTemplate:async()=>({templateId:'template',version:3}),async renderPlayer(...args){rendered++;lastRender=args;return {png}}}
const load=Module._load
Module._load=function(name,parent,...rest){
  if(parent?.filename===target){
    if(name==='./playerCardSuite.cjs')return suite
    if(name==='./registrationCardContext.cjs')return {base:async()=>({template:await suite.activeTemplate(),stateId:'bronze',tournamentId:''}),resolve:async()=>{throw Error('登记链路必须使用平台基础等级卡，不能套用赛事预装模板')}}
    if(name==='./data-center/service.cjs')return {createDataService:()=>({playerCardForAuthorizedPlayer:async()=>({status:'ready',tier:'bronze'})})}
    if(name==='./playerCardRender.cjs')return {isTransparentPng:b=>b.equals(png)}
    if(name==='@resvg/resvg-js')return {Resvg:class {constructor(svg){assert.ok(svg.includes('width="800"'));assert.ok(svg.includes('xMidYMid meet'))}render(){return {asPng:()=>png}}}}
    if(name==='./playerCardSource.cjs')return {resolveSource:async(_,p)=>({fileId:p.playerCardSourceFileId,type:'standard_portrait'})}
    if(name==='./playerCards.cjs')return {normalizeCrop:v=>{if(v.zoom<1||v.zoom>4)throw new Error('invalid crop');return v}}
  }
  return load.call(this,name,parent,...rest)
}
const media=require(target)
const cloud={async uploadFile(){return {fileID:'cloud://fixture/new.png'}},async downloadFile(){return {fileContent:png}},async callFunction({name,data}){assert.equal(name,'baiduRemoveBg');assert.equal(data.action,'removeBackground');baidu++;return {result:shouldFail?{success:false}:{success:true,data:png.toString('base64')}}}}
async function main(){
  const loaded={session:{_id:'s',userId:'user',phoneVerified:true,playerRegistrationChoice:{mode:'claim',playerId:'p'}},gate:{_id:'g',purpose:'player_invite_entry',teamId:'t'}}
  const uploaded=await media.upload(cloud,db,loaded,{base64Data:'data:image/png;base64,'+png.toString('base64')})
  assert.equal(baidu,1);assert.equal(uploaded.processingStatus,'ready');assert.equal(rows.service_entry_sessions.s.playerRegistrationPortraits[0].provider,'baiduRemoveBg')
  shouldFail=true
  await assert.rejects(()=>media.upload(cloud,db,loaded,{base64Data:'data:image/png;base64,'+png.toString('base64')}),e=>e.code==='PORTRAIT_PROCESSING_FAILED')
  assert.equal(rows.service_entry_sessions.s.playerRegistrationPortraits.length,1,'failure must not mark original as processed')
  await media.upload(cloud,db,loaded,{keepExisting:true});assert.equal(baidu,2,'already transparent existing source stays unchanged')
  assert.equal(rows.service_entry_sessions.s.playerRegistrationPortraits[1].fileId,'cloud://fixture/cutout.png')
  await assert.rejects(()=>media.card(cloud,db,loaded,{}),e=>e.code==='PLAYER_CARD_AUTH_REQUIRED')
  loaded.session.registeredPlayerId='p'
  const preview=await media.card(cloud,db,loaded,{crop:{zoom:1.2,x:.1,y:-.1}})
  assert.equal(rendered,1);assert.equal(lastRender[3].templateId,'template');assert.equal(lastRender[4].tier,'bronze')
  assert.equal(lastRender[5].portraitFileId,'cloud://fixture/cutout.png')
  await assert.rejects(()=>media.card(cloud,db,loaded,{save:true,crop:preview.crop,expectedVersion:0,expectedTemplateId:'stale',expectedTemplateVersion:2}),e=>e.code==='PLAYER_CARD_TEMPLATE_CHANGED')
  await media.card(cloud,db,loaded,{save:true,crop:preview.crop,expectedVersion:0,expectedTemplateId:'template',expectedTemplateVersion:3})
  assert.equal(rows.players.p.playerCardVersion,1);assert.equal(rows.players.p.playerCardCrop.zoom,1.2)
  rows.players.p.linkedUserId='other'
  await assert.rejects(()=>media.card(cloud,db,loaded,{}),e=>e.code==='PLAYER_CARD_FORBIDDEN')
  console.log('PASS service portrait/card: Baidu segmentation, failure recovery, existing cutout, current owner, published template, version check and portrait-only crop')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Module._load=load})
