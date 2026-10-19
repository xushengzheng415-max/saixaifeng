const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),Module=require('node:module')
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(setImmediate)
async function run(){
 let exportedModule={exports:{}},exports,downloads=0,loads=0,failFont=true,legacy=false
 const wx={downloadFile(options){downloads++;assert.match(options.url,/^https:/);options.success({statusCode:200,tempFilePath:'wxfile://resource'})},getFileSystemManager(){assert.ok(legacy,'HTTPS native font must not read full base64 file');return {readFile(options){options.success({data:'Zm9udA=='})}}},loadFontFace(options){loads++;assert.deepEqual(Array.from(options.scopes),['native']);assert.match(options.source,legacy?/^url\("data:font\//:/^url\("https:\/\//);if(failFont)options.fail({errMsg:'loadFontFace:fail network error'});else options.success({})}}
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/utils/dynamic-card-resources.js'),'utf8'),{module:exportedModule,wx,Map,Promise,Date,setTimeout,clearTimeout});exports=exportedModule.exports
 const fonts=[{family:'Noto Sans SC',weight:400,url:'https://example.invalid/regular',name:'Regular.otf'},{family:'Noto Sans SC',weight:700,url:'https://example.invalid/bold',name:'Bold.otf'},{family:'Ma Shan Zheng',weight:400,url:'https://example.invalid/brush',name:'Brush.ttf'}]
 const scene={layout:{name:{weight:800},number:{hidden:true,weight:400}},values:{name:'球员',number:'12'},fonts}
 assert.equal(exports.requiredFonts(scene).length,1);assert.equal(exports.requiredFonts(scene)[0].weight,700)
 await assert.rejects(exports.loadFonts(scene,{httpsNative:true}),/字体未加载/);failFont=false;await exports.loadFonts(scene,{httpsNative:true});assert.equal(loads,2);assert.equal(downloads,0)
 await exports.loadFonts(scene,{httpsNative:true});assert.equal(loads,2)
 legacy=true;await exports.loadFonts(scene);assert.equal(loads,3);assert.equal(downloads,1,'Existing callers retain their previous loader');legacy=false
 let timeout,lateSuccess,timeoutModule={exports:{}}
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/utils/dynamic-card-resources.js'),'utf8'),{module:timeoutModule,wx:{loadFontFace(options){lateSuccess=options.success}},Map,Promise,Date,setTimeout(fn,ms){assert.equal(ms,6000);timeout=fn;return 1},clearTimeout(){}})
 const hanging=timeoutModule.exports.loadFonts(scene,{httpsNative:true});timeout();await assert.rejects(hanging,/字体未加载/);lateSuccess()
 let concurrent=0,peak=0,calls=0,completions=[];exportedModule={exports:{}}
 const cloud={callFunction({data}){calls++;assert.equal(data.operation,'lineupCardImage');assert.ok(data.playerIds.length<=6);concurrent++;peak=Math.max(peak,concurrent);return new Promise(resolve=>completions.push(()=>{concurrent--;resolve({result:{success:true,cards:data.playerIds.map(playerId=>({playerId,status:'ready',cardUrl:'https://example.invalid/complete.png'}))}})}))}}
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/utils/lineup-card-image.js'),'utf8'),{module:exportedModule,wx:{cloud},Map,Promise,setTimeout});exports=exportedModule.exports
 const context={tournamentId:'t',matchId:'m',side:'home',templateId:'v',publishedVersion:3,cardDataVersion:1}
 const first=exports.read(context,'p1'),duplicate=exports.read(context,'p1'),second=exports.read(context,'p2'),third=exports.read(context,'p3')
 await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls,1);completions.splice(0).forEach(done=>done());await Promise.all([first,duplicate,second,third])
 const many=Array.from({length:15},(_,i)=>exports.read(context,'batch'+i));await new Promise(resolve=>setTimeout(resolve,5));assert.equal(peak,2);assert.equal(calls,3);for(let i=0;i<5;i++){completions.splice(0).forEach(done=>done());await tick()}await Promise.all(many);assert.equal(calls,4)
 const reread=exports.read(context,'p1');await new Promise(resolve=>setTimeout(resolve,5));assert.equal(calls,5);completions.splice(0).forEach(done=>done());await reread // no cross-session completed-card cache
 let definition,resolveImage
 const file=path.join(root,'miniprogram/components/lineup-player-card/lineup-player-card.js')
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:value=>{definition=value},require:()=>({read:()=>new Promise(resolve=>{resolveImage=resolve})})})
 const component={...definition.methods,data:{imageContext:context,playerId:'p1',cardState:'ready'},setData(patch){Object.assign(this.data,patch)},triggerEvent(){}}
 const observe=Object.values(definition.observers)[0]
 observe.call(component,{publishedVersion:3},'','ready','player','',context,'p1');component.dynamicFailed();assert.equal(component.data.loadingFallback,true)
 observe.call(component,null,'','forbidden','player','',null,'p2');resolveImage({status:'ready',cardUrl:'private-old-card'});await tick()
 assert.equal(component.data.resolvedCardUrl,'');assert.equal(component.data.stateText,'无权查看');assert.equal(component.data.ready,false)
 observe.call(component,{publishedVersion:3},'','ready','player','',context,'p1');component.dynamicFailed();resolveImage({status:'ready',cardUrl:'https://example.invalid/current.png'});await tick();assert.equal(component.data.ready,true);assert.equal(component.data.hasDynamicCard,false)
 for(const filename of ['components/dynamic-player-card/index.wxml','components/lineup-player-card/lineup-player-card.wxml','components/match-lineup-editor/index.wxml'])for(const match of fs.readFileSync(path.join(root,'miniprogram',filename),'utf8').matchAll(/\{\{([\s\S]*?)\}\}/g))assert.doesNotMatch(match[1],/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
 console.log('PASS: 仅加载使用字体、HTTPS原生字体而非Base64大文件、失败重试与资源复用、整卡回退限流/并发去重、无跨会话成卡缓存、旧请求不覆盖撤权/切人、WXML规则')
}
run().catch(error=>{console.error(error);process.exitCode=1})
