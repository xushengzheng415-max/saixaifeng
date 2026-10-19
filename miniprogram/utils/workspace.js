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
  if (context.schemaVersion !== 'shared-identity-v2' || !contextBelongsToActiveAccount(context)) {
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
    schemaVersion: 'shared-identity-v2',
    user: result.user || {},
    accountOwner: { id: resultUserId, phone: resultPhone },
    accountKey: accountKey(active),
    workspaces: result.workspaces || [],
    currentWorkspace: result.currentWorkspace,
    currentIdentity: result.currentIdentity || {},
    homeEntries: result.homeEntries || [],
    homeEntriesVersion: result.homeEntriesVersion || '',
    participatingEntries: result.participatingEntries,
    participatingEntriesVersion: result.participatingEntriesVersion || '',
    participatingEntriesState: result.participatingEntriesState || '',
    participatingEntriesError: result.participatingEntriesError || '',
    modules: result.modules || [],
    teams: result.teams || [],
    tournaments: result.tournaments || [],
    registrations: result.registrations || [],
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
  wx.removeStorageSync('workspaceExplicitChoice')
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
    function requestWorkspace(targetId, restoringRole) {
      wx.cloud.callFunction({
        name: 'getMiniWorkspace',
        data: { workspaceId: targetId, preserveWorkspace: restoringRole || options.preserveWorkspace === true || wx.getStorageSync('workspaceExplicitChoice') === expectedAccountKey + '|' + targetId },
        timeout: 15000,
        success: function(response) {
          if (settled) return
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
            if (!skipRestrictedRedirect && isWorkspaceAccessError(resultError)) redirectToRestricted(targetId)
            finish(reject, resultError)
            return
          }
          try {
            // 初次登录只从刚核验的目录恢复工作视角；明确点击资源时不干预空间。
            if (!workspaceId && !restoringRole && contextBelongsToActiveAccount(result)) {
              var preferredRole = readPortalRole(expectedAccount)
              var targets = preferredRole ? roleWorkspaces(result, preferredRole) : []
              var currentId = (result.currentWorkspace || {}).id
              if (targets.length && !targets.some(function(item) { return item.id === currentId })) {
                requestWorkspace(targets[0].id, true)
                return
              }
            }
            finish(resolve, saveContext(result))
          } catch (saveError) {
            if (isAccountAuthError(saveError)) resetInvalidAccountSession()
            finish(reject, saveError)
          }
        },
        fail: function(error) {
          if (settled) return
          if (isAccountAuthError(error)) resetInvalidAccountSession()
          if (!skipRestrictedRedirect && isWorkspaceAccessError(error)) redirectToRestricted(targetId)
          finish(reject, error)
        }
      })
    }
    requestWorkspace(workspaceId, false)
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
  wx.setStorageSync('workspaceExplicitChoice', accountKey() + '|' + workspaceId)
  wx.setStorageSync(WORKSPACE_ID_KEY, workspaceId)
  return loadContext({ workspaceId: workspaceId, preserveWorkspace: true })
}

var PORTAL_ROLE_KEY = 'miniPortalRole'
var PORTAL_PREFERENCES_KEY = 'miniPortalRolePreferences'
function validPortalRole(role) { return role === 'team_coach' || role === 'organizer' }
function validPreferenceId(id) { return Boolean(id && id !== '__proto__' && id !== 'constructor' && id !== 'prototype') }
function readPortalPreferences() {
  var saved = wx.getStorageSync(PORTAL_PREFERENCES_KEY) || {}
  var source = saved.version === 1 && saved.roles && typeof saved.roles === 'object' ? saved.roles : {}
  var roles = {}
  Object.keys(source).forEach(function(id) {
    if (validPreferenceId(id) && validPortalRole(source[id])) roles[id] = source[id]
  })
  var legacy = wx.getStorageSync(PORTAL_ROLE_KEY) || {}
  var legacyKey = typeof legacy.accountKey === 'string' ? legacy.accountKey.split('|') : []
  if (legacyKey.length === 2 && validPreferenceId(legacyKey[0]) && legacyKey[1] && validPortalRole(legacy.id) && !roles[legacyKey[0]]) roles[legacyKey[0]] = legacy.id
  return roles
}
function readPortalRole(account) {
  account = account || activeAccount()
  if (!validPreferenceId(account.id) || !account.phone) return ''
  var role = readPortalPreferences()[account.id]
  return validPortalRole(role) ? role : ''
}
function writePortalRole(role, account) {
  account = account || activeAccount()
  if (!validPreferenceId(account.id) || !account.phone || !validPortalRole(role)) return
  var roles = readPortalPreferences()
  roles[account.id] = role
  wx.setStorageSync(PORTAL_PREFERENCES_KEY, { version: 1, roles: roles })
  wx.removeStorageSync(PORTAL_ROLE_KEY)
}
function clearSessionStorage() {
  var roles = readPortalPreferences()
  clearContext()
  wx.clearStorageSync()
  if (Object.keys(roles).length) wx.setStorageSync(PORTAL_PREFERENCES_KEY, { version: 1, roles: roles })
}
function getPortalRole(context) {
  var saved = readPortalRole()
  if (saved) return saved
  context = context || readContext() || {}
  var id = (context.currentIdentity || {}).id
  var role = id === 'organizer' || id === 'event_staff' ? 'organizer' : 'team_coach'
  if (id && contextBelongsToActiveAccount(context)) writePortalRole(role)
  return role
}
function roleWorkspaces(context, role) {
  return ((context || {}).workspaces || []).filter(function(item) {
    var rights = item.permissions || []
    return role === 'organizer' ? item.type === 'tournament_shared' || (item.type === 'organization' && rights.indexOf('event.manage') >= 0)
      : item.type !== 'tournament_shared' && (rights.indexOf('team.view') >= 0 || rights.indexOf('team.manage') >= 0)
  })
}
function portalRoleOptions(context) {
  var current = getPortalRole(context)
  return [{id:'team_coach',title:'球队管理者',icon:'/images/icons/team.svg'},{id:'organizer',title:'赛事组织者',icon:'/images/icons/event.svg'}].map(function(item) {
    var available = roleWorkspaces(context,item.id).length > 0 || ((context || {}).currentWorkspace || {}).type === 'personal'
    return Object.assign({},item,{selectable:available && current !== item.id,selectedClass:current === item.id ? 'is-current' : (!available ? 'is-disabled' : ''),selectedText:current === item.id ? '当前使用' : (!available ? '暂无授权' : '')})
  })
}
function switchPortalRole(role) {
  if (['team_coach','organizer'].indexOf(role) < 0) return Promise.reject(new Error('请选择球队管理者或赛事组织者'))
  var expected = accountKey()
  return loadContext().then(function(context) {
    if ((context.currentWorkspace || {}).type === 'personal') return context
    var targets = roleWorkspaces(context,role), current = context.currentWorkspace || {}
    var target = targets.filter(function(item) { return item.id === current.id })[0] || targets[0]
    if (!target) throw new Error('当前账号暂无该身份授权')
    return switchWorkspace(target.id)
  }).then(function(context) {
    if (accountKey() !== expected) throw new Error('账号已切换，请重试')
    if (context.currentWorkspace.type === 'tournament_shared' || context.currentWorkspace.type === 'personal') return context
    return wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'setHomeIdentity',workspaceId:context.currentWorkspace.id,identity:role}}).then(function(response) {
      if (!(response.result || {}).success) throw new Error((response.result || {}).message || '身份切换失败')
      return loadContext({workspaceId:context.currentWorkspace.id,preserveWorkspace:true})
    })
  }).then(function(context) {
    if (accountKey() !== expected) throw new Error('账号已切换，请重试')
    writePortalRole(role)
    return context
  })
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
        return item.name + (item.type === 'tournament_shared' ? '（共享赛事）' : (item.isTemporary ? '（临时协作）' : ''))
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
  clearSessionStorage: clearSessionStorage,
  hasPermission: hasPermission,
  isVisualQaEnabled: isVisualQaEnabled,
  isGuestReviewEnabled: isGuestReviewEnabled,
  getAccessibleTeamIds: getAccessibleTeamIds,
  selectWorkspace: selectWorkspace,
  loadContext: loadContext,
  switchWorkspace: switchWorkspace,
  getPortalRole:getPortalRole,
  hasPortalRole:function() { return Boolean(readPortalRole()) },
  rememberPortalRole:writePortalRole,
  portalRoleOptions:portalRoleOptions,
  roleWorkspaces:roleWorkspaces,
  switchPortalRole:switchPortalRole,
  chooseWorkspace: chooseWorkspace
}
