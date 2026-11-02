const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname, '../web-admin-vue/src/views/tournament/TournamentResultCenter.vue'), 'utf8')
const action = source.match(/^async function loadDashboard\(\).*$/m)?.[0]
assert.ok(action, 'Dashboard refresh entry must exist')
async function check({ selected = '', response = { success:true,matches:[{ id:'one',resultStatus:'approved',matchDate:'2026-10-26' }] } } = {}) {
  let refreshed = 0
  const errors = []
  const ctx = {
    rankingRefresh:{value:0}, loading:{value:false}, dashboard:{value:{matches: selected ? [{id:selected}] : []}},
    selectedMatchId:{value:selected}, reportDate:{value:''}, tournamentId:'isolated-event',
    compareReviewRows:() => 0, callFunction:async () => response,
    loadDisciplinaryActions:async () => { refreshed++ }, ElMessage:{error:message => errors.push(message)}
  }
  ctx.selectedMatch = { get value() { return ctx.dashboard.value.matches?.find(row => row.id === ctx.selectedMatchId.value) } }
  vm.runInNewContext(action + '\nglobalThis.runRefresh=loadDashboard',ctx)
  await ctx.runRefresh()
  assert.equal(ctx.loading.value, false)
  return { ctx, refreshed, errors }
}
;(async () => {
  assert.equal((await check({selected:'one'})).refreshed,1, 'Same-match refresh must reload penalties')
  assert.equal((await check()).refreshed,0, 'First selection is handled by the existing watcher')
  assert.equal((await check({selected:'old'})).refreshed,0, 'Removed match must not load stale penalties')
  const failed=await check({selected:'one',response:{success:false,message:'network unavailable'}})
  assert.equal(failed.refreshed,0)
  assert.deepEqual(failed.errors,['network unavailable'])
  assert.equal(failed.ctx.dashboard.value.matches[0].id,'one', 'Failure preserves current data')
  console.log('PASS: same-match penalty refresh, initial watcher deduplication, removed match, failure feedback and loading recovery')
})().catch(error => { console.error(error);process.exitCode=1 })
