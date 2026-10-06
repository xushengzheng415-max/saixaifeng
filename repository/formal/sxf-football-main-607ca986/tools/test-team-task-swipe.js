const assert = require('assert')
const Module = require('module')

let definition = null
global.Page = page => { definition = page }
global.wx = { getSystemInfoSync: () => ({ platform:'devtools' }) }

const workspaceStub = {
  hasPermission: () => true,
  readContext: () => ({ currentWorkspace:{ id:'team:team-1' } })
}
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if (request.endsWith('/utils/workspace')) return workspaceStub
  return originalLoad.call(this, request, parent, isMain)
}
try {
  const path = require.resolve('../miniprogram/pages/teams/index.js')
  delete require.cache[path]
  require(path)
} finally {
  Module._load = originalLoad
}

const state = Object.assign({}, definition.data)
const context = Object.assign({}, definition, {
  data:state,
  setData(update) { Object.assign(state, update) }
})

definition.applyContext.call(context, {
  currentWorkspace:{ id:'team:team-1', name:'测试球队', isTemporary:true, permissions:['team.manage'] },
  workspaces:[{ id:'team:team-1' }],
  teams:[{ id:'team-1', name:'测试球队' }],
  eventTasks:[
    { id:'registration-draft:draft-1', title:'继续完成赛事报名', audience:'team', dismissible:true },
    { id:'registration:required-1', title:'提交正式名单', audience:'team', dismissible:false }
  ]
})

definition.onTaskTouchStart.call(context, { touches:[{ clientX:10, clientY:10 }], currentTarget:{ dataset:{ id:'registration-draft:draft-1' } } })
definition.onTaskTouchMove.call(context, { touches:[{ clientX:100, clientY:12 }] })
assert.strictEqual(state.teamTasks[0].swipeOpen, true, '可删除待办右滑后应展开删除操作')

definition.onTaskTouchStart.call(context, { touches:[{ clientX:10, clientY:10 }], currentTarget:{ dataset:{ id:'registration:required-1' } } })
definition.onTaskTouchMove.call(context, { touches:[{ clientX:100, clientY:12 }] })
assert.strictEqual(state.teamTasks[1].swipeOpen, false, '强制待办右滑不得展开删除操作')

console.log('球队待办右滑测试：2/2 通过')
