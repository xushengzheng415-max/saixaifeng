const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const source=fs.readFileSync('web-admin-vue/src/views/team/TeamDetail.vue','utf8')
const start=source.indexOf('async function submitPlayerReview('),end=source.indexOf('async function reviewSelectedPlayers',start)
const value=x=>({value:x});let calls=[],messages=[],reloads=0,reply={success:true}
const context={reviewingPlayer:value({_id:'isolated-player'}),playerReviewDialogVisible:value(true),isReadOnlyTournament:value(false),batchReviewing:value(false),playerReviewingId:value(''),sourceTournamentId:value('isolated-event'),tournamentRelation:value({_id:'isolated-relation',divisionId:'isolated-division'}),sourceDivisionId:value('isolated-division'),teamId:'isolated-team',rosterExceptionBoard:async payload=>{calls.push(payload);return reply},approvePlayerRecord:async player=>calls.push({approve:player._id}),loadPlayers:async()=>reloads++,ElMessage:{warning:x=>messages.push(x),error:x=>messages.push(x),success:x=>messages.push(x)}}
vm.createContext(context);vm.runInContext(source.slice(start,end)+';globalThis.submit=submitPlayerReview',context)
async function run(){
 await context.submit({decision:'rejected',reason:'  '});assert.equal(calls.length,0);assert(context.playerReviewDialogVisible.value)
 await context.submit({decision:'rejected',reason:' 请补充头像 '});assert.equal(calls.length,1);assert.equal(calls[0].rosterAction,'rejectPlayer');assert.equal(calls[0].reason,'请补充头像');assert.equal(calls[0].tournamentId,'isolated-event');assert.equal(calls[0].teamId,'isolated-team');assert.equal(calls[0].divisionId,'isolated-division');assert.equal(calls[0].playerId,'isolated-player');assert.equal(context.playerReviewDialogVisible.value,false);assert.equal(reloads,1)
 context.playerReviewDialogVisible.value=true;reply={success:false,error:'服务端拒绝审核'};await context.submit({decision:'rejected',reason:'资料不完整'});assert.equal(context.playerReviewDialogVisible.value,true);assert.equal(context.playerReviewingId.value,'');assert(messages.includes('服务端拒绝审核'))
 calls=[];context.isReadOnlyTournament.value=true;await context.submit({decision:'rejected',reason:'不应写入'});assert.equal(calls.length,0)
 context.isReadOnlyTournament.value=false;context.sourceTournamentId.value='';await context.submit({decision:'rejected',reason:'缺赛事'});assert.equal(calls.length,0)
 context.sourceTournamentId.value='isolated-event';await context.submit({decision:'approved',reason:''});assert.equal(calls.length,1);assert.equal(calls[0].approve,'isolated-player')
 console.log('PASS: actual PC handler sends scoped single-player rejection with trimmed reason, reloads after success, retains dialog on failure, blocks readonly/missing event, and preserves approval path')
}
run().catch(error=>{console.error(error);process.exit(1)})
