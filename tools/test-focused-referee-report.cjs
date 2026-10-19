const assert=require('node:assert/strict'),{PNG}=require('../cloudfunctions/webLoginApi/node_modules/pngjs')
const focus=require('../cloudfunctions/webLoginApi/refereeGoalFocus.cjs'),notes=require('../cloudfunctions/webLoginApi/refereeReportNotes.cjs'),draft=require('../miniprogram/utils/refereeReportDraft')
async function run(){
 assert.deepEqual(notes.circledMinutes('√①4②8④44-⑤51'),[4,8,44,51])
 assert.deepEqual(notes.circledMinutes('①29 ②45'),[29,45]);assert.deepEqual(notes.circledMinutes('(1)29 (2)45'),[29,45]);assert.ok(notes.circledMinutes('①4 44').includes(null))
 const p=new PNG({width:400,height:300});p.data.fill(255);const image=PNG.sync.write(p)
 const analysis={teams:{home:[{number:'98',goals:'29,45',rawFields:{identity:'①29',on:'②45'},reviewNotes:[]}],away:[{number:'6',goals:'26',rawFields:{identity:'③26'},reviewNotes:[]},{number:'67',on:'',off:'',goals:'?',rawFields:{identity:'①4',on:'②',off:'4 44',goals:'⑤51'},sourceRegion:{left:20,top:30,width:200,height:30},reviewNotes:['部分进球分钟不清楚']}]},score:{home:2,away:5},warnings:['比分与已解析进球次数不一致，请核对进球分钟']}
 let calls=0
 const result=await focus.enhance(analysis,image,async mode=>{calls++;return {words_result:[{words:mode==='handwriting'?'√①4②8④44-⑤51':'√14 2 8 44 51'}]}})
 assert.equal(calls,2);assert.equal(result.teams.home[0].goals,'29,45');assert.equal(result.teams.away[1].goals,'4,8,44,51');assert.equal(result.teams.away[1].on,'');assert.equal(result.teams.away[1].off,'');assert.deepEqual(result.teams.away[1].reviewNotes,[]);assert.ok(!result.warnings.some(text=>text.includes('比分')));assert.equal(result.teams.away[1].goalOrder,undefined)
 const players=['home','away'].map(side=>({id:side,teamSide:side,jerseyNumber:'9',name:'球员甲'}))
 const teams=draft.prepare({teams:{home:[{number:'9',name:'球员甲',role:'starter',goals:'29,45',reviewNotes:[]}],away:[{number:'9',name:'错位姓名',nameCandidates:['球员甲'],role:'starter',goals:'',reviewNotes:['姓名与号码需核对']}]}},players)
 assert.equal(draft.needsReview(teams.home[0]),false);assert.equal(draft.needsReview(teams.away[0]),false);draft.payload(teams,{home:'2',away:'0'},false,8)
 teams.home[0].goals='?';teams.home[0].reviewNotes=['进球分钟不清楚'];assert.equal(draft.needsReview(teams.home[0]),true);assert.throws(()=>draft.payload(teams,{home:'2',away:'0'},false,8),/分钟|核对/)
 const nine=Array.from({length:9},(_,i)=>({playerId:'p'+i,role:'starter',name:'球员'+i,reviewNotes:[]}));assert.throws(()=>draft.payload({home:nine,away:[]},{home:'0',away:'0'},true,8),/超过8人/)
 console.log('PASS: 实际百度圈号/尾笔模式解析为4/8/44/51、保留清楚分钟、只放大不清楚行、比分一致性、圈号不入库、稳定号码+姓名候选、清楚行免确认、模糊项阻断与8人制冲突')
}
run().catch(error=>{console.error(error);process.exitCode=1})


