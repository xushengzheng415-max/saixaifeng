const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const {chromium}=require('C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
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
const initial={silver:structuredClone(row('silver')),gold:structuredClone(row('gold'))};
const waitReady=()=>page.locator('.embedded .preview-state').filter({hasText:'拖动预览文字可调整位置'}).waitFor();
const color=page.locator('.embedded .text-controls input[type=color]').first();
async function setColor(value){await color.waitFor();await color.evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))},value);await waitReady()}
async function changeTier(key,label){const response=page.waitForResponse(r=>{try{const e=r.request().postDataJSON();return e?.action==='getPlayerCardTemplate'&&e.templateId===set.members[key]}catch{return false}});await page.locator('.variant-tools').getByText(label,{exact:true}).click();await response;await waitReady()}
await waitReady();assert.equal(await page.getByText('保存时同步三档排版',{exact:true}).count(),0);
await setColor('#b05a20');await page.getByRole('button',{name:'保存当前卡',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('.studio-project > .el-loading-mask'));
assert.equal(row('bronze').draft.layout.name.color,'#b05a20');assert.deepEqual(row('silver'),initial.silver);assert.deepEqual(row('gold'),initial.gold);
await changeTier('silver','银卡');await setColor('#c0c0c0');await changeTier('gold','金卡');
assert.equal(row('silver').draft.layout.name.color,'#c0c0c0','switch saves only outgoing silver');assert.equal(row('bronze').draft.layout.name.color,'#b05a20');assert.deepEqual(row('gold'),initial.gold);
await setColor('#e6b800');await page.getByRole('button',{name:'预览整套',exact:true}).click();await page.locator('.review-styles img').nth(2).waitFor();
assert.deepEqual(['bronze','silver','gold'].map(key=>row(key).draft.layout.name.color),['#b05a20','#c0c0c0','#e6b800']);assert.equal(workflowCalls.filter(x=>x==='copyLayout').length,0,'save, switch and preview never copy layout');
await page.getByRole('button',{name:'返回修改',exact:true}).click();await waitReady();
const beforeCancel=JSON.stringify(['bronze','silver','gold'].map(row));await page.getByRole('button',{name:'同步排版',exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal(JSON.stringify(['bronze','silver','gold'].map(row)),beforeCancel,'cancel has no writes');
const assetsBefore=['bronze','silver','gold'].map(key=>({background:row(key).draft.backgroundFileId,mask:row(key).draft.maskFileId}));
await page.getByRole('button',{name:'同步排版',exact:true}).click();await page.getByRole('button',{name:'确认同步',exact:true}).click();
await page.getByText('已同步到铜卡、银卡',{exact:true}).waitFor();assert.deepEqual(['bronze','silver','gold'].map(key=>row(key).draft.layout.name.color),['#e6b800','#e6b800','#e6b800']);assert.deepEqual(['bronze','silver','gold'].map(key=>({background:row(key).draft.backgroundFileId,mask:row(key).draft.maskFileId})),assetsBefore);
assert.equal(workflowCalls.filter(x=>x==='copyLayout').length,1,'copy only on explicit confirmation');assert.equal(h.table('player_card_template_states').size,0,'layout editing does not publish');assert.deepEqual(apiErrors,[]);assert.deepEqual(pageErrors,[]);
console.log('PASS: copper saves independently, silver auto-save on switching stays isolated, full-suite preview preserves three colors; cancelling copy writes nothing, explicit confirmed copy changes layout only and preserves backgrounds/masks; no production data writes')
}catch(e){console.error('API errors:',apiErrors,'Page errors:',pageErrors);throw e}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1})
