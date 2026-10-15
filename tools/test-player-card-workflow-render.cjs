const assert=require('node:assert/strict'),fs=require('node:fs')
const {PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const {createPlayerCardTemplates}=require('../cloudfunctions/webLoginApi/playerCardTemplates.cjs')
const {db}=require('./test-player-card-workflows.cjs')
const files=new Map(),prefix='cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/'
const cloud={database:()=>db,async uploadFile({cloudPath,fileContent}){const fileID=prefix+cloudPath;files.set(fileID,Buffer.from(fileContent));return {fileID}},async downloadFile({fileID}){assert(files.has(fileID));return {fileContent:files.get(fileID)}},async deleteFile(){},async getTempFileURL({fileList}){return {fileList:fileList.map(fileID=>({fileID,tempFileURL:files.has(fileID)?'data:image/png;base64,'+files.get(fileID).toString('base64'):''}))}}}
const handle=createPlayerCardTemplates({cloud,authenticateWebSession:async()=>({success:true,principalType:'platform_owner',userId:'test-platform',user:{isPlatformOwner:true}})})
async function call(workflowAction,data={}){const response=await handle({action:'savePlayerCardTemplate',workflowAction,...data});assert.equal(response.success,true,response.error);return response}
;(async()=>{
 const set=(await call('create',{kind:'progression',title:'原生绘制验收',preload:{type:'platform'}})).set
 const encode=name=>'data:image/png;base64,'+fs.readFileSync('platform-admin-vue/public/images/player-card-layers/'+name).toString('base64')
 await call('materials',{setId:set._id,variants:['bronze','silver','gold'].map(key=>({key,revision:1,backgroundData:encode(key+'-background.png'),maskData:encode('foreground-mask-source.png')}))})
 const review=await call('review',{setId:set._id})
 assert.equal(review.cards.length,3)
 for(const card of review.cards){const png=PNG.sync.read(Buffer.from(card.imageUrl.split(',')[1],'base64'));assert.equal(png.width,900);assert.equal(png.height,1290)}
 await call('publish',{setId:set._id,proof:review.proof})
 for(const tier of ['bronze','silver','gold']){const active=await handle({action:'getActivePlayerCardTemplate',tier});assert.equal(active.status,'ready');assert.equal(active.template.id,set.members[tier].id)}
 console.log('PASS: actual authenticated template handler validates/uploads all PNGs, native renderer produces 3 complete previews, one publish activates all 3 tiers; storage and database isolated')
})().catch(error=>{console.error(error);process.exitCode=1})
