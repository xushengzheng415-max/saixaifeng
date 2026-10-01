const assert = require('node:assert/strict')
const { PNG } = require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const { createPlayerCardTemplates } = require('../cloudfunctions/webLoginApi/playerCardTemplates.cjs')
const suite = require('../cloudfunctions/webLoginApi/playerCardSuite.cjs')
const preload = require('../cloudfunctions/webLoginApi/playerCardPreload.cjs')
const tables = new Map(), files = new Map()
function table(name) { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name) }
function unwrap(value) { return value && value.$set !== undefined ? value.$set : value }
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => key === '$and' ? value.every(part => matches(row, part)) : key === '$or' ? value.some(part => matches(row, part)) :
    value?.$gt !== undefined ? String(row[key]) > value.$gt : value instanceof RegExp ? value.test(row[key] || '') : row[key] === value)
}
const db = {
  command:{ gt:value => ({$gt:value}), set:value => ({$set:value}), or:value => ({$or:value}), and:value => ({$and:value}) },
  RegExp:({regexp,options}) => new RegExp(regexp,options), serverDate:() => new Date(),
  collection(name) {
    const rows = table(name)
    return {
      doc(id) { return {
        async get() { return {data:rows.has(id) ? structuredClone(rows.get(id)) : null} },
        async set({data}) { rows.set(id, {_id:id,...structuredClone(data)}) },
        async update({data}) { assert(rows.has(id)); for (const [key,value] of Object.entries(data)) rows.get(id)[key] = structuredClone(unwrap(value)) }
      } },
      where(filter) { let count=100; const query={orderBy(){return query},limit(n){count=n;return query},async get(){return {data:[...rows.values()].filter(row=>matches(row,filter)).sort((a,b)=>a._id.localeCompare(b._id)).slice(0,count).map(row=>structuredClone(row))}}};return query }
    }
  }, async runTransaction(fn) { return fn(db) }
}
const cloud = { database:()=>db,
  async uploadFile({fileContent}) { const fileID=`cloud://test-${files.size}`;files.set(fileID,fileContent);return {fileID} },
  async deleteFile(){}, async downloadFile({fileID}) { return {fileContent:files.get(fileID)} },
  async getTempFileURL({fileList}) { return {fileList:fileList.map(fileID=>({fileID,tempFileURL:`https://test.local/${fileID}`}))} }
}
const handle=createPlayerCardTemplates({cloud,authenticateWebSession:async event=>({success:true,principalType:event.authToken==='owner'?'platform_owner':'organizer',user:{isPlatformOwner:event.authToken==='owner'},userId:'owner'})})
const call=(action,data={})=>handle({action,authToken:'owner',...data})
function image(mask) {
  const png=new PNG({width:300,height:430})
  for(let i=0;i<png.data.length;i+=4) { const value=mask ? (i%1200<600 ? 0 : 255) : 180;png.data.set([value,value,value,255],i) }
  return 'data:image/png;base64,'+PNG.sync.write(png).toString('base64')
}
async function main() {
  assert.equal(preload.stateId('gold'),'gold')
  assert.throws(()=>preload.normalizePreload({type:'team',targetId:''}))
  for(const [collection,id,name] of [['teams','team1','测试球队'],['tournaments','event1','测试赛事'],['players','p1','球员甲'],['players','p2','球员乙']]) table(collection).set(id,{_id:id,name,teamId:'team1'})
  assert.equal((await handle({action:'listPlayerCardPreloadTargets',type:'player'})).code,'CARD_TEMPLATE_FORBIDDEN')
  assert.equal((await call('listPlayerCardPreloadTargets',{type:'player',keyword:'甲'})).targets[0].id,'p1')
  assert.equal((await call('listPlayerCardPreloadTargets',{type:'player',keyword:'.*'})).targets.length,0,'search is literal')
  const base={title:'专属金卡',tier:'gold',backgroundData:image(false),maskData:image(true)}
  const bad=await call('savePlayerCardTemplate',{...base,preload:{type:'tournament',targetId:'missing'}})
  assert.equal(bad.code,'CARD_PRELOAD_TARGET_NOT_FOUND')
  assert.equal(files.size,0)
  const saved=[]
  for(const scope of [{type:'platform'},{type:'team',targetId:'team1'},{type:'tournament',targetId:'event1'},{type:'player',targetId:'p1'}]) {
    const result=await call('savePlayerCardTemplate',{...base,preload:{...scope,targetName:'伪造名称'}})
    assert.equal(result.success,true,result.error); saved.push(result)
    const published=await call('publishPlayerCardTemplate',{templateId:result.templateId,revision:1})
    assert.equal(published.status,'active',published.error)
    const active=await call('getActivePlayerCardTemplate',{tier:'gold',preload:scope,templateId:result.templateId})
    assert.equal(active.template.id,result.templateId)
    if(scope.type!=='platform') assert.notEqual(active.template.preload.targetName,'伪造名称')
  }
  assert.equal(table(suite.STATES).size,4,'independent activity pointers')
  assert.equal((await handle({action:'listPublishedPlayerCardTemplates'})).templates.length,1,'private targets excluded from anonymous catalog')
  assert.equal((await handle({action:'getActivePlayerCardTemplate',tier:'gold',preload:{type:'player',targetId:'p1'}})).code,'CARD_TEMPLATE_FORBIDDEN')
  assert.equal((await handle({action:'getActivePlayerCardTemplate',tier:'gold'})).status,'unavailable','preloading does not replace global base pointer')
  const edit=await call('savePlayerCardTemplate',{templateId:saved[1].templateId,revision:2,title:'更新草稿',tier:'gold'})
  assert.equal(edit.success,true,edit.error)
  assert.equal((await call('getActivePlayerCardTemplate',{tier:'gold',preload:{type:'team',targetId:'team1'},templateId:saved[1].templateId})).template.title,'专属金卡')
  assert.equal((await call('savePlayerCardTemplate',{templateId:saved[1].templateId,revision:3,title:'改绑模板',tier:'gold',preload:{type:'player',targetId:'p1'}})).code,'CARD_PRELOAD_LOCKED')
  for(const p of table('players').values()) Object.assign(p,{playerCardFileId:'cloud://saved',playerCardTier:'gold'})
  table('players').get('p2').teamId='team2'
  table('roster_snapshots').set('r1',{_id:'r1',tournamentId:'event1',teamId:'team1',status:'approved',version:1,playerIds:['p2']})
  table('roster_snapshots').set('r2',{_id:'r2',tournamentId:'event1',teamId:'team1',status:'approved',version:2,playerIds:['p1']})
  table('roster_snapshots').set('r3',{_id:'r3',tournamentId:'event1',teamId:'team1',status:'draft',version:3,playerIds:['p2']})
  assert.deepEqual((await suite.savedPlayers(db,'gold',{type:'team',targetId:'team1'})).map(p=>p._id),['p1'])
  assert.deepEqual((await suite.savedPlayers(db,'gold',{type:'tournament',targetId:'event1'})).map(p=>p._id),['p1'],'latest approved roster, not current team')
  assert.deepEqual((await suite.savedPlayers(db,'gold',{type:'player',targetId:'p2'})).map(p=>p._id),['p2'])
  assert.equal((await suite.savedPlayers(db,'gold')).length,2)
  console.log('PASS: preload categories, target validation/search, scope publication isolation, draft snapshots, public access, roster targeting')
}
module.exports = {db,cloud,table,files,call,image}
if(require.main === module) main().catch(error=>{console.error(error);process.exitCode=1})
