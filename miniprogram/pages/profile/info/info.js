const app = getApp()
const workspace = require('../../../utils/workspace')

Page({
  data: {
    nickName: '',
    avatarUrl: '',
    currentPhone: '',
    workspaceName: '',
    positionsText: '',
    isSaving: false
  },

  onLoad() {
    this.pendingAvatarPath = ''
    this.loadUserInfo()
  },

  loadUserInfo() {
    var userInfo = wx.getStorageSync('userInfo') || {}
    var context = workspace.readContext() || {}
    var currentWorkspace = context.currentWorkspace || {}

    this.setData({
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || '',
      currentPhone: wx.getStorageSync('phoneNumber') || '',
      workspaceName: currentWorkspace.name || '',
      positionsText: (currentWorkspace.positions || []).join('、')
    })
  },

  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value })
  },

  onChooseAvatar(e) {
    var avatarUrl = ((e || {}).detail || {}).avatarUrl || ''
    if (!avatarUrl) return

    this.pendingAvatarPath = avatarUrl
    this.setData({ avatarUrl: avatarUrl })
  },

  uploadPendingAvatar(userId) {
    var filePath = this.pendingAvatarPath
    if (!filePath) return Promise.resolve('')
    if (!userId) return Promise.reject(new Error('登录状态失效，请重新登录'))

    var extensionMatch = filePath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
    var extension = extensionMatch ? extensionMatch[1].toLowerCase() : 'jpg'
    var allowedExtensions = ['jpg', 'jpeg', 'png', 'gif']
    if (allowedExtensions.indexOf(extension) === -1) extension = 'jpg'

    var randomPart = Math.random().toString(36).slice(2, 10)
    var cloudPath = 'profile-avatars/' + userId + '/' + Date.now() + '-' + randomPart + '.' + extension

    return wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath
    }).then(function(res) {
      if (!res || !res.fileID) throw new Error('头像上传失败')
      return res.fileID
    })
  },

  saveProfile() {
    if (this.data.isSaving) return

    var that = this
    var userInfo = wx.getStorageSync('userInfo') || {}
    var nickName = (this.data.nickName || '').trim()

    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    this.setData({ isSaving: true })
    wx.showLoading({ title: '正在安全检测', mask: true })

    this.uploadPendingAvatar(userInfo._id || '')
      .then(function(avatarFileID) {
        return wx.cloud.callFunction({
          name: 'profileContentSecurity',
          timeout: 30000,
          data: {
            action: 'saveProfile',
            nickName: nickName,
            avatarFileID: avatarFileID
          }
        })
      })
      .then(function(res) {
        var result = (res || {}).result || {}
        if (!result.success) {
          throw new Error(result.message || '资料未通过安全检测')
        }

        var nextUserInfo = Object.assign({}, userInfo, result.user || {})
        if (app && typeof app.updateUserInfo === 'function') {
          app.updateUserInfo(nextUserInfo)
        } else {
          wx.setStorageSync('userInfo', nextUserInfo)
        }

        that.pendingAvatarPath = ''
        wx.showToast({ title: '检测通过，保存成功', icon: 'success' })
        setTimeout(function() {
          wx.navigateBack()
        }, 800)
      })
      .catch(function(err) {
        wx.showToast({
          title: (err && err.message) || '安全检测失败，请重试',
          icon: 'none',
          duration: 3000
        })
      })
      .then(function() {
        wx.hideLoading()
        that.setData({ isSaving: false })
      })
  }
})
