var cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

var RISK_ERROR_CODES = [87014]

function getErrorCode(value) {
  if (!value) return 0
  return Number(value.errCode || value.errcode || value.code || 0)
}

function getErrorMessage(value) {
  if (!value) return ''
  return value.errMsg || value.errmsg || value.message || ''
}

function isRiskError(value) {
  return RISK_ERROR_CODES.indexOf(getErrorCode(value)) !== -1
}

function isOwnedAvatarFile(fileID, userId) {
  if (!fileID) return true
  var ownedPath = '/profile-avatars/' + userId + '/'
  return fileID.indexOf(ownedPath) !== -1
}

function detectImageContentType(buffer) {
  if (!buffer || buffer.length < 4) return ''
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif'
  return ''
}

async function removePendingAvatar(fileID) {
  if (!fileID) return
  try {
    await cloud.deleteFile({ fileList: [fileID] })
  } catch (err) {
    console.warn('[profileContentSecurity] 清理待检测头像失败:', getErrorMessage(err))
  }
}

async function checkNickname(openId, nickName) {
  var response
  try {
    response = await cloud.openapi.security.msgSecCheck({
      openid: openId,
      scene: 1,
      version: 2,
      content: nickName
    })
  } catch (err) {
    if (isRiskError(err)) return { passed: false, message: '昵称包含不适宜内容，请修改后重试' }
    console.error('[profileContentSecurity] 昵称检测调用失败:', err)
    return { passed: false, message: '昵称安全检测暂时不可用，请稍后重试' }
  }

  var result = response.result || {}
  if (getErrorCode(response) !== 0) {
    if (isRiskError(response)) return { passed: false, message: '昵称包含不适宜内容，请修改后重试' }
    console.error('[profileContentSecurity] 昵称检测返回异常:', response)
    return { passed: false, message: '昵称安全检测失败，请稍后重试' }
  }

  if (result.suggest !== 'pass') {
    return { passed: false, message: '昵称未通过内容安全检测，请修改后重试' }
  }

  return { passed: true }
}

async function checkAvatar(avatarFileID) {
  var downloaded
  try {
    downloaded = await cloud.downloadFile({ fileID: avatarFileID })
  } catch (err) {
    console.error('[profileContentSecurity] 下载待检测头像失败:', err)
    return { passed: false, message: '头像读取失败，请重新选择' }
  }

  var buffer = downloaded.fileContent
  var contentType = detectImageContentType(buffer)
  if (!contentType) {
    return { passed: false, message: '头像格式不受支持，请选择 JPG、PNG 或 GIF 图片' }
  }

  try {
    var response = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: contentType,
        value: buffer
      }
    })
    if (getErrorCode(response) !== 0) {
      if (isRiskError(response)) return { passed: false, message: '头像包含不适宜内容，请重新选择' }
      console.error('[profileContentSecurity] 头像检测返回异常:', response)
      return { passed: false, message: '头像安全检测失败，请稍后重试' }
    }
    return { passed: true }
  } catch (err) {
    if (isRiskError(err)) return { passed: false, message: '头像包含不适宜内容，请重新选择' }
    console.error('[profileContentSecurity] 头像检测调用失败:', err)
    return { passed: false, message: '头像安全检测暂时不可用，请稍后重试' }
  }
}

async function findCurrentUser(db, openId) {
  var result = await db.collection('users').where({ openId: openId }).limit(2).get()
  var users = result.data || []
  if (users.length > 1) throw new Error('当前微信存在重复账号，请联系管理员处理')
  return users[0] || null
}

async function saveProfile(event, openId) {
  var nickName = String(event.nickName || '').trim()
  var avatarFileID = String(event.avatarFileID || '').trim()

  if (!openId) {
    return { success: false, message: '登录状态失效，请重新登录' }
  }
  if (!nickName || nickName.length > 20) {
    return { success: false, message: '昵称须为 1 至 20 个字符' }
  }

  var db = cloud.database()
  var user
  try {
    user = await findCurrentUser(db, openId)
  } catch (err) {
    return { success: false, message: err.message }
  }

  if (!user) {
    return { success: false, message: '未找到当前账号，请重新登录' }
  }
  if (!isOwnedAvatarFile(avatarFileID, user._id)) {
    return { success: false, message: '头像文件无效，请重新选择' }
  }

  var nicknameResult = await checkNickname(openId, nickName)
  if (!nicknameResult.passed) {
    await removePendingAvatar(avatarFileID)
    return { success: false, message: nicknameResult.message }
  }

  if (avatarFileID) {
    var avatarResult = await checkAvatar(avatarFileID)
    if (!avatarResult.passed) {
      await removePendingAvatar(avatarFileID)
      return { success: false, message: avatarResult.message }
    }
  }

  var patch = {
    nickName: nickName,
    role: 'organizer',
    updateTime: db.serverDate()
  }
  if (avatarFileID) {
    patch.avatarUrl = avatarFileID
    patch.avatarFileID = avatarFileID
  }

  try {
    await db.collection('users').doc(user._id).update({ data: patch })
  } catch (err) {
    await removePendingAvatar(avatarFileID)
    console.error('[profileContentSecurity] 保存资料失败:', err)
    return { success: false, message: '资料保存失败，请稍后重试' }
  }

  return {
    success: true,
    user: {
      _id: user._id,
      orgId: String(user.orgId || user.organizationId || '').trim(),
      needsOrganization: !String(user.orgId || user.organizationId || '').trim(),
      openId: openId,
      nickName: nickName,
      avatarUrl: avatarFileID || user.avatarUrl || '',
      role: 'organizer'
    }
  }
}

exports.main = async function(event) {
  event = event || {}
  if (event.action !== 'saveProfile') {
    return { success: false, message: '未知操作' }
  }

  try {
    var wxContext = cloud.getWXContext()
    return await saveProfile(event, wxContext.OPENID || '')
  } catch (err) {
    console.error('[profileContentSecurity] 未处理异常:', err)
    return { success: false, message: '安全检测失败，请稍后重试' }
  }
}
