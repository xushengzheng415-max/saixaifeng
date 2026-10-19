'use strict'
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),base=path.join(root,'miniprogram/pages/team/player-detail/player-detail'),tick=()=>new Promise(setImmediate)
let definition,user={_id:'account-a'},space='team:one',cardResult,cardPending,imagePending,imageResult,imageCalls=0,detailPending,calls=0,reads=0,preview
const wx={getStorageSync:()=>user,setNavigationBarTitle(){},previewImage:p=>{preview=p},cloud:{callFunction(){calls++;return detailPending||Promise.resolve({result:{success:true,player:{id:'p',name:'球员甲',photoUrl:'portrait',jerseyNumber:10},team:{id:'t'},stats:{appearances:0}}})}}}
vm.runInNewContext(fs.readFileSync(base+'.js','utf8'),{Page:d=>{definition=d},require:id=>id.endsWith('/workspace')?{isVisualQaEnabled:()=>false,readContext:()=>({currentWorkspace:{id:space}})}:id.endsWith('/player-points')?{methods:{},data:{}}:{read:(id,team)=>{assert.equal(id,'p');assert.equal(team,'t');reads++;return cardPending||Promise.resolve(cardResult)},readImage:(id,team)=>{assert.equal(id,'p');assert.equal(team,'t');imageCalls++;return imagePending||Promise.resolve(imageResult)}},wx,Promise,setTimeout,clearTimeout,Date,Number})
function page(){return {...definition,data:structuredClone(definition.data),setData(p){Object.assign(this.data,p)}}}
async function run(){
 let ui=page();cardResult={status:'ready',cardScene:{protocolVersion:'player-card-dynamic/1',templateId:'active'},tier:'silver'}
 ui.onLoad({id:'p',teamId:'t'});ui.onShow();await tick();await tick();assert.equal(calls,1);assert.equal(reads,1);assert.equal(ui.data.hasDynamicCard,true);assert.equal(ui.data.cardScene.templateId,'active');assert.equal(ui.data.stats.appearances,0);assert.equal(ui.data.stats.goals,'—');assert.equal(ui.data.cardScore.level,'待核定','Card appearance cannot assign score tier')
 cardResult={status:'ready',cardUrl:'https://example.invalid/whole.png'};await ui.loadPlayerCard();assert.equal(ui.data.hasStaticCard,true);assert.equal(ui.data.cardScene,null);ui.previewCard();assert.equal(preview.current,cardResult.cardUrl)
 ui.cardImageFailed();assert.equal(ui.data.cardCanRetry,true);assert.equal(ui.data.hasFallbackPhoto,true);assert.equal(ui.data.hasStaticCard,false)
 cardResult={status:'unavailable'};await ui.loadPlayerCard();assert.equal(ui.data.cardStateText,'暂无球员卡');assert.equal(ui.data.cardCanRetry,false);assert.equal(ui.data.hasFallbackPhoto,true)
 cardResult={status:'pending'};await ui.loadPlayerCard();assert.equal(ui.data.cardStateText,'成卡更新中');assert.equal(ui.data.cardCanRetry,true)
 cardResult={status:'forbidden',cardScene:{private:true},cardUrl:'https://example.invalid/secret'};await ui.loadPlayerCard();assert.equal(ui.data.hasFallbackPhoto,false);assert.equal(ui.data.hasDynamicCard,false);assert.equal(ui.data.cardUrl,'');assert.equal(ui.data.cardCanRetry,false)
 cardResult={status:'failed'};await ui.loadPlayerCard();assert.equal(ui.data.loading,false);assert.equal(ui.data.errorText,'');assert.equal(ui.data.cardCanRetry,true)
 cardResult={status:'ready',cardScene:{templateId:'new'}};await ui.loadPlayerCard();assert.equal(ui.data.cardScene.templateId,'new');assert.equal(ui.data.cardCanRetry,false)
 imageResult={status:'ready',cardUrl:'https://example.invalid/current-whole.png'};await ui.dynamicCardFailed();assert.equal(imageCalls,1);assert.equal(ui.data.hasDynamicCard,false);assert.equal(ui.data.hasStaticCard,true);assert.equal(ui.data.cardUrl,imageResult.cardUrl);await ui.dynamicCardFailed();assert.equal(imageCalls,1,'No loop after fallback')
 await ui.loadPlayerCard();imageResult={status:'forbidden'};await ui.dynamicCardFailed();assert.equal(ui.data.hasFallbackPhoto,false);assert.equal(ui.data.cardUrl,'');assert.equal(ui.data.cardCanRetry,false)
 await ui.loadPlayerCard();let finishImage;imagePending=new Promise(r=>{finishImage=r});const imageRequest=ui.dynamicCardFailed(),imagePrior=imageCalls;ui.dynamicCardFailed();ui.loadPlayerCard();assert.equal(imageCalls,imagePrior);ui.onHide();finishImage({status:'ready',cardUrl:'https://example.invalid/late'});await imageRequest;assert.equal(ui.data.cardUrl,'');imagePending=null
 let release;cardPending=new Promise(r=>{release=r});let request=ui.loadPlayerCard(),prior=reads;ui.loadPlayerCard();assert.equal(reads,prior);ui.onHide();release({status:'ready',cardScene:{templateId:'stale'}});await request;assert.equal(ui.data.cardScene,null);cardPending=null
 for(const changed of ['account','workspace']){cardPending=new Promise(r=>{release=r});request=ui.loadPlayerCard();if(changed==='account')user={_id:'other'};else space='team:other';release({status:'ready',cardScene:{private:true}});await request;assert.equal(ui.data.cardScene,null);cardPending=null}
 ui=page();ui.data.playerId='p';ui.data.teamId='t';detailPending=new Promise(r=>{release=r});request=ui.loadPlayerData();ui.onUnload();release({result:{success:true,player:{name:'late'},team:{},stats:{}}});await request;assert.equal(ui.data.player.name,undefined);detailPending=null
 const template=fs.readFileSync(base+'.wxml','utf8');assert.ok(template.includes('<dynamic-player-card'));assert.doesNotMatch(template,/avatar-frame|jersey-badge|aspectFill/);assert.ok(template.includes('mode="aspectFit"'))
 for(const [,expression]of template.matchAll(/{{(.*?)}}/gs))assert.doesNotMatch(expression,/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
 assert.equal(JSON.parse(fs.readFileSync(base+'.json')).usingComponents['dynamic-player-card'],'/components/dynamic-player-card/index')
 let exported={exports:{}},options
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/utils/player-card.js'),'utf8'),{module:exported,require:()=>({readContext:()=>({currentWorkspace:{id:space}})}),wx:{getStorageSync:()=>user,cloud:{callFunction:o=>{options=o;return Promise.resolve({result:{success:true,status:'ready'}})}}}})
 await exported.exports.readImage('p','t');assert.equal(options.data.action,'playerCardRead');assert.equal(options.data.dynamicCardProtocol,'');assert.equal(options.data.workspaceId,space);assert.equal(options.data.playerId,'p');assert.equal(options.data.teamId,'t')
 console.log('PASS: 详情完整动态卡/历史整卡、独立读取不阻塞资料、无卡/更新/失败/无权状态、重试/预览、真实0/未知/服务端积分不改、重复与离页/换号/空间迟到隔离、WXML')
}
run().catch(e=>{console.error(e);process.exitCode=1})
