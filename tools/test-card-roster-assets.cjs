const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const root=path.resolve('cloudfunctions/webLoginApi'),preload=require(root+'/playerCardPreload.cjs')
async function main(){
const rows=[{_id:'r1',teamId:'team',divisionId:'d1',status:'approved',version:1,playerIds:['exists','missing']},{_id:'r2',teamId:'team',divisionId:'d2',status:'approved',version:1,playerIds:['exists2']}]
let fail=false;const rosterDb={command:{gt:x=>x},collection:name=>({where:()=>({orderBy:()=>({limit:()=>({get:async()=>({data:rows})})})}),doc:id=>({get:async()=>{if(fail)throw Error('database timeout');if(id==='missing')throw Error('document.get:fail document does not exist');return {data:{_id:id}}}})})}
const result=await preload.playersForScope(rosterDb,{type:'tournament',targetId:'event'});assert.equal(result.players.length,2);assert.equal(result.missingPlayers[0].playerId,'missing');assert.equal(result.missingPlayers[0].rosterSnapshotIds[0],'r1');fail=true;await assert.rejects(()=>preload.playersForScope(rosterDb,{type:'tournament',targetId:'event'}),/timeout/)
const id='a'.repeat(32),background='cloud://env/player-card-templates/'+id+'/v1/background.png',mask='cloud://env/player-card-templates/'+id+'/v1/mask.png'
let row={_id:id,tier:'bronze',revision:1,draftVersion:1,publishedVersion:0,draft:{title:'原卡',backgroundFileId:background,maskFileId:mask,preload:{type:'platform'}}},uploads=0
const db={command:{set:x=>x},serverDate:()=>new Date(),runTransaction:async fn=>fn(db),collection:()=>({doc:()=>({get:async()=>({data:row}),update:async({data})=>Object.assign(row,data)})})}
const suite={asset:async()=>{throw Error('Existing assets must not be reuploaded during font save')}}
const module={exports:{}};function fakeRequire(name){if(name==='pngjs')return {PNG:{}};if(name==='./playerCardRender.cjs')return {renderCard:()=>{}};if(name==='./playerCardSuite.cjs')return suite;if(name==='./playerCardPublish.cjs')return {createPlayerCardPublish:()=>({})};if(name==='./playerCardLayoutPresets.cjs')return {createPlayerCardLayoutPresets:()=>({})};if(name.startsWith('./'))return require(path.join(root,name));return require(name)}
vm.runInNewContext(fs.readFileSync(root+'/playerCardTemplates.cjs','utf8'),{require:fakeRequire,module,console,Buffer})
const call=module.exports.createPlayerCardTemplates({cloud:{database:()=>db,uploadFile:async()=>{uploads++;throw Error('Unexpected upload')}},authenticateWebSession:async()=>({success:true,principalType:'platform_owner',user:{isPlatformOwner:true},userId:'platform-owner'})})
const saved=await call({action:'savePlayerCardTemplate',templateId:id,revision:1,title:'改字体',tier:'bronze',backgroundFileId:background,maskFileId:mask,layout:{name:{x:150,y:310,size:34,color:'#ff8800',weight:900}}});assert.equal(saved.success,true,JSON.stringify(saved));assert.equal(row.draft.backgroundFileId,background);assert.equal(row.draft.maskFileId,mask);assert.equal(row.draft.layout.name.size,34);assert.equal(uploads,0)
const denied=await call({action:'savePlayerCardTemplate',templateId:id,revision:2,title:'错误引用',tier:'bronze',backgroundFileId:'cloud://env/player-card-templates/other/v1/background.png',maskFileId:mask});assert.equal(denied.code,'CARD_TEMPLATE_ASSET_INVALID')
console.log('PASS: missing roster IDs reported, real read failures propagated, division rosters retained, typography saves reuse authorized assets, foreign assets rejected')
}
main().catch(e=>{console.error(e);process.exitCode=1})
