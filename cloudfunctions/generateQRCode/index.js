// cloudfunctions/generateQRCode/index.js
// 首发阵容分享专用 - 生成小程序码

const cloud = require('wx-server-sdk')
const QRCode = require('qrcode')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 生成分享专用的小程序码
 * 用于分享首发阵容页面
 */
exports.main = async (event, context) => {
  const {
    matchId,        // 比赛ID
    path,           // 页面路径
    width = 430,    // 二维码宽度
    envVersion      // 开发环境：develop/trial/release
  } = event

  console.log('生成分享小程序码参数:', event)

  try {
    if (event.type === 'adult_match_pass') {
      const passToken = String(event.passToken || '').trim()
      const passId = String(event.passId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0,40)
      if (!/^SXFMP1\.[A-Za-z0-9_-]{8,40}\.[A-Za-z0-9_-]{20,40}$/.test(passToken) || !passId) return { success:false, message:'本场电子参赛证参数无效' }
      const buffer = await QRCode.toBuffer(passToken, { type:'png', width:Math.max(280, Math.min(720, Number(width || 430))), margin:2, errorCorrectionLevel:'M', color:{ dark:'#083d27', light:'#ffffff' } })
      const cloudPath = 'restricted/adult-match-passes/' + passId + '.png'
      const uploadResult = await cloud.uploadFile({ cloudPath, fileContent:buffer })
      const fileList = await cloud.getTempFileURL({ fileList:[uploadResult.fileID] })
      return { success:true, message:'本场电子参赛证已生成', data:{ fileID:uploadResult.fileID, tempUrl:fileList.fileList[0].tempFileURL, cloudPath, passId } }
    }
    // 如果没有传入path，构建默认路径
    let targetPage = path || 'pages/match/share/share'
    let targetScene = ''

    if (matchId) {
      targetScene = `matchId=${matchId}`
    }

    if (!targetScene) {
      return {
        success: false,
        message: '缺少matchId参数'
      }
    }

    // 获取上下文信息
    const wp = cloud.getWXContext()
    const appid = wp.APPID
    const env = wp.ENV

    console.log('当前环境:', env)
    console.log('生成小程序码:', { page: targetPage, scene: targetScene, width })

    // 调用微信云开发生成小程序码
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: targetScene,
      page: targetPage,
      width: width,
      autoColor: false,
      lineColor: { r: 0, g: 0, b: 0 },
      isHyaline: false,
      envVersion: ['develop', 'trial', 'release'].includes(String(envVersion || '').trim().toLowerCase())
        ? String(envVersion).trim().toLowerCase()
        : 'release'
    })

    console.log('小程序码生成成功，buffer长度:', result.buffer ? result.buffer.length : 0)

    // 上传到云存储
    const timestamp = Date.now()
    const cloudPath = `qrcodes/match-share-${matchId}-${timestamp}.png`

    const uploadResult = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: result.buffer
    })

    console.log('上传到云存储成功:', uploadResult.fileID)

    // 获取临时访问链接
    const fileList = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    })

    const tempUrl = fileList.fileList[0].tempFileURL

    return {
      success: true,
      message: '小程序码生成成功',
      data: {
        fileID: uploadResult.fileID,
        tempUrl: tempUrl,
        cloudPath: cloudPath,
        scene: targetScene,
        page: targetPage,
        width: width
      }
    }

  } catch (err) {
    console.error('生成小程序码失败:', err)

    return {
      success: false,
      message: '生成小程序码失败: ' + err.message,
      error: err.message,
      code: err.code || 'UNKNOWN_ERROR'
    }
  }
}
