'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),Module=require('node:module')
const layout=require('../miniprogram/utils/lineup-layout')
const cardRead=require('../cloudfunctions/getMiniWorkspace/sharedLineupCards.cjs')
const people=['home','away'].flatMap(side=>Array.from({length:7},(_,i)=>({id:side+i,playerId:side+i,name:(side==='home'?'主':'客')+i,jerseyNumber:String(i+1),teamSide:side,teamId:side})))
function fakeContext(rights=['event.matches','event.teams']){
  const snapshots=['home','away'].map(side=>({_id:side,tournamentId:'event',divisionId:'division',teamId:side,status:'approved',players:people.filter(row=>row.teamSide===side)}))
  const tables={roster_snapshots:snapshots,tournament_teams:[],players:people.map(row=>({...row,_id:row.id,phone:'private-field'})),tournaments:[{_id:'event'}],divisions:[{_id:'division',matchFormat:'5side',benchPlayerLimit:1}]}
  function matches(row,where){if(where.and)return where.and.every(part=>matches(row,part));return Object.entries(where).every(([key,value])=>value&&value.in?value.in.includes(row[key]):value&&value.gt?row[key]>value.gt:row[key]===value)}
  const db={command:{in:inList=>({in:inList}),gt:gt=>({gt}),and:and=>({and})},collection(name){return {where(where){const query={orderBy(){return query},limit(){return query},async get(){return {data:(tables[name] || []).filter(row=>matches(row,where)).sort((a,b)=>a._id.localeCompare(b._id))}}};return query}}}}
  return {db,cloud:{},identity:{user:{_id:'user'}},event:{side:'home'},grant:{permissions:rights},match:{_id:'match',tournamentId:'event',divisionId:'division',homeTeamId:'home',awayTeamId:'away',matchFormat:'5side'},rows:async(db,name,where)=>(tables[name] || []).filter(row=>matches(row,where)),doc:async(db,name,id)=>(tables[name] || []).find(row=>row._id===id),authorized:async()=>true}
}
async function run(){
  for(const count of [3,4,5,6,7,8,9,10,11])assert.equal(layout.slotsFor(count,'').length,count)
  assert.equal(layout.slotsFor(0,'').length,0)
  assert.equal(layout.slotsFor(8,'3-2-2').filter(row=>row.position==='FW').length,2)
  let invoked=false
  const reader=async(cloud,db,profiles,options)=>{invoked=true;assert.equal(options.dynamic,true);assert.equal(options.restrictedAssets,true);return profiles.map(player=>({playerId:player._id,status:'ready',cardScene:{schemaVersion:'player-card-dynamic/1'},cardUrl:'',portraitUrl:'https://example.invalid/card-visible-pixels.png',phone:player.phone}))}
  const data=await cardRead.read(fakeContext(),reader)
  assert.equal(data.rules.playersOnField,5);assert.equal(data.rules.benchLimit,1);assert.equal(data.cards.length,7);assert.equal(data.cards[0].phone,undefined)
  invoked=false;const denied=await cardRead.read(fakeContext(['event.matches']),reader)
  assert.equal(invoked,false);assert.ok(denied.cards.every(row=>row.status==='forbidden'&&!row.portraitUrl))
  const foreign=fakeContext();foreign.event.playerIds=['away0'];await assert.rejects(cardRead.read(foreign,reader),/不属于/)
  const invalid=fakeContext();invalid.event.side='other';await assert.rejects(cardRead.read(invalid,reader),/主队或客队/)
  const image=fakeContext();image.event.operation='lineupCardImage';image.event.playerIds=['home0']
  const exported=await cardRead.read(image,async(cloud,db,profiles,options)=>{
    assert.equal(options.dynamic,true);assert.equal(options.restrictedAssets,false)
    return profiles.map(profile=>({playerId:profile._id,status:'ready',cardScene:{protocolVersion:'player-card-dynamic/1'},templateId:'live',publishedVersion:3,cardDataVersion:1,portraitUrl:'private-original'}))
  },async(cloud,db,profile,card,options)=>{assert.equal(profile._id,'home0');assert.equal(card.publishedVersion,3);assert.equal(options.size,1);return {cardUrl:'https://example.invalid/current-complete-card.png'}})
  assert.equal(exported.cards[0].cardScene,null);assert.equal(exported.cards[0].portraitUrl,'');assert.equal(exported.cards[0].publishedVersion,3)
  image.event.playerIds=Array.from({length:7},(_,i)=>'home'+i);await assert.rejects(cardRead.read(image,reader),/六张/)
  const preview=fakeContext();preview.event.mobilePreview=true
  const metadata=await cardRead.read(preview,async(cloud,db,profiles,options)=>{assert.equal(options.restrictedAssets,false);return profiles.map(player=>({playerId:player._id,status:'ready',cardScene:{assets:{portrait:'private-original'}},portraitUrl:'private-original'}))})
  assert.ok(metadata.cards.every(card=>card.needsImage&&card.cardScene===null&&!card.portraitUrl))
  image.event.playerIds=['away0'];await assert.rejects(cardRead.read(image,reader),/不属于/)
  const revoked=fakeContext();revoked.authorized=async()=>{throw Error('授权已停用')};await assert.rejects(cardRead.read(revoked,reader),/停用/)
  const failed=await cardRead.read(fakeContext(),async()=>{throw Error('image-network-failed')})
  assert.equal(failed.rules.playersOnField,5);assert.ok(failed.cards.every(row=>row.status==='failed'));assert.match(failed.warning,/号码选择/)

  let definition,saveEvents=0
  const file=path.resolve(__dirname,'../miniprogram/components/match-lineup-editor/index.js')
  const wx={cloud:{callFunction:async({data})=>({result:{success:true,rules:{playersOnField:5,benchLimit:1},cards:people.filter(row=>row.teamSide===data.side).map(row=>({playerId:row.id,status:'unavailable'}))}})}}
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Component:value=>{definition=value},require:Module.createRequire(file),wx})
  const editor={...definition.methods,properties:{tournamentId:'event',match:{id:'match',homeName:'主队',awayName:'客队'},players:people,homeStarters:[],awayStarters:[],homeBench:[],awayBench:[],saving:false},data:structuredClone(definition.data),setData(patch){Object.assign(this.data,patch)},triggerEvent(name,detail){if(name==='save'){saveEvents++;return}if(name==='change'){this.properties.homeStarters=detail.starters.home;this.properties.awayStarters=detail.starters.away;this.properties.homeBench=detail.bench.home;this.properties.awayBench=detail.bench.away;this.sync()}}}
  editor.sync();for(let i=0;i<10&&editor.data.loading;i++)await new Promise(setImmediate)
  editor.openEditor();assert.equal(editor.data.editorOpen,true);editor.closeEditor();assert.equal(editor.data.editorOpen,false)
  assert.equal(editor.data.slots.length,5)
  function pick(index,id){editor.chooseSlot({currentTarget:{dataset:{index}}});editor.pickPlayer({currentTarget:{dataset:{id}}})}
  for(let i=0;i<5;i++)pick(i,'home'+i)
  editor.chooseBench();editor.pickPlayer({currentTarget:{dataset:{id:'home5'}}})
  assert.equal(editor.data.benchCount,1);assert.equal(editor.data.canAddBench,false)
  editor.removeBench({currentTarget:{dataset:{id:'home5'}}})
  editor.chooseBench();editor.pickPlayer({currentTarget:{dataset:{id:'home1'}}})
  assert.equal(editor.data.starterCount,4);assert.equal(editor.data.benchCount,1)
  pick(1,'home5');assert.equal(editor.data.starterCount,5)
  editor.changeSide({currentTarget:{dataset:{id:'away'}}});for(let i=0;i<10&&editor.data.loading;i++)await new Promise(setImmediate)
  for(let i=0;i<5;i++)pick(i,'away'+i)
  assert.equal(editor.data.canSave,true)
  editor.changeSide({currentTarget:{dataset:{id:'home'}}})
  const before=editor.selected.home.slots.slice();pick(0,'away0');assert.deepEqual(editor.selected.home.slots,before)
  pick(2,'home0');assert.equal(editor.selected.home.slots[0],'');assert.equal(editor.selected.home.slots[2],'home0');assert.equal(editor.data.canSave,false)
  editor.save();assert.equal(saveEvents,0)
  pick(0,'home2');assert.equal(editor.data.canSave,true)
  editor.save();assert.equal(saveEvents,1)
  editor.properties.saving=true;editor.save();assert.equal(saveEvents,1)
  for(const filename of ['miniprogram/components/match-lineup-editor/index.wxml','miniprogram/components/referee-report-import/index.wxml'])for(const match of fs.readFileSync(path.resolve(__dirname,'..',filename),'utf8').matchAll(/\{\{([\s\S]*?)\}\}/g))assert.doesNotMatch(match[1],/===|!==|==|!=|\?|\[|\]|\(|\)|&&|[<>]/)
  console.log('PASS: 复用阵型3至11人、球员卡授权/投影与白名单、跨球队拒绝、撤权、图片失败可按号码选人、主客队卡槽与替补互移、唯一性、人数/上限、空位保留与保存阻断、WXML规则；无生产写入')
}
run().catch(error=>{console.error(error);process.exitCode=1})
