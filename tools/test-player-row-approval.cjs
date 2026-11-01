const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const source=fs.readFileSync('web-admin-vue/src/views/team/TeamDetail.vue','utf8')
const start=source.indexOf('async function approvePlayer(player)'),end=source.indexOf('function reviewPlayer(player)',start)
const ref=value=>({value});let calls=0,reloads=0,fail=false
const ctx={isTeamDataWorkspace:ref(false),isReadOnlyTournament:ref(false),batchReviewing:ref(false),playerReviewingId:ref(''),playerOrganizerReviewStatus:p=>p.state||'pending',approvePlayerRecord:async()=>{calls++;if(fail)throw new Error('拒绝')},loadPlayers:async()=>reloads++,ElMessage:{success(){},error(){}}}
vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';globalThis.approve=approvePlayer',ctx)
async function run(){await ctx.approve({_id:'fixture'});assert.equal(calls,1);assert.equal(reloads,1);assert.equal(ctx.playerReviewingId.value,'');await ctx.approve({_id:'passed',state:'approved'});assert.equal(calls,1);ctx.isReadOnlyTournament.value=true;await ctx.approve({_id:'readonly'});assert.equal(calls,1);ctx.isReadOnlyTournament.value=false;ctx.playerReviewingId.value='busy';await ctx.approve({_id:'double-click'});assert.equal(calls,1);ctx.playerReviewingId.value='';fail=true;await ctx.approve({_id:'failed'});assert.equal(ctx.playerReviewingId.value,'');assert.equal(reloads,1);console.log('PASS: row approval is direct, reloads on success, blocks approved/readonly/duplicate operations, and releases loading on failure')}
run().catch(error=>{console.error(error);process.exit(1)})
