var SITE = 'https://www.sxffootball.cn'
function accountKey() {
  var user = wx.getStorageSync('userInfo') || {}
  return String(user._id || '') + '|' + String(user.phone || user.phoneNumber || '')
}
function call(action, fields) {
  var expected = accountKey()
  if (!/^[^|]+\|1[3-9]\d{9}$/.test(expected)) return Promise.reject(new Error('请先完成手机号登录'))
  return new Promise(function(resolve, reject) {
    var settled = false
    var failureText = action === 'state' ? '主办信息暂不可读，请重试' : '提交结果暂未确认，请重试或刷新列表'
    var timer = setTimeout(function() { finish(reject, new Error(failureText)) }, 22000)
    function finish(callback, value) { if (settled) return; settled = true; clearTimeout(timer); callback(value) }
    try { wx.cloud.callFunction({ name:'onboardingWorkspace', data:Object.assign({action:action},fields || {}), timeout:20000,
      success:function(reply) {
        if (accountKey() !== expected) return finish(reject,new Error('登录账号已变更，请重新打开'))
        var result = reply.result || {}
        if (!result.success) return finish(reject,new Error(result.message || '操作未完成，请重试'))
        finish(resolve,result)
      },
      fail:function() { finish(reject,new Error(failureText)) }
    }) } catch(error) { finish(reject,new Error(failureText)) }
  })
}
function requestId() { return 'mini_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,12) }
function validateDates(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return '请选择赛事开始和结束日期'
  if (end < start) return '结束日期不能早于开始日期'
  return ''
}
function preferredOrganization(state, context) {
  var current = (context || {}).currentWorkspace || {}, organization = state.organization
  if (current.type === 'organization' && current.orgId) {
    if (organization && String(organization.id || organization._id) === String(current.orgId)) return organization
    if ((state.organizationIds || []).indexOf(current.orgId) >= 0) return {id:current.orgId,name:current.name}
    throw new Error('当前机构权限已变化，请刷新后重试')
  }
  if (state.organizationConflict) throw new Error('请先在电脑确认主办机构，再创建赛事')
  return organization || null
}
module.exports={site:SITE,accountKey:accountKey,call:call,requestId:requestId,validateDates:validateDates,preferredOrganization:preferredOrganization}
