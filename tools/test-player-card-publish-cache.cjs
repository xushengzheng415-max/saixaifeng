const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
// Regression: final rescan can append a player not present in this invocation's
// original score cache. Absence in the cache is not an unverified career score.
const records=new Map(),key=(c,id)=>`${c}/${id}`
const player={_id:'new-player',playerCardFileId:'old-file',playerCardVersion:1,name:'缓存回归球员'}
records.set(key('jobs','job'),{_id:'job',status:'pending',tier:'bronze',templateId:'template',version:4,templateRevision:1,cursor:0,targetIds:[player._id],failures:[]})
records.set(key('players',player._id),player)
records.set(key('states','bronze'),{candidate:{jobId:'job'},active:{templateId:'template',version:3},revision:1,mutation:0})
records.set(key('templates','template'),{revision:1})
records.set(key('versions','template_4'),{templateId:'template',version:4})
const copy=x=>x==null?null:JSON.parse(JSON.stringify(x))
const db={command:{set:x=>x,in:x=>x},serverDate:()=>new Date(0).toISOString(),collection(c){return {
 doc(id){return {set:async({data})=>records.set(key(c,id),{...copy(data),_id:id}),update:async({data})=>records.set(key(c,id),{...records.get(key(c,id)),...copy(data)})}},
 where(){return {limit(){return {get:async()=>({data:[...records.entries()].filter(([id])=>id.startsWith(c+'/')).map(([,value])=>copy(value))})}}}}
}},runTransaction:async run=>run(db)}
let freshReads=0,generated=0
const suite={STATES:'states',JOBS:'jobs',TEMPLATES:'templates',VERSIONS:'versions',RENDERS:'renders',TYPES:['bronze'],RENDER_VERSION:'resvg/2',
 document:async(_db,c,id)=>copy(records.get(key(c,id))),versionId:(id,v)=>`${id}_${v}`,renderId:(id,t,v)=>`${id}_${t}_${v}`,
 savedPlayers:async()=>[copy(records.get(key('players',player._id)))],generate:async()=>{generated++;return {fileId:'new-file',digest:'digest'}}}
const moduleStub={exports:{}}
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cloudfunctions/webLoginApi/playerCardPublish.cjs'),'utf8'),{
 module:moduleStub,exports:moduleStub.exports,Buffer,Date,console,__dirname:__dirname,
 require(name){if(name==='./playerCardSuite.cjs')return suite;if(name==='./playerCardSource.cjs')return {resolveSource:async()=>({fileId:'source-file',type:'legacy_roster'})};if(name==='./playerCardRender.cjs')return {renderCard:()=>Buffer.alloc(0)};if(name==='./data-center/service.cjs')return {createDataService:()=>({playerCardsForAuthorizedPlayers:async ids=>{freshReads++;return new Map(ids.map(id=>[id,{status:'ready',tier:'bronze'}]))}})};return require(name)}
})
;(async()=>{
 const publisher=moduleStub.exports.createPlayerCardPublish({cloud:{database:()=>db,deleteFile:async()=>{}}})
 const result=await publisher.advance('job',{scores:new Map(),batchSize:3})
 assert.equal(freshReads,1)
 assert.equal(generated,1)
 assert.equal(result.status,'active')
 assert.equal(result.affected,1)
 assert.equal(records.get(key('jobs','job')).affected,1)
 assert.equal(records.get(key('renders','new-player_template_4')).renderVersion,'resvg/2')
 console.log('Appended targets refresh career scores and complete activation without false failures')
})().catch(error=>{console.error(error);process.exitCode=1})
