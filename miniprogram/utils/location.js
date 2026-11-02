// 地图选点统一入口
// chooseLocation 打开的就是带搜索框的全屏地图页，可直接搜场地名再打点。
// 隐私未授权或权限被拒时这里统一处理，避免各页面拿到不同错误码。

function errText(error) {
  return String((error && (error.errMsg || error.message)) || '')
}

function openSettings(title) {
  wx.showModal({
    title: title || '需要位置权限',
    content: '请在设置里允许使用「位置信息」，再重新选点。',
    confirmText: '去设置',
    success: function (res) {
      if (res.confirm && wx.openSetting) {
        wx.openSetting({
          success: function (setting) {
            if (setting && setting.authSetting && setting.authSetting['scope.userLocation']) {
              wx.showToast({ title: '已开启，请重新选点', icon: 'none' })
            }
          }
        })
      }
    }
  })
}

function withPrivacy(task) {
  console.log('[location] withPrivacy start, getPrivacySetting?', !!wx.getPrivacySetting, 'requirePrivacyAuthorize?', !!wx.requirePrivacyAuthorize)
  if (!wx.getPrivacySetting) {
    console.log('[location] getPrivacySetting 不存在，直接执行 chooseLocation')
    task()
    return
  }
  wx.getPrivacySetting({
    success: function (res) {
      console.log('[location] getPrivacySetting 返回', JSON.stringify(res))
      if (res && res.needAuthorization && wx.requirePrivacyAuthorize) {
        wx.requirePrivacyAuthorize({
          success: function () { console.log('[location] 隐私协议已同意'); task() },
          fail: function (e) {
            console.warn('[location] requirePrivacyAuthorize fail', JSON.stringify(e))
            wx.showModal({ title: '需要同意隐私协议', content: '同意后才能打开地图选点。', showCancel: false })
          }
        })
      } else {
        task()
      }
    },
    fail: function (e) {
      console.warn('[location] getPrivacySetting fail', JSON.stringify(e), '— 继续执行 chooseLocation')
      task()
    }
  })
}

/**
 * @param {{success:Function, fail:Function}} options
 */
function pickLocation(options) {
  var opts = options || {}
  console.log('[location] pickLocation start')
  withPrivacy(function () {
    console.log('[location] 即将调用 wx.chooseLocation')
    wx.chooseLocation({
      success: function (res) {
        console.log('[location] chooseLocation 成功', JSON.stringify(res))
        if (opts.success) opts.success(res)
      },
      fail: function (error) {
        var message = errText(error)
        console.error('[location] chooseLocation 完整错误', JSON.stringify(error))
        console.error('[location] chooseLocation errMsg', message)
        if (message.indexOf('cancel') > -1) return
        if (/auth deny|authorize/i.test(message)) {
          openSettings('位置权限被拒，无法打开地图')
          return
        }
        if (/requiredPrivateInfos|privacy|scope is not declared/i.test(message)) {
          // 小程序后台「用户隐私保护指引」没有声明位置信息时，chooseLocation 会被微信直接拦截，
          // 这不是球队管理员能处理的配置，所以不再把开发者错误码弹给他们；
          // 完整 errMsg 已在上面的 console.error 输出，保留给后台排查。
          wx.showModal({
            title: '地图选点暂不可用',
            content: '可以先手动填写场地名称和地址，继续完成保存；地图选点恢复后可直接搜索场地。',
            showCancel: false
          })
          return
        }
        // 所有其他情况都强制把完整 errMsg 弹出来，便于排查
        wx.showModal({
          title: '地图选点打不开',
          content: message || '未知错误，请把此弹窗内容截图发给开发。',
          showCancel: false
        })
      }
    })
  })
}

module.exports = { pickLocation: pickLocation, errText: errText }
