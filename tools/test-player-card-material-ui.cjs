const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const {chromium}=require('C:/Users/15043/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const h=require('../tools/test-player-card-workflows.cjs'),{createPlayerCardWorkflows}=require('../cloudfunctions/webLoginApi/playerCardWorkflows.cjs')
let failMaterialOnce=true
const assets=new Map(),uploads=new Map(),apiErrors=[],pageErrors=[]
const root='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/'
const data=buffer=>'data:image/png;base64,'+buffer.toString('base64')
function dto(row){return {id:row._id,tier:row.tier,status:row.status,revision:row.revision,draftVersion:row.draftVersion,publishedVersion:row.publishedVersion,...row.draft,backgroundUrl:assets.get(row.draft.backgroundFileId)||'',maskUrl:assets.get(row.draft.maskFileId)||''}}
async function save(event){const row=h.table('player_card_templates').get(event.templateId);assert.equal(event.revision,row.revision);row.draft={...row.draft,layout:event.layout||row.draft.layout,photo:event.photo||row.draft.photo,badges:event.badges||row.draft.badges,backgroundFileId:event.backgroundFileId||row.draft.backgroundFileId,maskFileId:event.maskFileId||row.draft.maskFileId};row.revision++;row.draftVersion++;return {success:true,templateId:row._id,revision:row.revision,draftVersion:row.draftVersion}}
const workflow=createPlayerCardWorkflows({...h.factory,cloud:{...h.cloud,getTempFileURL:async({fileList})=>({fileList:fileList.map(fileID=>({fileID,tempFileURL:assets.get(fileID)||data(samples[0].buffer)}))})},save,itemOf:dto,urlsFor:async rows=>Object.fromEntries(rows.flatMap(row=>[row.draft.backgroundFileId,row.published?.backgroundFileId,row.draft.maskFileId].filter(Boolean)).map(id=>[id,assets.get(id)])),preview:async event=>({success:true,imageUrl:assets.get((await h.read(event.templateId)).draft.backgroundFileId)})})
h.table('teams').set('team-ui',{_id:'team-ui',name:'验收球队'});for(const id of ['uiplayer1','uiplayer2']){h.table('players').set(id,{_id:id,name:'验收球员'+id.slice(-1),teamId:'team-ui',photoFileId:root+'fixture/portrait.png',points:20,playerCardTier:'bronze'});h.grades.set(id,{status:'ready',tier:'bronze'})}
const samples=[];for(const [name,color]of [['铜卡背景.png',[180,110,50]],['银卡背景.png',[180,180,180]],['金卡背景.png',[230,190,60]]]){const png=new PNG({width:300,height:430});for(let i=0;i<png.data.length;i+=4){png.data[i]=color[0];png.data[i+1]=color[1];png.data[i+2]=color[2];png.data[i+3]=255}samples.push({name,mimeType:'image/png',buffer:PNG.sync.write(png)})}samples.push({name:'遮罩.png',mimeType:'image/png',buffer:fs.readFileSync('platform-admin-vue/public/images/player-card-layers/foreground-mask-source.png')})
;(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{const page=await browser.newPage({viewport:{width:1600,height:1050}});page.on('pageerror',e=>pageErrors.push(e.message));await page.addInitScript(()=>{window.liveMaterialUrls=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=file=>{const url=create(file);window.liveMaterialUrls.add(url);return url};URL.revokeObjectURL=url=>{window.liveMaterialUrls.delete(url);return revoke(url)}});await page.addInitScript(()=>{localStorage.setItem('platformAuthToken','isolated-workflow-ui');localStorage.setItem('platformSession',JSON.stringify({userId:'platform-owner',userName:'平台流程验收',user:{isPlatformOwner:true}}))});
await page.route('**/*tcloudbase.com/**',async route=>{try{const e=route.request().postDataJSON()||{},p=e.functionParams||{},name=e.functionName;let r
 if(name==='platformOwner')r={success:true,isPlatformOwner:true}
 else if(name==='manageTournamentCenterContent')r={success:true,data:{stats:{},organizers:[],teams:[],tournaments:[]}}
 else if(e.workflowAction==='materials'&&failMaterialOnce){failMaterialOnce=false;r={success:false,error:'验收模拟网络中断，请重试'}}
 else if(e.workflowAction)r=await workflow(e,{userId:'platform-owner'})
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
await page.getByRole('button',{name:'新建制卡',exact:true}).click();const dialog=page.locator('.el-dialog:visible');
await dialog.locator('.el-form-item').filter({has:page.getByText('名称',{exact:true})}).locator('input').fill('素材预览验收');await dialog.getByRole('button',{name:'创建项目',exact:true}).click();
await page.locator('input[type=file][multiple]').setInputFiles(samples);
await page.locator('.material-grid img').nth(2).waitFor();
assert.equal(await page.locator('.material-grid .pending').count(),3);
assert.equal(uploads.size,0,'selection only must not upload or claim saved');
for(const img of await page.locator('.material-grid img').all()){assert.ok((await img.getAttribute('src')).startsWith('blob:'));await img.evaluate(el=>el.decode())}
await page.locator('.mask-thumbnail').waitFor();assert.equal(await page.evaluate(()=>window.liveMaterialUrls.size),4);
const bronze=page.locator('.material-grid section').first(),silver=page.locator('.material-grid section').nth(1);
const oldBronze=await bronze.locator('img').getAttribute('src');
await bronze.locator('input[type=file]').first().setInputFiles({...samples[0],name:'铜卡新背景.png'});
await bronze.getByText('铜卡新背景.png · 待保存',{exact:true}).waitFor();
assert.notEqual(await bronze.locator('img').getAttribute('src'),oldBronze);assert.equal(await page.evaluate(()=>window.liveMaterialUrls.size),4,'replacing revokes the older blob');
await silver.locator('input[type=file]').first().setInputFiles({name:'无效图片.png',mimeType:'image/png',buffer:Buffer.from('invalid')});
await page.getByText('文件不是PNG',{exact:true}).waitFor();assert.equal(await silver.locator('img').getAttribute('src').then(x=>x.startsWith('blob:')),true,'invalid replacement retains last valid image');
await page.getByRole('button',{name:'返回列表',exact:true}).click();await page.getByRole('button',{name:'继续编辑',exact:true}).click();
assert.equal(await page.locator('.material-grid .pending').count(),3);
await page.getByRole('button',{name:'保存素材',exact:true}).click();
await page.locator('.el-alert__title').filter({hasText:'未保存的选择已保留'}).waitFor();
assert.equal(await page.locator('.material-grid .pending').count(),3);assert.equal(await page.evaluate(()=>window.liveMaterialUrls.size),4,'failure keeps pending previews');
await page.getByRole('button',{name:'保存素材',exact:true}).click();
await page.getByText('背景已保存',{exact:true}).nth(2).waitFor();
assert.equal(await page.locator('.material-grid .pending').count(),0);assert.equal(await page.evaluate(()=>window.liveMaterialUrls.size),0,'saved previews released');
for(const img of await page.locator('.material-grid img').all())assert.ok((await img.getAttribute('src')).startsWith('data:'));
assert.equal(h.table('player_card_template_states').size,0,'saving materials must not publish');
await page.screenshot({path:'E:/Documents/sxf-football/work/card-materials-saved.png'});
await page.getByRole('button',{name:'返回列表',exact:true}).click();await page.getByRole('button',{name:'继续制作',exact:true}).click();
await page.getByRole('button',{name:'上一步',exact:true}).click();await page.getByText('背景已保存',{exact:true}).nth(2).waitFor();
assert.equal(await page.locator('.material-grid img').count(),3,'server saved images survive reopening');
await silver.locator('input[type=file]').first().setInputFiles(samples[1]);await silver.locator('.pending').waitFor();
await page.getByRole('button',{name:'返回列表',exact:true}).click();await page.getByRole('button',{name:'保存并返回',exact:true}).click();await page.locator('.project-tile').waitFor();assert.equal(await page.evaluate(()=>window.liveMaterialUrls.size),0);
assert.deepEqual(apiErrors,[]);assert.deepEqual(pageErrors,[]);
console.log('PASS: selected PNGs preview instantly without upload, replacement revokes old URL, invalid file retains image, unsaved leave is guarded, network failure preserves selection, retry saves all layers and survives reopening, no active template changes; isolated API only')
}catch(e){console.error('API errors:',apiErrors,'Page errors:',pageErrors);throw e}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1})
