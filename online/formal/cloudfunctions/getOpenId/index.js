// getOpenId/index.js
// 获取用户的 openId（async 写法，确保框架正确等待）

var cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async function(event, context) {
  var wxContext = cloud.getWXContext()

  console.log('[getOpenId] 获取 openId:', wxContext.OPENID)

  return {
    openId: wxContext.OPENID,
    appId: wxContext.APPID
  }
}
