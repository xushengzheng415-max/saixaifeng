// testEnv/index.js
// 测试云函数环境是否正常

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  return {
    success: true,
    message: '云函数环境正常',
    sdkVersion: cloud.version,
    env: cloud.DYNAMIC_CURRENT_ENV
  }
}
