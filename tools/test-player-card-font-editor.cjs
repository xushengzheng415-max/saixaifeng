const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const {chromium}=require('./lib/load-playwright.cjs')
const h=require('../tools/test-player-card-workflows.cjs'),{createPlayerCardWorkflows}=require('../cloudfunctions/webLoginApi/playerCardWorkflows.cjs')
const workflowCalls=[]
const assets=new Map(),uploads=new Map(),apiErrors=[],pageErrors=[]
const root='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/'
const data=buffer=>'data:image/png;base64,'+buffer.toString('base64')
function dto(row){return {id:row._id,tier:row.tier,status:row.status,revision:row.revision,draftVersion:row.draftVersion,publishedVersion:row.publishedVersion,...row.draft,backgroundUrl:assets.get(row.draft.backgroundFileId)||'',maskUrl:assets.get(row.draft.maskFileId)||''}}
async function save(event){const row=h.table('player_card_templates').get(event.templateId);assert.equal(event.revision,row.revision);row.draft={...row.draft,layout:event.layout||row.draft.layout,photo:event.photo||row.draft.photo,badges:event.badges||row.draft.badges,backgroundFileId:event.backgroundFileId||row.draft.backgroundFileId,maskFileId:event.maskFileId||row.draft.maskFileId};row.revision++;row.draftVersion++;return {success:true,templateId:row._id,revision:row.revision,draftVersion:row.draftVersion}}
const workflow=createPlayerCardWorkflows({...h.factory,cloud:{...h.cloud,getTempFileURL:async({fileList})=>({fileList:fileList.map(fileID=>({fileID,tempFileURL:assets.get(fileID)||data(samples[0].buffer)}))})},save,itemOf:dto,urlsFor:async rows=>Object.fromEntries(rows.flatMap(row=>[row.draft.backgroundFileId,row.published?.backgroundFileId,row.draft.maskFileId].filter(Boolean)).map(id=>[id,assets.get(id)])),preview:async event=>({success:true,imageUrl:assets.get((await h.read(event.templateId)).draft.backgroundFileId)})})
h.table('teams').set('team-ui',{_id:'team-ui',name:'验收球队'});for(const id of ['uiplayer1','uiplayer2']){h.table('players').set(id,{_id:id,name:'验收球员'+id.slice(-1),teamId:'team-ui',photoFileId:root+'fixture/portrait.png',points:20,playerCardTier:'bronze'});h.grades.set(id,{status:'ready',tier:'bronze'})}
const samples=[];for(const [name,color]of [['铜卡背景.png',[180,110,50]],['银卡背景.png',[180,180,180]],['金卡背景.png',[230,190,60]]]){const png=new PNG({width:300,height:430});for(let i=0;i<png.data.length;i+=4){png.data[i]=color[0];png.data[i+1]=color[1];png.data[i+2]=color[2];png.data[i+3]=255}samples.push({name,mimeType:'image/png',buffer:PNG.sync.write(png)})}samples.push({name:'遮罩.png',mimeType:'image/png',buffer:fs.readFileSync('platform-admin-vue/public/images/player-card-layers/foreground-mask-source.png')})
;(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{const page=await browser.newPage({viewport:{width:1600,height:1050}});page.on('pageerror',e=>pageErrors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('platformAuthToken','isolated-workflow-ui');localStorage.setItem('platformSession',JSON.stringify({userId:'platform-owner',userName:'平台流程验收',user:{isPlatformOwner:true}}))});
await page.route('**/*tcloudbase.com/**',async route=>{try{const e=route.request().postDataJSON()||{},p=e.functionParams||{},name=e.functionName;let r
 if(name==='platformOwner')r={success:true,isPlatformOwner:true}
 else if(name==='manageTournamentCenterContent')r={success:true,data:{stats:{},organizers:[],teams:[],tournaments:[]}}
 else if(e.workflowAction){workflowCalls.push(e.workflowAction);r=await workflow(e,{userId:'platform-owner'})}
 else if(e.action==='getPlayerCardTemplate')r={success:true,template:dto(await h.read(e.templateId))}
 else if(e.action==='savePlayerCardTemplate')r=await save(e)
 else if(e.action==='listPlayerCardPreloadTargets')r={success:true,targets:[{id:'team-ui',name:'验收球队'}],nextCursor:''}
 else if(e.action==='getPlayerCardTemplatePublishStatus')r={success:true,status:'idle'}
 else if(name==='uploadFile'){
   if(p.action==='startChunk'){const id='upload-'+uploads.size;uploads.set(id,{...p,chunks:[]});r={success:true,uploadId:id}}
   else if(p.action==='uploadChunk'){uploads.get(p.uploadId).chunks[p.chunkIndex]=Buffer.from(p.data,'base64');r={success:true}}
   else if(p.action==='finishChunk'){const u=uploads.get(p.uploadId),bytes=Buffer.concat(u.chunks),fileID=root+u.folder+'/'+u.fileName;assert.equal(PNG.sync.read(bytes).width,300);assets.set(fileID,data(bytes));r={success:true,fileID}}
   else if(p.action==='getTempFileURL')r={success:true,url:assets.get(p.fileID)||''}
 }
 if(!r)throw Error('Unhandled '+JSON.stringify({action:e.action,name,sub:p.action}));await route.fulfill({json:r})
}catch(error){apiErrors.push(error.message);await route.fulfill({json:{success:false,error:error.message}})}})
await page.goto('http://127.0.0.1:5176/#/tournament-center-admin?section=playerCards');
await page.getByRole('button',{name:'新建制卡',exact:true}).click();const dialog=page.locator('.el-dialog:visible');await dialog.locator('.el-form-item').filter({has:page.getByText('名称',{exact:true})}).locator('input').fill('三档独立排版验收');await dialog.getByRole('button',{name:'创建项目',exact:true}).click();await page.locator('input[type=file][multiple]').setInputFiles(samples);await page.getByRole('button',{name:'下一步',exact:true}).click();
await page.getByRole('button',{name:'保存当前卡',exact:true}).waitFor();
const set=[...h.table('player_card_sets').values()].find(x=>x.recordType==='set'),row=key=>h.table('player_card_templates').get(set.members[key]);
await page.locator('.embedded .preview-state').filter({hasText:'拖动预览文字可调整位置'}).waitFor();
const fonts=require('../cloudfunctions/webLoginApi/player-card-text-styles.json').fonts;
const fontErrors=[];page.on('console',msg=>{if(/OTS parsing|Failed to decode downloaded font/.test(msg.text()))fontErrors.push(msg.text())});
// Load the actual binaries through browser font decoding, including legacy GBK
// compatibility fonts. System fallbacks cannot satisfy this assertion.
const loads=await page.evaluate(async fonts=>Promise.all(fonts.flatMap(f=>f.files.map(async file=>{
  const face=new FontFace(f.family,'url(/fonts/player-card/'+file+')');await face.load();document.fonts.add(face);return face.status;
}))),fonts);
assert.ok(loads.every(x=>x==='loaded'));
await page.getByRole('button',{name:'铜色渐变',exact:true}).click();
assert.equal(await page.getByRole('switch',{name:'文字描边',exact:true}).getAttribute('aria-checked'),'true');
const select=page.getByRole('combobox',{name:'文字字体',exact:true});
await select.click();await page.getByRole('option',{name:/微软简综艺/}).click();
await page.getByRole('button',{name:'铜色渐变',exact:true}).click();
await page.getByRole('button',{name:'白色描边',exact:true}).click();
await page.getByRole('spinbutton',{name:'描边宽度',exact:true}).fill('2');
await page.getByRole('spinbutton',{name:'描边宽度',exact:true}).press('Tab');
await page.getByRole('button',{name:'保存当前卡',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('.studio-project > .el-loading-mask'));
let style=row('bronze').draft.layout.name;
assert.equal(style.font,'zongyi');assert.equal(style.fillMode,'gradient');
assert.deepEqual(style.gradient,{start:'#ffe0b5',middle:'#cd7f46',end:'#703718',middleEnabled:true,angle:90});
assert.equal(style.stroke.width,2);assert.equal(style.stroke.color,'#ffffff');
async function switchTier(key,label){
  const response=page.waitForResponse(r=>{try{const e=r.request().postDataJSON();return e?.action==='getPlayerCardTemplate'&&e.templateId===set.members[key]}catch{return false}});
  await page.locator('.variant-tools').getByText(label,{exact:true}).click();await response;
  await page.locator('.embedded .preview-state').filter({hasText:'拖动预览文字可调整位置'}).waitFor();
}
await switchTier('silver','银卡');
await switchTier('bronze','铜卡');
await page.locator('.embedded .preview-state').filter({hasText:'拖动预览文字可调整位置'}).waitFor();
await page.locator('.embedded .el-select__selected-item').filter({hasText:'微软简综艺'}).waitFor();
assert.equal(await page.getByRole('spinbutton',{name:'描边宽度',exact:true}).inputValue(),'2');
await page.locator('.stroke-toggle .el-switch__core').click();
await page.getByRole('button',{name:'保存当前卡',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('.studio-project > .el-loading-mask'));
assert.equal(row('bronze').draft.layout.name.stroke.width,0);
await page.getByRole('button',{name:'金色描边',exact:true}).click();
await select.click();await page.getByRole('option',{name:/学院球衣/}).click();
await page.getByRole('button',{name:'保存当前卡',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('.studio-project > .el-loading-mask'));
assert.equal(row('bronze').draft.layout.name.font,'graduate');
assert.deepEqual(apiErrors,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(fontErrors,[]);
assert.equal(h.table('player_card_template_states').size,0);
fs.mkdirSync('output/player-card-fonts-20261028',{recursive:true});
await page.screenshot({path:'output/player-card-fonts-20261028/editor-bronze-stroke.png',fullPage:true});
console.log('PASS: all font binaries decode in browser; Chinese and jersey selection; bronze gradient, stroke toggle/color/width survive save and tier reload; no activation or production data writes');
}catch(e){console.error('API errors:',apiErrors,'Page errors:',pageErrors);throw e}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1})
