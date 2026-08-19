var STORAGE_KEY = 'workspaceContext'
var WORKSPACE_ID_KEY = 'currentWorkspaceId'
var loadingPromise = null
var loadingWorkspaceId = ''

function readContext() {
  return wx.getStorageSync(STORAGE_KEY) || null
}

function saveContext(result) {
  if (!result || !result.currentWorkspace) return
  var context = {
    user: result.user || {},
    workspaces: result.workspaces || [],
    currentWorkspace: result.currentWorkspace,
    currentIdentity: result.currentIdentity || {},
    modules: result.modules || [],
    teams: result.teams || [],
    tournaments: result.tournaments || [],
    schedule: result.schedule || [],
    eventSchedule: result.eventSchedule || [],
    trainingSchedule: result.trainingSchedule || [],
    upcoming: result.upcoming || [],
    tasks: result.tasks || [],
    eventTasks: result.eventTasks || [],
    trainingTasks: result.trainingTasks || [],
    messages: result.messages || [],
    unreadMessageCount: result.unreadMessageCount || 0,
    statistics: result.statistics || {},
    loadedAt: Date.now()
  }
  wx.setStorageSync(STORAGE_KEY, context)
  wx.setStorageSync(WORKSPACE_ID_KEY, result.currentWorkspace.id)
  var app = getApp()
  if (app && app.globalData) app.globalData.workspaceContext = context
  return context
}

function clearContext() {
  wx.removeStorageSync(STORAGE_KEY)
  wx.removeStorageSync(WORKSPACE_ID_KEY)
  var app = getApp()
  if (app && app.globalData) app.globalData.workspaceContext = null
}

function hasPermission(permission, context) {
  context = context || readContext() || {}
  var current = context.currentWorkspace || {}
  return (current.permissions || []).indexOf(permission) >= 0
}

function isVisualQaEnabled(options) {
  options = options || {}
  if (String(options.visualQa || '') !== '1') return false
  try {
    return wx.getSystemInfoSync().platform === 'devtools'
  } catch (error) {
    return false
  }
}

function getAccessibleTeamIds(context) {
  context = context || readContext() || {}
  return (context.teams || []).map(function(item) {
    return item.id || item._id || item.teamId || ''
  }).filter(Boolean)
}

function getRestrictedOrgId(workspaceId) {
  var value = String(workspaceId || '')
  return value.indexOf('org:') === 0 ? value.slice(4) : ''
}

function isWorkspaceAccessError(error) {
  var message = String(error && error.message || '')
  return message.indexOf('无权访问') >= 0 || message.indexOf('没有可用工作空间') >= 0 || message.indexOf('没有权限') >= 0
}

function redirectToRestricted(workspaceId) {
  var orgId = getRestrictedOrgId(workspaceId)
  if (!orgId) return
  var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  var current = pages && pages.length ? pages[pages.length - 1] : null
  if (current && current.route === 'pages/workspace/restricted/restricted') return
  wx.redirectTo({ url: '/pages/workspace/restricted/restricted?orgId=' + encodeURIComponent(orgId) })
}

function loadContext(options) {
  options = options || {}
  var workspaceId = options.workspaceId || wx.getStorageSync(WORKSPACE_ID_KEY) || ''
  var skipRestrictedRedirect = options.skipRestrictedRedirect === true
  if (loadingPromise && loadingWorkspaceId === workspaceId) return loadingPromise
  loadingWorkspaceId = workspaceId
  loadingPromise = new Promise(function(resolve, reject) {
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { workspaceId: workspaceId },
      timeout: 20000,
      success: function(response) {
        var result = response.result || {}
        if (!result.success) {
          var resultError = new Error(result.message || '工作空间加载失败')
          resultError.code = result.code || 'WORKSPACE_LOAD_FAILED'
          if (!skipRestrictedRedirect && isWorkspaceAccessError(resultError)) redirectToRestricted(workspaceId)
          reject(resultError)
          return
        }
        resolve(saveContext(result))
      },
      fail: function(error) {
        if (!skipRestrictedRedirect && isWorkspaceAccessError(error)) redirectToRestricted(workspaceId)
        reject(error)
      }
    })
  })
  return loadingPromise.finally(function() {
    loadingPromise = null
    loadingWorkspaceId = ''
  })
}

function switchWorkspace(workspaceId) {
  wx.setStorageSync(WORKSPACE_ID_KEY, workspaceId)
  return loadContext({ workspaceId: workspaceId })
}

function chooseWorkspace(context) {
  context = context || readContext() || {}
  var workspaces = context.workspaces || []
  if (workspaces.length < 2) {
    return Promise.resolve(context)
  }
  return new Promise(function(resolve, reject) {
    wx.showActionSheet({
      itemList: workspaces.map(function(item) {
        return item.name + (item.isTemporary ? '（临时协作）' : '')
      }),
      success: function(result) {
        var target = workspaces[result.tapIndex]
        if (!target) {
          resolve(context)
          return
        }
        switchWorkspace(target.id).then(resolve).catch(reject)
      },
      fail: function(error) {
        if (error && error.errMsg && error.errMsg.indexOf('cancel') >= 0) {
          resolve(context)
          return
        }
        reject(error)
      }
    })
  })
}

module.exports = {
  readContext: readContext,
  saveContext: saveContext,
  clearContext: clearContext,
  hasPermission: hasPermission,
  isVisualQaEnabled: isVisualQaEnabled,
  getAccessibleTeamIds: getAccessibleTeamIds,
  loadContext: loadContext,
  switchWorkspace: switchWorkspace,
  chooseWorkspace: chooseWorkspace
}
