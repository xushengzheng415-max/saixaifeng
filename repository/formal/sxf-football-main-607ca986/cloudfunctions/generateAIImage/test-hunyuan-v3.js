/**
 * 混元生图 API 测试脚本 v3
 * 使用 tencentcloud-sdk-nodejs-common 直接调用（与云函数相同方式）
 */

const TencentCloudCommon = require('tencentcloud-sdk-nodejs-common')

const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY

if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
  console.error('请先设置环境变量 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY')
  process.exit(1)
}

async function testHunyuanAPI() {
  console.log('========== 混元生图 API 测试 v3 ==========')
  console.log('')

  // 创建客户端（与云函数相同方式）
  const client = new TencentCloudCommon.AbstractClient(
    'aiart.tencentcloudapi.com',
    '2022-12-29',
    {
      credential: {
        secretId: TENCENT_SECRET_ID,
        secretKey: TENCENT_SECRET_KEY
      },
      region: 'ap-guangzhou',
      profile: {
        signMethod: 'TC3-HMAC-SHA256',
        httpProfile: {
          reqMethod: 'POST',
          reqTimeout: 60
        }
      }
    }
  )

  // 测试1: 简单图片
  console.log('【测试1】生成简单足球图片...')
  try {
    const req1 = {
      Prompt: '一个红色的足球在白色背景上，写实照片风格',
      Resolution: '1024:1024',
      RspImgType: 'url',
      Seed: Math.floor(Math.random() * 100000)
    }
    console.log('请求参数:', JSON.stringify({ Prompt: req1.Prompt, Resolution: req1.Resolution }))

    const result1 = await client.request('TextToImageLite', req1)
    console.log('原始响应:', JSON.stringify(result1).substring(0, 500))

    const data1 = result1.Response || result1
    if (data1.ResultImage) {
      console.log('✅ 测试1通过！图片URL:', data1.ResultImage.substring(0, 80))
    } else if (data1.Error) {
      console.log('❌ API错误:', data1.Error.Code, data1.Error.Message)
    } else {
      console.log('⚠️ 未知响应格式:', JSON.stringify(data1).substring(0, 300))
    }
  } catch (err) {
    console.log('❌ 测试1异常:', err.message)
  }

  console.log('')

  // 测试2: 队徽风格
  console.log('【测试2】生成队徽风格图片...')
  try {
    const req2 = {
      Prompt: '足球队徽，蓝银配色，盾牌形状，极简设计，白色背景',
      Resolution: '1024:1024',
      RspImgType: 'url',
      Seed: Math.floor(Math.random() * 100000)
    }

    const result2 = await client.request('TextToImageLite', req2)
    const data2 = result2.Response || result2
    if (data2.ResultImage) {
      console.log('✅ 测试2通过！图片URL:', data2.ResultImage.substring(0, 80))
    } else if (data2.Error) {
      console.log('❌ API错误:', data2.Error.Code, data2.Error.Message)
    } else {
      console.log('⚠️ 未知响应格式:', JSON.stringify(data2).substring(0, 300))
    }
  } catch (err) {
    console.log('❌ 测试2异常:', err.message)
  }

  console.log('')
  console.log('========== 测试完成 ==========')
}

testHunyuanAPI().catch(console.error)
