'use strict'
// Only the trusted native WeChat context selects the person. HTTP/body IDs are ignored.
const text = value => typeof value === 'string' ? value.trim() : ''
module.exports = async function miniFeedback({ cloud, db, read, event, action, submit, list }) {
  const wx = cloud.getWXContext() || {}
  if (!text(wx.OPENID) || text(wx.APPID) !== 'wx57164cca8676f411') {
    return { success:false, code:'MINI_FEEDBACK_AUTH_REQUIRED', error:'请在球队小程序登录后提交反馈' }
  }
  const _ = db.command
  const fields = { phone:true, phoneNumber:true, phoneVerified:true, status:true, disabled:true }
  const users = await read('users', _.or([{openId:wx.OPENID}, {openid:wx.OPENID}, {_openid:wx.OPENID}]), fields)
  if (users.length !== 1) return { success:false, code:'MINI_FEEDBACK_ACCOUNT_CONFLICT', error:'微信账号关联异常，请重新登录或联系客服核对' }
  const user = users[0], phone = text(user.phone || user.phoneNumber)
  if (user.phoneVerified !== true || !/^1[3-9]\d{9}$/.test(phone)) return { success:false, code:'MINI_FEEDBACK_PHONE_REQUIRED', error:'请先完成手机号验证' }
  const canonical = await read('users', _.or([{phone}, {phoneNumber:phone}]), fields)
  if (canonical.length !== 1 || String(canonical[0]._id) !== String(user._id) || (text(user.phone) && text(user.phoneNumber) && user.phone !== user.phoneNumber)) {
    return { success:false, code:'MINI_FEEDBACK_ACCOUNT_CONFLICT', error:'手机号存在重复或冲突账号，请联系客服核对' }
  }
  if (user.disabled === true || ['deleted','disabled','banned'].includes(text(user.status))) return { success:false, code:'MINI_FEEDBACK_ACCOUNT_UNAVAILABLE', error:'账号暂不可用，请联系客服' }
  if (action === 'miniFeedbackList') return list({user})
  if (action !== 'miniFeedbackSubmit') return { success:false, code:'MINI_FEEDBACK_ACTION_INVALID', error:'反馈操作无效' }
  // Bindings only affect notification delivery. An unbound team manager may still submit/read feedback.
  const bindings = await read('service_account_bindings', {sport:'football', userId:String(user._id)}, {officialOpenId:true,status:true,active:true,disabled:true})
  const ids = [...new Set(bindings.filter(row => row.active !== false && row.disabled !== true && !['revoked','replaced','deleted','unbound','disabled'].includes(text(row.status))).map(row => text(row.officialOpenId)).filter(Boolean))]
  let officialOpenId = ids.length === 1 ? ids[0] : ''
  if (officialOpenId) {
    const owners = await read('service_account_bindings', {sport:'football', officialOpenId}, {userId:true,status:true,active:true,disabled:true})
    const ownerIds = [...new Set(owners.filter(row => row.active !== false && row.disabled !== true && !['revoked','replaced','deleted','unbound','disabled'].includes(text(row.status))).map(row=>text(row.userId)).filter(Boolean))]
    if (ownerIds.length !== 1 || ownerIds[0] !== String(user._id)) officialOpenId = ''
  }
  return submit(event, {user, session:{serviceAccountOpenId:officialOpenId}, feedbackSource:'team-miniprogram/profile'})
}
