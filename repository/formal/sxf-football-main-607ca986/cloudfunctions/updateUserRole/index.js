// updateUserRole/index.js
// 当前阶段仅保留主办方登录身份，关闭客户端身份选择与切换。

exports.main = async function() {
  return {
    success: false,
    message: '当前仅保留主办方身份，不支持选择或切换身份'
  }
}
