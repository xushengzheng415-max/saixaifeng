const assert = require('assert')
const Module = require('module')

let definition = null
global.Page = function(page) { definition = page }

const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request.endsWith('/utils/workspace')) return {}
  return originalLoad.call(this, request, parent, isMain)
}
try {
  const path = require.resolve('../miniprogram/pages/team/claim-code/claim-code.js')
  delete require.cache[path]
  require(path)
} finally {
  Module._load = originalLoad
}

function contextWith(teams) {
  const state = Object.assign({}, definition.data)
  let entered = null
  return {
    context: {
      data: state,
      setData(update, callback) { Object.assign(state, update); if (callback) callback() },
      call() { return Promise.resolve({ result:{ success:true, needsPhone:false, teams } }) },
      enterClaimedTeam(team) { entered = team }
    },
    entered: function() { return entered }
  }
}

async function flush() { await new Promise(resolve => setImmediate(resolve)) }

async function run() {
  const single = contextWith([{ inviteId:'inv-1', teamId:'team-1', teamName:'开封立洋足球队', alreadyClaimed:true, workspaceId:'team:team-1' }])
  definition.loadTeams.call(single.context)
  await flush()
  assert.strictEqual(single.entered().teamId, 'team-1', '唯一已认领球队应自动进入')
  assert.strictEqual(single.context.data.autoEnteringClaimed, true, '自动进入时应设置防重复标记')

  const multiple = contextWith([
    { inviteId:'inv-1', teamId:'team-1', alreadyClaimed:true, workspaceId:'team:team-1' },
    { inviteId:'inv-2', teamId:'team-2', alreadyClaimed:false }
  ])
  definition.loadTeams.call(multiple.context)
  await flush()
  assert.strictEqual(multiple.entered(), null, '多支球队时必须保留人工选择')

  console.log('认领码自动切换测试：2/2 通过')
}

run().catch(error => {
  console.error('FAIL:', error.message)
  process.exitCode = 1
})
