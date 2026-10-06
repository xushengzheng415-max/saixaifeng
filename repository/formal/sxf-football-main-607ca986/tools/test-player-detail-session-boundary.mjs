import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require=createRequire(new URL('../web-admin-vue/package.json',import.meta.url))
const parser=require('@babel/parser')
const source=fs.readFileSync(new URL('../web-admin-vue/src/views/player/PlayerDetail.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
const ast=parser.parse(source,{sourceType:'module'})
let code=source
for(const node of ast.program.body.filter(n=>n.type==='ImportDeclaration').reverse())code=code.slice(0,node.start)+code.slice(node.end)
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function harness({queryList,callFunction}) {
  let identity='account-a|org-a|role-a';let hook
  const context={ref:value=>({value}),computed:fn=>({get value(){return fn()}}),onMounted(){},onUnmounted(){},watch(){},
    useRouter:()=>({push(){},back(){}}),useRoute:()=>({params:{id:'p1'},query:{},fullPath:'/players/p1'}),
    useReadCacheRefresh:value=>{hook=value},getPlayerReadIdentity:()=>identity,queryList,callFunction,
    getTempFileURL:async()=>({success:true,url:'https://example.invalid/photo'}),ElMessage:{error(){},success(){},info(){}},
    window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){},visibilityState:'visible'},console}
  vm.createContext(context)
  vm.runInContext(code+'\nthis.state={playerData,teamData,statistics,playerCard,playerAvatarUrl,statisticsLoading,loading};this.actions={loadPlayerData,refreshStatistics}',context)
  return {context,switchIdentity(){identity='account-b|org-b|role-b';hook.clear()}}
}
let request=deferred()
let h=harness({queryList:()=>request.promise,callFunction:async()=>{throw Error('Old profile must not initiate grade read')}})
const pendingProfile=h.context.actions.loadPlayerData();h.switchIdentity();request.resolve([{_id:'p1',name:'Private A'}]);await pendingProfile
assert.equal(h.context.state.playerData.value.name,undefined);assert.equal(h.context.state.loading.value,false)
console.log('PASS: pending profile cannot repopulate data after account/org boundary')
request=deferred()
h=harness({queryList:async()=>[{_id:'p1'}],callFunction:()=>request.promise})
const pendingGrade=h.context.actions.refreshStatistics();h.switchIdentity();request.resolve({success:true,statistics:{playerTotal:{metrics:{goals:99}},coverage:{status:'complete'}},playerCard:{status:'ready',points:100,tier:'gold',snapshotRevision:'a'}});await pendingGrade
assert.equal(h.context.state.playerCard.value.points,null);assert.equal(h.context.state.statistics.value.goals,undefined);assert.equal(h.context.state.statisticsLoading.value,false)
console.log('PASS: pending career snapshot cannot restore another identity’s grade')
let revision='one',calls=0
h=harness({queryList:async()=>[{_id:'p1'}],callFunction:async()=>{calls++;return {success:true,statistics:{playerTotal:{metrics:{goals:null}},coverage:{status:'partial'}},playerCard:{status:'unverified',points:null,tier:null,progress:null,snapshotRevision:revision}}}})
await h.context.actions.refreshStatistics();revision='two';await h.context.actions.refreshStatistics()
assert.equal(calls,2);assert.equal(h.context.state.playerCard.value.snapshotRevision,'two');assert.equal(h.context.state.statistics.value.goals,null)
console.log('PASS: manual grade refresh consumes new server snapshot revision and retains unknowns')
