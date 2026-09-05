var STORAGE_KEY = 'workspaceContext'
var WORKSPACE_ID_KEY = 'currentWorkspaceId'
var loadingPromise = null
var loadingWorkspaceId = ''
var loadingAccountKey = ''
var contextGeneration = 0
var AUTH_SESSION_VERSION = 'phone-canonical-v1'

function hasAuthenticatedUser() {
  var user = wx.getStorageSync('userInfo') || {}
  var userId = String(user._id || user.id || '')
  var phone = String(user.phone || user.phoneNumber || '')
  return Boolean(userId && phone && wx.getStorageSync('authSessionVersion') === AUTH_SESSION_VERSION)
}

function promptLogin(content) {
  wx.showModal({
    title: '当前未登录',
    content: content || '当前为功能演示，登录后可使用需要保存数据的管理功能。',
    confirmText: '去登录',
    cancelText: '继续浏览',
    confirmColor: '#159346',
    success: function(result) {
      if (result.confirm) wx.navigateTo({ url: '/pages/login/login' })
    }
  })
}

function activeAccount() {
  var user = wx.getStorageSync('userInfo') || {}
  return {
    id: String(user._id || user.id || ''),
    phone: String(user.phone || user.phoneNumber || wx.getStorageSync('phoneNumber') || wx.getStorageSync('phone') || '')
  }
}

function accountKey(account) {
  account = account || activeAccount()
  return String(account.id || '') + '|' + String(account.phone || '')
}

function contextBelongsToActiveAccount(context) {
  if (!context) return false
  var active = activeAccount()
  var owner = context.accountOwner || context.user || {}
  var ownerId = String(owner.id || owner._id || '')
  var ownerPhone = String(owner.phone || owner.phoneNumber || '')
  if (!active.id || !ownerId || active.id !== ownerId) return false
  if (active.phone && ownerPhone && active.phone !== ownerPhone) return false
  return true
}

function readContext() {
  var context = wx.getStorageSync(STORAGE_KEY) || null
  if (!context) return null
  if (!contextBelongsToActiveAccount(context)) {
    clearContext()
    return null
  }
  return context
}

function saveContext(result) {
  if (!result || !result.currentWorkspace) return
  var active = activeAccount()
  var resultUser = result.user || {}
  var resultUserId = String(resultUser.id || resultUser._id || '')
  var resultPhone = String(resultUser.phone || resultUser.phoneNumber || '')
  if (!active.id || !resultUserId || active.id !== resultUserId || (active.phone && resultPhone && active.phone !== resultPhone)) {
    clearContext()
    var mismatch = new Error('账号会话已变更，请重新登录')
    mismatch.code = 'SESSION_ACCOUNT_MISMATCH'
    throw mismatch
  }
  var context = {
    user: result.user || {},
    accountOwner: { id: resultUserId, phone: resultPhone },
    accountKey: accountKey(active),
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
  contextGeneration += 1
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

function isGuestReviewEnabled(options) {
  options = options || {}
  if (String(options.reviewGuest || '') !== '1') return false
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

function isAccountAuthError(error) {
  var code = String(error && error.code || '')
  return ['PHONE_AUTH_REQUIRED', 'PHONE_ACCOUNT_CONFLICT', 'WECHAT_ACCOUNT_CONFLICT', 'ACCOUNT_IDENTITY_CONFLICT', 'SESSION_ACCOUNT_MISMATCH'].indexOf(code) >= 0
}

function resetInvalidAccountSession() {
  clearContext()
  var app = getApp()
  if (app && typeof app.logout === 'function') app.logout()
  var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  var current = pages && pages.length ? pages[pages.length - 1] : null
  if (!current || current.route !== 'pages/login/login') wx.reLaunch({ url: '/pages/login/login' })
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
  readContext()
  var expectedAccount = activeAccount()
  var expectedAccountKey = accountKey(expectedAccount)
  var workspaceId = options.workspaceId || wx.getStorageSync(WORKSPACE_ID_KEY) || ''
  var skipRestrictedRedirect = options.skipRestrictedRedirect === true
  if (loadingPromise && loadingWorkspaceId === workspaceId && loadingAccountKey === expectedAccountKey) return loadingPromise
  var requestGeneration = contextGeneration
  loadingWorkspaceId = workspaceId
  loadingAccountKey = expectedAccountKey
  var requestPromise = new Promise(function(resolve, reject) {
    var settled = false
    var watchdog = setTimeout(function() {
      if (settled) return
      settled = true
      var timeoutError = new Error('工作空间加载超时，请下拉刷新重试')
      timeoutError.code = 'WORKSPACE_LOAD_TIMEOUT'
      reject(timeoutError)
    }, 18000)
    function finish(callback, value) {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      callback(value)
    }
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { workspaceId: workspaceId },
      timeout: 15000,
      success: function(response) {
        if (requestGeneration !== contextGeneration || accountKey(activeAccount()) !== expectedAccountKey) {
          var changedError = new Error('账号已切换，已丢弃上一账号的工作空间数据')
          changedError.code = 'SESSION_ACCOUNT_MISMATCH'
          finish(reject, changedError)
          return
        }
        var result = response.result || {}
        if (!result.success) {
          var resultError = new Error(result.message || '工作空间加载失败')
          resultError.code = result.code || 'WORKSPACE_LOAD_FAILED'
          if (isAccountAuthError(resultError)) resetInvalidAccountSession()
          if (!skipRestrictedRedirect && isWorkspaceAccessError(resultError)) redirectToRestricted(workspaceId)
          finish(reject, resultError)
          return
        }
        try {
          finish(resolve, saveContext(result))
        } catch (saveError) {
          if (isAccountAuthError(saveError)) resetInvalidAccountSession()
          finish(reject, saveError)
        }
      },
      fail: function(error) {
        if (isAccountAuthError(error)) resetInvalidAccountSession()
        if (!skipRestrictedRedirect && isWorkspaceAccessError(error)) redirectToRestricted(workspaceId)
        finish(reject, error)
      }
    })
  })
  loadingPromise = requestPromise
  return requestPromise.finally(function() {
    if (loadingPromise !== requestPromise) return
    loadingPromise = null
    loadingWorkspaceId = ''
    loadingAccountKey = ''
  })
}

function selectWorkspace(workspaceId) {
  clearContext()
  wx.setStorageSync(WORKSPACE_ID_KEY, workspaceId)
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
  hasAuthenticatedUser: hasAuthenticatedUser,
  promptLogin: promptLogin,
  readContext: readContext,
  saveContext: saveContext,
  clearContext: clearContext,
  hasPermission: hasPermission,
  isVisualQaEnabled: isVisualQaEnabled,
  isGuestReviewEnabled: isGuestReviewEnabled,
  getAccessibleTeamIds: getAccessibleTeamIds,
  selectWorkspace: selectWorkspace,
  loadContext: loadContext,
  switchWorkspace: switchWorkspace,
  chooseWorkspace: chooseWorkspace
}
