// 测试云函数调用的简单 Node.js 脚本
const cloudbase = require('@cloudbase/js-sdk')

const ENV_ID = 'cloud1-7g8ckb3c7815a011'

async function test() {
  console.log('初始化云开发...')
  const app = cloudbase.init({
    env: ENV_ID,
    region: 'ap-shanghai'
  })

  // 匿名登录
  console.log('匿名登录...')
  try {
    await app.auth().signInAnonymously()
    console.log('✅ 登录成功')
  } catch (err) {
    console.log('⚠️ 登录失败:', err.message)
  }

  // 调用云函数
  console.log('调用 generateTestData 云函数...')
  try {
    const result = await app.callFunction({
      name: 'generateTestData',
      data: {
        action: 'testAIGeneration'
      }
    })
    console.log('✅ 云函数调用成功!')
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.log('❌ 云函数调用失败:', err.message)
    if (err.code) console.log('错误码:', err.code)
  }
}

test()
